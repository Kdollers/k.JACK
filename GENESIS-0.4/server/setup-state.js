'use strict';
/**
 * Installation state is stored in SQLite, never in browser storage. A missing or
 * deactivated administrator is a recovery situation, NOT a new installation.
 * Existing business data also prevents unauthenticated first-user setup.
 */
const BUSINESS_TABLES = [
  'customers', 'suppliers', 'products', 'sales_quotes', 'sales_orders',
  'sales_invoices', 'credit_notes', 'purchase_orders', 'purchase_invoices',
  'purchase_returns', 'payments', 'journal_entries', 'inventory_movements',
  'stock_adjustments', 'physical_inventory_counts', 'audit_logs'
];

function hasBusinessData(db) {
  for (const table of BUSINESS_TABLES) {
    if (db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()) return true;
  }
  if (db.prepare('SELECT 1 FROM companies WHERE name <> ? OR legal_name <> ? LIMIT 1')
    .get('New Company', 'New Company')) return true;
  if (db.prepare('SELECT COUNT(*) AS n FROM companies').get().n > 1) return true;
  return !!db.prepare('SELECT 1 FROM bank_accounts WHERE current_balance <> 0 LIMIT 1').get();
}

function setupStatus(db) {
  const state = db.prepare('SELECT completed_at FROM installation_state WHERE id = 1').get();
  // A missing state row must fail closed; it must never make public setup available.
  const completed = !state || !!state.completed_at;
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const activeAdmins = db.prepare(`SELECT COUNT(*) AS n FROM company_memberships m
    JOIN users u ON u.id = m.user_id WHERE u.active = 1 AND m.role = 'admin'`).get().n;
  const clean = users === 0 && !hasBusinessData(db);
  return {
    needsSetup: !completed && clean,
    recoveryRequired: (!clean && activeAdmins === 0) || (completed && users === 0)
  };
}

module.exports = { hasBusinessData, setupStatus };
