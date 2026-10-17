'use strict';
/**
 * Multi-currency support.
 *
 *  - Each company has exactly one BASE currency (companies.currency_code) used
 *    for all ledger amounts, plus a list of transaction currencies with their
 *    own symbol and DECIMAL PRECISION (never assume 2 decimals: JPY uses 0,
 *    BHD uses 3, ...).
 *  - Exchange rates are stored per currency pair with an EFFECTIVE DATE. The
 *    rate applied to a transaction is the latest one effective on or before the
 *    transaction date, so historical transactions keep the rate they used.
 *  - Transaction documents store currency_code, exchange_rate and the original
 *    foreign amount; ledger amounts are always base-currency amounts.
 */
const { getDb } = require('./db');
const { generateId, roundTo } = require('./utils');
const { logAudit } = require('./accountingEngine');

const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

function listCurrencies(companyId, { includeInactive = false } = {}) {
  return getDb().prepare(`
    SELECT c.*, comp.currency_code AS base_code
    FROM currencies c
    JOIN companies comp ON comp.id = c.company_id
    WHERE c.company_id = ?${includeInactive ? '' : ' AND c.active = 1'}
    ORDER BY c.is_base DESC, c.code ASC
  `).all(companyId);
}

function createCurrency(companyId, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const code = String(data.code || '').trim().toUpperCase();
    if (!CURRENCY_CODE_RE.test(code)) throw new Error('Currency code must be 3 letters (ISO 4217), e.g. USD, EUR, RWF.');
    const decimals = Number.isInteger(Number(data.decimals)) ? Number(data.decimals) : 2;
    if (decimals < 0 || decimals > 4) throw new Error('Currency decimals must be between 0 and 4.');
    const exists = db.prepare(`SELECT id FROM currencies WHERE company_id = ? AND code = ?`).get(companyId, code);
    if (exists) throw new Error(`Currency ${code} already exists.`);
    const id = generateId('cur');
    db.prepare(`
      INSERT INTO currencies (id, company_id, code, name, symbol, decimals, is_base, active)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1)
    `).run(id, companyId, code, String(data.name || code).trim(), String(data.symbol || '').trim(), decimals);
    logAudit(companyId, user?.id, user?.full_name, 'SETTINGS', 'CREATE', id, `Added currency ${code}`);
    return { id, code, decimals };
  });
  return tx();
}

function updateCurrency(companyId, id, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const cur = db.prepare(`SELECT * FROM currencies WHERE id = ? AND company_id = ?`).get(id, companyId);
    if (!cur) throw new Error('Currency not found.');
    if (data.active === 0 || data.active === false) {
      if (cur.is_base) throw new Error('The base currency cannot be deactivated.');
    }
    const decimals = data.decimals != null ? Number(data.decimals) : cur.decimals;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) throw new Error('Currency decimals must be between 0 and 4.');
    db.prepare(`UPDATE currencies SET name = ?, symbol = ?, decimals = ?, active = ? WHERE id = ?`)
      .run(
        data.name != null ? String(data.name).trim() : cur.name,
        data.symbol != null ? String(data.symbol).trim() : cur.symbol,
        decimals,
        (data.active === 0 || data.active === false) ? 0 : 1,
        id
      );
    logAudit(companyId, user?.id, user?.full_name, 'SETTINGS', 'UPDATE', id, `Updated currency ${cur.code}`);
    return db.prepare(`SELECT * FROM currencies WHERE id = ?`).get(id);
  });
  return tx();
}

function currencyInfo(db, companyId, code) {
  const row = db.prepare(`SELECT * FROM currencies WHERE company_id = ? AND code = ?`).get(companyId, String(code || '').toUpperCase());
  if (row) return row;
  const company = db.prepare(`SELECT currency_code, currency_symbol, currency_decimals FROM companies WHERE id = ?`).get(companyId);
  if (company && company.currency_code === String(code || '').toUpperCase()) {
    return { code: company.currency_code, symbol: company.currency_symbol, decimals: company.currency_decimals == null ? 2 : company.currency_decimals, is_base: 1 };
  }
  return null;
}

function listRates(companyId, { from = null, to = null } = {}) {
  const db = getDb();
  const params = [companyId];
  let sql = `SELECT * FROM exchange_rates WHERE company_id = ?`;
  if (from) { sql += ` AND from_code = ?`; params.push(String(from).toUpperCase()); }
  if (to) { sql += ` AND to_code = ?`; params.push(String(to).toUpperCase()); }
  sql += ` ORDER BY effective_date DESC, created_at DESC`;
  return db.prepare(sql).all(...params);
}

function setRate(companyId, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const from = String(data.fromCode || data.from_code || '').trim().toUpperCase();
    const to = String(data.toCode || data.to_code || '').trim().toUpperCase();
    const rate = Number(data.rate);
    const effectiveDate = String(data.effectiveDate || data.effective_date || new Date().toISOString().split('T')[0]);
    if (!CURRENCY_CODE_RE.test(from) || !CURRENCY_CODE_RE.test(to)) throw new Error('Currency codes must be 3 letters (ISO 4217).');
    if (from === to) throw new Error('A rate must link two different currencies.');
    if (!(rate > 0)) throw new Error('Exchange rate must be greater than zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error('Effective date must be YYYY-MM-DD.');
    if (!currencyInfo(db, companyId, from)) throw new Error(`Currency ${from} is not configured for this company.`);
    if (!currencyInfo(db, companyId, to)) throw new Error(`Currency ${to} is not configured for this company.`);

    const existing = db.prepare(`
      SELECT id FROM exchange_rates WHERE company_id = ? AND from_code = ? AND to_code = ? AND effective_date = ?
    `).get(companyId, from, to, effectiveDate);
    if (existing) {
      db.prepare(`UPDATE exchange_rates SET rate = ?, notes = ?, created_by = ?, created_at = datetime('now') WHERE id = ?`)
        .run(rate, data.notes || null, user?.id || 'system', existing.id);
      logAudit(companyId, user?.id, user?.full_name, 'FX', 'UPDATE', existing.id, `Updated rate ${from}→${to} = ${rate} effective ${effectiveDate}`);
      return { id: existing.id, from, to, rate, effectiveDate, updated: true };
    }
    const id = generateId('rate');
    db.prepare(`
      INSERT INTO exchange_rates (id, company_id, from_code, to_code, rate, effective_date, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, companyId, from, to, rate, effectiveDate, data.notes || null, user?.id || 'system');
    logAudit(companyId, user?.id, user?.full_name, 'FX', 'CREATE', id, `Added rate ${from}→${to} = ${rate} effective ${effectiveDate}`);
    return { id, from, to, rate, effectiveDate, updated: false };
  });
  return tx();
}

/**
 * Rate for a pair on a date: the latest rate effective on or before that date.
 * Falls back to the inverse of the opposite pair. Base↔base is always 1.
 * Historical rates are never modified, so past transactions keep their values.
 */
function getRate(companyId, fromCode, toCode, date = new Date().toISOString().split('T')[0]) {
  const db = getDb();
  const from = String(fromCode || '').toUpperCase();
  const to = String(toCode || '').toUpperCase();
  if (!from || !to) throw new Error('Both currencies are required.');
  if (from === to) return 1;
  const direct = db.prepare(`
    SELECT rate FROM exchange_rates
    WHERE company_id = ? AND from_code = ? AND to_code = ? AND effective_date <= ?
    ORDER BY effective_date DESC, created_at DESC LIMIT 1
  `).get(companyId, from, to, date);
  if (direct) return direct.rate;
  const inverse = db.prepare(`
    SELECT rate FROM exchange_rates
    WHERE company_id = ? AND from_code = ? AND to_code = ? AND effective_date <= ?
    ORDER BY effective_date DESC, created_at DESC LIMIT 1
  `).get(companyId, to, from, date);
  if (inverse && inverse.rate > 0) return roundTo(1 / inverse.rate, 8);
  throw new Error(`No exchange rate configured for ${from} → ${to} on ${date}.`);
}

/** Converts with the TARGET currency's decimal precision. */
function convertAmount(companyId, amount, fromCode, toCode, date = new Date().toISOString().split('T')[0]) {
  const db = getDb();
  const rate = getRate(companyId, fromCode, toCode, date);
  const target = currencyInfo(db, companyId, toCode);
  const decimals = target ? target.decimals : 2;
  return { rate, decimals, converted: roundTo(Number(amount) * rate, decimals) };
}

/**
 * Resolves the base-currency amount of a foreign-currency transaction.
 * The caller supplies either the foreign amount + rate, or the foreign amount
 * and lets GENESIS look up the effective rate for the date.
 */
function toBaseAmount(companyId, { amount, currencyCode, exchangeRate = null, date }) {
  const db = getDb();
  const company = db.prepare(`SELECT currency_code FROM companies WHERE id = ?`).get(companyId);
  const base = company?.currency_code || 'USD';
  const code = String(currencyCode || base).toUpperCase();
  if (code === base) {
    const cur = currencyInfo(db, companyId, base);
    return { baseAmount: roundTo(Number(amount), cur ? cur.decimals : 2), rate: 1, foreignAmount: roundTo(Number(amount), cur ? cur.decimals : 2), currencyCode: base };
  }
  const rate = exchangeRate != null && Number(exchangeRate) > 0
    ? Number(exchangeRate)
    : getRate(companyId, code, base, date);
  return { baseAmount: roundTo(Number(amount) * rate, 2), rate, foreignAmount: Number(amount), currencyCode: code };
}

module.exports = {
  listCurrencies,
  createCurrency,
  updateCurrency,
  currencyInfo,
  listRates,
  setRate,
  getRate,
  convertAmount,
  toBaseAmount
};
