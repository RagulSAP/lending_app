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
    Query params: category_id, date_from (YYYY-MM-DD), date_to, page, per_page.
    Returns expense list with category_name, entered_by, and total_amount for the filter.
    """
    current = get_current_user_info()
    org_id = current["org_id"]

    from models import User
    from sqlalchemy import func as sqlfunc

    category_id = request.args.get("category_id") or None
    date_from = parse_date(request.args.get("date_from"))
    date_to = parse_date(request.args.get("date_to"))
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    db = SessionLocal()
    try:
        base_q = (
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
            base_q = base_q.filter(Expense.category_id == category_id)
        if date_from:
            base_q = base_q.filter(Expense.expense_date >= date_from)
        if date_to:
            from datetime import timedelta
            date_to_end = datetime.combine(date_to, datetime.max.time())
            base_q = base_q.filter(Expense.expense_date <= date_to_end)

        total = base_q.count()

        # Total amount across all filtered rows (not just the current page)
        total_amount = db.query(sqlfunc.sum(Expense.expense_amount)).join(
            ExpenseCategory, ExpenseCategory.category_id == Expense.category_id
        ).filter(ExpenseCategory.org_id == org_id).scalar() or 0.0
        if category_id:
            total_amount_q = db.query(sqlfunc.sum(Expense.expense_amount)).join(
                ExpenseCategory, ExpenseCategory.category_id == Expense.category_id
            ).filter(ExpenseCategory.org_id == org_id, Expense.category_id == category_id)
            if date_from:
                total_amount_q = total_amount_q.filter(Expense.expense_date >= date_from)
            if date_to:
                total_amount_q = total_amount_q.filter(Expense.expense_date <= date_to_end)
            total_amount = total_amount_q.scalar() or 0.0
        elif date_from or date_to:
            total_amount_q = db.query(sqlfunc.sum(Expense.expense_amount)).join(
                ExpenseCategory, ExpenseCategory.category_id == Expense.category_id
            ).filter(ExpenseCategory.org_id == org_id)
            if date_from:
                total_amount_q = total_amount_q.filter(Expense.expense_date >= date_from)
            if date_to:
                total_amount_q = total_amount_q.filter(Expense.expense_date <= date_to_end)
            total_amount = total_amount_q.scalar() or 0.0

        rows = (
            base_q.order_by(Expense.expense_date.desc(), Expense.created_at.desc())
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

        return success_response(
            data=result, total=total, page=page, per_page=per_page,
            total_amount=round(float(total_amount), 2),
        )
    finally:
        db.close()


@expenses_bp.route("/<string:expense_id>", methods=["PATCH"])
@require_roles(*_MANAGE_ROLES)
def update_expense(expense_id):
    """
    PATCH /api/expenses/{expense_id}
    ADMIN / MANAGER. Body: {category_id, expense_amount, expense_remark, expense_date}
    Adjusts wallet balance by the delta (new_amount - old_amount).
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    db = SessionLocal()
    try:
        expense = (
            db.query(Expense)
            .join(ExpenseCategory, ExpenseCategory.category_id == Expense.category_id)
            .filter(Expense.expense_id == expense_id, ExpenseCategory.org_id == current["org_id"])
            .first()
        )
        if not expense:
            return error_response("Expense not found", 404)

        old_amount = float(expense.expense_amount or 0)

        if "category_id" in data:
            cat = db.query(ExpenseCategory).filter(
                ExpenseCategory.category_id == data["category_id"],
                ExpenseCategory.org_id == current["org_id"],
                ExpenseCategory.status == "ACTIVE",
            ).first()
            if not cat:
                return error_response("Category not found or inactive", 404)
            expense.category_id = data["category_id"]

        if "expense_amount" in data:
            try:
                new_amount = float(data["expense_amount"])
            except (TypeError, ValueError):
                return error_response("expense_amount must be a number")
            if new_amount <= 0:
                return error_response("expense_amount must be greater than zero")
            expense.expense_amount = round(new_amount, 2)
        else:
            new_amount = old_amount

        if "expense_remark" in data:
            expense.expense_remark = (data["expense_remark"] or "").strip()

        if "expense_date" in data:
            new_date = parse_date(str(data["expense_date"])) if data["expense_date"] else None
            if not new_date:
                return error_response("expense_date must be YYYY-MM-DD")
            expense.expense_date = datetime.combine(new_date, datetime.min.time())

        # Adjust wallet by delta
        delta = new_amount - old_amount
        if delta != 0:
            wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
            if wallet:
                wallet.balance = round(float(wallet.balance or 0) - delta, 2)

        db.commit()

        from models import User
        user = db.query(User).filter(User.user_id == expense.user_id).first()
        cat_obj = db.query(ExpenseCategory).filter(ExpenseCategory.category_id == expense.category_id).first()
        result = model_to_dict(expense)
        result["category_name"] = cat_obj.name if cat_obj else None
        result["entered_by"] = user.name if user else None
        return success_response(data=result, message="Expense updated successfully")

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@expenses_bp.route("/<string:expense_id>", methods=["DELETE"])
@require_roles(*_MANAGE_ROLES)
def delete_expense(expense_id):
    """
    DELETE /api/expenses/{expense_id}
    ADMIN / MANAGER. Reverses the wallet debit and deletes the expense record.
    """
    current = get_current_user_info()
    db = SessionLocal()
    try:
        expense = (
            db.query(Expense)
            .join(ExpenseCategory, ExpenseCategory.category_id == Expense.category_id)
            .filter(Expense.expense_id == expense_id, ExpenseCategory.org_id == current["org_id"])
            .first()
        )
        if not expense:
            return error_response("Expense not found", 404)

        amount = float(expense.expense_amount or 0)

        # Reverse wallet debit
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        if wallet:
            wallet.balance = round(float(wallet.balance or 0) + amount, 2)

        db.delete(expense)
        db.commit()
        return success_response(message="Expense deleted successfully")

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()
