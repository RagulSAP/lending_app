"""
Customer management routes.
Blueprint prefix: /api/customers
"""
import uuid

from flask import Blueprint, request

from database import SessionLocal
from models import Customer, Loan, User
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.file_storage import save_kyc_file, delete_kyc_file
from core_functions.responses import success_response, error_response, model_to_dict

customers_bp = Blueprint("customers", __name__, url_prefix="/api/customers")

_VALID_ID_PROOF_TYPES = {"PAN", "AADHAAR"}
_VALID_STATUSES = {"ACTIVE", "INACTIVE"}

_FULL_ACCESS_ROLES = (
    Config.ROLE_ADMIN,
    Config.ROLE_MANAGER,
    Config.ROLE_STAFF,
    Config.ROLE_ACCOUNTANT,
)


# ---------------------------------------------------------------------------
# POST / — onboard new customer
# ---------------------------------------------------------------------------

@customers_bp.route("/", methods=["POST"])
@require_roles(Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_STAFF)
def create_customer():
    """
    POST /api/customers/
    Multipart/form-data. Required files: photo, id_proof.
    Required fields: name, phone, address, city, state, pincode,
                     aadhaar_number, pan_number, id_proof_type.
    Optional: assigned_user_id.
    """
    current = get_current_user_info()

    # Validate required text fields
    required = ["name", "phone", "address", "city", "state", "pincode",
                "aadhaar_number", "pan_number", "id_proof_type"]
    missing = [f for f in required if not request.form.get(f, "").strip()]
    if missing:
        return error_response(f"Missing required fields: {', '.join(missing)}")

    id_proof_type = request.form["id_proof_type"].strip().upper()
    if id_proof_type not in _VALID_ID_PROOF_TYPES:
        return error_response("id_proof_type must be 'PAN' or 'AADHAAR'")

    photo_file = request.files.get("photo")
    id_proof_file = request.files.get("id_proof")
    if not photo_file or not photo_file.filename:
        return error_response("photo file is required")
    if not id_proof_file or not id_proof_file.filename:
        return error_response("id_proof file is required")

    db = SessionLocal()
    customer_id = str(uuid.uuid4())
    photo_path = None
    id_proof_path = None

    try:
        # Save KYC files
        try:
            photo_path = save_kyc_file(photo_file, customer_id, "photo")
            id_proof_path = save_kyc_file(id_proof_file, customer_id, id_proof_type.lower())
        except ValueError as ve:
            return error_response(str(ve))

        assigned_user_id = request.form.get("assigned_user_id") or None

        customer = Customer(
            customer_id=customer_id,
            org_id=current["org_id"],
            name=request.form["name"].strip(),
            phone=request.form["phone"].strip(),
            address=request.form["address"].strip(),
            city=request.form["city"].strip(),
            state=request.form["state"].strip(),
            pincode=request.form["pincode"].strip(),
            aadhaar=request.form["aadhaar_number"].strip(),
            pan=request.form["pan_number"].strip(),
            user_id=assigned_user_id,
            photo=photo_path,
            id_proof=id_proof_path,
            id_proof_type=id_proof_type,
            status="ACTIVE",
        )
        db.add(customer)
        db.commit()

        return success_response(
            data=model_to_dict(customer),
            message="Customer onboarded successfully",
        ), 201

    except Exception as exc:
        db.rollback()
        # Clean up orphan files
        delete_kyc_file(photo_path)
        delete_kyc_file(id_proof_path)
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET / — list customers (role-aware)
# ---------------------------------------------------------------------------

@customers_bp.route("/", methods=["GET"])
@require_roles(*_FULL_ACCESS_ROLES, Config.ROLE_COLLECTOR)
def list_customers():
    """
    GET /api/customers/
    ADMIN/MANAGER/STAFF/ACCOUNTANT: full paginated list with optional filters.
    COLLECTOR: phone search only (phone param required).
    Query params: city, status, search (name/phone), phone, page, per_page.
    """
    current = get_current_user_info()
    role_id = current["role_id"]
    org_id = current["org_id"]

    phone = (request.args.get("phone") or "").strip()
    city = (request.args.get("city") or "").strip()
    status_filter = (request.args.get("status") or "").strip().upper()
    search = (request.args.get("search") or "").strip()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    db = SessionLocal()
    try:
        q = db.query(Customer).filter(Customer.org_id == org_id)

        if role_id == Config.ROLE_COLLECTOR:
            # Collectors may ONLY do a phone search
            if not phone:
                return error_response("Collectors must provide a phone number to search", 400)
            q = q.filter(Customer.phone == phone)
            customers = q.all()
            return success_response(
                data=[model_to_dict(c) for c in customers],
                total=len(customers),
            )

        # Full-access roles
        if phone:
            q = q.filter(Customer.phone.ilike(f"%{phone}%"))
        if city:
            q = q.filter(Customer.city.ilike(f"%{city}%"))
        if status_filter in _VALID_STATUSES:
            q = q.filter(Customer.status == status_filter)
        if search:
            pattern = f"%{search}%"
            q = q.filter(
                Customer.name.ilike(pattern) | Customer.phone.ilike(pattern)
            )

        total = q.count()
        customers = (
            q.order_by(Customer.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return success_response(
            data=[model_to_dict(c) for c in customers],
            total=total,
            page=page,
            per_page=per_page,
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET /{customer_id} — customer detail
# ---------------------------------------------------------------------------

@customers_bp.route("/<string:customer_id>", methods=["GET"])
@require_roles(*_FULL_ACCESS_ROLES)
def get_customer(customer_id):
    """
    GET /api/customers/{customer_id}
    Returns full customer details plus an active loan summary.
    """
    current = get_current_user_info()
    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(
            Customer.customer_id == customer_id,
            Customer.org_id == current["org_id"],
        ).first()
        if not customer:
            return error_response("Customer not found", 404)

        # Active loan summary
        active_loans = (
            db.query(Loan)
            .filter(
                Loan.customer_id == customer_id,
                Loan.status.in_(["ACTIVE", "OVERDUE"]),
            )
            .all()
        )
        loan_summary = {
            "active_loan_count": len(active_loans),
            "total_disbursed": round(sum(float(l.disbursement_amount or 0) for l in active_loans), 2),
            "total_paid": round(sum(float(l.total_paid or 0) for l in active_loans), 2),
            "total_balance": round(sum(float(l.balance_amount or 0) for l in active_loans), 2),
            "overdue_count": sum(1 for l in active_loans if l.status == "OVERDUE"),
        }

        # Assigned user name
        assigned_user = None
        if customer.user_id:
            u = db.query(User).filter(User.user_id == customer.user_id).first()
            assigned_user = u.name if u else None

        data = model_to_dict(customer)
        data["loan_summary"] = loan_summary
        data["assigned_user_name"] = assigned_user

        return success_response(data=data)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# PATCH /{customer_id} — update customer details (Admin + Manager)
# ---------------------------------------------------------------------------

@customers_bp.route("/<string:customer_id>", methods=["PATCH"])
@require_roles(Config.ROLE_ADMIN, Config.ROLE_MANAGER)
def update_customer(customer_id):
    """
    PATCH /api/customers/{customer_id}
    Admin + Manager. JSON body with any subset of editable fields.
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(
            Customer.customer_id == customer_id,
            Customer.org_id == current["org_id"],
        ).first()
        if not customer:
            return error_response("Customer not found", 404)

        if "name" in data:
            v = (data["name"] or "").strip()
            if not v:
                return error_response("Name cannot be empty")
            customer.name = v
        if "phone" in data:
            v = (data["phone"] or "").strip()
            if not v:
                return error_response("Phone cannot be empty")
            customer.phone = v
        if "address" in data:
            customer.address = (data["address"] or "").strip()
        if "city" in data:
            v = (data["city"] or "").strip()
            if not v:
                return error_response("City cannot be empty")
            customer.city = v
        if "state" in data:
            customer.state = (data["state"] or "").strip()
        if "pincode" in data:
            customer.pincode = (data["pincode"] or "").strip()
        if "aadhaar_number" in data:
            customer.aadhaar = (data["aadhaar_number"] or "").strip()
        if "pan_number" in data:
            customer.pan = (data["pan_number"] or "").strip()
        if "assigned_user_id" in data:
            customer.user_id = data["assigned_user_id"] or None

        db.commit()
        return success_response(data=model_to_dict(customer), message="Customer updated successfully")
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# PATCH /{customer_id}/status
# ---------------------------------------------------------------------------

@customers_bp.route("/<string:customer_id>/status", methods=["PATCH"])
@require_roles(Config.ROLE_ADMIN)
def update_customer_status(customer_id):
    """
    PATCH /api/customers/{customer_id}/status
    ADMIN only. Body: {status: 'ACTIVE' or 'INACTIVE'}
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data or "status" not in data:
        return error_response("'status' field is required")

    new_status = (data.get("status") or "").strip().upper()
    if new_status not in _VALID_STATUSES:
        return error_response("status must be 'ACTIVE' or 'INACTIVE'")

    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(
            Customer.customer_id == customer_id,
            Customer.org_id == current["org_id"],
        ).first()
        if not customer:
            return error_response("Customer not found", 404)

        customer.status = new_status
        db.commit()
        return success_response(message=f"Customer status updated to {new_status}")
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# DELETE /{customer_id}
# ---------------------------------------------------------------------------

@customers_bp.route("/<string:customer_id>", methods=["DELETE"])
@require_roles(Config.ROLE_ADMIN)
def delete_customer(customer_id):
    """
    DELETE /api/customers/{customer_id}
    ADMIN only. Also removes associated KYC files from disk.
    """
    current = get_current_user_info()
    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(
            Customer.customer_id == customer_id,
            Customer.org_id == current["org_id"],
        ).first()
        if not customer:
            return error_response("Customer not found", 404)

        # Check for active/overdue loans
        active_loan = db.query(Loan).filter(
            Loan.customer_id == customer_id,
            Loan.status.in_(["ACTIVE", "OVERDUE"]),
        ).first()
        if active_loan:
            return error_response("Cannot delete customer with active or overdue loans", 400)

        photo_path = customer.photo
        id_proof_path = customer.id_proof

        db.delete(customer)
        db.commit()

        # Remove KYC files (best-effort)
        delete_kyc_file(photo_path)
        delete_kyc_file(id_proof_path)

        return success_response(message="Customer deleted successfully")
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()
