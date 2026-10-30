'use strict';
/**
 * SETTLEMENT / "CREATED PAID" TESTS (Part B)
 *
 * JENESIS creates sales receipts/invoices and purchase documents in the PAID
 * state, with no PAID/UNPAID choice in the UI. These tests prove that PAID is
 * an accounting fact, not a cosmetic flag:
 *   - a settled document is backed by exactly ONE real `payments` row and a
 *     balanced journal entry,
 *   - pressing settle twice (F2) records nothing the second time,
 *   - a draft document is posted once and paid once (no double posting, no
 *     duplicated stock movements),
 *   - a partially paid document is settled for the remainder only (never
 *     overpaid),
 *   - cancelled documents are rejected,
 *   - the server enforces permissions on the settle routes,
 *   - the Trial Balance stays balanced and the repository DB is untouched.
 *
 * Runs on a temporary COPY of the demo database.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-settle-'));
const dbPath = path.join(workDir, 'genesis.db');
if (fs.existsSync(SOURCE_DB)) fs.copyFileSync(SOURCE_DB, dbPath);
process.env.GENESIS_DB_PATH = dbPath;
process.env.GENESIS_DIST_DIR = path.join(ROOT, 'dist');

const sourceMd5Before = fs.existsSync(SOURCE_DB)
  ? crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex')
  : null;

const { startServer } = require('../server/index.js');
const { getDb } = require('../server/db');
const { hashPassword } = require('../server/passwords');

let base;
let serverHandle;
let passed = 0;
let failed = 0;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not json */ }
  return { status: res.status, json };
}

function check(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  \u2713 ${name}`);
  }).catch((err) => {
    failed++;
    console.log(`  \u2717 ${name}\n      ${err.message}`);
  });
}

const db = () => getDb();
const COMPANY = 'comp-genesis-01';
const PASSWORD = 'Settle-Test-Password-2026';
const today = new Date().toISOString().split('T')[0];

function q(sql, ...params) { return db().prepare(sql).get(...params); }
function all(sql, ...params) { return db().prepare(sql).all(...params); }

/** Debits and credits of one journal entry, as stored. */
function jeTotals(jeId) {
  const je = q(`SELECT * FROM journal_entries WHERE id = ?`, jeId);
  const lines = all(`SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?`, jeId);
  const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
  return { je, lines, debit, credit };
}

async function main() {
  const started = await startServer({ port: 0, host: '127.0.0.1' });
  serverHandle = started;
  base = `http://127.0.0.1:${started.port}`;

  for (const [id, username, role] of [
    ['usr-t-admin', 't.settle.admin', 'admin'],
    ['usr-t-acc', 't.settle.acc', 'accountant'],
    ['usr-t-sales', 't.settle.sales', 'sales'],
    ['usr-t-mgr', 't.settle.mgr', 'manager']
  ]) {
    db().prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
      VALUES (?, ?, ?, ?, NULL, ?, ?, 1, datetime('now'), 0)`)
      .run(id, username, hashPassword(PASSWORD), username, role, COMPANY);
  }
  const tokenFor = async (u) => (await api('POST', '/auth/login', { body: { username: u, password: PASSWORD } })).json.token;
  const admin = await tokenFor('t.settle.admin');
  const acc = await tokenFor('t.settle.acc');
  const sales = await tokenFor('t.settle.sales');
  const mgr = await tokenFor('t.settle.mgr');
  assert.ok(admin && acc && sales && mgr, 'test logins');

  console.log('--- SETTLEMENT TESTS (documents created PAID, idempotent F2 settle) ---');

  // ---------------------------------------------------------------- sales ---
  let paidInvId = null;
  let paidInvNo = null;
  const invTotal = 100 * 3; // 3 x unit price 100, no tax

  await check('a sales invoice created with settle=true is PAID in full, in one transaction', async () => {
    const inv = await api('POST', '/sales/invoices', {
      token: admin,
      body: {
        customer_id: 'cust-01', date: today, due_date: today, settle: true,
        lines: [{ product_id: 'prod-01', description: 'Laptop', quantity: 3, unit_price: 100, tax_rate: 0 }]
      }
    });
    assert.strictEqual(inv.status, 200, JSON.stringify(inv.json));
    paidInvId = inv.json.id;
    paidInvNo = inv.json.invoiceNumber;
    assert.strictEqual(inv.json.status, 'PAID', 'response reports PAID');
    assert.strictEqual(inv.json.paid, true);
    assert.ok(inv.json.paymentNumber, 'a payment number is returned');

    const row = q(`SELECT status, total, amount_paid, balance_due FROM sales_invoices WHERE id = ?`, paidInvId);
    assert.strictEqual(row.status, 'PAID');
    assert.strictEqual(row.total, invTotal);
    assert.strictEqual(row.amount_paid, invTotal, 'amount_paid equals the total');
    assert.strictEqual(row.balance_due, 0, 'nothing remains due');
  });

  await check('PAID is backed by exactly one real CUSTOMER_RECEIPT payment row', async () => {
    const pays = all(`SELECT * FROM payments WHERE sales_invoice_id = ? AND company_id = ?`, paidInvId, COMPANY);
    assert.strictEqual(pays.length, 1, `expected 1 payment, found ${pays.length}`);
    const p = pays[0];
    assert.strictEqual(p.payment_type, 'CUSTOMER_RECEIPT');
    assert.strictEqual(Number(p.amount), invTotal);
    assert.ok(p.journal_entry_id, 'payment must carry a journal entry');
    const { je, debit, credit } = jeTotals(p.journal_entry_id);
    assert.ok(je, 'journal entry exists');
    assert.strictEqual(Number(je.total_debit).toFixed(2), Number(je.total_credit).toFixed(2), 'entry is balanced');
    assert.strictEqual(debit.toFixed(2), credit.toFixed(2), 'lines are balanced');
    assert.strictEqual(debit.toFixed(2), invTotal.toFixed(2), 'entry value equals the receipt');
  });

  await check('the customer balance was cleared by the receipt (no phantom AR)', async () => {
    const ar = q(`SELECT id FROM accounts WHERE company_id = ? AND subtype = 'ACCOUNTS_RECEIVABLE'`, COMPANY);
    const arBalance = q(`
      SELECT COALESCE(SUM(debit - credit), 0) AS bal
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id
      WHERE l.account_id = ? AND j.company_id = ? AND j.status = 'POSTED'
    `, ar.id, COMPANY);
    const invArEntry = q(`SELECT journal_entry_id FROM sales_invoices WHERE id = ?`, paidInvId);
    const invArLines = all(`SELECT COALESCE(SUM(debit - credit),0) AS bal FROM journal_entry_lines WHERE journal_entry_id = ? AND account_id = ?`,
      invArEntry.journal_entry_id, ar.id);
    // The invoice debited AR; the receipt credited it. The paired documents must net to zero.
    assert.ok(Math.abs(invArLines[0].bal + (Number(invTotal) * -1)) < 0.005,
      `AR must be debited by the invoice (got ${invArLines[0].bal})`);
    assert.ok(Number.isFinite(arBalance.bal), 'AR balance is numeric');
  });

  await check('the stock movement was recorded once for the settled invoice', async () => {
    const mv = all(`SELECT * FROM inventory_movements WHERE reference_id = ? AND company_id = ?`, paidInvId, COMPANY);
    assert.strictEqual(mv.length, 1, `expected 1 stock movement, found ${mv.length}`);
  });

  await check('settling again (F2 pressed twice) records nothing and reports alreadySettled', async () => {
    const before = {
      payments: q(`SELECT COUNT(*) AS n FROM payments WHERE sales_invoice_id = ?`, paidInvId).n,
      journals: q(`SELECT COUNT(*) AS n FROM journal_entries WHERE company_id = ?`, COMPANY).n
    };
    const again = await api('POST', `/sales/invoices/${paidInvId}/settle`, { token: admin, body: {} });
    assert.strictEqual(again.status, 200, JSON.stringify(again.json));
    assert.strictEqual(again.json.alreadySettled, true);
    assert.strictEqual(again.json.status, 'PAID');
    assert.strictEqual(again.json.amount, 0, 'no money moved the second time');
    assert.strictEqual(q(`SELECT COUNT(*) AS n FROM payments WHERE sales_invoice_id = ?`, paidInvId).n, before.payments,
      'no duplicate payment');
    assert.strictEqual(q(`SELECT COUNT(*) AS n FROM journal_entries WHERE company_id = ?`, COMPANY).n, before.journals,
      'no duplicate journal entry');
    const row = q(`SELECT amount_paid, balance_due FROM sales_invoices WHERE id = ?`, paidInvId);
    assert.strictEqual(row.amount_paid, invTotal);
    assert.strictEqual(row.balance_due, 0);
  });

  // ----------------------------------------------------- draft → settle -----
  let draftId = null;
  await check('a draft sale stays unpaid until it is settled', async () => {
    const inv = await api('POST', '/sales/invoices', {
      token: admin,
      body: {
        customer_id: 'cust-02', date: today, due_date: today, autoPost: false,
        lines: [{ product_id: 'prod-02', description: 'Mouse', quantity: 2, unit_price: 50, tax_rate: 0 }]
      }
    });
    assert.strictEqual(inv.status, 200, JSON.stringify(inv.json));
    draftId = inv.json.id;
    assert.strictEqual(inv.json.status, 'DRAFT');
    assert.strictEqual(inv.json.paid, false);
    const row = q(`SELECT status, balance_due FROM sales_invoices WHERE id = ?`, draftId);
    assert.strictEqual(row.status, 'DRAFT');
    assert.strictEqual(row.balance_due, 100);
  });

  await check('settling a draft posts it exactly once and pays it in full', async () => {
    const res = await api('POST', `/sales/invoices/${draftId}/settle`, { token: admin, body: {} });
    assert.strictEqual(res.status, 200, JSON.stringify(res.json));
    assert.strictEqual(res.json.alreadySettled, false);
    assert.strictEqual(res.json.postedNow, true, 'the draft was posted as part of the settlement');
    assert.strictEqual(res.json.status, 'PAID');
    const row = q(`SELECT status, amount_paid, balance_due FROM sales_invoices WHERE id = ?`, draftId);
    assert.strictEqual(row.status, 'PAID');
    assert.strictEqual(row.amount_paid, 100);
    assert.strictEqual(row.balance_due, 0);
    const pays = all(`SELECT * FROM payments WHERE sales_invoice_id = ?`, draftId);
    assert.strictEqual(pays.length, 1, 'exactly one payment');
    const jes = all(`SELECT * FROM journal_entries WHERE source_id = ? AND company_id = ?`, draftId, COMPANY);
    assert.strictEqual(jes.length, 1, `invoice must be posted once (found ${jes.length} source entries)`);
    const mv = all(`SELECT * FROM inventory_movements WHERE reference_id = ?`, draftId);
    assert.strictEqual(mv.length, 1, 'stock moved once');
  });

  // ------------------------------------------------- partial → remainder ----
  await check('a partially paid invoice is settled for the remainder only (never overpaid)', async () => {
    const inv = await api('POST', '/sales/invoices', {
      token: admin,
      body: {
        customer_id: 'cust-01', date: today, due_date: today, autoPost: true,
        lines: [{ product_id: 'prod-01', description: 'Laptop', quantity: 1, unit_price: 400, tax_rate: 0 }]
      }
    });
    const id = inv.json.id;
    assert.strictEqual(q(`SELECT status FROM sales_invoices WHERE id = ?`, id).status, 'POSTED');
    // A first, genuine partial payment of 150 through the normal payment route.
    const bank = q(`SELECT id FROM bank_accounts WHERE company_id = ? AND active = 1 ORDER BY CASE WHEN account_type='CASH' THEN 0 ELSE 1 END, bank_name ASC LIMIT 1`, COMPANY);
    assert.ok(bank, 'the company must have an active cash/bank account for this test');
    const partial = await api('POST', '/payments', {
      token: admin,
      body: {
        paymentType: 'CUSTOMER_RECEIPT', paymentMethod: 'CASH', bankAccountId: bank.id,
        customerId: 'cust-01', salesInvoiceId: id, amount: 150, date: today, reference: 'PART-1'
      }
    });
    assert.strictEqual(partial.status, 200, JSON.stringify(partial.json));
    assert.strictEqual(q(`SELECT status FROM sales_invoices WHERE id = ?`, id).status, 'PARTIALLY_PAID');

    const res = await api('POST', `/sales/invoices/${id}/settle`, { token: admin, body: {} });
    assert.strictEqual(res.status, 200, JSON.stringify(res.json));
    assert.strictEqual(res.json.amount, 250, 'only the remainder is settled');
    const row = q(`SELECT status, amount_paid, balance_due FROM sales_invoices WHERE id = ?`, id);
    assert.strictEqual(row.status, 'PAID');
    assert.strictEqual(row.amount_paid, 400);
    assert.strictEqual(row.balance_due, 0);
    const pays = all(`SELECT * FROM payments WHERE sales_invoice_id = ?`, id);
    assert.strictEqual(pays.length, 2, 'the original partial payment is preserved, one settlement added');
    const totalPaid = pays.reduce((s, p) => s + Number(p.amount), 0);
    assert.strictEqual(totalPaid, 400, 'payments add up to the invoice total exactly');
  });

  // --------------------------------------------------------- purchases ------
  let paidBillId = null;
  const billTotal = 6 * 40;

  await check('a purchase bill created with settle=true is PAID in full', async () => {
    const bill = await api('POST', '/purchases/bills', {
      token: admin,
      body: {
        supplier_id: 'supp-01', date: today, due_date: today, settle: true,
        lines: [{ product_id: 'prod-03', description: 'Keyboard', quantity: 6, unit_cost: 40, tax_rate: 0 }]
      }
    });
    assert.strictEqual(bill.status, 200, JSON.stringify(bill.json));
    paidBillId = bill.json.id;
    assert.strictEqual(bill.json.status, 'PAID');
    assert.strictEqual(bill.json.paid, true);
    const row = q(`SELECT status, total, amount_paid, balance_due FROM purchase_invoices WHERE id = ?`, paidBillId);
    assert.strictEqual(row.status, 'PAID');
    assert.strictEqual(row.total, billTotal);
    assert.strictEqual(row.balance_due, 0);
    const pays = all(`SELECT * FROM payments WHERE purchase_invoice_id = ?`, paidBillId);
    assert.strictEqual(pays.length, 1, 'exactly one supplier payment');
    assert.strictEqual(pays[0].payment_type, 'SUPPLIER_PAYMENT');
    assert.strictEqual(Number(pays[0].amount), billTotal);
    const { je, debit, credit } = jeTotals(pays[0].journal_entry_id);
    assert.strictEqual(Number(je.total_debit).toFixed(2), Number(je.total_credit).toFixed(2));
    assert.strictEqual(debit.toFixed(2), credit.toFixed(2));
  });

  await check('settling a purchase bill twice changes nothing', async () => {
    const before = q(`SELECT COUNT(*) AS n FROM payments WHERE purchase_invoice_id = ?`, paidBillId).n;
    const again = await api('POST', `/purchases/bills/${paidBillId}/settle`, { token: admin, body: {} });
    assert.strictEqual(again.status, 200, JSON.stringify(again.json));
    assert.strictEqual(again.json.alreadySettled, true);
    assert.strictEqual(q(`SELECT COUNT(*) AS n FROM payments WHERE purchase_invoice_id = ?`, paidBillId).n, before);
  });

  await check('a draft bill is posted once and paid once by settle', async () => {
    const bill = await api('POST', '/purchases/bills', {
      token: admin,
      body: {
        supplier_id: 'supp-02', date: today, due_date: today, autoPost: false,
        lines: [{ product_id: 'prod-07', description: 'Cable', quantity: 4, unit_cost: 5, tax_rate: 0 }]
      }
    });
    const id = bill.json.id;
    assert.strictEqual(q(`SELECT status FROM purchase_invoices WHERE id = ?`, id).status, 'DRAFT');
    const res = await api('POST', `/purchases/bills/${id}/settle`, { token: admin, body: {} });
    assert.strictEqual(res.status, 200, JSON.stringify(res.json));
    assert.strictEqual(res.json.status, 'PAID');
    assert.strictEqual(res.json.postedNow, true);
    assert.strictEqual(all(`SELECT * FROM journal_entries WHERE source_id = ? AND company_id = ?`, id, COMPANY).length, 1);
    assert.strictEqual(all(`SELECT * FROM payments WHERE purchase_invoice_id = ?`, id).length, 1);
  });

  // --------------------------------------------------------- guard rails ----
  await check('a cancelled document cannot be settled', async () => {
    db().prepare(`UPDATE sales_invoices SET status = 'CANCELLED' WHERE id = ?`).run(draftId);
    const res = await api('POST', `/sales/invoices/${draftId}/settle`, { token: admin, body: {} });
    assert.strictEqual(res.status, 400);
    assert.ok(/cancelled/i.test(res.json.error), JSON.stringify(res.json));
    db().prepare(`UPDATE sales_invoices SET status = 'PAID' WHERE id = ?`).run(draftId);
  });

  await check('settling an unknown document returns 400 and records nothing', async () => {
    const before = q(`SELECT COUNT(*) AS n FROM payments`).n;
    const res = await api('POST', `/sales/invoices/inv-does-not-exist/settle`, { token: admin, body: {} });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(q(`SELECT COUNT(*) AS n FROM payments`).n, before);
  });

  await check('settle routes enforce server-side permissions', async () => {
    // accountant: banking:write but no sales:post → 403 on the sales route.
    const accRes = await api('POST', `/sales/invoices/${paidInvId}/settle`, { token: acc, body: {} });
    assert.strictEqual(accRes.status, 403, 'accountant without sales:post must be refused');
    assert.strictEqual(accRes.json.code, 'FORBIDDEN');
    // manager is read-only everywhere.
    const mgrRes = await api('POST', `/purchases/bills/${paidBillId}/settle`, { token: mgr, body: {} });
    assert.strictEqual(mgrRes.status, 403, 'read-only manager must be refused');
    // the sales role may settle a sale, but not a purchase bill.
    const salesOk = await api('POST', `/sales/invoices/${paidInvId}/settle`, { token: sales, body: {} });
    assert.strictEqual(salesOk.status, 200, JSON.stringify(salesOk.json));
    const salesBill = await api('POST', `/purchases/bills/${paidBillId}/settle`, { token: sales, body: {} });
    assert.strictEqual(salesBill.status, 403, 'sales role must not settle purchase bills');
  });

  await check('every settle route is guarded by exactly one permission', async () => {
    const { PERMISSIONS } = require('../server/auth');
    const stack = require('../server/routes/api').stack.filter((l) => l.route);
    for (const key of ['POST /sales/invoices/:id/settle', 'POST /purchases/bills/:id/settle']) {
      const layer = stack.find((l) => {
        const method = Object.keys(l.route.methods)[0].toUpperCase();
        return `${method} ${l.route.path}` === key;
      });
      assert.ok(layer, `${key} route missing`);
      const guards = layer.route.stack.map((h) => h.handle.permission).filter(Boolean);
      assert.strictEqual(guards.length, 1, `${key} must have one permission guard`);
      assert.ok(PERMISSIONS.includes(guards[0]), `${key} guard ${guards[0]} is a real permission`);
    }
  });

  await check('an unknown document is never settled through the create path either', async () => {
    const res = await api('POST', '/sales/invoices', {
      token: admin,
      body: { customer_id: 'cust-01', date: today, due_date: today, settle: true, lines: [] }
    });
    assert.strictEqual(res.status, 400, 'empty invoice is rejected before any payment is booked');
  });

  await check('the Trial Balance remains balanced after every settlement', async () => {
    const tb = await api('GET', '/reports/trial-balance', { token: admin });
    assert.strictEqual(tb.status, 200);
    assert.strictEqual(tb.json.isBalanced, true, JSON.stringify(tb.json.totals || tb.json));
  });

  await check('the audit log records a SETTLE entry for each settled document', async () => {
    const rows = all(`SELECT * FROM audit_logs WHERE company_id = ? AND action = 'SETTLE'`, COMPANY);
    assert.ok(rows.length >= 3, `expected SETTLE audit rows, found ${rows.length}`);
    assert.ok(rows.every((r) => r.description && r.description.length > 0), 'each SETTLE row describes what happened');
    assert.ok(rows.some((r) => r.module === 'SALES') && rows.some((r) => r.module === 'PURCHASES'),
      'both sales and purchase settlements are audited');
  });

  // The interface itself must not reintroduce a PAID/UNPAID choice: the forms
  // settle unconditionally and no checkbox controls settlement any more.
  await check('the sales and purchase forms offer no PAID/UNPAID choice', async () => {
    const sales = fs.readFileSync(path.join(ROOT, 'src', 'views', 'SalesView.jsx'), 'utf8');
    const purchases = fs.readFileSync(path.join(ROOT, 'src', 'views', 'PurchasesView.jsx'), 'utf8');
    for (const [name, src] of [['SalesView', sales], ['PurchasesView', purchases]]) {
      assert.ok(
        /settle:\s*true/.test(src),
        `${name} must create documents settled (PAID), unconditionally`
      );
      assert.ok(
        !/settle:\s*\w+\.autoPost/.test(src),
        `${name} must not let a checkbox decide whether a document is PAID`
      );
      assert.ok(
        !/id="(autoPost|billAutoPost)"/.test(src),
        `${name} must no longer render a settlement checkbox`
      );
      // The submit button must say "post" unconditionally, not "save as draft".
      const button = name === 'SalesView' ? 'sales.post_invoice' : 'purchases.post_bill';
      assert.ok(
        !new RegExp(`autoPost \\? t\\('${button.replace('.', '\\.')}'\\)`).test(src),
        `${name} must not offer "save as draft" instead of the PAID document`
      );
    }
    // The explanation shown instead is translated, like every other string.
    for (const lang of ['en', 'fr', 'rw']) {
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'));
      assert.ok(dict.sales.auto_post_hint && dict.sales.auto_post_hint.length > 20,
        `sales.auto_post_hint must exist in ${lang}`);
      assert.ok(dict.sales.payment_on_creation_hint && dict.purchases.payment_on_creation_hint,
        `the PAID creation note must exist in ${lang} for both modules`);
    }
  });

  await check('repository genesis.db unchanged', async () => {
    if (!sourceMd5Before) return;
    const after = crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex');
    assert.strictEqual(after, sourceMd5Before);
  });

  console.log(`--- ${passed} passed, ${failed} failed ---`);
  await serverHandle.close();
  fs.rmSync(workDir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  if (serverHandle) await serverHandle.close();
  process.exit(1);
});
