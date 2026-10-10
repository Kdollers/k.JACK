const { getDb } = require('./db');
const {
  generateId,
  nextSequenceNumber,
  postSalesInvoice,
  postPurchaseInvoice,
  recordPayment,
  postStockAdjustment,
  createJournalEntry
} = require('./accountingEngine');

function seedActivity() {
  const db = getDb();
  const companyId = 'comp-genesis-01';
  const user = { id: 'usr-admin', full_name: 'System Administrator' };

  // Check if we already seeded sample sales
  const invoiceCount = db.prepare('SELECT count(*) as count FROM sales_invoices WHERE company_id = ?').get(companyId).count;
  if (invoiceCount > 2) {
    console.log('Sample activity already present.');
    return;
  }

  console.log('Seeding rich business activity...');

  const customers = db.prepare('SELECT * FROM customers WHERE company_id = ?').all(companyId);
  const suppliers = db.prepare('SELECT * FROM suppliers WHERE company_id = ?').all(companyId);
  const products = db.prepare('SELECT * FROM products WHERE company_id = ?').all(companyId);
  const banks = db.prepare('SELECT * FROM bank_accounts WHERE company_id = ?').all(companyId);

  const bankMain = banks.find(b => b.account_type === 'BANK') || banks[0];
  const momoAcc = banks.find(b => b.account_type === 'MOBILE_MONEY') || banks[0];
  const cashAcc = banks.find(b => b.account_type === 'CASH') || banks[0];

  // 1. Posted Sale Invoice 1 (Paid in full via Bank)
  const cust1 = customers[0];
  const prod1 = products[0]; // Dell Laptop
  const prod3 = products[2]; // Epson Printer

  const inv1Id = generateId('inv');
  const inv1Num = nextSequenceNumber(companyId, 'INVOICE', 'INV');
  const inv1Date = '2026-09-15';

  const line1Sub = 2 * prod1.selling_price;
  const line1Tax = Math.round(line1Sub * 0.18 * 100) / 100;
  const line2Sub = 1 * prod3.selling_price;
  const line2Tax = Math.round(line2Sub * 0.18 * 100) / 100;

  const inv1Sub = line1Sub + line2Sub;
  const inv1Tax = line1Tax + line2Tax;
  const inv1Tot = inv1Sub + inv1Tax;

  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id, subtotal, tax_total, total, amount_paid, balance_due, status, created_by, created_at)
    VALUES (?, ?, ?, ?, '2026-10-15', ?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?)
  `).run(inv1Id, companyId, inv1Num, inv1Date, cust1.id, inv1Sub, inv1Tax, inv1Tot, inv1Tot, user.id, inv1Date);

  const insInvLine = db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, unit_cost, discount_percent, tax_rate_id, tax_rate, tax_amount, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'tax-vat-18', 18, ?, ?)
  `);
  insInvLine.run(generateId('inl'), inv1Id, prod1.id, prod1.name, 2, prod1.selling_price, prod1.cost_price, line1Tax, line1Sub + line1Tax);
  insInvLine.run(generateId('inl'), inv1Id, prod3.id, prod3.name, 1, prod3.selling_price, prod3.cost_price, line2Tax, line2Sub + line2Tax);

  postSalesInvoice(companyId, inv1Id, user);

  // Customer 1 pays in full via bank
  recordPayment(companyId, {
    paymentType: 'CUSTOMER_RECEIPT',
    paymentMethod: 'BANK_TRANSFER',
    bankAccountId: bankMain.id,
    customerId: cust1.id,
    salesInvoiceId: inv1Id,
    amount: inv1Tot,
    date: '2026-09-20',
    reference: 'BK-TRF-88992',
    notes: 'Settlement for Invoice ' + inv1Num
  }, user);

  // 2. Posted Sale Invoice 2 (Outstanding AR - Unpaid)
  const cust2 = customers[1];
  const prod2 = products[1]; // HP EliteBook
  const prod4 = products[3]; // Samsung Monitor

  const inv2Id = generateId('inv');
  const inv2Num = nextSequenceNumber(companyId, 'INVOICE', 'INV');
  const inv2Date = '2026-09-28';

  const l21Sub = 3 * prod2.selling_price;
  const l21Tax = Math.round(l21Sub * 0.18 * 100) / 100;
  const l22Sub = 2 * prod4.selling_price;
  const l22Tax = Math.round(l22Sub * 0.18 * 100) / 100;

  const inv2Sub = l21Sub + l22Sub;
  const inv2Tax = l21Tax + l22Tax;
  const inv2Tot = inv2Sub + inv2Tax;

  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id, subtotal, tax_total, total, amount_paid, balance_due, status, created_by, created_at)
    VALUES (?, ?, ?, ?, '2026-10-28', ?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?)
  `).run(inv2Id, companyId, inv2Num, inv2Date, cust2.id, inv2Sub, inv2Tax, inv2Tot, inv2Tot, user.id, inv2Date);

  insInvLine.run(generateId('inl'), inv2Id, prod2.id, prod2.name, 3, prod2.selling_price, prod2.cost_price, l21Tax, l21Sub + l21Tax);
  insInvLine.run(generateId('inl'), inv2Id, prod4.id, prod4.name, 2, prod4.selling_price, prod4.cost_price, l22Tax, l22Sub + l22Tax);

  postSalesInvoice(companyId, inv2Id, user);

  // Customer 2 pays partial amount via MoMo
  const partialPay = 1500;
  recordPayment(companyId, {
    paymentType: 'CUSTOMER_RECEIPT',
    paymentMethod: 'MOBILE_MONEY',
    bankAccountId: momoAcc.id,
    customerId: cust2.id,
    salesInvoiceId: inv2Id,
    amount: partialPay,
    date: '2026-10-02',
    reference: 'MOMO-TX-99018',
    notes: 'Advance installment for ' + inv2Num
  }, user);

  // 3. Draft Sale Invoice (Ready for approval)
  const cust3 = customers[2];
  const prod5 = products[4]; // Cisco Switch
  const inv3Id = generateId('inv');
  const inv3Num = nextSequenceNumber(companyId, 'INVOICE', 'INV');
  const inv3Sub = 1 * prod5.selling_price;
  const inv3Tax = Math.round(inv3Sub * 0.18 * 100) / 100;
  const inv3Tot = inv3Sub + inv3Tax;

  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id, subtotal, tax_total, total, amount_paid, balance_due, status, notes, created_by, created_at)
    VALUES (?, ?, ?, '2026-10-07', '2026-11-07', ?, ?, ?, ?, 0, ?, 'DRAFT', 'Standard equipment delivery', ?, datetime('now'))
  `).run(inv3Id, companyId, inv3Num, cust3.id, inv3Sub, inv3Tax, inv3Tot, inv3Tot, user.id);

  insInvLine.run(generateId('inl'), inv3Id, prod5.id, prod5.name, 1, prod5.selling_price, prod5.cost_price, inv3Tax, inv3Tot);

  // 4. Quotation (Estimates)
  const quoId = generateId('quo');
  const quoNum = nextSequenceNumber(companyId, 'QUOTE', 'QUO');
  db.prepare(`
    INSERT INTO sales_quotes (id, company_id, quote_number, date, valid_until, customer_id, subtotal, tax_total, total, status, notes, created_by, created_at)
    VALUES (?, ?, ?, '2026-10-05', '2026-11-05', ?, 3500, 630, 4130, 'DRAFT', 'Proposed corporate setup package', ?, datetime('now'))
  `).run(quoId, companyId, quoNum, cust1.id, user.id);

  // 5. Purchase Bill 1 (Procured inventory from supplier 1)
  const supp1 = suppliers[0];
  const bill1Id = generateId('bill');
  const bill1Num = nextSequenceNumber(companyId, 'BILL', 'BILL');
  const b1Sub = 5 * 720; // 5 Dell laptops at $720
  const b1Tax = Math.round(b1Sub * 0.18 * 100) / 100;
  const b1Tot = b1Sub + b1Tax;

  db.prepare(`
    INSERT INTO purchase_invoices (id, company_id, bill_number, vendor_invoice_number, date, due_date, supplier_id, subtotal, tax_total, total, amount_paid, balance_due, status, created_by, created_at)
    VALUES (?, ?, ?, 'GTD-INV-4412', '2026-09-10', '2026-10-10', ?, ?, ?, ?, 0, ?, 'DRAFT', ?, '2026-09-10')
  `).run(bill1Id, companyId, bill1Num, supp1.id, b1Sub, b1Tax, b1Tot, b1Tot, user.id);

  db.prepare(`
    INSERT INTO purchase_invoice_lines (id, bill_id, product_id, description, quantity, unit_cost, tax_rate_id, tax_rate, tax_amount, line_total)
    VALUES (?, ?, ?, ?, 5, 720, 'tax-vat-18', 18, ?, ?)
  `).run(generateId('bl'), bill1Id, prod1.id, prod1.name, b1Tax, b1Tot);

  postPurchaseInvoice(companyId, bill1Id, user);

  // Pay part of the bill
  recordPayment(companyId, {
    paymentType: 'SUPPLIER_PAYMENT',
    paymentMethod: 'BANK_TRANSFER',
    bankAccountId: bankMain.id,
    supplierId: supp1.id,
    purchaseInvoiceId: bill1Id,
    amount: 2500,
    date: '2026-09-25',
    reference: 'BK-SUPP-991',
    notes: 'Partial payment on vendor bill ' + bill1Num
  }, user);

  // 6. Direct Operating Expenses
  const rentAcc = db.prepare("SELECT id FROM accounts WHERE company_id = ? AND code = '6020'").get(companyId);
  const utilAcc = db.prepare("SELECT id FROM accounts WHERE company_id = ? AND code = '6030'").get(companyId);

  if (rentAcc) {
    recordPayment(companyId, {
      paymentType: 'DIRECT_EXPENSE',
      paymentMethod: 'BANK_TRANSFER',
      bankAccountId: bankMain.id,
      expenseAccountId: rentAcc.id,
      amount: 1800,
      date: '2026-09-01',
      reference: 'RENT-SEP-2026',
      notes: 'Monthly Commercial Office Rent'
    }, user);
  }

  if (utilAcc) {
    recordPayment(companyId, {
      paymentType: 'DIRECT_EXPENSE',
      paymentMethod: 'CASH',
      bankAccountId: cashAcc.id,
      expenseAccountId: utilAcc.id,
      amount: 250,
      date: '2026-09-15',
      reference: 'CASH-UTIL-SEP',
      notes: 'Electricity and water token payment'
    }, user);
  }

  console.log('Sample business activity seeded successfully!');
}

seedActivity();
