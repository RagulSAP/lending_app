"""
Authentication routes: login, /me, /logout.
Blueprint prefix: /api/auth
"""
from datetime import datetime, timezone, timedelta

_IST = timezone(timedelta(hours=5, minutes=30))
def _now_ist(): return datetime.now(_IST).replace(tzinfo=None)

from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from database import SessionLocal
from models import User, Role
from core_functions.auth import check_password, create_token, get_current_user_info
from core_functions.responses import success_response, error_response

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


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
        if not user or not check_password(password, user.password_hash):
            return error_response("Invalid phone number or password", 400)

        if user.status != 1:
            return error_response("Account is inactive. Contact your administrator.", 403)

        role = db.query(Role).filter(Role.id == user.role_id).first()
        role_name = role.role_name if role else ""

        # Record login timestamp
        user.last_login = _now_ist()
        db.commit()

        token = create_token(user)
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

        role = db.query(Role).filter(Role.id == user.role_id).first()
        return success_response(data={
            "user_id": user.user_id,
            "name": user.name,
            "phone": user.phone,
            "role_id": user.role_id,
            "role_name": role.role_name if role else "",
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
