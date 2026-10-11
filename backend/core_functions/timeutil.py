from datetime import date, datetime, timedelta, timezone

_IST = timezone(timedelta(hours=5, minutes=30))


def today_ist() -> date:
    """Current calendar date in IST, independent of the server's timezone."""
    return datetime.now(_IST).date()
