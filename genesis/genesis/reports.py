"""Financial and operational reports.

Each builder returns a neutral structure:
  {"key", "title_key", "params", "decimals", "columns": [{key,label_key,type}],
   "rows": [...], "summary": [{label_key, value, type}], "checks": {...}}
Money values are integers in minor units; the caller formats them.
Row "kind" values: line, section, total, grand, blank.
"""

from datetime import date, timedelta

from . import catalog, inventory
from .company import currency_info, read_settings, system_account_ids
from .documents import document_balance
from .errors import ValidationError
from .ledger import account_balance, trial_balance_rows
from .money import div_round, parse_iso_date
from .timeutil import today_iso

MONEY, TEXT, DATE, QTY, INT, PERCENT = "money", "text", "date", "qty", "int", "percent"


def tr(key):
    """Mark a text cell whose value is a translation key (rendered in the reader's language)."""
    return {"key": key}


def _col(key, label, kind=TEXT):
    return {"key": key, "label_key": label, "type": kind}


def _range(db, start, end):
    end_value = parse_iso_date(end or today_iso(), "end").isoformat()
    if start:
        start_value = parse_iso_date(start, "start").isoformat()
    else:
        start_value = fiscal_year_start(db, end_value)
    if start_value > end_value:
        raise ValidationError("invalid_period")
    return start_value, end_value


def fiscal_year_start(db, as_of):
    month = int(read_settings(db).get("fiscal_year_start_month", 1))
    as_of_date = date.fromisoformat(as_of)
    year = as_of_date.year if as_of_date.month >= month else as_of_date.year - 1
    return date(year, month, 1).isoformat()


def _base(key, title, params, decimals, columns, rows, summary=None, checks=None):
    return {"key": key, "title_key": title, "params": params, "decimals": decimals,
            "columns": columns, "rows": rows, "summary": summary or [], "checks": checks or {}}


def _decimals(db):
    return currency_info(db)[0]


def _signed_period(db, account_id, start, end):
    """Debit minus credit for an account within a date range."""
    return (account_balance(db, account_id, through=end)
            - account_balance(db, account_id, through=(date.fromisoformat(start) - timedelta(days=1)).isoformat()))


# ----------------------------------------------------------------------
# Trial balance and ledgers
# ----------------------------------------------------------------------

def trial_balance(db, start=None, end=None):
    start, end = _range(db, start, end)
    rows, total_dr, total_cr, total_close_dr, total_close_cr = [], 0, 0, 0, 0
    for account in trial_balance_rows(db, start, end):
        if account["is_header"]:
            continue
        if not any([account["opening_minor"], account["debit_minor"], account["credit_minor"]]):
            continue
        closing = account["closing_minor"]
        rows.append({
            "kind": "line",
            "code": account["code"], "name": account["name"], "account_type": tr("acct_type_" + account["account_type"]),
            "opening": account["opening_minor"],
            "debit": account["debit_minor"], "credit": account["credit_minor"],
            "closing_debit": max(closing, 0), "closing_credit": max(-closing, 0),
        })
        total_dr += account["debit_minor"]
        total_cr += account["credit_minor"]
        total_close_dr += max(closing, 0)
        total_close_cr += max(-closing, 0)
    rows.append({"kind": "grand", "code": "", "name": "", "account_type": "",
                 "opening": None, "debit": total_dr, "credit": total_cr,
                 "closing_debit": total_close_dr, "closing_credit": total_close_cr})
    columns = [_col("code", "col_code"), _col("name", "col_account"),
               _col("opening", "col_opening", MONEY), _col("debit", "col_debit", MONEY),
               _col("credit", "col_credit", MONEY), _col("closing_debit", "col_closing_debit", MONEY),
               _col("closing_credit", "col_closing_credit", MONEY)]
    balanced = total_dr == total_cr and total_close_dr == total_close_cr
    return _base("trial_balance", "report_trial_balance", {"start": start, "end": end},
                 _decimals(db), columns, rows,
                 summary=[{"label_key": "summary_balanced", "value": balanced, "type": TEXT}],
                 checks={"balanced": balanced})


def general_ledger(db, start=None, end=None, account_id=None):
    start, end = _range(db, start, end)
    sql = "SELECT * FROM accounts WHERE is_header = 0"
    params = []
    if account_id:
        sql += " AND id = ?"
        params.append(int(account_id))
    sql += " ORDER BY code"
    rows = []
    for account in db.query(sql, params):
        opening = account_balance(db, account["id"], through=(
            date.fromisoformat(start) - timedelta(days=1)).isoformat())
        movements = db.query(
            "SELECT je.entry_date, je.entry_no, je.reference, je.description AS entry_description, "
            "jl.description AS line_description, jl.debit_minor, jl.credit_minor, "
            "c.name AS customer_name, s.name AS supplier_name FROM journal_lines jl "
            "JOIN journal_entries je ON je.id = jl.entry_id "
            "LEFT JOIN customers c ON c.id = jl.party_id AND jl.party_type = 'customer' "
            "LEFT JOIN suppliers s ON s.id = jl.party_id AND jl.party_type = 'supplier' "
            "WHERE jl.account_id = ? AND je.entry_date BETWEEN ? AND ? "
            "ORDER BY je.entry_date, je.id, jl.line_no", (account["id"], start, end))
        if not movements and opening == 0 and not account_id:
            continue
        rows.append({"kind": "section", "code": account["code"], "name": account["name"],
                     "date": None, "entry_no": None, "reference": None,
                     "description": tr("opening_balance_row"), "debit": None, "credit": None,
                     "balance": opening})
        running = opening
        for line in movements:
            running += line["debit_minor"] - line["credit_minor"]
            party = line["customer_name"] or line["supplier_name"] or ""
            description = line["line_description"] or line["entry_description"]
            rows.append({"kind": "line", "code": account["code"], "name": account["name"],
                         "date": line["entry_date"], "entry_no": line["entry_no"],
                         "reference": line["reference"],
                         "description": f"{description}" + (f" [{party}]" if party else ""),
                         "debit": line["debit_minor"], "credit": line["credit_minor"],
                         "balance": running})
        rows.append({"kind": "total", "code": account["code"], "name": account["name"],
                     "date": None, "entry_no": None, "reference": None,
                     "description": tr("closing_balance_row"), "debit": None, "credit": None,
                     "balance": running})
    columns = [_col("code", "col_code"), _col("date", "col_date", DATE),
               _col("entry_no", "col_entry"), _col("reference", "col_reference"),
               _col("description", "col_description"), _col("debit", "col_debit", MONEY),
               _col("credit", "col_credit", MONEY), _col("balance", "col_balance", MONEY)]
    return _base("general_ledger", "report_general_ledger", {"start": start, "end": end,
                 "account_id": account_id}, _decimals(db), columns, rows)


# ----------------------------------------------------------------------
# Financial statements
# ----------------------------------------------------------------------

def _account_amounts(db, account_types, start, end):
    placeholders = ",".join("?" for _ in account_types)
    accounts = db.query(f"SELECT id, code, name, account_type FROM accounts WHERE is_header = 0 "
                        f"AND account_type IN ({placeholders}) ORDER BY code", tuple(account_types))
    result = []
    for account in accounts:
        signed = _signed_period(db, account["id"], start, end)
        if signed == 0:
            continue
        sign = -1 if account["account_type"] in ("revenue", "liability", "equity") else 1
        result.append({**account, "amount": sign * signed})
    return result


def profit_loss(db, start=None, end=None):
    start, end = _range(db, start, end)
    rows = []
    revenue = _account_amounts(db, ["revenue"], start, end)
    cogs = _account_amounts(db, ["cogs"], start, end)
    expenses = _account_amounts(db, ["expense"], start, end)
    total_revenue = sum(a["amount"] for a in revenue)
    total_cogs = sum(a["amount"] for a in cogs)
    total_expenses = sum(a["amount"] for a in expenses)
    gross = total_revenue - total_cogs
    net = gross - total_expenses

    def block(title_key, items, total_key, total):
        rows.append({"kind": "section", "code": "", "name": tr(title_key), "amount": None})
        for item in items:
            rows.append({"kind": "line", "code": item["code"], "name": item["name"], "amount": item["amount"]})
        rows.append({"kind": "total", "code": "", "name": tr(total_key), "amount": total})

    block("pl_revenue", revenue, "pl_total_revenue", total_revenue)
    block("pl_cogs", cogs, "pl_total_cogs", total_cogs)
    rows.append({"kind": "total", "code": "", "name": tr("pl_gross_profit"), "amount": gross})
    block("pl_expenses", expenses, "pl_total_expenses", total_expenses)
    rows.append({"kind": "grand", "code": "", "name": tr("pl_net_profit"), "amount": net})
    margin = div_round(gross * 10000, total_revenue) if total_revenue else 0
    columns = [_col("code", "col_code"), _col("name", "col_account"), _col("amount", "col_amount", MONEY)]
    return _base("profit_loss", "report_profit_loss", {"start": start, "end": end}, _decimals(db),
                 columns, rows,
                 summary=[{"label_key": "pl_gross_profit", "value": gross, "type": MONEY},
                          {"label_key": "pl_net_profit", "value": net, "type": MONEY},
                          {"label_key": "pl_gross_margin", "value": margin, "type": PERCENT}],
                 checks={"net_profit": net, "gross_profit": gross, "revenue": total_revenue})


def balance_sheet(db, as_of=None):
    as_of = parse_iso_date(as_of or today_iso(), "as_of").isoformat()
    rows = []
    totals = {}
    for group, types in (("bs_assets", ["asset"]), ("bs_liabilities", ["liability"]),
                         ("bs_equity", ["equity"])):
        items = []
        for account in db.query(
                f"SELECT id, code, name, account_type FROM accounts WHERE is_header = 0 "
                f"AND account_type IN ({','.join('?' for _ in types)}) ORDER BY code", tuple(types)):
            balance = account_balance(db, account["id"], through=as_of)
            if balance == 0:
                continue
            sign = 1 if account["account_type"] == "asset" else -1
            items.append({"code": account["code"], "name": account["name"], "amount": sign * balance})
        total = sum(item["amount"] for item in items)
        totals[group] = total
        rows.append({"kind": "section", "code": "", "name": tr(group), "amount": None})
        rows.extend({"kind": "line", **item} for item in items)
        rows.append({"kind": "total", "code": "", "name": tr(f"{group}_total"), "amount": total})
        if group == "bs_equity":
            earnings = _cumulative_earnings(db, as_of)
            rows.append({"kind": "line", "code": "", "name": tr("bs_current_earnings"), "amount": earnings})
            totals[group] = total + earnings
            rows.append({"kind": "total", "code": "", "name": tr("bs_equity_total"), "amount": totals[group]})
    liabilities_equity = totals["bs_liabilities"] + totals["bs_equity"]
    difference = totals["bs_assets"] - liabilities_equity
    rows.append({"kind": "grand", "code": "", "name": tr("bs_liabilities_equity_total"),
                 "amount": liabilities_equity})
    columns = [_col("code", "col_code"), _col("name", "col_account"), _col("amount", "col_amount", MONEY)]
    return _base("balance_sheet", "report_balance_sheet", {"as_of": as_of}, _decimals(db), columns, rows,
                 summary=[{"label_key": "bs_assets_total", "value": totals["bs_assets"], "type": MONEY},
                          {"label_key": "bs_liabilities_equity_total", "value": liabilities_equity,
                           "type": MONEY}],
                 checks={"balanced": difference == 0, "difference": difference})


def _cumulative_earnings(db, as_of):
    """Revenue minus COGS and expenses up to a date (profits not yet closed to equity)."""
    sql = ("SELECT a.account_type AS t, COALESCE(SUM(jl.credit_minor), 0) AS cr, "
           "COALESCE(SUM(jl.debit_minor), 0) AS dr FROM journal_lines jl "
           "JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id "
           "WHERE a.account_type IN ('revenue','cogs','expense') AND je.entry_date <= ? "
           "GROUP BY a.account_type")
    earnings = 0
    for row in db.query(sql, (as_of,)):
        if row["t"] == "revenue":
            earnings += row["cr"] - row["dr"]
        else:
            earnings -= row["dr"] - row["cr"]
    return earnings


def cash_flow(db, start=None, end=None):
    start, end = _range(db, start, end)
    cash_accounts = sorted({row["account_id"] for row in db.query("SELECT account_id FROM payment_methods")})
    placeholders = ",".join("?" for _ in cash_accounts) or "NULL"
    before_start = (date.fromisoformat(start) - timedelta(days=1)).isoformat()
    opening = sum(account_balance(db, acc, through=before_start) for acc in cash_accounts)
    closing = sum(account_balance(db, acc, through=end) for acc in cash_accounts)
    # Each cash line is classified by its entry's source. Party lookups are scalar
    # subqueries so an entry with several party lines cannot double count cash.
    entries = db.query(
        f"SELECT je.id, je.source_type, "
        f"(SELECT MIN(pl.party_id) FROM journal_lines pl WHERE pl.entry_id = je.id "
        f" AND pl.party_type = 'customer') AS customer_id, "
        f"(SELECT MIN(pl.party_id) FROM journal_lines pl WHERE pl.entry_id = je.id "
        f" AND pl.party_type = 'supplier') AS supplier_id, "
        f"SUM(jl.debit_minor) - SUM(jl.credit_minor) AS net FROM journal_entries je "
        f"JOIN journal_lines jl ON jl.entry_id = je.id "
        f"WHERE jl.account_id IN ({placeholders}) AND je.entry_date BETWEEN ? AND ? "
        f"GROUP BY je.id", tuple(cash_accounts) + (start, end))
    receipts = payments_out = other = 0
    for entry in entries:
        if entry["source_type"] == "payment" and entry["customer_id"]:
            receipts += entry["net"]
        elif entry["source_type"] == "payment" and entry["supplier_id"]:
            payments_out += entry["net"]
        else:
            other += entry["net"]
    rows = [
        {"kind": "line", "code": "", "name": tr("cf_receipts"), "amount": receipts},
        {"kind": "line", "code": "", "name": tr("cf_supplier_payments"), "amount": payments_out},
        {"kind": "line", "code": "", "name": tr("cf_other"), "amount": other},
        {"kind": "total", "code": "", "name": tr("cf_net_change"), "amount": receipts + payments_out + other},
        {"kind": "line", "code": "", "name": tr("cf_opening"), "amount": opening},
        {"kind": "grand", "code": "", "name": tr("cf_closing"), "amount": closing},
    ]
    columns = [_col("code", "col_code"), _col("name", "col_account"), _col("amount", "col_amount", MONEY)]
    difference = opening + receipts + payments_out + other - closing
    return _base("cash_flow", "report_cash_flow", {"start": start, "end": end}, _decimals(db),
                 columns, rows, checks={"reconciled": difference == 0, "difference": difference})


def cash_bank(db, start=None, end=None):
    start, end = _range(db, start, end)
    rows = []
    for method in db.query("SELECT pm.name, pm.kind, a.id, a.code FROM payment_methods pm "
                           "JOIN accounts a ON a.id = pm.account_id ORDER BY pm.name"):
        opening = account_balance(db, method["id"], through=(date.fromisoformat(start) - timedelta(days=1)).isoformat())
        movement = db.one(
            "SELECT COALESCE(SUM(jl.debit_minor), 0) AS dr, COALESCE(SUM(jl.credit_minor), 0) AS cr "
            "FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id "
            "WHERE jl.account_id = ? AND je.entry_date BETWEEN ? AND ?", (method["id"], start, end))
        rows.append({"kind": "line", "code": method["code"], "name": method["name"],
                     "opening": opening, "receipts": movement["dr"], "payments": movement["cr"],
                     "closing": opening + movement["dr"] - movement["cr"]})
    columns = [_col("code", "col_code"), _col("name", "col_account"), _col("opening", "col_opening", MONEY),
               _col("receipts", "col_in", MONEY), _col("payments", "col_out", MONEY),
               _col("closing", "col_closing", MONEY)]
    return _base("cash_bank", "report_cash_bank", {"start": start, "end": end}, _decimals(db), columns, rows)


# ----------------------------------------------------------------------
# Sales, purchases, inventory
# ----------------------------------------------------------------------

def _document_report(db, key, title, doc_types, start, end, party_column, party_table,
                     customer_id=None, supplier_id=None):
    start, end = _range(db, start, end)
    sql = (f"SELECT d.id, d.number, d.doc_type, d.doc_date, d.status, d.subtotal_minor, d.tax_minor, "
           f"d.total_minor, p.name AS party_name, p.code AS party_code FROM documents d "
           f"JOIN {party_table} p ON p.id = d.{party_column} "
           f"WHERE d.doc_type IN ({','.join('?' for _ in doc_types)}) AND d.status IN ('posted', 'closed') "
           f"AND d.doc_date BETWEEN ? AND ?")
    params = list(doc_types) + [start, end]
    if customer_id:
        sql += f" AND d.{party_column} = ?"
        params.append(int(customer_id))
    if supplier_id:
        sql += f" AND d.{party_column} = ?"
        params.append(int(supplier_id))
    sql += " ORDER BY d.doc_date, d.id"
    rows = []
    totals = {"subtotal": 0, "tax": 0, "total": 0}
    for doc in db.query(sql, params):
        sign = -1 if doc["doc_type"].endswith(("credit", "return")) else 1
        rows.append({"kind": "line", "date": doc["doc_date"], "number": doc["number"],
                     "doc_type": tr("doctype_" + doc["doc_type"]), "party_code": doc["party_code"],
                     "party_name": doc["party_name"], "subtotal": sign * doc["subtotal_minor"],
                     "tax": sign * doc["tax_minor"], "total": sign * doc["total_minor"],
                     "status": tr("status_" + doc["status"])})
        totals["subtotal"] += sign * doc["subtotal_minor"]
        totals["tax"] += sign * doc["tax_minor"]
        totals["total"] += sign * doc["total_minor"]
    rows.append({"kind": "grand", "date": None, "number": "", "doc_type": "", "party_code": "",
                 "party_name": tr("report_total"), "subtotal": totals["subtotal"], "tax": totals["tax"],
                 "total": totals["total"], "status": ""})
    columns = [_col("date", "col_date", DATE), _col("number", "col_number"),
               _col("doc_type", "col_type"), _col("party_code", "col_code"),
               _col("party_name", "col_party"), _col("subtotal", "col_net", MONEY),
               _col("tax", "col_tax", MONEY), _col("total", "col_total", MONEY),
               _col("status", "col_status")]
    return _base(key, title, {"start": start, "end": end}, _decimals(db), columns, rows,
                 summary=[{"label_key": "col_total", "value": totals["total"], "type": MONEY}])


def sales_report(db, start=None, end=None, customer_id=None):
    return _document_report(db, "sales_report", "report_sales_report",
                            ("sales_invoice", "sales_credit"), start, end,
                            "customer_id", "customers", customer_id=customer_id)


def purchase_report(db, start=None, end=None, supplier_id=None):
    return _document_report(db, "purchase_report", "report_purchase_report",
                            ("purchase_invoice", "purchase_return"), start, end,
                            "supplier_id", "suppliers", supplier_id=supplier_id)


def inventory_valuation(db, as_of=None, warehouse_id=None):
    as_of = parse_iso_date(as_of or today_iso(), "as_of").isoformat()
    rows = []
    total_value = 0
    for item in inventory.valuation_as_of(db, as_of, warehouse_id):
        qty, value = item["qty_scaled"], item["value_minor"]
        unit = div_round(value * 10000, qty) if qty else 0
        rows.append({"kind": "line", "code": item["sku"], "name": item["name"],
                     "warehouse": item["warehouse_code"], "unit": item["unit"],
                     "qty": qty, "unit_cost": unit, "value": value})
        total_value += value
    rows.append({"kind": "grand", "code": "", "name": tr("report_total"), "warehouse": "", "unit": "",
                 "qty": None, "unit_cost": None, "value": total_value})
    columns = [_col("code", "col_sku"), _col("name", "col_product"), _col("warehouse", "col_warehouse"),
               _col("unit", "col_unit"), _col("qty", "col_qty", QTY), _col("unit_cost", "col_unit_cost", MONEY),
               _col("value", "col_value", MONEY)]
    return _base("inventory_valuation", "report_inventory_valuation", {"as_of": as_of, "warehouse_id": warehouse_id},
                 _decimals(db), columns, rows,
                 summary=[{"label_key": "col_value", "value": total_value, "type": MONEY}],
                 checks={"value_total": total_value})


def inventory_movement(db, start=None, end=None, product_id=None, warehouse_id=None):
    start, end = _range(db, start, end)
    sql = ("SELECT sm.*, p.sku, p.name AS product_name, w.code AS warehouse_code, u.username "
           "FROM stock_movements sm JOIN products p ON p.id = sm.product_id "
           "JOIN warehouses w ON w.id = sm.warehouse_id JOIN users u ON u.id = sm.created_by "
           "WHERE sm.movement_date BETWEEN ? AND ?")
    params = [start, end]
    if product_id:
        sql += " AND sm.product_id = ?"
        params.append(int(product_id))
    if warehouse_id:
        sql += " AND sm.warehouse_id = ?"
        params.append(int(warehouse_id))
    sql += " ORDER BY sm.movement_date, sm.id"
    rows = []
    for m in db.query(sql, params):
        rows.append({"kind": "line", "date": m["movement_date"], "type": m["movement_type"],
                     "reference": m["reference"], "code": m["sku"], "name": m["product_name"],
                     "warehouse": m["warehouse_code"], "qty": m["qty_scaled"], "value": m["value_minor"],
                     "user": m["username"]})
    columns = [_col("date", "col_date", DATE), _col("type", "col_type"), _col("reference", "col_reference"),
               _col("code", "col_sku"), _col("name", "col_product"), _col("warehouse", "col_warehouse"),
               _col("qty", "col_qty", QTY), _col("value", "col_value", MONEY), _col("user", "col_user")]
    return _base("inventory_movement", "report_inventory_movement", {"start": start, "end": end},
                 _decimals(db), columns, rows)


def tax_report(db, start=None, end=None):
    start, end = _range(db, start, end)
    sql = ("SELECT t.id, t.name, t.rate_bps, d.doc_type, "
           "SUM(dl.net_minor) AS net, SUM(dl.tax_minor) AS tax "
           "FROM document_lines dl JOIN documents d ON d.id = dl.document_id "
           "JOIN tax_rates t ON t.id = dl.tax_rate_id "
           "WHERE d.status IN ('posted', 'closed') AND d.doc_date BETWEEN ? AND ? "
           "AND d.doc_type IN ('sales_invoice','sales_credit','purchase_invoice','purchase_return') "
           "GROUP BY t.id, d.doc_type ORDER BY t.rate_bps, t.name")
    per_rate = {}
    for row in db.query(sql, (start, end)):
        sign = -1 if row["doc_type"] in ("sales_credit", "purchase_return") else 1
        side = "sales" if row["doc_type"].startswith("sales") else "purchase"
        entry = per_rate.setdefault(row["id"], {"name": row["name"], "rate_bps": row["rate_bps"],
                                                "sales_net": 0, "sales_tax": 0,
                                                "purchase_net": 0, "purchase_tax": 0})
        entry[f"{side}_net"] += sign * row["net"]
        entry[f"{side}_tax"] += sign * row["tax"]
    rows = []
    totals = {"sales_net": 0, "sales_tax": 0, "purchase_net": 0, "purchase_tax": 0}
    for entry in per_rate.values():
        rows.append({"kind": "line", "name": entry["name"], "rate": entry["rate_bps"],
                     "sales_net": entry["sales_net"], "sales_tax": entry["sales_tax"],
                     "purchase_net": entry["purchase_net"], "purchase_tax": entry["purchase_tax"]})
        for key in totals:
            totals[key] += entry[key]
    rows.append({"kind": "grand", "name": tr("report_total"), "rate": None, **totals})
    payable = totals["sales_tax"] - totals["purchase_tax"]
    columns = [_col("name", "col_tax_rate"), _col("rate", "col_rate", PERCENT),
               _col("sales_net", "col_sales_net", MONEY), _col("sales_tax", "col_output_tax", MONEY),
               _col("purchase_net", "col_purchase_net", MONEY), _col("purchase_tax", "col_input_tax", MONEY)]
    return _base("tax_report", "report_tax_report", {"start": start, "end": end}, _decimals(db), columns, rows,
                 summary=[{"label_key": "tax_net_payable", "value": payable, "type": MONEY}],
                 checks={"net_payable": payable})


# ----------------------------------------------------------------------
# Partner statements and ageing
# ----------------------------------------------------------------------

def partner_statement(db, kind, partner_id, start=None, end=None):
    start, end = _range(db, start, end)
    partner = catalog.get_partner(db, kind, int(partner_id))
    roles = system_account_ids(db)
    control = roles["ar"] if kind == "customer" else roles["ap"]
    before = (date.fromisoformat(start) - timedelta(days=1)).isoformat()
    opening = account_balance(db, control, through=before, party_type=kind, party_id=partner["id"])
    lines = db.query(
        "SELECT je.entry_date, je.entry_no, je.reference, jl.description, je.description AS entry_description, "
        "jl.debit_minor, jl.credit_minor FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id "
        "WHERE jl.account_id = ? AND jl.party_type = ? AND jl.party_id = ? "
        "AND je.entry_date BETWEEN ? AND ? ORDER BY je.entry_date, je.id, jl.line_no",
        (control, kind, partner["id"], start, end))
    rows = [{"kind": "section", "date": None, "reference": "", "entry_no": "",
             "description": tr("opening_balance_row"), "debit": None, "credit": None, "balance": opening}]
    running = opening
    for line in lines:
        running += line["debit_minor"] - line["credit_minor"]
        rows.append({"kind": "line", "date": line["entry_date"], "entry_no": line["entry_no"],
                     "reference": line["reference"] or "",
                     "description": line["description"] or line["entry_description"],
                     "debit": line["debit_minor"], "credit": line["credit_minor"], "balance": running})
    rows.append({"kind": "total", "date": None, "reference": "", "entry_no": "",
                 "description": tr("closing_balance_row"), "debit": None, "credit": None, "balance": running})
    columns = [_col("date", "col_date", DATE), _col("entry_no", "col_entry"),
               _col("reference", "col_reference"), _col("description", "col_description"),
               _col("debit", "col_debit", MONEY), _col("credit", "col_credit", MONEY),
               _col("balance", "col_balance", MONEY)]
    key = "customer_statement" if kind == "customer" else "supplier_statement"
    title = "report_customer_statement" if kind == "customer" else "report_supplier_statement"
    return _base(key, title, {"start": start, "end": end, "partner_id": partner["id"],
                 "partner_name": partner["name"], "partner_code": partner["code"]},
                 _decimals(db), columns, rows,
                 summary=[{"label_key": "col_balance", "value": running, "type": MONEY}],
                 checks={"closing": running})


def ageing(db, kind, as_of=None):
    """Open items by days past due. Unallocated payments, credits and opening balances are shown separately."""
    as_of = parse_iso_date(as_of or today_iso(), "as_of").isoformat()
    roles = system_account_ids(db)
    control = roles["ar"] if kind == "customer" else roles["ap"]
    invoice_type = "sales_invoice" if kind == "customer" else "purchase_invoice"
    column = "customer_id" if kind == "customer" else "supplier_id"
    table = "customers" if kind == "customer" else "suppliers"
    buckets = ("current", "d1_30", "d31_60", "d61_90", "d90_plus")
    rows = []
    totals = {key: 0 for key in buckets + ("unallocated", "total")}
    for partner in db.query(f"SELECT id, code, name FROM {table} ORDER BY name"):
        ledger_balance = account_balance(db, control, through=as_of, party_type=kind, party_id=partner["id"])
        item_buckets = {key: 0 for key in buckets}
        invoices = db.query(
            f"SELECT * FROM documents WHERE doc_type = ? AND status = 'posted' AND {column} = ? "
            "AND doc_date <= ?", (invoice_type, partner["id"], as_of))
        invoices_open = 0
        for doc in invoices:
            open_amount = document_balance(db, doc)
            if open_amount <= 0:
                continue
            invoices_open += open_amount
            days = (date.fromisoformat(as_of) - date.fromisoformat(doc["due_date"] or doc["doc_date"])).days
            item_buckets[_bucket(days)] += open_amount
        unallocated = ledger_balance - invoices_open
        if ledger_balance == 0 and invoices_open == 0:
            continue
        row = {"kind": "line", "code": partner["code"], "name": partner["name"],
               **item_buckets, "unallocated": unallocated, "total": ledger_balance}
        rows.append(row)
        for key in buckets:
            totals[key] += item_buckets[key]
        totals["unallocated"] += unallocated
        totals["total"] += ledger_balance
    rows.append({"kind": "grand", "code": "", "name": tr("report_total"), **totals})
    columns = [_col("code", "col_code"), _col("name", "col_party"),
               _col("current", "age_current", MONEY), _col("d1_30", "age_1_30", MONEY),
               _col("d31_60", "age_31_60", MONEY), _col("d61_90", "age_61_90", MONEY),
               _col("d90_plus", "age_90_plus", MONEY), _col("unallocated", "age_unallocated", MONEY),
               _col("total", "col_total", MONEY)]
    key = "ar_ageing" if kind == "customer" else "ap_ageing"
    title = "report_ar_ageing" if kind == "customer" else "report_ap_ageing"
    return _base(key, title, {"as_of": as_of}, _decimals(db), columns, rows,
                 checks={"total": totals["total"], "control": account_balance(db, control, through=as_of)})


def _bucket(days_past_due):
    if days_past_due <= 0:
        return "current"
    if days_past_due <= 30:
        return "d1_30"
    if days_past_due <= 60:
        return "d31_60"
    if days_past_due <= 90:
        return "d61_90"
    return "d90_plus"


# ----------------------------------------------------------------------
# Dashboard
# ----------------------------------------------------------------------

def dashboard(db, start=None, end=None):
    start, end = _range(db, start, end)
    decimals = _decimals(db)
    roles = system_account_ids(db)

    def sum_docs(doc_type, sign=1):
        return sign * db.scalar(
            "SELECT COALESCE(SUM(total_minor), 0) FROM documents WHERE doc_type = ? "
            "AND status IN ('posted','closed') AND doc_date BETWEEN ? AND ?",
            (doc_type, start, end), 0)

    sales = sum_docs("sales_invoice") - sum_docs("sales_credit")
    purchases = sum_docs("purchase_invoice") - sum_docs("purchase_return")
    pl = profit_loss(db, start, end)["checks"]
    valuation = inventory.valuation_as_of(db, end)
    inventory_value = sum(item["value_minor"] for item in valuation)
    recent_documents = db.query(
        "SELECT d.number, d.doc_type, d.doc_date, d.total_minor, d.status, "
        "COALESCE(c.name, s.name) AS party_name FROM documents d "
        "LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN suppliers s ON s.id = d.supplier_id "
        "WHERE d.status IN ('posted','closed') ORDER BY d.id DESC LIMIT 8")
    recent_entries = db.query(
        "SELECT entry_no, entry_date, description, total_minor FROM journal_entries "
        "ORDER BY id DESC LIMIT 8")
    low_stock = inventory.stock_levels(db, low_only=True)[:10]
    return {
        "period": {"start": start, "end": end},
        "decimals": decimals,
        "kpis": {
            "total_sales": sales,
            "total_purchases": purchases,
            "cash_balance": account_balance(db, roles["cash"], through=end),
            "bank_balance": account_balance(db, roles["bank"], through=end),
            "mobile_balance": account_balance(db, roles["mobile_money"], through=end),
            "accounts_receivable": account_balance(db, roles["ar"], through=end),
            "accounts_payable": -account_balance(db, roles["ap"], through=end),
            "inventory_value": inventory_value,
            "gross_profit": pl["gross_profit"],
            "net_profit": pl["net_profit"],
        },
        "recent_documents": recent_documents,
        "recent_entries": recent_entries,
        "low_stock": low_stock,
        "top_customers": [c for c in catalog.list_partners(db, "customer") if c["balance_minor"] > 0][:10],
        "top_suppliers": [s for s in catalog.list_partners(db, "supplier") if s["balance_minor"] != 0][:10],
    }


BUILDERS = {
    "trial_balance": trial_balance,
    "general_ledger": general_ledger,
    "profit_loss": profit_loss,
    "balance_sheet": balance_sheet,
    "cash_flow": cash_flow,
    "cash_bank": cash_bank,
    "sales_report": sales_report,
    "purchase_report": purchase_report,
    "inventory_valuation": inventory_valuation,
    "inventory_movement": inventory_movement,
    "tax_report": tax_report,
    "ar_ageing": lambda db, **kw: ageing(db, "customer", kw.get("as_of")),
    "ap_ageing": lambda db, **kw: ageing(db, "supplier", kw.get("as_of")),
    "customer_statement": lambda db, **kw: partner_statement(db, "customer", kw["partner_id"], kw.get("start"), kw.get("end")),
    "supplier_statement": lambda db, **kw: partner_statement(db, "supplier", kw["partner_id"], kw.get("start"), kw.get("end")),
}
