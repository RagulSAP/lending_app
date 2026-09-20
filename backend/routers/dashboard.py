"""
Dashboard route — returns role-appropriate KPIs and summaries.
Blueprint prefix: /api/dashboard
"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from database import SessionLocal
from config import Config
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response, parse_date
from core_functions.dashboard_service import (
    get_admin_manager_dashboard,
    get_collector_dashboard,
    get_super_admin_dashboard,
)

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")

# Roles allowed to reach this endpoint at all
_ALLOWED_ROLES = {
    Config.ROLE_SUPER_ADMIN,
    Config.ROLE_ADMIN,
    Config.ROLE_MANAGER,
    Config.ROLE_COLLECTOR,
    Config.ROLE_ACCOUNTANT,
}


@dashboard_bp.route("/summary", methods=["GET"])
@jwt_required()
def dashboard_summary():
    """
    GET /api/dashboard/summary

    Role routing:
    - SUPER_ADMIN  → cross-org org summary (no financial data)
    - ADMIN / MANAGER / ACCOUNTANT → full org operational dashboard
    - COLLECTOR → own collections only (accepts date_from, date_to query params)
    - STAFF → 403 (no dashboard access)
    """
    current = get_current_user_info()
    role_id = current["role_id"]

    if role_id not in _ALLOWED_ROLES:
        return error_response("Dashboard not available for your role", 403)

    db = SessionLocal()
    try:
        if role_id == Config.ROLE_SUPER_ADMIN:
            data = get_super_admin_dashboard(db)

        elif role_id in (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_ACCOUNTANT):
            data = get_admin_manager_dashboard(db, current["org_id"])

        elif role_id == Config.ROLE_COLLECTOR:
            date_from = parse_date(request.args.get("date_from"))
            date_to = parse_date(request.args.get("date_to"))
            data = get_collector_dashboard(
                db,
                org_id=current["org_id"],
                user_id=current["user_id"],
                date_from=date_from,
                date_to=date_to,
            )

        else:
            # Should not reach here given the check above
            return error_response("Dashboard not available for your role", 403)

        return success_response(data=data)
    finally:
        db.close()
