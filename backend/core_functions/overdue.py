"""
Single source of truth for "overdue".

A principal-with-interest loan is overdue when it has an unpaid (PENDING / PARTIAL)
installment whose due date is before today. An interest-only (vatti) loan has no
installment rows, so it is overdue when more interest collection periods have
elapsed (due date before today) than interest collections were recorded.
"""
from sqlalchemy import func, or_

from models import Loan, LoanInstallment, Transaction
from core_functions.loan_calc import _get_due_date
from core_functions.timeutil import today_ist

OPEN_STATUSES = ("ACTIVE", "OVERDUE")
PRINCIPAL_REMARK_PREFIX = "Principal repayment"


def _elapsed_periods(disbursement_date, installment_type, today):
    """Number of collection periods whose due date is strictly before today."""
    days = (today - disbursement_date).days
    if days <= 0:
        return 0
    if installment_type == "DAILY":
        return days - 1
    if installment_type == "WEEKLY":
        return (days - 1) // 7
    k = 0
    while _get_due_date(disbursement_date, installment_type, k + 1) < today:
        k += 1
    return k


def interest_paid_counts(db, loan_ids):
    """{loan_id: number of interest collections} for interest-only loans (principal repayments excluded)."""
    if not loan_ids:
        return {}
    rows = (
        db.query(Transaction.loan_id, func.count(Transaction.transaction_id))
        .filter(
            Transaction.loan_id.in_(list(loan_ids)),
            Transaction.transaction_type == "LOAN_COLLECTION",
            or_(Transaction.remarks.is_(None), ~Transaction.remarks.like(PRINCIPAL_REMARK_PREFIX + "%")),
        )
        .group_by(Transaction.loan_id)
        .all()
    )
    return {lid: n for lid, n in rows}


def next_interest_due(loan, paid_count, today=None):
    """
    (due_date, amount) of the next uncollected interest period of an interest-only loan,
    or None when that period is already past (it is overdue, not "due") or the loan has
    no disbursement date. `loan` needs disbursement_date, installment_type, installment_amount.
    """
    today = today or today_ist()
    if not loan.disbursement_date or not loan.installment_type:
        return None
    due = _get_due_date(loan.disbursement_date, loan.installment_type, paid_count + 1)
    if due < today:
        return None
    return due, round(float(loan.installment_amount or 0), 2)


def interest_only_due_periods(db, org_id, today, hi):
    """
    Uncollected interest periods of open interest-only (vatti) loans that fall due within
    [today, hi]. Periods are numbered k = paid_count + 1, paid_count + 2, ...; period k is due
    on _get_due_date(disbursement_date, installment_type, k). Periods before today are overdue
    (see compute_overdue), not "due", so they are not returned.
    Returns a list of {"loan_id", "customer_id", "due_date", "amount"}.
    """
    loans = (
        db.query(Loan)
        .filter(
            Loan.org_id == org_id,
            Loan.status.in_(OPEN_STATUSES),
            Loan.loan_type == "INTEREST_ONLY",
            Loan.disbursement_date.isnot(None),
        )
        .all()
    )
    if not loans:
        return []
    paid = interest_paid_counts(db, [l.loan_id for l in loans])
    out = []
    for loan in loans:
        amount = round(float(loan.installment_amount or 0), 2)
        # first period that is not before today, and not yet collected
        k = max(paid.get(loan.loan_id, 0), _elapsed_periods(loan.disbursement_date, loan.installment_type, today)) + 1
        while True:
            due = _get_due_date(loan.disbursement_date, loan.installment_type, k)
            if due > hi:
                break
            if due >= today:
                out.append({"loan_id": loan.loan_id, "customer_id": loan.customer_id,
                            "due_date": due, "amount": amount})
            k += 1
    return out


def compute_overdue(db, loans, today=None):
    """
    Returns {loan_id: {"count", "amount", "oldest_due", "days"}} for the overdue
    loans among `loans` (ORM Loan objects). Loans that are not overdue are absent.
    """
    today = today or today_ist()
    open_loans = [l for l in loans if l.status in OPEN_STATUSES]
    result = {}

    pi_ids = [l.loan_id for l in open_loans if (l.loan_type or "PRINCIPAL_INTEREST") != "INTEREST_ONLY"]
    if pi_ids:
        rows = (
            db.query(
                LoanInstallment.loan_id,
                func.count(LoanInstallment.installment_id),
                func.sum(LoanInstallment.balance_amount),
                func.min(LoanInstallment.due_date),
            )
            .filter(
                LoanInstallment.loan_id.in_(pi_ids),
                LoanInstallment.status.in_(["PENDING", "PARTIAL"]),
                LoanInstallment.due_date < today,
            )
            .group_by(LoanInstallment.loan_id)
            .all()
        )
        for loan_id, cnt, amt, oldest in rows:
            result[loan_id] = {
                "count": cnt,
                "amount": round(float(amt or 0), 2),
                "oldest_due": oldest,
                "days": (today - oldest).days if oldest else 0,
            }

    io_loans = [l for l in open_loans if (l.loan_type or "") == "INTEREST_ONLY" and l.disbursement_date]
    if io_loans:
        paid = interest_paid_counts(db, [l.loan_id for l in io_loans])
        for loan in io_loans:
            elapsed = _elapsed_periods(loan.disbursement_date, loan.installment_type, today)
            missed = elapsed - paid.get(loan.loan_id, 0)
            if missed > 0:
                oldest = _get_due_date(loan.disbursement_date, loan.installment_type, paid.get(loan.loan_id, 0) + 1)
                result[loan.loan_id] = {
                    "count": missed,
                    "amount": round(missed * float(loan.installment_amount or 0), 2),
                    "oldest_due": oldest,
                    "days": (today - oldest).days,
                }
    return result


def overdue_fields(info):
    """API fields for a loan, given its entry from compute_overdue (or None)."""
    if not info:
        return {"is_overdue": False, "overdue_amount": 0, "overdue_installments": 0, "days_overdue": 0}
    return {
        "is_overdue": True,
        "overdue_amount": info["amount"],
        "overdue_installments": info["count"],
        "days_overdue": info["days"],
    }


def sync_overdue_status(db, org_id):
    """
    Bring Loan.status in line with the real overdue state, in both directions
    (ACTIVE -> OVERDUE and OVERDUE -> ACTIVE). Returns the number of loans changed.
    """
    loans = db.query(Loan).filter(Loan.org_id == org_id, Loan.status.in_(OPEN_STATUSES)).all()
    if not loans:
        return 0
    overdue = compute_overdue(db, loans)
    changed = 0
    for loan in loans:
        should = loan.loan_id in overdue
        if should and loan.status != "OVERDUE":
            loan.status = "OVERDUE"
            changed += 1
        elif not should and loan.status == "OVERDUE":
            loan.status = "ACTIVE"
            changed += 1
    if changed:
        db.commit()
    return changed
