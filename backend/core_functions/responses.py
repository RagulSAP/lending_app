"""
Shared response helpers and serialization utilities used across all routers.
"""
import logging
import math
from flask import jsonify
from decimal import Decimal
from datetime import date, datetime

logger = logging.getLogger("lendtrack")


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


def server_error(message="Something went wrong. Please try again."):
    """
    500 response that never leaks internal exception text. Must be called from
    inside an `except` block: the active exception is logged with its traceback.
    """
    logger.exception("Unhandled error while processing request")
    return error_response(message, 500)


def finite_float(raw, name="value"):
    """
    float(raw) that also rejects NaN / Infinity (valid JSON literals for Python's
    parser). Raises ValueError with a user-facing message.
    """
    try:
        val = float(raw)
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"{name} must be a number")
    if not math.isfinite(val):
        raise ValueError(f"{name} must be a finite number")
    return val


def serialize_value(val):
    """Convert a single value to a JSON-serializable type."""
    if isinstance(val, Decimal):
        return round(float(val), 2)
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
