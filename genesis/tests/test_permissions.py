"""Role boundaries: accounting records cannot be deleted or reversed by non-accountant roles."""

import sqlite3
import unittest

from genesis import api, catalog, company, ledger, payments
from genesis.auth import ROLES, permissions_for
from genesis.errors import PermissionDenied
from tests.helpers import Env

NON_ACCOUNTANT = ("sales", "purchases", "inventory", "manager")
ACCOUNTING_ACTIONS = ("accounting.journal", "accounting.reverse", "accounting.manage_accounts")


def call(env, method, path, body=None, token=""):
    return api.dispatch(env.app, method, path, body=body, query={}, token=token)


class RolePermissionTests(unittest.TestCase):
    def test_non_accountant_roles_lack_accounting_write_permissions(self):
        for role in NON_ACCOUNTANT:
            perms = permissions_for(role)
            for action in ACCOUNTING_ACTIONS:
                self.assertNotIn(action, perms, f"{role} must not have {action}")

    def test_accountant_and_administrator_hold_accounting_actions(self):
        for role in ("accountant", "administrator"):
            perms = permissions_for(role)
            for action in ACCOUNTING_ACTIONS:
                self.assertIn(action, perms, f"{role} should have {action}")

    def test_every_role_is_known(self):
        self.assertEqual(set(ROLES), {"administrator", "accountant", "sales", "purchases", "inventory", "manager"})


class RoleEnforcementTests(unittest.TestCase):
    """Real users, real tokens, real routes."""

    @classmethod
    def setUpClass(cls):
        cls.env = Env()
        users = {"accountant": "accountant", "sales": "sales", "purchases": "purchases",
                 "inventory": "inventory", "manager": "manager"}
        cls.tokens = {}
        for role, username in users.items():
            with cls.env.db.transaction():
                company.create_user(cls.env.ctx, {"username": username, "full_name": username.title(),
                                                  "role": role, "password": f"{username.title()}-pass-1"})
            token, _user = cls.env.app.login(cls.env.slug, username, f"{username.title()}-pass-1")
            cls.tokens[role] = token
        # A posted journal entry the restricted users will try to touch.
        cls.account_id = cls.env.db.one("SELECT id FROM accounts WHERE code = '6010'")["id"]
        cls.entry_id = ledger.post_entry(
            cls.env.ctx, entry_date="2026-03-01", description="Rent", lines=[
                {"account_id": cls.account_id, "debit_minor": 500, "credit_minor": 0},
                {"account_id": cls.env.account_id("cash"), "debit_minor": 0, "credit_minor": 500}])["id"]
        # A real receipt for the payment-reversal check.
        customer = catalog.save_partner(cls.env.ctx, "customer", {"name": "Permission Customer"})["id"]
        cls.payment_id = payments.record_payment(
            cls.env.ctx, party_type="customer", party_id=customer, method_id=cls.env.db.one(
                "SELECT id FROM payment_methods WHERE kind = 'cash'")["id"],
            amount_minor=100, date_value="2026-03-03")["id"]

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_restricted_roles_cannot_post_or_reverse_journals(self):
        for role in NON_ACCOUNTANT:
            token = self.tokens[role]
            status, _ = call(self.env, "POST", "/api/journal", body={
                "entry_date": "2026-03-02", "description": "sneaky", "lines": []}, token=token)
            self.assertEqual(status, 403, role)
            status, _ = call(self.env, "POST", f"/api/journal/{self.entry_id}/reverse",
                             body={"reason": "undo"}, token=token)
            self.assertEqual(status, 403, role)

    def test_restricted_roles_cannot_delete_or_change_accounts(self):
        for role in NON_ACCOUNTANT:
            token = self.tokens[role]
            status, _ = call(self.env, "DELETE", f"/api/accounts/{self.account_id}", token=token)
            self.assertEqual(status, 403, role)
            status, _ = call(self.env, "PUT", f"/api/accounts/{self.account_id}",
                             body={"name": "Renamed"}, token=token)
            self.assertEqual(status, 403, role)

    def test_sales_cannot_reverse_payments(self):
        status, _ = call(self.env, "POST", f"/api/payments/{self.payment_id}/reverse",
                         body={"reason": "x"}, token=self.tokens["sales"])
        self.assertEqual(status, 403)
        status, _ = call(self.env, "POST", f"/api/payments/{self.payment_id}/reverse",
                         body={"reason": "x"}, token=self.tokens["accountant"])
        self.assertEqual(status, 200)

    def test_sales_cannot_set_an_opening_balance_that_posts_a_journal(self):
        with self.assertRaises(PermissionDenied):
            with self.env.db.transaction():
                from genesis import catalog
                ctx = self.env.app.context_for(self.tokens["sales"])
                catalog.save_partner(ctx, "customer", {"name": "Sneaky", "opening_balance": "900"})
        names = [row["name"] for row in self.env.db.query("SELECT name FROM customers")]
        self.assertNotIn("Sneaky", names)

    def test_accountant_can_reverse_a_posted_entry(self):
        token = self.tokens["accountant"]
        status, payload = call(self.env, "POST", f"/api/journal/{self.entry_id}/reverse",
                               body={"reason": "Wrong account"}, token=token)
        self.assertEqual(status, 200, payload)
        self.assertEqual(ledger.verify_ledger(self.env.db), [])

    def test_database_refuses_direct_edits_to_posted_entries(self):
        for sql in ("DELETE FROM journal_entries WHERE id = ?",
                    "UPDATE journal_lines SET debit_minor = 1 WHERE entry_id = ?"):
            with self.assertRaises(sqlite3.DatabaseError, msg=sql):
                self.env.db.execute(sql, (self.entry_id,))

    def test_posted_journal_survives_failed_tampering(self):
        before = ledger.account_balance(self.env.db, self.account_id)
        with self.assertRaises(sqlite3.DatabaseError):
            self.env.db.execute("UPDATE journal_lines SET debit_minor = 999999 WHERE entry_id = ?",
                                (self.entry_id,))
        self.assertEqual(ledger.account_balance(self.env.db, self.account_id), before)


if __name__ == "__main__":
    unittest.main()
