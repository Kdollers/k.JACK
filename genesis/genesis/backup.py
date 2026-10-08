"""Backup, verification, restore and scheduled backups for one company database.

A backup is a consistent copy made with SQLite's online backup API, plus a
manifest recording its SHA-256 digest. Verification checks the digest, the
SQLite integrity, the schema version, and the accounting integrity of the copy.
"""

import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

from . import __version__
from .config import SCHEMA_VERSION
from .db import Database
from .errors import AccountingError, NotFound, ValidationError
from .i18n import translate
from .inventory import verify_inventory
from .ledger import verify_ledger
from .timeutil import now_iso

BACKUP_SUFFIX = ".genesis-backup.db"
MANIFEST_SUFFIX = ".manifest.json"
RESTORE_CONFIRMATION = "RESTORE"
REQUIRED_TABLES = ("settings", "accounts", "journal_entries", "journal_lines", "documents", "users")


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def backup_directory(app, slug, configured=""):
    if configured:
        return Path(configured)
    return app.backup_root / slug


def create_backup(app, slug, *, target_dir=None, user=None):
    """Create a verified copy of a company database. Returns the backup descriptor."""
    from .company import get_setting
    db = app.open_company(slug)
    configured = get_setting(db, "backup_dir", "")
    directory = Path(target_dir) if target_dir else backup_directory(app, slug, configured)
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"{slug}-{stamp}{BACKUP_SUFFIX}"
    destination = directory / name
    counter = 1
    while destination.exists():
        counter += 1
        destination = directory / f"{slug}-{stamp}-{counter}{BACKUP_SUFFIX}"
    with db.lock:
        target = sqlite3.connect(str(destination))
        try:
            db.conn.backup(target)
        finally:
            target.close()
    digest = _sha256(destination)
    manifest = {
        "company": slug,
        "file": destination.name,
        "sha256": digest,
        "size": destination.stat().st_size,
        "schema_version": SCHEMA_VERSION,
        "app_version": __version__,
        "created_at": now_iso(),
        "created_by": user,
    }
    Path(str(destination) + MANIFEST_SUFFIX).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    from .company import set_setting_internal
    set_setting_internal(db, "last_backup_at", now_iso())
    return manifest


def list_backups(app, slug, configured=""):
    directory = backup_directory(app, slug, configured)
    if not directory.exists():
        return []
    items = []
    for path in sorted(directory.glob(f"*{BACKUP_SUFFIX}"), reverse=True):
        manifest_path = Path(str(path) + MANIFEST_SUFFIX)
        manifest = None
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        items.append({
            "file": path.name,
            "size": path.stat().st_size,
            "created_at": (manifest or {}).get("created_at"),
            "schema_version": (manifest or {}).get("schema_version"),
            "has_manifest": manifest is not None,
        })
    return items


def resolve_backup(app, slug, file_name, configured=""):
    if not file_name or "/" in file_name or "\\" in file_name or not file_name.endswith(BACKUP_SUFFIX):
        raise ValidationError("invalid_backup_file")
    path = backup_directory(app, slug, configured) / file_name
    if not path.exists():
        raise NotFound("backup_not_found", file=file_name)
    return path


def describe_problems(problems, lang):
    """Translated text for problem codes such as ``checksum_mismatch`` or ``ledger:unbalanced_entry``."""
    return [translate("problem_" + code.replace(":", "_"), lang) for code in problems]


def verify_backup(path):
    """Return {ok, problems, manifest}. Works on a temporary copy; never writes to the backup."""
    path = Path(path)
    problems = []
    manifest = None
    manifest_path = Path(str(path) + MANIFEST_SUFFIX)
    if not path.exists():
        return {"ok": False, "problems": ["file_missing"], "manifest": None}
    if not manifest_path.exists():
        problems.append("manifest_missing")
    else:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("sha256") != _sha256(path):
            problems.append("checksum_mismatch")
    with tempfile.TemporaryDirectory(prefix="genesis-verify-") as scratch:
        copy = Path(scratch) / "check.db"
        shutil.copy2(path, copy)
        connection = sqlite3.connect(str(copy))
        try:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                problems.append("sqlite_integrity_failed")
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if not 1 <= version <= SCHEMA_VERSION:
                problems.append("schema_version_unsupported")
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if any(table not in tables for table in REQUIRED_TABLES):
                problems.append("required_tables_missing")
        finally:
            connection.close()
        if not problems:
            db = Database(copy)
            try:
                for item in verify_ledger(db):
                    problems.append("ledger:" + item["type"])
                for item in verify_inventory(db):
                    problems.append("inventory:" + item["type"])
            finally:
                db.close()
    return {"ok": not problems, "problems": problems, "manifest": manifest}


def restore_backup(app, slug, backup_path, *, confirmation, user_ctx):
    """Replace a company's database with a verified backup.

    The current database is first copied to a safety backup, so the restore
    can itself be undone. Open sessions for the company are ended.
    """
    user_ctx.require("backup.manage")
    if confirmation != RESTORE_CONFIRMATION:
        raise ValidationError("restore_confirmation_required", word=RESTORE_CONFIRMATION)
    result = verify_backup(backup_path)
    if not result["ok"]:
        raise AccountingError("backup_verification_failed",
                              problems=", ".join(describe_problems(result["problems"], user_ctx.lang)))
    # A backup of one company must never be restored into another company's database.
    if result["manifest"].get("company") != slug:
        raise AccountingError("backup_company_mismatch", company=slug)
    safety = create_backup(app, slug, target_dir=Path(backup_path).parent / "pre-restore",
                           user=user_ctx.username)
    app.close_company(slug)
    live = app.company_path(slug)
    staging = live.with_suffix(".restoring")
    shutil.copy2(backup_path, staging)
    os.replace(staging, live)
    for suffix in ("-wal", "-shm"):
        leftover = Path(str(live) + suffix)
        if leftover.exists():
            leftover.unlink()
    app.sessions.revoke_company(slug)
    restored = app.open_company(slug)
    from .audit import record
    record(restored, user_id=None, username=user_ctx.username, action="restore", module="backup",
           record_type="company", record_id=slug,
           new_value={"from": Path(backup_path).name, "safety_copy": safety["file"]})
    return {"restored_from": Path(backup_path).name, "safety_copy": safety["file"]}


def due_for_backup(schedule, backup_time, last_backup_at, now=None):
    """Whether a scheduled backup is due now (local clock vs. the configured time)."""
    if schedule not in ("daily", "weekly"):
        return False
    now = _aware_local(now) if now is not None else datetime.now().astimezone()
    try:
        hour, minute = (int(part) for part in backup_time.split(":"))
    except (ValueError, AttributeError):
        return False
    scheduled_today = datetime.combine(now.date(), time(hour, minute)).astimezone()
    if now < scheduled_today:
        return False
    if not last_backup_at:
        return True
    try:
        last = _aware_local(datetime.fromisoformat(last_backup_at))
    except ValueError:
        return True
    interval = timedelta(days=1 if schedule == "daily" else 7)
    return now - last >= interval and last < scheduled_today


def _aware_local(value):
    """Naive datetimes are read as local time; aware datetimes are kept as they are."""
    if value.tzinfo is None:
        return value.astimezone()
    return value


def run_scheduled_backups(app, now=None):
    """Create backups for every company whose schedule is due. Returns the created descriptors."""
    from .company import read_settings
    created = []
    for row in app.list_companies():
        db = app.open_company(row["slug"])
        settings = read_settings(db)
        if due_for_backup(settings.get("backup_schedule", "none"), settings.get("backup_time", "02:00"),
                          settings.get("last_backup_at"), now):
            created.append(create_backup(app, row["slug"], user="scheduler"))
    return created


__all__ = ["create_backup", "list_backups", "verify_backup", "restore_backup",
           "resolve_backup", "run_scheduled_backups", "due_for_backup", "RESTORE_CONFIRMATION"]
