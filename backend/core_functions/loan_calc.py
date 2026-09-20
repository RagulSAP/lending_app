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
        total_interest = round(principal * period_rate * n, 2)
        raw_emi = (principal + total_interest) / n
        installment_amount = round(raw_emi, 2)
        per_principal = round(principal / n, 2)
        per_interest = round(total_interest / n, 2)

        schedule = []
        balance = principal
        cumulative_principal = 0.0
        cumulative_interest = 0.0

        for i in range(1, n + 1):
            due = _get_due_date(disbursement_date, installment_type, i)
            if i < n:
                p = per_principal
                it = per_interest
            else:
                # Last period: absorb rounding dust
                p = round(principal - cumulative_principal, 2)
                it = round(total_interest - cumulative_interest, 2)
            total = round(p + it, 2)
            balance = round(balance - p, 2)
            schedule.append({
                "installment_number": i,
                "due_date": due.isoformat(),
                "principal_amount": p,
                "interest_amount": it,
                "total_amount": total,
                "balance_amount": max(balance, 0.0),
            })
            cumulative_principal += p
            cumulative_interest += it

        return {
            "installment_amount": installment_amount,
            "total_interest": total_interest,
            "total_payable": round(principal + total_interest, 2),
            "schedule": schedule,
        }

    elif interest_type == "REDUCING":
        if period_rate > 0:
            factor = (1 + period_rate) ** n
            emi = round(principal * period_rate * factor / (factor - 1), 2)
        else:
            emi = round(principal / n, 2)

        schedule = []
        balance = round(principal, 2)
        total_interest_acc = 0.0

        for i in range(1, n + 1):
            due = _get_due_date(disbursement_date, installment_type, i)
            interest = round(balance * period_rate, 2)
            if i == n:
                # Last period: pay off remaining balance exactly
                p = balance
                period_total = round(p + interest, 2)
            else:
                p = round(emi - interest, 2)
                period_total = emi
            balance_after = max(round(balance - p, 2), 0.0)
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

        total_interest = round(total_interest_acc, 2)
        return {
            "installment_amount": emi,
            "total_interest": total_interest,
            "total_payable": round(principal + total_interest, 2),
            "schedule": schedule,
        }

    else:
        raise ValueError(f"Unknown interest_type: {interest_type}")


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
