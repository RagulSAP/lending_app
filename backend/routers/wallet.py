"""
Wallet management routes.
Blueprint prefix: /api/wallet
"""
import uuid
from datetime import date

from flask import Blueprint, request
from sqlalchemy import func, case

from database import SessionLocal
from models import Wallet, Transaction, Partner, Customer
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response, model_to_dict, parse_date

wallet_bp = Blueprint("wallet", __name__, url_prefix="/api/wallet")

_ADMIN_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER)
_VIEW_ROLES  = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_ACCOUNTANT)


@wallet_bp.route("/", methods=["GET"])
@require_roles(*_VIEW_ROLES)
def get_wallet():
    """GET /api/wallet — balance + recent 100 transactions with partner/customer names."""
    current = get_current_user_info()
    db = SessionLocal()
    try:
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        if not wallet:
            return success_response(data={
                "wallet": {"wallet_id": None, "invest_balance": 0, "rotation_balance": 0, "interest_balance": 0, "org_id": current["org_id"]},
                "transactions": [],
                "stats": {"total_topup": 0, "total_disbursed": 0, "total_collected": 0, "total_withdrawn": 0},
            })

        # Accurate lifetime stats from DB aggregation (not limited to last 100)
        stats_row = (
            db.query(
                func.sum(case((Transaction.transaction_type == "WALLET_DEPOSIT",    Transaction.amount), else_=0)).label("topup"),
                func.sum(case((Transaction.transaction_type == "LOAN_DISBURSEMENT", Transaction.amount), else_=0)).label("disburse"),
                func.sum(case((Transaction.transaction_type == "LOAN_COLLECTION",   Transaction.amount), else_=0)).label("collect"),
                func.sum(case((Transaction.transaction_type == "WALLET_WITHDRAWAL", Transaction.amount), else_=0)).label("withdraw"),
            )
            .filter(Transaction.org_id == current["org_id"])
            .one()
        )
        total_topup    = float(stats_row.topup    or 0)
        total_disburse = float(stats_row.disburse or 0)
        total_collect  = float(stats_row.collect  or 0)
        total_withdraw = float(stats_row.withdraw or 0)

        # Recent 100 transactions for display
        txns = (
            db.query(Transaction)
            .filter(Transaction.org_id == current["org_id"])
            .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
            .limit(100)
            .all()
        )

        partner_ids  = list({t.partner_id  for t in txns if t.partner_id})
        customer_ids = list({t.customer_id for t in txns if t.customer_id})

        partner_map = {}
        if partner_ids:
            rows = db.query(Partner).filter(Partner.partner_id.in_(partner_ids)).all()
            partner_map = {p.partner_id: p.name for p in rows}

        customer_map = {}
        if customer_ids:
            rows = db.query(Customer).filter(Customer.customer_id.in_(customer_ids)).all()
            customer_map = {c.customer_id: c.name for c in rows}

        txn_rows = []
        for t in txns:
            d = model_to_dict(t)
            d["partner_name"]  = partner_map.get(t.partner_id)  if t.partner_id  else None
            d["customer_name"] = customer_map.get(t.customer_id) if t.customer_id else None
            txn_rows.append(d)

        return success_response(data={
            "wallet": model_to_dict(wallet),
            "transactions": txn_rows,
            "stats": {
                "total_topup":     round(total_topup, 2),
                "total_disbursed": round(total_disburse, 2),
                "total_collected": round(total_collect, 2),
                "total_withdrawn": round(total_withdraw, 2),
            },
        })
    finally:
        db.close()


@wallet_bp.route("/topup", methods=["POST"])
@require_roles(*_ADMIN_ROLES)
def topup_wallet():
    """POST /api/wallet/topup — {amount, partner_id, transaction_date, remarks}"""
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    try:
        amount = float(data.get("amount") or 0)
    except (TypeError, ValueError):
        return error_response("amount must be a number")
    if amount <= 0:
        return error_response("amount must be positive")

    partner_id = data.get("partner_id") or None
    txn_date_str = data.get("transaction_date")
    txn_date = parse_date(str(txn_date_str)) if txn_date_str else date.today()
    if not txn_date:
        return error_response("transaction_date must be YYYY-MM-DD")

    db = SessionLocal()
    try:
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        if not wallet:
            wallet = Wallet(
                wallet_id=str(uuid.uuid4()),
                org_id=current["org_id"],
                invest_balance=0,
                rotation_balance=0,
                interest_balance=0,
            )
            db.add(wallet)
            db.flush()

        if partner_id:
            partner = db.query(Partner).filter(
                Partner.partner_id == partner_id,
                Partner.org_id == current["org_id"],
            ).first()
            if not partner:
                return error_response("Partner not found", 404)

        wallet.invest_balance   = round(float(wallet.invest_balance   or 0) + amount, 2)
        wallet.rotation_balance = round(float(wallet.rotation_balance or 0) + amount, 2)

        txn = Transaction(
            transaction_id=str(uuid.uuid4()),
            user_id=current["user_id"],
            org_id=current["org_id"],
            transaction_type="WALLET_DEPOSIT",
            transaction_date=txn_date,
            amount=round(amount, 2),
            wallet_id=wallet.wallet_id,
            partner_id=partner_id,
            remarks=(data.get("remarks") or "").strip(),
        )
        db.add(txn)
        db.commit()

        d = model_to_dict(txn)
        d["wallet_invest_balance"]    = float(wallet.invest_balance)
        d["wallet_rotation_balance"]  = float(wallet.rotation_balance)
        d["wallet_interest_balance"]  = float(wallet.interest_balance)
        return success_response(data=d, message="Wallet topped up successfully"), 201
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()



@wallet_bp.route("/withdraw", methods=["POST"])
@require_roles(*_ADMIN_ROLES)
def withdraw():
    """POST /api/wallet/withdraw — {amount, transaction_date, remarks} — deducts from both invest_balance and rotation_balance."""
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")

    try:
        amount = float(data.get("amount") or 0)
    except (TypeError, ValueError):
        return error_response("amount must be a number")
    if amount <= 0:
        return error_response("amount must be positive")

    txn_date_str = data.get("transaction_date")
    txn_date = parse_date(str(txn_date_str)) if txn_date_str else date.today()
    if not txn_date:
        return error_response("transaction_date must be YYYY-MM-DD")

    db = SessionLocal()
    try:
        wallet = db.query(Wallet).filter(Wallet.org_id == current["org_id"]).first()
        if not wallet:
            return error_response("No wallet found for this organisation", 404)

        rotation_avail = float(wallet.rotation_balance or 0)
        if amount > rotation_avail + 0.005:
            return error_response(
                f"Insufficient rotation balance. Available: ₹ {rotation_avail:,.2f}", 400
            )

        wallet.invest_balance   = round(float(wallet.invest_balance   or 0) - amount, 2)
        wallet.rotation_balance = round(rotation_avail - amount, 2)

        txn = Transaction(
            transaction_id=str(uuid.uuid4()),
            user_id=current["user_id"],
            org_id=current["org_id"],
            transaction_type="WALLET_WITHDRAWAL",
            transaction_date=txn_date,
            amount=round(amount, 2),
            wallet_id=wallet.wallet_id,
            remarks=(data.get("remarks") or "Withdrawal").strip(),
        )
        db.add(txn)
        db.commit()

        d = model_to_dict(txn)
        d["wallet_invest_balance"]   = float(wallet.invest_balance)
        d["wallet_rotation_balance"] = float(wallet.rotation_balance)
        d["wallet_interest_balance"] = float(wallet.interest_balance)
        return success_response(data=d, message="Withdrawal successful"), 201
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()
