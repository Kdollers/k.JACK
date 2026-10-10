const { getDb } = require('./db');
const { roundTo } = require('./accountingEngine');

function getDashboardStats(companyId, startDate, endDate) {
  const db = getDb();
  const dateFilter = startDate && endDate ? `AND date BETWEEN '${startDate}' AND '${endDate}'` : '';
  const dateFilterJEL = startDate && endDate ? `AND je.date BETWEEN '${startDate}' AND '${endDate}'` : '';

  // 1. Total Sales
  const salesRow = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total_sales, COUNT(*) as sales_count
    FROM sales_invoices
    WHERE company_id = ? AND status != 'CANCELLED' ${dateFilter}
  `).get(companyId);

  // 2. Total Purchases
  const purchasesRow = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total_purchases, COUNT(*) as purchase_count
    FROM purchase_invoices
    WHERE company_id = ? AND status != 'CANCELLED' ${dateFilter}
  `).get(companyId);

  // 3. Accounts Receivable & Payable
  const arRow = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0) as total_ar
    FROM customers WHERE company_id = ?
  `).get(companyId);

  const apRow = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0) as total_ap
    FROM suppliers WHERE company_id = ?
  `).get(companyId);

  // 4. Cash and Bank Balances
  const cashRow = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0) as cash_balance
    FROM bank_accounts WHERE company_id = ? AND account_type = 'CASH'
  `).get(companyId);

  const bankRow = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0) as bank_balance
    FROM bank_accounts WHERE company_id = ? AND account_type IN ('BANK', 'MOBILE_MONEY')
  `).get(companyId);

  // 5. Inventory Value
  const invRow = db.prepare(`
    SELECT COALESCE(SUM(current_stock * cost_price), 0) as total_inventory_value,
           COUNT(*) as total_items,
           SUM(CASE WHEN current_stock <= min_stock_level THEN 1 ELSE 0 END) as low_stock_count
    FROM products WHERE company_id = ? AND type = 'GOODS' AND active = 1
  `).get(companyId);

  // 6. Net Profit calculation from P&L
  const pnl = getProfitAndLoss(companyId, startDate || '2020-01-01', endDate || new Date().toISOString().split('T')[0]);

  // 7. Recent Transactions (latest 10)
  const recentInvoices = db.prepare(`
    SELECT i.id, i.invoice_number as number, i.date, 'SALES_INVOICE' as type, c.name as party, i.total as amount, i.status
    FROM sales_invoices i
    JOIN customers c ON i.customer_id = c.id
    WHERE i.company_id = ?
    ORDER BY i.date DESC, i.created_at DESC LIMIT 5
  `).all(companyId);

  const recentBills = db.prepare(`
    SELECT b.id, b.bill_number as number, b.date, 'PURCHASE_BILL' as type, s.name as party, b.total as amount, b.status
    FROM purchase_invoices b
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.company_id = ?
    ORDER BY b.date DESC, b.created_at DESC LIMIT 5
  `).all(companyId);

  const recentTransactions = [...recentInvoices, ...recentBills]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

  // 8. Low stock alert items
  const lowStockItems = db.prepare(`
    SELECT id, sku, name, current_stock, min_stock_level, unit, cost_price, warehouse_location
    FROM products
    WHERE company_id = ? AND type = 'GOODS' AND active = 1 AND current_stock <= min_stock_level
    ORDER BY (current_stock - min_stock_level) ASC
    LIMIT 6
  `).all(companyId);

  // 9. Outstanding Customer Balances
  const topDebtors = db.prepare(`
    SELECT id, code, name, phone, current_balance, credit_limit
    FROM customers
    WHERE company_id = ? AND current_balance > 0
    ORDER BY current_balance DESC
    LIMIT 5
  `).all(companyId);

  // 10. Outstanding Supplier Balances
  const topCreditors = db.prepare(`
    SELECT id, code, name, phone, current_balance
    FROM suppliers
    WHERE company_id = ? AND current_balance > 0
    ORDER BY current_balance DESC
    LIMIT 5
  `).all(companyId);

  return {
    totalSales: roundTo(salesRow.total_sales, 2),
    salesCount: salesRow.sales_count,
    totalPurchases: roundTo(purchasesRow.total_purchases, 2),
    purchasesCount: purchasesRow.purchase_count,
    accountsReceivable: roundTo(arRow.total_ar, 2),
    accountsPayable: roundTo(apRow.total_ap, 2),
    cashBalance: roundTo(cashRow.cash_balance, 2),
    bankBalance: roundTo(bankRow.bank_balance, 2),
    totalCashBank: roundTo(cashRow.cash_balance + bankRow.bank_balance, 2),
    inventoryValue: roundTo(invRow.total_inventory_value, 2),
    lowStockCount: invRow.low_stock_count || 0,
    grossProfit: pnl.grossProfit,
    netProfit: pnl.netProfit,
    recentTransactions,
    lowStockItems,
    topDebtors,
    topCreditors
  };
}

function getTrialBalance(companyId, asOfDate) {
  const db = getDb();
  const dateCutoff = asOfDate || new Date().toISOString().split('T')[0];

  const accounts = db.prepare(`
    SELECT a.id, a.code, a.name, a.type, a.subtype, a.normal_balance,
           COALESCE(SUM(jel.debit), 0) as total_debit,
           COALESCE(SUM(jel.credit), 0) as total_credit
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON a.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.company_id = a.company_id AND je.status = 'POSTED' AND je.date <= ?
    WHERE a.company_id = ? AND a.active = 1
    GROUP BY a.id
    ORDER BY a.code ASC
  `).all(dateCutoff, companyId);

  let grandDebit = 0;
  let grandCredit = 0;
  let netDebitTotal = 0;
  let netCreditTotal = 0;

  const rows = accounts.map(acc => {
    const totalDebit = roundTo(acc.total_debit, 2);
    const totalCredit = roundTo(acc.total_credit, 2);
    const diff = roundTo(totalDebit - totalCredit, 2);

    let netDebit = 0;
    let netCredit = 0;

    if (diff > 0) {
      netDebit = diff;
    } else if (diff < 0) {
      netCredit = Math.abs(diff);
    }

    grandDebit = roundTo(grandDebit + totalDebit, 2);
    grandCredit = roundTo(grandCredit + totalCredit, 2);
    netDebitTotal = roundTo(netDebitTotal + netDebit, 2);
    netCreditTotal = roundTo(netCreditTotal + netCredit, 2);

    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      subtype: acc.subtype,
      normalBalance: acc.normal_balance,
      totalDebit,
      totalCredit,
      netDebit,
      netCredit
    };
  }).filter(r => r.totalDebit !== 0 || r.totalCredit !== 0);

  return {
    asOfDate: dateCutoff,
    rows,
    grandDebit,
    grandCredit,
    netDebitTotal,
    netCreditTotal,
    isBalanced: Math.abs(grandDebit - grandCredit) < 0.01 && Math.abs(netDebitTotal - netCreditTotal) < 0.01
  };
}

function getProfitAndLoss(companyId, startDate, endDate) {
  const db = getDb();
  const start = startDate || '2020-01-01';
  const end = endDate || new Date().toISOString().split('T')[0];

  const accounts = db.prepare(`
    SELECT a.id, a.code, a.name, a.type, a.subtype, a.normal_balance,
           COALESCE(SUM(jel.debit), 0) as total_debit,
           COALESCE(SUM(jel.credit), 0) as total_credit
    FROM accounts a
    JOIN journal_entry_lines jel ON a.id = jel.account_id
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE a.company_id = ? AND je.status = 'POSTED'
      AND a.type IN ('REVENUE', 'COGS', 'EXPENSE')
      AND je.date BETWEEN ? AND ?
    GROUP BY a.id
    ORDER BY a.code ASC
  `).all(companyId, start, end);

  const revenueRows = [];
  const cogsRows = [];
  const expenseRows = [];

  let totalRevenue = 0;
  let totalCogs = 0;
  let totalExpenses = 0;

  for (const acc of accounts) {
    const debit = roundTo(acc.total_debit, 2);
    const credit = roundTo(acc.total_credit, 2);

    if (acc.type === 'REVENUE') {
      // Normal balance: Credit (Credit - Debit)
      const amount = roundTo(credit - debit, 2);
      if (amount !== 0) {
        revenueRows.push({ code: acc.code, name: acc.name, amount });
        totalRevenue = roundTo(totalRevenue + amount, 2);
      }
    } else if (acc.type === 'COGS') {
      // Normal balance: Debit (Debit - Credit)
      const amount = roundTo(debit - credit, 2);
      if (amount !== 0) {
        cogsRows.push({ code: acc.code, name: acc.name, amount });
        totalCogs = roundTo(totalCogs + amount, 2);
      }
    } else if (acc.type === 'EXPENSE') {
      // Normal balance: Debit (Debit - Credit)
      const amount = roundTo(debit - credit, 2);
      if (amount !== 0) {
        expenseRows.push({ code: acc.code, name: acc.name, amount });
        totalExpenses = roundTo(totalExpenses + amount, 2);
      }
    }
  }

  const grossProfit = roundTo(totalRevenue - totalCogs, 2);
  const netProfit = roundTo(grossProfit - totalExpenses, 2);

  return {
    startDate: start,
    endDate: end,
    revenueRows,
    totalRevenue,
    cogsRows,
    totalCogs,
    grossProfit,
    expenseRows,
    totalExpenses,
    netProfit
  };
}

function getBalanceSheet(companyId, asOfDate) {
  const db = getDb();
  const dateCutoff = asOfDate || new Date().toISOString().split('T')[0];

  const accounts = db.prepare(`
    SELECT a.id, a.code, a.name, a.type, a.subtype, a.normal_balance,
           COALESCE(SUM(jel.debit), 0) as total_debit,
           COALESCE(SUM(jel.credit), 0) as total_credit
    FROM accounts a
    JOIN journal_entry_lines jel ON a.id = jel.account_id
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE a.company_id = ? AND je.status = 'POSTED'
      AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
      AND je.date <= ?
    GROUP BY a.id
    ORDER BY a.code ASC
  `).all(companyId, dateCutoff);

  const assetsCurrent = [];
  const assetsFixed = [];
  const liabilitiesCurrent = [];
  const liabilitiesLongTerm = [];
  const equityRows = [];

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  for (const acc of accounts) {
    const debit = roundTo(acc.total_debit, 2);
    const credit = roundTo(acc.total_credit, 2);

    if (acc.type === 'ASSET') {
      // Normal balance: Debit (Debit - Credit)
      const amount = roundTo(debit - credit, 2);
      if (amount !== 0) {
        const item = { code: acc.code, name: acc.name, amount };
        if (acc.subtype === 'FIXED_ASSET') {
          assetsFixed.push(item);
        } else {
          assetsCurrent.push(item);
        }
        totalAssets = roundTo(totalAssets + amount, 2);
      }
    } else if (acc.type === 'LIABILITY') {
      // Normal balance: Credit (Credit - Debit)
      const amount = roundTo(credit - debit, 2);
      if (amount !== 0) {
        const item = { code: acc.code, name: acc.name, amount };
        if (acc.subtype === 'LONG_TERM_LIABILITY') {
          liabilitiesLongTerm.push(item);
        } else {
          liabilitiesCurrent.push(item);
        }
        totalLiabilities = roundTo(totalLiabilities + amount, 2);
      }
    } else if (acc.type === 'EQUITY') {
      // Normal balance: Credit (Credit - Debit)
      const amount = roundTo(credit - debit, 2);
      if (amount !== 0) {
        equityRows.push({ code: acc.code, name: acc.name, amount });
        totalEquity = roundTo(totalEquity + amount, 2);
      }
    }
  }

  // Calculate Retained Current Period Net Income (All Revenue - COGS - Expenses up to dateCutoff)
  const pnl = getProfitAndLoss(companyId, '1900-01-01', dateCutoff);
  const currentPeriodEarnings = pnl.netProfit;

  if (currentPeriodEarnings !== 0) {
    equityRows.push({
      code: 'NET-INCOME',
      name: 'Current Period Net Earnings / (Loss)',
      amount: currentPeriodEarnings
    });
    totalEquity = roundTo(totalEquity + currentPeriodEarnings, 2);
  }

  const totalLiabilitiesAndEquity = roundTo(totalLiabilities + totalEquity, 2);
  const diff = roundTo(totalAssets - totalLiabilitiesAndEquity, 2);

  return {
    asOfDate: dateCutoff,
    assets: {
      current: assetsCurrent,
      fixed: assetsFixed,
      total: totalAssets
    },
    liabilities: {
      current: liabilitiesCurrent,
      longTerm: liabilitiesLongTerm,
      total: totalLiabilities
    },
    equity: {
      rows: equityRows,
      total: totalEquity
    },
    totalLiabilitiesAndEquity,
    isBalanced: Math.abs(diff) < 0.02,
    difference: diff
  };
}

function getCashFlowStatement(companyId, startDate, endDate) {
  const db = getDb();
  const start = startDate || '2026-01-01';
  const end = endDate || new Date().toISOString().split('T')[0];

  // Net income for the period
  const pnl = getProfitAndLoss(companyId, start, end);
  const netIncome = pnl.netProfit;

  // Operating cash activities from payments
  const receipts = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE company_id = ? AND payment_type IN ('CUSTOMER_RECEIPT', 'DIRECT_INCOME')
      AND date BETWEEN ? AND ?
  `).get(companyId, start, end).total;

  const paymentsOut = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE company_id = ? AND payment_type IN ('SUPPLIER_PAYMENT', 'DIRECT_EXPENSE')
      AND date BETWEEN ? AND ?
  `).get(companyId, start, end).total;

  const netOperatingCash = roundTo(receipts - paymentsOut, 2);

  // Cash balances at start and end
  const cashAccounts = db.prepare(`SELECT id, account_id FROM bank_accounts WHERE company_id = ?`).all(companyId);
  const accIds = cashAccounts.map(c => c.account_id);

  let beginningCash = 0;
  let endingCash = 0;

  if (accIds.length > 0) {
    const placeholders = accIds.map(() => '?').join(',');
    const startBal = db.prepare(`
      SELECT COALESCE(SUM(debit - credit), 0) as bal
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE je.company_id = ? AND je.status = 'POSTED' AND je.date < ?
        AND jel.account_id IN (${placeholders})
    `).get(companyId, start, ...accIds);

    const endBal = db.prepare(`
      SELECT COALESCE(SUM(debit - credit), 0) as bal
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE je.company_id = ? AND je.status = 'POSTED' AND je.date <= ?
        AND jel.account_id IN (${placeholders})
    `).get(companyId, end, ...accIds);

    beginningCash = roundTo(startBal.bal, 2);
    endingCash = roundTo(endBal.bal, 2);
  }

  return {
    startDate: start,
    endDate: end,
    netIncome,
    cashReceiptsFromCustomers: roundTo(receipts, 2),
    cashPaidToSuppliersAndExpenses: roundTo(paymentsOut, 2),
    netOperatingCash,
    beginningCash,
    endingCash,
    netChangeInCash: roundTo(endingCash - beginningCash, 2)
  };
}

function getGeneralLedger(companyId, accountId, startDate, endDate) {
  const db = getDb();
  const start = startDate || '2020-01-01';
  const end = endDate || new Date().toISOString().split('T')[0];

  const account = db.prepare(`SELECT * FROM accounts WHERE id = ? AND company_id = ?`).get(accountId, companyId);
  if (!account) throw new Error('Account not found');

  // Calculate opening balance before startDate
  const openingRow = db.prepare(`
    SELECT COALESCE(SUM(jel.debit), 0) as open_debit, COALESCE(SUM(jel.credit), 0) as open_credit
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.company_id = ? AND je.status = 'POSTED' AND jel.account_id = ? AND je.date < ?
  `).get(companyId, accountId, start);

  const isNormalDebit = account.normal_balance === 'DEBIT';
  const openingBalance = isNormalDebit
    ? roundTo(openingRow.open_debit - openingRow.open_credit, 2)
    : roundTo(openingRow.open_credit - openingRow.open_debit, 2);

  // Get lines in range
  const lines = db.prepare(`
    SELECT jel.id, je.date, je.entry_number, je.reference, je.source_type,
           COALESCE(jel.description, je.description) as description,
           jel.debit, jel.credit
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.company_id = ? AND je.status = 'POSTED' AND jel.account_id = ?
      AND je.date BETWEEN ? AND ?
    ORDER BY je.date ASC, je.entry_number ASC, jel.line_number ASC
  `).all(companyId, accountId, start, end);

  let runningBalance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const entries = lines.map(line => {
    const debit = roundTo(line.debit, 2);
    const credit = roundTo(line.credit, 2);
    totalDebit = roundTo(totalDebit + debit, 2);
    totalCredit = roundTo(totalCredit + credit, 2);

    if (isNormalDebit) {
      runningBalance = roundTo(runningBalance + debit - credit, 2);
    } else {
      runningBalance = roundTo(runningBalance + credit - debit, 2);
    }

    return {
      id: line.id,
      date: line.date,
      entryNumber: line.entry_number,
      reference: line.reference,
      sourceType: line.source_type,
      description: line.description,
      debit,
      credit,
      runningBalance
    };
  });

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalance: account.normal_balance
    },
    startDate: start,
    endDate: end,
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance: runningBalance,
    entries
  };
}

function getArAging(companyId, asOfDate) {
  const db = getDb();
  const dateCutoff = asOfDate || new Date().toISOString().split('T')[0];

  const customers = db.prepare(`
    SELECT id, code, name, phone, email, current_balance
    FROM customers
    WHERE company_id = ? AND active = 1 AND current_balance > 0
    ORDER BY current_balance DESC
  `).all(companyId);

  const rows = customers.map(cust => {
    // Get unpaid/posted invoices for customer
    const invoices = db.prepare(`
      SELECT invoice_number, date, due_date, total, amount_paid, balance_due,
             julianday(?) - julianday(date) as days_old
      FROM sales_invoices
      WHERE company_id = ? AND customer_id = ? AND status IN ('POSTED', 'PARTIALLY_PAID') AND balance_due > 0
    `).all(dateCutoff, companyId, cust.id);

    let current = 0;
    let days30 = 0;
    let days60 = 0;
    let days90 = 0;
    let daysOver90 = 0;

    for (const inv of invoices) {
      const days = inv.days_old || 0;
      const due = inv.balance_due;

      if (days <= 0) current = roundTo(current + due, 2);
      else if (days <= 30) days30 = roundTo(days30 + due, 2);
      else if (days <= 60) days60 = roundTo(days60 + due, 2);
      else if (days <= 90) days90 = roundTo(days90 + due, 2);
      else daysOver90 = roundTo(daysOver90 + due, 2);
    }

    const totalDue = roundTo(current + days30 + days60 + days90 + daysOver90, 2);

    return {
      customerId: cust.id,
      customerCode: cust.code,
      customerName: cust.name,
      phone: cust.phone,
      totalDue: totalDue > 0 ? totalDue : cust.current_balance,
      current,
      days30,
      days60,
      days90,
      daysOver90
    };
  });

  return {
    asOfDate: dateCutoff,
    rows,
    totalAr: roundTo(rows.reduce((sum, r) => sum + r.totalDue, 0), 2)
  };
}

function getApAging(companyId, asOfDate) {
  const db = getDb();
  const dateCutoff = asOfDate || new Date().toISOString().split('T')[0];

  const suppliers = db.prepare(`
    SELECT id, code, name, phone, email, current_balance
    FROM suppliers
    WHERE company_id = ? AND active = 1 AND current_balance > 0
    ORDER BY current_balance DESC
  `).all(companyId);

  const rows = suppliers.map(supp => {
    const bills = db.prepare(`
      SELECT bill_number, date, due_date, total, amount_paid, balance_due,
             julianday(?) - julianday(date) as days_old
      FROM purchase_invoices
      WHERE company_id = ? AND supplier_id = ? AND status IN ('POSTED', 'PARTIALLY_PAID') AND balance_due > 0
    `).all(dateCutoff, companyId, supp.id);

    let current = 0;
    let days30 = 0;
    let days60 = 0;
    let days90 = 0;
    let daysOver90 = 0;

    for (const b of bills) {
      const days = b.days_old || 0;
      const due = b.balance_due;

      if (days <= 0) current = roundTo(current + due, 2);
      else if (days <= 30) days30 = roundTo(days30 + due, 2);
      else if (days <= 60) days60 = roundTo(days60 + due, 2);
      else if (days <= 90) days90 = roundTo(days90 + due, 2);
      else daysOver90 = roundTo(daysOver90 + due, 2);
    }

    const totalDue = roundTo(current + days30 + days60 + days90 + daysOver90, 2);

    return {
      supplierId: supp.id,
      supplierCode: supp.code,
      supplierName: supp.name,
      phone: supp.phone,
      totalDue: totalDue > 0 ? totalDue : supp.current_balance,
      current,
      days30,
      days60,
      days90,
      daysOver90
    };
  });

  return {
    asOfDate: dateCutoff,
    rows,
    totalAp: roundTo(rows.reduce((sum, r) => sum + r.totalDue, 0), 2)
  };
}

function getCustomerStatement(companyId, customerId, startDate, endDate) {
  const db = getDb();
  const start = startDate || '2020-01-01';
  const end = endDate || new Date().toISOString().split('T')[0];

  const customer = db.prepare(`SELECT * FROM customers WHERE id = ? AND company_id = ?`).get(customerId, companyId);
  if (!customer) throw new Error('Customer not found');

  // Invoices
  const invoices = db.prepare(`
    SELECT id, invoice_number as reference, date, 'INVOICE' as type, total as amount, 0 as credit
    FROM sales_invoices
    WHERE company_id = ? AND customer_id = ? AND status != 'CANCELLED' AND date BETWEEN ? AND ?
  `).all(companyId, customerId, start, end);

  // Payments
  const payments = db.prepare(`
    SELECT id, payment_number as reference, date, 'PAYMENT' as type, 0 as amount, amount as credit
    FROM payments
    WHERE company_id = ? AND customer_id = ? AND date BETWEEN ? AND ?
  `).all(companyId, customerId, start, end);

  // Credit Notes
  const creditNotes = db.prepare(`
    SELECT id, credit_note_number as reference, date, 'CREDIT_NOTE' as type, 0 as amount, total as credit
    FROM credit_notes
    WHERE company_id = ? AND customer_id = ? AND date BETWEEN ? AND ?
  `).all(companyId, customerId, start, end);

  const transactions = [...invoices, ...payments, ...creditNotes].sort((a, b) => (a.date > b.date ? 1 : -1));

  let runningBalance = customer.opening_balance || 0;
  const items = transactions.map(t => {
    runningBalance = roundTo(runningBalance + t.amount - t.credit, 2);
    return {
      ...t,
      balance: runningBalance
    };
  });

  return {
    customer,
    startDate: start,
    endDate: end,
    openingBalance: customer.opening_balance || 0,
    closingBalance: runningBalance,
    transactions: items
  };
}

function getSupplierStatement(companyId, supplierId, startDate, endDate) {
  const db = getDb();
  const start = startDate || '2020-01-01';
  const end = endDate || new Date().toISOString().split('T')[0];

  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ? AND company_id = ?`).get(supplierId, companyId);
  if (!supplier) throw new Error('Supplier not found');

  const bills = db.prepare(`
    SELECT id, bill_number as reference, date, 'BILL' as type, total as credit, 0 as debit
    FROM purchase_invoices
    WHERE company_id = ? AND supplier_id = ? AND status != 'CANCELLED' AND date BETWEEN ? AND ?
  `).all(companyId, supplierId, start, end);

  const payments = db.prepare(`
    SELECT id, payment_number as reference, date, 'PAYMENT' as type, 0 as credit, amount as debit
    FROM payments
    WHERE company_id = ? AND supplier_id = ? AND date BETWEEN ? AND ?
  `).all(companyId, supplierId, start, end);

  const returns = db.prepare(`
    SELECT id, return_number as reference, date, 'RETURN' as type, 0 as credit, total as debit
    FROM purchase_returns
    WHERE company_id = ? AND supplier_id = ? AND date BETWEEN ? AND ?
  `).all(companyId, supplierId, start, end);

  const transactions = [...bills, ...payments, ...returns].sort((a, b) => (a.date > b.date ? 1 : -1));

  let runningBalance = supplier.opening_balance || 0;
  const items = transactions.map(t => {
    runningBalance = roundTo(runningBalance + t.credit - t.debit, 2);
    return {
      ...t,
      balance: runningBalance
    };
  });

  return {
    supplier,
    startDate: start,
    endDate: end,
    openingBalance: supplier.opening_balance || 0,
    closingBalance: runningBalance,
    transactions: items
  };
}

function getInventoryValuation(companyId) {
  const db = getDb();
  const products = db.prepare(`
    SELECT p.id, p.sku, p.name, p.category, p.unit, p.cost_price, p.selling_price, p.current_stock,
           (p.current_stock * p.cost_price) as total_cost_value,
           (p.current_stock * p.selling_price) as total_retail_value,
           p.min_stock_level, p.warehouse_location
    FROM products p
    WHERE p.company_id = ? AND p.type = 'GOODS' AND p.active = 1
    ORDER BY p.category ASC, p.name ASC
  `).all(companyId);

  const totalCostValue = roundTo(products.reduce((acc, p) => acc + (p.total_cost_value || 0), 0), 2);
  const totalRetailValue = roundTo(products.reduce((acc, p) => acc + (p.total_retail_value || 0), 0), 2);
  const totalUnits = roundTo(products.reduce((acc, p) => acc + (p.current_stock || 0), 2), 2);

  return {
    products,
    totalCostValue,
    totalRetailValue,
    totalUnits,
    potentialProfit: roundTo(totalRetailValue - totalCostValue, 2)
  };
}

function getTaxReport(companyId, startDate, endDate) {
  const db = getDb();
  const start = startDate || '2020-01-01';
  const end = endDate || new Date().toISOString().split('T')[0];

  const salesTax = db.prepare(`
    SELECT COALESCE(SUM(subtotal), 0) as taxable_sales, COALESCE(SUM(tax_total), 0) as output_tax
    FROM sales_invoices
    WHERE company_id = ? AND status != 'CANCELLED' AND date BETWEEN ? AND ?
  `).get(companyId, start, end);

  const purchaseTax = db.prepare(`
    SELECT COALESCE(SUM(subtotal), 0) as taxable_purchases, COALESCE(SUM(tax_total), 0) as input_tax
    FROM purchase_invoices
    WHERE company_id = ? AND status != 'CANCELLED' AND date BETWEEN ? AND ?
  `).get(companyId, start, end);

  const netTaxPayable = roundTo(salesTax.output_tax - purchaseTax.input_tax, 2);

  return {
    startDate: start,
    endDate: end,
    taxableSales: roundTo(salesTax.taxable_sales, 2),
    outputTax: roundTo(salesTax.output_tax, 2),
    taxablePurchases: roundTo(purchaseTax.taxable_purchases, 2),
    inputTax: roundTo(purchaseTax.input_tax, 2),
    netTaxPayable
  };
}

module.exports = {
  getDashboardStats,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
  getCashFlowStatement,
  getGeneralLedger,
  getArAging,
  getApAging,
  getCustomerStatement,
  getSupplierStatement,
  getInventoryValuation,
  getTaxReport
};
