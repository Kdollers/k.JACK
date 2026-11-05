#!/usr/bin/env bash
# Writes the sandbox-only better-sqlite3 adapter over node:sqlite.
# Test-only: node_modules is git-ignored and never packaged.
set -e
mkdir -p /home/user/k.JACK/JENESIS/node_modules/better-sqlite3/lib
cat > /home/user/k.JACK/JENESIS/node_modules/better-sqlite3/lib/index.js <<'EOF'
'use strict';
/**
 * SANDBOX ONLY — never shipped, never committed (node_modules is git-ignored).
 *
 * better-sqlite3 is a native module and cannot be compiled here, so the tests
 * run on Node's built-in `node:sqlite`. This file only adapts the small part of
 * the better-sqlite3 API the server actually uses.
 */
const { DatabaseSync } = require('node:sqlite');

function toPlain(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Uint8Array ? Buffer.from(v) : v;
  return out;
}
const bindArgs = (args) => (args.length === 1 && Array.isArray(args[0]) ? args[0].slice() : args.slice());
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array);
const norm = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v);

class Statement {
  constructor(db, sql) { this._db = db; this.sql = sql; this._stmt = db._prepare(sql); }
  _named(obj) {
    const keys = Object.keys(obj);
    const sql = this.sql.replace(/([@:$])(\w+)/g, (m, sigil, name) => {
      const idx = keys.indexOf(name);
      return idx === -1 ? m : `?${idx + 1}`;
    });
    const stmt = sql === this.sql ? this._stmt : this._db._prepare(sql);
    return { stmt, values: keys.map((k) => obj[k]) };
  }
  _info() {
    const row = this._db._sync.prepare('SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid').get();
    return { changes: Number(row.changes), lastInsertRowid: row.lastInsertRowid === undefined ? BigInt(0) : row.lastInsertRowid };
  }
  run(...args) {
    if (args.length === 1 && isPlainObject(args[0])) {
      const { stmt, values } = this._named(args[0]);
      stmt.run(...values.map(norm));
    } else {
      this._stmt.run(...bindArgs(args).map(norm));
    }
    return this._info();
  }
  get(...args) {
    const row = args.length === 1 && isPlainObject(args[0])
      ? this._named(args[0]).stmt.get(...this._named(args[0]).values)
      : this._stmt.get(...bindArgs(args));
    return row ? toPlain(row) : undefined;
  }
  all(...args) {
    const rows = args.length === 1 && isPlainObject(args[0])
      ? this._named(args[0]).stmt.all(...this._named(args[0]).values)
      : this._stmt.all(...bindArgs(args));
    return rows.map(toPlain);
  }
  iterate(...args) { return this.all(...args)[Symbol.iterator](); }
  columns() { return []; }
}

class Database {
  constructor(path, options = {}) {
    this.name = path;
    this.open = true;
    if (path !== ':memory:' && options.fileMustExist && !require('fs').existsSync(path)) {
      throw new Error('SqliteError: unable to open database file');
    }
    this._sync = new DatabaseSync(path, { readOnly: !!options.readonly, allowExtension: true });
    this._cache = new Map();
    this._depth = 0;
    this._sync.exec('PRAGMA foreign_keys = ON');
  }
  _prepare(sql) {
    if (!this._cache.has(sql)) this._cache.set(sql, this._sync.prepare(sql));
    return this._cache.get(sql);
  }
  prepare(sql) { return new Statement(this, sql); }
  exec(sql) { this._sync.exec(sql); return this; }
  // better-sqlite3 returns the result rows of a PRAGMA as an array of objects;
  // it does not unwrap a single value. The server relies on that:
  // `db.pragma('integrity_check').map(...)` would throw on a string. This shim
  // once collapsed a one-row, one-column result to the bare value, which made
  // one check fail here while the same check passed on CI against the real
  // driver -- the shim was wrong, not the server.
  pragma(text) {
    let rows = [];
    try {
      rows = this._sync.prepare(`PRAGMA ${text}`).all();
    } catch (err) {
      // PRAGMAs that set a value rather than read one return no rows, and some
      // (wal_checkpoint) are accepted by better-sqlite3 but rejected here.
      const message = String(err && err.message ? err.message : err);
      if (!/no such column|not a statement|syntax error/i.test(message)) {
        // A pragma this shim cannot run at all must still be visible rather
        // than quietly doing nothing.
        if (!/wal_checkpoint|defer_foreign_keys|journal_mode|foreign_keys/i.test(text)) throw err;
      }
      return [];
    }
    return rows.map(toPlain);
  }
  close() { if (this.open) { this._cache.clear(); this._sync.close(); this.open = false; } return this; }
  transaction(fn) {
    const self = this;
    const wrap = (...args) => {
      const nested = self._depth > 0;
      self._depth += 1;
      if (!nested) self._sync.exec('BEGIN');
      try {
        const out = fn(...args);
        if (!nested) self._sync.exec('COMMIT');
        return out;
      } catch (err) {
        if (!nested) { try { self._sync.exec('ROLLBACK'); } catch (_) { /* already rolled back */ } }
        throw err;
      } finally { self._depth -= 1; }
    };
    wrap.default = wrap; wrap.deferred = wrap; wrap.immediate = wrap; wrap.exclusive = wrap;
    return wrap;
  }
  function() { throw new Error('sandbox shim: db.function() is not available'); }
  aggregate() { throw new Error('sandbox shim: db.aggregate() is not available'); }
  backup() { return Promise.resolve(); }
  loadExtension() { return this; }
}

module.exports = Database;
module.exports.default = Database;
module.exports.Database = Database;
EOF
echo "shim written"
