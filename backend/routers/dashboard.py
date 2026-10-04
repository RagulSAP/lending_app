"""
Dashboard route — returns role-appropriate KPIs and summaries.
Blueprint prefix: /api/dashboard
"""
from datetime import date as date_type, timedelta

from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, case

from database import SessionLocal
from models import Transaction
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


@dashboard_bp.route("/trend", methods=["GET"])
@jwt_required()
def dashboard_trend():
    """
    GET /api/dashboard/trend?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    Returns daily collected and disbursed amounts for the date range.
    Defaults to last 30 days. Max 365 days.
    """
    current = get_current_user_info()
    if current["role_id"] not in (
        Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_ACCOUNTANT
    ):
        return error_response("Not available for your role", 403)

    today = date_type.today()
    date_to   = parse_date(request.args.get("date_to"))   or today
    date_from = parse_date(request.args.get("date_from")) or (date_to - timedelta(days=29))

    if date_from > date_to:
        return error_response("date_from must not be after date_to")
    if (date_to - date_from).days > 365:
        return error_response("Date range cannot exceed 365 days")

    db = SessionLocal()
    try:
        rows = (
            db.query(
                Transaction.transaction_date,
                func.sum(case(
                    (Transaction.transaction_type == "LOAN_COLLECTION", Transaction.amount),
                    else_=0,
                )).label("collected"),
                func.sum(case(
                    (Transaction.transaction_type == "LOAN_DISBURSEMENT", Transaction.amount),
                    else_=0,
                )).label("disbursed"),
            )
            .filter(
                Transaction.org_id == current["org_id"],
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to,
                Transaction.transaction_type.in_(["LOAN_COLLECTION", "LOAN_DISBURSEMENT"]),
            )
            .group_by(Transaction.transaction_date)
            .order_by(Transaction.transaction_date)
            .all()
        )

        # Build a full date spine so missing days appear as 0
        data_map = {r.transaction_date: (float(r.collected), float(r.disbursed)) for r in rows}
        dates, collected, disbursed = [], [], []
        cursor = date_from
        while cursor <= date_to:
            c, d = data_map.get(cursor, (0.0, 0.0))
            dates.append(cursor.strftime("%d %b"))
            collected.append(round(c, 2))
            disbursed.append(round(d, 2))
            cursor += timedelta(days=1)

        return success_response(data={"dates": dates, "collected": collected, "disbursed": disbursed})
    finally:
        db.close()
