"""SQLite access layer: connections, nested transactions and migrations."""

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from .config import SCHEMA_VERSION
from .errors import GenesisError
from .schema import MIGRATIONS

_KNOWN_DB_MESSAGES = {
    "posted_record_immutable",
    "audit_immutable",
}


def _translate_integrity_error(error):
    message = str(error)
    for key in _KNOWN_DB_MESSAGES:
        if key in message:
            return GenesisError(key)
    if message.startswith("UNIQUE constraint failed"):
        return GenesisError("duplicate_value", detail=message)
    return GenesisError("database_constraint", detail=message)


class Database:
    """A single SQLite database file with foreign keys enforced."""

    def __init__(self, path):
        self.path = Path(path)
        self.conn = sqlite3.connect(
            str(self.path), check_same_thread=False, isolation_level=None, timeout=15
        )
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.execute("PRAGMA busy_timeout = 15000")
        self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.execute("PRAGMA synchronous = FULL")
        self._depth = 0
        self.lock = threading.RLock()

    def close(self):
        self.conn.close()

    # -- queries -------------------------------------------------------
    def execute(self, sql, params=()):
        return self.conn.execute(sql, tuple(params))

    def query(self, sql, params=()):
        return [dict(row) for row in self.conn.execute(sql, tuple(params)).fetchall()]

    def one(self, sql, params=()):
        row = self.conn.execute(sql, tuple(params)).fetchone()
        return dict(row) if row is not None else None

    def scalar(self, sql, params=(), default=None):
        row = self.conn.execute(sql, tuple(params)).fetchone()
        if row is None or row[0] is None:
            return default
        return row[0]

    def insert(self, table, values):
        columns = list(values)
        placeholders = ", ".join("?" for _ in columns)
        sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
        try:
            cursor = self.conn.execute(sql, tuple(values[c] for c in columns))
        except sqlite3.IntegrityError as error:
            raise _translate_integrity_error(error) from error
        return cursor.lastrowid

    def update(self, table, values, where, params=()):
        assignments = ", ".join(f"{column} = ?" for column in values)
        sql = f"UPDATE {table} SET {assignments} WHERE {where}"
        try:
            cursor = self.conn.execute(sql, tuple(values.values()) + tuple(params))
        except sqlite3.IntegrityError as error:
            raise _translate_integrity_error(error) from error
        return cursor.rowcount

    # -- transactions ----------------------------------------------------
    @contextmanager
    def transaction(self):
        """Run a block atomically. Nested calls use savepoints."""
        with self.lock:
            depth = self._depth
            if depth == 0:
                self.conn.execute("BEGIN IMMEDIATE")
            else:
                self.conn.execute(f"SAVEPOINT sp_{depth}")
            self._depth += 1
            try:
                yield self
            except sqlite3.IntegrityError as error:
                self._depth -= 1
                self._rollback(depth)
                raise _translate_integrity_error(error) from error
            except BaseException:
                self._depth -= 1
                self._rollback(depth)
                raise
            else:
                self._depth -= 1
                if depth == 0:
                    self.conn.execute("COMMIT")
                else:
                    self.conn.execute(f"RELEASE SAVEPOINT sp_{depth}")

    def _rollback(self, depth):
        if depth == 0:
            if self.conn.in_transaction:
                self.conn.execute("ROLLBACK")
        else:
            self.conn.execute(f"ROLLBACK TO SAVEPOINT sp_{depth}")
            self.conn.execute(f"RELEASE SAVEPOINT sp_{depth}")

    # -- schema ----------------------------------------------------------
    def schema_version(self):
        return self.conn.execute("PRAGMA user_version").fetchone()[0]

    def migrate(self):
        """Apply pending schema migrations in order, each atomically."""
        current = self.schema_version()
        if current > SCHEMA_VERSION:
            raise GenesisError("database_newer_than_app", version=current)
        for version in sorted(MIGRATIONS):
            if version <= current:
                continue
            script = MIGRATIONS[version]
            with self.lock:
                self.conn.execute("BEGIN IMMEDIATE")
                try:
                    for statement in _split_statements(script):
                        self.conn.execute(statement)
                    self.conn.execute(f"PRAGMA user_version = {int(version)}")
                    self.conn.execute("COMMIT")
                except BaseException:
                    if self.conn.in_transaction:
                        self.conn.execute("ROLLBACK")
                    raise
        return self.schema_version()


def _split_statements(script):
    """Split a SQL script into statements, honouring BEGIN...END trigger bodies."""
    statements, buffer = [], []
    for line in script.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        buffer.append(line)
        joined = "\n".join(buffer).strip()
        if joined.endswith(";") and (
            not joined.upper().startswith("CREATE TRIGGER") or joined.upper().endswith("END;")
        ):
            statements.append(joined.rstrip(";"))
            buffer = []
    if buffer:
        statements.append("\n".join(buffer).strip().rstrip(";"))
    return [s for s in statements if s]
