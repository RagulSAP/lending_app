"""
Loan calculation engine: EMI / flat-rate schedule generation.
"""
from datetime import date, timedelta


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _add_months(dt: date, months: int) -> date:
    """Add an integer number of months to a date, clamping to month-end."""
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    # Days in target month (handle Feb + leap year)
    days_in_month = [31, 28 + (1 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 0),
                     31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    day = min(dt.day, days_in_month[month - 1])
    return date(year, month, day)


def _get_due_date(disbursement_date: date, installment_type: str, i: int) -> date:
    """Compute the due date for the i-th installment (1-based)."""
    if installment_type == "DAILY":
        return disbursement_date + timedelta(days=i)
    if installment_type == "WEEKLY":
        return disbursement_date + timedelta(weeks=i)
    if installment_type == "MONTHLY":
        return _add_months(disbursement_date, i)
    raise ValueError(f"Unknown installment_type: {installment_type}")


def _periods_per_year(installment_type: str) -> int:
    return {"MONTHLY": 12, "WEEKLY": 52, "DAILY": 365}[installment_type]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_loan(
    principal: float,
    interest_type: str,
    annual_rate: float,
    installment_type: str,
    num_installments: int,
    disbursement_date: date,
) -> dict:
    """
    Calculate the full loan schedule.

    Args:
        principal: Loan amount (disbursement_amount).
        interest_type: 'FLAT' or 'REDUCING'.
        annual_rate: Annual interest rate as a percentage (e.g. 18 for 18 %).
        installment_type: 'DAILY', 'WEEKLY', or 'MONTHLY'.
        num_installments: Total number of payment periods.
        disbursement_date: The date the loan is disbursed.

    Returns dict with keys:
        installment_amount: float — EMI (REDUCING) or flat instalment.
        total_interest: float
        total_payable: float — principal + total_interest
        schedule: list of dicts with keys:
            installment_number, due_date (ISO str), principal_amount,
            interest_amount, total_amount, balance_amount
    """
    n = num_installments
    period_rate = (annual_rate / 100.0) / _periods_per_year(installment_type)

    if interest_type == "FLAT":
        total_interest = round(principal * period_rate * n)
        raw_emi = (principal + total_interest) / n
        installment_amount = round(raw_emi)
        per_principal = round(principal / n)
        per_interest = round(total_interest / n)

        schedule = []
        balance = round(principal)
        cumulative_principal = 0
        cumulative_interest = 0

        for i in range(1, n + 1):
            due = _get_due_date(disbursement_date, installment_type, i)
            if i < n:
                p = per_principal
                it = per_interest
            else:
                # Last period: absorb rounding dust
                p = round(principal) - cumulative_principal
                it = total_interest - cumulative_interest
            total = p + it
            balance = max(balance - p, 0)
            schedule.append({
                "installment_number": i,
                "due_date": due.isoformat(),
                "principal_amount": p,
                "interest_amount": it,
                "total_amount": total,
                "balance_amount": balance,
            })
            cumulative_principal += p
            cumulative_interest += it

        return {
            "installment_amount": installment_amount,
            "total_interest": total_interest,
            "total_payable": round(principal) + total_interest,
            "schedule": schedule,
        }

    elif interest_type == "REDUCING":
        if period_rate > 0:
            factor = (1 + period_rate) ** n
            emi = round(principal * period_rate * factor / (factor - 1))
        else:
            emi = round(principal / n)

        schedule = []
        balance = round(principal)
        total_interest_acc = 0

        for i in range(1, n + 1):
            due = _get_due_date(disbursement_date, installment_type, i)
            interest = round(balance * period_rate)
            if i == n:
                # Last period: pay off remaining balance exactly
                p = balance
                period_total = p + interest
            else:
                p = emi - interest
                period_total = emi
            balance_after = max(balance - p, 0)
            schedule.append({
                "installment_number": i,
                "due_date": due.isoformat(),
                "principal_amount": p,
                "interest_amount": interest,
                "total_amount": period_total,
                "balance_amount": balance_after,
            })
            total_interest_acc += interest
            balance = balance_after

        return {
            "installment_amount": emi,
            "total_interest": total_interest_acc,
            "total_payable": round(principal) + total_interest_acc,
            "schedule": schedule,
        }

    else:
        raise ValueError(f"Unknown interest_type: {interest_type}")


def calculate_loan_simple(
    principal: float,
    collection_amount: float,
    installment_type: str,
    num_installments: int,
    disbursement_date: date,
) -> dict:
    """
    Simple loan model: borrower receives `principal`, pays `collection_amount`
    each period for `num_installments` periods.
    Interest is implicit: total_payable - principal.
    """
    n = num_installments
    coll = round(collection_amount)
    princ = round(principal)
    total_payable = coll * n
    total_interest = total_payable - princ

    per_principal = round(princ / n)
    schedule = []
    balance = princ
    cumulative_principal = 0

    for i in range(1, n + 1):
        due = _get_due_date(disbursement_date, installment_type, i)
        if i < n:
            p = per_principal
        else:
            p = princ - cumulative_principal
        it = coll - p
        balance = max(balance - p, 0)
        schedule.append({
            "installment_number": i,
            "due_date": due.isoformat(),
            "principal_amount": p,
            "interest_amount": it,
            "total_amount": coll,
            "balance_amount": balance,
        })
        cumulative_principal += p

    return {
        "installment_amount": coll,
        "total_interest": total_interest,
        "total_payable": total_payable,
        "schedule": schedule,
    }


def calculate_interest_only_loan(
    principal: float,
    collection_amount: float,
    installment_type: str,
    disbursement_date: date,
) -> dict:
    """
    Interest-only loan: borrower pays only interest each period.
    Principal is a balloon payment recovered separately at loan closure.
    Generates a default initial batch of installments:
      MONTHLY → 12, WEEKLY → 52, DAILY → 30.
    """
    _DEFAULT = {"MONTHLY": 12, "WEEKLY": 52, "DAILY": 30}
    n = _DEFAULT.get(installment_type, 12)

    coll = round(collection_amount)
    princ = round(principal)
    schedule = []
    for i in range(1, n + 1):
        due = _get_due_date(disbursement_date, installment_type, i)
        schedule.append({
            "installment_number": i,
            "due_date": due.isoformat(),
            "principal_amount": 0,
            "interest_amount": coll,
            "total_amount": coll,
            "balance_amount": princ,
        })

    return {
        "installment_amount": coll,
        "total_interest": 0,
        "total_payable": princ,
        "num_installments": n,
        "schedule": schedule,
    }


def get_num_installments(installment_type: str, disbursement_date: date, due_date: date) -> int:
    """
    Calculate the number of installments from the date range.
    Useful when the caller provides a final due_date instead of a count.
    """
    delta = due_date - disbursement_date
    if installment_type == "DAILY":
        return max(delta.days, 1)
    if installment_type == "WEEKLY":
        return max(delta.days // 7, 1)
    if installment_type == "MONTHLY":
        months = (due_date.year - disbursement_date.year) * 12 + (due_date.month - disbursement_date.month)
        return max(months, 1)
    raise ValueError(f"Unknown installment_type: {installment_type}")
