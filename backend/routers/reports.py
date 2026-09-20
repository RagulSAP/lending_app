"""
Reports routes — data queries and file exports (Excel / PDF).
Blueprint prefix: /api/reports
ADMIN / MANAGER / ACCOUNTANT only.
"""
from datetime import datetime, date as date_type

from flask import Blueprint, request, send_file

from database import SessionLocal
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response, parse_date
from core_functions.report_service import (
    get_transactions_report,
    get_loans_report,
    get_expenses_report,
    export_to_excel,
    export_to_pdf,
)

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

_ALLOWED_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_ACCOUNTANT)


# ---------------------------------------------------------------------------
# GET /transactions
# ---------------------------------------------------------------------------

@reports_bp.route("/transactions", methods=["GET"])
@require_roles(*_ALLOWED_ROLES)
def transactions_report():
    """
    GET /api/reports/transactions
    Required: date_from, date_to (YYYY-MM-DD)
    Optional: payment_mode, transaction_type, customer_id, page, per_page
    """
    current = get_current_user_info()

    date_from = parse_date(request.args.get("date_from"))
    date_to = parse_date(request.args.get("date_to"))
    if not date_from or not date_to:
        return error_response("date_from and date_to are required (YYYY-MM-DD)")
    if date_from > date_to:
        return error_response("date_from must not be after date_to")

    payment_mode = request.args.get("payment_mode") or None
    transaction_type = request.args.get("transaction_type") or None
    customer_id = request.args.get("customer_id") or None
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 50, type=int), 500)

    db = SessionLocal()
    try:
        records, total = get_transactions_report(
            db,
            org_id=current["org_id"],
            date_from=date_from,
            date_to=date_to,
            payment_mode=payment_mode,
            transaction_type=transaction_type,
            customer_id=customer_id,
            page=page,
            per_page=per_page,
        )
        return success_response(data=records, total=total, page=page, per_page=per_page)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET /loans
# ---------------------------------------------------------------------------

@reports_bp.route("/loans", methods=["GET"])
@require_roles(*_ALLOWED_ROLES)
def loans_report():
    """
    GET /api/reports/loans
    Optional: date_from, date_to, status, interest_type, page, per_page
    """
    current = get_current_user_info()

    date_from = parse_date(request.args.get("date_from"))
    date_to = parse_date(request.args.get("date_to"))
    status = request.args.get("status") or None
    interest_type = request.args.get("interest_type") or None
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 50, type=int), 500)

    db = SessionLocal()
    try:
        records, total = get_loans_report(
            db,
            org_id=current["org_id"],
            date_from=date_from,
            date_to=date_to,
            status=status,
            interest_type=interest_type,
            page=page,
            per_page=per_page,
        )
        return success_response(data=records, total=total, page=page, per_page=per_page)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET /expenses
# ---------------------------------------------------------------------------

@reports_bp.route("/expenses", methods=["GET"])
@require_roles(*_ALLOWED_ROLES)
def expenses_report():
    """
    GET /api/reports/expenses
    Optional: date_from, date_to, category_id, page, per_page
    """
    current = get_current_user_info()

    date_from = parse_date(request.args.get("date_from"))
    date_to = parse_date(request.args.get("date_to"))
    category_id = request.args.get("category_id") or None
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 50, type=int), 500)

    db = SessionLocal()
    try:
        records, total = get_expenses_report(
            db,
            org_id=current["org_id"],
            date_from=date_from,
            date_to=date_to,
            category_id=category_id,
            page=page,
            per_page=per_page,
        )
        return success_response(data=records, total=total, page=page, per_page=per_page)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET /export — file download
# ---------------------------------------------------------------------------

@reports_bp.route("/export", methods=["GET"])
@require_roles(*_ALLOWED_ROLES)
def export_report():
    """
    GET /api/reports/export
    Required: type (excel|pdf), report (transactions|loans|expenses)
    Accepts the same filter params as the individual report endpoints.
    Returns a file download (Content-Disposition: attachment).
    """
    current = get_current_user_info()

    export_type = (request.args.get("type") or "").lower()
    report_name = (request.args.get("report") or "").lower()

    if export_type not in ("excel", "pdf"):
        return error_response("type must be 'excel' or 'pdf'")
    if report_name not in ("transactions", "loans", "expenses"):
        return error_response("report must be 'transactions', 'loans', or 'expenses'")

    # Parse common filters
    date_from = parse_date(request.args.get("date_from"))
    date_to = parse_date(request.args.get("date_to"))
    page = 1
    per_page = 10000  # fetch all for export

    filters_parts = []
    if date_from:
        filters_parts.append(f"From: {date_from.isoformat()}")
    if date_to:
        filters_parts.append(f"To: {date_to.isoformat()}")
    filters_label = "  |  ".join(filters_parts)

    db = SessionLocal()
    try:
        if report_name == "transactions":
            records, _ = get_transactions_report(
                db,
                org_id=current["org_id"],
                date_from=date_from or date_type(2000, 1, 1),
                date_to=date_to or date_type(2099, 12, 31),
                payment_mode=request.args.get("payment_mode") or None,
                transaction_type=request.args.get("transaction_type") or None,
                customer_id=request.args.get("customer_id") or None,
                page=page,
                per_page=per_page,
            )
        elif report_name == "loans":
            records, _ = get_loans_report(
                db,
                org_id=current["org_id"],
                date_from=date_from,
                date_to=date_to,
                status=request.args.get("status") or None,
                interest_type=request.args.get("interest_type") or None,
                page=page,
                per_page=per_page,
            )
        else:  # expenses
            records, _ = get_expenses_report(
                db,
                org_id=current["org_id"],
                date_from=date_from,
                date_to=date_to,
                category_id=request.args.get("category_id") or None,
                page=page,
                per_page=per_page,
            )

        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        filename_base = f"{report_name}_{timestamp}"

        if export_type == "excel":
            buf = export_to_excel(report_name, records, filters_label)
            return send_file(
                buf,
                as_attachment=True,
                download_name=f"{filename_base}.xlsx",
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        else:  # pdf
            buf = export_to_pdf(report_name, records, filters_label)
            return send_file(
                buf,
                as_attachment=True,
                download_name=f"{filename_base}.pdf",
                mimetype="application/pdf",
            )

    except Exception as exc:
        return error_response(f"Export failed: {exc}", 500)
    finally:
        db.close()
