"""
Customer management routes.
Blueprint prefix: /api/customers
"""
import uuid
from datetime import timedelta

from flask import Blueprint, request

from database import SessionLocal
from models import Customer, Loan, LoanInstallment, LoanStatusHistory, Transaction, User, Wallet
from sqlalchemy import func, and_, case, or_, select
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.file_storage import save_kyc_file, delete_kyc_file
from core_functions.loan_calc import _add_months
from core_functions.timeutil import today_ist
from core_functions.dashboard_service import mark_overdue_loans
from core_functions.responses import success_response, error_response, model_to_dict

customers_bp = Blueprint("customers", __name__, url_prefix="/api/customers")

_VALID_ID_PROOF_TYPES = {"PAN", "AADHAAR", "VOTER_ID", "PASSPORT", "DL"}
_VALID_STATUSES = {"ACTIVE", "INACTIVE"}
_QUICK_FILTERS = {"active_loans", "overdue", "due_today", "due_week", "due_month"}

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

    # Validate required text fields (address, state, pincode, aadhaar, pan are optional)
    required = ["name", "phone", "city", "id_proof_type"]
    missing = [f for f in required if not request.form.get(f, "").strip()]
    if missing:
        return error_response(f"Missing required fields: {', '.join(missing)}")

    id_proof_type = request.form["id_proof_type"].strip().upper()
    if id_proof_type not in _VALID_ID_PROOF_TYPES:
        return error_response("Invalid id_proof_type")

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
            address=request.form.get("address", "").strip(),
            area=request.form.get("area", "").strip(),
            city=request.form["city"].strip(),
            state=request.form.get("state", "").strip(),
            pincode=request.form.get("pincode", "").strip(),
            aadhaar=request.form.get("aadhaar_number", "").strip(),
            pan=request.form.get("pan_number", "").strip(),
            user_id=assigned_user_id,
            created_by=current["user_id"],
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

def _quick_filter_customer_ids(db, org_id, quick_filter):
    """Customer ids matching a dashboard-card filter (same windows as the dashboard counts)."""
    open_statuses = ["ACTIVE", "OVERDUE"]
    if quick_filter == "active_loans":
        return select(Loan.customer_id).where(Loan.org_id == org_id, Loan.status.in_(open_statuses))
    if quick_filter == "overdue":
        mark_overdue_loans(db, org_id)
        return select(Loan.customer_id).where(Loan.org_id == org_id, Loan.status == "OVERDUE")

    today = today_ist()
    if quick_filter == "due_today":
        hi = today
    elif quick_filter == "due_week":
        hi = today + timedelta(days=7)
    else:
        hi = _add_months(today, 1)
    return (
        select(Loan.customer_id)
        .join(LoanInstallment, LoanInstallment.loan_id == Loan.loan_id)
        .where(
            Loan.org_id == org_id,
            Loan.status.in_(open_statuses),
            LoanInstallment.status.in_(["PENDING", "PARTIAL"]),
            LoanInstallment.due_date >= today,
            LoanInstallment.due_date <= hi,
        )
    )


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
    quick_filter = (request.args.get("filter") or "").strip().lower()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    db = SessionLocal()
    try:
        if role_id == Config.ROLE_COLLECTOR:
            # Collectors may ONLY do a phone search
            if not phone:
                return error_response("Collectors must provide a phone number to search", 400)
            customers = db.query(Customer).filter(
                Customer.org_id == org_id, Customer.phone == phone
            ).all()
            return success_response(
                data=[model_to_dict(c) for c in customers],
                total=len(customers),
            )

        # Subquery: earliest pending installment date per customer (for sorting)
        sort_sub = (
            db.query(
                Loan.customer_id.label("cid"),
                func.min(LoanInstallment.due_date).label("next_date"),
            )
            .join(LoanInstallment, LoanInstallment.loan_id == Loan.loan_id)
            .filter(
                Loan.org_id == org_id,
                Loan.status.in_(["ACTIVE", "OVERDUE"]),
                LoanInstallment.status.in_(["PENDING", "PARTIAL"]),
            )
            .group_by(Loan.customer_id)
            .subquery("sort_sub")
        )

        q = (
            db.query(Customer)
            .outerjoin(sort_sub, Customer.customer_id == sort_sub.c.cid)
            .filter(Customer.org_id == org_id)
        )

        # Full-access roles filters
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
        if quick_filter in _QUICK_FILTERS:
            q = q.filter(Customer.customer_id.in_(_quick_filter_customer_ids(db, org_id, quick_filter)))

        total = q.count()
        customers = (
            q.order_by(
                case((sort_sub.c.next_date.is_(None), 1), else_=0),
                sort_sub.c.next_date.asc(),
            )
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        # Batch-fetch creator names
        creator_ids = list({c.created_by for c in customers if c.created_by})
        creator_map = {}
        if creator_ids:
            users = db.query(User).filter(User.user_id.in_(creator_ids)).all()
            creator_map = {u.user_id: u.name for u in users}

        # Batch-fetch every open loan per customer
        customer_ids = [c.customer_id for c in customers]
        loans_map = {}
        if customer_ids:
            loan_rows = (
                db.query(
                    Loan.customer_id,
                    Loan.loan_id,
                    Loan.loan_type,
                    Loan.status,
                    Loan.disbursement_date,
                    Loan.disbursement_amount,
                    Loan.balance_amount,
                    Loan.num_installments,
                    Loan.installment_amount,
                    Loan.installment_type,
                )
                .filter(
                    Loan.customer_id.in_(customer_ids),
                    Loan.org_id == org_id,
                    Loan.status.in_(["ACTIVE", "OVERDUE"]),
                )
                .order_by(Loan.disbursement_date.asc(), Loan.id.asc())
                .all()
            )
            loan_ids = [row.loan_id for row in loan_rows]

            paid_counts = {}
            next_due = {}
            if loan_ids:
                # PAID installments per loan
                paid_rows = (
                    db.query(
                        LoanInstallment.loan_id,
                        func.count(LoanInstallment.installment_id).label("paid_count"),
                    )
                    .filter(
                        LoanInstallment.loan_id.in_(loan_ids),
                        LoanInstallment.status == "PAID",
                    )
                    .group_by(LoanInstallment.loan_id)
                    .all()
                )
                paid_counts = {r.loan_id: r.paid_count for r in paid_rows}

                # Interest-only loans have no installment rows: count interest collections instead
                io_ids = [row.loan_id for row in loan_rows if row.loan_type == "INTEREST_ONLY"]
                if io_ids:
                    io_rows = (
                        db.query(
                            Transaction.loan_id,
                            func.count(Transaction.transaction_id).label("paid_count"),
                        )
                        .filter(
                            Transaction.loan_id.in_(io_ids),
                            Transaction.transaction_type == "LOAN_COLLECTION",
                            or_(Transaction.remarks.is_(None), ~Transaction.remarks.like("Principal repayment%")),
                        )
                        .group_by(Transaction.loan_id)
                        .all()
                    )
                    for r in io_rows:
                        paid_counts[r.loan_id] = r.paid_count

                # Next unpaid installment (date + amount) per loan
                min_due_sub = (
                    db.query(
                        LoanInstallment.loan_id.label("lid"),
                        func.min(LoanInstallment.due_date).label("next_date"),
                    )
                    .filter(
                        LoanInstallment.loan_id.in_(loan_ids),
                        LoanInstallment.status.in_(["PENDING", "PARTIAL"]),
                    )
                    .group_by(LoanInstallment.loan_id)
                    .subquery("nd_sub")
                )
                due_rows = (
                    db.query(
                        LoanInstallment.loan_id,
                        LoanInstallment.due_date,
                        func.sum(LoanInstallment.balance_amount).label("amount"),
                    )
                    .join(min_due_sub, and_(
                        LoanInstallment.loan_id == min_due_sub.c.lid,
                        LoanInstallment.due_date == min_due_sub.c.next_date,
                    ))
                    .filter(LoanInstallment.status.in_(["PENDING", "PARTIAL"]))
                    .group_by(LoanInstallment.loan_id, LoanInstallment.due_date)
                    .all()
                )
                next_due = {
                    r.loan_id: {
                        "date": r.due_date.isoformat() if r.due_date else None,
                        "amount": round(float(r.amount or 0), 2),
                    }
                    for r in due_rows
                }

            for idx_row in loan_rows:
                nd = next_due.get(idx_row.loan_id) or {}
                loans_map.setdefault(idx_row.customer_id, []).append({
                    "loan_id":             idx_row.loan_id,
                    "loan_type":           idx_row.loan_type or "PRINCIPAL_INTEREST",
                    "status":              idx_row.status,
                    "installment_type":    idx_row.installment_type,
                    "disbursement_date":   idx_row.disbursement_date.isoformat() if idx_row.disbursement_date else None,
                    "disbursement_amount": round(float(idx_row.disbursement_amount or 0), 2),
                    "outstanding_amount":  round(float(idx_row.balance_amount or 0), 2),
                    "installment_amount":  round(float(idx_row.installment_amount or 0), 2),
                    "num_installments":    idx_row.num_installments or 0,
                    "paid_installments":   paid_counts.get(idx_row.loan_id, 0),
                    "next_due_date":       nd.get("date"),
                    "next_due_amount":     nd.get("amount"),
                })

        rows = []
        for c in customers:
            d = model_to_dict(c)
            d["onboarded_by"] = creator_map.get(c.created_by) if c.created_by else None
            cust_loans = loans_map.get(c.customer_id, [])
            for n, ln in enumerate(cust_loans, start=1):
                ln["loan_number"] = n
            d["loans"] = cust_loans
            d["loan_count"] = len(cust_loans)

            if len(cust_loans) == 1:
                ln = cust_loans[0]
                d["loan_disbursed_date"] = ln["disbursement_date"]
                d["loan_type"]           = ln["loan_type"]
                d["disbursement_amount"] = ln["disbursement_amount"]
                d["outstanding_amount"]  = ln["outstanding_amount"]
                d["num_installments"]    = ln["num_installments"]
                d["paid_installments"]   = ln["paid_installments"]
                d["next_due_date"]       = ln["next_due_date"]
                d["next_due_amount"]     = ln["next_due_amount"]
            elif cust_loans:
                dated = [ln for ln in cust_loans if ln["next_due_date"]]
                earliest = min((ln["next_due_date"] for ln in dated), default=None)
                d["loan_disbursed_date"] = None
                d["loan_type"]           = None
                d["disbursement_amount"] = round(sum(ln["disbursement_amount"] for ln in cust_loans), 2)
                d["outstanding_amount"]  = round(sum(ln["outstanding_amount"] for ln in cust_loans), 2)
                d["num_installments"]    = None
                d["paid_installments"]   = None
                d["next_due_date"]       = earliest
                d["next_due_amount"]     = round(
                    sum(ln["next_due_amount"] or 0 for ln in dated if ln["next_due_date"] == earliest), 2
                ) if earliest else None
            else:
                d["loan_disbursed_date"] = None
                d["loan_type"]           = None
                d["disbursement_amount"] = None
                d["outstanding_amount"]  = None
                d["num_installments"]    = None
                d["paid_installments"]   = None
                d["next_due_date"]       = None
                d["next_due_amount"]     = None
            rows.append(d)

        return success_response(
            data=rows,
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

        # Batch user lookups into a single IN query
        user_ids = list({uid for uid in (customer.user_id, customer.created_by) if uid})
        user_map = {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(user_ids)).all()} if user_ids else {}
        assigned_user = user_map.get(customer.user_id)
        onboarded_by  = user_map.get(customer.created_by)

        data = model_to_dict(customer)
        data["loan_summary"] = loan_summary
        data["assigned_user_name"] = assigned_user
        data["onboarded_by"] = onboarded_by

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
        if "area" in data:
            customer.area = (data["area"] or "").strip()
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
# PATCH /{customer_id}/kyc — replace profile photo and/or ID proof
# ---------------------------------------------------------------------------

@customers_bp.route("/<string:customer_id>/kyc", methods=["PATCH"])
@require_roles(Config.ROLE_ADMIN, Config.ROLE_MANAGER)
def update_customer_kyc(customer_id):
    """
    PATCH /api/customers/{customer_id}/kyc
    Admin + Manager. Multipart/form-data with optional files: photo, id_proof.
    id_proof_type is required when id_proof is supplied.
    """
    current = get_current_user_info()

    photo_file = request.files.get("photo")
    id_proof_file = request.files.get("id_proof")
    has_photo = bool(photo_file and photo_file.filename)
    has_id = bool(id_proof_file and id_proof_file.filename)
    if not has_photo and not has_id:
        return error_response("Provide a photo and/or id_proof file")

    id_proof_type = (request.form.get("id_proof_type") or "").strip().upper()
    if has_id and id_proof_type not in _VALID_ID_PROOF_TYPES:
        return error_response("A valid id_proof_type is required when uploading an ID proof")

    db = SessionLocal()
    new_files = []
    old_files = []
    try:
        customer = db.query(Customer).filter(
            Customer.customer_id == customer_id,
            Customer.org_id == current["org_id"],
        ).first()
        if not customer:
            return error_response("Customer not found", 404)

        try:
            if has_photo:
                new_path = save_kyc_file(photo_file, customer_id, "photo")
                new_files.append(new_path)
                if customer.photo and customer.photo != new_path:
                    old_files.append(customer.photo)
                customer.photo = new_path
            if has_id:
                new_path = save_kyc_file(id_proof_file, customer_id, id_proof_type.lower())
                new_files.append(new_path)
                if customer.id_proof and customer.id_proof != new_path:
                    old_files.append(customer.id_proof)
                customer.id_proof = new_path
                customer.id_proof_type = id_proof_type
        except ValueError as ve:
            db.rollback()
            return error_response(str(ve))

        db.commit()
        for path in old_files:
            delete_kyc_file(path)
        return success_response(data=model_to_dict(customer), message="Documents updated successfully")
    except Exception as exc:
        db.rollback()
        for path in new_files:
            if path not in old_files:
                delete_kyc_file(path)
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

@customers_bp.route("/<string:customer_id>/delete-summary", methods=["GET"])
@require_roles(Config.ROLE_ADMIN)
def customer_delete_summary(customer_id):
    """
    GET /api/customers/{customer_id}/delete-summary
    ADMIN only. Returns the open loans and outstanding principal that would be
    returned to the rotation balance if this customer were deleted.
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

        loans = db.query(Loan).filter(
            Loan.customer_id == customer_id,
            Loan.status.in_(["ACTIVE", "OVERDUE"]),
        ).all()
        outstanding = round(sum(float(l.balance_amount or 0) for l in loans))
        return success_response(data={
            "customer_name": customer.name,
            "active_loans": len(loans),
            "outstanding_amount": outstanding,
        })
    finally:
        db.close()


@customers_bp.route("/<string:customer_id>", methods=["DELETE"])
@require_roles(Config.ROLE_ADMIN)
def delete_customer(customer_id):
    """
    DELETE /api/customers/{customer_id}
    ADMIN only. Body: {password} — the current user's password.
    Outstanding principal of active/overdue loans is credited back to the
    wallet rotation balance. The customer's loans and installments are removed;
    past transactions are kept (detached from the customer) so wallet history
    and reports stay intact. Also removes associated KYC files from disk.
    """
    current = get_current_user_info()
    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""
    if not password:
        return error_response("Password is required to delete a customer")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.user_id == current["user_id"]).first()
        if not user or user.password != password:
            return error_response("Incorrect password", 400)

        customer = db.query(Customer).filter(
            Customer.customer_id == customer_id,
            Customer.org_id == current["org_id"],
        ).first()
        if not customer:
            return error_response("Customer not found", 404)

        loans = db.query(Loan).filter(Loan.customer_id == customer_id).all()
        loan_ids = [l.loan_id for l in loans]
        outstanding = round(sum(
            float(l.balance_amount or 0) for l in loans if l.status in ("ACTIVE", "OVERDUE")
        ))

        if outstanding > 0:
            wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
            if not wallet:
                return error_response("Wallet not found for this organization", 400)
            wallet.rotation_balance = round(float(wallet.rotation_balance or 0) + outstanding, 2)

        # Keep transaction history; detach it from the rows being removed
        note = f"[Deleted customer: {customer.name}]"
        txn_filter = [Transaction.customer_id == customer_id]
        if loan_ids:
            txn_filter.append(Transaction.loan_id.in_(loan_ids))
        for txn in db.query(Transaction).filter(Transaction.org_id == current["org_id"]).filter(
            or_(*txn_filter)
        ).all():
            txn.customer_id = None
            txn.loan_id = None
            txn.installment_id = None
            txn.remarks = f"{txn.remarks} {note}"[:225] if txn.remarks else note[:225]
        db.flush()

        if loan_ids:
            db.query(LoanStatusHistory).filter(
                LoanStatusHistory.loan_id.in_(loan_ids)
            ).delete(synchronize_session=False)
            db.query(LoanInstallment).filter(
                LoanInstallment.loan_id.in_(loan_ids)
            ).delete(synchronize_session=False)
            db.query(Loan).filter(
                Loan.loan_id.in_(loan_ids)
            ).delete(synchronize_session=False)

        photo_path = customer.photo
        id_proof_path = customer.id_proof

        db.delete(customer)
        db.commit()

        # Remove KYC files (best-effort)
        delete_kyc_file(photo_path)
        delete_kyc_file(id_proof_path)

        return success_response(
            data={"outstanding_returned": outstanding},
            message="Customer deleted successfully",
        )
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()
