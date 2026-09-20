"""
Role-aware dashboard aggregation queries.
All functions accept a SQLAlchemy session (db) and return plain dicts.
"""
from datetime import date, timedelta
from sqlalchemy import func
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

    # Collection aggregates
    def _collection_sum(date_from, date_to=None):
        q = (
            db.query(func.sum(Transaction.amount))
            .filter(
                Transaction.org_id == org_id,
                Transaction.transaction_type == "LOAN_COLLECTION",
                Transaction.transaction_date >= date_from,
            )
        )
        if date_to is not None:
            q = q.filter(Transaction.transaction_date <= date_to)
        return float(q.scalar() or 0)

    collected_today = _collection_sum(today, today)
    collected_this_week = _collection_sum(week_start, today)
    collected_this_month = _collection_sum(month_start, today)

    # Overdue
    overdue_count = (
        db.query(func.count(Loan.loan_id))
        .filter(Loan.org_id == org_id, Loan.status == "OVERDUE")
        .scalar() or 0
    )
    overdue_amount = float(
        db.query(func.sum(Loan.balance_amount))
        .filter(Loan.org_id == org_id, Loan.status == "OVERDUE")
        .scalar() or 0
    )

    # Wallet
    wallet = db.query(Wallet).filter(Wallet.org_id == org_id).first()
    wallet_balance = float(wallet.balance) if wallet else 0.0

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

    # Active customers
    active_customers = (
        db.query(func.count(Customer.customer_id))
        .filter(Customer.org_id == org_id, Customer.status == "ACTIVE")
        .scalar() or 0
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
        "wallet_balance": round(wallet_balance, 2),
        "expenses_this_month": round(expenses_this_month, 2),
        "active_customers": active_customers,
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

    orgs = []
    for org in orgs_raw:
        user_count = (
            db.query(func.count(User.user_id))
            .filter(User.org_id == org.org_id)
            .scalar() or 0
        )
        borrower_count = (
            db.query(func.count(Customer.customer_id))
            .filter(Customer.org_id == org.org_id)
            .scalar() or 0
        )
        orgs.append({
            "org_id": org.org_id,
            "name": org.name,
            "user_count": user_count,
            "borrower_count": borrower_count,
            "status": org.status,
        })

    return {
        "total_orgs": total_orgs,
        "total_users": total_users,
        "total_borrowers": total_borrowers,
        "orgs": orgs,
    }
