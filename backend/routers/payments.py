"""
Payment collection routes.
Blueprint prefix: /api/payments
"""
import uuid
from datetime import date

from flask import Blueprint, request

from database import SessionLocal
from models import Loan, LoanInstallment, Transaction, Wallet, Customer, LoanStatusHistory
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response, model_to_dict, parse_date

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")

_COLLECT_ROLES = (
    Config.ROLE_ADMIN,
    Config.ROLE_MANAGER,
    Config.ROLE_STAFF,
    Config.ROLE_COLLECTOR,
)
_VIEW_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_ACCOUNTANT)

_VALID_PAYMENT_MODES = {"CASH", "UPI", "BANK_TRANSFER", "CHEQUE"}


@payments_bp.route("/collect", methods=["POST"])
@require_roles(*_COLLECT_ROLES)
def collect_payment():
    """
    POST /api/payments/collect
    Body: {loan_id, installment_id, amount, payment_mode, remarks, transaction_date}

    Flow:
    1. Load and validate installment (belongs to loan, belongs to org).
    2. Validate amount <= installment balance.
    3. Update installment (paid_amount, balance_amount, status, paid_date).
    4. Update loan (total_paid, balance_amount, status → CLOSED if fully paid).
    5. Credit wallet.balance.
    6. Insert Transaction (LOAN_COLLECTION).
    7. If loan closed, record LoanStatusHistory.
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    loan_id = data.get("loan_id") or ""
    installment_id = data.get("installment_id") or ""
    payment_mode = (data.get("payment_mode") or "").strip().upper()
    remarks = data.get("remarks") or ""

    if not loan_id:
        return error_response("loan_id is required")
    if not installment_id:
        return error_response("installment_id is required")
    if not payment_mode:
        return error_response("payment_mode is required")
    if payment_mode not in _VALID_PAYMENT_MODES:
        return error_response(f"payment_mode must be one of: {', '.join(sorted(_VALID_PAYMENT_MODES))}")

    try:
        amount = float(data.get("amount") or 0)
    except (TypeError, ValueError):
        return error_response("amount must be a number")
    if amount <= 0:
        return error_response("amount must be greater than zero")

    txn_date_str = data.get("transaction_date")
    txn_date = parse_date(str(txn_date_str)) if txn_date_str else date.today()
    if not txn_date:
        return error_response("transaction_date must be in YYYY-MM-DD format")

    db = SessionLocal()
    try:
        # Load and validate loan
        loan = db.query(Loan).filter(
            Loan.loan_id == loan_id,
            Loan.org_id == current["org_id"],
        ).first()
        if not loan:
            return error_response("Loan not found", 404)
        if loan.status == "CLOSED":
            return error_response("Loan is already closed")

        # Load installment
        installment = db.query(LoanInstallment).filter(
            LoanInstallment.installment_id == installment_id,
            LoanInstallment.loan_id == loan_id,
        ).first()
        if not installment:
            return error_response("Installment not found", 404)
        if installment.status == "PAID":
            return error_response("Installment is already fully paid")

        current_balance = float(installment.balance_amount or 0)
        if amount > current_balance + 0.005:  # small epsilon for floating point
            return error_response(
                f"Amount ({amount:.2f}) exceeds installment balance ({current_balance:.2f})"
            )

        # 3. Update installment
        new_paid = round(float(installment.paid_amount or 0) + amount, 2)
        new_balance = round(current_balance - amount, 2)
        if new_balance <= 0.005:
            new_balance = 0.0
            installment.status = "PAID"
            installment.paid_date = date.today()
        else:
            installment.status = "PARTIAL"
        installment.paid_amount = new_paid
        installment.balance_amount = new_balance

        # 4. Update loan
        old_loan_status = loan.status
        loan.total_paid = round(float(loan.total_paid or 0) + amount, 2)
        loan.balance_amount = round(float(loan.balance_amount or 0) - amount, 2)
        if loan.balance_amount <= 0.005:
            loan.balance_amount = 0.0
            loan.status = "CLOSED"

        # 5. Credit wallet
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        if not wallet:
            return error_response("No wallet found for this organisation", 500)
        wallet.balance = round(float(wallet.balance or 0) + amount, 2)

        # 6. Insert transaction
        txn = Transaction(
            transaction_id=str(uuid.uuid4()),
            loan_id=loan_id,
            customer_id=loan.customer_id,
            installment_id=installment_id,
            user_id=current["user_id"],
            org_id=current["org_id"],
            transaction_type="LOAN_COLLECTION",
            transaction_date=txn_date,
            amount=round(amount, 2),
            payment_mode=payment_mode,
            wallet_id=wallet.wallet_id,
            remarks=remarks,
        )
        db.add(txn)

        # 7. Loan status history if status changed
        if loan.status != old_loan_status:
            history = LoanStatusHistory(
                id=str(uuid.uuid4()),
                loan_id=loan_id,
                old_status=old_loan_status,
                new_status=loan.status,
                changed_by=current["user_id"],
                remarks="Loan fully repaid",
            )
            db.add(history)

        db.commit()

        # Build response
        customer = db.query(Customer).filter(Customer.customer_id == loan.customer_id).first()
        txn_data = model_to_dict(txn)
        txn_data["customer_name"] = customer.name if customer else None
        txn_data["loan_status"] = loan.status
        txn_data["wallet_balance"] = float(wallet.balance)

        return success_response(data=txn_data, message="Payment collected successfully"), 201

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@payments_bp.route("/", methods=["GET"])
@require_roles(*_VIEW_ROLES)
def list_payments():
    """
    GET /api/payments/
    ADMIN / MANAGER / ACCOUNTANT. Filtered and paginated list of LOAN_COLLECTION transactions.
    Query params: loan_id, customer_id, date_from (YYYY-MM-DD), date_to, page, per_page.
    """
    current = get_current_user_info()
    org_id = current["org_id"]

    loan_id = request.args.get("loan_id") or None
    customer_id = request.args.get("customer_id") or None
    date_from = parse_date(request.args.get("date_from"))
    date_to = parse_date(request.args.get("date_to"))
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    db = SessionLocal()
    try:
        q = db.query(Transaction, Customer.name.label("customer_name")).join(
            Customer, Customer.customer_id == Transaction.customer_id, isouter=True
        ).filter(
            Transaction.org_id == org_id,
            Transaction.transaction_type == "LOAN_COLLECTION",
        )

        if loan_id:
            q = q.filter(Transaction.loan_id == loan_id)
        if customer_id:
            q = q.filter(Transaction.customer_id == customer_id)
        if date_from:
            q = q.filter(Transaction.transaction_date >= date_from)
        if date_to:
            q = q.filter(Transaction.transaction_date <= date_to)

        total = q.count()
        rows = (
            q.order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        result = []
        for txn, customer_name in rows:
            d = model_to_dict(txn)
            d["customer_name"] = customer_name
            result.append(d)

        return success_response(data=result, total=total, page=page, per_page=per_page)
    finally:
        db.close()
