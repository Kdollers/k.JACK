"""Inventory engine: stock receipts, issues, transfers, adjustments and physical counts.

Costing is either FIFO (layers) or weighted average, chosen per company.
Every stock change is a row in ``stock_movements`` that carries the signed
quantity and value. ``stock_levels`` holds the running totals, and FIFO
layers hold the remaining cost of each receipt. The three must agree, which
``verify_inventory`` checks.
"""

from .accounts import _account_must_be
from .config import QTY_SCALE
from .company import currency_info, get_setting, system_account_ids
from .errors import AccountingError, NotFound, ValidationError
from .ledger import next_number, post_entry
from .money import div_round, format_qty, parse_iso_date, parse_money, parse_quantity
from .timeutil import now_iso, today_iso


def value_for_quantity(qty_scaled, unit_cost_minor):
    """Minor-unit value of a scaled quantity at a per-unit cost."""
    return div_round(qty_scaled * unit_cost_minor, QTY_SCALE)


def costing_method(db):
    return get_setting(db, "costing_method", "weighted_average")


def _product_for_stock(db, product_id):
    product = db.one("SELECT * FROM products WHERE id = ?", (product_id,))
    if product is None:
        raise NotFound("product_not_found", id=product_id)
    if not product["track_stock"]:
        raise AccountingError("product_is_service", sku=product["sku"])
    if not product["is_active"]:
        raise AccountingError("product_inactive", sku=product["sku"])
    return product


def _warehouse(db, warehouse_id):
    warehouse = db.one("SELECT * FROM warehouses WHERE id = ?", (warehouse_id,))
    if warehouse is None:
        raise NotFound("warehouse_not_found", id=warehouse_id)
    if not warehouse["is_active"]:
        raise AccountingError("warehouse_inactive", code=warehouse["code"])
    return warehouse


def _level(db, product_id, warehouse_id):
    row = db.one("SELECT * FROM stock_levels WHERE product_id = ? AND warehouse_id = ?",
                 (product_id, warehouse_id))
    if row is None:
        db.insert("stock_levels", {"product_id": product_id, "warehouse_id": warehouse_id,
                                   "qty_scaled": 0, "value_minor": 0})
        row = {"product_id": product_id, "warehouse_id": warehouse_id, "qty_scaled": 0, "value_minor": 0}
    return row


def on_hand(db, product_id, warehouse_id=None):
    sql = "SELECT COALESCE(SUM(qty_scaled), 0) AS q, COALESCE(SUM(value_minor), 0) AS v FROM stock_levels WHERE product_id = ?"
    params = [product_id]
    if warehouse_id is not None:
        sql += " AND warehouse_id = ?"
        params.append(warehouse_id)
    row = db.one(sql, params)
    return row["q"], row["v"]


def unit_cost(db, product_id, warehouse_id):
    """Current average cost per whole unit (minor units). Falls back to the standard cost."""
    level = _level(db, product_id, warehouse_id)
    if level["qty_scaled"] > 0:
        return div_round(level["value_minor"] * QTY_SCALE, level["qty_scaled"])
    return db.one("SELECT cost_price_minor FROM products WHERE id = ?", (product_id,))["cost_price_minor"]


def _insert_movement(db, *, date_value, movement_type, product_id, warehouse_id, qty_scaled,
                     value_minor, reference, note, document_id, journal_entry_id, user_id):
    return db.insert("stock_movements", {
        "movement_date": date_value,
        "movement_type": movement_type,
        "product_id": product_id,
        "warehouse_id": warehouse_id,
        "qty_scaled": qty_scaled,
        "value_minor": value_minor,
        "reference": reference,
        "note": note,
        "document_id": document_id,
        "journal_entry_id": journal_entry_id,
        "created_by": user_id,
        "created_at": now_iso(),
    })


def receive(db, *, user_id, product_id, warehouse_id, qty_scaled, value_minor, date_value,
            movement_type="receipt", reference=None, note=None, document_id=None,
            journal_entry_id=None):
    """Add stock at a known total cost. Must run inside a transaction."""
    if qty_scaled <= 0 or value_minor < 0:
        raise ValidationError("invalid_quantity", field="quantity")
    _product_for_stock(db, product_id)
    _warehouse(db, warehouse_id)
    level = _level(db, product_id, warehouse_id)
    movement_id = _insert_movement(
        db, date_value=date_value, movement_type=movement_type, product_id=product_id,
        warehouse_id=warehouse_id, qty_scaled=qty_scaled, value_minor=value_minor,
        reference=reference, note=note, document_id=document_id,
        journal_entry_id=journal_entry_id, user_id=user_id)
    db.update("stock_levels", {"qty_scaled": level["qty_scaled"] + qty_scaled,
                               "value_minor": level["value_minor"] + value_minor},
              "product_id = ? AND warehouse_id = ?", (product_id, warehouse_id))
    if costing_method(db) == "fifo":
        db.insert("stock_layers", {
            "product_id": product_id, "warehouse_id": warehouse_id, "movement_id": movement_id,
            "received_date": date_value, "original_qty_scaled": qty_scaled,
            "original_value_minor": value_minor, "qty_remaining_scaled": qty_scaled,
            "value_remaining_minor": value_minor,
        })
    return movement_id


def plan_issue(db, product_id, warehouse_id, qty_scaled):
    """Price an issue without changing anything.

    Returns ``{"cost_minor": int, "consumption": [(layer_id, take, piece)]}``.
    The consumption list is empty for weighted average. Pass the plan to
    ``issue`` so the journal can be posted with the same cost before the
    stock is removed. Calling this twice never double-consumes layers.
    """
    level = _level(db, product_id, warehouse_id)
    if level["qty_scaled"] < qty_scaled:
        product = db.one("SELECT sku FROM products WHERE id = ?", (product_id,))
        raise AccountingError("insufficient_stock", sku=product["sku"],
                              available=format_qty(level["qty_scaled"]),
                              requested=format_qty(qty_scaled))
    if costing_method(db) == "fifo":
        remaining = qty_scaled
        cost = 0
        consumption = []
        layers = db.query(
            "SELECT * FROM stock_layers WHERE product_id = ? AND warehouse_id = ? "
            "AND qty_remaining_scaled > 0 ORDER BY id", (product_id, warehouse_id))
        for layer in layers:
            if remaining == 0:
                break
            take = min(remaining, layer["qty_remaining_scaled"])
            if take == layer["qty_remaining_scaled"]:
                piece = layer["value_remaining_minor"]
            else:
                piece = div_round(layer["value_remaining_minor"] * take, layer["qty_remaining_scaled"])
            cost += piece
            remaining -= take
            consumption.append((layer["id"], take, piece))
        if remaining != 0:  # pragma: no cover - guarded by the level check above
            raise AccountingError("insufficient_stock", sku="", available="", requested="")
        return {"cost_minor": cost, "consumption": consumption}
    if qty_scaled == level["qty_scaled"]:
        cost = level["value_minor"]
    else:
        cost = div_round(level["value_minor"] * qty_scaled, level["qty_scaled"])
    return {"cost_minor": cost, "consumption": []}


def issue(db, *, user_id, product_id, warehouse_id, qty_scaled, date_value,
          movement_type="issue", reference=None, note=None, document_id=None,
          journal_entry_id=None, plan=None):
    """Remove stock at its costed value.

    Returns ``{"movement_id": int, "cost_minor": int}``. If ``plan`` is given
    (from ``plan_issue``, computed in the same transaction) it is applied
    instead of re-pricing, so the cost posted to the ledger and the cost
    removed from stock are identical.
    """
    if qty_scaled <= 0:
        raise ValidationError("invalid_quantity", field="quantity")
    _product_for_stock(db, product_id)
    _warehouse(db, warehouse_id)
    if plan is None:
        plan = plan_issue(db, product_id, warehouse_id, qty_scaled)
    cost = plan["cost_minor"]
    for layer_id, take, piece in plan["consumption"]:
        layer = db.one("SELECT * FROM stock_layers WHERE id = ?", (layer_id,))
        db.update("stock_layers", {
            "qty_remaining_scaled": layer["qty_remaining_scaled"] - take,
            "value_remaining_minor": layer["value_remaining_minor"] - piece,
        }, "id = ?", (layer_id,))
    level = _level(db, product_id, warehouse_id)
    movement_id = _insert_movement(
        db, date_value=date_value, movement_type=movement_type, product_id=product_id,
        warehouse_id=warehouse_id, qty_scaled=-qty_scaled, value_minor=-cost,
        reference=reference, note=note, document_id=document_id,
        journal_entry_id=journal_entry_id, user_id=user_id)
    db.update("stock_levels", {"qty_scaled": level["qty_scaled"] - qty_scaled,
                               "value_minor": level["value_minor"] - cost},
              "product_id = ? AND warehouse_id = ?", (product_id, warehouse_id))
    return {"movement_id": movement_id, "cost_minor": cost}


def _product_inventory_account(db, product_id):
    row = db.one("SELECT c.inventory_account_id AS inv, c.cogs_account_id AS cogs, "
                 "c.revenue_account_id AS rev, p.sku FROM products p "
                 "JOIN categories c ON c.id = p.category_id WHERE p.id = ?", (product_id,))
    if row is None or row["inv"] is None:
        raise AccountingError("category_missing_inventory_account")
    return row["inv"]


def _lines_for_side_totals(entries):
    """Collapse (account, debit, credit) rows into balanced journal lines."""
    grouped = {}
    for account_id, debit, credit in entries:
        slot = grouped.setdefault(account_id, [0, 0])
        slot[0] += debit
        slot[1] += credit
    lines = []
    for account_id, (debit, credit) in grouped.items():
        net = debit - credit
        if net == 0:
            continue
        lines.append({"account_id": account_id,
                      "debit_minor": net if net > 0 else 0,
                      "credit_minor": -net if net < 0 else 0})
    return lines


# ----------------------------------------------------------------------
# Manual stock documents (each posts its own reference and journal entry)
# ----------------------------------------------------------------------

def _common_stock_input(data):
    product_id = int(data.get("product_id") or 0)
    warehouse_id = int(data.get("warehouse_id") or 0)
    qty = parse_quantity(data.get("quantity"), field="quantity")
    note = (data.get("note") or "").strip() or None
    date_value = parse_iso_date(data.get("date") or today_iso(), "date").isoformat()
    return product_id, warehouse_id, qty, note, date_value


def stock_receipt(ctx, data):
    """Goods received without a supplier invoice: Dr Inventory, Cr chosen offset account."""
    ctx.require("inventory.move")
    db = ctx.db
    decimals, _ = currency_info(db)
    with db.transaction():
        product_id, warehouse_id, qty, note, date_value = _common_stock_input(data)
        product = _product_for_stock(db, product_id)
        _warehouse(db, warehouse_id)
        unit_cost_minor = parse_money(data.get("unit_cost"), decimals, field="unit_cost")
        offset_id = _account_must_be(db, data.get("offset_account_id"), ("equity", "liability", "revenue", "expense", "asset", "cogs"), "offset_account_id")
        if offset_id is None:
            raise ValidationError("field_required", field="offset_account_id")
        value = value_for_quantity(qty, unit_cost_minor)
        reference = next_number(db, "stock_receipt")
        inventory_account = _product_inventory_account(db, product_id)
        entry = post_entry(ctx, entry_date=date_value,
                           description=f"Stock receipt {reference} - {product['sku']}",
                           reference=reference, source_type=None, source_id=None,
                           lines=[{"account_id": inventory_account, "debit_minor": value, "credit_minor": 0},
                                  {"account_id": offset_id, "debit_minor": 0, "credit_minor": value}]
                           ) if value > 0 else None
        movement_id = receive(db, user_id=ctx.user_id, product_id=product_id,
                              warehouse_id=warehouse_id, qty_scaled=qty, value_minor=value,
                              date_value=date_value, movement_type="receipt",
                              reference=reference, note=note,
                              journal_entry_id=entry["id"] if entry else None)
        ctx.audit("receive", "inventory", "stock_movement", movement_id,
                  new_value={"reference": reference, "product": product["sku"],
                             "qty": format_qty(qty), "value": value})
    return {"reference": reference, "movement_id": movement_id, "value_minor": value}


def stock_issue(ctx, data):
    """Stock used internally: Dr chosen expense/offset account, Cr Inventory at costed value."""
    ctx.require("inventory.move")
    db = ctx.db
    with db.transaction():
        product_id, warehouse_id, qty, note, date_value = _common_stock_input(data)
        product = _product_for_stock(db, product_id)
        offset_id = _account_must_be(db, data.get("offset_account_id"),
                                     ("expense", "cogs", "equity", "revenue", "asset", "liability"),
                                     "offset_account_id")
        if offset_id is None:
            raise ValidationError("field_required", field="offset_account_id")
        reference = next_number(db, "stock_issue")
        plan = plan_issue(db, product_id, warehouse_id, qty)
        cost = plan["cost_minor"]
        inventory_account = _product_inventory_account(db, product_id)
        entry = None
        if cost > 0:
            entry = post_entry(ctx, entry_date=date_value,
                               description=f"Stock issue {reference} - {product['sku']}",
                               reference=reference, lines=[
                                   {"account_id": offset_id, "debit_minor": cost, "credit_minor": 0},
                                   {"account_id": inventory_account, "debit_minor": 0, "credit_minor": cost}])
        moved = issue(db, user_id=ctx.user_id, product_id=product_id, warehouse_id=warehouse_id,
                      qty_scaled=qty, date_value=date_value, movement_type="issue",
                      reference=reference, note=note,
                      journal_entry_id=entry["id"] if entry else None, plan=plan)
        movement_id = moved["movement_id"]
        ctx.audit("issue", "inventory", "stock_movement", movement_id,
                  new_value={"reference": reference, "product": product["sku"],
                             "qty": format_qty(qty), "cost": cost})
    return {"reference": reference, "movement_id": movement_id, "cost_minor": cost}


def stock_transfer(ctx, data):
    """Move stock between warehouses at its current cost. No change in the ledger totals."""
    ctx.require("inventory.move")
    db = ctx.db
    with db.transaction():
        product_id = int(data.get("product_id") or 0)
        source_id = int(data.get("from_warehouse_id") or 0)
        target_id = int(data.get("to_warehouse_id") or 0)
        if source_id == target_id:
            raise ValidationError("transfer_same_warehouse")
        qty = parse_quantity(data.get("quantity"), field="quantity")
        date_value = parse_iso_date(data.get("date") or today_iso(), "date").isoformat()
        note = (data.get("note") or "").strip() or None
        product = _product_for_stock(db, product_id)
        _warehouse(db, source_id)
        _warehouse(db, target_id)
        reference = next_number(db, "stock_transfer")
        moved = issue(db, user_id=ctx.user_id, product_id=product_id, warehouse_id=source_id,
                      qty_scaled=qty, date_value=date_value, movement_type="transfer_out",
                      reference=reference, note=note)
        cost = moved["cost_minor"]
        receive(db, user_id=ctx.user_id, product_id=product_id, warehouse_id=target_id,
                qty_scaled=qty, value_minor=cost, date_value=date_value,
                movement_type="transfer_in", reference=reference, note=note)
        ctx.audit("transfer", "inventory", "product", product_id,
                  new_value={"reference": reference, "sku": product["sku"],
                             "qty": format_qty(qty), "from": source_id, "to": target_id})
    return {"reference": reference, "value_minor": cost}


def stock_adjustment(ctx, data):
    """Increase or decrease stock with a reason. Posts Dr/Cr Inventory vs Stock adjustment."""
    ctx.require("inventory.adjust")
    db = ctx.db
    decimals, _ = currency_info(db)
    with db.transaction():
        product_id = int(data.get("product_id") or 0)
        warehouse_id = int(data.get("warehouse_id") or 0)
        direction = data.get("direction")
        if direction not in ("increase", "decrease"):
            raise ValidationError("invalid_direction")
        qty = parse_quantity(data.get("quantity"), field="quantity")
        reason = (data.get("reason") or "").strip()
        if not reason:
            raise ValidationError("field_required", field="reason")
        date_value = parse_iso_date(data.get("date") or today_iso(), "date").isoformat()
        product = _product_for_stock(db, product_id)
        _warehouse(db, warehouse_id)
        adjustment_account = system_account_ids(db)["stock_adjustment"]
        inventory_account = _product_inventory_account(db, product_id)
        reference = next_number(db, "stock_adjustment")
        if direction == "increase":
            unit_cost_minor = data.get("unit_cost")
            if unit_cost_minor in (None, ""):
                unit_cost_minor = unit_cost(db, product_id, warehouse_id)
            else:
                unit_cost_minor = parse_money(unit_cost_minor, decimals, field="unit_cost")
            value = value_for_quantity(qty, unit_cost_minor)
            entry = post_entry(ctx, entry_date=date_value,
                               description=f"Stock adjustment {reference} (+) - {product['sku']}: {reason}",
                               reference=reference, lines=[
                                   {"account_id": inventory_account, "debit_minor": value, "credit_minor": 0},
                                   {"account_id": adjustment_account, "debit_minor": 0, "credit_minor": value}]
                               ) if value > 0 else None
            movement_id = receive(db, user_id=ctx.user_id, product_id=product_id, warehouse_id=warehouse_id,
                                  qty_scaled=qty, value_minor=value, date_value=date_value,
                                  movement_type="adjust_in", reference=reference, note=reason,
                                  journal_entry_id=entry["id"] if entry else None)
        else:
            plan = plan_issue(db, product_id, warehouse_id, qty)
            cost = plan["cost_minor"]
            value = cost
            entry = post_entry(ctx, entry_date=date_value,
                               description=f"Stock adjustment {reference} (-) - {product['sku']}: {reason}",
                               reference=reference, lines=[
                                   {"account_id": adjustment_account, "debit_minor": cost, "credit_minor": 0},
                                   {"account_id": inventory_account, "debit_minor": 0, "credit_minor": cost}]
                               ) if cost > 0 else None
            moved = issue(db, user_id=ctx.user_id, product_id=product_id, warehouse_id=warehouse_id,
                          qty_scaled=qty, date_value=date_value, movement_type="adjust_out",
                          reference=reference, note=reason,
                          journal_entry_id=entry["id"] if entry else None, plan=plan)
            movement_id = moved["movement_id"]
        ctx.audit("adjust", "inventory", "stock_movement", movement_id,
                  old_value={"sku": product["sku"]},
                  new_value={"reference": reference, "direction": direction,
                             "qty": format_qty(qty), "value": value, "reason": reason})
    return {"reference": reference, "movement_id": movement_id, "value_minor": value}


# ----------------------------------------------------------------------
# Physical inventory counts
# ----------------------------------------------------------------------

def count_view(db, count_id):
    count = db.one("SELECT c.*, w.code AS warehouse_code, w.name AS warehouse_name FROM stock_counts c "
                   "JOIN warehouses w ON w.id = c.warehouse_id WHERE c.id = ?", (count_id,))
    if count is None:
        raise NotFound("count_not_found", id=count_id)
    lines = db.query(
        "SELECT cl.*, p.sku, p.name AS product_name, p.unit FROM stock_count_lines cl "
        "JOIN products p ON p.id = cl.product_id WHERE cl.count_id = ? ORDER BY p.sku", (count_id,))
    count["lines"] = lines
    return count


def list_counts(db):
    return db.query("SELECT c.*, w.code AS warehouse_code FROM stock_counts c "
                    "JOIN warehouses w ON w.id = c.warehouse_id ORDER BY c.id DESC")


def create_count(ctx, data):
    """Create a draft count. Lines snapshot the system quantity for every active stock product."""
    ctx.require("inventory.adjust")
    db = ctx.db
    with db.transaction():
        warehouse_id = int(data.get("warehouse_id") or 0)
        _warehouse(db, warehouse_id)
        date_value = parse_iso_date(data.get("count_date") or today_iso(), "count_date").isoformat()
        number = next_number(db, "stock_count")
        count_id = db.insert("stock_counts", {
            "count_no": number, "warehouse_id": warehouse_id, "count_date": date_value,
            "status": "draft", "notes": (data.get("notes") or "").strip() or None,
            "created_by": ctx.user_id, "created_at": now_iso(),
        })
        products = db.query("SELECT id FROM products WHERE track_stock = 1 AND is_active = 1 ORDER BY sku")
        for product in products:
            qty = db.scalar("SELECT qty_scaled FROM stock_levels WHERE product_id = ? AND warehouse_id = ?",
                            (product["id"], warehouse_id), 0)
            db.insert("stock_count_lines", {
                "count_id": count_id, "product_id": product["id"],
                "system_qty_snapshot_scaled": qty, "physical_qty_scaled": qty,
            })
        ctx.audit("create", "inventory", "stock_count", count_id, new_value={"count_no": number})
    return count_view(db, count_id)


def update_count_lines(ctx, count_id, lines):
    """Record physical quantities. Each line is {product_id, physical_quantity}."""
    ctx.require("inventory.adjust")
    db = ctx.db
    with db.transaction():
        count = db.one("SELECT * FROM stock_counts WHERE id = ?", (count_id,))
        if count is None:
            raise NotFound("count_not_found", id=count_id)
        if count["status"] != "draft":
            raise AccountingError("count_already_posted", count_no=count["count_no"])
        for entry in lines:
            product_id = int(entry.get("product_id") or 0)
            physical = parse_quantity(entry.get("physical_quantity"), field="physical_quantity",
                                      allow_zero=True)
            updated = db.update("stock_count_lines", {"physical_qty_scaled": physical},
                                "count_id = ? AND product_id = ?", (count_id, product_id))
            if updated == 0:
                raise NotFound("product_not_found", id=product_id)
        ctx.audit("update", "inventory", "stock_count", count_id, details="physical quantities")
    return count_view(db, count_id)


def post_count(ctx, count_id):
    """Post a count: adjust every line whose physical quantity differs from the system quantity."""
    ctx.require("inventory.adjust")
    db = ctx.db
    with db.transaction():
        count = db.one("SELECT * FROM stock_counts WHERE id = ?", (count_id,))
        if count is None:
            raise NotFound("count_not_found", id=count_id)
        if count["status"] != "draft":
            raise AccountingError("count_already_posted", count_no=count["count_no"])
        adjustment_account = system_account_ids(db)["stock_adjustment"]
        posting_lines = []
        adjusted = 0
        for line in db.query("SELECT * FROM stock_count_lines WHERE count_id = ? ORDER BY id", (count_id,)):
            warehouse_id = count["warehouse_id"]
            system_now = _level(db, line["product_id"], warehouse_id)["qty_scaled"]
            difference = line["physical_qty_scaled"] - system_now
            product_inventory = _product_inventory_account(db, line["product_id"])
            value_difference = 0
            unit = unit_cost(db, line["product_id"], warehouse_id)
            if difference > 0:
                value_difference = value_for_quantity(difference, unit)
                receive(db, user_id=ctx.user_id, product_id=line["product_id"],
                        warehouse_id=warehouse_id, qty_scaled=difference,
                        value_minor=value_difference, date_value=count["count_date"],
                        movement_type="count_in", reference=count["count_no"],
                        note="Physical count")
                posting_lines.append((product_inventory, value_difference, 0))
                posting_lines.append((adjustment_account, 0, value_difference))
            elif difference < 0:
                plan = plan_issue(db, line["product_id"], warehouse_id, -difference)
                value_difference = -plan["cost_minor"]
                issue(db, user_id=ctx.user_id, product_id=line["product_id"],
                      warehouse_id=warehouse_id, qty_scaled=-difference,
                      date_value=count["count_date"], movement_type="count_out",
                      reference=count["count_no"], note="Physical count", plan=plan)
                posting_lines.append((adjustment_account, -value_difference, 0))
                posting_lines.append((product_inventory, 0, -value_difference))
            if difference != 0:
                adjusted += 1
            db.update("stock_count_lines", {
                "system_qty_posted_scaled": system_now,
                "difference_scaled": difference,
                "unit_cost_minor": unit,
                "value_difference_minor": value_difference,
            }, "id = ?", (line["id"],))
        journal = None
        lines = _lines_for_side_totals([(a, d, c) for a, d, c in posting_lines])
        if lines:
            journal = post_entry(ctx, entry_date=count["count_date"],
                                 description=f"Physical count {count['count_no']}",
                                 reference=count["count_no"], lines=lines,
                                 source_type="stock_count", source_id=count_id)
        db.update("stock_counts", {
            "status": "posted",
            "journal_entry_id": journal["id"] if journal else None,
            "posted_by": ctx.user_id,
            "posted_at": now_iso(),
        }, "id = ?", (count_id,))
        ctx.audit("post", "inventory", "stock_count", count_id,
                  new_value={"count_no": count["count_no"], "lines_adjusted": adjusted})
    return count_view(db, count_id)


# ----------------------------------------------------------------------
# Reporting helpers
# ----------------------------------------------------------------------

def stock_levels(db, warehouse_id=None, q=None, low_only=False):
    sql = ("SELECT sl.product_id, sl.warehouse_id, sl.qty_scaled, sl.value_minor, p.sku, p.name, "
           "p.unit, p.min_stock_scaled, w.code AS warehouse_code, c.name AS category_name "
           "FROM stock_levels sl JOIN products p ON p.id = sl.product_id "
           "JOIN warehouses w ON w.id = sl.warehouse_id JOIN categories c ON c.id = p.category_id "
           "WHERE 1=1")
    params = []
    if warehouse_id:
        sql += " AND sl.warehouse_id = ?"
        params.append(int(warehouse_id))
    if q:
        sql += " AND (p.sku LIKE ? OR p.name LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if low_only:
        sql += " AND p.min_stock_scaled > 0 AND sl.qty_scaled <= p.min_stock_scaled"
    return db.query(sql + " ORDER BY p.sku, w.code", params)


def valuation_as_of(db, as_of, warehouse_id=None):
    """Quantity and value per product/warehouse using movements up to a date."""
    sql = ("SELECT sm.product_id, sm.warehouse_id, p.sku, p.name, p.unit, w.code AS warehouse_code, "
           "SUM(sm.qty_scaled) AS qty_scaled, SUM(sm.value_minor) AS value_minor "
           "FROM stock_movements sm JOIN products p ON p.id = sm.product_id "
           "JOIN warehouses w ON w.id = sm.warehouse_id WHERE sm.movement_date <= ?")
    params = [as_of]
    if warehouse_id:
        sql += " AND sm.warehouse_id = ?"
        params.append(int(warehouse_id))
    sql += " GROUP BY sm.product_id, sm.warehouse_id HAVING SUM(sm.qty_scaled) <> 0 OR SUM(sm.value_minor) <> 0"
    return db.query(sql + " ORDER BY p.sku, w.code", params)


def verify_inventory(db):
    """Check that stock levels, movements and FIFO layers agree. Returns a list of problems."""
    problems = []
    for level in db.query("SELECT * FROM stock_levels"):
        moved = db.one("SELECT COALESCE(SUM(qty_scaled), 0) AS q, COALESCE(SUM(value_minor), 0) AS v "
                       "FROM stock_movements WHERE product_id = ? AND warehouse_id = ?",
                       (level["product_id"], level["warehouse_id"]))
        if moved["q"] != level["qty_scaled"] or moved["v"] != level["value_minor"]:
            problems.append({"type": "level_mismatch", "product_id": level["product_id"],
                             "warehouse_id": level["warehouse_id"]})
    if costing_method(db) == "fifo":
        for level in db.query("SELECT * FROM stock_levels"):
            layers = db.one("SELECT COALESCE(SUM(qty_remaining_scaled), 0) AS q, "
                            "COALESCE(SUM(value_remaining_minor), 0) AS v FROM stock_layers "
                            "WHERE product_id = ? AND warehouse_id = ?",
                            (level["product_id"], level["warehouse_id"]))
            if layers["q"] != level["qty_scaled"] or layers["v"] != level["value_minor"]:
                problems.append({"type": "layer_mismatch", "product_id": level["product_id"],
                                 "warehouse_id": level["warehouse_id"]})
    return problems


__all__ = ["receive", "issue", "stock_receipt", "stock_issue", "stock_transfer",
           "stock_adjustment", "create_count", "update_count_lines", "post_count",
           "stock_levels", "valuation_as_of", "verify_inventory", "on_hand", "unit_cost"]
