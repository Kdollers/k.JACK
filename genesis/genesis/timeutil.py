"""Clock helpers. All stored timestamps are UTC."""

from datetime import date, datetime, timezone


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def today():
    return datetime.now(timezone.utc).date()


def today_iso():
    return today().isoformat()


def as_date(value):
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)
