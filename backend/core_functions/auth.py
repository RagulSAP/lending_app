"""
Authentication helpers: JWT creation and claim extraction.
"""
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity


def create_token(user) -> str:
    """
    Create a JWT access token for the given User model instance.
    Identity = user_id; additional claims include org_id, role_id, name.
    """
    additional_claims = {
        "org_id": user.org_id,
        "role_id": user.role_id,
        "name": user.name,
    }
    return create_access_token(identity=user.user_id, additional_claims=additional_claims)


def get_current_user_info() -> dict:
    """
    Extract current user info from the active JWT.
    Must be called within a @jwt_required() context.
    Returns: {user_id, org_id, role_id, name}
    """
    claims = get_jwt()
    return {
        "user_id": get_jwt_identity(),
        "org_id": claims.get("org_id"),
        "role_id": claims.get("role_id"),
        "name": claims.get("name"),
    }
