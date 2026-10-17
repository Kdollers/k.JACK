const { getDb } = require('./db');
const crypto = require('crypto');
const { generateId, roundTo } = require('./utils');
const stockLedger = require('./stockLedger');

function nextSequenceNumber(companyId, type, prefix) {
  const db = getDb();
  const year = new Date().getFullYear();
  let pattern = `${prefix}-${year}-%`;
  
  let row;
  if (type === 'JOURNAL') {
    row = db.prepare(`SELECT entry_number as num FROM journal_entries WHERE company_id = ? AND entry_number LIKE ? ORDER BY entry_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'INVOICE') {
    row = db.prepare(`SELECT invoice_number as num FROM sales_invoices WHERE company_id = ? AND invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'QUOTE') {
    row = db.prepare(`SELECT quote_number as num FROM sales_quotes WHERE company_id = ? AND quote_number LIKE ? ORDER BY quote_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'ORDER') {
    row = db.prepare(`SELECT order_number as num FROM sales_orders WHERE company_id = ? AND order_number LIKE ? ORDER BY order_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'BILL') {
    row = db.prepare(`SELECT bill_number as num FROM purchase_invoices WHERE company_id = ? AND bill_number LIKE ? ORDER BY bill_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'PO') {
    row = db.prepare(`SELECT po_number as num FROM purchase_orders WHERE company_id = ? AND po_number LIKE ? ORDER BY po_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'PAYMENT') {
    row = db.prepare(`SELECT payment_number as num FROM payments WHERE company_id = ? AND payment_number LIKE ? ORDER BY payment_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'ADJUSTMENT') {
    row = db.prepare(`SELECT adjustment_number as num FROM stock_adjustments WHERE company_id = ? AND adjustment_number LIKE ? ORDER BY adjustment_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'COUNT') {
    row = db.prepare(`SELECT count_number as num FROM physical_inventory_counts WHERE company_id = ? AND count_number LIKE ? ORDER BY count_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'CREDIT_NOTE') {
    row = db.prepare(`SELECT credit_note_number as num FROM credit_notes WHERE company_id = ? AND credit_note_number LIKE ? ORDER BY credit_note_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'PURCHASE_RETURN') {
    row = db.prepare(`SELECT return_number as num FROM purchase_returns WHERE company_id = ? AND return_number LIKE ? ORDER BY return_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'TRANSFER') {
    row = db.prepare(`SELECT transfer_number as num FROM stock_transfers WHERE company_id = ? AND transfer_number LIKE ? ORDER BY transfer_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'GOODS_RECEIPT') {
    row = db.prepare(`SELECT receipt_number as num FROM goods_receipts WHERE company_id = ? AND receipt_number LIKE ? ORDER BY receipt_number DESC LIMIT 1`).get(companyId, pattern);
  } else if (type === 'CASH_SESSION') {
    row = db.prepare(`SELECT session_number as num FROM cash_sessions WHERE company_id = ? AND session_number LIKE ? ORDER BY session_number DESC LIMIT 1`).get(companyId, pattern);
  }

  let nextSeq = 1;
  if (row && row.num) {
    const parts = row.num.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  return `${prefix}-${year}-${String(nextSeq).padStart(4, '0')}`;
}

function logAudit(companyId, userId, userName, moduleName, action, recordId, description, prevVal = null, newVal = null) {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_logs (id, company_id, user_id, user_name, timestamp, module, action, record_id, description, previous_value, new_value)
    VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
  `).run(
    generateId('audit'),
    companyId,
    userId || 'system',
    userName || 'System',
    moduleName,
    action,
    recordId,
    description,
    prevVal ? JSON.stringify(prevVal) : null,
    newVal ? JSON.stringify(newVal) : null
  );
}

/**
 * Creates and posts a Double-Entry Journal Entry.
 * Strictly verifies that Total Debits === Total Credits.
 */
function createJournalEntry({ companyId, date, reference, description, sourceType = 'MANUAL', sourceId = null, lines, user }) {
  const db = getDb();

  if (!lines || lines.length < 2) {
    throw new Error('Journal Entry must contain at least two lines');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const debit = roundTo(Number(line.debit) || 0, 2);
    const credit = roundTo(Number(line.credit) || 0, 2);
    if (debit < 0 || credit < 0) {
      throw new Error('Debit and credit values cannot be negative');
    }
    if (debit > 0 && credit > 0) {
      throw new Error('A single line cannot have both debit and credit amounts');
    }
    if (debit === 0 && credit === 0) {
      throw new Error('A journal line cannot have zero debit and zero credit');
    }
    totalDebit = roundTo(totalDebit + debit, 2);
    totalCredit = roundTo(totalCredit + credit, 2);
  }

  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.001) {
    throw new Error(`Unbalanced Journal Entry: Total Debits (${totalDebit.toFixed(2)}) must equal Total Credits (${totalCredit.toFixed(2)}). Difference is ${diff.toFixed(2)}`);
  }

  // Verify accounts belong to company
  const accIds = lines.map(l => l.accountId);
  const placeholders = accIds.map(() => '?').join(',');
  const validAccs = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND id IN (${placeholders})`).all(companyId, ...accIds);
  if (validAccs.length !== new Set(accIds).size) {
    throw new Error('One or more accounts do not exist in this company');
  }

  const jeId = generateId('je');
  const entryNumber = nextSequenceNumber(companyId, 'JOURNAL', 'JE');
  const entryDate = date || new Date().toISOString().split('T')[0];

  const insertJE = db.prepare(`
    INSERT INTO journal_entries (id, company_id, entry_number, date, reference, description, source_type, source_id, total_debit, total_credit, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, datetime('now'))
  `);

  const insertLine = db.prepare(`
    INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, line_number, description, debit, credit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertJE.run(jeId, companyId, entryNumber, entryDate, reference || null, description, sourceType, sourceId, totalDebit, totalCredit, user?.id || 'system');

  lines.forEach((line, idx) => {
    insertLine.run(
      generateId('jel'),
      jeId,
      line.accountId,
      idx + 1,
      line.description || description,
      roundTo(Number(line.debit) || 0, 2),
      roundTo(Number(line.credit) || 0, 2)
    );
  });

  logAudit(companyId, user?.id, user?.full_name, 'ACCOUNTING', 'POST', jeId, `Posted Journal Entry ${entryNumber} (${description}) for amount ${totalDebit.toFixed(2)}`);

  return { id: jeId, entryNumber, totalDebit, totalCredit };
}

/**
 * Reverses a posted Journal Entry
 */
function reverseJournalEntry(companyId, entryId, reason, user) {
  const db = getDb();
  const entry = db.prepare(`SELECT * FROM journal_entries WHERE id = ? AND company_id = ?`).get(entryId, companyId);
  if (!entry) throw new Error('Journal entry not found');
  if (entry.status === 'REVERSED') throw new Error('Journal entry is already reversed');

  const lines = db.prepare(`SELECT * FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number`).all(entryId);

  // Invert lines: Debits become Credits, Credits become Debits
  const reversedLines = lines.map(line => ({
    accountId: line.account_id,
    description: `Reversal of: ${line.description || entry.description}`,
    debit: line.credit,
    credit: line.debit
  }));

  const reversal = createJournalEntry({
    companyId,
    date: new Date().toISOString().split('T')[0],
    reference: `REV-${entry.entry_number}`,
    description: `Reversal of ${entry.entry_number}: ${reason || 'Correction'}`,
    sourceType: 'REVERSAL',
    sourceId: entryId,
    lines: reversedLines,
    user
  });

  db.prepare(`UPDATE journal_entries SET status = 'REVERSED', reversed_by_id = ? WHERE id = ?`).run(reversal.id, entryId);

  logAudit(companyId, user?.id, user?.full_name, 'ACCOUNTING', 'VOID', entryId, `Reversed Journal Entry ${entry.entry_number} with new reversal entry ${reversal.entryNumber}`);

  return reversal;
}

/**
 * Posts a Sales Invoice:
 * - Updates inventory & records movement
 * - Creates double-entry journal entry:
 *     Debit: AR (or Cash/Bank)
 *     Credit: Sales Revenue
 *     Credit: VAT Output Tax
 *     Debit: COGS
 *     Credit: Merchandise Inventory
 * - Updates customer balance
 * - Updates invoice status to POSTED
 */
function postSalesInvoice(companyId, invoiceId, user, opts = {}) {
  const db = getDb();
  const tx = db.transaction(() => {
    const inv = db.prepare(`SELECT * FROM sales_invoices WHERE id = ? AND company_id = ?`).get(invoiceId, companyId);
    if (!inv) throw new Error('Invoice not found');
    if (inv.status !== 'DRAFT') throw new Error(`Cannot post invoice with status ${inv.status}`);

    // Walk-in (anonymous) sales are cash sales: they must be settled immediately.
    // postWalkInSale() passes settleWalkIn=true and records the payment in the
    // same transaction. Credit sales require a named (non walk-in) customer.
    if (inv.walk_in && !opts.settleWalkIn) {
      throw new Error('Walk-in sales must be paid immediately. Use the walk-in checkout, or create a credit sale for a named customer.');
    }

    const lines = db.prepare(`SELECT * FROM sales_invoice_lines WHERE invoice_id = ?`).all(invoiceId);
    if (!lines || lines.length === 0) throw new Error('Cannot post an empty invoice');

    const customer = db.prepare(`SELECT * FROM customers WHERE id = ? AND company_id = ?`).get(inv.customer_id, companyId);
    if (!customer) throw new Error('Customer not found');

    const arAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND subtype = 'ACCOUNTS_RECEIVABLE' LIMIT 1`).get(companyId);
    const defaultSalesAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '4010' LIMIT 1`).get(companyId);
    const taxAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '2110' LIMIT 1`).get(companyId);
    const defaultCogsAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '5010' LIMIT 1`).get(companyId);
    const defaultInvAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1`).get(companyId);

    if (!arAccount) throw new Error('Accounts Receivable account (subtype ACCOUNTS_RECEIVABLE) not configured');

    const company = db.prepare(`SELECT inventory_valuation_method FROM companies WHERE id = ?`).get(companyId);
    const useFifo = String(company?.inventory_valuation_method || 'WEIGHTED_AVERAGE').toUpperCase() === 'FIFO';
    const warehouseId = inv.warehouse_id || stockLedger.defaultWarehouseId(db, companyId);

    let totalCogs = 0;
    const inventoryUpdates = [];

    // Process lines & calculate COGS
    for (const line of lines) {
      if (line.product_id) {
        const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(line.product_id, companyId);
        if (prod && prod.type === 'GOODS') {
          // Insufficient-stock protection: never sell what is not on hand.
          const companyStock = roundTo(prod.current_stock || 0, 4);
          if (companyStock < line.quantity - 0.00005) {
            throw new Error(`Insufficient stock for ${prod.name}: available ${companyStock}, requested ${roundTo(line.quantity, 4)}.`);
          }
          const storeStock = stockLedger.getStockAt(db, prod.id, warehouseId);
          if (storeStock < line.quantity - 0.00005) {
            throw new Error(`Insufficient stock for ${prod.name} in the selected store: available ${storeStock}, requested ${roundTo(line.quantity, 4)}.`);
          }

          let unitCost = prod.cost_price || 0;
          let lineCost = roundTo(line.quantity * unitCost, 2);
          let fifoLayers = null;
          if (useFifo) {
            // FIFO: cost of this sale comes from the oldest cost layers.
            fifoLayers = stockLedger.consumeFifo(db, companyId, prod.id, line.quantity, inv.date);
            lineCost = fifoLayers.totalCost;
            unitCost = line.quantity > 0 ? roundTo(lineCost / line.quantity, 4) : unitCost;
          }
          totalCogs = roundTo(totalCogs + lineCost, 2);

          const newStock = roundTo(prod.current_stock - line.quantity, 4);
          inventoryUpdates.push({
            productId: prod.id,
            productName: prod.name,
            qty: line.quantity,
            unitCost,
            lineCost,
            newStock,
            cogsAccountId: prod.cogs_account_id || defaultCogsAccount?.id,
            invAccountId: prod.inventory_account_id || defaultInvAccount?.id
          });
        }
      }
    }

    // Build Journal Entry Lines
    const jeLines = [];

    // 1. Debit Accounts Receivable for invoice total
    jeLines.push({
      accountId: arAccount.id,
      description: `AR: Inv #${inv.invoice_number} - ${customer.name}`,
      debit: inv.total,
      credit: 0
    });

    // 2. Credit Sales Revenue for subtotal
    jeLines.push({
      accountId: defaultSalesAccount.id,
      description: `Sales Revenue: Inv #${inv.invoice_number}`,
      debit: 0,
      credit: inv.subtotal
    });

    // 3. Credit Tax Payable for tax total (if any)
    if (inv.tax_total > 0) {
      jeLines.push({
        accountId: taxAccount.id,
        description: `VAT Output: Inv #${inv.invoice_number}`,
        debit: 0,
        credit: inv.tax_total
      });
    }

    // 4. COGS & Inventory Asset entries for inventory items
    if (totalCogs > 0) {
      jeLines.push({
        accountId: defaultCogsAccount.id,
        description: `COGS: Inv #${inv.invoice_number}`,
        debit: totalCogs,
        credit: 0
      });
      jeLines.push({
        accountId: defaultInvAccount.id,
        description: `Inventory reduction: Inv #${inv.invoice_number}`,
        debit: 0,
        credit: totalCogs
      });
    }

    // Post journal entry
    const je = createJournalEntry({
      companyId,
      date: inv.date,
      reference: inv.invoice_number,
      description: `Sales Invoice #${inv.invoice_number} - ${customer.name}`,
      sourceType: 'SALES_INVOICE',
      sourceId: inv.id,
      lines: jeLines,
      user
    });

    // Deduct stock and record movements
    const updateProdStock = db.prepare(`UPDATE products SET current_stock = ? WHERE id = ?`);
    const insertMovement = db.prepare(`
      INSERT INTO inventory_movements (
        id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
        quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
      ) VALUES (?, ?, ?, ?, 'SALE_OUT', 'SALES_INVOICE', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);

    for (const item of inventoryUpdates) {
      updateProdStock.run(item.newStock, item.productId);
      stockLedger.syncStockLevelDelta(db, item.productId, warehouseId, -item.qty);
      insertMovement.run(
        generateId('mov'),
        companyId,
        item.productId,
        inv.date,
        inv.id,
        inv.invoice_number,
        -item.qty,
        item.unitCost,
        item.lineCost,
        item.newStock,
        `Sale on invoice ${inv.invoice_number}`,
        user?.id || 'system',
        warehouseId
      );
    }

    // Update Customer Balance
    const newCustBalance = roundTo(customer.current_balance + inv.total, 2);
    db.prepare(`UPDATE customers SET current_balance = ? WHERE id = ?`).run(newCustBalance, customer.id);

    // Update Invoice Status
    db.prepare(`
      UPDATE sales_invoices
      SET status = 'POSTED', journal_entry_id = ?, balance_due = total - amount_paid
      WHERE id = ?
    `).run(je.id, inv.id);

    logAudit(companyId, user?.id, user?.full_name, 'SALES', 'POST', inv.id, `Posted Sales Invoice ${inv.invoice_number} for customer ${customer.name} ($${inv.total})`);

    return { invoiceId: inv.id, invoiceNumber: inv.invoice_number, journalEntryId: je.id };
  });

  return tx();
}

/**
 * Posts a Purchase Invoice (Bill):
 * - Increases inventory & updates weighted average cost
 * - Records inventory movement
 * - Creates double-entry journal entry:
 *     Debit: Merchandise Inventory (or Expense)
 *     Debit: VAT Input Tax
 *     Credit: Accounts Payable
 * - Updates supplier balance
 * - Updates bill status to POSTED
 */
function postPurchaseInvoice(companyId, billId, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const bill = db.prepare(`SELECT * FROM purchase_invoices WHERE id = ? AND company_id = ?`).get(billId, companyId);
    if (!bill) throw new Error('Purchase invoice not found');
    if (bill.status !== 'DRAFT') throw new Error(`Cannot post purchase invoice with status ${bill.status}`);

    const lines = db.prepare(`SELECT * FROM purchase_invoice_lines WHERE bill_id = ?`).all(billId);
    if (!lines || lines.length === 0) throw new Error('Cannot post an empty purchase invoice');

    const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ? AND company_id = ?`).get(bill.supplier_id, companyId);
    if (!supplier) throw new Error('Supplier not found');

    const apAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND subtype = 'ACCOUNTS_PAYABLE' LIMIT 1`).get(companyId);
    const defaultInvAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1`).get(companyId);
    const taxInputAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1150' LIMIT 1`).get(companyId);
    const grniAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '2120' LIMIT 1`).get(companyId);

    if (!apAccount) throw new Error('Accounts Payable account (subtype ACCOUNTS_PAYABLE) not configured');

    // A bill linked to a POSTED goods receipt does not add stock again: the
    // goods were already received into the store when the receipt was posted.
    // Its journal debits the GRNI clearing account instead of Inventory.
    let linkedReceipt = null;
    if (bill.goods_receipt_id) {
      linkedReceipt = db.prepare(`SELECT * FROM goods_receipts WHERE id = ? AND company_id = ?`).get(bill.goods_receipt_id, companyId);
      if (!linkedReceipt) throw new Error('Linked goods receipt not found');
      if (linkedReceipt.status !== 'POSTED') throw new Error('Linked goods receipt is not posted');
    }
    const warehouseId = linkedReceipt
      ? linkedReceipt.warehouse_id
      : stockLedger.defaultWarehouseId(db, companyId);

    const inventoryUpdates = [];
    const updateProd = db.prepare(`UPDATE products SET current_stock = ?, cost_price = ? WHERE id = ?`);
    const insertMovement = db.prepare(`
      INSERT INTO inventory_movements (
        id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
        quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
      ) VALUES (?, ?, ?, ?, 'PURCHASE_IN', 'PURCHASE_INVOICE', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);

    for (const line of linkedReceipt ? [] : lines) {
      if (line.product_id) {
        const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(line.product_id, companyId);
        if (prod && prod.type === 'GOODS') {
          const currentQty = Math.max(0, prod.current_stock);
          const currentCost = prod.cost_price || 0;
          const addedQty = line.quantity;
          const addedCost = line.unit_cost;
          const newQty = roundTo(prod.current_stock + addedQty, 4);

          // Weighted average cost formula
          let newAvgCost = addedCost;
          if (currentQty + addedQty > 0) {
            newAvgCost = roundTo(((currentQty * currentCost) + (addedQty * addedCost)) / (currentQty + addedQty), 2);
          }

          inventoryUpdates.push({
            productId: prod.id,
            qty: addedQty,
            unitCost: addedCost,
            lineTotal: roundTo(addedQty * addedCost, 2),
            newStock: newQty,
            newAvgCost
          });
        }
      }
    }

    // Build Double-Entry Journal Entry
    const jeLines = [];

    // 1. Debit Merchandise Inventory — or the GRNI clearing account when the
    //    goods were already received on a posted goods receipt.
    if (linkedReceipt && !grniAccount) {
      throw new Error('GRNI account (code 2120) is not configured');
    }
    jeLines.push({
      accountId: linkedReceipt ? grniAccount.id : defaultInvAccount.id,
      description: linkedReceipt
        ? `GRNI clearing: Bill #${bill.bill_number} (goods received on ${linkedReceipt.receipt_number})`
        : `Purchases/Inventory: Bill #${bill.bill_number}`,
      debit: bill.subtotal,
      credit: 0
    });

    // 2. Debit Tax Input (if any)
    if (bill.tax_total > 0) {
      jeLines.push({
        accountId: taxInputAccount.id,
        description: `VAT Input: Bill #${bill.bill_number}`,
        debit: bill.tax_total,
        credit: 0
      });
    }

    // 3. Credit Accounts Payable for total
    jeLines.push({
      accountId: apAccount.id,
      description: `AP: Bill #${bill.bill_number} - ${supplier.name}`,
      debit: 0,
      credit: bill.total
    });

    const je = createJournalEntry({
      companyId,
      date: bill.date,
      reference: bill.vendor_invoice_number || bill.bill_number,
      description: `Purchase Invoice #${bill.bill_number} from ${supplier.name}`,
      sourceType: 'PURCHASE_INVOICE',
      sourceId: bill.id,
      lines: jeLines,
      user
    });

    // Apply inventory stock & cost updates
    for (const item of inventoryUpdates) {
      updateProd.run(item.newStock, item.newAvgCost, item.productId);
      stockLedger.syncStockLevelDelta(db, item.productId, warehouseId, item.qty);
      stockLedger.addFifoLayer(db, {
        companyId, productId: item.productId, warehouseId,
        qty: item.qty, unitCost: item.unitCost, date: bill.date,
        sourceType: 'PURCHASE_INVOICE', sourceId: bill.id
      });
      insertMovement.run(
        generateId('mov'),
        companyId,
        item.productId,
        bill.date,
        bill.id,
        bill.bill_number,
        item.qty,
        item.unitCost,
        item.lineTotal,
        item.newStock,
        `Purchase on bill ${bill.bill_number}`,
        user?.id || 'system',
        warehouseId
      );
    }

    // Update Supplier Balance
    const newSuppBalance = roundTo(supplier.current_balance + bill.total, 2);
    db.prepare(`UPDATE suppliers SET current_balance = ? WHERE id = ?`).run(newSuppBalance, supplier.id);

    // Update Bill status
    db.prepare(`
      UPDATE purchase_invoices
      SET status = 'POSTED', journal_entry_id = ?, balance_due = total - amount_paid
      WHERE id = ?
    `).run(je.id, bill.id);

    logAudit(companyId, user?.id, user?.full_name, 'PURCHASES', 'POST', bill.id, `Posted Purchase Bill ${bill.bill_number} from ${supplier.name} ($${bill.total})`);

    return { billId: bill.id, billNumber: bill.bill_number, journalEntryId: je.id };
  });

  return tx();
}

/**
 * Records and posts a Payment (Customer receipt, Supplier payment, Expense, Income, Transfer)
 */
function recordPayment(companyId, paymentData, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const {
      paymentType, // CUSTOMER_RECEIPT, SUPPLIER_PAYMENT, DIRECT_EXPENSE, DIRECT_INCOME, TRANSFER, CUSTOMER_REFUND
      paymentMethod = 'BANK_TRANSFER',
      bankAccountId,
      toBankAccountId,
      customerId,
      supplierId,
      salesInvoiceId,
      purchaseInvoiceId,
      expenseAccountId,
      incomeAccountId,
      creditNoteId = null,
      amount,
      date = new Date().toISOString().split('T')[0],
      reference = '',
      notes = '',
      currencyCode = null,
      exchangeRate = null,
      foreignAmount = null
    } = paymentData;

    const payAmount = roundTo(Number(amount), 2);
    if (payAmount <= 0) throw new Error('Payment amount must be greater than zero');

    const bankAcc = db.prepare(`SELECT * FROM bank_accounts WHERE id = ? AND company_id = ?`).get(bankAccountId, companyId);
    if (!bankAcc) throw new Error('Bank/Cash account not found');

    // Multi-currency bookkeeping: `amount` is ALWAYS the base-currency value.
    // The transaction currency, its rate and the original foreign amount are
    // preserved for history; they never overwrite the base amounts.
    const company = db.prepare(`SELECT currency_code FROM companies WHERE id = ?`).get(companyId);
    const baseCode = company?.currency_code || 'USD';
    const payCurrency = currencyCode || baseCode;
    let payRate = exchangeRate == null ? 1 : Number(exchangeRate);
    if (payCurrency !== baseCode) {
      if (!(payRate > 0)) throw new Error(`An exchange rate is required to record a payment in ${payCurrency}.`);
    } else {
      payRate = 1;
    }
    const payForeign = foreignAmount == null
      ? roundTo(payAmount / payRate, 4)
      : roundTo(Number(foreignAmount), 4);

    const paymentNumber = nextSequenceNumber(companyId, 'PAYMENT', 'PAY');
    const paymentId = generateId('pay');

    const arAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND subtype = 'ACCOUNTS_RECEIVABLE' LIMIT 1`).get(companyId);
    const apAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND subtype = 'ACCOUNTS_PAYABLE' LIMIT 1`).get(companyId);

    const jeLines = [];
    let desc = '';

    if (paymentType === 'CUSTOMER_RECEIPT') {
      const customer = db.prepare(`SELECT * FROM customers WHERE id = ? AND company_id = ?`).get(customerId, companyId);
      if (!customer) throw new Error('Customer is required for customer receipt');

      desc = `Customer Receipt ${paymentNumber} from ${customer.name}`;

      // Debit Bank Account
      jeLines.push({
        accountId: bankAcc.account_id,
        description: `Receipt: ${paymentNumber} - ${customer.name}`,
        debit: payAmount,
        credit: 0
      });

      // Credit Accounts Receivable
      jeLines.push({
        accountId: arAccount.id,
        description: `AR: Payment from ${customer.name}`,
        debit: 0,
        credit: payAmount
      });

      // Update bank account balance
      db.prepare(`UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?`).run(payAmount, bankAcc.id);

      // Update customer balance
      db.prepare(`UPDATE customers SET current_balance = current_balance - ? WHERE id = ?`).run(payAmount, customer.id);

      // If tied to invoice, update invoice
      if (salesInvoiceId) {
        const inv = db.prepare(`SELECT * FROM sales_invoices WHERE id = ? AND company_id = ?`).get(salesInvoiceId, companyId);
        if (inv) {
          const newPaid = roundTo(inv.amount_paid + payAmount, 2);
          const newDue = roundTo(inv.total - newPaid, 2);
          const newStatus = newDue <= 0 ? 'PAID' : 'PARTIALLY_PAID';
          db.prepare(`UPDATE sales_invoices SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?`).run(newPaid, newDue, newStatus, inv.id);
        }
      }

    } else if (paymentType === 'SUPPLIER_PAYMENT') {
      const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ? AND company_id = ?`).get(supplierId, companyId);
      if (!supplier) throw new Error('Supplier is required for supplier payment');

      desc = `Supplier Payment ${paymentNumber} to ${supplier.name}`;

      // Debit Accounts Payable
      jeLines.push({
        accountId: apAccount.id,
        description: `AP: Payment to ${supplier.name}`,
        debit: payAmount,
        credit: 0
      });

      // Credit Bank Account
      jeLines.push({
        accountId: bankAcc.account_id,
        description: `Payment: ${paymentNumber} - ${supplier.name}`,
        debit: 0,
        credit: payAmount
      });

      // Update bank account balance
      db.prepare(`UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?`).run(payAmount, bankAcc.id);

      // Update supplier balance
      db.prepare(`UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?`).run(payAmount, supplier.id);

      // If tied to bill, update bill
      if (purchaseInvoiceId) {
        const bill = db.prepare(`SELECT * FROM purchase_invoices WHERE id = ? AND company_id = ?`).get(purchaseInvoiceId, companyId);
        if (bill) {
          const newPaid = roundTo(bill.amount_paid + payAmount, 2);
          const newDue = roundTo(bill.total - newPaid, 2);
          const newStatus = newDue <= 0 ? 'PAID' : 'PARTIALLY_PAID';
          db.prepare(`UPDATE purchase_invoices SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?`).run(newPaid, newDue, newStatus, bill.id);
        }
      }

    } else if (paymentType === 'DIRECT_EXPENSE') {
      if (!expenseAccountId) throw new Error('Expense account is required');
      desc = `Expense Payment ${paymentNumber}: ${notes || reference || 'Operating Expense'}`;

      // Debit Expense Account
      jeLines.push({
        accountId: expenseAccountId,
        description: notes || 'Expense Payment',
        debit: payAmount,
        credit: 0
      });

      // Credit Bank Account
      jeLines.push({
        accountId: bankAcc.account_id,
        description: `Paid via ${bankAcc.bank_name}`,
        debit: 0,
        credit: payAmount
      });

      db.prepare(`UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?`).run(payAmount, bankAcc.id);

    } else if (paymentType === 'DIRECT_INCOME') {
      if (!incomeAccountId) throw new Error('Income account is required');
      desc = `Income Receipt ${paymentNumber}: ${notes || reference || 'Direct Income'}`;

      // Debit Bank Account
      jeLines.push({
        accountId: bankAcc.account_id,
        description: `Received in ${bankAcc.bank_name}`,
        debit: payAmount,
        credit: 0
      });

      // Credit Income Account
      jeLines.push({
        accountId: incomeAccountId,
        description: notes || 'Direct Income',
        debit: 0,
        credit: payAmount
      });

      db.prepare(`UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?`).run(payAmount, bankAcc.id);

    } else if (paymentType === 'TRANSFER') {
      const toBank = db.prepare(`SELECT * FROM bank_accounts WHERE id = ? AND company_id = ?`).get(toBankAccountId, companyId);
      if (!toBank) throw new Error('Destination bank account is required for transfer');
      if (toBank.id === bankAcc.id) throw new Error('Source and destination accounts must be different');

      desc = `Bank Transfer ${paymentNumber} from ${bankAcc.bank_name} to ${toBank.bank_name}`;

      // Debit Destination Bank Account
      jeLines.push({
        accountId: toBank.account_id,
        description: `Transfer in from ${bankAcc.bank_name}`,
        debit: payAmount,
        credit: 0
      });

      // Credit Source Bank Account
      jeLines.push({
        accountId: bankAcc.account_id,
        description: `Transfer out to ${toBank.bank_name}`,
        debit: 0,
        credit: payAmount
      });

      db.prepare(`UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?`).run(payAmount, bankAcc.id);
      db.prepare(`UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?`).run(payAmount, toBank.id);

    } else if (paymentType === 'CUSTOMER_REFUND') {
      // Cash refund of a credit-note balance: settles what the company owes
      // the customer. Debit AR (reversing the credit-note AR credit), Credit
      // the cash/bank account actually paying out.
      const customer = db.prepare(`SELECT * FROM customers WHERE id = ? AND company_id = ?`).get(customerId, companyId);
      if (!customer) throw new Error('Customer is required for customer refund');
      if (!arAccount) throw new Error('Accounts Receivable account (subtype ACCOUNTS_RECEIVABLE) not configured');

      desc = `Customer Refund ${paymentNumber} to ${customer.name}`;

      jeLines.push({
        accountId: arAccount.id,
        description: `AR: Refund to ${customer.name}`,
        debit: payAmount,
        credit: 0
      });
      jeLines.push({
        accountId: bankAcc.account_id,
        description: `Refund paid via ${bankAcc.bank_name}`,
        debit: 0,
        credit: payAmount
      });

      db.prepare(`UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?`).run(payAmount, bankAcc.id);
      db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`).run(payAmount, customer.id);
    } else {
      throw new Error(`Unsupported payment type: ${paymentType}`);
    }

    // Create balancing journal entry
    const je = createJournalEntry({
      companyId,
      date,
      reference: reference || paymentNumber,
      description: desc,
      sourceType: paymentType,
      sourceId: paymentId,
      lines: jeLines,
      user
    });

    // Save payment record
    db.prepare(`
      INSERT INTO payments (
        id, company_id, payment_number, date, payment_type, payment_method, bank_account_id, to_bank_account_id,
        customer_id, supplier_id, sales_invoice_id, purchase_invoice_id, expense_account_id, income_account_id,
        amount, reference, notes, journal_entry_id, created_by, created_at,
        currency_code, exchange_rate, foreign_amount, status, credit_note_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, 'POSTED', ?)
    `).run(
      paymentId, companyId, paymentNumber, date, paymentType, paymentMethod, bankAcc.id, toBankAccountId || null,
      customerId || null, supplierId || null, salesInvoiceId || null, purchaseInvoiceId || null,
      expenseAccountId || null, incomeAccountId || null, payAmount, reference || null, notes || null,
      je.id, user?.id || 'system',
      payCurrency, payRate, payForeign, creditNoteId || null
    );

    logAudit(companyId, user?.id, user?.full_name, 'PAYMENTS', 'CREATE', paymentId, `Recorded payment ${paymentNumber} (${paymentType}) of $${payAmount}`);

    return { paymentId, paymentNumber, journalEntryId: je.id, amount: payAmount };
  });

  return tx();
}

/**
 * Records the immediate settlement of a walk-in (anonymous) sale.
 * Posts the invoice and records the full payment in ONE transaction, so a
 * walk-in sale can never leave an outstanding receivable behind.
 */
function postWalkInSale(companyId, invoiceId, paymentInfo, user) {
  const db = getDb();
  const outer = db.transaction(() => {
    const inv = db.prepare(`SELECT * FROM sales_invoices WHERE id = ? AND company_id = ?`).get(invoiceId, companyId);
    if (!inv) throw new Error('Invoice not found');
    if (!inv.walk_in) throw new Error('Invoice is not a walk-in sale');
    if (inv.status !== 'DRAFT') throw new Error(`Cannot post invoice with status ${inv.status}`);

    let bankAccountId = paymentInfo?.bankAccountId || null;
    if (!bankAccountId) {
      const cash = db.prepare(`
        SELECT id FROM bank_accounts
        WHERE company_id = ? AND active = 1 AND account_type = 'CASH'
        ORDER BY created_at ASC LIMIT 1
      `).get(companyId);
      if (!cash) throw new Error('No active cash account is configured for walk-in sales');
      bankAccountId = cash.id;
    }

    const posted = postSalesInvoice(companyId, invoiceId, user, { settleWalkIn: true });
    const payment = recordPayment(companyId, {
      paymentType: 'CUSTOMER_RECEIPT',
      paymentMethod: paymentInfo?.paymentMethod || 'CASH',
      bankAccountId,
      customerId: inv.customer_id,
      salesInvoiceId: invoiceId,
      amount: inv.total,
      date: paymentInfo?.date || inv.date,
      reference: `Walk-in ${inv.invoice_number}`,
      notes: 'Walk-in sale — immediate settlement',
      currencyCode: inv.currency_code || null,
      exchangeRate: inv.exchange_rate || 1,
      foreignAmount: inv.foreign_total || null
    }, user);
    return { ...posted, paymentId: payment.paymentId, paymentNumber: payment.paymentNumber };
  });
  return outer();
}

/**
 * Reverses a recorded payment (receipt correction). Creates a proper REVERSAL
 * journal entry, undoes every balance side effect and marks the payment
 * REVERSED. The original payment row is preserved for the audit trail.
 */
function reversePayment(companyId, paymentId, reason, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const pay = db.prepare(`SELECT * FROM payments WHERE id = ? AND company_id = ?`).get(paymentId, companyId);
    if (!pay) throw new Error('Payment not found');
    if (pay.status === 'REVERSED') throw new Error('Payment is already reversed');
    if (!pay.journal_entry_id) throw new Error('Payment has no journal entry to reverse');

    const amount = roundTo(pay.amount, 2);

    // Undo balance side effects (mirror of recordPayment).
    const bankAdjust = (id, delta) => db.prepare(`UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?`).run(delta, id);
    switch (pay.payment_type) {
      case 'CUSTOMER_RECEIPT':
        bankAdjust(pay.bank_account_id, -amount);
        db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`).run(amount, pay.customer_id);
        if (pay.sales_invoice_id) {
          const inv = db.prepare(`SELECT * FROM sales_invoices WHERE id = ?`).get(pay.sales_invoice_id);
          if (inv) {
            const newPaid = Math.max(0, roundTo(inv.amount_paid - amount, 2));
            const newDue = roundTo(inv.total - newPaid, 2);
            const newStatus = newDue <= 0 ? 'PAID' : (newPaid > 0 ? 'PARTIALLY_PAID' : (inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID' ? 'POSTED' : inv.status));
            db.prepare(`UPDATE sales_invoices SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?`).run(newPaid, newDue, newStatus, inv.id);
          }
        }
        break;
      case 'CUSTOMER_REFUND':
        bankAdjust(pay.bank_account_id, amount);
        db.prepare(`UPDATE customers SET current_balance = current_balance - ? WHERE id = ?`).run(amount, pay.customer_id);
        break;
      case 'SUPPLIER_PAYMENT':
        bankAdjust(pay.bank_account_id, amount);
        db.prepare(`UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?`).run(amount, pay.supplier_id);
        if (pay.purchase_invoice_id) {
          const bill = db.prepare(`SELECT * FROM purchase_invoices WHERE id = ?`).get(pay.purchase_invoice_id);
          if (bill) {
            const newPaid = Math.max(0, roundTo(bill.amount_paid - amount, 2));
            const newDue = roundTo(bill.total - newPaid, 2);
            const newStatus = newDue <= 0 ? 'PAID' : (newPaid > 0 ? 'PARTIALLY_PAID' : (bill.status === 'PAID' || bill.status === 'PARTIALLY_PAID' ? 'POSTED' : bill.status));
            db.prepare(`UPDATE purchase_invoices SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?`).run(newPaid, newDue, newStatus, bill.id);
          }
        }
        break;
      case 'DIRECT_EXPENSE':
        bankAdjust(pay.bank_account_id, amount);
        break;
      case 'DIRECT_INCOME':
        bankAdjust(pay.bank_account_id, -amount);
        break;
      case 'TRANSFER':
        bankAdjust(pay.bank_account_id, amount);
        bankAdjust(pay.to_bank_account_id, -amount);
        break;
      default:
        throw new Error(`Unsupported payment type: ${pay.payment_type}`);
    }

    // Proper REVERSAL journal entry (swapped debits/credits, linked to the original).
    reverseJournalEntry(companyId, pay.journal_entry_id, reason || `Correction of payment ${pay.payment_number}`, user);

    db.prepare(`UPDATE payments SET status = 'REVERSED' WHERE id = ?`).run(pay.id);
    logAudit(companyId, user?.id, user?.full_name, 'PAYMENTS', 'REVERSE', pay.id,
      `Reversed payment ${pay.payment_number} (${pay.payment_type}, $${amount}). Reason: ${reason || 'not stated'}`);

    return { paymentId: pay.id, paymentNumber: pay.payment_number, status: 'REVERSED' };
  });
  return tx();
}

/**
 * Creates and posts a Stock Adjustment (loss, damage, found items)
 */
function postStockAdjustment(companyId, adjustmentData, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const { date = new Date().toISOString().split('T')[0], reason, notes = '', lines, warehouseId = null } = adjustmentData;
    if (!lines || lines.length === 0) throw new Error('Stock adjustment lines cannot be empty');

    const adjNumber = nextSequenceNumber(companyId, 'ADJUSTMENT', 'ADJ');
    const adjId = generateId('adj');
    const adjWarehouseId = warehouseId || stockLedger.defaultWarehouseId(db, companyId);

    const defaultInvAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1`).get(companyId);
    const shrinkageAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '5020' LIMIT 1`).get(companyId);
    const gainAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '4500' LIMIT 1`).get(companyId);

    let totalValue = 0;
    const lineInserts = [];
    const moveInserts = [];
    const prodUpdates = [];

    for (const l of lines) {
      const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(l.productId, companyId);
      if (!prod) throw new Error(`Product ${l.productId} not found`);

      const qtyChange = roundTo(Number(l.quantityChange), 4);
      if (qtyChange === 0) continue;
      if (qtyChange < 0 && roundTo(prod.current_stock + qtyChange, 4) < -0.00005) {
        throw new Error(`Insufficient stock for ${prod.name}: cannot adjust by ${qtyChange} (available ${roundTo(prod.current_stock, 4)}).`);
      }

      const unitCost = Number(prod.cost_price) || 0;
      const totalCost = roundTo(Math.abs(qtyChange) * unitCost, 2);
      const newStock = roundTo(prod.current_stock + qtyChange, 4);

      totalValue = roundTo(totalValue + (qtyChange > 0 ? totalCost : -totalCost), 2);

      lineInserts.push({
        id: generateId('adjl'),
        productId: prod.id,
        qtyChange,
        unitCost,
        totalCost,
        notes: l.notes || ''
      });

      moveInserts.push({
        id: generateId('mov'),
        productId: prod.id,
        qty: qtyChange,
        unitCost,
        totalCost,
        newStock,
        type: qtyChange > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT'
      });

      prodUpdates.push({ id: prod.id, newStock });
    }

    if (lineInserts.length === 0) throw new Error('No non-zero quantity adjustments provided');

    // Create journal entry if there is value impact
    let jeId = null;
    const absVal = Math.abs(totalValue);
    if (absVal > 0) {
      const jeLines = [];
      if (totalValue < 0) {
        // Stock Reduction / Shrinkage Loss
        jeLines.push({
          accountId: shrinkageAccount.id,
          description: `Inventory Adjustment Loss (${reason}) - ${adjNumber}`,
          debit: absVal,
          credit: 0
        });
        jeLines.push({
          accountId: defaultInvAccount.id,
          description: `Inventory Asset Reduction - ${adjNumber}`,
          debit: 0,
          credit: absVal
        });
      } else {
        // Stock Gain
        jeLines.push({
          accountId: defaultInvAccount.id,
          description: `Inventory Asset Increase - ${adjNumber}`,
          debit: absVal,
          credit: 0
        });
        jeLines.push({
          accountId: gainAccount.id,
          description: `Inventory Adjustment Gain (${reason}) - ${adjNumber}`,
          debit: 0,
          credit: absVal
        });
      }

      const je = createJournalEntry({
        companyId,
        date,
        reference: adjNumber,
        description: `Stock Adjustment #${adjNumber} (${reason})`,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: adjId,
        lines: jeLines,
        user
      });
      jeId = je.id;
    }

    // Insert Stock Adjustment
    db.prepare(`
      INSERT INTO stock_adjustments (id, company_id, adjustment_number, date, reason, status, total_value, notes, journal_entry_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?, datetime('now'))
    `).run(adjId, companyId, adjNumber, date, reason, totalValue, notes, jeId, user?.id || 'system');

    // Insert lines
    const insertLine = db.prepare(`
      INSERT INTO stock_adjustment_lines (id, adjustment_id, product_id, quantity_change, unit_cost, total_cost, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const li of lineInserts) {
      insertLine.run(li.id, adjId, li.productId, li.qtyChange, li.unitCost, li.totalCost, li.notes);
    }

    // Update stock and insert movements
    const updateStock = db.prepare(`UPDATE products SET current_stock = ? WHERE id = ?`);
    const insertMov = db.prepare(`
      INSERT INTO inventory_movements (
        id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
        quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
      ) VALUES (?, ?, ?, ?, ?, 'STOCK_ADJUSTMENT', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);

    for (let i = 0; i < prodUpdates.length; i++) {
      updateStock.run(prodUpdates[i].newStock, prodUpdates[i].id);
      const m = moveInserts[i];
      stockLedger.syncStockLevelDelta(db, m.productId, adjWarehouseId, m.qty);
      if (m.qty > 0) {
        stockLedger.addFifoLayer(db, {
          companyId, productId: m.productId, warehouseId: adjWarehouseId,
          qty: m.qty, unitCost: m.unitCost, date, sourceType: 'COUNT_VARIANCE', sourceId: adjId
        });
      } else if (m.qty < 0) {
        stockLedger.consumeFifo(db, companyId, m.productId, -m.qty, date);
      }
      insertMov.run(m.id, companyId, m.productId, date, m.type, adjId, adjNumber, m.qty, m.unitCost, m.totalCost, m.newStock, `Adjustment: ${reason}`, user?.id || 'system', adjWarehouseId);
    }

    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'POST', adjId, `Posted stock adjustment ${adjNumber} (${reason}) value: $${totalValue}`);

    return { adjustmentId: adjId, adjustmentNumber: adjNumber, totalValue, journalEntryId: jeId };
  });

  return tx();
}

/**
 * Creates and posts a Physical Inventory Count
 * Reconciles system quantity with counted quantity.
 */
/**
 * Builds count line rows (system vs counted vs variance) for one warehouse.
 * Shared by the direct-post path and the draft/approval workflow.
 */
function buildCountLineRows(db, companyId, warehouseId, lines) {
  const lineRows = [];
  let totalSys = 0;
  let totalCounted = 0;
  let totalVarianceQty = 0;
  let totalVarianceVal = 0;

  for (const l of lines) {
    const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(l.productId, companyId);
    if (!prod) continue;

    // System quantity is the store-level balance of the counted warehouse
    // (for single-store companies this equals the company-wide stock).
    const sysQty = stockLedger.getStockAt(db, prod.id, warehouseId);
    const countedQty = roundTo(Number(l.countedQty), 4);
    if (!(countedQty >= 0)) throw new Error(`Counted quantity for ${prod.name} must be zero or more`);
    const varQty = roundTo(countedQty - sysQty, 4);
    const unitCost = Number(prod.cost_price) || 0;
    const varVal = roundTo(varQty * unitCost, 2);

    totalSys = roundTo(totalSys + sysQty, 4);
    totalCounted = roundTo(totalCounted + countedQty, 4);
    totalVarianceQty = roundTo(totalVarianceQty + varQty, 4);
    totalVarianceVal = roundTo(totalVarianceVal + varVal, 2);

    lineRows.push({
      id: l.id || generateId('cntl'),
      productId: prod.id,
      sysQty,
      countedQty,
      varQty,
      unitCost,
      varVal,
      varianceReason: l.varianceReason || (varQty < 0 ? 'MISSING' : varQty > 0 ? 'EXCESS' : null),
      notes: l.notes || ''
    });
  }

  if (lineRows.length === 0) throw new Error('Physical inventory count lines cannot be empty');
  return { lineRows, totalSys, totalCounted, totalVarianceQty, totalVarianceVal };
}

/**
 * Shared ledger effects of a physical count (JE + stock + movements).
 * Used by the direct posting path and by the approved-count posting path so
 * both workflows behave identically. lineRows: [{ productId, sysQty,
 * countedQty, varQty, unitCost, varVal }].
 */
function applyCountEffects(db, companyId, { countId, countNumber, date, warehouseId, lineRows, user }) {
  const defaultInvAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1`).get(companyId);
  const shrinkageAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '5020' LIMIT 1`).get(companyId);
  const gainAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '4500' LIMIT 1`).get(companyId);

  const totalVarianceQty = roundTo(lineRows.reduce((s, l) => roundTo(s + l.varQty, 4), 0), 4);
  const totalVarianceVal = roundTo(lineRows.reduce((s, l) => roundTo(s + l.varVal, 2), 0), 2);

  // Journal Entry for count variance
  let jeId = null;
  const absVal = Math.abs(totalVarianceVal);
  if (absVal > 0) {
    const jeLines = [];
    if (totalVarianceVal < 0) {
      jeLines.push({ accountId: shrinkageAccount.id, description: `Physical Inventory Count Shortage - ${countNumber}`, debit: absVal, credit: 0 });
      jeLines.push({ accountId: defaultInvAccount.id, description: `Inventory Asset Adjustment - ${countNumber}`, debit: 0, credit: absVal });
    } else {
      jeLines.push({ accountId: defaultInvAccount.id, description: `Inventory Asset Adjustment - ${countNumber}`, debit: absVal, credit: 0 });
      jeLines.push({ accountId: gainAccount.id, description: `Physical Inventory Count Surplus - ${countNumber}`, debit: 0, credit: absVal });
    }
    const je = createJournalEntry({
      companyId,
      date,
      reference: countNumber,
      description: `Physical Inventory Count #${countNumber} Reconciliation`,
      sourceType: 'PHYSICAL_COUNT',
      sourceId: countId,
      lines: jeLines,
      user
    });
    jeId = je.id;
  }

  // Apply stock changes (company total moves by the variance; the counted
  // store is set to the counted quantity; other stores are untouched).
  const updateStock = db.prepare(`UPDATE products SET current_stock = ? WHERE id = ?`);
  const insertMov = db.prepare(`
    INSERT INTO inventory_movements (
      id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
      quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
    ) VALUES (?, ?, ?, ?, 'PHYSICAL_COUNT', 'PHYSICAL_COUNT', ?, ?, ?, ?, ?, ?, 'Physical Count Variance', ?, datetime('now'), ?)
  `);
  for (const li of lineRows) {
    if (!li.varQty) continue;
    const prodNow = db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(li.productId);
    const newCompanyStock = roundTo((prodNow?.current_stock || 0) + li.varQty, 4);
    updateStock.run(newCompanyStock, li.productId);
    stockLedger.setStockLevel(db, li.productId, warehouseId, li.countedQty);
    if (li.varQty > 0) {
      stockLedger.addFifoLayer(db, {
        companyId, productId: li.productId, warehouseId,
        qty: li.varQty, unitCost: li.unitCost, date, sourceType: 'COUNT_VARIANCE', sourceId: countId
      });
    } else {
      stockLedger.consumeFifo(db, companyId, li.productId, -li.varQty, date);
    }
    insertMov.run(generateId('mov'), companyId, li.productId, date, countId, countNumber, li.varQty, li.unitCost, Math.abs(li.varVal), newCompanyStock, user?.id || 'system', warehouseId);
  }

  return { jeId, totalVarianceQty, totalVarianceVal };
}

function postPhysicalCount(companyId, countData, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const { date = new Date().toISOString().split('T')[0], location = 'Main Store', notes = '', lines, warehouseId = null } = countData;
    if (!lines || lines.length === 0) throw new Error('Physical inventory count lines cannot be empty');

    const countNumber = nextSequenceNumber(companyId, 'COUNT', 'CNT');
    const countId = generateId('cnt');
    const countWarehouseId = warehouseId || stockLedger.defaultWarehouseId(db, companyId);

    const { lineRows: lineInserts, totalSys, totalCounted, totalVarianceQty, totalVarianceVal } =
      buildCountLineRows(db, companyId, countWarehouseId, lines);

    // Insert Physical Count Header (journal entry is linked after posting)
    db.prepare(`
      INSERT INTO physical_inventory_counts (
        id, company_id, count_number, date, location, status, total_system_qty, total_counted_qty,
        total_variance_qty, total_variance_value, journal_entry_id, notes, created_by, created_at, warehouse_id
      ) VALUES (?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?, NULL, ?, ?, datetime('now'), ?)
    `).run(
      countId, companyId, countNumber, date, location, totalSys, totalCounted,
      totalVarianceQty, totalVarianceVal, notes, user?.id || 'system', countWarehouseId
    );

    // Insert lines
    const insertLine = db.prepare(`
      INSERT INTO physical_inventory_lines (id, count_id, product_id, system_qty, counted_qty, variance_qty, unit_cost, variance_value, notes, variance_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const li of lineInserts) {
      insertLine.run(li.id, countId, li.productId, li.sysQty, li.countedQty, li.varQty, li.unitCost, li.varVal, li.notes, li.varianceReason || null);
    }

    // Shared posting effects (JE + stock + movements), identical to the
    // submit → approve → post workflow.
    const effects = applyCountEffects(db, companyId, {
      countId, countNumber, date, warehouseId: countWarehouseId, lineRows: lineInserts, user
    });
    const jeId = effects.jeId;
    if (jeId) {
      db.prepare(`UPDATE physical_inventory_counts SET journal_entry_id = ? WHERE id = ?`).run(jeId, countId);
    }

    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'POST', countId, `Completed physical inventory count ${countNumber}: Var Qty ${totalVarianceQty}, Var Value $${totalVarianceVal}`);

    return { countId, countNumber, totalVarianceQty, totalVarianceVal, journalEntryId: jeId };
  });

  return tx();
}

// ---------------------------------------------------------------------------
// Physical count workflow (Inventory Officer): DRAFT → SUBMITTED → APPROVED →
// POSTED, with REJECTED as a return path. The submitter can never approve
// their own count; every step is written to the audit trail.
// ---------------------------------------------------------------------------

function createCountDraft(companyId, countData, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const { date = new Date().toISOString().split('T')[0], location = 'Main Store', notes = '', lines, warehouseId = null } = countData;
    if (!lines || lines.length === 0) throw new Error('Physical inventory count lines cannot be empty');
    const whId = warehouseId || stockLedger.defaultWarehouseId(db, companyId);

    const countNumber = nextSequenceNumber(companyId, 'COUNT', 'CNT');
    const countId = generateId('cnt');
    const { lineRows, totalSys, totalCounted, totalVarianceQty, totalVarianceVal } =
      buildCountLineRows(db, companyId, whId, lines);

    db.prepare(`
      INSERT INTO physical_inventory_counts (
        id, company_id, count_number, date, location, status, total_system_qty, total_counted_qty,
        total_variance_qty, total_variance_value, journal_entry_id, notes, created_by, created_at, warehouse_id
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, NULL, ?, ?, datetime('now'), ?)
    `).run(countId, companyId, countNumber, date, location, totalSys, totalCounted, totalVarianceQty, totalVarianceVal, notes, user?.id || 'system', whId);

    const insertLine = db.prepare(`
      INSERT INTO physical_inventory_lines (id, count_id, product_id, system_qty, counted_qty, variance_qty, unit_cost, variance_value, notes, variance_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const li of lineRows) {
      insertLine.run(li.id, countId, li.productId, li.sysQty, li.countedQty, li.varQty, li.unitCost, li.varVal, li.notes, li.varianceReason || null);
    }

    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'CREATE', countId, `Created draft physical count ${countNumber}`);
    return { countId, countNumber, status: 'DRAFT', totalVarianceQty, totalVarianceVal };
  });
  return tx();
}

function updateCountDraft(companyId, countId, countData, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const count = db.prepare(`SELECT * FROM physical_inventory_counts WHERE id = ? AND company_id = ?`).get(countId, companyId);
    if (!count) throw new Error('Physical count not found');
    if (count.status !== 'DRAFT' && count.status !== 'REJECTED') {
      throw new Error(`Only draft or rejected counts can be edited (current status: ${count.status})`);
    }
    const { date = count.date, location = count.location, notes = count.notes, lines, warehouseId = count.warehouse_id } = countData;
    if (!lines || lines.length === 0) throw new Error('Physical inventory count lines cannot be empty');
    const whId = warehouseId || stockLedger.defaultWarehouseId(db, companyId);
    const { lineRows, totalSys, totalCounted, totalVarianceQty, totalVarianceVal } =
      buildCountLineRows(db, companyId, whId, lines);

    db.prepare(`DELETE FROM physical_inventory_lines WHERE count_id = ?`).run(countId);
    const insertLine = db.prepare(`
      INSERT INTO physical_inventory_lines (id, count_id, product_id, system_qty, counted_qty, variance_qty, unit_cost, variance_value, notes, variance_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const li of lineRows) {
      insertLine.run(li.id, countId, li.productId, li.sysQty, li.countedQty, li.varQty, li.unitCost, li.varVal, li.notes, li.varianceReason || null);
    }
    db.prepare(`
      UPDATE physical_inventory_counts
      SET date = ?, location = ?, notes = ?, warehouse_id = ?, total_system_qty = ?, total_counted_qty = ?,
          total_variance_qty = ?, total_variance_value = ?, status = 'DRAFT', rejection_reason = NULL
      WHERE id = ?
    `).run(date, location, notes || '', whId, totalSys, totalCounted, totalVarianceQty, totalVarianceVal, countId);

    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'UPDATE', countId, `Updated draft physical count ${count.count_number}`);
    return { countId, countNumber: count.count_number, status: 'DRAFT', totalVarianceQty, totalVarianceVal };
  });
  return tx();
}

function submitCountForReview(companyId, countId, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const count = db.prepare(`SELECT * FROM physical_inventory_counts WHERE id = ? AND company_id = ?`).get(countId, companyId);
    if (!count) throw new Error('Physical count not found');
    if (count.status !== 'DRAFT' && count.status !== 'REJECTED') {
      throw new Error(`Only draft or rejected counts can be submitted (current status: ${count.status})`);
    }
    db.prepare(`
      UPDATE physical_inventory_counts
      SET status = 'SUBMITTED', submitted_by = ?, submitted_at = datetime('now'), rejection_reason = NULL
      WHERE id = ?
    `).run(user?.id || 'system', countId);
    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'SUBMIT', countId, `Submitted physical count ${count.count_number} for review`);
    return { countId, countNumber: count.count_number, status: 'SUBMITTED' };
  });
  return tx();
}

function approveCount(companyId, countId, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const count = db.prepare(`SELECT * FROM physical_inventory_counts WHERE id = ? AND company_id = ?`).get(countId, companyId);
    if (!count) throw new Error('Physical count not found');
    if (count.status !== 'SUBMITTED') throw new Error(`Only submitted counts can be approved (current status: ${count.status})`);
    if (user?.id && (user.id === count.submitted_by || user.id === count.created_by)) {
      throw new Error('You cannot approve a count that you created or submitted. An independent reviewer must approve it.');
    }
    db.prepare(`
      UPDATE physical_inventory_counts
      SET status = 'APPROVED', reviewed_by = ?, reviewed_at = datetime('now'), approved_by = ?, approved_at = datetime('now')
      WHERE id = ?
    `).run(user?.id || 'system', user?.id || 'system', countId);
    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'APPROVE', countId,
      `Approved physical count ${count.count_number} (counter: ${count.created_by}, submitted by: ${count.submitted_by})`);
    return { countId, countNumber: count.count_number, status: 'APPROVED' };
  });
  return tx();
}

function rejectCount(companyId, countId, reason, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const count = db.prepare(`SELECT * FROM physical_inventory_counts WHERE id = ? AND company_id = ?`).get(countId, companyId);
    if (!count) throw new Error('Physical count not found');
    if (count.status !== 'SUBMITTED') throw new Error(`Only submitted counts can be rejected (current status: ${count.status})`);
    if (!reason || !String(reason).trim()) throw new Error('A rejection reason is required');
    db.prepare(`
      UPDATE physical_inventory_counts
      SET status = 'REJECTED', reviewed_by = ?, reviewed_at = datetime('now'), rejection_reason = ?
      WHERE id = ?
    `).run(user?.id || 'system', String(reason).trim(), countId);
    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'REJECT', countId,
      `Rejected physical count ${count.count_number}: ${String(reason).trim()}`);
    return { countId, countNumber: count.count_number, status: 'REJECTED' };
  });
  return tx();
}

function postApprovedCount(companyId, countId, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const count = db.prepare(`SELECT * FROM physical_inventory_counts WHERE id = ? AND company_id = ?`).get(countId, companyId);
    if (!count) throw new Error('Physical count not found');
    if (count.status !== 'APPROVED') throw new Error(`Only approved counts can be posted (current status: ${count.status})`);

    const whId = count.warehouse_id || stockLedger.defaultWarehouseId(db, companyId);
    const savedLines = db.prepare(`SELECT * FROM physical_inventory_lines WHERE count_id = ?`).all(countId);
    if (savedLines.length === 0) throw new Error('Physical count has no lines');

    // Recompute variances against CURRENT stock (stock may have moved between
    // counting and posting); counted quantities are the authoritative input.
    const lineRows = savedLines.map((sl) => {
      const prod = db.prepare(`SELECT cost_price, name FROM products WHERE id = ?`).get(sl.product_id);
      const sysQty = stockLedger.getStockAt(db, sl.product_id, whId);
      const countedQty = roundTo(sl.counted_qty, 4);
      const varQty = roundTo(countedQty - sysQty, 4);
      const unitCost = Number(prod?.cost_price) || 0;
      const varVal = roundTo(varQty * unitCost, 2);
      return { productId: sl.product_id, sysQty, countedQty, varQty, unitCost, varVal };
    });

    const updateLine = db.prepare(`
      UPDATE physical_inventory_lines SET system_qty = ?, variance_qty = ?, unit_cost = ?, variance_value = ? WHERE id = ?
    `);
    savedLines.forEach((sl, i) => updateLine.run(lineRows[i].sysQty, lineRows[i].varQty, lineRows[i].unitCost, lineRows[i].varVal, sl.id));

    const effects = applyCountEffects(db, companyId, {
      countId, countNumber: count.count_number, date: count.date, warehouseId: whId, lineRows, user
    });

    const totalSys = roundTo(lineRows.reduce((s, l) => roundTo(s + l.sysQty, 4), 0), 4);
    const totalCounted = roundTo(lineRows.reduce((s, l) => roundTo(s + l.countedQty, 4), 0), 4);
    db.prepare(`
      UPDATE physical_inventory_counts
      SET status = 'POSTED', journal_entry_id = ?, total_system_qty = ?, total_counted_qty = ?,
          total_variance_qty = ?, total_variance_value = ?
      WHERE id = ?
    `).run(effects.jeId, totalSys, totalCounted, effects.totalVarianceQty, effects.totalVarianceVal, countId);

    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'POST', countId,
      `Posted approved physical count ${count.count_number} (counter: ${count.created_by}, reviewer/approver: ${count.approved_by}): Var Qty ${effects.totalVarianceQty}, Var Value $${effects.totalVarianceVal}`);
    return { countId, countNumber: count.count_number, status: 'POSTED', ...effects };
  });
  return tx();
}

/**
 * Creates and posts a Credit Note (Sales return / refund)
 */
function postCreditNote(companyId, creditNoteData, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const {
      invoiceId,
      customerId,
      date = new Date().toISOString().split('T')[0],
      reason,
      notes = '',
      restockItems = 1,
      lines
    } = creditNoteData;

    if (!lines || lines.length === 0) throw new Error('Credit note lines cannot be empty');

    const customer = db.prepare(`SELECT * FROM customers WHERE id = ? AND company_id = ?`).get(customerId, companyId);
    if (!customer) throw new Error('Customer not found');

    // ----- Return controls: no duplicate returns, no over-refund -----
    let invoice = null;
    let alreadyCreditedTotal = 0;
    const remainingQtyByLine = new Map(); // invoice line id -> still returnable qty
    if (invoiceId) {
      invoice = db.prepare(`SELECT * FROM sales_invoices WHERE id = ? AND company_id = ?`).get(invoiceId, companyId);
      if (!invoice) throw new Error('Linked sales invoice not found');
      if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
        throw new Error('Credit notes can only be issued against posted invoices');
      }
      alreadyCreditedTotal = roundTo(
        db.prepare(`SELECT COALESCE(SUM(total), 0) AS t FROM credit_notes WHERE invoice_id = ? AND status <> 'CANCELLED'`).get(invoiceId).t, 2
      );
      if (alreadyCreditedTotal >= roundTo(invoice.total, 2)) {
        throw new Error(`Invoice ${invoice.invoice_number} has already been fully credited. Duplicate credit notes are not allowed.`);
      }
      const invLines = db.prepare(`SELECT * FROM sales_invoice_lines WHERE invoice_id = ?`).all(invoiceId);
      const creditedByProduct = new Map();
      const creditedRows = db.prepare(`
        SELECT cnl.product_id, cnl.quantity
        FROM credit_note_lines cnl
        JOIN credit_notes cn ON cn.id = cnl.credit_note_id
        WHERE cn.invoice_id = ? AND cn.status <> 'CANCELLED'
      `).all(invoiceId);
      for (const cr of creditedRows) {
        const key = cr.product_id || '_';
        creditedByProduct.set(key, roundTo((creditedByProduct.get(key) || 0) + cr.quantity, 4));
      }
      for (const il of invLines) {
        const key = il.product_id || '_';
        const already = creditedByProduct.get(key) || 0;
        remainingQtyByLine.set(key, roundTo((remainingQtyByLine.get(key) || 0) + il.quantity - already, 4));
      }
    }

    const cnNumber = nextSequenceNumber(companyId, 'CREDIT_NOTE', 'CN');
    const cnId = generateId('cn');

    const arAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND subtype = 'ACCOUNTS_RECEIVABLE' LIMIT 1`).get(companyId);
    const salesReturnsAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND (code = '4090' OR code = '4010') LIMIT 1`).get(companyId);
    const taxAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '2110' LIMIT 1`).get(companyId);
    const defaultCogsAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '5010' LIMIT 1`).get(companyId);
    const defaultInvAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1`).get(companyId);

    let subtotal = 0;
    let taxTotal = 0;
    let totalCogsRestored = 0;

    const lineInserts = [];
    const inventoryRestores = [];

    for (const l of lines) {
      const qty = roundTo(Number(l.quantity), 4);
      const unitPrice = roundTo(Number(l.unitPrice), 2);
      const taxRate = roundTo(Number(l.taxRate || 0), 2);
      if (!(qty > 0)) throw new Error('Credit note line quantity must be greater than zero');

      // Per-line over-return guard against the linked invoice.
      if (invoice) {
        const key = l.productId || '_';
        const remaining = remainingQtyByLine.has(key) ? remainingQtyByLine.get(key) : 0;
        if (qty > remaining + 0.00005) {
          throw new Error(`Return quantity for "${l.description || l.productId}" exceeds the still-returnable quantity (${remaining}) of invoice ${invoice.invoice_number}. Over-returns and duplicate returns are blocked.`);
        }
        remainingQtyByLine.set(key, roundTo(remaining - qty, 4));
      }

      const lineSub = roundTo(qty * unitPrice, 2);
      const lineTax = roundTo(lineSub * (taxRate / 100), 2);
      const lineTot = roundTo(lineSub + lineTax, 2);

      subtotal = roundTo(subtotal + lineSub, 2);
      taxTotal = roundTo(taxTotal + lineTax, 2);

      let unitCost = 0;
      if (l.productId) {
        const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(l.productId, companyId);
        if (prod) {
          unitCost = Number(prod.cost_price) || 0;
          if (restockItems && prod.type === 'GOODS') {
            const cogsVal = roundTo(qty * unitCost, 2);
            totalCogsRestored = roundTo(totalCogsRestored + cogsVal, 2);
            const newStock = roundTo(prod.current_stock + qty, 4);
            inventoryRestores.push({
              productId: prod.id,
              qty,
              unitCost,
              cogsVal,
              newStock
            });
          }
        }
      }

      lineInserts.push({
        id: generateId('cnl'),
        productId: l.productId || null,
        description: l.description || 'Returned Item',
        qty,
        unitPrice,
        unitCost,
        taxRate,
        taxAmount: lineTax,
        lineTotal: lineTot
      });
    }

    const total = roundTo(subtotal + taxTotal, 2);

    // Invoice-level over-refund guard.
    if (invoice && roundTo(alreadyCreditedTotal + total, 2) > roundTo(invoice.total, 2) + 0.005) {
      throw new Error(`This credit note would refund more than invoice ${invoice.invoice_number} allows (invoice total ${invoice.total}, already credited ${alreadyCreditedTotal}).`);
    }

    // Journal Entry for Credit Note:
    // Debit: Sales Returns / Revenue (reduces revenue)
    // Debit: Sales Tax Payable (reduces VAT liability)
    // Credit: Accounts Receivable (reduces customer AR)
    // If restocked:
    // Debit: Merchandise Inventory
    // Credit: COGS
    const jeLines = [];
    jeLines.push({
      accountId: salesReturnsAccount.id,
      description: `Sales Return: CN #${cnNumber}`,
      debit: subtotal,
      credit: 0
    });

    if (taxTotal > 0) {
      jeLines.push({
        accountId: taxAccount.id,
        description: `VAT Output Reversal: CN #${cnNumber}`,
        debit: taxTotal,
        credit: 0
      });
    }

    jeLines.push({
      accountId: arAccount.id,
      description: `AR Credit: CN #${cnNumber} - ${customer.name}`,
      debit: 0,
      credit: total
    });

    if (totalCogsRestored > 0) {
      jeLines.push({
        accountId: defaultInvAccount.id,
        description: `Restock Inventory: CN #${cnNumber}`,
        debit: totalCogsRestored,
        credit: 0
      });
      jeLines.push({
        accountId: defaultCogsAccount.id,
        description: `COGS Reversal: CN #${cnNumber}`,
        debit: 0,
        credit: totalCogsRestored
      });
    }

    const je = createJournalEntry({
      companyId,
      date,
      reference: cnNumber,
      description: `Credit Note #${cnNumber} - ${customer.name} (${reason})`,
      sourceType: 'CREDIT_NOTE',
      sourceId: cnId,
      lines: jeLines,
      user
    });

    // Insert Credit Note header
    db.prepare(`
      INSERT INTO credit_notes (
        id, company_id, credit_note_number, invoice_id, customer_id, date, reason,
        subtotal, tax_total, total, restock_items, status, journal_entry_id, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, datetime('now'))
    `).run(
      cnId, companyId, cnNumber, invoiceId || null, customer.id, date, reason,
      subtotal, taxTotal, total, restockItems ? 1 : 0, je.id, notes, user?.id || 'system'
    );

    // Insert lines
    const insertLine = db.prepare(`
      INSERT INTO credit_note_lines (id, credit_note_id, product_id, description, quantity, unit_price, unit_cost, tax_rate, tax_amount, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const li of lineInserts) {
      insertLine.run(li.id, cnId, li.productId, li.description, li.qty, li.unitPrice, li.unitCost, li.taxRate, li.taxAmount, li.lineTotal);
    }

    // Apply restock if enabled
    if (restockItems) {
      const restockWarehouseId = stockLedger.defaultWarehouseId(db, companyId);
      const updateStock = db.prepare(`UPDATE products SET current_stock = ? WHERE id = ?`);
      const insertMov = db.prepare(`
        INSERT INTO inventory_movements (
          id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
          quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
        ) VALUES (?, ?, ?, ?, 'SALE_RETURN_IN', 'CREDIT_NOTE', ?, ?, ?, ?, ?, ?, 'Sales Return Restock', ?, datetime('now'), ?)
      `);

      for (const ir of inventoryRestores) {
        updateStock.run(ir.newStock, ir.productId);
        stockLedger.syncStockLevelDelta(db, ir.productId, restockWarehouseId, ir.qty);
        stockLedger.addFifoLayer(db, {
          companyId, productId: ir.productId, warehouseId: restockWarehouseId,
          qty: ir.qty, unitCost: ir.unitCost, date, sourceType: 'SALES_RETURN', sourceId: cnId
        });
        insertMov.run(generateId('mov'), companyId, ir.productId, date, cnId, cnNumber, ir.qty, ir.unitCost, ir.cogsVal, ir.newStock, user?.id || 'system', restockWarehouseId);
      }
    }

    // Reduce Customer balance
    db.prepare(`UPDATE customers SET current_balance = current_balance - ? WHERE id = ?`).run(total, customer.id);

    logAudit(companyId, user?.id, user?.full_name, 'SALES', 'POST', cnId, `Posted Credit Note ${cnNumber} for customer ${customer.name} ($${total})`);

    return { creditNoteId: cnId, creditNoteNumber: cnNumber, total, journalEntryId: je.id };
  });

  return tx();
}

/**
 * Creates and posts a Purchase Return
 */
function postPurchaseReturn(companyId, returnData, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const { billId, supplierId, date = new Date().toISOString().split('T')[0], reason, notes = '', lines } = returnData;
    if (!lines || lines.length === 0) throw new Error('Return lines cannot be empty');

    const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ? AND company_id = ?`).get(supplierId, companyId);
    if (!supplier) throw new Error('Supplier not found');

    const retNumber = nextSequenceNumber(companyId, 'PURCHASE_RETURN', 'PRET');
    const retId = generateId('pret');
    const retWarehouseId = stockLedger.defaultWarehouseId(db, companyId);

    const apAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND subtype = 'ACCOUNTS_PAYABLE' LIMIT 1`).get(companyId);
    const defaultInvAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1`).get(companyId);
    const taxInputAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1150' LIMIT 1`).get(companyId);

    let subtotal = 0;
    let taxTotal = 0;

    const lineInserts = [];
    const stockReductions = [];

    for (const l of lines) {
      const qty = roundTo(Number(l.quantity), 4);
      const unitCost = roundTo(Number(l.unitCost), 2);
      const taxRate = roundTo(Number(l.taxRate || 0), 2);
      const lineSub = roundTo(qty * unitCost, 2);
      const lineTax = roundTo(lineSub * (taxRate / 100), 2);
      const lineTot = roundTo(lineSub + lineTax, 2);

      subtotal = roundTo(subtotal + lineSub, 2);
      taxTotal = roundTo(taxTotal + lineTax, 2);

      if (l.productId) {
        const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(l.productId, companyId);
        if (prod && prod.type === 'GOODS') {
          if (roundTo(prod.current_stock - qty, 4) < -0.00005) {
            throw new Error(`Insufficient stock for ${prod.name}: cannot return ${qty} to the supplier (available ${roundTo(prod.current_stock, 4)}).`);
          }
          const newStock = roundTo(prod.current_stock - qty, 4);
          stockReductions.push({
            productId: prod.id,
            qty,
            unitCost,
            lineSub,
            newStock
          });
        }
      }

      lineInserts.push({
        id: generateId('pretl'),
        productId: l.productId || null,
        description: l.description || 'Returned to Supplier',
        qty,
        unitCost,
        taxRate,
        taxAmount: lineTax,
        lineTotal: lineTot
      });
    }

    const total = roundTo(subtotal + taxTotal, 2);

    // Journal Entry:
    // Debit: Accounts Payable (reduces amount owed to supplier)
    // Credit: Merchandise Inventory (reduces inventory asset)
    // Credit: VAT Input (reverses input VAT)
    const jeLines = [];
    jeLines.push({
      accountId: apAccount.id,
      description: `AP Return Debit: #${retNumber} - ${supplier.name}`,
      debit: total,
      credit: 0
    });

    jeLines.push({
      accountId: defaultInvAccount.id,
      description: `Inventory Return Credit: #${retNumber}`,
      debit: 0,
      credit: subtotal
    });

    if (taxTotal > 0) {
      jeLines.push({
        accountId: taxInputAccount.id,
        description: `VAT Input Reversal: #${retNumber}`,
        debit: 0,
        credit: taxTotal
      });
    }

    const je = createJournalEntry({
      companyId,
      date,
      reference: retNumber,
      description: `Purchase Return #${retNumber} to ${supplier.name} (${reason})`,
      sourceType: 'PURCHASE_RETURN',
      sourceId: retId,
      lines: jeLines,
      user
    });

    // Insert Purchase Return header
    db.prepare(`
      INSERT INTO purchase_returns (id, company_id, return_number, bill_id, supplier_id, date, reason, subtotal, tax_total, total, status, journal_entry_id, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, datetime('now'))
    `).run(retId, companyId, retNumber, billId || null, supplier.id, date, reason, subtotal, taxTotal, total, je.id, notes, user?.id || 'system');

    // Insert lines
    const insertLine = db.prepare(`
      INSERT INTO purchase_return_lines (id, return_id, product_id, description, quantity, unit_cost, tax_rate, tax_amount, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const li of lineInserts) {
      insertLine.run(li.id, retId, li.productId, li.description, li.qty, li.unitCost, li.taxRate, li.taxAmount, li.lineTotal);
    }

    // Apply stock reductions
    const updateStock = db.prepare(`UPDATE products SET current_stock = ? WHERE id = ?`);
    const insertMov = db.prepare(`
      INSERT INTO inventory_movements (
        id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
        quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
      ) VALUES (?, ?, ?, ?, 'PURCHASE_RETURN_OUT', 'PURCHASE_RETURN', ?, ?, ?, ?, ?, ?, 'Purchase Return to Vendor', ?, datetime('now'), ?)
    `);

    for (const sr of stockReductions) {
      updateStock.run(sr.newStock, sr.productId);
      stockLedger.syncStockLevelDelta(db, sr.productId, retWarehouseId, -sr.qty);
      stockLedger.consumeFifo(db, companyId, sr.productId, sr.qty, date);
      insertMov.run(generateId('mov'), companyId, sr.productId, date, retId, retNumber, -sr.qty, sr.unitCost, sr.lineSub, sr.newStock, user?.id || 'system', retWarehouseId);
    }

    // Reduce Supplier balance
    db.prepare(`UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?`).run(total, supplier.id);

    logAudit(companyId, user?.id, user?.full_name, 'PURCHASES', 'POST', retId, `Posted Purchase Return ${retNumber} to ${supplier.name} ($${total})`);

    return { returnId: retId, returnNumber: retNumber, total, journalEntryId: je.id };
  });

  return tx();
}

module.exports = {
  roundTo,
  generateId,
  nextSequenceNumber,
  logAudit,
  createJournalEntry,
  reverseJournalEntry,
  postSalesInvoice,
  postWalkInSale,
  postPurchaseInvoice,
  recordPayment,
  reversePayment,
  postStockAdjustment,
  postPhysicalCount,
  createCountDraft,
  updateCountDraft,
  submitCountForReview,
  approveCount,
  rejectCount,
  postApprovedCount,
  postCreditNote,
  postPurchaseReturn
};
