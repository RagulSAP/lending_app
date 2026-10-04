"""
Role-aware dashboard aggregation queries.
All functions accept a SQLAlchemy session (db) and return plain dicts.
"""
from datetime import date, timedelta
from sqlalchemy import func, distinct, case
from models import Customer, Loan, Transaction, Wallet, User, Organization
from config import Config


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
    today = date.today()
    week_start = _week_start(today)
    month_start = _month_start(today)

    # Active loan counts
    total_active_loans = (
        db.query(func.count(Loan.loan_id))
        .filter(Loan.org_id == org_id, Loan.status.in_(["ACTIVE", "OVERDUE"]))
        .scalar() or 0
    )

    total_disbursed = float(
        db.query(func.sum(Loan.disbursement_amount))
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

    # Overdue — single query for both count and amount (replaces 2 queries)
    overdue_row = (
        db.query(func.count(Loan.loan_id), func.sum(Loan.balance_amount))
        .filter(Loan.org_id == org_id, Loan.status == "OVERDUE")
        .one()
    )
    overdue_count  = overdue_row[0] or 0
    overdue_amount = float(overdue_row[1] or 0)

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
            "amount": float(txn.amount),
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
    today = date.today()
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
            "amount": float(txn.amount),
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
