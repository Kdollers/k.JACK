"""Customer receipts and supplier payments, with allocation to invoices.

A payment posts Dr Bank/Cash/Mobile money and Cr Accounts receivable (receipt),
or Dr Accounts payable and Cr the payment account (supplier payment).
Allocations link a payment to the invoices it settles; they never change the
ledger totals. Reversing a payment reverses its journal entry and releases
the allocations.
"""

from .accounts import payment_method_or_raise
from .company import system_account_ids
from .errors import AccountingError, NotFound, ValidationError
from .ledger import next_number, post_entry, reverse_entry
from .money import parse_iso_date
from .timeutil import now_iso, today_iso


def _party(db, party_type, party_id):
    table = "customers" if party_type == "customer" else "suppliers"
    row = db.one(f"SELECT * FROM {table} WHERE id = ?", (party_id,))
    if row is None:
        raise NotFound("customer_not_found" if party_type == "customer" else "supplier_not_found",
                       id=party_id)
    if not row["is_active"]:
        raise AccountingError("party_inactive", name=row["name"])
    return row


def allocated_to_target(db, target_doc_id):
    return db.scalar("SELECT COALESCE(SUM(amount_minor), 0) FROM allocations "
                     "WHERE target_doc_id = ? AND reversed = 0", (target_doc_id,), 0)


def allocated_from_credit(db, credit_doc_id):
    return db.scalar("SELECT COALESCE(SUM(amount_minor), 0) FROM allocations "
                     "WHERE credit_doc_id = ? AND reversed = 0", (credit_doc_id,), 0)


def allocated_from_payment(db, payment_id):
    return db.scalar("SELECT COALESCE(SUM(amount_minor), 0) FROM allocations "
                     "WHERE payment_id = ? AND reversed = 0", (payment_id,), 0)


def outstanding_for_target(db, doc):
    """Amount still open on an invoice (or purchase invoice)."""
    if doc["status"] != "posted":
        return 0
    return doc["total_minor"] - allocated_to_target(db, doc["id"])


def record_payment(ctx, *, party_type, party_id, method_id, amount_minor, date_value,
                   reference=None, notes=None, allocations=None):
    """Record a receipt (customer) or payment (supplier) and allocate it.

    ``allocations`` is a list of {"document_id", "amount_minor"}. If omitted,
    the amount settles the oldest open invoices first. Any remainder is left
    unallocated on the party's account.
    """
    ctx.require("payments.record")
    db = ctx.db
    if party_type not in ("customer", "supplier"):
        raise ValidationError("invalid_party_type")
    if amount_minor <= 0:
        raise ValidationError("invalid_number", field="amount")
    date_value = parse_iso_date(date_value or today_iso(), "payment_date").isoformat()
    with db.transaction():
        party = _party(db, party_type, party_id)
        method = payment_method_or_raise(db, method_id)
        roles = system_account_ids(db)
        control = roles["ar"] if party_type == "customer" else roles["ap"]
        prefix = "payment_in" if party_type == "customer" else "payment_out"
        payment_no = next_number(db, prefix)
        if party_type == "customer":
            lines = [
                {"account_id": method["account_id"], "debit_minor": amount_minor, "credit_minor": 0},
                {"account_id": control, "debit_minor": 0, "credit_minor": amount_minor,
                 "party_type": "customer", "party_id": party_id},
            ]
            description = f"Receipt {payment_no} from {party['name']}"
        else:
            lines = [
                {"account_id": control, "debit_minor": amount_minor, "credit_minor": 0,
                 "party_type": "supplier", "party_id": party_id},
                {"account_id": method["account_id"], "debit_minor": 0, "credit_minor": amount_minor},
            ]
            description = f"Payment {payment_no} to {party['name']}"
        journal = post_entry(ctx, entry_date=date_value, description=description,
                             reference=reference or payment_no, lines=lines,
                             source_type="payment", source_id=None)
        payment_id = db.insert("payments", {
            "payment_no": payment_no,
            "party_type": party_type,
            "customer_id": party_id if party_type == "customer" else None,
            "supplier_id": party_id if party_type == "supplier" else None,
            "payment_method_id": method["id"],
            "amount_minor": amount_minor,
            "payment_date": date_value,
            "reference": (reference or "").strip() or None,
            "notes": (notes or "").strip() or None,
            "status": "posted",
            "journal_entry_id": journal["id"],
            "reversal_entry_id": None,
            "created_by": ctx.user_id,
            "created_at": now_iso(),
        })
        target_type = "sales_invoice" if party_type == "customer" else "purchase_invoice"
        plan = _allocation_plan(db, party_type, party_id, target_type, amount_minor, allocations)
        for target_id, amount in plan:
            db.insert("allocations", {
                "payment_id": payment_id, "credit_doc_id": None, "target_doc_id": target_id,
                "amount_minor": amount, "reversed": 0,
                "created_by": ctx.user_id, "created_at": now_iso(),
            })
        ctx.audit("record", "payments", "payment", payment_id,
                  new_value={"payment_no": payment_no, "amount": amount_minor,
                             "party": party["code"], "allocated": sum(a for _t, a in plan)})
    return payment_view(db, payment_id)


def _allocation_plan(db, party_type, party_id, target_type, amount_minor, allocations):
    if allocations:
        plan = []
        total = 0
        for item in allocations:
            target = db.one("SELECT * FROM documents WHERE id = ?", (int(item["document_id"]),))
            if target is None:
                raise NotFound("document_not_found", id=item["document_id"])
            if target["doc_type"] != target_type or target["status"] != "posted":
                raise ValidationError("allocation_target_invalid")
            if (party_type == "customer" and target["customer_id"] != party_id) or \
               (party_type == "supplier" and target["supplier_id"] != party_id):
                raise ValidationError("allocation_party_mismatch")
            amount = int(item["amount_minor"])
            if amount <= 0:
                raise ValidationError("invalid_number", field="amount")
            open_amount = outstanding_for_target(db, target)
            if amount > open_amount:
                raise AccountingError("allocation_exceeds_balance", number=target["number"],
                                      open=open_amount)
            plan.append((target["id"], amount))
            total += amount
        if total > amount_minor:
            raise AccountingError("allocation_exceeds_payment")
        return plan
    plan = []
    remaining = amount_minor
    column = "customer_id" if party_type == "customer" else "supplier_id"
    open_docs = db.query(
        f"SELECT * FROM documents WHERE doc_type = ? AND status = 'posted' AND {column} = ? "
        "ORDER BY COALESCE(due_date, doc_date), id", (target_type, party_id))
    for doc in open_docs:
        if remaining <= 0:
            break
        open_amount = outstanding_for_target(db, doc)
        if open_amount <= 0:
            continue
        take = min(open_amount, remaining)
        plan.append((doc["id"], take))
        remaining -= take
    return plan


def apply_credit_note(ctx, credit_doc_id, invoice_doc_id, amount_minor):
    """Settle an open invoice with an open credit note of the same customer."""
    ctx.require("sales.post")
    db = ctx.db
    with db.transaction():
        credit = db.one("SELECT * FROM documents WHERE id = ?", (credit_doc_id,))
        invoice = db.one("SELECT * FROM documents WHERE id = ?", (invoice_doc_id,))
        if credit is None or invoice is None:
            raise NotFound("document_not_found", id=credit_doc_id if credit is None else invoice_doc_id)
        if credit["doc_type"] != "sales_credit" or credit["status"] != "posted":
            raise ValidationError("allocation_target_invalid")
        if invoice["doc_type"] != "sales_invoice" or invoice["status"] != "posted":
            raise ValidationError("allocation_target_invalid")
        if credit["customer_id"] != invoice["customer_id"]:
            raise ValidationError("allocation_party_mismatch")
        open_credit = credit["total_minor"] - allocated_from_credit(db, credit["id"])
        open_invoice = outstanding_for_target(db, invoice)
        if amount_minor <= 0 or amount_minor > min(open_credit, open_invoice):
            raise AccountingError("allocation_exceeds_balance", number=credit["number"],
                                  open=min(open_credit, open_invoice))
        db.insert("allocations", {
            "payment_id": None, "credit_doc_id": credit["id"], "target_doc_id": invoice["id"],
            "amount_minor": amount_minor, "reversed": 0,
            "created_by": ctx.user_id, "created_at": now_iso(),
        })
        ctx.audit("apply", "sales", "document", invoice["id"],
                  new_value={"credit": credit["number"], "amount": amount_minor})


def reverse_payment(ctx, payment_id, reason):
    """Reverse a payment: a mirror journal entry, and its allocations are released."""
    ctx.require("payments.reverse")
    db = ctx.db
    with db.transaction():
        payment = db.one("SELECT * FROM payments WHERE id = ?", (payment_id,))
        if payment is None:
            raise NotFound("payment_not_found", id=payment_id)
        if payment["status"] != "posted":
            raise AccountingError("payment_already_reversed", payment_no=payment["payment_no"])
        reversal = reverse_entry(ctx, payment["journal_entry_id"], reason=reason, allow_source=True)
        db.update("allocations", {"reversed": 1}, "payment_id = ?", (payment_id,))
        db.update("payments", {"status": "reversed", "reversal_entry_id": reversal["id"]},
                  "id = ?", (payment_id,))
        ctx.audit("reverse", "payments", "payment", payment_id,
                  old_value={"status": "posted"}, new_value={"status": "reversed", "reason": reason})
    return payment_view(db, payment_id)


def payment_view(db, payment_id):
    row = db.one(
        "SELECT p.*, m.name AS method_name, c.code AS customer_code, c.name AS customer_name, "
        "s.code AS supplier_code, s.name AS supplier_name, je.entry_no AS journal_no "
        "FROM payments p JOIN payment_methods m ON m.id = p.payment_method_id "
        "LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN suppliers s ON s.id = p.supplier_id "
        "JOIN journal_entries je ON je.id = p.journal_entry_id WHERE p.id = ?", (payment_id,))
    if row is None:
        raise NotFound("payment_not_found", id=payment_id)
    row["allocated_minor"] = allocated_from_payment(db, payment_id)
    row["unallocated_minor"] = row["amount_minor"] - row["allocated_minor"]
    row["allocations"] = db.query(
        "SELECT a.amount_minor, d.number, d.doc_type FROM allocations a "
        "JOIN documents d ON d.id = a.target_doc_id WHERE a.payment_id = ? AND a.reversed = 0 "
        "ORDER BY a.id", (payment_id,))
    return row


def list_payments(db, party_type=None, party_id=None, date_from=None, date_to=None, q=None,
                  status=None):
    sql = ("SELECT p.id, p.payment_no, p.party_type, p.payment_date, p.amount_minor, p.status, "
           "p.reference, m.name AS method_name, "
           "COALESCE(c.name, s.name) AS party_name, COALESCE(c.code, s.code) AS party_code "
           "FROM payments p JOIN payment_methods m ON m.id = p.payment_method_id "
           "LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN suppliers s ON s.id = p.supplier_id "
           "WHERE 1=1")
    params = []
    if party_type:
        sql += " AND p.party_type = ?"
        params.append(party_type)
    if party_id:
        sql += " AND (p.customer_id = ? OR p.supplier_id = ?)"
        params += [int(party_id), int(party_id)]
    if date_from:
        sql += " AND p.payment_date >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND p.payment_date <= ?"
        params.append(date_to)
    if status:
        sql += " AND p.status = ?"
        params.append(status)
    if q:
        sql += " AND (p.payment_no LIKE ? OR p.reference LIKE ? OR c.name LIKE ? OR s.name LIKE ?)"
        params += [f"%{q}%"] * 4
    sql += " ORDER BY p.payment_date DESC, p.id DESC"
    return db.query(sql, params)
