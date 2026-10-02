"""Input validation helpers shared by the interactive modules."""

import math


def parse_money(value, *, allow_zero=True):
    """Parse a finite, non-negative amount, optionally requiring it to be positive."""
    try:
        amount = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Enter a valid amount.") from error

    if not math.isfinite(amount):
        raise ValueError("Amount must be finite.")
    if amount < 0 or (not allow_zero and amount == 0):
        raise ValueError("Amount is outside the allowed range.")

    return amount
