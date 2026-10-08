"""Sales and purchase documents: conversion, posting, credit notes, returns, limits and rules."""

import unittest

from tests.helpers import Env
from genesis import catalog, documents, inventory, ledger
from genesis.errors import AccountingError, ValidationError

VAT18 = "VAT18"


def vat_id(env):
    return env.db.one("SELECT id FROM tax_rates WHERE code = ?", (VAT18,))["id"]


def cash_method(env):
    return env.db.one("SELECT id FROM payment_methods WHERE kind = 'cash'")["id"]


def make_customer(env, name="Acme Ltd", credit_limit="0"):
    return catalog.save_partner(env.ctx, "customer", {"name": name, "credit_limit": credit_limit})["id"]


def make_supplier(env, name="Supply Co"):
    return catalog.save_partner(env.ctx, "supplier", {"name": name})["id"]


def make_product(env, sku, price=1500, cost=1000):
    category = env.db.one("SELECT id FROM categories WHERE is_active = 1 ORDER BY id LIMIT 1")
    return catalog.save_product(env.ctx, {
        "sku": sku, "name": f"Item {sku}", "category_id": category["id"], "track_stock": True,
        "cost_price": str(cost), "selling_price": str(price), "tax_rate_id": vat_id(env),
    })["id"]


def stock_in(env, product_id, qty, unit_cost):
    inventory.stock_receipt(env.ctx, {
        "product_id": product_id, "warehouse_id": env.db.one("SELECT id FROM warehouses WHERE code='MAIN'")["id"],
        "quantity": str(qty), "unit_cost": str(unit_cost),
        "offset_account_id": env.account_id("opening_equity"), "date": "2026-01-05"})


def line(product_id, qty, price=None, **extra):
    data = {"product_id": product_id, "quantity": str(qty), "tax_rate_id": None, **extra}
    if price is not None:
        data["unit_price"] = str(price)
    return data


def sales_doc(env, doc_type, customer_id, lines, **extra):
    data = {"doc_type": doc_type, "customer_id": customer_id, "doc_date": "2026-03-01",
            "lines": [{**l, "tax_rate_id": l.get("tax_rate_id") or vat_id(env)} for l in lines], **extra}
    return documents.save_document(env.ctx, data)


def purchase_doc(env, doc_type, supplier_id, lines, **extra):
    data = {"doc_type": doc_type, "supplier_id": supplier_id, "doc_date": "2026-03-01",
            "lines": [{**l, "tax_rate_id": l.get("tax_rate_id") or vat_id(env)} for l in lines], **extra}
    return documents.save_document(env.ctx, data)


class SalesFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env(costing_method="fifo")
        cls.customer = make_customer(cls.env)
        cls.product = make_product(cls.env, "SELL-1", price=1500, cost=1000)
        stock_in(cls.env, cls.product, 20, 1000)

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_quote_order_invoice_chain_tracks_remaining_quantities(self):
        env = self.env
        quote = sales_doc(env, "sales_quote", self.customer, [line(self.product, 10, 1500)])
        documents.confirm_document(env.ctx, quote["id"])
        order = documents.convert_document(env.ctx, quote["id"], "sales_order")
        self.assertEqual(documents.document_view(env.db, quote["id"])["status"], "closed")
        documents.confirm_document(env.ctx, order["id"])
        order_lines = documents.document_view(env.db, order["id"])["lines"]
        self.assertEqual(len(order_lines), 1)
        invoice = documents.convert_document(env.ctx, order["id"], "sales_invoice")
        # Only part of the order is invoiced; the remainder must stay open.
        self.assertIsNotNone(invoice)
        self.assertEqual(documents.document_view(env.db, invoice["id"])["status"], "draft")

    def test_cannot_convert_more_than_the_remaining_quantity(self):
        env = self.env
        quote = sales_doc(env, "sales_quote", self.customer, [line(self.product, 2, 1500)])
        documents.confirm_document(env.ctx, quote["id"])
        order = documents.convert_document(env.ctx, quote["id"], "sales_order")
        documents.confirm_document(env.ctx, order["id"])
        source_line = documents.document_view(env.db, order["id"])["lines"][0]
        with self.assertRaises(AccountingError) as ctx:
            documents.save_document(env.ctx, {
                "doc_type": "sales_invoice", "customer_id": self.customer, "doc_date": "2026-03-02",
                "source_id": order["id"],
                "lines": [{"source_line_id": source_line["id"], "quantity": "5"}]})
        self.assertEqual(ctx.exception.key, "quantity_exceeds_remaining")

    def test_draft_can_be_deleted_but_confirmed_cannot_be_deleted_as_draft(self):
        env = self.env
        draft = sales_doc(env, "sales_quote", self.customer, [line(self.product, 1, 1500)])
        documents.delete_draft(env.ctx, draft["id"])
        confirmed = sales_doc(env, "sales_quote", self.customer, [line(self.product, 1, 1500)])
        documents.confirm_document(env.ctx, confirmed["id"])
        with self.assertRaises(AccountingError) as ctx:
            documents.delete_draft(env.ctx, confirmed["id"])
        self.assertEqual(ctx.exception.key, "document_not_draft")

    def test_invoice_posting_books_revenue_tax_cogs_and_stock(self):
        env = self.env
        inv = sales_doc(env, "sales_invoice", self.customer, [line(self.product, 3, 1500)])
        stock_before = inventory.on_hand(env.db, self.product)[0]
        result = documents.post_document(env.ctx, inv["id"])
        doc = documents.document_view(env.db, inv["id"])
        self.assertEqual(doc["status"], "posted")
        self.assertEqual(doc["subtotal_minor"], 4500)
        self.assertEqual(doc["tax_minor"], 810)
        self.assertEqual(doc["total_minor"], 5310)
        self.assertEqual(inventory.on_hand(env.db, self.product)[0], stock_before - 3 * 10000)
        self.assertEqual(ledger.verify_ledger(env.db), [])
        self.assertEqual(inventory.verify_inventory(env.db), [])
        entry = env.db.one("SELECT * FROM journal_entries WHERE id = ?", (doc["journal_entry_id"],))
        self.assertEqual(entry["total_minor"], 5310 + 3000)  # AR+tax+revenue side and COGS/inventory side
        self.assertIsNotNone(result)

    def test_posted_invoice_cannot_be_edited_or_reposted(self):
        env = self.env
        inv = sales_doc(env, "sales_invoice", self.customer, [line(self.product, 1, 1500)])
        documents.post_document(env.ctx, inv["id"])
        with self.assertRaises(AccountingError):
            documents.save_document(env.ctx, {"doc_type": "sales_invoice", "customer_id": self.customer,
                                              "lines": [line(self.product, 2, 1500)]}, inv["id"])
        with self.assertRaises(AccountingError) as ctx:
            documents.post_document(env.ctx, inv["id"])
        self.assertEqual(ctx.exception.key, "document_already_posted")

    def test_payment_at_posting_reduces_balance(self):
        env = self.env
        inv = sales_doc(env, "sales_invoice", self.customer, [line(self.product, 1, 1500)])
        documents.post_document(env.ctx, inv["id"], payment={"payment_method_id": cash_method(env),
                                                             "amount_minor": 500, "date": "2026-03-02"})
        view = documents.document_view(env.db, inv["id"])
        self.assertEqual(view["balance_minor"], 1770 - 500)
        self.assertEqual(view["payment_state"], "partial")
        self.assertEqual(ledger.verify_ledger(env.db), [])

    def test_credit_note_restocks_and_auto_applies_to_invoice(self):
        env = self.env
        customer = make_customer(env, "Returns Co")
        inv = sales_doc(env, "sales_invoice", customer, [line(self.product, 2, 1500)])
        documents.post_document(env.ctx, inv["id"])
        inv_line = documents.document_view(env.db, inv["id"])["lines"][0]
        stock_before = inventory.on_hand(env.db, self.product)[0]
        credit = documents.save_document(env.ctx, {
            "doc_type": "sales_credit", "customer_id": customer, "doc_date": "2026-03-05",
            "source_id": inv["id"], "restock": True,
            "lines": [{"source_line_id": inv_line["id"], "quantity": "1"}]})
        documents.post_document(env.ctx, credit["id"])
        self.assertEqual(inventory.on_hand(env.db, self.product)[0], stock_before + 10000)
        # Invoice 2 x 1500 + 18% VAT = 3540; credit 1 x 1500 + VAT = 1770 applied automatically.
        self.assertEqual(documents.document_view(env.db, inv["id"])["balance_minor"], 1770)
        self.assertEqual(ledger.verify_ledger(env.db), [])
        self.assertEqual(inventory.verify_inventory(env.db), [])

    def test_credit_limit_blocks_posting(self):
        env = self.env
        limited = make_customer(env, "Limited Ltd", credit_limit="1000")
        inv = sales_doc(env, "sales_invoice", limited, [line(self.product, 1, 1500)])
        with self.assertRaises(AccountingError) as ctx:
            documents.post_document(env.ctx, inv["id"])
        self.assertEqual(ctx.exception.key, "credit_limit_exceeded")
        self.assertEqual(documents.document_view(env.db, inv["id"])["status"], "draft")

    def test_confirm_and_cancel_rules(self):
        env = self.env
        quote = sales_doc(env, "sales_quote", self.customer, [line(self.product, 1, 1500)])
        documents.confirm_document(env.ctx, quote["id"])
        with self.assertRaises(AccountingError):
            documents.confirm_document(env.ctx, quote["id"])
        documents.cancel_document(env.ctx, quote["id"])
        self.assertEqual(documents.document_view(env.db, quote["id"])["status"], "cancelled")
        inv = sales_doc(env, "sales_invoice", self.customer, [line(self.product, 1, 1500)])
        documents.post_document(env.ctx, inv["id"])
        with self.assertRaises(AccountingError):
            documents.cancel_document(env.ctx, inv["id"])

    def test_document_without_lines_or_zero_total_rejected(self):
        env = self.env
        with self.assertRaises(ValidationError) as ctx:
            sales_doc(env, "sales_invoice", self.customer, [])
        self.assertEqual(ctx.exception.key, "document_no_lines")
        free = sales_doc(env, "sales_invoice", self.customer, [line(self.product, 1, 0)])
        with self.assertRaises(AccountingError) as ctx:
            documents.post_document(env.ctx, free["id"])
        self.assertEqual(ctx.exception.key, "document_total_zero")


class PurchaseFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env(costing_method="fifo")
        cls.supplier = make_supplier(cls.env)
        cls.product = make_product(cls.env, "BUY-1", price=2000, cost=1000)

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_purchase_invoice_receives_stock_at_net_cost(self):
        env = self.env
        inv = purchase_doc(env, "purchase_invoice", self.supplier, [line(self.product, 10, 1000)])
        before = inventory.on_hand(env.db, self.product)[0]
        documents.post_document(env.ctx, inv["id"])
        self.assertEqual(inventory.on_hand(env.db, self.product), (before + 10 * 10000, 10000))
        view = documents.document_view(env.db, inv["id"])
        self.assertEqual(view["total_minor"], 11800)
        self.assertEqual(ledger.verify_ledger(env.db), [])
        self.assertEqual(inventory.verify_inventory(env.db), [])
        self.assertEqual(ledger.account_balance(env.db, env.account_id("inventory")),
                         sum(l["value_minor"] for l in env.db.query("SELECT value_minor FROM stock_levels")))

    def test_purchase_return_books_cost_difference_to_stock_adjustment(self):
        """Two receipts at 1000 and 1200. Returning one unit from the 1200 invoice is costed at the
        oldest FIFO layer (1000), so the 200 difference goes to stock adjustment."""
        env = self.env
        product = make_product(env, "BUY-2", price=2000, cost=1000)
        first = purchase_doc(env, "purchase_invoice", self.supplier, [line(product, 4, 1000)])
        documents.post_document(env.ctx, first["id"])
        second = purchase_doc(env, "purchase_invoice", self.supplier, [line(product, 4, 1200)])
        documents.post_document(env.ctx, second["id"])
        second_line = documents.document_view(env.db, second["id"])["lines"][0]
        ret = documents.save_document(env.ctx, {
            "doc_type": "purchase_return", "supplier_id": self.supplier, "doc_date": "2026-03-07",
            "source_id": second["id"],
            "lines": [{"source_line_id": second_line["id"], "quantity": "1"}]})
        self.assertEqual(documents.document_view(env.db, ret["id"])["lines"][0]["unit_price_minor"], 1200)
        documents.post_document(env.ctx, ret["id"])
        posted = documents.document_view(env.db, ret["id"])
        lines = env.db.query(
            "SELECT a.code, jl.debit_minor, jl.credit_minor FROM journal_lines jl "
            "JOIN accounts a ON a.id = jl.account_id WHERE jl.entry_id = ?", (posted["journal_entry_id"],))
        by_code = {}
        for row in lines:
            slot = by_code.setdefault(row["code"], [0, 0])
            slot[0] += row["debit_minor"]
            slot[1] += row["credit_minor"]
        inventory_code = env.db.one("SELECT a.code FROM accounts a WHERE a.system_role = 'inventory'")["code"]
        adjustment_code = env.db.one("SELECT a.code FROM accounts a WHERE a.system_role = 'stock_adjustment'")["code"]
        self.assertEqual(by_code[inventory_code], [0, 1000])
        self.assertEqual(by_code[adjustment_code], [0, 200])
        self.assertEqual(ledger.verify_ledger(env.db), [])
        self.assertEqual(inventory.verify_inventory(env.db), [])


if __name__ == "__main__":
    unittest.main()
