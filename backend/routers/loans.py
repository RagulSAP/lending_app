"""
Loan management routes.
Blueprint prefix: /api/loans
"""
import uuid
from datetime import datetime, timezone, timedelta

_IST = timezone(timedelta(hours=5, minutes=30))
def _now_ist(): return datetime.now(_IST).replace(tzinfo=None)

from flask import Blueprint, request

from database import SessionLocal
from models import Customer, Loan, LoanInstallment, LoanStatusHistory, Wallet, Transaction
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.loan_calc import calculate_loan, calculate_loan_simple
from core_functions.responses import success_response, error_response, model_to_dict, parse_date

loans_bp = Blueprint("loans", __name__, url_prefix="/api/loans")

_FIELD_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_STAFF)
_VIEW_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_STAFF, Config.ROLE_ACCOUNTANT)

_VALID_INTEREST_TYPES = {"FLAT", "REDUCING"}
_VALID_INSTALLMENT_TYPES = {"DAILY", "WEEKLY", "MONTHLY"}


# ---------------------------------------------------------------------------
# POST / — create loan
# ---------------------------------------------------------------------------

@loans_bp.route("/", methods=["POST"])
@require_roles(*_FIELD_ROLES)
def create_loan():
    """
    POST /api/loans/
    Body: {customer_id, disbursement_amount, interest_type, interest_rate,
           processing_fee, disbursement_date, installment_type, num_installments, remarks}
    Calculates the amortisation schedule and inserts Loan + all LoanInstallments atomically.
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    # Determine model: simple (collection_amount) or legacy (interest_rate)
    use_simple = data.get("collection_amount") is not None

    if use_simple:
        required = ["customer_id", "disbursement_amount", "installment_type",
                    "num_installments", "collection_amount"]
    else:
        required = ["customer_id", "disbursement_amount", "interest_type",
                    "interest_rate", "disbursement_date", "installment_type", "num_installments"]

    missing = [f for f in required if data.get(f) is None]
    if missing:
        return error_response(f"Missing required fields: {', '.join(missing)}")

    installment_type = str(data["installment_type"]).upper()
    if installment_type not in _VALID_INSTALLMENT_TYPES:
        return error_response("installment_type must be 'DAILY', 'WEEKLY', or 'MONTHLY'")

    try:
        principal = float(data["disbursement_amount"])
        num_installments = int(data["num_installments"])
        if use_simple:
            collection_amount = float(data["collection_amount"])
        else:
            interest_type = str(data["interest_type"]).upper()
            annual_rate = float(data["interest_rate"])
            processing_fee = float(data.get("processing_fee") or 0)
    except (TypeError, ValueError):
        return error_response("Numeric fields must be valid numbers")

    if principal <= 0:
        return error_response("disbursement_amount must be positive")
    if num_installments < 1:
        return error_response("num_installments must be at least 1")
    if use_simple and collection_amount <= 0:
        return error_response("collection_amount must be positive")
    if use_simple and collection_amount * num_installments < principal:
        return error_response("Total collections (collection_amount × num_installments) must be >= loan amount")

    # Disbursement date: use provided or default to today (IST)
    raw_date = data.get("disbursement_date")
    if raw_date:
        disbursement_date = parse_date(str(raw_date))
        if not disbursement_date:
            return error_response("disbursement_date must be YYYY-MM-DD")
    else:
        disbursement_date = _now_ist().date()

    if not use_simple:
        if interest_type not in _VALID_INTEREST_TYPES:
            return error_response("interest_type must be 'FLAT' or 'REDUCING'")
        if annual_rate < 0:
            return error_response("interest_rate must be non-negative")

    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(
            Customer.customer_id == data["customer_id"],
            Customer.org_id == current["org_id"],
        ).first()
        if not customer:
            return error_response("Customer not found", 404)
        if customer.status != "ACTIVE":
            return error_response("Cannot disburse loan to an inactive customer")

        # Validate wallet balance before proceeding
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        wallet_balance = round(float(wallet.balance or 0), 2) if wallet else 0.0
        if not wallet or wallet_balance < principal:
            return error_response(
                f"Insufficient wallet balance. Available: ₹ {wallet_balance:,.2f}, Required: ₹ {principal:,.2f}",
                400,
            )

        # Calculate schedule
        try:
            if use_simple:
                calc = calculate_loan_simple(
                    principal=principal,
                    collection_amount=collection_amount,
                    installment_type=installment_type,
                    num_installments=num_installments,
                    disbursement_date=disbursement_date,
                )
            else:
                calc = calculate_loan(
                    principal=principal,
                    interest_type=interest_type,
                    annual_rate=annual_rate,
                    installment_type=installment_type,
                    num_installments=num_installments,
                    disbursement_date=disbursement_date,
                )
        except ValueError as ve:
            return error_response(str(ve))

        schedule = calc["schedule"]
        last_due_date = parse_date(schedule[-1]["due_date"])

        loan_id = str(uuid.uuid4())
        loan = Loan(
            loan_id=loan_id,
            customer_id=customer.customer_id,
            org_id=current["org_id"],
            disbursement_amount=round(principal, 2),
            interest_type=None if use_simple else interest_type,
            interest_rate=None if use_simple else round(annual_rate, 4),
            processing_fee=0 if use_simple else round(processing_fee, 2),
            disbursement_date=disbursement_date,
            due_date=last_due_date,
            installment_type=installment_type,
            num_installments=num_installments,
            installment_amount=calc["installment_amount"],
            total_payable=calc["total_payable"],
            total_paid=0,
            balance_amount=calc["total_payable"],
            status="ACTIVE",
            remarks=data.get("remarks") or "",
            created_by=current["user_id"],
        )
        db.add(loan)
        db.flush()  # get loan_id persisted before adding installments

        installment_objs = []
        for item in schedule:
            inst = LoanInstallment(
                installment_id=str(uuid.uuid4()),
                loan_id=loan_id,
                installment_number=item["installment_number"],
                due_date=parse_date(item["due_date"]),
                principal_amount=round(item["principal_amount"], 2),
                interest_amount=round(item["interest_amount"], 2),
                penalty_amount=0,
                total_amount=round(item["total_amount"], 2),
                paid_amount=0,
                balance_amount=round(item["total_amount"], 2),
                status="PENDING",
                paid_date=None,
            )
            db.add(inst)
            installment_objs.append(inst)

        # Record initial status in history
        history = LoanStatusHistory(
            id=str(uuid.uuid4()),
            loan_id=loan_id,
            old_status=None,
            new_status="ACTIVE",
            changed_by=current["user_id"],
            changed_at=_now_ist(),
            remarks="Loan disbursed",
        )
        db.add(history)

        # Deduct disbursement from wallet (wallet already validated above)
        if wallet:
            wallet.balance = round(float(wallet.balance or 0) - principal, 2)
            disbursement_txn = Transaction(
                transaction_id=str(uuid.uuid4()),
                loan_id=loan_id,
                customer_id=customer.customer_id,
                user_id=current["user_id"],
                org_id=current["org_id"],
                transaction_type="LOAN_DISBURSEMENT",
                transaction_date=disbursement_date,
                amount=round(principal, 2),
                wallet_id=wallet.wallet_id,
            )
            db.add(disbursement_txn)

        db.commit()

        loan_data = model_to_dict(loan)
        loan_data["installments"] = [model_to_dict(i) for i in installment_objs]
        loan_data["total_interest"] = calc["total_interest"]
        if wallet:
            loan_data["wallet_balance"] = float(wallet.balance)

        return success_response(data=loan_data, message="Loan created successfully"), 201

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET /{loan_id} — loan detail with installments
# ---------------------------------------------------------------------------

@loans_bp.route("/<string:loan_id>", methods=["GET"])
@require_roles(*_VIEW_ROLES)
def get_loan(loan_id):
    """GET /api/loans/{loan_id} — Full loan details with all installments."""
    current = get_current_user_info()
    db = SessionLocal()
    try:
        loan = db.query(Loan).filter(
            Loan.loan_id == loan_id,
            Loan.org_id == current["org_id"],
        ).first()
        if not loan:
            return error_response("Loan not found", 404)

        installments = (
            db.query(LoanInstallment)
            .filter(LoanInstallment.loan_id == loan_id)
            .order_by(LoanInstallment.installment_number)
            .all()
        )

        customer = db.query(Customer).filter(
            Customer.customer_id == loan.customer_id
        ).first()

        data = model_to_dict(loan)
        data["customer_name"] = customer.name if customer else None
        data["customer_phone"] = customer.phone if customer else None
        data["installments"] = [model_to_dict(i) for i in installments]

        return success_response(data=data)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET /customer/{customer_id} — all loans for a customer
# ---------------------------------------------------------------------------

@loans_bp.route("/customer/<string:customer_id>", methods=["GET"])
@require_roles(*_VIEW_ROLES)
def get_customer_loans(customer_id):
    """GET /api/loans/customer/{customer_id} — Summary list of all loans for a customer."""
    current = get_current_user_info()
    db = SessionLocal()
    try:
        # Verify customer is in the same org
        customer = db.query(Customer).filter(
            Customer.customer_id == customer_id,
            Customer.org_id == current["org_id"],
        ).first()
        if not customer:
            return error_response("Customer not found", 404)

        loans = (
            db.query(Loan)
            .filter(Loan.customer_id == customer_id, Loan.org_id == current["org_id"])
            .order_by(Loan.disbursement_date.desc())
            .all()
        )

        return success_response(
            data=[model_to_dict(l) for l in loans],
            total=len(loans),
        )
    finally:
        db.close()
