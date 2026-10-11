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
from core_functions.loan_calc import calculate_loan, calculate_loan_simple, calculate_interest_only_loan
from core_functions.responses import success_response, error_response, model_to_dict, parse_date

loans_bp = Blueprint("loans", __name__, url_prefix="/api/loans")

_FIELD_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_STAFF)
_VIEW_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_STAFF, Config.ROLE_ACCOUNTANT)

_VALID_INTEREST_TYPES = {"FLAT", "REDUCING"}
_VALID_INSTALLMENT_TYPES = {"DAILY", "WEEKLY", "MONTHLY"}
_VALID_LOAN_TYPES = {"PRINCIPAL_INTEREST", "INTEREST_ONLY"}


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

    loan_type = str(data.get("loan_type") or "PRINCIPAL_INTEREST").upper()
    if loan_type not in _VALID_LOAN_TYPES:
        return error_response("loan_type must be 'PRINCIPAL_INTEREST' or 'INTEREST_ONLY'")

    is_interest_only = loan_type == "INTEREST_ONLY"

    # Determine model: simple (collection_amount) or legacy (interest_rate)
    use_simple = data.get("collection_amount") is not None

    if is_interest_only:
        required = ["customer_id", "disbursement_amount", "installment_type", "collection_amount"]
    elif use_simple:
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
        if is_interest_only:
            collection_amount = float(data["collection_amount"])
            num_installments = None
        elif use_simple:
            collection_amount = float(data["collection_amount"])
            num_installments = int(data["num_installments"])
        else:
            interest_type = str(data["interest_type"]).upper()
            annual_rate = float(data["interest_rate"])
            processing_fee = float(data.get("processing_fee") or 0)
            num_installments = int(data["num_installments"])
    except (TypeError, ValueError):
        return error_response("Numeric fields must be valid numbers")

    if principal <= 0:
        return error_response("disbursement_amount must be positive")
    if not is_interest_only and num_installments < 1:
        return error_response("num_installments must be at least 1")
    if (use_simple or is_interest_only) and collection_amount <= 0:
        return error_response("collection_amount must be positive")
    if use_simple and not is_interest_only and collection_amount * num_installments < principal:
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

        # Validate rotation_balance before proceeding — disbursements come from rotation capital
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        wallet_balance = round(float(wallet.rotation_balance or 0), 2) if wallet else 0.0
        if not wallet or wallet_balance < principal:
            return error_response(
                f"Insufficient rotation balance. Available: ₹ {wallet_balance:,.2f}, Required: ₹ {principal:,.2f}",
                400,
            )

        # Calculate schedule
        try:
            if is_interest_only:
                calc = calculate_interest_only_loan(
                    principal=principal,
                    collection_amount=collection_amount,
                    installment_type=installment_type,
                    disbursement_date=disbursement_date,
                )
                num_installments = calc["num_installments"]
            elif use_simple:
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
            loan_type=loan_type,
            disbursement_amount=round(principal, 2),
            interest_type=None if (use_simple or is_interest_only) else interest_type,
            interest_rate=None if (use_simple or is_interest_only) else round(annual_rate, 4),
            processing_fee=0 if (use_simple or is_interest_only) else round(processing_fee, 2),
            disbursement_date=disbursement_date,
            due_date=last_due_date,
            installment_type=installment_type,
            num_installments=num_installments,
            installment_amount=calc["installment_amount"],
            total_payable=calc["total_payable"],
            total_paid=0,
            balance_amount=round(principal),  # tracks outstanding principal only
            status="ACTIVE",
            remarks=data.get("remarks") or "",
            created_by=current["user_id"],
        )
        db.add(loan)
        db.flush()  # get loan_id persisted before adding installments

        installment_objs = []
        if not is_interest_only:
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

        # Deduct disbursement from rotation_balance (wallet already validated above)
        if wallet:
            wallet.rotation_balance = round(float(wallet.rotation_balance or 0) - principal, 2)
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
            loan_data["wallet_invest_balance"]    = round(float(wallet.invest_balance), 2)
            loan_data["wallet_rotation_balance"]  = round(float(wallet.rotation_balance), 2)
            loan_data["wallet_interest_balance"]  = round(float(wallet.interest_balance), 2)

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
        data["payment_count"] = db.query(Transaction).filter(
            Transaction.loan_id == loan_id,
            Transaction.transaction_type == "LOAN_COLLECTION",
        ).count()

        if (loan.loan_type or "") == "INTEREST_ONLY":
            txns = (
                db.query(Transaction)
                .filter(Transaction.loan_id == loan_id, Transaction.transaction_type == "LOAN_COLLECTION")
                .order_by(Transaction.transaction_date.desc())
                .all()
            )
            data["transactions"] = [model_to_dict(t) for t in txns]

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


# ---------------------------------------------------------------------------
# PATCH /{loan_id} — edit loan
# ---------------------------------------------------------------------------

@loans_bp.route("/<string:loan_id>", methods=["PATCH"])
@require_roles(*_FIELD_ROLES)
def update_loan(loan_id):
    """
    PATCH /api/loans/{loan_id}
    Body (all optional): loan_type, disbursement_amount, installment_type, num_installments,
    collection_amount, disbursement_date, interest_type, interest_rate, processing_fee, remarks.

    Rules
    - Closed loans cannot be edited.
    - Principal-with-interest loans that already have collections: only remarks can change
      (use Close / Part-Pay to restructure).
    - Interest-only loans: the loan type is locked once any collection exists and the loan
      amount is locked once principal has been repaid.
    - Otherwise the schedule is regenerated and the wallet rotation balance and the
      disbursement transaction are adjusted for any change in loan amount / date.
    """
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    db = SessionLocal()
    try:
        loan = db.query(Loan).filter(
            Loan.loan_id == loan_id,
            Loan.org_id == current["org_id"],
        ).first()
        if not loan:
            return error_response("Loan not found", 404)
        if loan.status == "CLOSED":
            return error_response("A closed loan cannot be edited")

        old_type = loan.loan_type or "PRINCIPAL_INTEREST"
        old_io = old_type == "INTEREST_ONLY"
        payment_count = db.query(Transaction).filter(
            Transaction.loan_id == loan_id,
            Transaction.transaction_type == "LOAN_COLLECTION",
        ).count()

        new_type = str(data.get("loan_type") or old_type).upper()
        if new_type not in _VALID_LOAN_TYPES:
            return error_response("loan_type must be 'PRINCIPAL_INTEREST' or 'INTEREST_ONLY'")
        is_io = new_type == "INTEREST_ONLY"

        new_itype = str(data.get("installment_type") or loan.installment_type).upper()
        if new_itype not in _VALID_INSTALLMENT_TYPES:
            return error_response("installment_type must be 'DAILY', 'WEEKLY', or 'MONTHLY'")

        raw_date = data.get("disbursement_date")
        if raw_date:
            new_date = parse_date(str(raw_date))
            if not new_date:
                return error_response("disbursement_date must be YYYY-MM-DD")
        else:
            new_date = loan.disbursement_date

        old_interest_type = loan.interest_type
        if "interest_type" in data:
            new_interest_type = (str(data.get("interest_type") or "").upper()) or None
        else:
            new_interest_type = old_interest_type
        if new_interest_type and new_interest_type not in _VALID_INTEREST_TYPES:
            return error_response("interest_type must be 'FLAT' or 'REDUCING'")
        legacy = (not is_io) and bool(new_interest_type)

        try:
            old_principal = round(float(loan.disbursement_amount or 0))
            new_principal = round(float(data.get("disbursement_amount", old_principal)))
            new_coll = round(float(data.get("collection_amount", loan.installment_amount or 0)))
            new_n = int(data.get("num_installments", loan.num_installments or 0) or 0)
            new_rate = float(data.get("interest_rate", loan.interest_rate or 0) or 0)
            new_fee = float(data.get("processing_fee", loan.processing_fee or 0) or 0)
        except (TypeError, ValueError):
            return error_response("Numeric fields must be valid numbers")

        remarks_in = data.get("remarks")
        new_remarks = (str(remarks_in).strip() if remarks_in is not None else loan.remarks) or ""
        new_remarks = new_remarks[:100]

        old_principal_outstanding = round(float(loan.balance_amount or 0))
        principal_repaid = old_io and old_principal_outstanding != old_principal

        # What would actually change structurally?
        type_changed = new_type != old_type
        principal_changed = new_principal != old_principal
        date_changed = new_date != loan.disbursement_date
        itype_changed = new_itype != loan.installment_type
        if old_io:
            terms_changed = round(float(loan.installment_amount or 0)) != new_coll
        else:
            terms_changed = (
                round(float(loan.installment_amount or 0)) != new_coll
                or int(loan.num_installments or 0) != new_n
                or (loan.interest_type or None) != new_interest_type
                or round(float(loan.interest_rate or 0), 4) != round(new_rate, 4)
                or round(float(loan.processing_fee or 0), 2) != round(new_fee, 2)
            )
        structural = type_changed or principal_changed or date_changed or itype_changed or terms_changed

        if structural:
            if not old_io and payment_count > 0:
                return error_response(
                    "This loan already has collections, so only remarks can be edited. "
                    "Use Close / Part-Pay to restructure the remaining schedule."
                )
            if old_io and type_changed and payment_count > 0:
                return error_response("The loan type cannot be changed after collections have been recorded")
            if old_io and principal_changed and principal_repaid:
                return error_response("The loan amount cannot be changed after principal has been repaid")

            if new_principal <= 0:
                return error_response("disbursement_amount must be positive")
            if is_io:
                if new_coll <= 0:
                    return error_response("collection_amount must be positive")
            elif legacy:
                if new_n < 1:
                    return error_response("num_installments must be at least 1")
                if new_rate < 0:
                    return error_response("interest_rate must be non-negative")
            else:
                if new_n < 1:
                    return error_response("num_installments must be at least 1")
                if new_coll <= 0:
                    return error_response("collection_amount must be positive")
                if new_coll * new_n < new_principal:
                    return error_response("Total collections (collection_amount × num_installments) must be >= loan amount")

        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        delta = new_principal - old_principal
        if structural and delta != 0:
            if not wallet:
                return error_response("No wallet found for this organisation", 500)
            available = round(float(wallet.rotation_balance or 0), 2)
            if delta > 0 and available < delta:
                return error_response(
                    f"Insufficient rotation balance for the increase. Available: ₹ {available:,.2f}, Required: ₹ {delta:,.2f}",
                    400,
                )

        installment_objs = []
        if structural:
            try:
                if is_io:
                    calc = calculate_interest_only_loan(
                        principal=new_principal, collection_amount=new_coll,
                        installment_type=new_itype, disbursement_date=new_date,
                    )
                elif legacy:
                    calc = calculate_loan(
                        principal=new_principal, interest_type=new_interest_type, annual_rate=new_rate,
                        installment_type=new_itype, num_installments=new_n, disbursement_date=new_date,
                    )
                else:
                    calc = calculate_loan_simple(
                        principal=new_principal, collection_amount=new_coll,
                        installment_type=new_itype, num_installments=new_n, disbursement_date=new_date,
                    )
            except ValueError as ve:
                return error_response(str(ve))

            schedule = calc["schedule"]
            old_status = loan.status

            if not old_io:
                db.query(LoanInstallment).filter(LoanInstallment.loan_id == loan_id).delete(synchronize_session=False)

            loan.loan_type = new_type
            loan.disbursement_amount = new_principal
            loan.disbursement_date = new_date
            loan.installment_type = new_itype
            loan.num_installments = calc.get("num_installments", new_n) if is_io else new_n
            loan.installment_amount = calc["installment_amount"]
            loan.total_payable = calc["total_payable"]
            loan.due_date = parse_date(schedule[-1]["due_date"])
            if is_io or not legacy:
                loan.interest_type = None
                loan.interest_rate = None
                loan.processing_fee = 0
            else:
                loan.interest_type = new_interest_type
                loan.interest_rate = round(new_rate, 4)
                loan.processing_fee = round(new_fee, 2)
            if not old_io or type_changed or principal_changed:
                loan.balance_amount = new_principal

            if not is_io:
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

            if delta != 0 and wallet:
                wallet.rotation_balance = round(float(wallet.rotation_balance or 0) - delta, 2)
            if delta != 0 or date_changed:
                disb_txn = db.query(Transaction).filter(
                    Transaction.loan_id == loan_id,
                    Transaction.transaction_type == "LOAN_DISBURSEMENT",
                ).first()
                if disb_txn:
                    disb_txn.amount = new_principal
                    disb_txn.transaction_date = new_date

            if loan.status == "OVERDUE" and loan.due_date and loan.due_date >= _now_ist().date():
                loan.status = "ACTIVE"
            if loan.status != old_status:
                db.add(LoanStatusHistory(
                    id=str(uuid.uuid4()),
                    loan_id=loan_id,
                    old_status=old_status,
                    new_status=loan.status,
                    changed_by=current["user_id"],
                    changed_at=_now_ist(),
                    remarks="Loan edited; due date extended",
                ))

        loan.remarks = new_remarks
        db.commit()

        out = model_to_dict(loan)
        out["installments"] = [model_to_dict(i) for i in installment_objs]
        if wallet:
            out["wallet_rotation_balance"] = round(float(wallet.rotation_balance), 2)
        return success_response(data=out, message="Loan updated successfully")

    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()
