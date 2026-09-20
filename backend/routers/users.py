"""
User management routes.
Blueprint prefix: /api/users
"""
import uuid

from flask import Blueprint, request

from database import SessionLocal
from models import User, Role
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import hash_password, get_current_user_info
from core_functions.responses import success_response, error_response, model_to_dict

users_bp = Blueprint("users", __name__, url_prefix="/api/users")

_ALLOWED_ROLE_IDS = {
    Config.ROLE_ADMIN,
    Config.ROLE_MANAGER,
    Config.ROLE_STAFF,
    Config.ROLE_COLLECTOR,
    Config.ROLE_ACCOUNTANT,
}


@users_bp.route("/", methods=["POST"])
@require_roles(Config.ROLE_ADMIN)
def create_user():
    """
    POST /api/users/
    ADMIN only. Creates a new user in the same org as the authenticated admin.
    Body: {name, phone, password, role_id}
    role_id must be 1–5 (cannot create SUPER_ADMIN).
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    password = data.get("password") or ""
    role_id = data.get("role_id")

    if not name:
        return error_response("name is required")
    if not phone:
        return error_response("phone is required")
    if not password:
        return error_response("password is required")
    if role_id is None:
        return error_response("role_id is required")

    try:
        role_id = int(role_id)
    except (TypeError, ValueError):
        return error_response("role_id must be an integer")

    if role_id not in _ALLOWED_ROLE_IDS:
        return error_response(
            "Invalid role_id. Allowed: 1=ADMIN, 2=MANAGER, 3=STAFF, 4=COLLECTOR, 5=ACCOUNTANT"
        )

    db = SessionLocal()
    try:
        if db.query(User).filter(User.phone == phone).first():
            return error_response("Phone number is already registered")

        user = User(
            user_id=str(uuid.uuid4()),
            org_id=current["org_id"],
            name=name,
            phone=phone,
            password_hash=hash_password(password),
            role_id=role_id,
            status=1,
        )
        db.add(user)
        db.commit()

        return success_response(
            data=model_to_dict(user, exclude=["password_hash"]),
            message="User created successfully",
        ), 201

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@users_bp.route("/", methods=["GET"])
@require_roles(Config.ROLE_ADMIN, Config.ROLE_MANAGER)
def list_users():
    """
    GET /api/users/
    ADMIN or MANAGER. Returns paginated user list for the current org.
    Query params: role_id, status (0/1), search (name/phone), page, per_page.
    """
    current = get_current_user_info()
    org_id = current["org_id"]

    role_filter = request.args.get("role_id", type=int)
    status_filter = request.args.get("status", type=int)
    search = (request.args.get("search") or "").strip()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    db = SessionLocal()
    try:
        q = db.query(User).filter(User.org_id == org_id)

        if role_filter is not None:
            q = q.filter(User.role_id == role_filter)
        if status_filter is not None:
            q = q.filter(User.status == status_filter)
        if search:
            pattern = f"%{search}%"
            q = q.filter(
                User.name.ilike(pattern) | User.phone.ilike(pattern)
            )

        total = q.count()
        users = q.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

        # Enrich with role_name
        role_map = {r.id: r.role_name for r in db.query(Role).all()}
        result = []
        for u in users:
            d = model_to_dict(u, exclude=["password_hash"])
            d["role_name"] = role_map.get(u.role_id, "")
            result.append(d)

        return success_response(data=result, total=total, page=page, per_page=per_page)
    finally:
        db.close()


@users_bp.route("/<string:user_id>/status", methods=["PATCH"])
@require_roles(Config.ROLE_ADMIN)
def update_user_status(user_id):
    """
    PATCH /api/users/{user_id}/status
    ADMIN only. Body: {status: 0 or 1}
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data or "status" not in data:
        return error_response("'status' field is required")

    new_status = data.get("status")
    if new_status not in (0, 1):
        return error_response("status must be 0 (inactive) or 1 (active)")

    db = SessionLocal()
    try:
        user = db.query(User).filter(
            User.user_id == user_id,
            User.org_id == current["org_id"],
        ).first()
        if not user:
            return error_response("User not found", 404)

        user.status = new_status
        db.commit()
        return success_response(message=f"User {'activated' if new_status else 'deactivated'} successfully")
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@users_bp.route("/<string:user_id>", methods=["DELETE"])
@require_roles(Config.ROLE_ADMIN)
def delete_user(user_id):
    """
    DELETE /api/users/{user_id}
    ADMIN only. Prevents self-deletion.
    """
    current = get_current_user_info()
    if user_id == current["user_id"]:
        return error_response("Cannot delete your own account")

    db = SessionLocal()
    try:
        user = db.query(User).filter(
            User.user_id == user_id,
            User.org_id == current["org_id"],
        ).first()
        if not user:
            return error_response("User not found", 404)

        db.delete(user)
        db.commit()
        return success_response(message="User deleted successfully")
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()
