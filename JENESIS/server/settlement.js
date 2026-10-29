/**
 * settlement.js — document settlement helpers (Part B: "created as PAID").
 *
 * JENESIS rule introduced for sales receipts/invoices and purchase documents:
 * a document is PAID when it is created, and there is no PAID/UNPAID choice in
 * the UI. "PAID" is never a cosmetic flag — it is the accounting consequence of
 * a real `payments` row booked through `recordPayment()` (which posts a balanced
 * journal entry, moves the bank/cash balance and updates the partner balance).
 *
 * These helpers therefore:
 *   - post a DRAFT document first (inside the same transaction) when needed,
 *   - record exactly ONE payment for the outstanding balance,
 *   - are idempotent: settling an already-settled document returns
 *     `alreadySettled: true` and creates nothing (F2 can be pressed twice),
 *   - never fabricate journal entries; every side effect is `recordPayment`'s.
 *
 * The whole operation runs inside a single database transaction: a failure at
 * any step rolls back posting, stock movements, the payment and the balances.
 */
const { getDb } = require('./db');
const { roundTo, logAudit } = require('./accountingEngine');
const {
  postSalesInvoice,
  postPurchaseInvoice,
  recordPayment
} = require('./accountingEngine');

/**
 * Picks the account money lands in.
 * Priority: the account the user chose → the oldest active cash account →
 * the oldest active bank/mobile-money account.
 * Throws when the company has no usable cash/bank account at all, so the caller
 * can show a real message instead of silently creating an unpaid document.
 */
function resolveBankAccount(db, companyId, bankAccountId) {
  if (bankAccountId) {
    const acc = db.prepare(`SELECT * FROM bank_accounts WHERE id = ? AND company_id = ?`).get(bankAccountId, companyId);
    if (!acc) throw new Error('The selected cash/bank account was not found for this company.');
    if (!acc.active) throw new Error('The selected cash/bank account is inactive. Choose an active account.');
    return acc;
  }
  const acc = db.prepare(`
    SELECT * FROM bank_accounts
    WHERE company_id = ? AND active = 1
    ORDER BY CASE WHEN account_type = 'CASH' THEN 0 ELSE 1 END,
             bank_name ASC
    LIMIT 1
  `).get(companyId);
  if (!acc) throw new Error('No active cash or bank account is configured. Add one in Banking before recording a paid document.');
  return acc;
}

/**
 * Settles a sales invoice/receipt in full (or the remaining balance).
 *
 * @returns {{invoiceId:string, invoiceNumber:string, status:string,
 *            amountPaid:number, balanceDue:number, total:number,
 *            paymentId:string|null, paymentNumber:string|null,
 *            amount:number, alreadySettled:boolean, postedNow:boolean}}
 */
function settleSalesInvoice(companyId, invoiceId, paymentInfo = {}, user = null) {
  const db = getDb();
  const tx = db.transaction(() => {
    const inv = db.prepare(`SELECT * FROM sales_invoices WHERE id = ? AND company_id = ?`).get(invoiceId, companyId);
    if (!inv) throw new Error('Sales invoice not found');
    if (inv.status === 'CANCELLED') throw new Error('A cancelled sales invoice cannot be settled.');

    const outstanding = roundTo(Number(inv.total) - Number(inv.amount_paid || 0), 2);

    // Idempotency: nothing left to pay → report the existing state, create nothing.
    if (inv.status === 'PAID' || outstanding <= 0.005) {
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        status: 'PAID',
        amountPaid: roundTo(Number(inv.amount_paid), 2),
        balanceDue: 0,
        total: roundTo(Number(inv.total), 2),
        paymentId: null,
        paymentNumber: null,
        amount: 0,
        alreadySettled: true,
        postedNow: false
      };
    }

    // A draft must be posted before money can be applied to it. Posting may add
    // stock movements/journal entries; all of it is inside this transaction.
    let postedNow = false;
    if (inv.status === 'DRAFT') {
      postSalesInvoice(companyId, invoiceId, user);
      postedNow = true;
    }

    const bankAccountId = resolveBankAccount(db, companyId, paymentInfo.bankAccountId || null).id;

    const payment = recordPayment(companyId, {
      paymentType: 'CUSTOMER_RECEIPT',
      paymentMethod: paymentInfo.paymentMethod || 'CASH',
      bankAccountId,
      customerId: inv.customer_id,
      salesInvoiceId: invoiceId,
      amount: outstanding,
      date: paymentInfo.date || inv.date,
      reference: paymentInfo.reference || `${inv.invoice_number}`,
      notes: paymentInfo.notes || 'Settlement recorded when the document was created',
      currencyCode: inv.currency_code || null,
      exchangeRate: inv.exchange_rate || 1,
      foreignAmount: inv.foreign_total || null
    }, user);

    const settled = db.prepare(`SELECT * FROM sales_invoices WHERE id = ?`).get(invoiceId);

    logAudit(companyId, user?.id, user?.full_name, 'SALES', 'SETTLE', invoiceId,
      `Settled sales invoice ${settled.invoice_number} — receipt ${payment.paymentNumber} of ${outstanding}${postedNow ? ' (posted as part of settlement)' : ''}`);

    return {
      invoiceId: settled.id,
      invoiceNumber: settled.invoice_number,
      status: settled.status,
      amountPaid: roundTo(Number(settled.amount_paid), 2),
      balanceDue: roundTo(Number(settled.balance_due), 2),
      total: roundTo(Number(settled.total), 2),
      paymentId: payment.paymentId,
      paymentNumber: payment.paymentNumber,
      amount: outstanding,
      alreadySettled: false,
      postedNow
    };
  });
  return tx();
}

/**
 * Settles a purchase invoice/bill in full (or the remaining balance).
 * Same contract as settleSalesInvoice, with a SUPPLIER_PAYMENT.
 */
function settlePurchaseInvoice(companyId, billId, paymentInfo = {}, user = null) {
  const db = getDb();
  const tx = db.transaction(() => {
    const bill = db.prepare(`SELECT * FROM purchase_invoices WHERE id = ? AND company_id = ?`).get(billId, companyId);
    if (!bill) throw new Error('Purchase invoice not found');
    if (bill.status === 'CANCELLED') throw new Error('A cancelled purchase invoice cannot be settled.');

    const outstanding = roundTo(Number(bill.total) - Number(bill.amount_paid || 0), 2);

    if (bill.status === 'PAID' || outstanding <= 0.005) {
      return {
        billId: bill.id,
        billNumber: bill.bill_number,
        status: 'PAID',
        amountPaid: roundTo(Number(bill.amount_paid), 2),
        balanceDue: 0,
        total: roundTo(Number(bill.total), 2),
        paymentId: null,
        paymentNumber: null,
        amount: 0,
        alreadySettled: true,
        postedNow: false
      };
    }

    let postedNow = false;
    if (bill.status === 'DRAFT') {
      postPurchaseInvoice(companyId, billId, user);
      postedNow = true;
    }

    const bankAccountId = resolveBankAccount(db, companyId, paymentInfo.bankAccountId || null).id;

    const payment = recordPayment(companyId, {
      paymentType: 'SUPPLIER_PAYMENT',
      paymentMethod: paymentInfo.paymentMethod || 'CASH',
      bankAccountId,
      supplierId: bill.supplier_id,
      purchaseInvoiceId: billId,
      amount: outstanding,
      date: paymentInfo.date || bill.date,
      reference: paymentInfo.reference || `${bill.bill_number}`,
      notes: paymentInfo.notes || 'Settlement recorded when the document was created',
      currencyCode: bill.currency_code || null,
      exchangeRate: bill.exchange_rate || 1,
      foreignAmount: bill.foreign_total || null
    }, user);

    const settled = db.prepare(`SELECT * FROM purchase_invoices WHERE id = ?`).get(billId);

    logAudit(companyId, user?.id, user?.full_name, 'PURCHASES', 'SETTLE', billId,
      `Settled purchase invoice ${settled.bill_number} — payment ${payment.paymentNumber} of ${outstanding}${postedNow ? ' (posted as part of settlement)' : ''}`);

    return {
      billId: settled.id,
      billNumber: settled.bill_number,
      status: settled.status,
      amountPaid: roundTo(Number(settled.amount_paid), 2),
      balanceDue: roundTo(Number(settled.balance_due), 2),
      total: roundTo(Number(settled.total), 2),
      paymentId: payment.paymentId,
      paymentNumber: payment.paymentNumber,
      amount: outstanding,
      alreadySettled: false,
      postedNow
    };
  });
  return tx();
}

module.exports = {
  resolveBankAccount,
  settleSalesInvoice,
  settlePurchaseInvoice
};
