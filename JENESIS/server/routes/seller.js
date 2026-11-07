'use strict';
/**
 * JENESIS Seller — the counter.
 *
 * This is the Seller's own dashboard, and the whole point of it is what it
 * does NOT contain. The screen the Seller used to be given was the accounting
 * dashboard: profit and loss, the balance sheet, the trial balance, the
 * general ledger, receivables and payables — a bookkeeper's desk, handed to
 * someone whose job is to sell.
 *
 * So the Seller asks a different question here, and this module answers exactly
 * that question and nothing else:
 *
 *   what did I sell today, what can I sell right now, and what is in the till?
 *
 * Not one figure below is a profit, a margin, a balance sheet line or a
 * receivable. Those live in JENESIS Accounting & Business, and the Seller
 * application cannot reach them — the same database, a different window, and
 * the service refuses the request if the window asks anyway.
 *
 * The database is shared. A sale written from here is the same sale the
 * accountant reconciles: one invoice, one journal entry, one stock movement.
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requirePermission, requireAnyPermission } = require('../auth');
const { roundTo } = require('../utils');

/** Today, in the YYYY-MM-DD form the documents are stored in. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** A posted sale is one that has reached the books: never a draft. */
const POSTED_STATUSES = ['POSTED', 'PAID', 'PARTIALLY_PAID'];

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

// ---------------------------------------------------------------------------
// The Seller's dashboard
// ---------------------------------------------------------------------------
router.get('/seller/dashboard', requirePermission('sales:read'), (req, res) => {
  const { companyId } = getSessionContextSeller(req);
  const db = getDb();
  const day = today();
  const placeholders = POSTED_STATUSES.map(() => '?').join(', ');

  // ---- Daily sales summary -------------------------------------------------
  const dayRow = db.prepare(`
    SELECT COUNT(*) AS count,
           COALESCE(SUM(total), 0) AS total,
           COALESCE(SUM(tax_total), 0) AS tax,
           COALESCE(SUM(amount_paid), 0) AS paid
    FROM sales_invoices
    WHERE company_id = ? AND date = ? AND status IN (${placeholders})
  `).get(companyId, day, ...POSTED_STATUSES);

  // Cash taken today, as opposed to credit: the two together are the day's
  // total, and a seller needs to know which is which before the till is
  // counted. This is what happened in the till, not what the company is owed.
  let cashTaken = 0;
  if (tableExists(db, 'payments')) {
    const hasStatus = db.prepare('PRAGMA table_info(payments)').all().some((c) => c.name === 'status');
    const statusFilter = hasStatus ? " AND (status IS NULL OR status = 'POSTED')" : '';
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS cash
      FROM payments
      WHERE company_id = ? AND date = ? AND payment_type = 'CUSTOMER_RECEIPT'
        AND payment_method = 'CASH'${statusFilter}
    `).get(companyId, day);
    cashTaken = roundTo(Number(row && row.cash) || 0, 2);
  }

  const week = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = daysAgo(offset);
    const row = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
      FROM sales_invoices
      WHERE company_id = ? AND date = ? AND status IN (${placeholders})
    `).get(companyId, date, ...POSTED_STATUSES);
    week.push({
      date,
      count: Number(row.count) || 0,
      total: roundTo(Number(row.total) || 0, 2)
    });
  }

  // ---- Sales history -------------------------------------------------------
  const recent = db.prepare(`
    SELECT si.id, si.invoice_number, si.date, si.total, si.status, si.amount_paid,
           si.balance_due, c.name AS customer_name
    FROM sales_invoices si
    LEFT JOIN customers c ON c.id = si.customer_id
    WHERE si.company_id = ? AND si.status IN (${placeholders})
    ORDER BY si.date DESC, si.created_at DESC
    LIMIT 12
  `).all(companyId, ...POSTED_STATUSES);

  // ---- What can be sold right now -----------------------------------------
  const lowStock = tableExists(db, 'products')
    ? db.prepare(`
        SELECT id, sku, name, unit, current_stock, min_stock_level, selling_price
        FROM products
        WHERE company_id = ? AND active = 1 AND current_stock <= MAX(COALESCE(min_stock_level, 0), 0)
        ORDER BY current_stock ASC
        LIMIT 8
      `).all(companyId)
    : [];

  let stockValue = 0;
  if (tableExists(db, 'products')) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(current_stock), 0) AS units,
             COALESCE(SUM(current_stock * COALESCE(cost_price, 0)), 0) AS value
      FROM products WHERE company_id = ? AND active = 1
    `).get(companyId);
    stockValue = roundTo(Number(row && row.value) || 0, 2);
  }

  // ---- The till ------------------------------------------------------------
  const register = cashRegister(db, companyId);

  res.json({
    date: day,
    today: {
      count: Number(dayRow.count) || 0,
      total: roundTo(Number(dayRow.total) || 0, 2),
      tax: roundTo(Number(dayRow.tax) || 0, 2),
      paid: roundTo(Number(dayRow.paid) || 0, 2),
      cash: cashTaken,
      credit: roundTo(Math.max(0, roundTo(Number(dayRow.total) || 0, 2) - cashTaken), 2)
    },
    week,
    recentSales: recent.map((r) => ({
      id: r.id,
      number: r.invoice_number,
      date: r.date,
      customer: r.customer_name || null,
      total: roundTo(Number(r.total) || 0, 2),
      paid: roundTo(Number(r.amount_paid) || 0, 2),
      balance: roundTo(Number(r.balance_due) || 0, 2),
      status: r.status
    })),
    stock: {
      lowStock: lowStock.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        onHand: Number(p.current_stock) || 0,
        minimum: Number(p.min_stock_level) || 0,
        price: roundTo(Number(p.selling_price) || 0, 2)
      })),
      units: tableExists(db, 'products')
        ? Number((db.prepare('SELECT COALESCE(SUM(current_stock), 0) AS u FROM products WHERE company_id = ? AND active = 1').get(companyId) || {}).u) || 0
        : 0,
      // The number of lines that need attention, NOT their value: what a
      // product cost the company is the accountant's business, and putting it
      // on a seller's screen would be handing out the margin.
      lowStockCount: lowStock.length
    },
    register
    // And nothing else. No profit, no margin, no balance sheet, no trial
    // balance, no general ledger, no payables, no receivables. Those belong to
    // JENESIS Accounting & Business, and this endpoint never asks the database
    // for them — which is why they cannot leak here even by accident.
  });
});

/**
 * The cash register: the open till if there is one, otherwise the cash
 * accounts. Deliberately NOT the bank accounts, and deliberately not a
 * balance-sheet figure — the seller is told what is in the drawer.
 */
function cashRegister(db, companyId) {
  if (tableExists(db, 'cash_sessions')) {
    const open = db.prepare(`
      SELECT cs.id, cs.session_number, cs.opened_at, cs.bank_account_id,
             ba.bank_name, ba.account_type,
             (SELECT COALESCE(SUM(subtotal), 0) FROM cash_count_lines c
               WHERE c.session_id = cs.id AND c.count_phase = 'OPENING') AS opening_float
      FROM cash_sessions cs
      LEFT JOIN bank_accounts ba ON ba.id = cs.bank_account_id
      WHERE cs.company_id = ? AND cs.status = 'OPEN'
      ORDER BY cs.opened_at DESC
      LIMIT 1
    `).get(companyId);
    if (open) {
      return {
        open: true,
        sessionId: open.id,
        sessionNumber: open.session_number,
        name: open.bank_name || null,
        openedAt: open.opened_at,
        openingFloat: roundTo(Number(open.opening_float) || 0, 2),
        // Expected cash is counted by JENESIS Accounting & Business when the
        // session is closed. The seller sees the float they started with.
        note: 'CASH_REGISTER_OPEN'
      };
    }
  }

  const cash = db.prepare(`
    SELECT id, bank_name, account_number, currency, current_balance
    FROM bank_accounts
    WHERE company_id = ? AND active = 1 AND UPPER(COALESCE(account_type, '')) = 'CASH'
    ORDER BY bank_name
  `).all(companyId);

  return {
    open: false,
    accounts: cash.map((a) => ({
      id: a.id,
      name: a.bank_name,
      number: a.account_number || null,
      currency: a.currency || null,
      balance: roundTo(Number(a.current_balance) || 0, 2)
    })),
    total: roundTo(cash.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0), 2),
    note: 'NO_OPEN_SESSION'
  };
}

// ---------------------------------------------------------------------------
// Product search — what it costs the customer and whether it is on the shelf
// ---------------------------------------------------------------------------
router.get('/seller/products', requireAnyPermission('sales:read', 'inventory:read'), (req, res) => {
  const { companyId } = getSessionContextSeller(req);
  const db = getDb();
  const search = String(req.query.search || '').trim();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const like = `%${search}%`;
  const rows = search
    ? db.prepare(`
        SELECT id, sku, barcode, name, unit, selling_price, current_stock, min_stock_level, category
        FROM products
        WHERE company_id = ? AND active = 1
          AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR COALESCE(category, '') LIKE ?)
        ORDER BY name ASC LIMIT ?
      `).all(companyId, like, like, like, like, limit)
    : db.prepare(`
        SELECT id, sku, barcode, name, unit, selling_price, current_stock, min_stock_level, category
        FROM products
        WHERE company_id = ? AND active = 1
        ORDER BY name ASC LIMIT ?
      `).all(companyId, limit);

  res.json(rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode || null,
    name: p.name,
    unit: p.unit,
    category: p.category || null,
    price: roundTo(Number(p.selling_price) || 0, 2),
    onHand: Number(p.current_stock) || 0,
    minimum: Number(p.min_stock_level) || 0,
    // Availability is a plain word so the three languages need no arithmetic:
    // the seller reads "in stock", "low" or "out" rather than comparing two
    // numbers they cannot see the meaning of.
    availability: (Number(p.current_stock) || 0) <= 0
      ? 'OUT'
      : (Number(p.current_stock) || 0) <= (Number(p.min_stock_level) || 0)
        ? 'LOW'
        : 'IN_STOCK'
  })));
});

/** Shares the session context helper with the main router. */
function getSessionContextSeller(req) {
  if (!req.auth) throw new Error('getSessionContext called without authentication');
  return { companyId: req.auth.companyId, user: req.auth.user };
}

module.exports = router;
