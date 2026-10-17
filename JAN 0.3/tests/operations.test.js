'use strict';
/**
 * OPERATIONS TESTS — walk-in sales, returns/refunds/corrections, multiple
 * stores & transfers, goods receipts, physical-count approval workflow,
 * cash reconciliation, multi-currency and role-based authorization.
 *
 * Runs against a temporary COPY of the demo database (the repository
 * genesis.db is never opened for writing) with a real HTTP server so every
 * assertion goes through the same permission guards as the UI.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-ops-'));
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
    console.log(`  ✓ ${name}`);
  }).catch((err) => {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  });
}

const db = () => getDb();
const COMPANY = 'comp-genesis-01';
const PASSWORD = 'Ops-Test-Password-2026';

function insertUser(id, username, role) {
  db().prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 1, datetime('now'), 0)`).run(id, username, hashPassword(PASSWORD), username, role, COMPANY);
}

async function tokenFor(username) {
  const r = await api('POST', '/auth/login', { body: { username, password: PASSWORD } });
  assert.strictEqual(r.status, 200, `login ${username}: ${JSON.stringify(r.json)}`);
  return r.json.token;
}

function q(sql, ...params) { return db().prepare(sql).get(...params); }
function qAll(sql, ...params) { return db().prepare(sql).all(...params); }

function trialBalanceBalanced(token) {
  return api('GET', '/reports/trial-balance', { token }).then((r) => {
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.isBalanced, true, 'Trial Balance must stay balanced');
  });
}

async function main() {
  const started = await startServer({ port: 0, host: '127.0.0.1' });
  serverHandle = started;
  base = `http://127.0.0.1:${started.port}`;

  insertUser('usr-t-admin', 't.admin', 'admin');
  insertUser('usr-t-officer', 't.officer', 'inventory');       // Inventory Officer
  insertUser('usr-t-accountant', 't.accountant', 'accountant'); // authorized reviewer
  insertUser('usr-t-sales', 't.sales', 'sales');
  insertUser('usr-t-purchaser', 't.purchaser', 'purchases');
  insertUser('usr-t-manager', 't.manager', 'manager');

  const admin = await tokenFor('t.admin');
  const officer = await tokenFor('t.officer');
  const accountant = await tokenFor('t.accountant');
  const sales = await tokenFor('t.sales');
  const purchaser = await tokenFor('t.purchaser');
  const manager = await tokenFor('t.manager');

  console.log('--- OPERATIONS TESTS (stores, receipts, counts, cash, fx, walk-in, corrections) ---');

  // =========================================================================
  // A. WALK-IN SALES & RETURNS
  // =========================================================================
  let walkInInvoiceId = null;
  let walkInTotal = 0;

  await check('anonymous sale without customer and without walk-in flag is rejected', async () => {
    const r = await api('POST', '/sales/invoices', { token: sales, body: { lines: [{ product_id: 'prod-07', quantity: 1, unit_price: 34, tax_rate: 0 }], autoPost: true } });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /Customer is required/i);
  });

  await check('walk-in sale needs no customer name and settles immediately', async () => {
    const cashBefore = q(`SELECT current_balance FROM bank_accounts WHERE id = 'bank-02'`).current_balance;
    const stockBefore = q(`SELECT current_stock FROM products WHERE id = 'prod-07'`).current_stock;
    const r = await api('POST', '/sales/invoices', {
      token: sales,
      body: {
        walk_in: true, autoPost: true, payment_method: 'CASH', bank_account_id: 'bank-02',
        lines: [{ product_id: 'prod-07', description: 'A4 Paper', quantity: 2, unit_price: 34, tax_rate: 18 }]
      }
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    walkInInvoiceId = r.json.id;
    const inv = q(`SELECT * FROM sales_invoices WHERE id = ?`, walkInInvoiceId);
    walkInTotal = inv.total; // 68 + 18% = 80.24
    assert.strictEqual(inv.walk_in, 1);
    assert.strictEqual(inv.status, 'PAID', 'walk-in sale is paid immediately');
    assert.strictEqual(inv.balance_due, 0);
    const cust = q(`SELECT * FROM customers WHERE id = ?`, inv.customer_id);
    assert.strictEqual(cust.is_walk_in, 1, 'the anonymous walk-in customer is used');
    assert.strictEqual(cust.current_balance, 0, 'walk-in sales never leave a receivable');
    assert.ok(q(`SELECT current_balance FROM bank_accounts WHERE id = 'bank-02'`).current_balance >= cashBefore + walkInTotal - 0.01, 'cash account received the money');
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-07'`).current_stock, stockBefore - 2);
    const pay = q(`SELECT * FROM payments WHERE sales_invoice_id = ?`, walkInInvoiceId);
    assert.ok(pay, 'settlement payment recorded');
    assert.strictEqual(pay.status, 'POSTED');
  });

  await check('walk-in sale hides the placeholder from the customer list', async () => {
    const r = await api('GET', '/customers', { token: sales });
    assert.ok(!r.json.some((c) => c.is_walk_in === 1), 'walk-in customer not offered in pickers');
    const r2 = await api('GET', '/customers?include_walk_in=1', { token: admin });
    assert.ok(r2.json.some((c) => c.is_walk_in === 1));
  });

  await check('posting an invoice with insufficient stock is refused', async () => {
    const stock = q(`SELECT current_stock FROM products WHERE id = 'prod-05'`).current_stock;
    const r = await api('POST', '/sales/invoices', {
      token: sales,
      body: { customer_id: 'cust-01', autoPost: true, lines: [{ product_id: 'prod-05', quantity: stock + 100, unit_price: 490, tax_rate: 0 }] }
    });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /Insufficient stock/);
  });

  await check('searchable sales history: text, status, walk-in and date filters', async () => {
    const byNumber = await api('GET', '/sales/invoices?q=INV-2026', { token: sales });
    assert.ok(byNumber.json.length > 0);
    const walkIns = await api('GET', '/sales/invoices?walk_in=1', { token: sales });
    assert.ok(walkIns.json.every((i) => i.walk_in === 1) && walkIns.json.length >= 1);
    const none = await api('GET', '/sales/invoices?q=NO-SUCH-INVOICE-XYZ', { token: sales });
    assert.strictEqual(none.json.length, 0);
  });

  let creditNoteId = null;
  await check('partial sales return via credit note restocks and credits the customer', async () => {
    const stockBefore = q(`SELECT current_stock FROM products WHERE id = 'prod-07'`).current_stock;
    const r = await api('POST', '/sales/credit-notes', {
      token: sales,
      body: {
        invoiceId: walkInInvoiceId, customerId: q(`SELECT customer_id FROM sales_invoices WHERE id = ?`, walkInInvoiceId).customer_id,
        reason: 'Damaged in transit', restockItems: 1,
        lines: [{ productId: 'prod-07', description: 'A4 Paper', quantity: 1, unitPrice: 34, taxRate: 18 }]
      }
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    creditNoteId = r.json.creditNoteId;
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-07'`).current_stock, stockBefore + 1, 'stock restored');
    const wi = q(`SELECT current_balance FROM customers WHERE is_walk_in = 1 AND company_id = ?`, COMPANY);
    assert.ok(wi.current_balance <= -r.json.total + 0.01, 'credit balance recorded for the refund');
  });

  await check('over-return (more than invoiced) is blocked', async () => {
    const r = await api('POST', '/sales/credit-notes', {
      token: sales,
      body: {
        invoiceId: walkInInvoiceId, customerId: q(`SELECT customer_id FROM sales_invoices WHERE id = ?`, walkInInvoiceId).customer_id,
        reason: 'Too much', lines: [{ productId: 'prod-07', quantity: 5, unitPrice: 34, taxRate: 18 }]
      }
    });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /exceeds the still-returnable quantity/);
  });

  await check('duplicate return beyond the invoice total is blocked', async () => {
    const custId = q(`SELECT customer_id FROM sales_invoices WHERE id = ?`, walkInInvoiceId).customer_id;
    const r = await api('POST', '/sales/credit-notes', {
      token: sales,
      body: { invoiceId: walkInInvoiceId, customerId: custId, reason: 'Remaining', lines: [{ productId: 'prod-07', quantity: 1, unitPrice: 34, taxRate: 18 }] }
    });
    assert.strictEqual(r.status, 200, 'the second (still-remaining) unit may be returned');
    const dup = await api('POST', '/sales/credit-notes', {
      token: sales,
      body: { invoiceId: walkInInvoiceId, customerId: custId, reason: 'Duplicate', lines: [{ productId: 'prod-07', quantity: 1, unitPrice: 34, taxRate: 18 }] }
    });
    assert.strictEqual(dup.status, 400);
    assert.match(dup.json.error, /fully credited|exceeds/i);
  });

  await check('customer refund pays the credit balance out of cash', async () => {
    const wi = q(`SELECT * FROM customers WHERE is_walk_in = 1 AND company_id = ?`, COMPANY);
    const owed = Math.abs(wi.current_balance);
    assert.ok(owed > 0);
    const cashBefore = q(`SELECT current_balance FROM bank_accounts WHERE id = 'bank-02'`).current_balance;
    const r = await api('POST', '/payments', {
      token: accountant,
      body: { paymentType: 'CUSTOMER_REFUND', paymentMethod: 'CASH', bankAccountId: 'bank-02', customerId: wi.id, creditNoteId, amount: owed, reference: 'Walk-in refund' }
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(Math.abs(q(`SELECT current_balance FROM customers WHERE id = ?`, wi.id).current_balance) < 0.01, 'credit settled');
    assert.ok(Math.abs(q(`SELECT current_balance FROM bank_accounts WHERE id = 'bank-02'`).current_balance - (cashBefore - owed)) < 0.01, 'cash paid out');
  });

  await check('receipt correction: reversing a payment restores every balance and audits', async () => {
    // credit sale → receipt → reversal
    const inv = await api('POST', '/sales/invoices', {
      token: sales,
      body: { customer_id: 'cust-02', lines: [{ product_id: 'prod-04', quantity: 1, unit_price: 185, tax_rate: 0 }], autoPost: true }
    });
    assert.strictEqual(inv.status, 200);
    const balBefore = q(`SELECT current_balance FROM customers WHERE id = 'cust-02'`).current_balance;
    const pay = await api('POST', '/payments', {
      token: accountant,
      body: { paymentType: 'CUSTOMER_RECEIPT', paymentMethod: 'BANK_TRANSFER', bankAccountId: 'bank-01', customerId: 'cust-02', salesInvoiceId: inv.json.id, amount: 185 }
    });
    assert.strictEqual(pay.status, 200);
    const balAfterReceipt = q(`SELECT current_balance FROM customers WHERE id = 'cust-02'`).current_balance;
    assert.ok(Math.abs(balAfterReceipt - (balBefore - 185)) < 0.01, 'receipt reduced the customer balance');
    const jeCountBefore = q(`SELECT COUNT(*) AS n FROM journal_entries`).n;
    const rev = await api('POST', `/payments/${pay.json.paymentId}/reverse`, { token: accountant, body: { reason: 'Recorded against the wrong invoice' } });
    assert.strictEqual(rev.status, 200, JSON.stringify(rev.json));
    assert.ok(Math.abs(q(`SELECT current_balance FROM customers WHERE id = 'cust-02'`).current_balance - balBefore) < 0.01, 'reversal restored the customer balance');
    assert.strictEqual(q(`SELECT status FROM payments WHERE id = ?`, pay.json.paymentId).status, 'REVERSED');
    assert.strictEqual(q(`SELECT status FROM sales_invoices WHERE id = ?`, inv.json.id).status, 'POSTED', 'invoice back to unpaid');
    assert.strictEqual(q(`SELECT amount_paid FROM sales_invoices WHERE id = ?`, inv.json.id).amount_paid, 0);
    assert.strictEqual(q(`SELECT COUNT(*) AS n FROM journal_entries`).n, jeCountBefore + 1, 'a REVERSAL journal entry was created');
    assert.ok(q(`SELECT COUNT(*) AS n FROM journal_entries WHERE source_type = 'REVERSAL'`).n >= 1);
    const twice = await api('POST', `/payments/${pay.json.paymentId}/reverse`, { token: accountant, body: { reason: 'again' } });
    assert.strictEqual(twice.status, 400, 'double reversal blocked');
  });

  // =========================================================================
  // B. MULTIPLE STORES & TRANSFERS
  // =========================================================================
  await check('stores can be created by the Inventory Officer and admin, not by sales', async () => {
    const denied = await api('POST', '/inventory/warehouses', { token: sales, body: { code: 'WH-X', name: 'Denied' } });
    assert.strictEqual(denied.status, 403);
    const r = await api('POST', '/inventory/warehouses', { token: officer, body: { code: 'WH-2', name: 'Remera Branch Store', address: 'Remera, Kigali' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const dup = await api('POST', '/inventory/warehouses', { token: admin, body: { code: 'WH-2', name: 'Duplicate code' } });
    assert.strictEqual(dup.status, 400, 'duplicate store code rejected');
  });

  let wh2 = null;
  await check('stock levels are tracked per store with a consolidated company total', async () => {
    wh2 = q(`SELECT id FROM warehouses WHERE company_id = ? AND code = 'WH-2'`, COMPANY).id;
    const r = await api('GET', '/inventory/stock-levels?product_id=prod-01', { token: officer });
    assert.strictEqual(r.status, 200);
    const main = r.json.stores.find((s) => s.code === 'WH-MAIN');
    assert.ok(main && main.quantity === r.json.companyStock, 'single store mirrors the company total before transfers');
  });

  let transferId = null;
  await check('inter-store transfer: dispatch keeps company inventory intact (in transit)', async () => {
    const companyBefore = q(`SELECT current_stock FROM products WHERE id = 'prod-01'`).current_stock;
    const create = await api('POST', '/inventory/transfers', {
      token: officer,
      body: { fromWarehouseId: q(`SELECT id FROM warehouses WHERE company_id = ? AND code = 'WH-MAIN'`, COMPANY).id, toWarehouseId: wh2, lines: [{ productId: 'prod-01', quantity: 5 }] }
    });
    assert.strictEqual(create.status, 200, JSON.stringify(create.json));
    transferId = create.json.transferId;
    const dispatch = await api('POST', `/inventory/transfers/${transferId}/dispatch`, { token: officer });
    assert.strictEqual(dispatch.status, 200);
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-01'`).current_stock, companyBefore, 'company-wide stock unchanged while in transit');
    const levels = await api('GET', '/inventory/stock-levels?product_id=prod-01', { token: officer });
    const main = levels.json.stores.find((s) => s.code === 'WH-MAIN');
    const branch = levels.json.stores.find((s) => s.code === 'WH-2');
    assert.strictEqual(main.quantity, companyBefore - 5);
    assert.strictEqual(branch.quantity, 0, 'not yet received');
    const again = await api('POST', `/inventory/transfers/${transferId}/dispatch`, { token: officer });
    assert.strictEqual(again.status, 400, 'double dispatch blocked');
  });

  await check('partial receipt then completion moves stock between stores only', async () => {
    const companyBefore = q(`SELECT current_stock FROM products WHERE id = 'prod-01'`).current_stock;
    const t = await api('GET', `/inventory/transfers/${transferId}`, { token: officer });
    const lineId = t.json.lines[0].id;
    const part = await api('POST', `/inventory/transfers/${transferId}/receive`, { token: officer, body: { lines: { [lineId]: 3 } } });
    assert.strictEqual(part.status, 200);
    assert.strictEqual(part.json.status, 'DISPATCHED', 'still in transit after partial receipt');
    let levels = await api('GET', '/inventory/stock-levels?product_id=prod-01', { token: officer });
    assert.strictEqual(levels.json.stores.find((s) => s.code === 'WH-2').quantity, 3);
    const over = await api('POST', `/inventory/transfers/${transferId}/receive`, { token: officer, body: { lines: { [lineId]: 10 } } });
    assert.strictEqual(over.status, 400, 'over-receipt blocked');
    const rest = await api('POST', `/inventory/transfers/${transferId}/receive`, { token: officer, body: { lines: { [lineId]: 2 } } });
    assert.strictEqual(rest.json.status, 'COMPLETED');
    levels = await api('GET', '/inventory/stock-levels?product_id=prod-01', { token: officer });
    assert.strictEqual(levels.json.companyStock, companyBefore, 'transfers never create or destroy company inventory');
    assert.strictEqual(levels.json.stores.find((s) => s.code === 'WH-2').quantity, 5);
    const moves = qAll(`SELECT * FROM inventory_movements WHERE reference_id = ?`, transferId);
    assert.ok(moves.length >= 3, 'dispatch and receipt movements recorded per store');
    assert.ok(moves.every((m) => m.warehouse_id), 'movements carry their warehouse');
  });

  await check('transfers respect store stock and cannot target the same store', async () => {
    const mainId = q(`SELECT id FROM warehouses WHERE company_id = ? AND code = 'WH-MAIN'`, COMPANY).id;
    const same = await api('POST', '/inventory/transfers', { token: officer, body: { fromWarehouseId: mainId, toWarehouseId: mainId, lines: [{ productId: 'prod-01', quantity: 1 }] } });
    assert.strictEqual(same.status, 400);
    const big = await api('POST', '/inventory/transfers', { token: officer, body: { fromWarehouseId: wh2, toWarehouseId: mainId, lines: [{ productId: 'prod-01', quantity: 99999 }] } });
    assert.strictEqual(big.status, 400);
    assert.match(big.json.error, /Insufficient stock/);
    const denied = await api('POST', '/inventory/transfers', { token: sales, body: { fromWarehouseId: wh2, toWarehouseId: mainId, lines: [{ productId: 'prod-01', quantity: 1 }] } });
    assert.strictEqual(denied.status, 403, 'sales role cannot move stock between stores');
  });

  await check('product search works by code and by name', async () => {
    const bySku = await api('GET', '/products?search=LAP-DELL-15', { token: officer });
    assert.strictEqual(bySku.json.length, 1);
    const byName = await api('GET', '/products?search=EliteBook', { token: officer });
    assert.strictEqual(byName.json.length, 1);
    const byBarcode = await api('GET', '/products?search=BAR-MON-SAM-27', { token: officer });
    assert.strictEqual(byBarcode.json.length, 1);
  });

  // =========================================================================
  // C. GOODS RECEIPTS (stock increases ONLY on receipt)
  // =========================================================================
  let poId = null;
  let grnId = null;
  await check('creating a product, a PO or a draft bill never increases stock', async () => {
    const np = await api('POST', '/products', { token: officer, body: { sku: 'TST-MOUSE-01', name: 'Test Mouse', category: 'Accessories', type: 'GOODS', unit: 'pcs', cost_price: 10, selling_price: 20, tax_rate_id: null } });
    assert.ok(np.status === 200 || np.status === 201, JSON.stringify(np.json));
    const stock0 = q(`SELECT current_stock FROM products WHERE sku = 'TST-MOUSE-01'`).current_stock;
    assert.strictEqual(stock0, 0, 'a new product starts at zero stock');

    const po = await api('POST', '/purchases/orders', {
      token: purchaser,
      body: { supplier_id: 'supp-01', lines: [{ product_id: 'prod-03', quantity: 10, unit_cost: 140, tax_rate: 0 }] }
    });
    assert.strictEqual(po.status, 200, JSON.stringify(po.json));
    poId = po.json.id;
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-03'`).current_stock, 15, 'PO does not touch stock');

    const bill = await api('POST', '/purchases/bills', {
      token: purchaser,
      body: { supplier_id: 'supp-01', lines: [{ product_id: 'prod-03', quantity: 6, unit_cost: 140, tax_rate: 0 }] }
    });
    assert.strictEqual(bill.status, 200);
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-03'`).current_stock, 15, 'a DRAFT bill does not touch stock');
  });

  await check('goods receipt posts stock in with Dr Inventory / Cr GRNI', async () => {
    const grn = await api('POST', '/purchases/receipts', {
      token: purchaser,
      body: { purchaseOrderId: poId, supplierId: 'supp-01', lines: [{ productId: 'prod-03', quantity: 6 }] }
    });
    assert.strictEqual(grn.status, 200, JSON.stringify(grn.json));
    grnId = grn.json.receiptId;
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-03'`).current_stock, 15, 'draft receipt has not posted yet');
    const post = await api('POST', `/purchases/receipts/${grnId}/post`, { token: purchaser });
    assert.strictEqual(post.status, 200, JSON.stringify(post.json));
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-03'`).current_stock, 21, 'stock increased on receipt');
    const je = q(`SELECT * FROM journal_entries WHERE id = ?`, post.json.journalEntryId);
    const jeLines = qAll(`SELECT l.*, a.code FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = ?`, je.id);
    assert.ok(jeLines.find((l) => l.code === '1200' && l.debit === 840), 'Dr Inventory 840');
    assert.ok(jeLines.find((l) => l.code === '2120' && l.credit === 840), 'Cr GRNI 840');
    const poRow = q(`SELECT * FROM purchase_orders WHERE id = ?`, poId);
    assert.strictEqual(poRow.status, 'PARTIALLY_RECEIVED');
  });

  await check('over-receipt against the PO is blocked', async () => {
    const r = await api('POST', '/purchases/receipts', {
      token: purchaser,
      body: { purchaseOrderId: poId, supplierId: 'supp-01', lines: [{ productId: 'prod-03', quantity: 9 }] }
    });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /exceeds purchase order quantity/i);
  });

  await check('supplier invoice linked to the receipt clears GRNI without double stock', async () => {
    const supplierBefore = q(`SELECT current_balance FROM suppliers WHERE id = 'supp-01'`).current_balance;
    const bill = await api('POST', '/purchases/bills', {
      token: purchaser,
      body: { supplier_id: 'supp-01', goods_receipt_id: grnId, lines: [{ product_id: 'prod-03', quantity: 6, unit_cost: 140, tax_rate: 0 }], autoPost: true }
    });
    assert.strictEqual(bill.status, 200, JSON.stringify(bill.json));
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-03'`).current_stock, 21, 'stock NOT increased twice');
    const jeLines = qAll(`
      SELECT l.*, a.code FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id
      WHERE l.journal_entry_id = (SELECT journal_entry_id FROM purchase_invoices WHERE id = ?)`, bill.json.id);
    assert.ok(jeLines.find((l) => l.code === '2120' && l.debit === 840), 'Dr GRNI clears the receipt liability');
    assert.ok(jeLines.find((l) => l.code === '2010' && l.credit === 840), 'Cr Accounts Payable');
    assert.ok(!jeLines.find((l) => l.code === '1200'), 'inventory is not debited again');
    assert.strictEqual(q(`SELECT current_balance FROM suppliers WHERE id = 'supp-01'`).current_balance, supplierBefore + 840);
  });

  await check('strict receiving policy: bills need a posted receipt when the company requires it', async () => {
    const current = await api('GET', '/companies/current', { token: admin });
    const upd = await api('PUT', '/companies/current', { token: admin, body: { ...current.json, require_goods_receipt: true } });
    assert.strictEqual(upd.status, 200, JSON.stringify(upd.json));
    const bill = await api('POST', '/purchases/bills', {
      token: purchaser,
      body: { supplier_id: 'supp-02', lines: [{ product_id: 'prod-07', quantity: 5, unit_cost: 22, tax_rate: 0 }], autoPost: true }
    });
    assert.strictEqual(bill.status, 400);
    assert.match(bill.json.error, /requires a posted goods receipt/i);
    const back = await api('PUT', '/companies/current', { token: admin, body: { ...current.json, require_goods_receipt: false } });
    assert.strictEqual(back.status, 200);
  });

  // =========================================================================
  // D. PHYSICAL COUNT WORKFLOW (Inventory Officer + independent approval)
  // =========================================================================
  let countId = null;
  await check('officer drafts and submits a count; direct one-shot posting is not their path', async () => {
    const deniedDirect = await api('POST', '/inventory/counts', {
      token: officer,
      body: { lines: [{ productId: 'prod-04', countedQty: 1 }] }
    });
    assert.strictEqual(deniedDirect.status, 403, 'officers cannot post counts directly');
    const stockBeforeDraft = q(`SELECT current_stock FROM products WHERE id = 'prod-04'`).current_stock;
    const sysQty = q(`SELECT quantity FROM stock_levels sl JOIN warehouses w ON w.id = sl.warehouse_id WHERE sl.product_id = 'prod-04' AND w.code = 'WH-MAIN'`).quantity;
    const draft = await api('POST', '/inventory/counts/draft', {
      token: officer,
      body: { location: 'Main Store', lines: [{ productId: 'prod-04', countedQty: sysQty - 2, varianceReason: 'DAMAGED', notes: 'Two screens cracked' }] }
    });
    assert.strictEqual(draft.status, 200, JSON.stringify(draft.json));
    countId = draft.json.countId;
    const row = q(`SELECT * FROM physical_inventory_counts WHERE id = ?`, countId);
    assert.strictEqual(row.status, 'DRAFT');
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-04'`).current_stock, stockBeforeDraft, 'draft changes no stock');
    const submit = await api('POST', `/inventory/counts/${countId}/submit`, { token: officer });
    assert.strictEqual(submit.status, 200);
    assert.strictEqual(q(`SELECT status FROM physical_inventory_counts WHERE id = ?`, countId).status, 'SUBMITTED');
  });

  await check('the submitter cannot approve their own count', async () => {
    const selfApprove = await api('POST', `/inventory/counts/${countId}/approve`, { token: officer });
    assert.strictEqual(selfApprove.status, 403, 'officer holds no approve permission at all');
    // an admin who submitted would also be blocked by the engine guard:
    insertUser('usr-t-admin2', 't.admin2', 'admin');
    const admin2 = await tokenFor('t.admin2');
    db().prepare(`UPDATE physical_inventory_counts SET submitted_by = 'usr-t-admin2' WHERE id = ?`).run(countId);
    const ownSubmission = await api('POST', `/inventory/counts/${countId}/approve`, { token: admin2 });
    assert.strictEqual(ownSubmission.status, 400);
    assert.match(ownSubmission.json.error, /cannot approve a count that you created or submitted/i);
    db().prepare(`UPDATE physical_inventory_counts SET submitted_by = 'usr-t-officer' WHERE id = ?`).run(countId);
  });

  await check('independent reviewer approves and posts; stock and GL follow the count', async () => {
    const approve = await api('POST', `/inventory/counts/${countId}/approve`, { token: accountant });
    assert.strictEqual(approve.status, 200, JSON.stringify(approve.json));
    const counted = q(`SELECT counted_qty FROM physical_inventory_lines WHERE count_id = ?`, countId).counted_qty;
    const post = await api('POST', `/inventory/counts/${countId}/post`, { token: accountant });
    assert.strictEqual(post.status, 200, JSON.stringify(post.json));
    assert.strictEqual(q(`SELECT current_stock FROM products WHERE id = 'prod-04'`).current_stock, counted, 'stock follows the approved count');
    assert.strictEqual(q(`SELECT quantity FROM stock_levels sl JOIN warehouses w ON w.id = sl.warehouse_id WHERE sl.product_id = 'prod-04' AND w.code = 'WH-MAIN'`).quantity, counted, 'store level follows too');
    const row = q(`SELECT * FROM physical_inventory_counts WHERE id = ?`, countId);
    assert.strictEqual(row.status, 'POSTED');
    assert.strictEqual(row.created_by, 'usr-t-officer', 'counter recorded');
    assert.strictEqual(row.submitted_by, 'usr-t-officer');
    assert.strictEqual(row.approved_by, 'usr-t-accountant', 'approver recorded');
    assert.ok(row.approved_at && row.journal_entry_id);
    const line = q(`SELECT * FROM physical_inventory_lines WHERE count_id = ?`, countId);
    assert.strictEqual(line.variance_reason, 'DAMAGED');
    const audits = qAll(`SELECT * FROM audit_logs WHERE record_id = ?`, countId);
    assert.ok(audits.length >= 3, 'audit trail covers create/submit/approve/post');
  });

  await check('rejection returns the count to the officer', async () => {
    const draft = await api('POST', '/inventory/counts/draft', { token: officer, body: { lines: [{ productId: 'prod-06', countedQty: 12 }] } });
    const id = draft.json.countId;
    await api('POST', `/inventory/counts/${id}/submit`, { token: officer });
    const noReason = await api('POST', `/inventory/counts/${id}/reject`, { token: accountant, body: {} });
    assert.strictEqual(noReason.status, 400, 'rejection needs a reason');
    const rej = await api('POST', `/inventory/counts/${id}/reject`, { token: accountant, body: { reason: 'Recount the UPS units, the sheet was unsigned' } });
    assert.strictEqual(rej.status, 200);
    assert.strictEqual(q(`SELECT status FROM physical_inventory_counts WHERE id = ?`, id).status, 'REJECTED');
    const revise = await api('PUT', `/inventory/counts/${id}`, { token: officer, body: { lines: [{ productId: 'prod-06', countedQty: 11 }] } });
    assert.strictEqual(revise.status, 200, 'rejected counts can be revised');
    assert.strictEqual(q(`SELECT status FROM physical_inventory_counts WHERE id = ?`, id).status, 'DRAFT');
  });

  await check('financial reports stay protected from the Inventory Officer', async () => {
    const tb = await api('GET', '/reports/trial-balance', { token: officer });
    assert.strictEqual(tb.status, 403);
    const pl = await api('GET', '/reports/profit-loss', { token: officer });
    assert.strictEqual(pl.status, 403);
    const okForAccountant = await api('GET', '/reports/trial-balance', { token: accountant });
    assert.strictEqual(okForAccountant.status, 200);
  });

  // =========================================================================
  // E. CASH COUNTING & RECONCILIATION
  // =========================================================================
  let cashSessionId = null;
  await check('cash register opens with a denomination count; only one open session', async () => {
    const wrongType = await api('POST', '/banking/cash-sessions/open', { token: accountant, body: { bankAccountId: 'bank-01', countLines: [{ denomination: '100', unitValue: 100, quantity: 1 }] } });
    assert.strictEqual(wrongType.status, 400, 'sessions only on CASH accounts');
    const open = await api('POST', '/banking/cash-sessions/open', {
      token: accountant,
      body: { bankAccountId: 'bank-02', countLines: [{ denomination: '100', unitValue: 100, quantity: 2 }, { denomination: '20', unitValue: 20, quantity: 5 }] }
    });
    assert.strictEqual(open.status, 200, JSON.stringify(open.json));
    cashSessionId = open.json.sessionId;
    assert.strictEqual(open.json.openingAmount, 300);
    const second = await api('POST', '/banking/cash-sessions/open', { token: accountant, body: { bankAccountId: 'bank-02', countLines: [{ denomination: '100', unitValue: 100, quantity: 1 }] } });
    assert.strictEqual(second.status, 400, 'a second open session is refused');
    const denied = await api('POST', '/banking/cash-sessions/open', { token: sales, body: { bankAccountId: 'bank-02', countLines: [{ denomination: '100', unitValue: 100, quantity: 1 }] } });
    assert.strictEqual(denied.status, 403, 'sales cannot count cash');
  });

  await check('expected vs actual: receipts count in, discrepancies need an explanation', async () => {
    // a 100 cash receipt during the session
    const receipt = await api('POST', '/payments', {
      token: accountant,
      body: { paymentType: 'CUSTOMER_RECEIPT', paymentMethod: 'CASH', bankAccountId: 'bank-02', customerId: 'cust-03', amount: 100, date: new Date().toISOString().split('T')[0] }
    });
    assert.strictEqual(receipt.status, 200);
    const mid = await api('GET', `/banking/cash-sessions/${cashSessionId}`, { token: accountant });
    assert.strictEqual(mid.json.expected_now, 400, 'opening 300 + receipts 100');

    const jeBefore = q(`SELECT COUNT(*) AS n FROM journal_entries`).n;
    const noExpl = await api('POST', `/banking/cash-sessions/${cashSessionId}/close`, {
      token: accountant,
      body: { countLines: [{ denomination: '100', unitValue: 100, quantity: 3 }, { denomination: '20', unitValue: 20, quantity: 4 }, { denomination: '5', unitValue: 5, quantity: 3 }] }
    });
    assert.strictEqual(noExpl.status, 400, 'variance without explanation refused');
    assert.match(noExpl.json.error, /explanation is required/i);

    const close = await api('POST', `/banking/cash-sessions/${cashSessionId}/close`, {
      token: accountant,
      body: {
        countLines: [{ denomination: '100', unitValue: 100, quantity: 3 }, { denomination: '20', unitValue: 20, quantity: 4 }, { denomination: '5', unitValue: 5, quantity: 3 }],
        explanation: 'One 5 USD note torn and removed from the till'
      }
    });
    assert.strictEqual(close.status, 200, JSON.stringify(close.json));
    assert.strictEqual(close.json.expectedAmount, 400);
    assert.strictEqual(close.json.countedAmount, 395);
    assert.strictEqual(close.json.varianceAmount, -5);
    assert.strictEqual(q(`SELECT COUNT(*) AS n FROM journal_entries`).n, jeBefore, 'a discrepancy NEVER adjusts the books automatically');
  });

  await check('cash reconciliation approval requires an independent approver', async () => {
    const selfApprove = await api('POST', `/banking/cash-sessions/${cashSessionId}/approve`, { token: accountant });
    assert.strictEqual(selfApprove.status, 400, 'the closer cannot approve their own session');
    assert.match(selfApprove.json.error, /independent approver/i);
    const approve = await api('POST', `/banking/cash-sessions/${cashSessionId}/approve`, { token: admin });
    assert.strictEqual(approve.status, 200);
    const row = q(`SELECT * FROM cash_sessions WHERE id = ?`, cashSessionId);
    assert.strictEqual(row.status, 'APPROVED');
    assert.strictEqual(row.closed_by, 'usr-t-accountant');
    assert.strictEqual(row.approved_by, 'usr-t-admin');
    assert.ok(row.explanation.includes('torn'));
  });

  // =========================================================================
  // F. MULTI-CURRENCY
  // =========================================================================
  await check('currencies carry their own decimal precision (JPY 0, BHD 3)', async () => {
    const denied = await api('POST', '/fx/currencies', { token: officer, body: { code: 'EUR', name: 'Euro' } });
    assert.strictEqual(denied.status, 403, 'officers cannot manage currencies');
    const bad = await api('POST', '/fx/currencies', { token: admin, body: { code: 'EU', name: 'Bad code' } });
    assert.strictEqual(bad.status, 400);
    for (const c of [{ code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 }, { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 }, { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', decimals: 3 }]) {
      const r = await api('POST', '/fx/currencies', { token: admin, body: c });
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    }
    const list = await api('GET', '/fx/currencies', { token: accountant });
    const jpy = list.json.find((c) => c.code === 'JPY');
    assert.strictEqual(jpy.decimals, 0);
    const usd = list.json.find((c) => c.code === 'USD');
    assert.strictEqual(usd.is_base, 1, 'the company base currency is registered');
  });

  await check('exchange rates are effective-dated and history is preserved', async () => {
    const r1 = await api('POST', '/fx/rates', { token: accountant, body: { fromCode: 'EUR', toCode: 'USD', rate: 1.10, effectiveDate: '2026-01-01' } });
    assert.strictEqual(r1.status, 200);
    const r2 = await api('POST', '/fx/rates', { token: accountant, body: { fromCode: 'EUR', toCode: 'USD', rate: 1.20, effectiveDate: '2026-06-01' } });
    assert.strictEqual(r2.status, 200);
    const march = await api('GET', '/fx/convert?amount=100&from=EUR&to=USD&date=2026-03-01', { token: accountant });
    assert.strictEqual(march.json.converted, 110, 'the January rate applies in March');
    const july = await api('GET', '/fx/convert?amount=100&from=EUR&to=USD&date=2026-07-01', { token: accountant });
    assert.strictEqual(july.json.converted, 120, 'the June rate applies in July');
    const marchAgain = await api('GET', '/fx/convert?amount=100&from=EUR&to=USD&date=2026-03-01', { token: accountant });
    assert.strictEqual(marchAgain.json.converted, 110, 'historic conversions do not drift when new rates are added');
    const noRate = await api('GET', '/fx/convert?amount=10&from=EUR&to=JPY&date=2026-03-01', { token: accountant });
    assert.strictEqual(noRate.status, 400, 'missing pairs are reported, never guessed');
  });

  await check('currency conversion respects target decimals (JPY 0, BHD 3)', async () => {
    await api('POST', '/fx/rates', { token: accountant, body: { fromCode: 'USD', toCode: 'JPY', rate: 157.32, effectiveDate: '2026-01-01' } });
    const jpy = await api('GET', '/fx/convert?amount=100.55&from=USD&to=JPY&date=2026-05-05', { token: accountant });
    assert.strictEqual(jpy.json.decimals, 0);
    assert.strictEqual(jpy.json.converted, Math.round(100.55 * 157.32), 'JPY amounts round to whole yen');
    await api('POST', '/fx/rates', { token: accountant, body: { fromCode: 'USD', toCode: 'BHD', rate: 0.376, effectiveDate: '2026-01-01' } });
    const bhd = await api('GET', '/fx/convert?amount=100&from=USD&to=BHD&date=2026-05-05', { token: accountant });
    assert.strictEqual(bhd.json.decimals, 3);
    assert.strictEqual(bhd.json.converted, 37.6);
  });

  await check('foreign-currency invoice stores rate + foreign total; ledger stays in base currency', async () => {
    const r = await api('POST', '/sales/invoices', {
      token: sales,
      body: {
        customer_id: 'cust-01', currency_code: 'EUR', exchange_rate: 1.25, autoPost: true,
        lines: [{ product_id: 'prod-08', description: 'Network setup (service)', quantity: 1, unit_price: 1000, tax_rate: 0 }]
      }
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const inv = q(`SELECT * FROM sales_invoices WHERE id = ?`, r.json.id);
    assert.strictEqual(inv.currency_code, 'EUR');
    assert.strictEqual(inv.exchange_rate, 1.25);
    assert.strictEqual(inv.foreign_total, 1000, 'the original EUR amount is preserved');
    assert.strictEqual(inv.total, 1250, 'ledger amount converted to USD base');
    const je = q(`SELECT total_debit, total_credit FROM journal_entries WHERE id = ?`, inv.journal_entry_id);
    assert.strictEqual(je.total_debit, 1250);
    assert.strictEqual(je.total_credit, 1250);
    const noRate = await api('POST', '/sales/invoices', {
      token: sales,
      body: { customer_id: 'cust-01', currency_code: 'JPY', lines: [{ product_id: 'prod-08', quantity: 1, unit_price: 1000, tax_rate: 0 }] }
    });
    // JPY→USD exists? we added USD→JPY; inverse lookup is allowed:
    assert.strictEqual(noRate.status, 200, 'inverse rate lookup works');
  });

  // =========================================================================
  // G. AUTHORIZATION & COMPANY/STORE SEPARATION
  // =========================================================================
  await check('manager role stays read-only; every new route enforces server-side permissions', async () => {
    const createWh = await api('POST', '/inventory/warehouses', { token: manager, body: { code: 'WH-3', name: 'Manager attempt' } });
    assert.strictEqual(createWh.status, 403);
    const listWh = await api('GET', '/inventory/warehouses', { token: manager });
    assert.strictEqual(listWh.status, 200, 'manager can still see everything read-only');
    const dispatch = await api('POST', `/inventory/transfers/${transferId}/dispatch`, { token: manager });
    assert.ok(dispatch.status === 403 || dispatch.status === 400, 'manager cannot dispatch');
    const anon = await fetch(`${base}/api/inventory/transfers`);
    assert.strictEqual(anon.status, 401, 'anonymous access refused');
  });

  await check('client-supplied user ids are never trusted: identity comes from the session', async () => {
    // Even if a body tries to name another user, records use the session user.
    const draft = await api('POST', '/inventory/counts/draft', {
      token: officer,
      body: { lines: [{ productId: 'prod-01', countedQty: 5 }], created_by: 'usr-t-admin', userId: 'usr-t-admin' }
    });
    assert.strictEqual(draft.status, 200);
    const row = q(`SELECT created_by FROM physical_inventory_counts WHERE id = ?`, draft.json.countId);
    assert.strictEqual(row.created_by, 'usr-t-officer', 'server identity overrides any client-supplied id');
  });

  await check('the whole operation set keeps the Trial Balance balanced', async () => {
    await trialBalanceBalanced(accountant);
  });

  await serverHandle.close();

  if (sourceMd5Before) {
    const after = crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex');
    assert.strictEqual(after, sourceMd5Before, 'repository genesis.db untouched');
    console.log('  ✓ repository genesis.db unchanged');
  }
  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(failed === 0 ? `--- ALL OPERATIONS TESTS PASSED (${passed} checks) ---` : `--- OPERATIONS TESTS: ${passed} passed, ${failed} FAILED ---`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('OPERATIONS TEST CRASH:', err);
  process.exit(1);
});
