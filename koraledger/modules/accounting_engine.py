"""Posting helpers for the application's double-entry accounting ledger."""

import math
from datetime import date

from database import cursor as database_cursor


def _amount(value, *, allow_zero=True):
    try:
        amount = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Journal amounts must be numeric.") from error
    if not math.isfinite(amount):
        raise ValueError("Journal amounts must be finite.")
    if amount < 0 or (not allow_zero and amount == 0):
        raise ValueError("Journal amounts must be non-negative.")
    return amount


def _cursor(cursor_obj):
    return cursor_obj if cursor_obj is not None else database_cursor


def create_journal_entry(
    description, lines, reference=None, *, cursor_obj=None, entry_date=None
):
    """Create a balanced journal entry without committing the transaction."""
    cursor = _cursor(cursor_obj)
    description = str(description or "").strip()
    if not description:
        raise ValueError("Journal entry description cannot be empty.")
    if not isinstance(lines, (list, tuple)) or len(lines) < 2:
        raise ValueError("A journal entry must contain at least two lines.")

    try:
        posted_date = (
            date.today().isoformat()
            if entry_date is None
            else date.fromisoformat(str(entry_date)).isoformat()
        )
    except ValueError as error:
        raise ValueError("Journal entry date must use YYYY-MM-DD format.") from error

    normalized_lines = []
    total_debit = 0.0
    total_credit = 0.0
    for line in lines:
        if not isinstance(line, dict):
            raise ValueError("Each journal line must be a mapping.")
        account_code = str(line.get("account_code", "")).strip()
        if not account_code:
            raise ValueError("Each journal line needs an account code.")
        debit = _amount(line.get("debit", 0))
        credit = _amount(line.get("credit", 0))
        if debit > 0 and credit > 0:
            raise ValueError("A journal line cannot contain both a debit and a credit.")
        if debit == 0 and credit == 0:
            raise ValueError("A journal line must have a debit or a credit.")

        cursor.execute(
            "SELECT id FROM accounts WHERE account_code = ? AND is_active = 1",
            (account_code,),
        )
        account = cursor.fetchone()
        if account is None:
            raise ValueError(f"Account code {account_code} not found.")
        normalized_lines.append(
            (
                account[0],
                str(line.get("description") or description).strip(),
                debit,
                credit,
            )
        )
        total_debit += debit
        total_credit += credit

    if not math.isfinite(total_debit) or not math.isfinite(total_credit):
        raise ValueError("Journal totals must be finite.")
    if not math.isclose(total_debit, total_credit, rel_tol=0.0, abs_tol=1e-6):
        raise ValueError(
            "Journal entry is not balanced: "
            f"debits total {total_debit:.2f}, credits total {total_credit:.2f}."
        )

    cursor.execute(
        """
        INSERT INTO journal_entries (entry_date, reference, description, created_at)
        VALUES (?, ?, ?, DATETIME('now'))
        """,
        (posted_date, reference, description),
    )
    journal_entry_id = cursor.lastrowid
    cursor.executemany(
        """
        INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (journal_entry_id, account_id, line_description, debit, credit)
            for account_id, line_description, debit, credit in normalized_lines
        ],
    )
    return journal_entry_id


def record_sale_accounting(
    sale_id, total, payment_method, sale_items=None, *, cursor_obj=None, entry_date=None
):
    cursor = _cursor(cursor_obj)
    payment_accounts = {
        "Cash": "1010",
        "Bank": "1020",
        "Mobile Money": "1030",
        "Accounts Receivable": "1100",
    }
    debit_account_code = payment_accounts.get(payment_method)
    if debit_account_code is None:
        raise ValueError(f"Unknown payment method: {payment_method}")
    total = _amount(total)
    if total > 0:
        create_journal_entry(
            description=f"Sale #{sale_id}",
            reference=f"SALE-{sale_id}",
            lines=[
                {"account_code": debit_account_code, "debit": total, "credit": 0},
                {"account_code": "4010", "debit": 0, "credit": total},
            ],
            cursor_obj=cursor,
            entry_date=entry_date,
        )

    total_cost = 0.0
    for item in sale_items or []:
        if len(item) < 2:
            raise ValueError("Sale item is missing its product or quantity.")
        product_id, quantity = item[0], int(item[1])
        if quantity <= 0:
            raise ValueError("Sale item quantity must be positive.")
        if len(item) > 4:
            cost_price = _amount(item[4])
        else:
            cursor.execute("SELECT cost_price FROM products WHERE id = ?", (product_id,))
            product = cursor.fetchone()
            if product is None:
                raise ValueError(f"Product ID {product_id} not found.")
            cost_price = _amount(product[0] or 0)
        total_cost += cost_price * quantity

    if total_cost > 0:
        create_journal_entry(
            description=f"Cost of goods sold for sale #{sale_id}",
            reference=f"COGS-SALE-{sale_id}",
            lines=[
                {"account_code": "5010", "debit": total_cost, "credit": 0},
                {"account_code": "1200", "debit": 0, "credit": total_cost},
            ],
            cursor_obj=cursor,
            entry_date=entry_date,
        )


def record_purchase_accounting(
    purchase_id, total, payment_method, *, cursor_obj=None, entry_date=None
):
    cursor = _cursor(cursor_obj)
    payment_accounts = {
        "Cash": "1010",
        "Bank": "1020",
        "Mobile Money": "1030",
        "Accounts Payable": "2010",
    }
    credit_account_code = payment_accounts.get(payment_method)
    if credit_account_code is None:
        raise ValueError(f"Unknown payment method: {payment_method}")
    total = _amount(total)
    if total == 0:
        return
    create_journal_entry(
        description=f"Purchase #{purchase_id}",
        reference=f"PURCHASE-{purchase_id}",
        lines=[
            {"account_code": "1200", "debit": total, "credit": 0},
            {"account_code": credit_account_code, "debit": 0, "credit": total},
        ],
        cursor_obj=cursor,
        entry_date=entry_date,
    )


def record_customer_payment(
    payment_id, amount, payment_method, *, cursor_obj=None, entry_date=None
):
    cursor = _cursor(cursor_obj)
    payment_accounts = {"Cash": "1010", "Bank": "1020", "Mobile Money": "1030"}
    debit_account_code = payment_accounts.get(payment_method)
    if debit_account_code is None:
        raise ValueError(f"Unknown payment method: {payment_method}")
    amount = _amount(amount, allow_zero=False)
    create_journal_entry(
        description=f"Customer payment #{payment_id}",
        reference=f"PAY-{payment_id}",
        lines=[
            {"account_code": debit_account_code, "debit": amount, "credit": 0},
            {"account_code": "1100", "debit": 0, "credit": amount},
        ],
        cursor_obj=cursor,
        entry_date=entry_date,
    )


def record_supplier_payment(
    payment_id, amount, payment_method, *, cursor_obj=None, entry_date=None
):
    cursor = _cursor(cursor_obj)
    payment_accounts = {"Cash": "1010", "Bank": "1020", "Mobile Money": "1030"}
    credit_account_code = payment_accounts.get(payment_method)
    if credit_account_code is None:
        raise ValueError(f"Unknown payment method: {payment_method}")
    amount = _amount(amount, allow_zero=False)
    create_journal_entry(
        description=f"Supplier payment #{payment_id}",
        reference=f"PAY-{payment_id}",
        lines=[
            {"account_code": "2010", "debit": amount, "credit": 0},
            {"account_code": credit_account_code, "debit": 0, "credit": amount},
        ],
        cursor_obj=cursor,
        entry_date=entry_date,
    )


def record_inventory_value_adjustment(
    adjustment_id, value_difference, description=None, *, cursor_obj=None, entry_date=None
):
    cursor = _cursor(cursor_obj)
    try:
        value_difference = float(value_difference)
    except (TypeError, ValueError) as error:
        raise ValueError("Inventory value adjustment must be numeric.") from error
    if not math.isfinite(value_difference):
        raise ValueError("Inventory value adjustment must be finite.")
    if value_difference == 0:
        return
    amount = abs(value_difference)
    if value_difference > 0:
        lines = [
            {"account_code": "1200", "debit": amount, "credit": 0},
            {"account_code": "5020", "debit": 0, "credit": amount},
        ]
    else:
        lines = [
            {"account_code": "5020", "debit": amount, "credit": 0},
            {"account_code": "1200", "debit": 0, "credit": amount},
        ]
    create_journal_entry(
        description=description or f"Inventory adjustment #{adjustment_id}",
        reference=f"INV-{adjustment_id}",
        lines=lines,
        cursor_obj=cursor,
        entry_date=entry_date,
    )


def record_inventory_adjustment(
    adjustment_id, difference, value, *, cursor_obj=None, entry_date=None
):
    """Post a physical count variance to inventory and operating expenses."""
    difference = int(difference)
    value = _amount(value)
    if difference == 0 or value == 0:
        return
    signed_value = value if difference > 0 else -value
    return record_inventory_value_adjustment(
        adjustment_id, signed_value, cursor_obj=cursor_obj, entry_date=entry_date
    )


def record_opening_inventory(
    product_id, quantity, cost_price, *, cursor_obj=None, entry_date=None
):
    """Recognize initial stock against the owner's opening capital."""
    cursor = _cursor(cursor_obj)
    quantity = int(quantity)
    cost_price = _amount(cost_price)
    if quantity <= 0 or cost_price == 0:
        return
    amount = _amount(quantity * cost_price, allow_zero=False)
    create_journal_entry(
        description=f"Opening inventory for product #{product_id}",
        reference=f"OPENING-STOCK-{product_id}",
        lines=[
            {"account_code": "1200", "debit": amount, "credit": 0},
            {"account_code": "3010", "debit": 0, "credit": amount},
        ],
        cursor_obj=cursor,
        entry_date=entry_date,
    )
