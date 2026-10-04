"""
Authentication routes: login, /me, /logout.
Blueprint prefix: /api/auth
"""
from datetime import datetime, timezone, timedelta

_IST = timezone(timedelta(hours=5, minutes=30))
def _now_ist(): return datetime.now(_IST).replace(tzinfo=None)

from flask import Blueprint, request, g
from flask_jwt_extended import jwt_required, get_jwt

from database import SessionLocal
from models import User, Role
from core_functions.auth import create_token, get_current_user_info
from core_functions.responses import success_response, error_response

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

_ROLE_CACHE: dict[int, str] = {}

def _get_role_name(db, role_id: int) -> str:
    """Return role_name from an in-process cache; populates on first miss."""
    if role_id not in _ROLE_CACHE:
        rows = db.query(Role.id, Role.role_name).all()
        _ROLE_CACHE.update({r.id: r.role_name for r in rows})
    return _ROLE_CACHE.get(role_id, "")


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    POST /api/auth/login
    Body: {phone, password}
    Returns: {access_token, user: {user_id, name, role_id, org_id, role_name}}
    """
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    phone = (data.get("phone") or "").strip()
    password = data.get("password") or ""

    if not phone or not password:
        return error_response("phone and password are required")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == phone).first()
        if not user or user.password != password:
            return error_response("Invalid phone number or password", 400)

        if user.status != 1:
            return error_response("Account is inactive. Contact your administrator.", 403)

        role_name = _get_role_name(db, user.role_id)

        # Record login timestamp
        user.last_login = _now_ist()
        db.commit()

        token = create_token(user)

        # Expose user info so the audit after_request hook can log LOGIN
        # (JWT claims are not yet available in after_request for this request)
        g.audit_user_id   = user.user_id
        g.audit_user_name = user.name
        g.audit_org_id    = user.org_id
        g.audit_role_id   = user.role_id
        g.audit_session_id = None  # jti is inside the token but not decoded here

        return success_response(data={
            "access_token": token,
            "user": {
                "user_id": user.user_id,
                "name": user.name,
                "role_id": user.role_id,
                "org_id": user.org_id,
                "role_name": role_name,
            },
        })
    finally:
        db.close()


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """GET /api/auth/me — Returns the current user's profile from DB."""
    info = get_current_user_info()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.user_id == info["user_id"]).first()
        if not user:
            return error_response("User not found", 404)

        return success_response(data={
            "user_id": user.user_id,
            "name": user.name,
            "phone": user.phone,
            "role_id": user.role_id,
            "role_name": _get_role_name(db, user.role_id),
            "org_id": user.org_id,
            "status": user.status,
            "last_login": user.last_login.isoformat() if user.last_login else None,
        })
    finally:
        db.close()


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """
    POST /api/auth/logout — Stateless logout (client drops the token).
    JWT blocklisting is not implemented; add flask-jwt-extended denylist if needed.
    """
    return success_response(message="Logged out successfully")
