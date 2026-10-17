const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Run against a temporary copy of the database so the test never modifies
// business data in genesis.db (the test posts journal entries).
if (!process.env.GENESIS_DB_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-acct-test-'));
  const src = path.join(__dirname, '..', 'genesis.db');
  const dest = path.join(tmpDir, 'genesis-test.db');
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  process.env.GENESIS_DB_PATH = dest;
  process.on('exit', () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });
}

const { getDb } = require('../server/db');
const {
  createJournalEntry,
  reverseJournalEntry,
  postSalesInvoice,
  postPurchaseInvoice,
  recordPayment,
  postStockAdjustment,
  postPhysicalCount,
  postCreditNote,
  postPurchaseReturn,
  generateId,
  nextSequenceNumber
} = require('../server/accountingEngine');
const { getTrialBalance, getBalanceSheet, getProfitAndLoss, getDashboardStats } = require('../server/reports');

console.log('--- STARTING ACCOUNTING ENGINE INTEGRITY TESTS ---');

const db = getDb();
const companyId = 'comp-genesis-01';
const user = { id: 'usr-accountant', full_name: 'Chief Accountant' };

// Initial state check
let tb = getTrialBalance(companyId);
assert.strictEqual(tb.isBalanced, true, 'Initial Trial Balance must be balanced');
console.log('✓ Initial Trial Balance balanced: Debits =', tb.grandDebit, 'Credits =', tb.grandCredit);

// 1. Create and Post a Sales Invoice
const invId = generateId('inv');
const invNumber = nextSequenceNumber(companyId, 'INVOICE', 'INV');
const cust = db.prepare(`SELECT * FROM customers WHERE company_id = ? LIMIT 1`).get(companyId);
const prod = db.prepare(`SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' LIMIT 1`).get(companyId);

const initialProdStock = prod.current_stock;
const initialCustBal = cust.current_balance;

const qtyToSell = 2;
const unitPrice = prod.selling_price;
const subtotal = qtyToSell * unitPrice;
const taxRate = 18;
const taxTotal = Math.round(subtotal * (taxRate / 100) * 100) / 100;
const total = subtotal + taxTotal;

db.prepare(`
  INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id, subtotal, tax_total, total, amount_paid, balance_due, status, created_by)
  VALUES (?, ?, ?, '2026-10-01', '2026-10-31', ?, ?, ?, ?, 0, ?, 'DRAFT', ?)
`).run(invId, companyId, invNumber, cust.id, subtotal, taxTotal, total, total, user.id);

db.prepare(`
  INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, unit_cost, discount_percent, tax_rate, tax_amount, line_total)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
`).run(generateId('line'), invId, prod.id, prod.name, qtyToSell, unitPrice, prod.cost_price, taxRate, taxTotal, total);

const postResult = postSalesInvoice(companyId, invId, user);
console.log('✓ Posted Sales Invoice:', postResult.invoiceNumber);

// Verify stock decreased
const updatedProd = db.prepare(`SELECT * FROM products WHERE id = ?`).get(prod.id);
assert.strictEqual(updatedProd.current_stock, initialProdStock - qtyToSell, 'Stock must decrease by sold quantity');

// Verify customer balance increased
const updatedCust = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(cust.id);
assert.strictEqual(updatedCust.current_balance, initialCustBal + total, 'Customer balance must increase by invoice total');

// Verify trial balance is still balanced
tb = getTrialBalance(companyId);
assert.strictEqual(tb.isBalanced, true, 'Trial Balance must remain balanced after Sales Invoice');
console.log('✓ Trial Balance balanced after sale: Debits =', tb.grandDebit, 'Credits =', tb.grandCredit);

// 2. Receive Customer Payment
const bank = db.prepare(`SELECT * FROM bank_accounts WHERE company_id = ? LIMIT 1`).get(companyId);
const initialBankBal = bank.current_balance;

const payResult = recordPayment(companyId, {
  paymentType: 'CUSTOMER_RECEIPT',
  paymentMethod: 'BANK_TRANSFER',
  bankAccountId: bank.id,
  customerId: cust.id,
  salesInvoiceId: invId,
  amount: total,
  notes: 'Invoice payment in full'
}, user);
console.log('✓ Received Customer Payment:', payResult.paymentNumber, 'Amount:', payResult.amount);

// Verify bank balance increased
const updatedBank = db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`).get(bank.id);
assert.strictEqual(Math.round(updatedBank.current_balance * 100) / 100, Math.round((initialBankBal + total) * 100) / 100, 'Bank balance must increase by payment amount');

// Verify invoice status is PAID
const updatedInv = db.prepare(`SELECT * FROM sales_invoices WHERE id = ?`).get(invId);
assert.strictEqual(updatedInv.status, 'PAID', 'Invoice status must be PAID');

tb = getTrialBalance(companyId);
assert.strictEqual(tb.isBalanced, true, 'Trial Balance must remain balanced after Customer Payment');

// 3. Create and Post a Purchase Invoice (Bill)
const supp = db.prepare(`SELECT * FROM suppliers WHERE company_id = ? LIMIT 1`).get(companyId);
const billId = generateId('bill');
const billNumber = nextSequenceNumber(companyId, 'BILL', 'BILL');
const purchaseQty = 10;
const purchaseUnitCost = 700;
const billSub = purchaseQty * purchaseUnitCost;
const billTax = Math.round(billSub * 0.18 * 100) / 100;
const billTot = billSub + billTax;

db.prepare(`
  INSERT INTO purchase_invoices (id, company_id, bill_number, vendor_invoice_number, date, due_date, supplier_id, subtotal, tax_total, total, amount_paid, balance_due, status, created_by)
  VALUES (?, ?, ?, 'VEND-9988', '2026-10-02', '2026-11-02', ?, ?, ?, ?, 0, ?, 'DRAFT', ?)
`).run(billId, companyId, billNumber, supp.id, billSub, billTax, billTot, billTot, user.id);

db.prepare(`
  INSERT INTO purchase_invoice_lines (id, bill_id, product_id, description, quantity, unit_cost, tax_rate, tax_amount, line_total)
  VALUES (?, ?, ?, ?, ?, ?, 18, ?, ?)
`).run(generateId('bline'), billId, prod.id, prod.name, purchaseQty, purchaseUnitCost, billTax, billTot);

const billPost = postPurchaseInvoice(companyId, billId, user);
console.log('✓ Posted Purchase Bill:', billPost.billNumber);

// Verify stock increased
const prodAfterPurch = db.prepare(`SELECT * FROM products WHERE id = ?`).get(prod.id);
assert.strictEqual(prodAfterPurch.current_stock, updatedProd.current_stock + purchaseQty, 'Stock must increase by purchased quantity');

tb = getTrialBalance(companyId);
assert.strictEqual(tb.isBalanced, true, 'Trial Balance must remain balanced after Purchase Bill');

// 4. Pay Supplier
const suppPay = recordPayment(companyId, {
  paymentType: 'SUPPLIER_PAYMENT',
  paymentMethod: 'BANK_TRANSFER',
  bankAccountId: bank.id,
  supplierId: supp.id,
  purchaseInvoiceId: billId,
  amount: billTot,
  notes: 'Supplier bill payment'
}, user);
console.log('✓ Recorded Supplier Payment:', suppPay.paymentNumber);

tb = getTrialBalance(companyId);
assert.strictEqual(tb.isBalanced, true, 'Trial Balance must remain balanced after Supplier Payment');

// 5. Stock Adjustment (Damage / write-off)
const adjResult = postStockAdjustment(companyId, {
  date: '2026-10-05',
  reason: 'DAMAGED',
  notes: 'Warehouse water leak damaged box',
  lines: [
    { productId: prod.id, quantityChange: -1, notes: 'Damaged item' }
  ]
}, user);
console.log('✓ Posted Stock Adjustment:', adjResult.adjustmentNumber);

tb = getTrialBalance(companyId);
assert.strictEqual(tb.isBalanced, true, 'Trial Balance must remain balanced after Stock Adjustment');

// 6. Physical Inventory Count
const countResult = postPhysicalCount(companyId, {
  date: '2026-10-06',
  location: 'Main Store',
  notes: 'Q4 Complete Inventory Count',
  lines: [
    { productId: prod.id, countedQty: prodAfterPurch.current_stock - 1 } // exactly matches current stock after adjustment
  ]
}, user);
console.log('✓ Posted Physical Count:', countResult.countNumber);

// 7. Verify Balance Sheet and P&L
const bs = getBalanceSheet(companyId);
assert.strictEqual(bs.isBalanced, true, 'Balance Sheet must balance: Assets = Liabilities + Equity');
console.log('✓ Balance Sheet balanced! Total Assets =', bs.assets.total, 'Liab + Equity =', bs.totalLiabilitiesAndEquity, 'Diff =', bs.difference);

const stats = getDashboardStats(companyId);
console.log('✓ Dashboard KPI Stats calculated successfully: Sales =', stats.totalSales, 'Purchases =', stats.totalPurchases, 'Gross Profit =', stats.grossProfit, 'Net Profit =', stats.netProfit);

console.log('--- ALL ACCOUNTING ENGINE TESTS PASSED PERFECTLY! ---');
