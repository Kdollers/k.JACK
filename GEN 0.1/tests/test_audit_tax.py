"""Tax reporting reconciles to posted documents; the audit trail records real actions and is immutable."""

import sqlite3
import unittest

from genesis import api, catalog, documents, payments, reports
from tests.helpers import Env
from tests.test_documents import line, make_product, purchase_doc, sales_doc, stock_in, cash_method

START, END = "2026-01-01", "2026-12-31"


class TaxReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env(costing_method="weighted_average")
        env = cls.env
        cls.customer = catalog.save_partner(env.ctx, "customer", {"name": "Tax Customer"})["id"]
        cls.supplier = catalog.save_partner(env.ctx, "supplier", {"name": "Tax Supplier"})["id"]
        cls.product = make_product(env, "TAX-1", price=1500, cost=1000)
        stock_in(env, cls.product, 50, 1000)
        cls.invoice = sales_doc(env, "sales_invoice", cls.customer, [line(cls.product, 3, 1500)],
                                doc_date="2026-04-01")
        documents.post_document(env.ctx, cls.invoice["id"])
        cls.purchase = purchase_doc(env, "purchase_invoice", cls.supplier, [line(cls.product, 20, 1000)],
                                    doc_date="2026-04-02")
        documents.post_document(env.ctx, cls.purchase["id"])

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def tax_totals(self):
        report = reports.BUILDERS["tax_report"](self.env.db, start=START, end=END)
        grand = [r for r in report["rows"] if r["kind"] == "grand"][0]
        return report, grand

    def test_output_and_input_vat_match_posted_documents(self):
        report, grand = self.tax_totals()
        self.assertEqual(grand["sales_net"], 4500)
        self.assertEqual(grand["sales_tax"], 810)      # 18% of 4500
        self.assertEqual(grand["purchase_net"], 20000)
        self.assertEqual(grand["purchase_tax"], 3600)  # 18% of 20000
        self.assertEqual(report["checks"]["net_payable"], 810 - 3600)

    def test_tax_report_is_limited_to_the_period(self):
        report = reports.BUILDERS["tax_report"](self.env.db, start="2027-01-01", end="2027-12-31")
        grand = [r for r in report["rows"] if r["kind"] == "grand"][0]
        self.assertEqual(grand["sales_tax"], 0)
        self.assertEqual(grand["purchase_tax"], 0)


class CreditNoteTaxTests(unittest.TestCase):
    """A credit note changes the shared fixture, so it gets its own company."""

    def test_credit_note_reduces_output_vat(self):
        env = Env()
        try:
            customer = catalog.save_partner(env.ctx, "customer", {"name": "Credit Tax Customer"})["id"]
            product = make_product(env, "CRT-1", price=1500, cost=1000)
            stock_in(env, product, 50, 1000)
            invoice = sales_doc(env, "sales_invoice", customer, [line(product, 3, 1500)], doc_date="2026-04-01")
            documents.post_document(env.ctx, invoice["id"])
            invoice_line = documents.document_view(env.db, invoice["id"])["lines"][0]
            credit = documents.save_document(env.ctx, {
                "doc_type": "sales_credit", "customer_id": customer, "doc_date": "2026-04-05",
                "source_id": invoice["id"], "restock": False,
                "lines": [{"source_line_id": invoice_line["id"], "quantity": "1"}]})
            documents.post_document(env.ctx, credit["id"])
            report = reports.BUILDERS["tax_report"](env.db, start=START, end=END)
            grand = [r for r in report["rows"] if r["kind"] == "grand"][0]
            self.assertEqual(grand["sales_net"], 4500 - 1500)
            self.assertEqual(grand["sales_tax"], 810 - 270)
            self.assertEqual(report["checks"]["net_payable"], 540)
        finally:
            env.close()


class AuditTrailTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()
        cls.customer = catalog.save_partner(cls.env.ctx, "customer", {"name": "Audited Customer"})["id"]
        cls.product = make_product(cls.env, "AUD-1", price=1000, cost=500)
        stock_in(cls.env, cls.product, 10, 500)
        invoice = sales_doc(cls.env, "sales_invoice", cls.customer, [line(cls.product, 1, 1000)],
                            doc_date="2026-05-01")
        documents.post_document(cls.env.ctx, invoice["id"])
        cls.invoice_id = invoice["id"]
        cls.payment = payments.record_payment(cls.env.ctx, party_type="customer", party_id=cls.customer,
                                              method_id=cash_method(cls.env), amount_minor=500,
                                              date_value="2026-05-02")

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def audit_rows(self):
        return self.env.db.query("SELECT * FROM audit_log ORDER BY id")

    def test_actions_are_recorded_with_user_and_module(self):
        rows = self.audit_rows()
        actions = {(r["module"], r["action"]) for r in rows}
        self.assertIn(("sales", "post"), actions)
        self.assertIn(("payments", "record"), actions)
        self.assertIn(("accounting", "post"), actions)
        self.assertTrue(rows)
        self.assertTrue(all(r["username"] == "admin" for r in rows))

    def test_reversing_a_payment_is_audited_and_keeps_the_original(self):
        payments.reverse_payment(self.env.ctx, self.payment["id"], "Returned cheque")
        reversed_rows = self.env.db.query(
            "SELECT * FROM audit_log WHERE module = 'payments' AND action = 'reverse'")
        self.assertEqual(len(reversed_rows), 1)
        self.assertEqual(reversed_rows[0]["record_id"], str(self.payment["id"]))
        # The original receipt row is still there, marked reversed rather than deleted.
        self.assertEqual(payments.payment_view(self.env.db, self.payment["id"])["status"], "reversed")

    def test_audit_view_filters_through_the_api(self):
        env = self.env
        token, _user = env.app.login(env.slug, "admin", "Admin-pass-123")
        status, payload = api.dispatch(env.app, "GET", "/api/audit", query={"action": "post"}, token=token)
        self.assertEqual(status, 200)
        self.assertTrue(payload)
        self.assertTrue(all(row["action"] == "post" for row in payload))

    def test_audit_rows_cannot_be_edited_or_deleted(self):
        with self.assertRaises(sqlite3.DatabaseError):
            self.env.db.execute("UPDATE audit_log SET action = 'nothing' WHERE id = (SELECT MIN(id) FROM audit_log)")
        with self.assertRaises(sqlite3.DatabaseError):
            self.env.db.execute("DELETE FROM audit_log")

    def test_sales_user_cannot_read_the_audit_trail(self):
        from genesis import company
        with self.env.db.transaction():
            company.create_user(self.env.ctx, {"username": "salesperson", "full_name": "Sales Person",
                                               "role": "sales", "password": "Salesperson-1"})
        token, _user = self.env.app.login(self.env.slug, "salesperson", "Salesperson-1")
        status, _payload = api.dispatch(self.env.app, "GET", "/api/audit", token=token)
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()
