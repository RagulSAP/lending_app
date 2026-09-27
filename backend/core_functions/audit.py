"""
Audit logging — registered as a Flask after_request hook.
Captures every API call: who, what, when, status.
Non-blocking: any error inside is silently swallowed so it
never affects the actual response the caller receives.
"""
import re
import uuid
from datetime import datetime, timezone, timedelta

from flask import request, g
from flask_jwt_extended import get_jwt, get_jwt_identity

from database import SessionLocal

_IST = timezone(timedelta(hours=5, minutes=30))

def _now_ist():
    return datetime.now(_IST).replace(tzinfo=None)

# Paths that are too noisy or irrelevant to audit
_SKIP_PREFIXES = ('/api/health', '/api/kyc/', '/frontend/')
_SKIP_METHODS  = ('OPTIONS',)

# Detects a UUID in the last path segment
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

# (METHOD, path_prefix) → (action, category)
# More specific prefixes must come before general ones.
_ACTION_MAP = [
    # Auth
    ('POST',   '/api/auth/login',            'LOGIN',               'AUTH'),
    ('GET',    '/api/auth/me',               'VIEW_PROFILE',        'AUTH'),
    ('POST',   '/api/auth/logout',           'LOGOUT',              'AUTH'),
    # Dashboard
    ('GET',    '/api/dashboard',             'VIEW_DASHBOARD',      'DASHBOARD'),
    # Customers
    ('POST',   '/api/customers',             'CREATE_CUSTOMER',     'CUSTOMER'),
    ('GET',    '/api/customers/',            'VIEW_CUSTOMER',       'CUSTOMER'),
    ('PATCH',  '/api/customers/',            'EDIT_CUSTOMER',       'CUSTOMER'),
    ('DELETE', '/api/customers/',            'DELETE_CUSTOMER',     'CUSTOMER'),
    ('GET',    '/api/customers',             'LIST_CUSTOMERS',      'CUSTOMER'),
    # Loans
    ('POST',   '/api/loans/',                'CREATE_LOAN',         'LOAN'),
    ('GET',    '/api/loans/customer/',       'VIEW_CUSTOMER_LOANS', 'LOAN'),
    ('GET',    '/api/loans/',                'VIEW_LOAN',           'LOAN'),
    # Payments
    ('POST',   '/api/payments/collect',      'COLLECT_PAYMENT',     'PAYMENT'),
    # Wallet
    ('POST',   '/api/wallet/topup',          'TOPUP_WALLET',        'WALLET'),
    ('GET',    '/api/wallet',                'VIEW_WALLET',         'WALLET'),
    # Partners
    ('POST',   '/api/partners',              'CREATE_PARTNER',      'PARTNER'),
    ('PATCH',  '/api/partners/',             'EDIT_PARTNER',        'PARTNER'),
    ('DELETE', '/api/partners/',             'DELETE_PARTNER',      'PARTNER'),
    ('GET',    '/api/partners',              'LIST_PARTNERS',       'PARTNER'),
    # Expenses
    ('GET',    '/api/expenses/categories',   'LIST_CATEGORIES',     'EXPENSE'),
    ('POST',   '/api/expenses',              'CREATE_EXPENSE',      'EXPENSE'),
    ('DELETE', '/api/expenses/',             'DELETE_EXPENSE',      'EXPENSE'),
    ('GET',    '/api/expenses',              'LIST_EXPENSES',       'EXPENSE'),
    # Reports
    ('GET',    '/api/reports/export',        'EXPORT_REPORT',       'REPORT'),
    ('GET',    '/api/reports/transactions',  'REPORT_TRANSACTIONS', 'REPORT'),
    ('GET',    '/api/reports/loans',         'REPORT_LOANS',        'REPORT'),
    ('GET',    '/api/reports/expenses',      'REPORT_EXPENSES',     'REPORT'),
    # Users
    ('POST',   '/api/users',                 'CREATE_USER',         'USER'),
    ('PATCH',  '/api/users/',                'EDIT_USER',           'USER'),
    ('DELETE', '/api/users/',                'DELETE_USER',         'USER'),
    ('GET',    '/api/users',                 'LIST_USERS',          'USER'),
    # Organizations
    ('POST',   '/api/organizations',         'CREATE_ORG',          'ORG'),
    ('PATCH',  '/api/organizations/',        'EDIT_ORG',            'ORG'),
    ('GET',    '/api/organizations',         'LIST_ORGS',           'ORG'),
]


def _resolve_action(method, path):
    for m, prefix, action, category in _ACTION_MAP:
        if method == m and path.startswith(prefix):
            return action, category
    tag = path.strip('/').replace('/', '_').upper()
    return f"{method}_{tag}", 'OTHER'


def _extract_entity_id(path):
    parts = [p for p in path.rstrip('/').split('/') if p]
    if parts and _UUID_RE.match(parts[-1]):
        return parts[-1]
    return None


def audit_after_request(response):
    """Flask after_request hook — write one row to audit_log per API call."""
    path = request.path

    if any(path.startswith(s) for s in _SKIP_PREFIXES):
        return response
    if request.method in _SKIP_METHODS:
        return response
    if not path.startswith('/api/'):
        return response

    try:
        # Prefer info stored in g by the view (e.g. login before token issued)
        user_id   = getattr(g, 'audit_user_id',   None)
        user_name = getattr(g, 'audit_user_name',  None)
        org_id    = getattr(g, 'audit_org_id',     None)
        role_id   = getattr(g, 'audit_role_id',    None)
        session_id = getattr(g, 'audit_session_id', None)

        if user_id is None:
            try:
                claims    = get_jwt()
                user_id   = get_jwt_identity()
                user_name = claims.get('name')
                org_id    = claims.get('org_id')
                role_id   = claims.get('role_id')
                session_id = claims.get('jti')
            except Exception:
                pass

        action, category = _resolve_action(request.method, path)
        entity_id = _extract_entity_id(path)
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)

        from models import AuditLog
        db = SessionLocal()
        try:
            db.add(AuditLog(
                log_id=str(uuid.uuid4()),
                session_id=session_id,
                org_id=org_id,
                user_id=user_id,
                user_name=user_name,
                role_id=role_id,
                action=action,
                action_category=category,
                entity_id=entity_id,
                http_method=request.method,
                endpoint=path,
                ip_address=ip,
                status_code=response.status_code,
                created_at=_now_ist(),
            ))
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    except Exception:
        pass  # audit must never break the real response

    return response
