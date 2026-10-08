"""Database safety, double-entry rules, reversals, period locks and login."""

import sqlite3
import unittest

from tests.helpers import ADMIN_PASSWORD, Env
from genesis import company, ledger
from genesis.errors import AccountingError, AuthenticationError, Conflict, PermissionDenied, ValidationError


def line(account_id, debit=0, credit=0, **extra):
    return {"account_id": account_id, "debit_minor": debit, "credit_minor": credit, **extra}


class LedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def setUp(self):
        self.env.db.execute("SELECT 1")
        self.cash = self.env.account_id("cash")
        self.sales = self.env.account_id("sales_revenue")

    def post(self, lines, date="2026-01-15", description="Test entry", ctx=None):
        ctx = ctx or self.env.ctx
        with self.env.db.transaction():
            return ledger.post_entry(ctx, entry_date=date, description=description, lines=lines)

    # -- database safety ------------------------------------------------
    def test_savepoint_rollback_restores_state(self):
        before = self.env.db.scalar("SELECT COUNT(*) FROM journal_entries")
        with self.assertRaises(ValidationError):
            with self.env.db.transaction():
                self.post([line(self.cash, 100), line(self.sales, 0, 100)])
                self.post([line(self.cash, 50)])  # unbalanced -> rejected, whole transaction rolls back
        self.assertEqual(self.env.db.scalar("SELECT COUNT(*) FROM journal_entries"), before)

    def test_nested_savepoint_rolls_back_only_inner_work(self):
        db = self.env.db
        before = db.scalar("SELECT COUNT(*) FROM journal_entries")
        with db.transaction():
            self.post([line(self.cash, 200), line(self.sales, 0, 200)], description="outer")
            with self.assertRaises(ValidationError):
                with db.transaction():
                    self.post([line(self.cash, 10), line(self.sales, 0, 20)], description="inner bad")
        self.assertEqual(db.scalar("SELECT COUNT(*) FROM journal_entries"), before + 1)

    def test_posted_entries_cannot_be_updated_or_deleted(self):
        result = self.post([line(self.cash, 300), line(self.sales, 0, 300)], description="immutable")
        db = self.env.db
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE journal_entries SET description = 'changed' WHERE id = ?", (result["id"],))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE journal_lines SET debit_minor = 1 WHERE entry_id = ?", (result["id"],))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM journal_lines WHERE entry_id = ?", (result["id"],))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM journal_entries WHERE id = ?", (result["id"],))

    def test_audit_log_is_append_only(self):
        db = self.env.db
        row = db.one("SELECT id FROM audit_log ORDER BY id LIMIT 1")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE audit_log SET action = 'x' WHERE id = ?", (row["id"],))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM audit_log WHERE id = ?", (row["id"],))

    # -- balance rules --------------------------------------------------
    def test_balanced_entry_posts_and_numbers_sequentially(self):
        first = self.post([line(self.cash, 1000), line(self.sales, 0, 1000)])
        second = self.post([line(self.cash, 500), line(self.sales, 0, 500)])
        self.assertTrue(first["entry_no"].startswith("JE-"))
        self.assertEqual(second["total_minor"], 500)
        self.assertNotEqual(first["entry_no"], second["entry_no"])

    def test_unbalanced_entry_rejected(self):
        with self.assertRaises(AccountingError) as ctx:
            self.post([line(self.cash, 1000), line(self.sales, 0, 900)])
        self.assertEqual(ctx.exception.key, "journal_unbalanced")

    def test_each_line_must_be_debit_or_credit_not_both_or_neither(self):
        for bad in ([line(self.cash, 100, 100), line(self.sales, 0, 0)],
                    [line(self.cash, 0, 0), line(self.sales, 0, 0)]):
            with self.assertRaises(ValidationError) as ctx:
                self.post(bad)
            self.assertEqual(ctx.exception.key, "journal_line_invalid")

    def test_negative_amounts_rejected(self):
        with self.assertRaises(ValidationError):
            self.post([line(self.cash, -100), line(self.sales, 0, -100)])

    def test_minimum_two_lines(self):
        with self.assertRaises(ValidationError) as ctx:
            self.post([line(self.cash, 100)])
        self.assertEqual(ctx.exception.key, "journal_min_lines")

    def test_header_and_inactive_accounts_are_not_postable(self):
        header = self.env.db.one("SELECT id FROM accounts WHERE code = '1000'")["id"]
        with self.assertRaises(AccountingError) as ctx:
            self.post([line(header, 100), line(self.sales, 0, 100)])
        self.assertEqual(ctx.exception.key, "account_not_postable")

    def test_party_required_for_receivable_and_mismatch_rejected(self):
        ar = self.env.account_id("ar")
        with self.assertRaises(AccountingError) as ctx:
            self.post([line(ar, 100), line(self.sales, 0, 100)])
        self.assertEqual(ctx.exception.key, "party_required")
        with self.assertRaises(AccountingError) as ctx:
            self.post([line(self.cash, 100, party_type="customer", party_id=1), line(self.sales, 0, 100)])
        self.assertEqual(ctx.exception.key, "party_not_allowed")

    # -- period lock and reversal --------------------------------------
    def test_period_lock_blocks_entries_on_or_before_lock_date(self):
        with self.env.db.transaction():
            company.set_lock_date(self.env.ctx, "2026-03-31")
        try:
            with self.assertRaises(AccountingError) as ctx:
                self.post([line(self.cash, 100), line(self.sales, 0, 100)], date="2026-03-31")
            self.assertEqual(ctx.exception.key, "period_locked")
            self.post([line(self.cash, 100), line(self.sales, 0, 100)], date="2026-04-01")
        finally:
            with self.env.db.transaction():
                company.set_lock_date(self.env.ctx, None)

    def test_reversal_creates_mirror_entry_and_nets_to_zero(self):
        original = self.post([line(self.cash, 700), line(self.sales, 0, 700)], description="to reverse")
        before = ledger.account_balance(self.env.db, self.cash)
        with self.env.db.transaction():
            reversal = ledger.reverse_entry(self.env.ctx, original["id"], reason="entered in error")
        after = ledger.account_balance(self.env.db, self.cash)
        self.assertEqual(after, before - 700)
        stored = self.env.db.one("SELECT * FROM journal_entries WHERE id = ?", (reversal["id"],))
        self.assertEqual(stored["reversal_of_id"], original["id"])
        lines = self.env.db.query("SELECT * FROM journal_lines WHERE entry_id = ? ORDER BY line_no",
                                  (reversal["id"],))
        self.assertEqual([(l["account_id"], l["debit_minor"], l["credit_minor"]) for l in lines],
                         [(self.cash, 0, 700), (self.sales, 700, 0)])

    def test_entry_cannot_be_reversed_twice(self):
        original = self.post([line(self.cash, 800), line(self.sales, 0, 800)])
        with self.env.db.transaction():
            ledger.reverse_entry(self.env.ctx, original["id"], reason="first")
        with self.env.db.transaction():
            with self.assertRaises(AccountingError) as ctx:
                ledger.reverse_entry(self.env.ctx, original["id"], reason="second")
        self.assertEqual(ctx.exception.key, "already_reversed")

    def test_reversal_of_reversal_rejected(self):
        original = self.post([line(self.cash, 900), line(self.sales, 0, 900)])
        with self.env.db.transaction():
            reversal = ledger.reverse_entry(self.env.ctx, original["id"], reason="undo")
        with self.env.db.transaction():
            with self.assertRaises(AccountingError) as ctx:
                ledger.reverse_entry(self.env.ctx, reversal["id"], reason="undo undo")
        self.assertEqual(ctx.exception.key, "cannot_reverse_reversal")

    def test_reversal_requires_accounting_reverse_permission(self):
        original = self.post([line(self.cash, 150), line(self.sales, 0, 150)])
        with self.env.db.transaction():
            company.create_user(self.env.ctx, {"username": "salesrep", "full_name": "Sales Rep",
                                               "role": "sales", "password": "Sales-pass-123"})
        sales_ctx = self.env.sign_in("salesrep", "Sales-pass-123")
        with self.env.db.transaction():
            with self.assertRaises(PermissionDenied):
                ledger.reverse_entry(sales_ctx, original["id"], reason="not allowed")

    # -- verification ---------------------------------------------------
    def test_verify_ledger_is_clean_after_activity(self):
        self.post([line(self.cash, 1234), line(self.sales, 0, 1234)])
        self.assertEqual(ledger.verify_ledger(self.env.db), [])

    def test_trial_balance_debits_equal_credits(self):
        from genesis.reports import trial_balance
        self.post([line(self.cash, 2500), line(self.sales, 0, 2500)], date="2026-02-01")
        report = trial_balance(self.env.db, start="2026-01-01", end="2026-12-31")
        totals = report["rows"][-1]
        self.assertEqual(totals["kind"], "grand")
        self.assertEqual(totals["debit"], totals["credit"])


class LoginTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_correct_password_signs_in_and_wrong_password_fails(self):
        self.env.sign_in("admin", ADMIN_PASSWORD)
        with self.assertRaises(AuthenticationError) as ctx:
            self.env.sign_in("admin", "not-the-password")
        self.assertEqual(ctx.exception.key, "invalid_credentials")

    def test_unknown_user_gets_same_error(self):
        with self.assertRaises(AuthenticationError) as ctx:
            self.env.sign_in("nobody", "whatever-123")
        self.assertEqual(ctx.exception.key, "invalid_credentials")

    def test_duplicate_username_rejected(self):
        with self.env.db.transaction():
            with self.assertRaises(Conflict):
                company.create_user(self.env.ctx, {"username": "admin", "full_name": "Again",
                                                   "role": "accountant", "password": "Another-pass-1"})

    def test_user_without_valid_password_cannot_be_created(self):
        with self.env.db.transaction():
            with self.assertRaises(ValidationError) as ctx:
                company.create_user(self.env.ctx, {"username": "shortpw", "full_name": "Short",
                                                   "role": "sales", "password": "abc"})
        self.assertEqual(ctx.exception.key, "password_too_short")

    def test_duplicate_company_slug_gets_suffix(self):
        second = self.env.app.create_company(
            name="Test Company Ltd", currency_code="RWF", admin_username="admin",
            admin_full_name="Admin", admin_password=ADMIN_PASSWORD, country_profile="none")
        self.assertNotEqual(second["slug"], self.env.slug)
        self.assertTrue(second["slug"].startswith(self.env.slug))

    def test_companies_do_not_share_data(self):
        other = self.env.app.create_company(
            name="Other Co", currency_code="RWF", admin_username="admin2",
            admin_full_name="Admin Two", admin_password=ADMIN_PASSWORD, country_profile="none")
        token, _ = self.env.app.login(other["slug"], "admin2", ADMIN_PASSWORD)
        other_ctx = self.env.app.context_for(token)
        users_here = {u["username"] for u in company.list_users(self.env.db)}
        users_there = {u["username"] for u in company.list_users(other_ctx.db)}
        self.assertIn("admin", users_here)
        self.assertNotIn("admin2", users_here)
        self.assertIn("admin2", users_there)
        self.assertNotIn("admin", users_there)
        with self.assertRaises(AuthenticationError):
            self.env.app.login(other["slug"], "admin", ADMIN_PASSWORD)


if __name__ == "__main__":
    unittest.main()
