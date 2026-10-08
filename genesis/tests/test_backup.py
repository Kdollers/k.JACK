"""Backup creation, integrity verification, restore safety and the backup schedule."""

import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from genesis import api, backup, company
from genesis.errors import AccountingError
from genesis.locales import TRANSLATIONS
from tests.helpers import ADMIN_PASSWORD, Env

KNOWN_PROBLEM_CODES = [
    "file_missing", "manifest_missing", "checksum_mismatch", "sqlite_integrity_failed",
    "schema_version_unsupported", "required_tables_missing",
    "ledger:unbalanced_entry", "ledger:ledger_out_of_balance", "ledger:ar_line_without_customer",
    "ledger:ap_line_without_supplier", "inventory:level_mismatch", "inventory:layer_mismatch",
]


class ScheduleTests(unittest.TestCase):
    def test_naive_now_is_accepted(self):
        naive_now = datetime(2026, 10, 8, 9, 0)  # naive local time
        self.assertTrue(backup.due_for_backup("daily", "08:00", None, naive_now))

    def test_aware_now_with_naive_last_backup_does_not_raise(self):
        now = datetime(2026, 10, 8, 9, 0, tzinfo=timezone.utc)
        last_naive = (datetime(2026, 10, 1, 9, 0)).isoformat()
        self.assertTrue(backup.due_for_backup("daily", "08:00", last_naive, now))

    def test_not_due_before_scheduled_time(self):
        now = datetime(2026, 10, 8, 7, 0).astimezone()
        self.assertFalse(backup.due_for_backup("daily", "08:00", None, now))

    def test_not_due_again_on_the_same_day(self):
        now = datetime(2026, 10, 8, 12, 0).astimezone()
        last = (now - timedelta(hours=2)).isoformat()
        self.assertFalse(backup.due_for_backup("daily", "08:00", last, now))

    def test_weekly_needs_seven_days(self):
        now = datetime(2026, 10, 8, 12, 0).astimezone()
        six_days = (now - timedelta(days=6)).isoformat()
        eight_days = (now - timedelta(days=8)).isoformat()
        self.assertFalse(backup.due_for_backup("weekly", "08:00", six_days, now))
        self.assertTrue(backup.due_for_backup("weekly", "08:00", eight_days, now))

    def test_unparseable_last_backup_counts_as_due(self):
        now = datetime(2026, 10, 8, 12, 0).astimezone()
        self.assertTrue(backup.due_for_backup("daily", "08:00", "not-a-date", now))

    def test_schedule_none_is_never_due(self):
        self.assertFalse(backup.due_for_backup("none", "00:00", None, datetime(2026, 1, 1).astimezone()))

    def test_scheduled_run_creates_a_backup_for_due_companies(self):
        env = Env()
        try:
            company.set_setting_internal(env.db, "backup_schedule", "daily")
            company.set_setting_internal(env.db, "backup_time", "00:00")
            created = backup.run_scheduled_backups(env.app, now=datetime(2026, 10, 8, 23, 0).astimezone())
            self.assertEqual(len(created), 1)
            self.assertEqual(created[0]["created_by"], "scheduler")
        finally:
            env.close()


class IntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()
        cls.manifest = backup.create_backup(cls.env.app, cls.env.slug, user="admin")
        cls.path = Path(cls.env.app.backup_root) / cls.env.slug / cls.manifest["file"]

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_fresh_backup_verifies(self):
        result = backup.verify_backup(self.path)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["manifest"]["sha256"], self.manifest["sha256"])

    def test_altered_backup_fails_checksum(self):
        scratch = self.path.with_name("tampered" + backup.BACKUP_SUFFIX)
        scratch.write_bytes(self.path.read_bytes())
        Path(str(scratch) + backup.MANIFEST_SUFFIX).write_text(
            Path(str(self.path) + backup.MANIFEST_SUFFIX).read_text(encoding="utf-8"), encoding="utf-8")
        with open(scratch, "ab") as handle:
            handle.write(b"tamper")
        result = backup.verify_backup(scratch)
        self.assertFalse(result["ok"])
        self.assertIn("checksum_mismatch", result["problems"])

    def test_missing_manifest_is_reported(self):
        bare = self.path.with_name("bare" + backup.BACKUP_SUFFIX)
        bare.write_bytes(self.path.read_bytes())
        result = backup.verify_backup(bare)
        self.assertFalse(result["ok"])
        self.assertIn("manifest_missing", result["problems"])

    def test_missing_file_is_reported(self):
        result = backup.verify_backup(self.path.with_name("nope" + backup.BACKUP_SUFFIX))
        self.assertEqual(result["problems"], ["file_missing"])


class RestoreSafetyTests(unittest.TestCase):
    def setUp(self):
        self.first = Env()
        self.second = Env()

    def tearDown(self):
        self.first.close()
        self.second.close()

    def test_restore_needs_the_confirmation_word(self):
        manifest = backup.create_backup(self.first.app, self.first.slug, user="admin")
        path = Path(self.first.app.backup_root) / self.first.slug / manifest["file"]
        with self.assertRaises(Exception) as ctx:
            backup.restore_backup(self.first.app, self.first.slug, path, confirmation="yes",
                                  user_ctx=self.first.ctx)
        self.assertEqual(ctx.exception.key, "restore_confirmation_required")

    def test_backup_of_one_company_cannot_restore_into_another(self):
        # Two companies in the same registry, so the slugs really differ.
        other_slug = self.first.app.create_company(
            name="Other Company Ltd", currency_code="RWF", admin_username="admin",
            admin_full_name="Other Admin", admin_password=ADMIN_PASSWORD,
            country_profile="RW")["slug"]
        self.assertNotEqual(other_slug, self.first.slug)
        manifest = backup.create_backup(self.first.app, self.first.slug, user="admin")
        path = Path(self.first.app.backup_root) / self.first.slug / manifest["file"]
        other_ctx = self.first.app.context_for(
            self.first.app.login(other_slug, "admin", ADMIN_PASSWORD)[0])
        with self.assertRaises(AccountingError) as ctx:
            backup.restore_backup(self.first.app, other_slug, path, confirmation="RESTORE",
                                  user_ctx=other_ctx)
        self.assertEqual(ctx.exception.key, "backup_company_mismatch")

    def test_restore_creates_safety_copy_and_keeps_data(self):
        from genesis import catalog
        catalog.save_partner(self.first.ctx, "customer", {"name": "Before Restore"})
        manifest = backup.create_backup(self.first.app, self.first.slug, user="admin")
        path = Path(self.first.app.backup_root) / self.first.slug / manifest["file"]
        catalog.save_partner(self.first.ctx, "customer", {"name": "After Backup"})
        result = backup.restore_backup(self.first.app, self.first.slug, path, confirmation="RESTORE",
                                       user_ctx=self.first.ctx)
        self.assertTrue(result["safety_copy"])
        safety = Path(self.first.app.backup_root) / self.first.slug / "pre-restore" / result["safety_copy"]
        self.assertTrue(safety.exists())
        restored = self.first.app.open_company(self.first.slug)
        names = [row["name"] for row in catalog.list_partners(restored, "customer")]
        self.assertIn("Before Restore", names)
        self.assertNotIn("After Backup", names)


class ProblemMessageTests(unittest.TestCase):
    def test_every_problem_code_is_translated_in_all_languages(self):
        for code in KNOWN_PROBLEM_CODES:
            key = "problem_" + code.replace(":", "_")
            for lang in ("en", "fr", "rw"):
                self.assertIn(key, TRANSLATIONS[lang], f"{key} missing in {lang}")
                self.assertNotEqual(TRANSLATIONS[lang][key], key)

    def test_problem_codes_are_described_in_the_requested_language(self):
        self.assertEqual(backup.describe_problems(["checksum_mismatch"], "rw"),
                         [TRANSLATIONS["rw"]["problem_checksum_mismatch"]])
        self.assertIn("contrôle", backup.describe_problems(["checksum_mismatch"], "fr")[0])
        self.assertEqual(backup.describe_problems(["ledger:unbalanced_entry"], "en"),
                         ["A journal entry does not balance (debits differ from credits)."])

    def test_verify_endpoint_returns_translated_messages(self):
        env = Env()
        try:
            # A signed-in user's saved language decides the response language.
            company.set_own_language(env.ctx, "rw")
            manifest = backup.create_backup(env.app, env.slug, user="admin")
            path = Path(env.app.backup_root) / env.slug / manifest["file"]
            with open(path, "ab") as handle:
                handle.write(b"tamper")
            status, payload = api.dispatch(env.app, "POST", "/api/backups/verify",
                                           body={"file": manifest["file"]},
                                           token=env.app.login(env.slug, "admin", ADMIN_PASSWORD)[0],
                                           lang="fr")
            self.assertEqual(status, 200)
            self.assertFalse(payload["ok"])
            self.assertIn("checksum_mismatch", payload["problems"])
            self.assertEqual(payload["messages"], [TRANSLATIONS["rw"]["problem_checksum_mismatch"]])
        finally:
            env.close()

    def test_integrity_endpoint_is_clean_for_a_sound_company(self):
        env = Env()
        try:
            status, payload = api.dispatch(env.app, "GET", "/api/integrity",
                                           token=env.app.login(env.slug, "admin", ADMIN_PASSWORD)[0], lang="fr")
            self.assertEqual(status, 200)
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["messages"], [])
        finally:
            env.close()


if __name__ == "__main__":
    unittest.main()
