"""Small shared helpers for the terminal module menus."""

from datetime import date

from database import connection, cursor
from languages import t
from modules.accounting_repository import AccountingRepository


def repository():
    return AccountingRepository(connection, cursor)


def ask_amount(label):
    while True:
        value = input(f"{label} ").strip().replace(",", "")
        try:
            amount = float(value)
            if amount < 0:
                print(t("invalid_amount"))
                continue
            return amount
        except ValueError:
            print(t("invalid_amount"))


def ask_date(label, allow_empty=False):
    while True:
        value = input(f"{label} ").strip()
        if not value and allow_empty:
            return ""
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            print(t("invalid_date"))


def find_by_id_or_code(rows, term, code_key):
    term = str(term).strip()
    for row in rows:
        if str(row["id"]) == term or str(row.get(code_key) or "") == term:
            return row
    return None


def error_or_none(func, *args, **kwargs):
    """Run a repository call; print and swallow a ValueError so the menu survives."""
    try:
        return func(*args, **kwargs)
    except ValueError as error:
        print(str(error))
        return None
