"""
Partner management routes.
Blueprint prefix: /api/partners
"""
import uuid

from flask import Blueprint, request

from database import SessionLocal
from models import Partner
from config import Config
from core_functions.rbac import require_roles
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response, model_to_dict

partners_bp = Blueprint("partners", __name__, url_prefix="/api/partners")

_ADMIN_ROLES = (Config.ROLE_ADMIN, Config.ROLE_MANAGER)
_VIEW_ROLES  = (Config.ROLE_ADMIN, Config.ROLE_MANAGER, Config.ROLE_ACCOUNTANT)


@partners_bp.route("/", methods=["GET"])
@require_roles(*_VIEW_ROLES)
def list_partners():
    current = get_current_user_info()
    db = SessionLocal()
    try:
        partners = (
            db.query(Partner)
            .filter(Partner.org_id == current["org_id"], Partner.status == "ACTIVE")
            .order_by(Partner.name)
            .all()
        )
        return success_response(data=[model_to_dict(p) for p in partners])
    finally:
        db.close()


@partners_bp.route("/", methods=["POST"])
@require_roles(*_ADMIN_ROLES)
def create_partner():
    current = get_current_user_info()
    data = request.get_json(silent=True)
    if not data:
        return error_response("JSON body is required")
    name = (data.get("name") or "").strip()
    if not name:
        return error_response("Partner name is required")

    db = SessionLocal()
    try:
        partner = Partner(
            partner_id=str(uuid.uuid4()),
            org_id=current["org_id"],
            name=name,
            phone=(data.get("phone") or "").strip(),
            status="ACTIVE",
        )
        db.add(partner)
        db.commit()
        return success_response(data=model_to_dict(partner), message="Partner added"), 201
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@partners_bp.route("/<string:partner_id>", methods=["PATCH"])
@require_roles(*_ADMIN_ROLES)
def update_partner(partner_id):
    current = get_current_user_info()
    data = request.get_json(silent=True) or {}
    db = SessionLocal()
    try:
        partner = db.query(Partner).filter(
            Partner.partner_id == partner_id,
            Partner.org_id == current["org_id"],
        ).first()
        if not partner:
            return error_response("Partner not found", 404)
        if "name" in data:
            v = (data["name"] or "").strip()
            if not v:
                return error_response("Name cannot be empty")
            partner.name = v
        if "phone" in data:
            partner.phone = (data["phone"] or "").strip()
        db.commit()
        return success_response(data=model_to_dict(partner), message="Partner updated")
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()


@partners_bp.route("/<string:partner_id>", methods=["DELETE"])
@require_roles(*_ADMIN_ROLES)
def delete_partner(partner_id):
    current = get_current_user_info()
    db = SessionLocal()
    try:
        partner = db.query(Partner).filter(
            Partner.partner_id == partner_id,
            Partner.org_id == current["org_id"],
        ).first()
        if not partner:
            return error_response("Partner not found", 404)
        partner.status = "INACTIVE"
        db.commit()
        return success_response(message="Partner removed")
    except Exception as exc:
        db.rollback()
        return error_response(f"Database error: {exc}", 500)
    finally:
        db.close()
