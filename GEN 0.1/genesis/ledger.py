"""Double-entry engine: balanced posting, reversal, balances and integrity checks.

Every posted journal entry is immutable (database triggers). Corrections are
made with reversing entries. Total debits must equal total credits and every
line must be exactly one of debit or credit.
"""

from .errors import AccountingError, NotFound, ValidationError
from .money import parse_iso_date
from .timeutil import now_iso

NORMAL_SIDE_SIGN = {"asset": 1, "expense": 1, "cogs": 1,
                    "liability": -1, "equity": -1, "revenue": -1}


def next_number(db, sequence):
    """Allocate the next document number inside the current transaction."""
    row = db.one("SELECT prefix, next_value FROM sequences WHERE name = ?", (sequence,))
    if row is None:
        raise NotFound("unknown_sequence", name=sequence)
    value = row["next_value"]
    db.execute("UPDATE sequences SET next_value = next_value + 1 WHERE name = ?", (sequence,))
    return f"{row['prefix']}-{value:06d}"


def lock_date(db):
    value = db.scalar("SELECT value FROM settings WHERE key = 'lock_date'")
    return value or None


def assert_period_open(db, entry_date):
    locked = lock_date(db)
    if locked and entry_date <= locked:
        raise AccountingError("period_locked", lock_date=locked)


def account_balance(db, account_id, through=None, party_type=None, party_id=None):
    """Signed balance (debit minus credit) for an account, optionally by party."""
    sql = ("SELECT COALESCE(SUM(jl.debit_minor), 0) - COALESCE(SUM(jl.credit_minor), 0) "
           "FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id "
           "WHERE jl.account_id = ?")
    params = [account_id]
    if through is not None:
        sql += " AND je.entry_date <= ?"
        params.append(through)
    if party_type is not None:
        sql += " AND jl.party_type = ? AND jl.party_id = ?"
        params += [party_type, party_id]
    return int(db.scalar(sql, params, 0))


def _normalize_lines(db, lines):
    if not isinstance(lines, (list, tuple)) or len(lines) < 2:
        raise AccountingError("journal_min_lines")
    normalized = []
    total_debit = total_credit = 0
    for raw in lines:
        try:
            account_id = int(raw["account_id"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValidationError("journal_line_invalid") from error
        debit = int(raw.get("debit_minor") or 0)
        credit = int(raw.get("credit_minor") or 0)
        if debit < 0 or credit < 0:
            raise AccountingError("journal_line_invalid")
        if (debit > 0) == (credit > 0):
            raise AccountingError("journal_line_invalid")
        account = db.one("SELECT * FROM accounts WHERE id = ?", (account_id,))
        if account is None:
            raise NotFound("account_not_found", id=account_id)
        if not account["is_active"]:
            raise AccountingError("account_inactive", code=account["code"])
        if account["is_header"]:
            raise AccountingError("account_not_postable", code=account["code"])
        party_type = raw.get("party_type") or None
        party_id = raw.get("party_id")
        role = account["system_role"]
        if role == "ar":
            if party_type != "customer" or not party_id:
                raise AccountingError("party_required", account=account["code"])
            if not db.one("SELECT 1 FROM customers WHERE id = ?", (int(party_id),)):
                raise NotFound("customer_not_found", id=party_id)
        elif role == "ap":
            if party_type != "supplier" or not party_id:
                raise AccountingError("party_required", account=account["code"])
            if not db.one("SELECT 1 FROM suppliers WHERE id = ?", (int(party_id),)):
                raise NotFound("supplier_not_found", id=party_id)
        elif party_type is not None:
            raise AccountingError("party_not_allowed", account=account["code"])
        if party_type is None:
            party_id = None
        else:
            party_id = int(party_id)
        total_debit += debit
        total_credit += credit
        normalized.append({
            "account_id": account_id,
            "debit_minor": debit,
            "credit_minor": credit,
            "party_type": party_type,
            "party_id": party_id,
            "description": (raw.get("description") or None),
        })
    if total_debit != total_credit or total_debit == 0:
        raise AccountingError("journal_unbalanced", debit=total_debit, credit=total_credit)
    return normalized, total_debit


def post_entry(ctx, *, entry_date, description, lines, reference=None,
               source_type=None, source_id=None):
    """Post a balanced entry. Must be called inside a transaction."""
    db = ctx.db
    entry_date = parse_iso_date(entry_date, "entry_date").isoformat()
    assert_period_open(db, entry_date)
    description = (description or "").strip()
    if not description:
        raise ValidationError("field_required", field="description")
    normalized, total = _normalize_lines(db, lines)
    entry_no = next_number(db, "journal")
    entry_id = db.insert("journal_entries", {
        "entry_no": entry_no,
        "entry_date": entry_date,
        "reference": reference,
        "description": description,
        "source_type": source_type,
        "source_id": source_id,
        "reversal_of_id": None,
        "total_minor": total,
        "created_by": ctx.user_id,
        "created_at": now_iso(),
    })
    for line_no, line in enumerate(normalized, start=1):
        db.insert("journal_lines", {"entry_id": entry_id, "line_no": line_no, **line})
    ctx.audit("post", "accounting", "journal_entry", entry_id,
              new_value={"entry_no": entry_no, "date": entry_date, "total": total,
                         "reference": reference},
              details=description)
    return {"id": entry_id, "entry_no": entry_no, "total_minor": total}


def reverse_entry(ctx, entry_id, *, reason, reversal_date=None, allow_source=False):
    """Create a mirror entry that cancels ``entry_id``. Never edits the original."""
    ctx.require("accounting.reverse")
    db = ctx.db
    entry = db.one("SELECT * FROM journal_entries WHERE id = ?", (entry_id,))
    if entry is None:
        raise NotFound("journal_entry_not_found", id=entry_id)
    if entry["reversal_of_id"] is not None:
        raise AccountingError("cannot_reverse_reversal")
    if db.one("SELECT 1 FROM journal_entries WHERE reversal_of_id = ?", (entry_id,)):
        raise AccountingError("already_reversed", entry_no=entry["entry_no"])
    if entry["source_type"] and not allow_source:
        raise AccountingError("reverse_source_document", entry_no=entry["entry_no"])
    date_value = parse_iso_date(reversal_date or entry["entry_date"], "entry_date").isoformat()
    assert_period_open(db, date_value)
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("field_required", field="reason")
    lines = db.query("SELECT * FROM journal_lines WHERE entry_id = ? ORDER BY line_no", (entry_id,))
    mirrored = []
    for line in lines:
        mirrored.append({
            "account_id": line["account_id"],
            "debit_minor": line["credit_minor"],
            "credit_minor": line["debit_minor"],
            "party_type": line["party_type"],
            "party_id": line["party_id"],
            "description": f"Reversal of {entry['entry_no']}",
        })
    entry_no = next_number(db, "journal")
    reversal_id = db.insert("journal_entries", {
        "entry_no": entry_no,
        "entry_date": date_value,
        "reference": entry["reference"],
        "description": f"Reversal of {entry['entry_no']}: {reason}",
        "source_type": entry["source_type"] if allow_source else None,
        "source_id": entry["source_id"] if allow_source else None,
        "reversal_of_id": entry_id,
        "total_minor": entry["total_minor"],
        "created_by": ctx.user_id,
        "created_at": now_iso(),
    })
    for line_no, line in enumerate(mirrored, start=1):
        db.insert("journal_lines", {"entry_id": reversal_id, "line_no": line_no, **line})
    ctx.audit("reverse", "accounting", "journal_entry", entry_id,
              old_value={"entry_no": entry["entry_no"]},
              new_value={"reversal_entry_no": entry_no, "reason": reason})
    return {"id": reversal_id, "entry_no": entry_no}


def verify_ledger(db):
    """Return a list of integrity problems. An empty list means the books are sound."""
    problems = []
    for entry in db.query("SELECT * FROM journal_entries"):
        sums = db.one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(debit_minor), 0) AS dr, "
            "COALESCE(SUM(credit_minor), 0) AS cr FROM journal_lines WHERE entry_id = ?",
            (entry["id"],))
        if sums["n"] < 2 or sums["dr"] != sums["cr"] or sums["dr"] != entry["total_minor"]:
            problems.append({"type": "unbalanced_entry", "entry_no": entry["entry_no"],
                             "debit": sums["dr"], "credit": sums["cr"]})
    totals = db.one("SELECT COALESCE(SUM(debit_minor), 0) AS dr, "
                    "COALESCE(SUM(credit_minor), 0) AS cr FROM journal_lines")
    if totals["dr"] != totals["cr"]:
        problems.append({"type": "ledger_out_of_balance", "debit": totals["dr"], "credit": totals["cr"]})
    for row in db.query(
            "SELECT jl.id FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id "
            "WHERE a.system_role = 'ar' AND (jl.party_type IS NOT 'customer' OR jl.party_id IS NULL)"):
        problems.append({"type": "ar_line_without_customer", "line_id": row["id"]})
    for row in db.query(
            "SELECT jl.id FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id "
            "WHERE a.system_role = 'ap' AND (jl.party_type IS NOT 'supplier' OR jl.party_id IS NULL)"):
        problems.append({"type": "ap_line_without_supplier", "line_id": row["id"]})
    return problems


def trial_balance_rows(db, start=None, end=None):
    """Per-account movements and balances for a period (inclusive dates)."""
    rows = db.query("SELECT id, code, name, account_type, is_header FROM accounts ORDER BY code")
    result = []
    for account in rows:
        opening = account_balance(db, account["id"], through=(
            _day_before(start) if start else None))
        movement = db.one(
            "SELECT COALESCE(SUM(jl.debit_minor), 0) AS dr, COALESCE(SUM(jl.credit_minor), 0) AS cr "
            "FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id "
            "WHERE jl.account_id = ? AND (? IS NULL OR je.entry_date >= ?) AND (? IS NULL OR je.entry_date <= ?)",
            (account["id"], start, start, end, end))
        result.append({
            **account,
            "opening_minor": opening,
            "debit_minor": movement["dr"],
            "credit_minor": movement["cr"],
            "closing_minor": opening + movement["dr"] - movement["cr"],
        })
    return result


def _day_before(iso_date):
    from datetime import date, timedelta
    return (date.fromisoformat(iso_date) - timedelta(days=1)).isoformat()
