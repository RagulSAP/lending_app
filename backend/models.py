from datetime import datetime as _dt, timezone as _tz, timedelta as _td

_IST = _tz(_td(hours=5, minutes=30))

def _now_ist():
    return _dt.now(_IST).replace(tzinfo=None)

from sqlalchemy import (
    Column, Integer, String, Numeric, Date, DateTime,
    ForeignKey, Text, func
)
from database import Base


class Organization(Base):
    __tablename__ = "organizations"
    id         = Column(Integer, primary_key=True)
    org_id     = Column(String(36), unique=True, nullable=False)
    name       = Column(String(100), nullable=False)
    address    = Column(String(100))
    phone      = Column(String(100))
    status     = Column(String(100), default="ACTIVE")
    created_at = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class Role(Base):
    __tablename__ = "roles"
    id        = Column(Integer, primary_key=True)
    role_name = Column(String(50), nullable=False)


class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    user_id       = Column(String(36), unique=True, nullable=False)
    org_id        = Column(String(36), ForeignKey("organizations.org_id"), nullable=False)
    name          = Column(String(100), nullable=False)
    phone         = Column(String(100))
    password_hash = Column(String(225), nullable=False)
    role_id       = Column(Integer, ForeignKey("roles.id"), nullable=False)
    status        = Column(Integer, nullable=False, default=1)  # 1=active, 0=inactive
    last_login    = Column(DateTime)
    created_at    = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at    = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class Customer(Base):
    __tablename__ = "customers"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    customer_id   = Column(String(36), unique=True, nullable=False)
    org_id        = Column(String(36), ForeignKey("organizations.org_id"), nullable=False)
    name          = Column(String(100), nullable=False)
    phone         = Column(String(100))
    address       = Column(String(255))
    city          = Column(String(100))
    state         = Column(String(100))
    pincode       = Column(String(6))
    aadhaar       = Column(String(100))
    pan           = Column(String(20))
    user_id       = Column(String(36), ForeignKey("users.user_id"))
    created_by    = Column(String(36), ForeignKey("users.user_id"))
    photo         = Column(String(225))
    id_proof      = Column(String(225))
    id_proof_type = Column(String(10))  # PAN or AADHAAR
    status        = Column(String(20), default="ACTIVE")
    created_at    = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at    = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class Loan(Base):
    __tablename__ = "loans"
    id                  = Column(Integer, primary_key=True, autoincrement=True)
    loan_id             = Column(String(36), unique=True, nullable=False)
    customer_id         = Column(String(36), ForeignKey("customers.customer_id"), nullable=False)
    org_id              = Column(String(36), ForeignKey("organizations.org_id"), nullable=False)
    disbursement_amount = Column(Numeric(10, 2), nullable=False)
    interest_type       = Column(String(100))   # FLAT / REDUCING
    interest_rate       = Column(Numeric(10, 2))  # annual %
    processing_fee      = Column(Numeric(10, 2), default=0)
    disbursement_date   = Column(Date)
    due_date            = Column(Date)
    installment_type    = Column(String(100))   # DAILY / WEEKLY / MONTHLY
    installment_amount  = Column(Numeric(10, 2))
    total_payable       = Column(Numeric(10, 2))
    total_paid          = Column(Numeric(10, 2), default=0)
    balance_amount      = Column(Numeric(10, 2))
    status              = Column(String(100), default="ACTIVE")  # ACTIVE/OVERDUE/CLOSED
    remarks             = Column(String(100))
    created_by          = Column(String(100), ForeignKey("users.user_id"))
    created_at          = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at          = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class LoanInstallment(Base):
    __tablename__ = "loan_installments"
    id                 = Column(Integer, primary_key=True, autoincrement=True)
    installment_id     = Column(String(36), unique=True, nullable=False)
    loan_id            = Column(String(36), ForeignKey("loans.loan_id"), nullable=False)
    installment_number = Column(Integer, nullable=False)
    due_date           = Column(Date, nullable=False)
    principal_amount   = Column(Numeric(12, 2), nullable=False)
    interest_amount    = Column(Numeric(12, 2))
    penalty_amount     = Column(Numeric(12, 2), default=0)
    total_amount       = Column(Numeric(12, 2), nullable=False)
    paid_amount        = Column(Numeric(12, 2), default=0)
    balance_amount     = Column(Numeric(12, 2))
    status             = Column(String(20), default="PENDING")  # PENDING/PARTIAL/PAID
    paid_date          = Column(Date)
    created_at         = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at         = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class Transaction(Base):
    __tablename__ = "transaction"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    transaction_id   = Column(String(36), unique=True, nullable=False)
    loan_id          = Column(String(36), ForeignKey("loans.loan_id"))
    customer_id      = Column(String(36), ForeignKey("customers.customer_id"))
    installment_id   = Column(String(36), ForeignKey("loan_installments.installment_id"))
    user_id          = Column(String(36), ForeignKey("users.user_id"))
    org_id           = Column(String(36), ForeignKey("organizations.org_id"), nullable=False)
    transaction_type = Column(String(100), nullable=False)  # LOAN_COLLECTION / EXPENSE / WALLET_DEPOSIT
    transaction_date = Column(Date, nullable=False)
    amount           = Column(Numeric(10, 2), nullable=False)
    payment_mode     = Column(String(100))  # CASH / UPI / BANK_TRANSFER / CHEQUE
    wallet_id        = Column(String(36), ForeignKey("wallet.wallet_id"))
    remarks          = Column(String(225))
    created_at       = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at       = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class Wallet(Base):
    __tablename__ = "wallet"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    wallet_id  = Column(String(36), unique=True, nullable=False)
    balance    = Column(Numeric(10, 2), nullable=False, default=0)
    org_id     = Column(String(36), ForeignKey("organizations.org_id"), nullable=False)
    created_at = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(String(36), unique=True, nullable=False)
    org_id      = Column(String(36), ForeignKey("organizations.org_id"), nullable=False)
    name        = Column(String(100), nullable=False)
    description = Column(String(255))
    status      = Column(String(20), default="ACTIVE")
    created_at  = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at  = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class Expense(Base):
    __tablename__ = "expense"
    id             = Column(Integer, primary_key=True, autoincrement=True)
    expense_id     = Column(String(36), unique=True, nullable=False)
    user_id        = Column(String(36), ForeignKey("users.user_id"), nullable=False)
    category_id    = Column(String(36), ForeignKey("expense_categories.category_id"), nullable=False)
    expense_remark = Column(String(100))
    expense_amount = Column(Numeric(10, 2), nullable=False)
    wallet_id      = Column(String(36), ForeignKey("wallet.wallet_id"), nullable=False)
    expense_date   = Column(DateTime, nullable=False)
    created_at     = Column(DateTime, default=_now_ist, server_default=func.now())
    updated_at     = Column(DateTime, default=_now_ist, server_default=func.now(), onupdate=_now_ist)


class LoanStatusHistory(Base):
    __tablename__ = "loan_status_history"
    id         = Column(String(36), primary_key=True)
    loan_id    = Column(String(36), ForeignKey("loans.loan_id"), nullable=False)
    old_status = Column(String(100))
    new_status = Column(String(100), nullable=False)
    changed_by = Column(String(100), ForeignKey("users.user_id"))
    changed_at = Column(DateTime, server_default=func.now())
    remarks    = Column(String(100))
