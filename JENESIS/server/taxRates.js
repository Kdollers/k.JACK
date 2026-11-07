'use strict';
/**
 * Tax rates — create, edit, deactivate, reactivate and (only when nothing has
 * ever used them) delete.
 *
 * JENESIS Settings & Access Point owns tax rates. The rule the whole module is
 * built around is the one the requirement states plainly:
 *
 *   A TAX RATE THAT HAS BEEN USED IS NEVER DESTROYED.
 *
 * Deactivating one changes nothing that already exists. Every invoice, bill,
 * quote and order line stores the rate that applied at the time (`tax_rate`,
 * alongside `tax_rate_id`), so a document printed last year still reads the
 * same next year. Deactivation only removes the rate from NEW transactions,
 * which is exactly what it is for.
 *
 * Reactivating puts it back on the list for new transactions and changes no
 * historical document either.
 */
const { getDb } = require('./db');
const { logAudit } = require('./accountingEngine');

/**
 * Everywhere a tax rate can be referred to.
 *
 * `accounting: true` marks the references that make a rate historical: a
 * document line that has been raised with it. `products` is different — it is
 * a DEFAULT rather than a record of use — but deleting the rate a product
 * still points at would leave that product pointing at nothing, so it counts
 * too and is reported in its own words.
 */
const REFERENCES = [
  { table: 'sales_invoice_lines', column: 'tax_rate_id', accounting: true, label: 'sales invoices' },
  { table: 'sales_quote_lines', column: 'tax_rate_id', accounting: true, label: 'sales quotes' },
  { table: 'sales_order_lines', column: 'tax_rate_id', accounting: true, label: 'sales orders' },
  { table: 'purchase_invoice_lines', column: 'tax_rate_id', accounting: true, label: 'purchase bills' },
  { table: 'purchase_order_lines', column: 'tax_rate_id', accounting: true, label: 'purchase orders' },
  { table: 'products', column: 'tax_rate_id', accounting: false, label: 'products (as their default rate)' }
];

/**
 * Counts where a tax rate is referred to, table by table.
 *
 * A table added by a later migration and not yet present is skipped rather
 * than crashing a screen that has nothing to do with it.
 */
function taxUsage(db, taxId) {
  const present = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
  );
  const found = [];
  let total = 0;
  let accounting = 0;
  for (const reference of REFERENCES) {
    if (!present.has(reference.table)) continue;
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${reference.table} WHERE ${reference.column} = ?`).get(taxId);
    const n = Number(row && row.n) || 0;
    if (n === 0) continue;
    total += n;
    if (reference.accounting) accounting += n;
    found.push({ label: reference.label, count: n, accounting: reference.accounting });
  }
  return { total, accounting, references: found };
}

/** One sentence naming where a rate is used, for the message a user reads. */
function usageSentence(usage) {
  if (!usage || usage.total === 0) return '';
  const parts = usage.references.map((r) => `${r.count} × ${r.label}`);
  return parts.join(', ');
}

/**
 * Reads the tax rates of one company.
 *
 * `status` filters the list, and it defaults to ACTIVE on purpose: this is the
 * endpoint a new invoice calls to fill its tax drop-down, so a rate that has
 * been deactivated must stop appearing there. The Settings screen, which has
 * to be able to see retired rates in order to reactivate them, asks for
 * `?status=inactive` or `?status=all` explicitly.
 */
function listTaxRates(db, companyId, status) {
  const which = String(status || 'active').toLowerCase();
  const where = which === 'inactive' ? ' AND active = 0' : which === 'all' ? '' : ' AND active = 1';
  return db.prepare(`SELECT * FROM tax_rates WHERE company_id = ?${where} ORDER BY rate DESC`).all(companyId);
}

/**
 * Deletes a rate, but only when nothing refers to it.
 *
 * Throws with code TAX_IN_USE otherwise. The caller turns that into a 409 and
 * an offer to deactivate instead — the same shape as every other record in
 * JENESIS that carries history.
 */
function deleteTaxRate(db, { companyId, taxId, user }) {
  const rate = db.prepare('SELECT * FROM tax_rates WHERE id = ? AND company_id = ?').get(taxId, companyId);
  if (!rate) {
    throw Object.assign(new Error('Tax rate not found.'), { code: 'NOT_FOUND', status: 404 });
  }
  const usage = taxUsage(db, taxId);
  if (usage.total > 0) {
    const where = usageSentence(usage);
    throw Object.assign(
      new Error(
        `“${rate.code}” has been used on ${where}, so it cannot be deleted. ` +
        'Deactivate it instead: every past invoice, bill and report keeps the rate it was raised with.'
      ),
      { code: 'TAX_IN_USE', status: 409, usage }
    );
  }
  db.prepare('DELETE FROM tax_rates WHERE id = ? AND company_id = ?').run(taxId, companyId);
  logAudit(companyId, user.id, user.full_name, 'TAXES', 'DELETE', taxId, `Deleted tax rate ${rate.code} (${rate.rate}%)`);
  return { id: taxId, deleted: true };
}

/** Turns a rate on or off for NEW transactions. Nothing historical moves. */
function setTaxRateActive(db, { companyId, taxId, active, user, reason }) {
  const rate = db.prepare('SELECT * FROM tax_rates WHERE id = ? AND company_id = ?').get(taxId, companyId);
  if (!rate) {
    throw Object.assign(new Error('Tax rate not found.'), { code: 'NOT_FOUND', status: 404 });
  }
  if (Number(rate.active) === (active ? 1 : 0)) {
    return { id: taxId, active: Number(rate.active) === 1, unchanged: true };
  }
  db.prepare('UPDATE tax_rates SET active = ? WHERE id = ? AND company_id = ?')
    .run(active ? 1 : 0, taxId, companyId);
  const action = active ? 'REACTIVATE' : 'DEACTIVATE';
  logAudit(
    companyId, user.id, user.full_name, 'TAXES', action, taxId,
    `${active ? 'Reactivated' : 'Deactivated'} tax rate ${rate.code} (${rate.rate}%)` +
    `${reason ? ` — ${reason}` : ''}`
  );
  return { id: taxId, active: !!active };
}

module.exports = {
  REFERENCES,
  taxUsage,
  usageSentence,
  listTaxRates,
  deleteTaxRate,
  setTaxRateActive
};
