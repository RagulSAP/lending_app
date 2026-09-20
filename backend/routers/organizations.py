"""
Organization management routes. SUPER_ADMIN only.
Blueprint prefix: /api/organizations
"""
import uuid

from flask import Blueprint, request

from database import SessionLocal
from models import Organization, Wallet, User, Customer
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import hash_password
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
            password_hash=hash_password(admin_password),
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
                "admin_user": model_to_dict(admin_user, exclude=["password_hash"]),
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
            d["user_count"] = (
                db.query(User).filter(User.org_id == org.org_id).count()
            )
            d["borrower_count"] = (
                db.query(Customer).filter(Customer.org_id == org.org_id).count()
            )
            result.append(d)

        return success_response(data=result, total=len(result))
    finally:
        db.close()
