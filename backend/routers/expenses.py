"""
Expense management routes.
Blueprint prefix: /api/expenses
"""
import uuid
from datetime import datetime, timezone, timedelta

_IST = timezone(timedelta(hours=5, minutes=30))
def _now_ist(): return datetime.now(_IST).replace(tzinfo=None)

from flask import Blueprint, request

from database import SessionLocal
from models import ExpenseCategory, Expense, Transaction, Wallet
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response, model_to_dict, parse_date

expenses_bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")

_ALL_FINANCIAL_ROLES = (
    Config.ROLE_ADMIN,
    Config.ROLE_MANAGER,
    Config.ROLE_STAFF,
    Config.ROLE_ACCOUNTANT,
)
_MANAGE_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER)
_VIEW_ROLES = (
    Config.ROLE_ADMIN,
    Config.ROLE_MANAGER,
    Config.ROLE_ACCOUNTANT,
    Config.ROLE_STAFF,
)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

@expenses_bp.route("/categories", methods=["GET"])
@require_roles(*_ALL_FINANCIAL_ROLES)
def list_categories():
    """GET /api/expenses/categories — Active expense categories for the current org."""
    current = get_current_user_info()
    db = SessionLocal()
    try:
        categories = (
            db.query(ExpenseCategory)
            .filter(
                ExpenseCategory.org_id == current["org_id"],
                ExpenseCategory.status == "ACTIVE",
            )
            .order_by(ExpenseCategory.name)
            .all()
        )
        return success_response(
            data=[model_to_dict(c) for c in categories],
            total=len(categories),
        )
    finally:
        db.close()


@expenses_bp.route("/categories", methods=["POST"])
@require_roles(*_MANAGE_ROLES)
def create_category():
    """
    POST /api/expenses/categories
    ADMIN / MANAGER. Body: {name, description}
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    name = (data.get("name") or "").strip()
    if not name:
        return error_response("name is required")

    description = (data.get("description") or "").strip()

    db = SessionLocal()
    try:
        # Prevent duplicate category names within the same org
        existing = db.query(ExpenseCategory).filter(
            ExpenseCategory.org_id == current["org_id"],
            ExpenseCategory.name == name,
        ).first()
        if existing:
            return error_response("A category with that name already exists in this organisation")

        category = ExpenseCategory(
            category_id=str(uuid.uuid4()),
            org_id=current["org_id"],
            name=name,
            description=description,
            status="ACTIVE",
        )
        db.add(category)
        db.commit()
        return success_response(data=model_to_dict(category), message="Category created"), 201

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

@expenses_bp.route("/", methods=["POST"])
@require_roles(*_ALL_FINANCIAL_ROLES)
def create_expense():
    """
    POST /api/expenses/
    Body: {category_id, expense_amount, expense_remark, expense_date (YYYY-MM-DD)}

    Flow:
    1. Validate category belongs to org.
    2. Get wallet, deduct balance (overdraft allowed with a note in remarks).
    3. Insert Expense record.
    4. Insert Transaction (type=EXPENSE).
    5. Return expense detail.
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    category_id = data.get("category_id") or ""
    expense_remark = (data.get("expense_remark") or "").strip()
    expense_date_str = data.get("expense_date")

    if not category_id:
        return error_response("category_id is required")

    try:
        expense_amount = float(data.get("expense_amount") or 0)
    except (TypeError, ValueError):
        return error_response("expense_amount must be a number")
    if expense_amount <= 0:
        return error_response("expense_amount must be greater than zero")

    expense_date = parse_date(str(expense_date_str)) if expense_date_str else None
    expense_datetime = datetime.combine(expense_date, datetime.min.time()) if expense_date else _now_ist()

    db = SessionLocal()
    try:
        # Validate category
        category = db.query(ExpenseCategory).filter(
            ExpenseCategory.category_id == category_id,
            ExpenseCategory.org_id == current["org_id"],
            ExpenseCategory.status == "ACTIVE",
        ).first()
        if not category:
            return error_response("Expense category not found or inactive", 404)

        # Get wallet
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        if not wallet:
            return error_response("No wallet found for this organisation", 500)

        overdraft = float(wallet.balance or 0) < expense_amount
        wallet.balance = round(float(wallet.balance or 0) - expense_amount, 2)

        expense_id = str(uuid.uuid4())
        expense = Expense(
            expense_id=expense_id,
            user_id=current["user_id"],
            category_id=category_id,
            expense_remark=expense_remark,
            expense_amount=round(expense_amount, 2),
            wallet_id=wallet.wallet_id,
            expense_date=expense_datetime,
        )
        db.add(expense)
        db.flush()

        # Transaction record
        txn = Transaction(
            transaction_id=str(uuid.uuid4()),
            loan_id=None,
            customer_id=None,
            installment_id=None,
            user_id=current["user_id"],
            org_id=current["org_id"],
            transaction_type="EXPENSE",
            transaction_date=expense_datetime.date() if hasattr(expense_datetime, "date") else expense_datetime,
            amount=round(expense_amount, 2),
            payment_mode=None,
            wallet_id=wallet.wallet_id,
            remarks=expense_remark or category.name,
        )
        db.add(txn)
        db.commit()

        result = model_to_dict(expense)
        result["category_name"] = category.name
        result["wallet_balance_after"] = float(wallet.balance)
        if overdraft:
            result["warning"] = "Wallet balance is now negative (overdraft)"

        return success_response(data=result, message="Expense recorded successfully"), 201

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@expenses_bp.route("/", methods=["GET"])
@require_roles(*_VIEW_ROLES)
def list_expenses():
    """
    GET /api/expenses/
    ADMIN / MANAGER / ACCOUNTANT / STAFF.
    Query params: category_id, date_from (YYYY-MM-DD), date_to, page, per_page.
    Returns expense list with category_name and entered_by (user name).
    """
    current = get_current_user_info()
    org_id = current["org_id"]

    from models import User

    category_id = request.args.get("category_id") or None
    date_from = parse_date(request.args.get("date_from"))
    date_to = parse_date(request.args.get("date_to"))
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    db = SessionLocal()
    try:
        q = (
            db.query(
                Expense,
                ExpenseCategory.name.label("category_name"),
                User.name.label("user_name"),
            )
            .join(ExpenseCategory, ExpenseCategory.category_id == Expense.category_id)
            .join(User, User.user_id == Expense.user_id, isouter=True)
            .filter(ExpenseCategory.org_id == org_id)
        )
        if category_id:
            q = q.filter(Expense.category_id == category_id)
        if date_from:
            q = q.filter(Expense.expense_date >= date_from)
        if date_to:
            # Use end-of-day for date_to when filtering DateTime column
            from datetime import timedelta
            date_to_end = datetime.combine(date_to, datetime.max.time())
            q = q.filter(Expense.expense_date <= date_to_end)

        total = q.count()
        rows = (
            q.order_by(Expense.expense_date.desc(), Expense.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        result = []
        for expense, category_name, user_name in rows:
            d = model_to_dict(expense)
            d["category_name"] = category_name
            d["entered_by"] = user_name
            result.append(d)

        return success_response(data=result, total=total, page=page, per_page=per_page)
    finally:
        db.close()
