'use strict';
/**
 * Company backup export and restore.
 *
 * POLICY (see DESKTOP.md "Backup and restore policy"):
 *  - A backup contains the business data of ONE company: settings, chart of accounts,
 *    contacts, products, journals, sales, purchases, payments, inventory and counts.
 *  - A backup NEVER contains user accounts, password hashes, sessions or the audit log.
 *    Restoring therefore never restores old credentials or permissions, and never
 *    rewrites the audit history.
 *  - Export requires backup:export. Restore requires backup:restore, the current
 *    administrator's password, and the typed confirmation "RESTORE".
 *  - Restore is refused unless: the format version is current, the SHA-256 checksum
 *    matches, the backup belongs to the signed-in company, every journal entry is
 *    balanced, and every foreign key resolves.
 *  - Before any change, a verified copy of the live database is written to backups/.
 *  - The whole restore is one transaction. On any failure nothing changes.
 *  - After a successful restore every session is revoked, so users must sign in again
 *    with their existing (unchanged) credentials.
 *  - Backups made by the previous export format (no checksum, incomplete tables) are
 *    refused, because restoring them would silently lose data.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORMAT_VERSION = 2;

/**
 * Company-scoped tables in parent-before-child order. Rows of child tables are selected
 * through their parent. Restore inserts in this order and deletes in reverse order.
 */
const TABLES = [
  { name: 'accounts', parent: null },
  { name: 'tax_rates', parent: null },
  { name: 'bank_accounts', parent: null },
  { name: 'customers', parent: null },
  { name: 'suppliers', parent: null },
  { name: 'products', parent: null },
  { name: 'journal_entries', parent: null },
  { name: 'journal_entry_lines', parent: { table: 'journal_entries', key: 'journal_entry_id' } },
  { name: 'sales_quotes', parent: null },
  { name: 'sales_quote_lines', parent: { table: 'sales_quotes', key: 'quote_id' } },
  { name: 'sales_orders', parent: null },
  { name: 'sales_order_lines', parent: { table: 'sales_orders', key: 'order_id' } },
  { name: 'sales_invoices', parent: null },
  { name: 'sales_invoice_lines', parent: { table: 'sales_invoices', key: 'invoice_id' } },
  { name: 'credit_notes', parent: null },
  { name: 'credit_note_lines', parent: { table: 'credit_notes', key: 'credit_note_id' } },
  { name: 'purchase_orders', parent: null },
  { name: 'purchase_order_lines', parent: { table: 'purchase_orders', key: 'po_id' } },
  { name: 'purchase_invoices', parent: null },
  { name: 'purchase_invoice_lines', parent: { table: 'purchase_invoices', key: 'bill_id' } },
  { name: 'purchase_returns', parent: null },
  { name: 'purchase_return_lines', parent: { table: 'purchase_returns', key: 'return_id' } },
  { name: 'payments', parent: null },
  { name: 'inventory_movements', parent: null },
  { name: 'stock_adjustments', parent: null },
  { name: 'stock_adjustment_lines', parent: { table: 'stock_adjustments', key: 'adjustment_id' } },
  { name: 'physical_inventory_counts', parent: null },
  { name: 'physical_inventory_lines', parent: { table: 'physical_inventory_counts', key: 'count_id' } }
];
const TABLE_NAMES = new Set(TABLES.map((t) => t.name));

const BALANCE_TOLERANCE = 0.005;

/** JSON with sorted keys, so the checksum does not depend on property order. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function checksumOf(data) {
  return crypto.createHash('sha256').update(stableStringify(data)).digest('hex');
}

/** Selects the rows of one table that belong to the company. */
function selectRows(db, table, companyId) {
  if (table.parent === null) {
    return db.prepare(`SELECT * FROM ${table.name} WHERE company_id = ? ORDER BY id`).all(companyId);
  }
  const p = table.parent;
  return db.prepare(
    `SELECT t.* FROM ${table.name} t WHERE t.${p.key} IN (SELECT id FROM ${p.table} WHERE company_id = ?) ORDER BY t.id`
  ).all(companyId);
}

/** Builds the backup document for one company. Pure read; does not modify the database. */
function buildBackup(db, companyId, { genesisVersion, exportedAt = new Date().toISOString() } = {}) {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  if (!company) throw new Error('Company not found');
  const tables = {};
  for (const t of TABLES) tables[t.name] = selectRows(db, t, companyId);
  const data = { company, tables };
  return {
    formatVersion: FORMAT_VERSION,
    genesisVersion,
    exportedAt,
    companyId,
    rowCounts: Object.fromEntries(TABLES.map((t) => [t.name, tables[t.name].length])),
    checksum: checksumOf(data),
    data
  };
}

/**
 * Validates a backup document. Returns { ok:true } or { ok:false, code, error }.
 * Pure: never touches the database except through the optional `expectedCompanyId`.
 */
function validateBackup(doc, expectedCompanyId) {
  const fail = (code, error) => ({ ok: false, code, error });
  if (!doc || typeof doc !== 'object') return fail('BACKUP_INVALID', 'The backup file is not a valid GENESIS backup.');
  if (doc.formatVersion !== FORMAT_VERSION) {
    return fail(
      'BACKUP_FORMAT_UNSUPPORTED',
      'This backup was made by an earlier version of GENESIS and cannot be restored safely, because it does not contain every table. Export a new backup from the current version.'
    );
  }
  if (!doc.data || typeof doc.data !== 'object' || !doc.data.tables || typeof doc.data.tables !== 'object' || !doc.data.company) {
    return fail('BACKUP_INVALID', 'The backup file is incomplete.');
  }
  if (checksumOf(doc.data) !== doc.checksum) {
    return fail('BACKUP_CHECKSUM_MISMATCH', 'The backup file has been changed or is damaged (checksum mismatch). Nothing was restored.');
  }
  if (doc.companyId !== expectedCompanyId || doc.data.company.id !== expectedCompanyId) {
    return fail('BACKUP_COMPANY_MISMATCH', 'This backup belongs to a different company. Restore it only into the company it was taken from.');
  }
  for (const name of Object.keys(doc.data.tables)) {
    if (!TABLE_NAMES.has(name)) return fail('BACKUP_INVALID', `The backup contains an unknown table: ${name}.`);
  }
  for (const t of TABLES) {
    const rows = doc.data.tables[t.name];
    if (!Array.isArray(rows)) return fail('BACKUP_INVALID', `The backup is missing table ${t.name}.`);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return fail('BACKUP_INVALID', `Invalid row in ${t.name}.`);
    }
  }
  // Each journal entry must balance on its own, before anything is written.
  const sums = new Map();
  for (const line of doc.data.tables.journal_entry_lines) {
    const s = sums.get(line.journal_entry_id) || { d: 0, c: 0 };
    s.d += Number(line.debit) || 0;
    s.c += Number(line.credit) || 0;
    sums.set(line.journal_entry_id, s);
  }
  for (const [entryId, s] of sums) {
    if (Math.abs(s.d - s.c) > BALANCE_TOLERANCE) {
      return fail('BACKUP_UNBALANCED', `Journal entry ${entryId} is not balanced in the backup. Nothing was restored.`);
    }
  }
  return { ok: true };
}

function tableColumns(db, name) {
  return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name));
}

/** Copies the given row into an insert for `table`, keeping only known columns. */
function insertRows(db, tableName, rows, columns) {
  if (rows.length === 0) return 0;
  const known = [...tableColumns(db, tableName)];
  const cols = known.filter((c) => columns.has(c) && rows.some((r) => r[c] !== undefined));
  if (cols.length === 0) return 0;
  const stmt = db.prepare(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  for (const row of rows) stmt.run(cols.map((c) => (row[c] === undefined ? null : row[c])));
  return rows.length;
}

/**
 * Replaces the company's business data with the backup. Must be called with a verified
 * document (validateBackup). Runs in one transaction. Returns row counts restored.
 * Users, sessions and audit logs are not touched here; the caller revokes sessions.
 */
function restoreBackup(db, companyId, doc) {
  const restored = {};
  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    // Delete children first.
    for (const t of [...TABLES].reverse()) {
      if (t.parent === null) {
        db.prepare(`DELETE FROM ${t.name} WHERE company_id = ?`).run(companyId);
      } else {
        const p = t.parent;
        db.prepare(`DELETE FROM ${t.name} WHERE ${p.key} IN (SELECT id FROM ${p.table} WHERE company_id = ?)`).run(companyId);
      }
    }
    // Company settings row (same company id only).
    const companyCols = tableColumns(db, 'companies');
    const updates = Object.keys(doc.data.company).filter((c) => c !== 'id' && companyCols.has(c));
    if (updates.length) {
      db.prepare(`UPDATE companies SET ${updates.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...updates.map((c) => doc.data.company[c] ?? null), companyId);
    }
    for (const t of TABLES) {
      restored[t.name] = insertRows(db, t.name, doc.data.tables[t.name], tableColumns(db, t.name));
    }
    const fkErrors = db.prepare('PRAGMA foreign_key_check').all();
    if (fkErrors.length > 0) {
      throw Object.assign(new Error(`Foreign key check failed after restore (${fkErrors.length} problems). Nothing was restored.`), { code: 'BACKUP_FK_FAILED' });
    }
    // Post-restore: the company ledger must balance as a whole.
    const tb = db.prepare(`
      SELECT COALESCE(SUM(jel.debit), 0) AS d, COALESCE(SUM(jel.credit), 0) AS c
      FROM journal_entry_lines jel JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE je.company_id = ?
    `).get(companyId);
    if (Math.abs(tb.d - tb.c) > BALANCE_TOLERANCE) {
      throw Object.assign(new Error('The restored ledger does not balance. Nothing was restored.'), { code: 'BACKUP_UNBALANCED' });
    }
  })();
  return restored;
}

/** Writes a verified copy of the database file and returns its path. Throws if it cannot. */
function verifiedCopy(db, sourcePath, backupDir, label) {
  fs.mkdirSync(backupDir, { recursive: true });
  db.pragma('wal_checkpoint(TRUNCATE)');
  const target = path.join(backupDir, `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  fs.copyFileSync(sourcePath, target, fs.constants.COPYFILE_EXCL);
  const src = fs.statSync(sourcePath).size;
  const dst = fs.statSync(target).size;
  if (dst === 0 || dst !== src) {
    throw new Error('The safety copy could not be verified. Nothing was restored.');
  }
  return target;
}

module.exports = {
  FORMAT_VERSION,
  TABLES,
  stableStringify,
  checksumOf,
  buildBackup,
  validateBackup,
  restoreBackup,
  verifiedCopy
};
