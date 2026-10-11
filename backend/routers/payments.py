"""
Payment collection routes.
Blueprint prefix: /api/payments
"""
import uuid
from datetime import date, datetime, timedelta

from flask import Blueprint, request

from database import SessionLocal
from models import Loan, LoanInstallment, Transaction, Wallet, Customer, LoanStatusHistory
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response, model_to_dict, parse_date
from core_functions.loan_calc import _get_due_date
from core_functions.timeutil import today_ist

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")

_COLLECT_ROLES = (
    Config.ROLE_ADMIN,
    Config.ROLE_MANAGER,
    Config.ROLE_STAFF,
    Config.ROLE_COLLECTOR,
)
_VIEW_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_ACCOUNTANT)

_VALID_PAYMENT_MODES = {"CASH", "UPI", "BANK_TRANSFER", "CHEQUE"}

# Interest-only loans have no installment rows, so a principal repayment is
# recognised by this prefix on the transaction remarks.
PRINCIPAL_REMARK_TAG = "Principal repayment"


@payments_bp.route("/collect", methods=["POST"])
@require_roles(*_COLLECT_ROLES)
def collect_payment():
    """
    POST /api/payments/collect
    Body: {loan_id, installment_id, amount, payment_mode, remarks, transaction_date}
    Interest-only loans also accept:
      collection_type: "INTEREST" (default) | "PRINCIPAL"
      new_interest_amount: updated interest per collection (partial principal repayment)
      confirm_close: true — required when the principal repayment clears the loan

    Flow:
    1. Load and validate installment (belongs to loan, belongs to org).
    2. Validate amount <= installment balance.
    3. Update installment (paid_amount, balance_amount, status, paid_date).
    4. Update loan (total_paid, balance_amount, status → CLOSED if fully paid).
    5. Credit wallet (invest_balance + interest_balance split).
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

    collection_type = (data.get("collection_type") or "INTEREST").strip().upper()
    if collection_type not in ("INTEREST", "PRINCIPAL"):
        return error_response("collection_type must be 'INTEREST' or 'PRINCIPAL'")
    is_principal = collection_type == "PRINCIPAL"
    new_interest_amount = None
    if data.get("new_interest_amount") not in (None, ""):
        try:
            new_interest_amount = float(data["new_interest_amount"])
        except (TypeError, ValueError):
            return error_response("new_interest_amount must be a number")
        if new_interest_amount <= 0:
            return error_response("new_interest_amount must be greater than zero")

    txn_date_str = data.get("transaction_date")
    txn_date = parse_date(str(txn_date_str)) if txn_date_str else today_ist()
    if not txn_date:
        return error_response("transaction_date must be in YYYY-MM-DD format")

    db = SessionLocal()
    try:
        # Load loan + customer in one go (customer is needed for the response)
        loan = db.query(Loan).filter(
            Loan.loan_id == loan_id,
            Loan.org_id == current["org_id"],
        ).first()
        if not loan:
            return error_response("Loan not found", 404)
        if loan.status == "CLOSED":
            return error_response("Loan is already closed")

        is_interest_only = (loan.loan_type or "PRINCIPAL_INTEREST") == "INTEREST_ONLY"

        if not installment_id and not is_interest_only:
            return error_response("installment_id is required")
        if is_principal and not is_interest_only:
            return error_response("Principal collection is only available for interest-only loans")

        loan_closed_now = False
        if is_principal:
            outstanding = round(float(loan.balance_amount or 0))
            if amount != round(amount):
                return error_response("Principal amount must be a whole number")
            amount = round(amount)
            if amount > outstanding:
                return error_response(
                    f"Principal amount ({amount:,.0f}) exceeds outstanding principal ({outstanding:,.0f})"
                )
            loan_closed_now = amount == outstanding
            if loan_closed_now and not data.get("confirm_close"):
                return error_response("Confirmation is required to close the loan")
            if not loan_closed_now and new_interest_amount is not None:
                new_interest_amount = round(new_interest_amount)

        customer = db.query(Customer).filter(Customer.customer_id == loan.customer_id).first()

        installment = None
        if installment_id:
            # Load installment
            installment = db.query(LoanInstallment).filter(
                LoanInstallment.installment_id == installment_id,
                LoanInstallment.loan_id == loan_id,
            ).first()
            if not installment:
                return error_response("Installment not found", 404)
            if installment.status == "PAID":
                return error_response("Installment is already fully paid")

            # Duplicate-submission guard
            recent_cutoff = datetime.utcnow() - timedelta(seconds=30)
            duplicate = db.query(Transaction).filter(
                Transaction.installment_id == installment_id,
                Transaction.transaction_type == "LOAN_COLLECTION",
                Transaction.created_at >= recent_cutoff,
            ).first()
            if duplicate:
                return error_response("A payment for this installment was just recorded. Please wait before retrying.")

            current_balance = float(installment.balance_amount or 0)
            if amount > current_balance + 0.005:
                return error_response(
                    f"Amount ({amount:.2f}) exceeds installment balance ({current_balance:.2f})"
                )

            # 3. Update installment
            new_paid = round(float(installment.paid_amount or 0) + amount, 2)
            new_balance = round(current_balance - amount, 2)
            if new_balance <= 0.005:
                new_balance = 0.0
                installment.status = "PAID"
                installment.paid_date = txn_date
            else:
                installment.status = "PARTIAL"
            installment.paid_amount = new_paid
            installment.balance_amount = new_balance

        # 4. Update loan
        old_loan_status = loan.status
        loan.total_paid = round(float(loan.total_paid or 0) + amount, 2)
        if is_principal:
            loan.balance_amount = outstanding - amount
            if loan_closed_now:
                loan.status = "CLOSED"
            elif new_interest_amount is not None:
                loan.installment_amount = new_interest_amount
        elif not is_interest_only and installment:
            # Reduce outstanding principal by the principal portion of this payment only
            total_inst = float(installment.total_amount or 1)
            principal_portion = round(amount * float(installment.principal_amount or 0) / total_inst)
            loan.balance_amount = round(float(loan.balance_amount or 0) - principal_portion)
            if loan.balance_amount <= 0:
                loan.balance_amount = 0
                loan.status = "CLOSED"

        # 5. Credit wallet
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        if not wallet:
            return error_response("No wallet found for this organisation", 500)
        if is_principal:
            interest_portion = 0.0  # principal repayment carries no interest
        elif is_interest_only:
            interest_portion = round(amount, 2)  # 100% interest for interest-only loans
        else:
            total_inst = float(installment.total_amount or 1)
            interest_portion = round(amount * float(installment.interest_amount or 0) / total_inst, 2)
        wallet.rotation_balance = round(float(wallet.rotation_balance or 0) + amount,           2)
        wallet.interest_balance = round(float(wallet.interest_balance or 0) + interest_portion, 2)

        # 6. Insert transaction
        txn_remarks = remarks
        if is_principal:
            txn_remarks = f"{PRINCIPAL_REMARK_TAG} - {remarks}" if remarks else PRINCIPAL_REMARK_TAG
            if loan_closed_now:
                txn_remarks = (txn_remarks + " (loan closed)")[:225]
        txn = Transaction(
            transaction_id=str(uuid.uuid4()),
            loan_id=loan_id,
            customer_id=loan.customer_id,
            installment_id=installment_id or None,
            user_id=current["user_id"],
            org_id=current["org_id"],
            transaction_type="LOAN_COLLECTION",
            transaction_date=txn_date,
            amount=round(amount, 2),
            payment_mode=payment_mode,
            wallet_id=wallet.wallet_id,
            remarks=txn_remarks,
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
                remarks="Principal repaid in full" if is_principal else "Loan fully repaid",
            )
            db.add(history)

        db.commit()

        txn_data = model_to_dict(txn)
        txn_data["customer_name"] = customer.name if customer else None
        txn_data["loan_status"] = loan.status
        txn_data["loan_balance_amount"] = round(float(loan.balance_amount or 0))
        txn_data["loan_installment_amount"] = round(float(loan.installment_amount or 0), 2)
        txn_data["wallet_invest_balance"]    = round(float(wallet.invest_balance), 2)
        txn_data["wallet_rotation_balance"]  = round(float(wallet.rotation_balance), 2)
        txn_data["wallet_interest_balance"]  = round(float(wallet.interest_balance), 2)

        return success_response(data=txn_data, message="Loan closed successfully" if loan_closed_now else "Payment collected successfully"), 201

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


_PI_PRINCIPAL_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_STAFF)
FORECLOSE_REMARK_TAG = "Loan foreclosure"
PART_PAY_REMARK_TAG = "Principal part-payment"


@payments_bp.route("/principal-payment", methods=["POST"])
@require_roles(*_PI_PRINCIPAL_ROLES)
def principal_payment():
    """
    POST /api/payments/principal-payment
    Principal-with-interest loans only. The customer repays some or all of the
    outstanding principal, optionally together with an interest amount.

    Body: {loan_id, principal_amount, payment_mode, transaction_date, remarks,
           confirm_close, new_num_installments, new_installment_amount, first_due_date}

    - principal_amount == outstanding principal (or omitted): the loan is closed
      (foreclosure) and every unpaid installment is closed. confirm_close is required.
    - principal_amount < outstanding principal: the unpaid installments are replaced
      by a new schedule of new_num_installments installments for the remaining
      principal. Each installment collects new_installment_amount (principal share
      plus interest), starting on first_due_date.
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    loan_id = data.get("loan_id") or ""
    payment_mode = (data.get("payment_mode") or "").strip().upper()
    remarks = (data.get("remarks") or "").strip()

    if not loan_id:
        return error_response("loan_id is required")
    if payment_mode not in _VALID_PAYMENT_MODES:
        return error_response(f"payment_mode must be one of: {', '.join(sorted(_VALID_PAYMENT_MODES))}")

    def _whole(name, raw, default=None):
        if raw in (None, ""):
            if default is None:
                raise ValueError(f"{name} is required")
            return default
        try:
            val = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be a number")
        if val < 0:
            raise ValueError(f"{name} cannot be negative")
        if val != round(val):
            raise ValueError(f"{name} must be a whole number")
        return int(round(val))

    try:
        interest_amount = _whole("interest_amount", data.get("interest_amount"), default=0)
        principal_raw = data.get("principal_amount")
        principal_amount = _whole("principal_amount", principal_raw) if principal_raw not in (None, "") else None
    except ValueError as ve:
        return error_response(str(ve))

    txn_date_str = data.get("transaction_date")
    txn_date = parse_date(str(txn_date_str)) if txn_date_str else today_ist()
    if not txn_date:
        return error_response("transaction_date must be in YYYY-MM-DD format")

    db = SessionLocal()
    try:
        loan = db.query(Loan).filter(
            Loan.loan_id == loan_id,
            Loan.org_id == current["org_id"],
        ).first()
        if not loan:
            return error_response("Loan not found", 404)
        if loan.status == "CLOSED":
            return error_response("Loan is already closed")
        if (loan.loan_type or "PRINCIPAL_INTEREST") == "INTEREST_ONLY":
            return error_response("Use principal collection for an interest-only loan")

        outstanding = round(float(loan.balance_amount or 0))
        if principal_amount is None:
            principal_amount = outstanding
        if principal_amount < 1 and outstanding > 0:
            return error_response("principal_amount must be at least 1")
        if principal_amount > outstanding:
            return error_response(
                f"Principal amount ({principal_amount:,}) exceeds outstanding principal ({outstanding:,})"
            )
        is_full = principal_amount == outstanding
        if is_full and not data.get("confirm_close"):
            return error_response("Confirmation is required to close the loan")

        amount = principal_amount + interest_amount
        if amount <= 0:
            return error_response("Amount must be greater than zero")

        new_schedule = []
        if not is_full:
            try:
                new_n = _whole("new_num_installments", data.get("new_num_installments"))
                new_amount = _whole("new_installment_amount", data.get("new_installment_amount"))
            except ValueError as ve:
                return error_response(str(ve))
            if new_n < 1 or new_n > 1000:
                return error_response("new_num_installments must be between 1 and 1000")
            first_due = parse_date(str(data.get("first_due_date") or ""))
            if not first_due:
                return error_response("first_due_date is required (YYYY-MM-DD)")

            remaining = outstanding - principal_amount
            base = remaining // new_n
            last_principal = remaining - base * (new_n - 1)
            if new_amount < 1 or new_amount < last_principal:
                return error_response(
                    f"Amount per installment must be at least {max(last_principal, 1):,} to cover the remaining principal"
                )
            for k in range(1, new_n + 1):
                p_k = base if k < new_n else last_principal
                new_schedule.append({
                    "number": k,
                    "due_date": _get_due_date(first_due, loan.installment_type, k - 1),
                    "principal": p_k,
                    "interest": new_amount - p_k,
                    "total": new_amount,
                })

        customer = db.query(Customer).filter(Customer.customer_id == loan.customer_id).first()
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        if not wallet:
            return error_response("No wallet found for this organisation", 500)

        old_loan_status = loan.status
        all_installments = db.query(LoanInstallment).filter(LoanInstallment.loan_id == loan_id).all()
        max_number = max([i.installment_number for i in all_installments] or [0])
        paid_count = sum(1 for i in all_installments if i.status == "PAID")

        # Supersede every unpaid installment
        for inst in all_installments:
            if inst.status in ("PENDING", "PARTIAL"):
                inst.status = "CLOSED"
                inst.balance_amount = 0

        loan.total_paid = round(float(loan.total_paid or 0) + amount, 2)
        loan.balance_amount = outstanding - principal_amount

        if is_full:
            loan.status = "CLOSED"
            tag = FORECLOSE_REMARK_TAG
            history_remark = "Loan foreclosed"
        else:
            for row in new_schedule:
                db.add(LoanInstallment(
                    installment_id=str(uuid.uuid4()),
                    loan_id=loan_id,
                    installment_number=max_number + row["number"],
                    due_date=row["due_date"],
                    principal_amount=row["principal"],
                    interest_amount=row["interest"],
                    penalty_amount=0,
                    total_amount=row["total"],
                    paid_amount=0,
                    balance_amount=row["total"],
                    status="PENDING",
                    paid_date=None,
                ))
            loan.num_installments = paid_count + len(new_schedule)
            loan.installment_amount = new_schedule[0]["total"]
            loan.due_date = new_schedule[-1]["due_date"]
            loan.total_payable = round(float(loan.total_paid or 0) + sum(r["total"] for r in new_schedule), 2)
            if loan.status == "OVERDUE" and loan.due_date >= txn_date:
                loan.status = "ACTIVE"
            tag = PART_PAY_REMARK_TAG
            history_remark = "Principal part-payment; schedule revised"

        wallet.rotation_balance = round(float(wallet.rotation_balance or 0) + amount, 2)
        wallet.interest_balance = round(float(wallet.interest_balance or 0) + interest_amount, 2)

        txn_remarks = f"{tag} - {remarks}" if remarks else tag
        txn = Transaction(
            transaction_id=str(uuid.uuid4()),
            loan_id=loan_id,
            customer_id=loan.customer_id,
            installment_id=None,
            user_id=current["user_id"],
            org_id=current["org_id"],
            transaction_type="LOAN_COLLECTION",
            transaction_date=txn_date,
            amount=round(amount, 2),
            payment_mode=payment_mode,
            wallet_id=wallet.wallet_id,
            remarks=txn_remarks[:225],
        )
        db.add(txn)
        if loan.status != old_loan_status or is_full:
            db.add(LoanStatusHistory(
                id=str(uuid.uuid4()),
                loan_id=loan_id,
                old_status=old_loan_status,
                new_status=loan.status,
                changed_by=current["user_id"],
                remarks=history_remark,
            ))
        db.commit()

        txn_data = model_to_dict(txn)
        txn_data["customer_name"] = customer.name if customer else None
        txn_data["loan_status"] = loan.status
        txn_data["principal_amount"] = principal_amount
        txn_data["interest_amount"] = interest_amount
        txn_data["remaining_principal"] = round(float(loan.balance_amount or 0))
        txn_data["wallet_invest_balance"]    = round(float(wallet.invest_balance), 2)
        txn_data["wallet_rotation_balance"]  = round(float(wallet.rotation_balance), 2)
        txn_data["wallet_interest_balance"]  = round(float(wallet.interest_balance), 2)
        return success_response(
            data=txn_data,
            message="Loan closed successfully" if is_full else "Part-payment recorded and schedule updated",
        ), 201

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
