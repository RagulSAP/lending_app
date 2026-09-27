"""
Organization management routes. SUPER_ADMIN only.
Blueprint prefix: /api/organizations
"""
import uuid

from flask import Blueprint, request

from database import SessionLocal
from models import Organization, Wallet, User, Customer, Loan, LoanInstallment, Transaction, Expense, ExpenseCategory, LoanStatusHistory
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response, model_to_dict

orgs_bp = Blueprint("organizations", __name__, url_prefix="/api/organizations")


@orgs_bp.route("/", methods=["POST"])
@require_roles(Config.ROLE_SUPER_ADMIN)
def create_org():
    """
    POST /api/organizations/
    Body: {name, address, phone, admin_name, admin_phone, admin_password}
    Creates organization, its wallet, and the first ADMIN user in one transaction.
    """
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    name = (data.get("name") or "").strip()
    address = (data.get("address") or "").strip()
    phone = (data.get("phone") or "").strip()
    admin_name = (data.get("admin_name") or "").strip()
    admin_phone = (data.get("admin_phone") or "").strip()
    admin_password = data.get("admin_password") or ""

    missing = [f for f, v in [
        ("name", name), ("admin_name", admin_name),
        ("admin_phone", admin_phone), ("admin_password", admin_password)
    ] if not v]
    if missing:
        return error_response(f"Missing required fields: {', '.join(missing)}")

    db = SessionLocal()
    try:
        # Uniqueness checks
        if db.query(Organization).filter(Organization.name == name).first():
            return error_response("An organization with that name already exists")
        if db.query(User).filter(User.phone == admin_phone).first():
            return error_response("Admin phone number is already registered")

        org_id = str(uuid.uuid4())
        wallet_id = str(uuid.uuid4())
        admin_user_id = str(uuid.uuid4())

        org = Organization(
            org_id=org_id,
            name=name,
            address=address,
            phone=phone,
            status="ACTIVE",
        )
        wallet = Wallet(
            wallet_id=wallet_id,
            org_id=org_id,
            balance=0,
        )
        admin_user = User(
            user_id=admin_user_id,
            org_id=org_id,
            name=admin_name,
            phone=admin_phone,
            password=admin_password,
            role_id=Config.ROLE_ADMIN,
            status=1,
        )

        db.add(org)
        db.add(wallet)
        db.add(admin_user)
        db.commit()

        return success_response(
            data={
                "org": model_to_dict(org),
                "wallet": model_to_dict(wallet),
                "admin_user": model_to_dict(admin_user, exclude=["password"]),
            },
            message="Organization created successfully",
        ), 201

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@orgs_bp.route("/", methods=["GET"])
@require_roles(Config.ROLE_SUPER_ADMIN)
def list_orgs():
    """
    GET /api/organizations/
    Returns all organizations (excluding the SYSTEM org) with user_count and borrower_count.
    """
    db = SessionLocal()
    try:
        orgs = (
            db.query(Organization)
            .filter(Organization.org_id != Config.SYSTEM_ORG_ID)
            .order_by(Organization.created_at.desc())
            .all()
        )

        result = []
        for org in orgs:
            d = model_to_dict(org)
            d["user_count"] = db.query(User).filter(User.org_id == org.org_id).count()
            d["borrower_count"] = db.query(Customer).filter(Customer.org_id == org.org_id).count()
            admin = (
                db.query(User)
                .filter(User.org_id == org.org_id, User.role_id == Config.ROLE_ADMIN)
                .order_by(User.id)
                .first()
            )
            d["admin_user"] = {
                "user_id": admin.user_id,
                "name": admin.name,
                "phone": admin.phone,
            } if admin else None
            result.append(d)

        return success_response(data=result, total=len(result))
    finally:
        db.close()


@orgs_bp.route("/<string:org_id>", methods=["PATCH"])
@require_roles(Config.ROLE_SUPER_ADMIN)
def update_org(org_id):
    """
    PATCH /api/organizations/<org_id>
    Org fields: name, address, phone, status
    Admin user fields: admin_name, admin_phone, admin_password
    """
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.org_id == org_id).first()
        if not org:
            return error_response("Organization not found", 404)

        # --- Org fields ---
        if "name" in data:
            name = (data["name"] or "").strip()
            if not name:
                return error_response("name must not be empty")
            existing = db.query(Organization).filter(
                Organization.name == name,
                Organization.org_id != org_id
            ).first()
            if existing:
                return error_response("An organization with that name already exists")
            org.name = name

        if "address" in data:
            org.address = (data["address"] or "").strip() or None

        if "phone" in data:
            phone = (data["phone"] or "").strip()
            if phone and not phone.isdigit():
                return error_response("Phone must be numeric")
            org.phone = phone or None

        if "status" in data:
            status = (data["status"] or "").strip().upper()
            if status not in ("ACTIVE", "INACTIVE"):
                return error_response("status must be ACTIVE or INACTIVE")
            org.status = status

        # --- Admin user fields ---
        admin_fields = {"admin_name", "admin_phone", "admin_password"} & data.keys()
        if admin_fields:
            admin = (
                db.query(User)
                .filter(User.org_id == org_id, User.role_id == Config.ROLE_ADMIN)
                .order_by(User.id)
                .first()
            )
            if not admin:
                return error_response("No admin user found for this organization")

            if "admin_name" in data:
                admin_name = (data["admin_name"] or "").strip()
                if not admin_name:
                    return error_response("Admin name must not be empty")
                admin.name = admin_name

            if "admin_phone" in data:
                admin_phone = (data["admin_phone"] or "").strip()
                if admin_phone:
                    if not admin_phone.isdigit():
                        return error_response("Admin phone must be numeric")
                    duplicate = db.query(User).filter(
                        User.phone == admin_phone,
                        User.user_id != admin.user_id
                    ).first()
                    if duplicate:
                        return error_response("Admin phone number is already in use")
                admin.phone = admin_phone or None

            if "admin_password" in data:
                pwd = data["admin_password"] or ""
                if pwd:
                    if len(pwd) < 6:
                        return error_response("Password must be at least 6 characters")
                    admin.password = pwd

        db.commit()
        return success_response(data=model_to_dict(org), message="Organization updated successfully")

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@orgs_bp.route("/<string:org_id>", methods=["DELETE"])
@require_roles(Config.ROLE_SUPER_ADMIN)
def delete_org(org_id):
    """
    DELETE /api/organizations/<org_id>
    Body: {password}  — verifies the current super admin's password before deleting.
    Cascades: deletes all data belonging to this org.
    """
    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""
    if not password:
        return error_response("Password is required to confirm deletion")

    current = get_current_user_info()
    db = SessionLocal()
    try:
        # Verify current user's password
        me = db.query(User).filter(User.user_id == current["user_id"]).first()
        if not me or me.password != password:
            return error_response("Incorrect password", 403)

        org = db.query(Organization).filter(Organization.org_id == org_id).first()
        if not org:
            return error_response("Organization not found", 404)

        # Cascade delete in dependency order (no FK constraints, manual cascade)
        loan_ids = [l.loan_id for l in db.query(Loan.loan_id).filter(Loan.org_id == org_id).all()]
        wallet_ids = [w.wallet_id for w in db.query(Wallet.wallet_id).filter(Wallet.org_id == org_id).all()]

        if loan_ids:
            db.query(LoanStatusHistory).filter(LoanStatusHistory.loan_id.in_(loan_ids)).delete(synchronize_session=False)
            db.query(LoanInstallment).filter(LoanInstallment.loan_id.in_(loan_ids)).delete(synchronize_session=False)

        db.query(Transaction).filter(Transaction.org_id == org_id).delete(synchronize_session=False)

        if wallet_ids:
            db.query(Expense).filter(Expense.wallet_id.in_(wallet_ids)).delete(synchronize_session=False)

        if loan_ids:
            db.query(Loan).filter(Loan.loan_id.in_(loan_ids)).delete(synchronize_session=False)

        db.query(Customer).filter(Customer.org_id == org_id).delete(synchronize_session=False)
        db.query(ExpenseCategory).filter(ExpenseCategory.org_id == org_id).delete(synchronize_session=False)
        db.query(Wallet).filter(Wallet.org_id == org_id).delete(synchronize_session=False)
        db.query(User).filter(User.org_id == org_id).delete(synchronize_session=False)
        db.delete(org)
        db.commit()

        return success_response(message=f"Organization '{org.name}' and all its data deleted successfully")

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()
