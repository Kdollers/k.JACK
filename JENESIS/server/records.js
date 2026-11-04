'use strict';
/**
 * Record lifecycle: deactivate, reactivate and delete.
 *
 * JENESIS 0.5.4 modification 3. Five kinds of record can be retired:
 * customers, suppliers, products, stores (warehouses) and users. The rule the
 * whole module is built around is:
 *
 *   HISTORY IS NEVER DESTROYED.
 *
 * A record that has been used — invoiced, billed, paid, moved, counted or
 * journalled — cannot be deleted at all. It can only be deactivated, which
 * hides it from new transactions while every past document, movement, journal
 * entry and audit row stays exactly as it was. Only a record that has never
 * been used anywhere may be removed for good.
 *
 * Every change is written to audit_logs with the user, the date-time, the
 * action type and the affected record, so a retirement can always be traced.
 */
const { getDb } = require('./db');
const { asErrorResponse } = require('./utils');
const { logAudit } = require('./accountingEngine');
const { revokeUserSessions } = require('./auth');

/**
 * The five record kinds, and the tables that make each one historical.
 *
 * `history` lists [table, column] pairs holding rows that reference the
 * record. If any of them contains a row, the record has been used and must be
 * archived rather than deleted. Users are deliberately listed with no history:
 * a user is not an accounting document, and the two guards below (never
 * yourself, never the last active administrator) are what protect them.
 */
const RECORD_TYPES = {
  customers: {
    table: 'customers',
    module: 'CUSTOMERS',
    nameColumn: 'name',
    kind: 'Customer',
    history: [
      ['sales_invoices', 'customer_id'],
      ['sales_orders', 'customer_id'],
      ['sales_quotes', 'customer_id'],
      ['credit_notes', 'customer_id'],
      ['payments', 'customer_id']
    ]
  },
  suppliers: {
    table: 'suppliers',
    module: 'SUPPLIERS',
    nameColumn: 'name',
    kind: 'Supplier',
    history: [
      ['purchase_invoices', 'supplier_id'],
      ['purchase_orders', 'supplier_id'],
      ['purchase_returns', 'supplier_id'],
      ['goods_receipts', 'supplier_id'],
      ['payments', 'supplier_id']
    ]
  },
  products: {
    table: 'products',
    module: 'INVENTORY',
    nameColumn: 'name',
    kind: 'Product',
    history: [
      ['sales_invoice_lines', 'product_id'],
      ['purchase_invoice_lines', 'product_id'],
      ['credit_note_lines', 'product_id'],
      ['purchase_return_lines', 'product_id'],
      ['sales_order_lines', 'product_id'],
      ['sales_quote_lines', 'product_id'],
      ['purchase_order_lines', 'product_id'],
      ['inventory_movements', 'product_id'],
      ['stock_levels', 'product_id'],
      ['stock_transfer_lines', 'product_id'],
      ['goods_receipt_lines', 'product_id'],
      ['physical_inventory_lines', 'product_id'],
      ['stock_adjustment_lines', 'product_id'],
      ['fifo_stock_layers', 'product_id']
    ]
  },
  warehouses: {
    table: 'warehouses',
    module: 'INVENTORY',
    nameColumn: 'name',
    kind: 'Store',
    history: [
      ['stock_levels', 'warehouse_id'],
      ['inventory_movements', 'warehouse_id'],
      ['physical_inventory_counts', 'warehouse_id'],
      ['goods_receipts', 'warehouse_id']
    ],
    // stock_transfers references a store twice, so it needs its own shape.
    extraHistory: [
      { sql: 'SELECT COUNT(*) AS n FROM stock_transfers WHERE company_id = ? AND (from_warehouse_id = ? OR to_warehouse_id = ?)', params: 2 }
    ]
  },
  users: {
    table: 'users',
    module: 'USERS',
    nameColumn: 'username',
    kind: 'User',
    history: []
  }
};

const RECORD_TYPE_NAMES = Object.keys(RECORD_TYPES);

/** Thrown as an HTTP 409 when a record must be archived instead of deleted. */
class ArchiveRequiredError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ArchiveRequiredError';
    this.code = 'HAS_HISTORY';
    this.status = 409;
    this.details = details;
  }
}

class RecordError extends Error {
  constructor(message, code = 'RECORD_OPERATION_FAILED', status = 400) {
    super(message);
    this.name = 'RecordError';
    this.code = code;
    this.status = status;
  }
}

function describe(type) {
  const spec = RECORD_TYPES[type];
  if (!spec) throw new RecordError(`Unknown record type: ${type}`, 'UNKNOWN_RECORD_TYPE', 400);
  return spec;
}

/** Loads one record, scoped to the company. Returns null when absent. */
function getRecord(type, companyId, id) {
  const spec = describe(type);
  return getDb().prepare(`SELECT * FROM ${spec.table} WHERE id = ? AND company_id = ?`).get(id, companyId) || null;
}

/**
 * Counts the rows that reference this record. A count above zero means the
 * record has taken part in a transaction and may never be deleted.
 */
function countHistory(type, companyId, id) {
  const spec = describe(type);
  const db = getDb();
  const references = [];
  let total = 0;

  for (const [table, column] of spec.history) {
    if (!columnExists(table, column)) continue;
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).get(id);
    if (row && row.n > 0) references.push({ table, count: row.n });
    total += row ? row.n : 0;
  }
  for (const extra of spec.extraHistory || []) {
    const params = [companyId, ...Array(extra.params).fill(id)];
    const row = db.prepare(extra.sql).get(...params);
    if (row && row.n > 0) references.push({ table: extra.sql.includes('stock_transfers') ? 'stock_transfers' : 'reference', count: row.n });
    total += row ? row.n : 0;
  }
  return { total, references };
}

// The columns are checked once and cached: the schema is fixed at runtime.
const columnCache = new Map();
function columnExists(table, column) {
  const key = `${table}.${column}`;
  if (columnCache.has(key)) return columnCache.get(key);
  let exists = false;
  try {
    const cols = getDb().prepare(`PRAGMA table_info(${table})`).all();
    exists = cols.some((c) => c.name === column);
  } catch {
    exists = false;
  }
  columnCache.set(key, exists);
  return exists;
}

/**
 * Refuses to retire the last active administrator, and refuses a user from
 * retiring their own account. Applies to both deactivation and deletion.
 */
function guardUserRecord(companyId, target, currentUser, action) {
  const db = getDb();
  if (target.id === currentUser.id) {
    throw new RecordError(
      `You cannot ${action} your own account.`,
      'SELF_LOCKOUT',
      400
    );
  }
  if (target.role === 'admin' && target.active) {
    const otherAdmins = db
      .prepare(`SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND role = 'admin' AND active = 1 AND id <> ?`)
      .get(companyId, target.id).n;
    if (otherAdmins === 0) {
      throw new RecordError(
        'This is the last active administrator. Another administrator must be created before this account can be retired.',
        'LAST_ADMIN',
        400
      );
    }
  }
}

/**
 * Deactivates or reactivates a record.
 *
 * Deactivation is reversible and destroys nothing: stock, balances, documents
 * and history all stay. The record simply stops being offered for new work.
 * A user who is deactivated has every session revoked at once, so an already
 * open window stops working immediately rather than at the next login.
 */
function setActive({ type, id, companyId, user, active }) {
  const spec = describe(type);
  const db = getDb();
  const target = getRecord(type, companyId, id);
  if (!target) throw new RecordError(`${spec.kind} not found.`, 'NOT_FOUND', 404);

  const next = active ? 1 : 0;
  if (Number(target.active) === next) {
    return { record: target, changed: false, action: active ? 'REACTIVATE' : 'DEACTIVATE' };
  }

  if (type === 'users') {
    guardUserRecord(companyId, target, user, active ? 'reactivate' : 'deactivate');
    // Reactivating must not create a lock-out risk, but deactivating the last
    // administrator must be refused: guardUserRecord already covers both.
  } else if (type === 'warehouses' && next === 0 && target.is_default) {
    throw new RecordError(
      'The default store cannot be deactivated. Make another store the default first.',
      'DEFAULT_STORE',
      400
    );
  }

  const action = active ? 'REACTIVATE' : 'DEACTIVATE';
  const name = target[spec.nameColumn];

  db.prepare(`UPDATE ${spec.table} SET active = ? WHERE id = ? AND company_id = ?`).run(next, id, companyId);

  // A deactivated user must lose access at once, including sessions that are
  // already open on other machines.
  let revokedSessions = 0;
  if (type === 'users' && !active) {
    revokedSessions = revokeUserSessions(id);
  }

  logAudit(
    companyId, user.id, user.full_name, spec.module, action, id,
    `${active ? 'Reactivated' : 'Deactivated'} ${spec.kind.toLowerCase()} ${name}`,
    { active: Number(target.active) },
    { active: next }
  );

  return { record: { ...target, active: next }, changed: true, action, revokedSessions };
}

/**
 * Permanently deletes a record.
 *
 * Only allowed when the record has never been used. Anything with history
 * raises ArchiveRequiredError (HTTP 409) and the caller is expected to offer
 * deactivation instead, which is what every screen in the app does.
 */
function remove({ type, id, companyId, user }) {
  const spec = describe(type);
  const db = getDb();
  const target = getRecord(type, companyId, id);
  if (!target) throw new RecordError(`${spec.kind} not found.`, 'NOT_FOUND', 404);

  const name = target[spec.nameColumn];

  if (type === 'users') {
    guardUserRecord(companyId, target, user, 'delete');
    // Sessions go first so an open window dies with the account.
    revokeUserSessions(id);
    db.prepare('DELETE FROM users WHERE id = ? AND company_id = ?').run(id, companyId);
    logAudit(companyId, user.id, user.full_name, spec.module, 'DELETE', id,
      `Deleted user ${name}`, { username: name, role: target.role }, null);
    return { deleted: true, name };
  }

  const { total, references } = countHistory(type, companyId, id);
  if (total > 0) {
    throw new ArchiveRequiredError(
      `${spec.kind} "${name}" has ${total} linked transaction record${total === 1 ? '' : 's'}, so it cannot be deleted. ` +
      `Deactivate it instead: its history stays intact and it disappears from new transactions.`,
      { references, kind: spec.kind, name }
    );
  }

  db.prepare(`DELETE FROM ${spec.table} WHERE id = ? AND company_id = ?`).run(id, companyId);
  logAudit(companyId, user.id, user.full_name, spec.module, 'DELETE', id,
    `Deleted ${spec.kind.toLowerCase()} ${name}`, { [spec.nameColumn]: name }, null);
  return { deleted: true, name };
}

/** Express error translator for the two error types raised above. */
function toHttpError(err, res) {
  if (err instanceof ArchiveRequiredError) {
    return res.status(err.status).json({
      error: err.message, code: err.code,
      archiveInstead: true, references: err.details && err.details.references
    });
  }
  if (err instanceof RecordError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  return res.status(400).json(asErrorResponse(err));
}

module.exports = {
  RECORD_TYPES,
  RECORD_TYPE_NAMES,
  ArchiveRequiredError,
  RecordError,
  getRecord,
  countHistory,
  setActive,
  remove,
  toHttpError,
  guardUserRecord
};
