"""Sales and purchase documents: quotes, orders, invoices, credit notes, purchase orders,
purchase invoices and purchase returns.

Lifecycle:
  quote / order (sales or purchase): draft -> confirmed -> closed (converted) | cancelled
  invoice / credit note / return:    draft -> posted

Posting builds one balanced journal entry and performs every stock movement
in the same database transaction. If anything fails, nothing is kept.
"""

from datetime import date, timedelta

from .accounts import tax_rate_or_none
from .company import currency_info, read_settings, system_account_ids
from .config import BPS, QTY_SCALE
from .errors import AccountingError, NotFound, ValidationError
from .inventory import issue, on_hand, receive, unit_cost, value_for_quantity
from .ledger import assert_period_open, next_number, post_entry
from .money import (div_round, format_qty, parse_iso_date, parse_money, parse_percent_bps,
                    parse_quantity)
from .payments import allocated_to_target, outstanding_for_target, record_payment
from .timeutil import now_iso, today_iso

SALES_TYPES = ("sales_quote", "sales_order", "sales_invoice", "sales_credit")
PURCHASE_TYPES = ("purchase_order", "purchase_invoice", "purchase_return")
ALL_TYPES = SALES_TYPES + PURCHASE_TYPES

# Source document type that each document type may be created from.
SOURCE_TYPE = {
    "sales_order": "sales_quote",
    "sales_invoice": "sales_order",
    "sales_credit": "sales_invoice",
    "purchase_invoice": "purchase_order",
    "purchase_return": "purchase_invoice",
}
# Document type produced by a conversion of a given source type.
CONVERSION = {
    "sales_quote": "sales_order",
    "sales_order": "sales_invoice",
    "purchase_order": "purchase_invoice",
}
POSTABLE = ("sales_invoice", "sales_credit", "purchase_invoice", "purchase_return")
POST_PERMISSION = {
    "sales_invoice": "sales.post", "sales_credit": "sales.post",
    "purchase_invoice": "purchases.post", "purchase_return": "purchases.post",
}


def _is_sales(doc_type):
    return doc_type.startswith("sales_")


def _manage_permission(doc_type):
    return "sales.manage" if _is_sales(doc_type) else "purchases.manage"


def _view_permission(doc_type):
    return "sales.view" if _is_sales(doc_type) else "purchases.view"


def compute_line(qty_scaled, unit_price_minor, discount_bps, tax_bps, prices_include_tax):
    """Return (net, tax, total) in minor units for one line.

    Discount applies to the price before tax. With tax-inclusive prices the
    entered amount is the gross total and the net is backed out of it.
    """
    base = div_round(qty_scaled * unit_price_minor * (BPS - discount_bps), QTY_SCALE * BPS)
    if prices_include_tax:
        gross = base
        net = div_round(gross * BPS, BPS + tax_bps)
        return net, gross - net, gross
    net = base
    tax = div_round(net * tax_bps, BPS)
    return net, tax, net + tax


def _prices_inclusive(db):
    return read_settings(db).get("prices_include_tax", "0") == "1"


def _doc_row(db, doc_id):
    row = db.one("SELECT * FROM documents WHERE id = ?", (doc_id,))
    if row is None:
        raise NotFound("document_not_found", id=doc_id)
    return row


def _default_warehouse(db):
    row = db.one("SELECT id FROM warehouses WHERE is_active = 1 ORDER BY id LIMIT 1")
    if row is None:
        raise AccountingError("no_active_warehouse")
    return row["id"]


def _party_table(doc_type):
    return "customers" if _is_sales(doc_type) else "suppliers"


def _check_party(db, doc_type, party_id):
    table = _party_table(doc_type)
    row = db.one(f"SELECT * FROM {table} WHERE id = ?", (party_id,))
    if row is None:
        raise NotFound("customer_not_found" if _is_sales(doc_type) else "supplier_not_found",
                       id=party_id)
    if not row["is_active"]:
        raise AccountingError("party_inactive", name=row["name"])
    return row


def _build_lines(db, doc_type, raw_lines, source_doc, decimals, inclusive):
    if not isinstance(raw_lines, list) or not raw_lines:
        raise ValidationError("document_no_lines")
    if len(raw_lines) > 500:
        raise ValidationError("document_too_many_lines")
    built = []
    for index, raw in enumerate(raw_lines, start=1):
        source_line = None
        if raw.get("source_line_id"):
            source_line = db.one(
                "SELECT dl.*, d.doc_type AS source_type, d.id AS source_document_id "
                "FROM document_lines dl JOIN documents d ON d.id = dl.document_id "
                "WHERE dl.id = ?", (int(raw["source_line_id"]),))
            if source_line is None:
                raise NotFound("document_line_not_found", id=raw["source_line_id"])
            if source_doc is None or source_line["source_document_id"] != source_doc["id"]:
                raise ValidationError("source_line_mismatch")
        qty = parse_quantity(raw.get("quantity"), field="quantity")
        if source_line is not None:
            remaining = source_line["quantity_scaled"] - source_line["processed_qty_scaled"]
            if qty > remaining:
                raise AccountingError("quantity_exceeds_remaining",
                                      remaining=format_qty(remaining))
            product_id = source_line["product_id"]
            description = source_line["description"]
            account_id = source_line["account_id"]
            unit_price = source_line["unit_price_minor"]
            discount_bps = source_line["discount_bps"]
            tax_rate_id = source_line["tax_rate_id"]
        else:
            product_id = int(raw["product_id"]) if raw.get("product_id") else None
            product = None
            if product_id is not None:
                product = db.one("SELECT * FROM products WHERE id = ?", (product_id,))
                if product is None:
                    raise NotFound("product_not_found", id=product_id)
                if not product["is_active"]:
                    raise AccountingError("product_inactive", sku=product["sku"])
            discount_bps = parse_percent_bps(raw.get("discount_percent"), field="discount")
            if raw.get("unit_price") in (None, ""):
                if product is None:
                    raise ValidationError("field_required", field="unit_price")
                default_price = product["selling_price_minor"] if _is_sales(doc_type) else product["cost_price_minor"]
                unit_price = default_price
            else:
                unit_price = parse_money(raw.get("unit_price"), decimals, field="unit_price")
            description = (raw.get("description") or "").strip()
            if product is not None and not description:
                description = product["name"]
            if not description:
                raise ValidationError("field_required", field="description")
            if product is not None:
                category = db.one("SELECT * FROM categories WHERE id = ?", (product["category_id"],))
                if _is_sales(doc_type):
                    account_id = category["revenue_account_id"]
                elif product["track_stock"]:
                    account_id = category["inventory_account_id"]
                else:
                    account_id = raw.get("account_id")
                    if not account_id:
                        raise ValidationError("field_required", field="account_id")
                if account_id is None:
                    raise AccountingError("category_missing_account", category=category["name"])
            else:
                account_id = raw.get("account_id")
                if not account_id:
                    raise ValidationError("field_required", field="account_id")
            if "tax_rate_id" in raw:
                tax_rate_id = raw.get("tax_rate_id") or None
            else:
                tax_rate_id = product["tax_rate_id"] if product is not None else None
        account = db.one("SELECT * FROM accounts WHERE id = ?", (int(account_id),))
        if account is None:
            raise NotFound("account_not_found", id=account_id)
        if account["is_header"] or not account["is_active"]:
            raise AccountingError("account_not_postable", code=account["code"])
        tax = tax_rate_or_none(db, tax_rate_id)
        if tax is not None and not tax["is_active"]:
            raise AccountingError("tax_rate_inactive", name=tax["name"])
        tax_bps = tax["rate_bps"] if tax is not None else 0
        if tax is not None and tax_bps > 0:
            needed = "sales_account_id" if _is_sales(doc_type) else "purchase_account_id"
            if tax[needed] is None:
                raise AccountingError("tax_accounts_required", name=tax["name"])
        net, tax_amount, total = compute_line(qty, unit_price, discount_bps, tax_bps, inclusive)
        built.append({
            "line_no": index,
            "product_id": product_id,
            "account_id": account["id"],
            "description": description,
            "quantity_scaled": qty,
            "unit_price_minor": unit_price,
            "discount_bps": discount_bps,
            "tax_rate_id": tax["id"] if tax is not None else None,
            "tax_bps": tax_bps,
            "net_minor": net,
            "tax_minor": tax_amount,
            "total_minor": total,
            "source_line_id": source_line["id"] if source_line is not None else None,
            "processed_qty_scaled": 0,
            "cost_minor": 0,
            "processed_cost_minor": 0,
        })
    return built


def _totals(lines):
    return (sum(l["net_minor"] for l in lines), sum(l["tax_minor"] for l in lines),
            sum(l["total_minor"] for l in lines))


def _resolve_source(db, doc_type, source_id):
    if source_id in (None, "", 0):
        return None
    source = _doc_row(db, int(source_id))
    expected = SOURCE_TYPE.get(doc_type)
    if expected is None or source["doc_type"] != expected:
        raise ValidationError("source_type_invalid")
    if source["status"] not in ("confirmed", "posted", "closed"):
        raise AccountingError("source_not_ready", number=source["number"])
    return source


def save_document(ctx, data, doc_id=None):
    """Create or update a draft document. Posted documents are never edited."""
    db = ctx.db
    if doc_id is None:
        doc_type = data.get("doc_type")
        if doc_type not in ALL_TYPES:
            raise ValidationError("invalid_document_type")
    else:
        existing = _doc_row(db, doc_id)
        doc_type = existing["doc_type"]
        if existing["status"] != "draft":
            raise AccountingError("document_not_draft", number=existing["number"])
    ctx.require(_manage_permission(doc_type))
    decimals, _ = currency_info(db)
    inclusive = _prices_inclusive(db)
    with db.transaction():
        doc_date = parse_iso_date(data.get("doc_date") or today_iso(), "doc_date").isoformat()
        party_key = "customer_id" if _is_sales(doc_type) else "supplier_id"
        party_id = data.get(party_key)
        if not party_id:
            raise ValidationError("field_required", field=party_key)
        party = _check_party(db, doc_type, int(party_id))
        terms = party["payment_terms_days"]
        due_date = data.get("due_date")
        if due_date in (None, ""):
            due_date = (date.fromisoformat(doc_date) + timedelta(days=terms)).isoformat()
        else:
            due_date = parse_iso_date(due_date, "due_date").isoformat()
        source = _resolve_source(db, doc_type, data.get("source_id"))
        warehouse_id = data.get("warehouse_id") or None
        if warehouse_id is None:
            warehouse_id = _default_warehouse(db)
        warehouse = db.one("SELECT * FROM warehouses WHERE id = ?", (int(warehouse_id),))
        if warehouse is None:
            raise NotFound("warehouse_not_found", id=warehouse_id)
        if not warehouse["is_active"]:
            raise AccountingError("warehouse_inactive", code=warehouse["code"])
        method_id = data.get("payment_method_id") or None
        if method_id is not None:
            method = db.one("SELECT * FROM payment_methods WHERE id = ?", (int(method_id),))
            if method is None:
                raise NotFound("payment_method_not_found", id=method_id)
            method_id = method["id"]
        restock = 1 if data.get("restock") else 0
        if restock and doc_type != "sales_credit":
            raise ValidationError("restock_not_allowed")
        lines = _build_lines(db, doc_type, data.get("lines"), source, decimals, inclusive)
        subtotal, tax_total, total = _totals(lines)
        if doc_id is None:
            number = next_number(db, doc_type)
            stamp = now_iso()
            doc_id = db.insert("documents", {
                "doc_type": doc_type, "number": number, "doc_date": doc_date,
                "due_date": due_date,
                "customer_id": party["id"] if _is_sales(doc_type) else None,
                "supplier_id": party["id"] if not _is_sales(doc_type) else None,
                "warehouse_id": warehouse["id"], "status": "draft",
                "reference": (data.get("reference") or "").strip() or None,
                "notes": (data.get("notes") or "").strip() or None,
                "subtotal_minor": subtotal, "tax_minor": tax_total, "total_minor": total,
                "payment_method_id": method_id, "restock": restock,
                "source_id": source["id"] if source else None,
                "journal_entry_id": None, "created_by": ctx.user_id,
                "created_at": stamp, "updated_at": stamp, "posted_by": None, "posted_at": None,
            })
            action = "create"
            before = None
        else:
            before = dict(existing)
            number = existing["number"]
            db.update("documents", {
                "doc_date": doc_date, "due_date": due_date,
                "customer_id": party["id"] if _is_sales(doc_type) else None,
                "supplier_id": party["id"] if not _is_sales(doc_type) else None,
                "warehouse_id": warehouse["id"],
                "reference": (data.get("reference") or "").strip() or None,
                "notes": (data.get("notes") or "").strip() or None,
                "subtotal_minor": subtotal, "tax_minor": tax_total, "total_minor": total,
                "payment_method_id": method_id, "restock": restock,
                "source_id": source["id"] if source else existing["source_id"],
                "updated_at": now_iso(),
            }, "id = ?", (doc_id,))
            db.execute("DELETE FROM document_lines WHERE document_id = ?", (doc_id,))
            action = "update"
        for line in lines:
            db.insert("document_lines", {"document_id": doc_id, **line})
        ctx.audit(action, "sales" if _is_sales(doc_type) else "purchases", doc_type, doc_id,
                  old_value=before and {"total": before["total_minor"], "status": before["status"]},
                  new_value={"number": number, "total": total, "lines": len(lines)})
    return document_view(db, doc_id)


def _lock_check(ctx, doc):
    assert_period_open(ctx.db, doc["doc_date"])


def _load_lines(db, doc_id):
    return db.query("SELECT * FROM document_lines WHERE document_id = ? ORDER BY line_no", (doc_id,))


def _post_entries(lines_by_account):
    """Turn {(account_id, party_type, party_id): [debit, credit]} into journal lines."""
    result = []
    for (account_id, party_type, party_id), (debit, credit) in lines_by_account.items():
        net = debit - credit
        if net == 0:
            continue
        result.append({
            "account_id": account_id,
            "debit_minor": net if net > 0 else 0,
            "credit_minor": -net if net < 0 else 0,
            "party_type": party_type,
            "party_id": party_id,
        })
    return result


class _Ledger:
    """Collects debits/credits per account and produces balanced journal lines."""

    def __init__(self, roles, party=None):
        self.roles = roles
        self.party = party  # (party_type, party_id) for AR/AP lines
        self.data = {}

    def add(self, account_id, debit=0, credit=0):
        if not account_id or (debit == 0 and credit == 0):
            return
        party = None
        if account_id in (self.roles.get("ar"), self.roles.get("ap")) and self.party:
            party = self.party
        slot = self.data.setdefault((account_id, party[0] if party else None,
                                     party[1] if party else None), [0, 0])
        slot[0] += debit
        slot[1] += credit

    def lines(self):
        return _post_entries(self.data)


def _post_sales_invoice(ctx, doc, lines):
    db = ctx.db
    roles = system_account_ids(db)
    ledger = _Ledger(roles, ("customer", doc["customer_id"]))
    for line in lines:
        product = db.one("SELECT * FROM products WHERE id = ?", (line["product_id"],)) if line["product_id"] else None
        if product is not None and product["track_stock"]:
            category = db.one("SELECT * FROM categories WHERE id = ?", (product["category_id"],))
            cost = issue(db, user_id=ctx.user_id, product_id=product["id"],
                         warehouse_id=doc["warehouse_id"], qty_scaled=line["quantity_scaled"],
                         date_value=doc["doc_date"], movement_type="sale",
                         reference=doc["number"], document_id=doc["id"])["cost_minor"]
            if category["cogs_account_id"] is None or category["inventory_account_id"] is None:
                raise AccountingError("category_missing_account", category=category["name"])
            ledger.add(category["cogs_account_id"], debit=cost)
            ledger.add(category["inventory_account_id"], credit=cost)
            db.update("document_lines", {"cost_minor": cost}, "id = ?", (line["id"],))
        ledger.add(line["account_id"], credit=line["net_minor"])
        if line["tax_minor"]:
            tax = tax_rate_or_none(db, line["tax_rate_id"])
            ledger.add(tax["sales_account_id"], credit=line["tax_minor"])
        _advance_source(db, line)
    ledger.add(roles["ar"], debit=doc["total_minor"])
    return ledger.lines()


def _advance_source(db, line):
    if line["source_line_id"] is None:
        return
    source = db.one("SELECT * FROM document_lines WHERE id = ?", (line["source_line_id"],))
    db.update("document_lines", {
        "processed_qty_scaled": source["processed_qty_scaled"] + line["quantity_scaled"],
    }, "id = ?", (source["id"],))
    _close_if_complete(db, source["document_id"])


def _close_if_complete(db, doc_id):
    doc = _doc_row(db, doc_id)
    if doc["doc_type"] not in ("sales_order", "purchase_order") or doc["status"] != "confirmed":
        return
    open_lines = db.scalar(
        "SELECT COUNT(*) FROM document_lines WHERE document_id = ? AND processed_qty_scaled < quantity_scaled",
        (doc_id,), 0)
    if open_lines == 0:
        db.update("documents", {"status": "closed", "updated_at": now_iso()}, "id = ?", (doc_id,))


def _post_sales_credit(ctx, doc, lines):
    db = ctx.db
    roles = system_account_ids(db)
    ledger = _Ledger(roles, ("customer", doc["customer_id"]))
    for line in lines:
        product = db.one("SELECT * FROM products WHERE id = ?", (line["product_id"],)) if line["product_id"] else None
        restock_value = None
        if line["source_line_id"] is not None:
            source = db.one("SELECT * FROM document_lines WHERE id = ?", (line["source_line_id"],))
            remaining_qty = source["quantity_scaled"] - source["processed_qty_scaled"]
            remaining_cost = source["cost_minor"] - source["processed_cost_minor"]
            if line["quantity_scaled"] == remaining_qty:
                cost_back = remaining_cost
            else:
                cost_back = div_round(source["cost_minor"] * line["quantity_scaled"], source["quantity_scaled"])
            db.update("document_lines", {
                "processed_qty_scaled": source["processed_qty_scaled"] + line["quantity_scaled"],
                "processed_cost_minor": source["processed_cost_minor"] + cost_back,
            }, "id = ?", (source["id"],))
            restock_value = cost_back
        if doc["restock"] and product is not None and product["track_stock"]:
            if restock_value is None:
                restock_value = value_for_quantity(line["quantity_scaled"], unit_cost(db, product["id"], doc["warehouse_id"]))
            category = db.one("SELECT * FROM categories WHERE id = ?", (product["category_id"],))
            receive(db, user_id=ctx.user_id, product_id=product["id"], warehouse_id=doc["warehouse_id"],
                    qty_scaled=line["quantity_scaled"], value_minor=restock_value,
                    date_value=doc["doc_date"], movement_type="sale_return",
                    reference=doc["number"], document_id=doc["id"])
            ledger.add(category["inventory_account_id"], debit=restock_value)
            ledger.add(category["cogs_account_id"], credit=restock_value)
            db.update("document_lines", {"cost_minor": restock_value}, "id = ?", (line["id"],))
        ledger.add(line["account_id"], debit=line["net_minor"])
        if line["tax_minor"]:
            tax = tax_rate_or_none(db, line["tax_rate_id"])
            ledger.add(tax["sales_account_id"], debit=line["tax_minor"])
    ledger.add(roles["ar"], credit=doc["total_minor"])
    return ledger.lines()


def _post_purchase_invoice(ctx, doc, lines):
    db = ctx.db
    roles = system_account_ids(db)
    ledger = _Ledger(roles, ("supplier", doc["supplier_id"]))
    for line in lines:
        product = db.one("SELECT * FROM products WHERE id = ?", (line["product_id"],)) if line["product_id"] else None
        if product is not None and product["track_stock"]:
            receive(db, user_id=ctx.user_id, product_id=product["id"], warehouse_id=doc["warehouse_id"],
                    qty_scaled=line["quantity_scaled"], value_minor=line["net_minor"],
                    date_value=doc["doc_date"], movement_type="purchase",
                    reference=doc["number"], document_id=doc["id"])
            db.update("document_lines", {"cost_minor": line["net_minor"]}, "id = ?", (line["id"],))
        ledger.add(line["account_id"], debit=line["net_minor"])
        if line["tax_minor"]:
            tax = tax_rate_or_none(db, line["tax_rate_id"])
            ledger.add(tax["purchase_account_id"], debit=line["tax_minor"])
        _advance_source(db, line)
    ledger.add(roles["ap"], credit=doc["total_minor"])
    return ledger.lines()


def _post_purchase_return(ctx, doc, lines):
    db = ctx.db
    roles = system_account_ids(db)
    ledger = _Ledger(roles, ("supplier", doc["supplier_id"]))
    for line in lines:
        product = db.one("SELECT * FROM products WHERE id = ?", (line["product_id"],)) if line["product_id"] else None
        if product is not None and product["track_stock"]:
            cost = issue(db, user_id=ctx.user_id, product_id=product["id"], warehouse_id=doc["warehouse_id"],
                         qty_scaled=line["quantity_scaled"], date_value=doc["doc_date"],
                         movement_type="purchase_return", reference=doc["number"],
                         document_id=doc["id"])["cost_minor"]
            category = db.one("SELECT * FROM categories WHERE id = ?", (product["category_id"],))
            ledger.add(category["inventory_account_id"], credit=cost)
            difference = line["net_minor"] - cost
            if difference > 0:
                ledger.add(roles["stock_adjustment"], credit=difference)
            elif difference < 0:
                ledger.add(roles["stock_adjustment"], debit=-difference)
            db.update("document_lines", {"cost_minor": cost}, "id = ?", (line["id"],))
        else:
            ledger.add(line["account_id"], credit=line["net_minor"])
        if line["tax_minor"]:
            tax = tax_rate_or_none(db, line["tax_rate_id"])
            ledger.add(tax["purchase_account_id"], credit=line["tax_minor"])
        _advance_source(db, line)
    ledger.add(roles["ap"], debit=doc["total_minor"])
    return ledger.lines()


POSTERS = {
    "sales_invoice": _post_sales_invoice,
    "sales_credit": _post_sales_credit,
    "purchase_invoice": _post_purchase_invoice,
    "purchase_return": _post_purchase_return,
}


def _check_stock_available(db, doc, lines):
    """Pre-flight check so the user gets a clear message before any movement happens."""
    needed = {}
    for line in lines:
        if line["product_id"] is None:
            continue
        product = db.one("SELECT * FROM products WHERE id = ?", (line["product_id"],))
        if not product["is_active"]:
            raise AccountingError("product_inactive", sku=product["sku"])
        if not product["track_stock"]:
            continue
        outgoing = (doc["doc_type"] in ("sales_invoice", "purchase_return"))
        if outgoing:
            needed[product["id"]] = needed.get(product["id"], 0) + line["quantity_scaled"]
    for product_id, qty in needed.items():
        available, _ = on_hand(db, product_id, doc["warehouse_id"])
        if available < qty:
            sku = db.one("SELECT sku FROM products WHERE id = ?", (product_id,))["sku"]
            raise AccountingError("insufficient_stock", sku=sku,
                                  available=format_qty(available), requested=format_qty(qty))


def post_document(ctx, doc_id, payment=None):
    """Post a draft invoice, credit note, purchase invoice or purchase return.

    ``payment`` (optional, invoices only): {"payment_method_id", "amount_minor", "date"}
    records a receipt or payment against the document in the same transaction.
    """
    db = ctx.db
    doc = _doc_row(db, doc_id)
    if doc["doc_type"] not in POSTABLE:
        raise AccountingError("document_not_postable", number=doc["number"])
    ctx.require(POST_PERMISSION[doc["doc_type"]])
    if doc["status"] != "draft":
        raise AccountingError("document_already_posted", number=doc["number"])
    _lock_check(ctx, doc)
    with db.transaction():
        doc = _doc_row(db, doc_id)
        party = _check_party(db, doc["doc_type"], doc["customer_id"] or doc["supplier_id"])
        lines = _load_lines(db, doc_id)
        if not lines:
            raise ValidationError("document_no_lines")
        if doc["total_minor"] <= 0:
            raise AccountingError("document_total_zero", number=doc["number"])
        for line in lines:
            if line["source_line_id"] is None:
                continue
            source = db.one("SELECT * FROM document_lines WHERE id = ?", (line["source_line_id"],))
            remaining = source["quantity_scaled"] - source["processed_qty_scaled"]
            if line["quantity_scaled"] > remaining:
                raise AccountingError("quantity_exceeds_remaining", remaining=format_qty(remaining))
        if doc["doc_type"] == "sales_invoice":
            _check_credit_limit(db, party, doc["total_minor"])
        _check_stock_available(db, doc, lines)
        entry_lines = POSTERS[doc["doc_type"]](ctx, doc, lines)
        journal = post_entry(ctx, entry_date=doc["doc_date"],
                             description=f"{_title(doc['doc_type'])} {doc['number']}",
                             reference=doc["number"], lines=entry_lines,
                             source_type="document", source_id=doc["id"])
        if doc["doc_type"] == "sales_credit" and doc["source_id"]:
            _auto_apply_credit(ctx, doc)
        db.update("documents", {
            "status": "posted", "journal_entry_id": journal["id"],
            "posted_by": ctx.user_id, "posted_at": now_iso(), "updated_at": now_iso(),
        }, "id = ?", (doc_id,))
        ctx.audit("post", "sales" if _is_sales(doc["doc_type"]) else "purchases",
                  doc["doc_type"], doc_id,
                  new_value={"number": doc["number"], "total": doc["total_minor"],
                             "journal": journal["entry_no"]})
        if payment and doc["doc_type"] in ("sales_invoice", "purchase_invoice"):
            amount = int(payment.get("amount_minor") or 0)
            if amount > 0:
                if amount > doc["total_minor"]:
                    raise AccountingError("allocation_exceeds_balance", number=doc["number"],
                                          open=doc["total_minor"])
                method_id = payment.get("payment_method_id") or doc["payment_method_id"]
                if not method_id:
                    raise ValidationError("field_required", field="payment_method_id")
                record_payment(
                    ctx,
                    party_type="customer" if _is_sales(doc["doc_type"]) else "supplier",
                    party_id=doc["customer_id"] or doc["supplier_id"],
                    method_id=int(method_id), amount_minor=amount,
                    date_value=payment.get("date") or doc["doc_date"],
                    reference=doc["number"],
                    allocations=[{"document_id": doc["id"], "amount_minor": amount}],
                )
    return document_view(db, doc_id)


def _title(doc_type):
    return {
        "sales_invoice": "Sales invoice", "sales_credit": "Credit note",
        "purchase_invoice": "Purchase invoice", "purchase_return": "Purchase return",
    }[doc_type]


def _check_credit_limit(db, party, new_total):
    limit = party["credit_limit_minor"]
    if not limit:
        return
    from .catalog import partner_balance
    current = partner_balance(db, "customer", party["id"])
    if current + new_total > limit:
        raise AccountingError("credit_limit_exceeded", name=party["name"])


def _auto_apply_credit(ctx, credit):
    """A credit note raised against an invoice settles that invoice as far as possible."""
    invoice = _doc_row(ctx.db, credit["source_id"])
    if invoice["doc_type"] != "sales_invoice" or invoice["status"] != "posted":
        return
    amount = min(credit["total_minor"], outstanding_for_target(ctx.db, invoice))
    if amount > 0:
        ctx.db.insert("allocations", {
            "payment_id": None, "credit_doc_id": credit["id"], "target_doc_id": invoice["id"],
            "amount_minor": amount, "reversed": 0,
            "created_by": ctx.user_id, "created_at": now_iso(),
        })


def confirm_document(ctx, doc_id):
    """Confirm a quote or order (locks its lines; it can then be converted)."""
    db = ctx.db
    doc = _doc_row(db, doc_id)
    if doc["doc_type"] not in ("sales_quote", "sales_order", "purchase_order"):
        raise AccountingError("document_not_confirmable", number=doc["number"])
    ctx.require(_manage_permission(doc["doc_type"]))
    if doc["status"] != "draft":
        raise AccountingError("document_not_draft", number=doc["number"])
    with db.transaction():
        db.update("documents", {"status": "confirmed", "updated_at": now_iso()}, "id = ?", (doc_id,))
        ctx.audit("confirm", "sales" if _is_sales(doc["doc_type"]) else "purchases",
                  doc["doc_type"], doc_id, new_value={"number": doc["number"]})
    return document_view(db, doc_id)


def cancel_document(ctx, doc_id):
    db = ctx.db
    doc = _doc_row(db, doc_id)
    if doc["doc_type"] not in ("sales_quote", "sales_order", "purchase_order"):
        raise AccountingError("document_not_cancellable", number=doc["number"])
    ctx.require(_manage_permission(doc["doc_type"]))
    if doc["status"] not in ("draft", "confirmed"):
        raise AccountingError("document_not_cancellable", number=doc["number"])
    processed = db.scalar("SELECT COALESCE(SUM(processed_qty_scaled), 0) FROM document_lines "
                          "WHERE document_id = ?", (doc_id,), 0)
    if processed:
        raise AccountingError("document_partly_processed", number=doc["number"])
    with db.transaction():
        db.update("documents", {"status": "cancelled", "updated_at": now_iso()}, "id = ?", (doc_id,))
        ctx.audit("cancel", "sales" if _is_sales(doc["doc_type"]) else "purchases",
                  doc["doc_type"], doc_id, new_value={"number": doc["number"]})
    return document_view(db, doc_id)


def convert_document(ctx, doc_id, target_type=None):
    """Create a new draft from a confirmed quote/order, copying the remaining quantities."""
    db = ctx.db
    doc = _doc_row(db, doc_id)
    target = CONVERSION.get(doc["doc_type"])
    if target is None or (target_type and target_type != target):
        raise AccountingError("conversion_not_allowed", number=doc["number"])
    ctx.require(_manage_permission(target))
    if doc["status"] != "confirmed":
        raise AccountingError("document_not_ready_for_conversion", number=doc["number"])
    with db.transaction():
        lines = []
        for line in _load_lines(db, doc_id):
            remaining = line["quantity_scaled"] - line["processed_qty_scaled"]
            if remaining <= 0:
                continue
            lines.append({
                "product_id": line["product_id"],
                "source_line_id": line["id"],
                "quantity": format_qty(remaining),
                "description": line["description"],
            })
        if not lines:
            raise AccountingError("nothing_to_convert", number=doc["number"])
        party_key = "customer_id" if _is_sales(target) else "supplier_id"
        data = {
            "doc_type": target,
            party_key: doc[party_key],
            "doc_date": today_iso(),
            "warehouse_id": doc["warehouse_id"],
            "reference": doc["number"],
            "source_id": doc["id"],
            "lines": lines,
        }
        new_doc = save_document(ctx, data)
        if doc["doc_type"] == "sales_quote":
            db.update("documents", {"status": "closed", "updated_at": now_iso()}, "id = ?", (doc_id,))
        ctx.audit("convert", "sales" if _is_sales(target) else "purchases", target, new_doc["id"],
                  new_value={"from": doc["number"], "to": new_doc["number"]})
    return document_view(db, new_doc["id"])


def delete_draft(ctx, doc_id):
    db = ctx.db
    doc = _doc_row(db, doc_id)
    ctx.require(_manage_permission(doc["doc_type"]))
    if doc["status"] != "draft":
        raise AccountingError("document_not_draft", number=doc["number"])
    with db.transaction():
        db.execute("DELETE FROM document_lines WHERE document_id = ?", (doc_id,))
        db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        ctx.audit("delete", "sales" if _is_sales(doc["doc_type"]) else "purchases",
                  doc["doc_type"], doc_id, old_value={"number": doc["number"]})
    return {"deleted": True}


def document_balance(db, doc):
    """Open amount on an invoice or credit/return document."""
    if doc["status"] != "posted":
        return 0
    if doc["doc_type"] in ("sales_credit", "purchase_return"):
        applied = db.scalar("SELECT COALESCE(SUM(amount_minor), 0) FROM allocations "
                            "WHERE credit_doc_id = ? AND reversed = 0", (doc["id"],), 0)
        return doc["total_minor"] - applied
    if doc["doc_type"] in ("sales_invoice", "purchase_invoice"):
        return doc["total_minor"] - allocated_to_target(db, doc["id"])
    return 0


def document_view(db, doc_id):
    doc = db.one(
        "SELECT d.*, c.code AS customer_code, c.name AS customer_name, "
        "s.code AS supplier_code, s.name AS supplier_name, w.code AS warehouse_code, "
        "w.name AS warehouse_name, src.number AS source_number, src.doc_type AS source_type, "
        "je.entry_no AS journal_no, pm.name AS payment_method_name "
        "FROM documents d LEFT JOIN customers c ON c.id = d.customer_id "
        "LEFT JOIN suppliers s ON s.id = d.supplier_id LEFT JOIN warehouses w ON w.id = d.warehouse_id "
        "LEFT JOIN documents src ON src.id = d.source_id "
        "LEFT JOIN journal_entries je ON je.id = d.journal_entry_id "
        "LEFT JOIN payment_methods pm ON pm.id = d.payment_method_id WHERE d.id = ?", (doc_id,))
    if doc is None:
        raise NotFound("document_not_found", id=doc_id)
    doc["lines"] = db.query(
        "SELECT dl.*, p.sku, p.track_stock, a.code AS account_code, a.name AS account_name, "
        "t.name AS tax_name FROM document_lines dl LEFT JOIN products p ON p.id = dl.product_id "
        "JOIN accounts a ON a.id = dl.account_id LEFT JOIN tax_rates t ON t.id = dl.tax_rate_id "
        "WHERE dl.document_id = ? ORDER BY dl.line_no", (doc_id,))
    for line in doc["lines"]:
        line["processed_qty_display"] = format_qty(line["processed_qty_scaled"])
    doc["balance_minor"] = document_balance(db, doc)
    doc["paid_minor"] = (allocated_to_target(db, doc_id)
                         if doc["doc_type"] in ("sales_invoice", "purchase_invoice") else None)
    doc["payment_state"] = _payment_state(doc)
    doc["links"] = db.query(
        "SELECT id, doc_type, number, status FROM documents WHERE source_id = ? ORDER BY id", (doc_id,))
    return doc


def _payment_state(doc):
    if doc["status"] == "draft":
        return "draft"
    if doc["doc_type"] in ("sales_invoice", "purchase_invoice"):
        if doc["status"] != "posted":
            return doc["status"]
        if doc["balance_minor"] <= 0:
            return "paid"
        if doc["balance_minor"] < doc["total_minor"]:
            return "partial"
        return "open"
    return doc["status"]


def list_documents(db, doc_types=None, status=None, q=None, date_from=None, date_to=None,
                   party_id=None, open_only=False):
    sql = ("SELECT d.id, d.doc_type, d.number, d.doc_date, d.due_date, d.status, d.total_minor, "
           "d.tax_minor, d.subtotal_minor, d.reference, d.posted_at, "
           "COALESCE(c.name, s.name) AS party_name, COALESCE(c.code, s.code) AS party_code, "
           "d.customer_id, d.supplier_id, "
           "(SELECT COALESCE(SUM(a.amount_minor), 0) FROM allocations a WHERE a.target_doc_id = d.id "
           " AND a.reversed = 0) AS settled_minor, "
           "(SELECT COALESCE(SUM(a.amount_minor), 0) FROM allocations a WHERE a.credit_doc_id = d.id "
           " AND a.reversed = 0) AS applied_minor "
           "FROM documents d LEFT JOIN customers c ON c.id = d.customer_id "
           "LEFT JOIN suppliers s ON s.id = d.supplier_id WHERE 1=1")
    params = []
    if doc_types:
        sql += " AND d.doc_type IN (" + ",".join("?" for _ in doc_types) + ")"
        params += list(doc_types)
    if status:
        sql += " AND d.status = ?"
        params.append(status)
    if q:
        sql += " AND (d.number LIKE ? OR d.reference LIKE ? OR c.name LIKE ? OR s.name LIKE ?)"
        params += [f"%{q}%"] * 4
    if date_from:
        sql += " AND d.doc_date >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND d.doc_date <= ?"
        params.append(date_to)
    if party_id:
        sql += " AND (d.customer_id = ? OR d.supplier_id = ?)"
        params += [int(party_id), int(party_id)]
    if open_only:
        sql += " AND d.status = 'posted' AND d.doc_type IN ('sales_invoice','purchase_invoice') " \
               "AND d.total_minor > (SELECT COALESCE(SUM(a.amount_minor), 0) FROM allocations a " \
               "WHERE a.target_doc_id = d.id AND a.reversed = 0)"
    sql += " ORDER BY d.doc_date DESC, d.id DESC"
    rows = db.query(sql, params)
    for row in rows:
        if row["doc_type"] in ("sales_invoice", "purchase_invoice"):
            row["balance_minor"] = row["total_minor"] - row["settled_minor"] if row["status"] == "posted" else 0
        elif row["doc_type"] in ("sales_credit", "purchase_return"):
            row["balance_minor"] = row["total_minor"] - row["applied_minor"] if row["status"] == "posted" else 0
        else:
            row["balance_minor"] = 0
    return rows
