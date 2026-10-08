"""Receipts and payments, allocations, reversals, partner balances and opening balances."""

import unittest

from tests.helpers import Env
from genesis import catalog, documents, ledger, payments
from genesis.errors import AccountingError, PermissionDenied, ValidationError
from tests.test_documents import cash_method, make_product, purchase_doc, sales_doc, line, stock_in


def bank_method(env):
    return env.db.one("SELECT id FROM payment_methods WHERE kind = 'bank'")["id"]


class CustomerPaymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()
        cls.customer = catalog.save_partner(cls.env.ctx, "customer", {"name": "Pay Co"})["id"]
        cls.product = make_product(cls.env, "PAY-1", price=1000, cost=0)
        stock_in(cls.env, cls.product, 50, 400)

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def invoice(self, qty=1, date="2026-03-01"):
        doc = sales_doc(self.env, "sales_invoice", self.customer, [line(self.product, qty, 1000)],
                        doc_date=date)
        documents.post_document(self.env.ctx, doc["id"])
        return doc["id"]

    def balance(self, doc_id):
        return documents.document_view(self.env.db, doc_id)["balance_minor"]

    def test_payment_without_allocation_settles_oldest_first(self):
        env = self.env
        first = self.invoice(1, "2026-03-01")
        second = self.invoice(1, "2026-03-05")
        total = documents.document_view(env.db, first)["total_minor"]
        payments.record_payment(env.ctx, party_type="customer", party_id=self.customer,
                                method_id=cash_method(env), amount_minor=total, date_value="2026-03-10")
        self.assertEqual(self.balance(first), 0)
        self.assertEqual(self.balance(second), total)
        self.assertEqual(ledger.verify_ledger(env.db), [])

    def test_explicit_allocation_and_remainder_on_account(self):
        env = self.env
        doc = self.invoice(1, "2026-03-12")
        open_amount = self.balance(doc)
        result = payments.record_payment(
            env.ctx, party_type="customer", party_id=self.customer, method_id=bank_method(env),
            amount_minor=open_amount + 500, date_value="2026-03-13",
            allocations=[{"document_id": doc, "amount_minor": open_amount // 2}])
        self.assertIsNotNone(result)
        self.assertEqual(self.balance(doc), open_amount - open_amount // 2)
        self.assertEqual(ledger.verify_ledger(env.db), [])

    def test_allocation_cannot_exceed_open_balance(self):
        env = self.env
        doc = self.invoice(1, "2026-03-14")
        with self.assertRaises(AccountingError) as ctx:
            payments.record_payment(env.ctx, party_type="customer", party_id=self.customer,
                                    method_id=cash_method(env), amount_minor=99999, date_value="2026-03-15",
                                    allocations=[{"document_id": doc, "amount_minor": 99999}])
        self.assertEqual(ctx.exception.key, "allocation_exceeds_balance")

    def test_allocations_cannot_exceed_payment_amount(self):
        env = self.env
        first = self.invoice(1, "2026-03-16")
        second = self.invoice(1, "2026-03-16")
        with self.assertRaises(AccountingError) as ctx:
            payments.record_payment(env.ctx, party_type="customer", party_id=self.customer,
                                    method_id=cash_method(env), amount_minor=500, date_value="2026-03-17",
                                    allocations=[{"document_id": first, "amount_minor": 400},
                                                 {"document_id": second, "amount_minor": 400}])
        self.assertEqual(ctx.exception.key, "allocation_exceeds_payment")

    def test_zero_or_negative_payment_rejected(self):
        with self.assertRaises(ValidationError):
            payments.record_payment(self.env.ctx, party_type="customer", party_id=self.customer,
                                    method_id=cash_method(self.env), amount_minor=0, date_value="2026-03-18")

    def test_reversal_restores_balance_and_cannot_repeat(self):
        env = self.env
        doc = self.invoice(1, "2026-03-19")
        before = self.balance(doc)
        result = payments.record_payment(env.ctx, party_type="customer", party_id=self.customer,
                                         method_id=cash_method(env), amount_minor=300,
                                         date_value="2026-03-20",
                                         allocations=[{"document_id": doc, "amount_minor": 300}])
        self.assertEqual(self.balance(doc), before - 300)
        payments.reverse_payment(env.ctx, result["id"], "Cheque bounced")
        self.assertEqual(self.balance(doc), before)
        self.assertEqual(payments.payment_view(env.db, result["id"])["status"], "reversed")
        with self.assertRaises(AccountingError) as ctx:
            payments.reverse_payment(env.ctx, result["id"], "again")
        self.assertEqual(ctx.exception.key, "payment_already_reversed")
        self.assertEqual(ledger.verify_ledger(env.db), [])

    def test_reversal_requires_reason(self):
        env = self.env
        result = payments.record_payment(env.ctx, party_type="customer", party_id=self.customer,
                                         method_id=cash_method(env), amount_minor=100,
                                         date_value="2026-03-21")
        with self.assertRaises(ValidationError) as ctx:
            payments.reverse_payment(env.ctx, result["id"], "  ")
        self.assertEqual(ctx.exception.key, "field_required")

    def test_sales_user_cannot_reverse_payments(self):
        env = self.env
        from genesis import company
        with env.db.transaction():
            company.create_user(env.ctx, {"username": "cashier", "full_name": "Cashier",
                                          "role": "sales", "password": "Cashier-pass-1"})
        cashier = env.sign_in("cashier", "Cashier-pass-1")
        result = payments.record_payment(env.ctx, party_type="customer", party_id=self.customer,
                                         method_id=cash_method(env), amount_minor=50,
                                         date_value="2026-03-22")
        with self.assertRaises(PermissionDenied):
            payments.reverse_payment(cashier, result["id"], "should not be allowed")


class SupplierPaymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env(costing_method="fifo")
        cls.supplier = catalog.save_partner(cls.env.ctx, "supplier", {"name": "Vendor Ltd"})["id"]
        cls.product = make_product(cls.env, "SUP-1", price=1000, cost=500)

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_supplier_payment_settles_purchase_invoice(self):
        env = self.env
        pi = purchase_doc(env, "purchase_invoice", self.supplier, [line(self.product, 2, 500)])
        documents.post_document(env.ctx, pi["id"])
        total = documents.document_view(env.db, pi["id"])["total_minor"]
        payments.record_payment(env.ctx, party_type="supplier", party_id=self.supplier,
                                method_id=bank_method(env), amount_minor=total, date_value="2026-03-25")
        self.assertEqual(documents.document_view(env.db, pi["id"])["balance_minor"], 0)
        self.assertEqual(ledger.verify_ledger(env.db), [])

    def test_customer_payment_method_wrong_party_type_rejected(self):
        with self.assertRaises(ValidationError):
            payments.record_payment(self.env.ctx, party_type="bank", party_id=self.supplier,
                                    method_id=bank_method(self.env), amount_minor=10,
                                    date_value="2026-03-26")


class OpeningBalanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_customer_positive_opening_is_debit_receivable(self):
        env = self.env
        customer = catalog.save_partner(env.ctx, "customer", {"name": "Owes Us", "opening_balance": "2500"})
        self.assertEqual(catalog.partner_balance(env.db, "customer", customer["id"]), 2500)
        self.assertEqual(ledger.verify_ledger(env.db), [])

    def test_supplier_positive_opening_is_credit_payable(self):
        env = self.env
        supplier = catalog.save_partner(env.ctx, "supplier", {"name": "We Owe", "opening_balance": "900"})
        self.assertEqual(catalog.partner_balance(env.db, "supplier", supplier["id"]), 900)
        self.assertEqual(ledger.verify_ledger(env.db), [])

    def test_negative_opening_flips_sides(self):
        env = self.env
        customer = catalog.save_partner(env.ctx, "customer", {"name": "Credit Customer", "opening_balance": "-400"})
        self.assertEqual(catalog.partner_balance(env.db, "customer", customer["id"]), -400)
        self.assertEqual(ledger.verify_ledger(env.db), [])


if __name__ == "__main__":
    unittest.main()
