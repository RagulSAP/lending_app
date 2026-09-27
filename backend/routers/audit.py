"""
Audit API — sessions list, session detail, and user filter list.
Blueprint prefix: /api/audit
"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from database import SessionLocal
from models import AuditLog
from core_functions.auth import get_current_user_info
from core_functions.responses import success_response, error_response

audit_bp = Blueprint("audit", __name__, url_prefix="/api/audit")


def _can_access(info):
    return info["role_id"] in (0, 1)  # SUPER_ADMIN or ADMIN


@audit_bp.route("/sessions", methods=["GET"])
@jwt_required()
def get_sessions():
    info = get_current_user_info()
    if not _can_access(info):
        return error_response("Access denied", 403)

    page     = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 25))
    date_from   = request.args.get("date_from")
    date_to     = request.args.get("date_to")
    user_filter = request.args.get("user_id")

    db = SessionLocal()
    try:
        q = db.query(
            AuditLog.session_id,
            AuditLog.user_id,
            AuditLog.user_name,
            AuditLog.role_id,
            AuditLog.org_id,
            AuditLog.ip_address,
            func.count(AuditLog.id).label("action_count"),
            func.min(AuditLog.created_at).label("started_at"),
            func.max(AuditLog.created_at).label("ended_at"),
        ).filter(AuditLog.session_id.isnot(None))

        if info["role_id"] != 0:
            q = q.filter(AuditLog.org_id == info["org_id"])
        if date_from:
            q = q.filter(func.date(AuditLog.created_at) >= date_from)
        if date_to:
            q = q.filter(func.date(AuditLog.created_at) <= date_to)
        if user_filter:
            q = q.filter(AuditLog.user_id == user_filter)

        q = q.group_by(
            AuditLog.session_id,
            AuditLog.user_id,
            AuditLog.user_name,
            AuditLog.role_id,
            AuditLog.org_id,
            AuditLog.ip_address,
        )

        total = q.count()
        rows = (
            q.order_by(func.min(AuditLog.created_at).desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        sessions = []
        for row in rows:
            started = row.started_at
            ended   = row.ended_at
            dur     = int((ended - started).total_seconds()) if started and ended else 0
            sessions.append({
                "session_id":       row.session_id,
                "user_id":          row.user_id,
                "user_name":        row.user_name or "Unknown",
                "role_id":          row.role_id,
                "org_id":           row.org_id,
                "ip_address":       row.ip_address,
                "action_count":     row.action_count,
                "started_at":       started.isoformat() if started else None,
                "ended_at":         ended.isoformat() if ended else None,
                "duration_seconds": dur,
            })

        return success_response(data={
            "sessions": sessions,
            "total":    total,
            "page":     page,
            "per_page": per_page,
        })
    finally:
        db.close()


@audit_bp.route("/sessions/<session_id>", methods=["GET"])
@jwt_required()
def get_session_detail(session_id):
    info = get_current_user_info()
    if not _can_access(info):
        return error_response("Access denied", 403)

    db = SessionLocal()
    try:
        q = db.query(AuditLog).filter(AuditLog.session_id == session_id)
        if info["role_id"] != 0:
            q = q.filter(AuditLog.org_id == info["org_id"])

        logs = q.order_by(AuditLog.created_at.asc()).all()
        if not logs:
            return error_response("Session not found", 404)

        start_ts = logs[0].created_at
        actions = []
        for log in logs:
            elapsed = int((log.created_at - start_ts).total_seconds()) if start_ts and log.created_at else 0
            actions.append({
                "log_id":          log.log_id,
                "action":          log.action,
                "action_category": log.action_category or "OTHER",
                "entity_id":       log.entity_id,
                "http_method":     log.http_method,
                "endpoint":        log.endpoint,
                "status_code":     log.status_code,
                "created_at":      log.created_at.isoformat() if log.created_at else None,
                "elapsed_seconds": elapsed,
            })

        return success_response(data={"actions": actions})
    finally:
        db.close()


@audit_bp.route("/users", methods=["GET"])
@jwt_required()
def get_audit_users():
    info = get_current_user_info()
    if not _can_access(info):
        return error_response("Access denied", 403)

    db = SessionLocal()
    try:
        q = db.query(AuditLog.user_id, AuditLog.user_name).filter(
            AuditLog.user_id.isnot(None)
        )
        if info["role_id"] != 0:
            q = q.filter(AuditLog.org_id == info["org_id"])

        rows = q.distinct().order_by(AuditLog.user_name).all()
        users = [{"user_id": r.user_id, "user_name": r.user_name} for r in rows if r.user_id]
        return success_response(data={"users": users})
    finally:
        db.close()
