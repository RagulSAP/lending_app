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
        paid_rows = (
            db.query(Transaction.loan_id, func.count(Transaction.transaction_id))
            .filter(
                Transaction.loan_id.in_([l.loan_id for l in io_loans]),
                Transaction.transaction_type == "LOAN_COLLECTION",
                or_(Transaction.remarks.is_(None), ~Transaction.remarks.like(PRINCIPAL_REMARK_PREFIX + "%")),
            )
            .group_by(Transaction.loan_id)
            .all()
        )
        paid = {lid: n for lid, n in paid_rows}
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
