"""
Role-aware dashboard aggregation queries.
All functions accept a SQLAlchemy session (db) and return plain dicts.
"""
from datetime import date, timedelta
from sqlalchemy import func, distinct, case, update, and_
from models import Customer, Loan, LoanInstallment, Transaction, Wallet, User, Organization
from config import Config
from core_functions.loan_calc import _add_months
from core_functions.timeutil import today_ist
from core_functions.overdue import sync_overdue_status, compute_overdue, interest_only_due_periods


def mark_overdue_loans(db, org_id: str) -> int:
    """Sync Loan.status with the real overdue state (see core_functions.overdue). Returns loans changed."""
    return sync_overdue_status(db, org_id)


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

def _week_start(today: date) -> date:
    """Monday of the current week."""
    return today - timedelta(days=today.weekday())


def _month_start(today: date) -> date:
    return today.replace(day=1)


# ---------------------------------------------------------------------------
# Admin / Manager dashboard
# ---------------------------------------------------------------------------

def get_admin_manager_dashboard(db, org_id: str) -> dict:
    """
    Full operational dashboard for ADMIN, MANAGER, and ACCOUNTANT roles.
    All figures are scoped to org_id.
    """
    today = today_ist()
    week_start = _week_start(today)
    month_start = _month_start(today)

    # Auto-mark overdue loans before computing stats
    mark_overdue_loans(db, org_id)

    # Active loan counts
    total_active_loans = (
        db.query(func.count(Loan.loan_id))
        .filter(Loan.org_id == org_id, Loan.status.in_(["ACTIVE", "OVERDUE"]))
        .scalar() or 0
    )

    # Total outstanding principal across all active/overdue loans
    total_disbursed = float(
        db.query(func.sum(Loan.balance_amount))
        .filter(Loan.org_id == org_id, Loan.status.in_(["ACTIVE", "OVERDUE"]))
        .scalar() or 0
    )

    # Collection aggregates — single query with conditional sums (replaces 3 queries)
    coll_row = (
        db.query(
            func.sum(case((Transaction.transaction_date == today,               Transaction.amount), else_=0)).label("today"),
            func.sum(case((Transaction.transaction_date >= week_start,          Transaction.amount), else_=0)).label("week"),
            func.sum(case((Transaction.transaction_date >= month_start,         Transaction.amount), else_=0)).label("month"),
        )
        .filter(
            Transaction.org_id == org_id,
            Transaction.transaction_type == "LOAN_COLLECTION",
            Transaction.transaction_date >= week_start,
            Transaction.transaction_date <= today,
        )
        .one()
    )
    collected_today      = float(coll_row.today or 0)
    collected_this_week  = float(coll_row.week  or 0)
    collected_this_month = float(
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.org_id == org_id,
            Transaction.transaction_type == "LOAN_COLLECTION",
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= today,
        )
        .scalar() or 0
    )

    # Collections due (customers to visit + amount): today, the next 7 days and the next month,
    # all starting today. Counts distinct customers with an unpaid installment due in the range.
    week_end = today + timedelta(days=7)
    month_end = _add_months(today, 1)

    def _due_cnt(lo, hi):
        return func.count(distinct(case(
            (and_(LoanInstallment.due_date >= lo, LoanInstallment.due_date <= hi), Loan.customer_id),
            else_=None,
        )))

    def _due_amt(lo, hi):
        return func.sum(case(
            (and_(LoanInstallment.due_date >= lo, LoanInstallment.due_date <= hi), LoanInstallment.balance_amount),
            else_=0,
        ))

    due_row = (
        db.query(
            _due_cnt(today, today).label("t_cnt"), _due_amt(today, today).label("t_amt"),
            _due_cnt(today, week_end).label("w_cnt"), _due_amt(today, week_end).label("w_amt"),
            _due_cnt(today, month_end).label("m_cnt"), _due_amt(today, month_end).label("m_amt"),
        )
        .select_from(LoanInstallment)
        .join(Loan, Loan.loan_id == LoanInstallment.loan_id)
        .filter(
            Loan.org_id == org_id,
            Loan.status.in_(["ACTIVE", "OVERDUE"]),
            LoanInstallment.status.in_(["PENDING", "PARTIAL"]),
            LoanInstallment.due_date >= today,
            LoanInstallment.due_date <= month_end,
        )
        .one()
    )

    # Interest-only (vatti) loans have no installment rows: add their uncollected interest periods
    # to every window. A customer with both kinds of dues is counted once.
    vatti = interest_only_due_periods(db, org_id, today, month_end)

    def _vatti_window(hi):
        return [v for v in vatti if v["due_date"] <= hi]

    def _combined_due(hi, pi_cnt, pi_amt):
        rows = _vatti_window(hi)
        if not rows:
            return pi_cnt or 0, float(pi_amt or 0)
        vatti_custs = {v["customer_id"] for v in rows}
        already_counted = {
            cid for (cid,) in db.query(Loan.customer_id)
            .join(LoanInstallment, LoanInstallment.loan_id == Loan.loan_id)
            .filter(
                Loan.org_id == org_id,
                Loan.status.in_(["ACTIVE", "OVERDUE"]),
                Loan.customer_id.in_(list(vatti_custs)),
                LoanInstallment.status.in_(["PENDING", "PARTIAL"]),
                LoanInstallment.due_date >= today,
                LoanInstallment.due_date <= hi,
            )
            .distinct()
            .all()
        }
        return (
            (pi_cnt or 0) + len(vatti_custs - already_counted),
            float(pi_amt or 0) + sum(v["amount"] for v in rows),
        )

    due_today_cnt, due_today_amt = _combined_due(today, due_row.t_cnt, due_row.t_amt)
    due_week_cnt, due_week_amt = _combined_due(week_end, due_row.w_cnt, due_row.w_amt)
    due_month_cnt, due_month_amt = _combined_due(month_end, due_row.m_cnt, due_row.m_amt)

    # Overdue: loans with missed installments / interest collections, and the amount missed
    overdue_loans = db.query(Loan).filter(Loan.org_id == org_id, Loan.status == "OVERDUE").all()
    overdue_info = compute_overdue(db, overdue_loans, today)
    overdue_count  = len(overdue_info)
    overdue_amount = sum(v["amount"] for v in overdue_info.values())

    # Wallet
    wallet = db.query(Wallet).filter(Wallet.org_id == org_id).first()
    wallet_invest_balance    = float(wallet.invest_balance)    if wallet else 0.0
    wallet_rotation_balance  = float(wallet.rotation_balance)  if wallet else 0.0
    wallet_interest_balance  = float(wallet.interest_balance)  if wallet else 0.0
    wallet_balance = wallet_rotation_balance + wallet_interest_balance

    # Expenses this month (via EXPENSE transactions)
    expenses_this_month = float(
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.org_id == org_id,
            Transaction.transaction_type == "EXPENSE",
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= today,
        )
        .scalar() or 0
    )

    # Customer loan status breakdown — 2 queries (replaces 5 queries)
    _active_loan_custs = (
        db.query(Loan.customer_id)
        .filter(Loan.org_id == org_id, Loan.status.in_(["ACTIVE", "OVERDUE"]))
        .distinct()
        .subquery()
    )
    _any_loan_custs = (
        db.query(Loan.customer_id)
        .filter(Loan.org_id == org_id)
        .distinct()
        .subquery()
    )
    cust_breakdown = (
        db.query(
            func.count(Customer.customer_id).label("total"),
            func.sum(case((Customer.customer_id.in_(_active_loan_custs),  1), else_=0)).label("with_active"),
            func.sum(case((Customer.customer_id.notin_(_any_loan_custs),  1), else_=0)).label("without_loan"),
        )
        .filter(Customer.org_id == org_id)
        .one()
    )
    active_customers            = cust_breakdown.total        or 0
    customers_with_active_loans = cust_breakdown.with_active  or 0
    customers_without_loans     = cust_breakdown.without_loan or 0
    customers_with_completed_loans = max(
        active_customers - customers_with_active_loans - customers_without_loans, 0
    )

    # Recent loan collection transactions
    recent_raw = (
        db.query(
            Transaction,
            Customer.name.label("customer_name"),
            User.name.label("collected_by"),
        )
        .join(Customer, Customer.customer_id == Transaction.customer_id, isouter=True)
        .join(User, User.user_id == Transaction.user_id, isouter=True)
        .filter(
            Transaction.org_id == org_id,
            Transaction.transaction_type == "LOAN_COLLECTION",
        )
        .order_by(Transaction.created_at.desc())
        .limit(10)
        .all()
    )

    recent_transactions = [
        {
            "transaction_id": txn.transaction_id,
            "customer_name": customer_name,
            "amount": round(float(txn.amount), 2),
            "payment_mode": txn.payment_mode,
            "transaction_date": txn.transaction_date.isoformat() if txn.transaction_date else None,
            "collected_by": collected_by,
        }
        for txn, customer_name, collected_by in recent_raw
    ]

    return {
        "total_active_loans": total_active_loans,
        "total_disbursed": round(total_disbursed, 2),
        "collected_today": round(collected_today, 2),
        "collected_this_week": round(collected_this_week, 2),
        "collected_this_month": round(collected_this_month, 2),
        "overdue_count": overdue_count,
        "overdue_amount": round(overdue_amount, 2),
        "due_today_count":  due_today_cnt,
        "due_today_amount": round(due_today_amt, 2),
        "due_week_count":   due_week_cnt,
        "due_week_amount":  round(due_week_amt, 2),
        "due_month_count":  due_month_cnt,
        "due_month_amount": round(due_month_amt, 2),
        "wallet_balance":           round(wallet_balance, 2),
        "wallet_invest_balance":    round(wallet_invest_balance, 2),
        "wallet_rotation_balance":  round(wallet_rotation_balance, 2),
        "wallet_interest_balance":  round(wallet_interest_balance, 2),
        "expenses_this_month": round(expenses_this_month, 2),
        "active_customers": active_customers,
        "customers_with_active_loans": customers_with_active_loans,
        "customers_with_completed_loans": customers_with_completed_loans,
        "customers_without_loans": customers_without_loans,
        "recent_transactions": recent_transactions,
    }


# ---------------------------------------------------------------------------
# Collector dashboard
# ---------------------------------------------------------------------------

def get_collector_dashboard(db, org_id: str, user_id: str,
                            date_from=None, date_to=None) -> dict:
    """
    Dashboard scoped to a single collector's own activity.
    date_from / date_to (date objects) narrow the "period" aggregates.
    """
    today = today_ist()
    month_start = _month_start(today)

    base_filters = [
        Transaction.org_id == org_id,
        Transaction.user_id == user_id,
        Transaction.transaction_type == "LOAN_COLLECTION",
    ]

    collected_today = float(
        db.query(func.sum(Transaction.amount))
        .filter(*base_filters, Transaction.transaction_date == today)
        .scalar() or 0
    )
    collected_this_month = float(
        db.query(func.sum(Transaction.amount))
        .filter(
            *base_filters,
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= today,
        )
        .scalar() or 0
    )

    # Custom period filters
    period_filters = list(base_filters)
    if date_from:
        period_filters.append(Transaction.transaction_date >= date_from)
    if date_to:
        period_filters.append(Transaction.transaction_date <= date_to)

    total_collections_count = (
        db.query(func.count(Transaction.transaction_id))
        .filter(*period_filters)
        .scalar() or 0
    )
    total_collections_amount = float(
        db.query(func.sum(Transaction.amount))
        .filter(*period_filters)
        .scalar() or 0
    )

    recent_raw = (
        db.query(Transaction, Customer.name.label("customer_name"))
        .join(Customer, Customer.customer_id == Transaction.customer_id, isouter=True)
        .filter(*base_filters)
        .order_by(Transaction.created_at.desc())
        .limit(10)
        .all()
    )

    recent_payments = [
        {
            "transaction_id": txn.transaction_id,
            "customer_name": customer_name,
            "amount": round(float(txn.amount), 2),
            "payment_mode": txn.payment_mode,
            "transaction_date": txn.transaction_date.isoformat() if txn.transaction_date else None,
        }
        for txn, customer_name in recent_raw
    ]

    return {
        "collected_today": round(collected_today, 2),
        "collected_this_month": round(collected_this_month, 2),
        "total_collections_count": total_collections_count,
        "total_collections_amount": round(total_collections_amount, 2),
        "recent_payments": recent_payments,
    }


# ---------------------------------------------------------------------------
# Super-admin dashboard
# ---------------------------------------------------------------------------

def get_super_admin_dashboard(db) -> dict:
    """
    Cross-org summary for SUPER_ADMIN.
    Excludes the reserved SYSTEM org.
    """
    system_org = Config.SYSTEM_ORG_ID

    total_orgs = (
        db.query(func.count(Organization.org_id))
        .filter(Organization.status == "ACTIVE", Organization.org_id != system_org)
        .scalar() or 0
    )
    total_users = (
        db.query(func.count(User.user_id))
        .filter(User.org_id != system_org)
        .scalar() or 0
    )
    total_borrowers = db.query(func.count(Customer.customer_id)).scalar() or 0

    orgs_raw = (
        db.query(Organization)
        .filter(Organization.org_id != system_org)
        .order_by(Organization.created_at.desc())
        .all()
    )

    # Batch aggregates — 2 queries regardless of org count (replaces N+1)
    user_counts = dict(
        db.query(User.org_id, func.count(User.user_id))
        .filter(User.org_id != system_org)
        .group_by(User.org_id)
        .all()
    )
    borrower_counts = dict(
        db.query(Customer.org_id, func.count(Customer.customer_id))
        .filter(Customer.org_id != system_org)
        .group_by(Customer.org_id)
        .all()
    )

    orgs = [
        {
            "org_id": org.org_id,
            "name": org.name,
            "user_count": user_counts.get(org.org_id, 0),
            "borrower_count": borrower_counts.get(org.org_id, 0),
            "status": org.status,
        }
        for org in orgs_raw
    ]

    return {
        "total_orgs": total_orgs,
        "total_users": total_users,
        "total_borrowers": total_borrowers,
        "orgs": orgs,
    }
