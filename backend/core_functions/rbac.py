"""
Role-Based Access Control decorators and helpers.
"""
from functools import wraps
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt
from config import Config


def require_roles(*roles):
    """
    Decorator that enforces role-based access.
    Applies @jwt_required() automatically — do NOT stack a separate one.
    Usage: @require_roles(Config.ROLE_ADMIN, Config.ROLE_MANAGER)
    Returns 403 if the authenticated user's role_id is not in the allowed list.
    """
    def decorator(f):
        @wraps(f)
        @jwt_required()
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            role_id = claims.get("role_id")
            if role_id not in roles:
                return jsonify({
                    "success": False,
                    "message": "Forbidden: insufficient permissions",
                }), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator


def is_org_scoped(role_id: int) -> bool:
    """Return True if the role requires org-level data filtering (everyone except SUPER_ADMIN)."""
    return role_id != Config.ROLE_SUPER_ADMIN


def get_org_filter(role_id: int, org_id: str):
    """
    Return the org_id to filter by.
    Returns None for SUPER_ADMIN (no org restriction), actual org_id for all other roles.
    """
    if role_id == Config.ROLE_SUPER_ADMIN:
        return None
    return org_id
