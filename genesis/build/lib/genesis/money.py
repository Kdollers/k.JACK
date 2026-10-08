"""Exact decimal handling: money in minor units, quantities scaled by 10^4.

No binary floating point is used for any stored value. Rounding is
half-up (half away from zero) and applied only at well-defined points.
"""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from .config import BPS, QTY_DECIMALS, QTY_SCALE
from .errors import ValidationError

_DECIMAL_RE = re.compile(r"^-?\d{1,15}(\.\d{1,8})?$")
_QTY_RE = re.compile(r"^\d{1,12}(\.\d{1,4})?$")
_PERCENT_RE = re.compile(r"^\d{1,3}(\.\d{1,2})?$")
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

THOUSANDS = {"en": ",", "fr": "\u202f", "rw": ","}
DECIMAL_SEP = {"en": ".", "fr": ",", "rw": "."}


def div_round(numerator, denominator):
    """Integer division rounding half away from zero."""
    if denominator == 0:
        raise ZeroDivisionError("div_round by zero")
    sign = -1 if (numerator < 0) != (denominator < 0) else 1
    n, d = abs(numerator), abs(denominator)
    return sign * ((2 * n + d) // (2 * d))


def _text(value):
    if isinstance(value, bool):
        raise ValidationError("invalid_number")
    if isinstance(value, int):
        return str(value)
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, str):
        return value.strip().replace(" ", "")
    if isinstance(value, float):
        # Floats are only accepted if they are exactly representable in text
        # form without scientific notation; the caller should send strings.
        text = repr(value)
        if "e" in text or "E" in text:
            raise ValidationError("invalid_number")
        return text
    raise ValidationError("invalid_number")


def parse_money(value, decimals, field="amount", allow_negative=False, allow_zero=True):
    """Parse a decimal string into integer minor units for a currency."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        raise ValidationError("field_required", field=field)
    text = _text(value)
    if not _DECIMAL_RE.match(text):
        raise ValidationError("invalid_number", field=field)
    try:
        number = Decimal(text)
    except InvalidOperation as error:  # pragma: no cover - guarded by regex
        raise ValidationError("invalid_number", field=field) from error
    fraction = text.split(".", 1)[1] if "." in text else ""
    if len(fraction) > decimals:
        raise ValidationError("too_many_decimals", field=field, decimals=decimals)
    minor = int(number.scaleb(decimals).to_integral_value())
    if minor < 0 and not allow_negative:
        raise ValidationError("negative_not_allowed", field=field)
    if minor == 0 and not allow_zero:
        raise ValidationError("zero_not_allowed", field=field)
    return minor


def parse_quantity(value, field="quantity", allow_zero=False):
    """Parse a quantity into scaled integer units (1 unit = 10000)."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        raise ValidationError("field_required", field=field)
    text = _text(value)
    if not _QTY_RE.match(text):
        raise ValidationError("invalid_quantity", field=field)
    scaled = int(Decimal(text).scaleb(QTY_DECIMALS).to_integral_value())
    if scaled < 0 or (scaled == 0 and not allow_zero):
        raise ValidationError("invalid_quantity", field=field)
    return scaled


def parse_percent_bps(value, field="discount", allow_empty=True):
    """Parse a percentage (0-100, up to 2 decimals) into basis points."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if allow_empty:
            return 0
        raise ValidationError("field_required", field=field)
    text = _text(value)
    if not _PERCENT_RE.match(text):
        raise ValidationError("invalid_percentage", field=field)
    bps = int(Decimal(text).scaleb(2).to_integral_value())
    if bps < 0 or bps > BPS:
        raise ValidationError("invalid_percentage", field=field)
    return bps


def format_qty(scaled):
    """Display a scaled quantity without trailing zeros."""
    sign = "-" if scaled < 0 else ""
    whole, frac = divmod(abs(scaled), QTY_SCALE)
    text = str(whole)
    if frac:
        text += "." + f"{frac:04d}".rstrip("0")
    return sign + text


def format_bps(bps):
    value = Decimal(bps) / Decimal(100)
    text = format(value.normalize(), "f")
    return text


def format_money(minor, decimals=2, lang="en", symbol=""):
    """Locale-aware display of integer minor units."""
    sign = "-" if minor < 0 else ""
    whole, frac = divmod(abs(minor), 10 ** decimals) if decimals else (abs(minor), 0)
    grouped = f"{whole:,}".replace(",", THOUSANDS.get(lang, ","))
    text = grouped
    if decimals:
        text += DECIMAL_SEP.get(lang, ".") + f"{frac:0{decimals}d}"
    if symbol:
        text = f"{text} {symbol}"
    return sign + text


def money_to_decimal_string(minor, decimals):
    """Plain dot-decimal string (used for CSV/XLSX numeric export)."""
    if not decimals:
        return str(minor)
    sign = "-" if minor < 0 else ""
    whole, frac = divmod(abs(minor), 10 ** decimals)
    return f"{sign}{whole}.{frac:0{decimals}d}"


def parse_iso_date(value, field="date"):
    """Strictly parse YYYY-MM-DD; returns a ``date``."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not _ISO_DATE_RE.match(value.strip()):
        raise ValidationError("invalid_date", field=field)
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError as error:
        raise ValidationError("invalid_date", field=field) from error
    if not (1900 <= parsed.year <= 2199):
        raise ValidationError("invalid_date", field=field)
    return parsed


def optional_iso_date(value, field="date"):
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    return parse_iso_date(value, field).isoformat()
