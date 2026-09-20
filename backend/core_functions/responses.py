"""
Shared response helpers and serialization utilities used across all routers.
"""
from flask import jsonify
from decimal import Decimal
from datetime import date, datetime


def success_response(data=None, message="", total=None, page=None, per_page=None, **extra):
    r = {"success": True}
    if data is not None:
        r["data"] = data
    if message:
        r["message"] = message
    if total is not None:
        r["total"] = total
    if page is not None:
        r["page"] = page
    if per_page is not None:
        r["per_page"] = per_page
    r.update(extra)
    return jsonify(r)


def error_response(message, status_code=400):
    return jsonify({"success": False, "message": message}), status_code


def serialize_value(val):
    """Convert a single value to a JSON-serializable type."""
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    return val


def model_to_dict(obj, exclude=None):
    """
    Convert a SQLAlchemy model instance to a plain dict.
    Dates and Decimals are automatically serialized.
    exclude: optional set/list of column names to omit.
    """
    exclude = set(exclude or [])
    return {
        c.name: serialize_value(getattr(obj, c.name))
        for c in obj.__table__.columns
        if c.name not in exclude
    }


def parse_date(date_str):
    """Parse a 'YYYY-MM-DD' string to a date object; returns None on failure."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
