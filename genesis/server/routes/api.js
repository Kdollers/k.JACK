const express = require('express');
const router = express.Router();
const { getDb, hashPassword } = require('../db');
const {
  roundTo,
  generateId,
  nextSequenceNumber,
  logAudit,
  createJournalEntry,
  reverseJournalEntry,
  postSalesInvoice,
  postPurchaseInvoice,
  recordPayment,
  postStockAdjustment,
  postPhysicalCount,
  postCreditNote,
  postPurchaseReturn
} = require('../accountingEngine');
const reports = require('../reports');

// Middleware to resolve active company and user
function getSessionContext(req) {
  const db = getDb();
  let companyId = req.headers['x-company-id'];
  if (!companyId) {
    const firstComp = db.prepare('SELECT id FROM companies ORDER BY created_at ASC LIMIT 1').get();
    companyId = firstComp ? firstComp.id : 'comp-genesis-01';
  }

  const userId = req.headers['x-user-id'] || 'usr-admin';
  const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(userId) || {
    id: 'usr-admin',
    username: 'admin',
    full_name: 'System Administrator',
    role: 'admin'
  };

  return { companyId, user };
}

// --------------------------------------------------------------------------
// 1. AUTH & USERS
// --------------------------------------------------------------------------
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(user.company_id) ||
                  db.prepare('SELECT * FROM companies ORDER BY created_at ASC LIMIT 1').get();

  logAudit(company?.id, user.id, user.full_name, 'AUTH', 'LOGIN', user.id, `User ${user.username} logged in`);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      email: user.email
    },
    company
  });
});

router.get('/auth/users', (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, full_name, email, role, active, created_at FROM users ORDER BY full_name ASC').all();
  res.json(users);
});

router.post('/auth/users', (req, res) => {
  const { companyId, user: currentUser } = getSessionContext(req);
  const { username, password, full_name, email, role } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Missing required user fields' });
  }

  const db = getDb();
  const id = generateId('usr');
  try {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(id, username, hashPassword(password), full_name, email, role, companyId);

    logAudit(companyId, currentUser.id, currentUser.full_name, 'USERS', 'CREATE', id, `Created user ${username} (${role})`);
    res.json({ id, username, full_name, email, role, active: 1 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/auth/users/:id', (req, res) => {
  const { companyId, user: currentUser } = getSessionContext(req);
  const { full_name, email, role, active, password } = req.body;
  const db = getDb();

  try {
    if (password) {
      db.prepare(`
        UPDATE users SET full_name = ?, email = ?, role = ?, active = ?, password_hash = ? WHERE id = ?
      `).run(full_name, email, role, active !== undefined ? (active ? 1 : 0) : 1, hashPassword(password), req.params.id);
    } else {
      db.prepare(`
        UPDATE users SET full_name = ?, email = ?, role = ?, active = ? WHERE id = ?
      `).run(full_name, email, role, active !== undefined ? (active ? 1 : 0) : 1, req.params.id);
    }

    logAudit(companyId, currentUser.id, currentUser.full_name, 'USERS', 'UPDATE', req.params.id, `Updated user ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 2. COMPANIES
// --------------------------------------------------------------------------
router.get('/companies', (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT * FROM companies ORDER BY name ASC').all();
  res.json(list);
});

router.get('/companies/current', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  res.json(company || null);
});

router.put('/companies/current', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  const {
    name, legal_name, address, phone, email, tax_id,
    currency_code, currency_symbol, currency_decimals,
    fiscal_year_start, fiscal_year_end, default_language, tax_inclusive_pricing, inventory_valuation_method
  } = req.body;

  try {
    db.prepare(`
      UPDATE companies
      SET name = ?, legal_name = ?, address = ?, phone = ?, email = ?, tax_id = ?,
          currency_code = ?, currency_symbol = ?, currency_decimals = ?,
          fiscal_year_start = ?, fiscal_year_end = ?, default_language = ?,
          tax_inclusive_pricing = ?, inventory_valuation_method = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name, legal_name, address, phone, email, tax_id,
      currency_code, currency_symbol, currency_decimals,
      fiscal_year_start, fiscal_year_end, default_language,
      tax_inclusive_pricing ? 1 : 0, inventory_valuation_method || 'WEIGHTED_AVERAGE',
      companyId
    );

    logAudit(companyId, user.id, user.full_name, 'COMPANY', 'UPDATE', companyId, `Updated company profile ${name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/companies', (req, res) => {
  const { user } = getSessionContext(req);
  const db = getDb();
  const {
    name, legal_name, address, phone, email, tax_id,
    currency_code = 'USD', currency_symbol = '$', currency_decimals = 2,
    default_language = 'en'
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Company name is required' });

  const id = generateId('comp');
  const code = 'GEN-' + Math.floor(100 + Math.random() * 900);

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO companies (
          id, code, name, legal_name, address, phone, email, tax_id,
          currency_code, currency_symbol, currency_decimals, default_language, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, code, name, legal_name || name, address, phone, email, tax_id,
        currency_code, currency_symbol, currency_decimals, default_language
      );

      // Clone Chart of Accounts from first company
      const templateAccounts = db.prepare('SELECT * FROM accounts WHERE company_id = ?').all('comp-genesis-01');
      const insertAcc = db.prepare(`
        INSERT INTO accounts (id, company_id, code, name, type, subtype, normal_balance, is_system, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const a of templateAccounts) {
        insertAcc.run(generateId('acc'), id, a.code, a.name, a.type, a.subtype, a.normal_balance, a.is_system);
      }

      // Default Bank Account
      const mainAcc = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(id, '1020');
      if (mainAcc) {
        db.prepare(`
          INSERT INTO bank_accounts (id, company_id, account_id, bank_name, account_number, account_type, currency, current_balance, active)
          VALUES (?, ?, ?, ?, ?, 'BANK', ?, 0, 1)
        `).run(generateId('bank'), id, mainAcc.id, 'Main Bank Account', '001-DEFAULT', currency_code);
      }

      // Default Tax Rate
      const salesTaxAcc = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(id, '2110');
      const purchTaxAcc = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(id, '1150');
      db.prepare(`
        INSERT INTO tax_rates (id, company_id, code, name, rate, sales_tax_account_id, purchase_tax_account_id, active)
        VALUES (?, ?, 'VAT18', 'Standard VAT 18%', 18.0, ?, ?, 1)
      `).run(generateId('tax'), id, salesTaxAcc?.id || null, purchTaxAcc?.id || null);

      logAudit(id, user.id, user.full_name, 'COMPANY', 'CREATE', id, `Created new company ${name} (${code})`);
    })();

    res.json({ id, code, name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 3. CHART OF ACCOUNTS
// --------------------------------------------------------------------------
router.get('/accounts', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const accounts = db.prepare(`
    SELECT a.*, 
           COALESCE(SUM(jel.debit), 0) as total_debit,
           COALESCE(SUM(jel.credit), 0) as total_credit
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON a.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.company_id = a.company_id AND je.status = 'POSTED'
    WHERE a.company_id = ?
    GROUP BY a.id
    ORDER BY a.code ASC
  `).all(companyId);

  const formatted = accounts.map(a => {
    const isDebitNormal = a.normal_balance === 'DEBIT';
    const balance = isDebitNormal ? roundTo(a.total_debit - a.total_credit, 2) : roundTo(a.total_credit - a.total_debit, 2);
    return {
      ...a,
      balance
    };
  });

  res.json(formatted);
});

router.post('/accounts', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { code, name, type, subtype, normal_balance, notes } = req.body;
  if (!code || !name || !type || !normal_balance) {
    return res.status(400).json({ error: 'Code, Name, Type, and Normal Balance are required' });
  }

  const db = getDb();
  const id = generateId('acc');
  try {
    db.prepare(`
      INSERT INTO accounts (id, company_id, code, name, type, subtype, normal_balance, is_system, active, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
    `).run(id, companyId, code, name, type, subtype || type, normal_balance, notes || null);

    logAudit(companyId, user.id, user.full_name, 'ACCOUNTS', 'CREATE', id, `Created account ${code} - ${name}`);
    res.json({ id, code, name, type, subtype, normal_balance, balance: 0 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/accounts/:id', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { name, subtype, active, notes } = req.body;
  const db = getDb();

  try {
    db.prepare(`
      UPDATE accounts SET name = ?, subtype = ?, active = ?, notes = ? WHERE id = ? AND company_id = ?
    `).run(name, subtype, active ? 1 : 0, notes || null, req.params.id, companyId);

    logAudit(companyId, user.id, user.full_name, 'ACCOUNTS', 'UPDATE', req.params.id, `Updated account ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 4. CUSTOMERS
// --------------------------------------------------------------------------
router.get('/customers', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const search = req.query.search ? `%${req.query.search}%` : null;
  let sql = 'SELECT * FROM customers WHERE company_id = ?';
  const params = [companyId];
  if (search) {
    sql += ' AND (name LIKE ? OR code LIKE ? OR phone LIKE ? OR email LIKE ?)';
    params.push(search, search, search, search);
  }
  sql += ' ORDER BY name ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/customers', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { name, contact_person, email, phone, address, tax_id, credit_limit = 0, payment_terms = 'NET_30' } = req.body;
  if (!name) return res.status(400).json({ error: 'Customer name is required' });

  const db = getDb();
  const id = generateId('cust');
  const count = db.prepare('SELECT count(*) as c FROM customers WHERE company_id = ?').get(companyId).c;
  const code = req.body.code || `CUST-${String(count + 1).padStart(3, '0')}`;

  try {
    db.prepare(`
      INSERT INTO customers (id, company_id, code, name, contact_person, email, phone, address, tax_id, credit_limit, payment_terms, opening_balance, current_balance, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, datetime('now'))
    `).run(id, companyId, code, name, contact_person, email, phone, address, tax_id, Number(credit_limit) || 0, payment_terms);

    logAudit(companyId, user.id, user.full_name, 'CUSTOMERS', 'CREATE', id, `Created customer ${code} - ${name}`);
    res.json({ id, code, name, current_balance: 0 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/customers/:id', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { name, contact_person, email, phone, address, tax_id, credit_limit, payment_terms, active } = req.body;
  const db = getDb();

  try {
    db.prepare(`
      UPDATE customers
      SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, tax_id = ?,
          credit_limit = ?, payment_terms = ?, active = ?
      WHERE id = ? AND company_id = ?
    `).run(name, contact_person, email, phone, address, tax_id, credit_limit, payment_terms, active ? 1 : 0, req.params.id, companyId);

    logAudit(companyId, user.id, user.full_name, 'CUSTOMERS', 'UPDATE', req.params.id, `Updated customer ${name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/customers/:id/statement', (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    const data = reports.getCustomerStatement(companyId, req.params.id, startDate, endDate);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 5. SUPPLIERS
// --------------------------------------------------------------------------
router.get('/suppliers', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const search = req.query.search ? `%${req.query.search}%` : null;
  let sql = 'SELECT * FROM suppliers WHERE company_id = ?';
  const params = [companyId];
  if (search) {
    sql += ' AND (name LIKE ? OR code LIKE ? OR phone LIKE ? OR email LIKE ?)';
    params.push(search, search, search, search);
  }
  sql += ' ORDER BY name ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/suppliers', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { name, contact_person, email, phone, address, tax_id, payment_terms = 'NET_30' } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });

  const db = getDb();
  const id = generateId('supp');
  const count = db.prepare('SELECT count(*) as c FROM suppliers WHERE company_id = ?').get(companyId).c;
  const code = req.body.code || `SUPP-${String(count + 1).padStart(3, '0')}`;

  try {
    db.prepare(`
      INSERT INTO suppliers (id, company_id, code, name, contact_person, email, phone, address, tax_id, payment_terms, opening_balance, current_balance, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, datetime('now'))
    `).run(id, companyId, code, name, contact_person, email, phone, address, tax_id, payment_terms);

    logAudit(companyId, user.id, user.full_name, 'SUPPLIERS', 'CREATE', id, `Created supplier ${code} - ${name}`);
    res.json({ id, code, name, current_balance: 0 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/suppliers/:id', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { name, contact_person, email, phone, address, tax_id, payment_terms, active } = req.body;
  const db = getDb();

  try {
    db.prepare(`
      UPDATE suppliers
      SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, tax_id = ?,
          payment_terms = ?, active = ?
      WHERE id = ? AND company_id = ?
    `).run(name, contact_person, email, phone, address, tax_id, payment_terms, active ? 1 : 0, req.params.id, companyId);

    logAudit(companyId, user.id, user.full_name, 'SUPPLIERS', 'UPDATE', req.params.id, `Updated supplier ${name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/suppliers/:id/statement', (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    const data = reports.getSupplierStatement(companyId, req.params.id, startDate, endDate);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 6. PRODUCTS & INVENTORY
// --------------------------------------------------------------------------
router.get('/products', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const search = req.query.search ? `%${req.query.search}%` : null;
  let sql = 'SELECT * FROM products WHERE company_id = ?';
  const params = [companyId];
  if (search) {
    sql += ' AND (name LIKE ? OR sku LIKE ? OR category LIKE ?)';
    params.push(search, search, search);
  }
  sql += ' ORDER BY category ASC, name ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/products', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const {
    sku, barcode, name, description, category = 'General', type = 'GOODS',
    unit = 'pcs', cost_price = 0, selling_price = 0, tax_rate_id,
    min_stock_level = 0, current_stock = 0, warehouse_location = 'Main Store'
  } = req.body;

  if (!sku || !name) return res.status(400).json({ error: 'SKU and Product Name are required' });

  const db = getDb();
  const id = generateId('prod');

  try {
    db.prepare(`
      INSERT INTO products (
        id, company_id, sku, barcode, name, description, category, type, unit,
        cost_price, selling_price, tax_rate_id, min_stock_level, current_stock,
        warehouse_location, sales_account_id, cogs_account_id, inventory_account_id, active, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, 'acc-4010', 'acc-5010', 'acc-1200', 1, datetime('now')
      )
    `).run(
      id, companyId, sku, barcode || 'BAR-' + sku, name, description || name, category, type, unit,
      Number(cost_price) || 0, Number(selling_price) || 0, tax_rate_id || 'tax-vat-18',
      Number(min_stock_level) || 0, Number(current_stock) || 0, warehouse_location
    );

    logAudit(companyId, user.id, user.full_name, 'PRODUCTS', 'CREATE', id, `Created product ${sku} - ${name}`);
    res.json({ id, sku, name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/products/:id', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const {
    sku, barcode, name, description, category, type, unit,
    cost_price, selling_price, tax_rate_id, min_stock_level,
    warehouse_location, active
  } = req.body;

  const db = getDb();
  try {
    db.prepare(`
      UPDATE products
      SET sku = ?, barcode = ?, name = ?, description = ?, category = ?, type = ?, unit = ?,
          cost_price = ?, selling_price = ?, tax_rate_id = ?, min_stock_level = ?,
          warehouse_location = ?, active = ?
      WHERE id = ? AND company_id = ?
    `).run(
      sku, barcode, name, description, category, type, unit,
      cost_price, selling_price, tax_rate_id, min_stock_level,
      warehouse_location, active ? 1 : 0, req.params.id, companyId
    );

    logAudit(companyId, user.id, user.full_name, 'PRODUCTS', 'UPDATE', req.params.id, `Updated product ${name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/movements', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const productId = req.query.productId;
  let sql = `
    SELECT m.*, p.name as product_name, p.sku as product_sku
    FROM inventory_movements m
    JOIN products p ON m.product_id = p.id
    WHERE m.company_id = ?
  `;
  const params = [companyId];
  if (productId) {
    sql += ' AND m.product_id = ?';
    params.push(productId);
  }
  sql += ' ORDER BY m.date DESC, m.created_at DESC LIMIT 100';
  res.json(db.prepare(sql).all(...params));
});

router.get('/inventory/valuation', (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getInventoryValuation(companyId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/adjustments', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const adjs = db.prepare(`SELECT * FROM stock_adjustments WHERE company_id = ? ORDER BY date DESC, created_at DESC`).all(companyId);
  res.json(adjs);
});

router.post('/inventory/adjustments', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postStockAdjustment(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/counts', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const counts = db.prepare(`SELECT * FROM physical_inventory_counts WHERE company_id = ? ORDER BY date DESC, created_at DESC`).all(companyId);
  res.json(counts);
});

router.post('/inventory/counts', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postPhysicalCount(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 7. SALES (Quotes, Orders, Invoices, Credit Notes)
// --------------------------------------------------------------------------
router.get('/sales/quotes', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const quotes = db.prepare(`
    SELECT q.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
    FROM sales_quotes q
    JOIN customers c ON q.customer_id = c.id
    WHERE q.company_id = ?
    ORDER BY q.date DESC, q.created_at DESC
  `).all(companyId);
  res.json(quotes);
});

router.post('/sales/quotes', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { date = new Date().toISOString().split('T')[0], valid_until, customer_id, notes, lines } = req.body;
  if (!customer_id || !lines || lines.length === 0) {
    return res.status(400).json({ error: 'Customer and line items are required' });
  }

  const db = getDb();
  const quoteNumber = nextSequenceNumber(companyId, 'QUOTE', 'QUO');
  const quoteId = generateId('quo');

  let subtotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;

  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const price = Number(l.unit_price) || 0;
    const disc = Number(l.discount_percent) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    const lineSub = roundTo(qty * price * (1 - disc / 100), 2);
    const lineTax = roundTo(lineSub * (taxRate / 100), 2);
    const lineTot = roundTo(lineSub + lineTax, 2);

    subtotal = roundTo(subtotal + lineSub, 2);
    taxTotal = roundTo(taxTotal + lineTax, 2);
    discountTotal = roundTo(discountTotal + (qty * price * (disc / 100)), 2);

    return {
      productId: l.product_id || null,
      description: l.description || '',
      quantity: qty,
      unitPrice: price,
      discountPercent: disc,
      taxRateId: l.tax_rate_id || null,
      taxRate,
      taxAmount: lineTax,
      lineTotal: lineTot
    };
  });

  const total = roundTo(subtotal + taxTotal, 2);

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO sales_quotes (id, company_id, quote_number, date, valid_until, customer_id, subtotal, tax_total, discount_total, total, status, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, datetime('now'))
      `).run(quoteId, companyId, quoteNumber, date, valid_until || date, customer_id, subtotal, taxTotal, discountTotal, total, notes, user.id);

      const insertLine = db.prepare(`
        INSERT INTO sales_quote_lines (id, quote_id, product_id, description, quantity, unit_price, discount_percent, tax_rate_id, tax_rate, tax_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ld of lineData) {
        insertLine.run(generateId('ql'), quoteId, ld.productId, ld.description, ld.quantity, ld.unitPrice, ld.discountPercent, ld.taxRateId, ld.taxRate, ld.taxAmount, ld.lineTotal);
      }

      logAudit(companyId, user.id, user.full_name, 'SALES', 'CREATE', quoteId, `Created quote ${quoteNumber}`);
    })();

    res.json({ id: quoteId, quoteNumber, total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sales/quotes/:id/convert-to-invoice', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const quote = db.prepare('SELECT * FROM sales_quotes WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    const quoteLines = db.prepare('SELECT * FROM sales_quote_lines WHERE quote_id = ?').all(quote.id);
    const invId = generateId('inv');
    const invNumber = nextSequenceNumber(companyId, 'INVOICE', 'INV');
    const today = new Date().toISOString().split('T')[0];

    db.transaction(() => {
      db.prepare(`
        INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id, subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?, datetime('now'))
      `).run(invId, companyId, invNumber, today, today, quote.customer_id, quote.subtotal, quote.tax_total, quote.discount_total, quote.total, quote.total, `Converted from ${quote.quote_number}`, user.id);

      const insertInvLine = db.prepare(`
        INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, unit_cost, discount_percent, tax_rate_id, tax_rate, tax_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ql of quoteLines) {
        const prod = ql.product_id ? db.prepare('SELECT cost_price FROM products WHERE id = ?').get(ql.product_id) : null;
        insertInvLine.run(generateId('inl'), invId, ql.product_id, ql.description, ql.quantity, ql.unit_price, prod?.cost_price || 0, ql.discount_percent, ql.tax_rate_id, ql.tax_rate, ql.tax_amount, ql.line_total);
      }

      db.prepare("UPDATE sales_quotes SET status = 'CONVERTED' WHERE id = ?").run(quote.id);
      logAudit(companyId, user.id, user.full_name, 'SALES', 'UPDATE', quote.id, `Converted quote ${quote.quote_number} to invoice ${invNumber}`);
    })();

    res.json({ invoiceId: invId, invoiceNumber: invNumber });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sales/invoices', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const invoices = db.prepare(`
    SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
    FROM sales_invoices i
    JOIN customers c ON i.customer_id = c.id
    WHERE i.company_id = ?
    ORDER BY i.date DESC, i.created_at DESC
  `).all(companyId);
  res.json(invoices);
});

router.get('/sales/invoices/:id', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.address as customer_address, c.tax_id as customer_tax_id
    FROM sales_invoices i
    JOIN customers c ON i.customer_id = c.id
    WHERE i.id = ? AND i.company_id = ?
  `).get(req.params.id, companyId);

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const lines = db.prepare(`
    SELECT l.*, p.sku as product_sku, p.name as product_name
    FROM sales_invoice_lines l
    LEFT JOIN products p ON l.product_id = p.id
    WHERE l.invoice_id = ?
  `).all(invoice.id);

  const payments = db.prepare(`SELECT * FROM payments WHERE sales_invoice_id = ? ORDER BY date DESC`).all(invoice.id);

  res.json({ ...invoice, lines, payments });
});

router.post('/sales/invoices', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { date = new Date().toISOString().split('T')[0], due_date, customer_id, notes, lines, autoPost = false } = req.body;
  if (!customer_id || !lines || lines.length === 0) {
    return res.status(400).json({ error: 'Customer and at least one line item are required' });
  }

  const db = getDb();
  const invNumber = nextSequenceNumber(companyId, 'INVOICE', 'INV');
  const invId = generateId('inv');

  let subtotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;

  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const price = Number(l.unit_price) || 0;
    const disc = Number(l.discount_percent) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    const lineSub = roundTo(qty * price * (1 - disc / 100), 2);
    const lineTax = roundTo(lineSub * (taxRate / 100), 2);
    const lineTot = roundTo(lineSub + lineTax, 2);

    subtotal = roundTo(subtotal + lineSub, 2);
    taxTotal = roundTo(taxTotal + lineTax, 2);
    discountTotal = roundTo(discountTotal + (qty * price * (disc / 100)), 2);

    let unitCost = 0;
    if (l.product_id) {
      const p = db.prepare('SELECT cost_price FROM products WHERE id = ?').get(l.product_id);
      unitCost = p?.cost_price || 0;
    }

    return {
      productId: l.product_id || null,
      description: l.description || 'Product / Service',
      quantity: qty,
      unitPrice: price,
      unitCost,
      discountPercent: disc,
      taxRateId: l.tax_rate_id || null,
      taxRate,
      taxAmount: lineTax,
      lineTotal: lineTot
    };
  });

  const total = roundTo(subtotal + taxTotal, 2);

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id, subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?, datetime('now'))
      `).run(invId, companyId, invNumber, date, due_date || date, customer_id, subtotal, taxTotal, discountTotal, total, total, notes || null, user.id);

      const insertLine = db.prepare(`
        INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, unit_cost, discount_percent, tax_rate_id, tax_rate, tax_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ld of lineData) {
        insertLine.run(generateId('inl'), invId, ld.productId, ld.description, ld.quantity, ld.unitPrice, ld.unitCost, ld.discountPercent, ld.taxRateId, ld.taxRate, ld.taxAmount, ld.lineTotal);
      }

      logAudit(companyId, user.id, user.full_name, 'SALES', 'CREATE', invId, `Created sales invoice draft ${invNumber} ($${total})`);
    })();

    if (autoPost) {
      postSalesInvoice(companyId, invId, user);
    }

    res.json({ id: invId, invoiceNumber: invNumber, total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sales/invoices/:id/post', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postSalesInvoice(companyId, req.params.id, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sales/credit-notes', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const cns = db.prepare(`
    SELECT cn.*, c.name as customer_name
    FROM credit_notes cn
    JOIN customers c ON cn.customer_id = c.id
    WHERE cn.company_id = ?
    ORDER BY cn.date DESC, cn.created_at DESC
  `).all(companyId);
  res.json(cns);
});

router.post('/sales/credit-notes', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postCreditNote(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 8. PURCHASES (Bills, Orders, Returns)
// --------------------------------------------------------------------------
router.get('/purchases/orders', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const orders = db.prepare(`
    SELECT o.*, s.name as supplier_name
    FROM purchase_orders o
    JOIN suppliers s ON o.supplier_id = s.id
    WHERE o.company_id = ?
    ORDER BY o.date DESC, o.created_at DESC
  `).all(companyId);
  res.json(orders);
});

router.post('/purchases/orders', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { date = new Date().toISOString().split('T')[0], expected_date, supplier_id, notes, lines } = req.body;
  if (!supplier_id || !lines || lines.length === 0) {
    return res.status(400).json({ error: 'Supplier and line items are required' });
  }

  const db = getDb();
  const poNumber = nextSequenceNumber(companyId, 'PO', 'PO');
  const poId = generateId('po');

  let subtotal = 0;
  let taxTotal = 0;

  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const cost = Number(l.unit_cost) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    const lineSub = roundTo(qty * cost, 2);
    const lineTax = roundTo(lineSub * (taxRate / 100), 2);
    const lineTot = roundTo(lineSub + lineTax, 2);

    subtotal = roundTo(subtotal + lineSub, 2);
    taxTotal = roundTo(taxTotal + lineTax, 2);

    return {
      productId: l.product_id || null,
      description: l.description || '',
      quantity: qty,
      unitCost: cost,
      taxRateId: l.tax_rate_id || null,
      taxRate,
      taxAmount: lineTax,
      lineTotal: lineTot
    };
  });

  const total = roundTo(subtotal + taxTotal, 2);

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO purchase_orders (id, company_id, po_number, date, expected_date, supplier_id, subtotal, tax_total, total, status, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, datetime('now'))
      `).run(poId, companyId, poNumber, date, expected_date || null, supplier_id, subtotal, taxTotal, total, notes, user.id);

      const insertLine = db.prepare(`
        INSERT INTO purchase_order_lines (id, po_id, product_id, description, quantity, unit_cost, tax_rate_id, tax_rate, tax_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ld of lineData) {
        insertLine.run(generateId('pol'), poId, ld.productId, ld.description, ld.quantity, ld.unitCost, ld.taxRateId, ld.taxRate, ld.taxAmount, ld.lineTotal);
      }

      logAudit(companyId, user.id, user.full_name, 'PURCHASES', 'CREATE', poId, `Created purchase order ${poNumber}`);
    })();

    res.json({ id: poId, poNumber, total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/purchases/bills', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const bills = db.prepare(`
    SELECT b.*, s.name as supplier_name, s.email as supplier_email, s.phone as supplier_phone
    FROM purchase_invoices b
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.company_id = ?
    ORDER BY b.date DESC, b.created_at DESC
  `).all(companyId);
  res.json(bills);
});

router.get('/purchases/bills/:id', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const bill = db.prepare(`
    SELECT b.*, s.name as supplier_name, s.email as supplier_email, s.phone as supplier_phone, s.address as supplier_address, s.tax_id as supplier_tax_id
    FROM purchase_invoices b
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.id = ? AND b.company_id = ?
  `).get(req.params.id, companyId);

  if (!bill) return res.status(404).json({ error: 'Purchase bill not found' });

  const lines = db.prepare(`
    SELECT l.*, p.sku as product_sku, p.name as product_name
    FROM purchase_invoice_lines l
    LEFT JOIN products p ON l.product_id = p.id
    WHERE l.bill_id = ?
  `).all(bill.id);

  const payments = db.prepare(`SELECT * FROM payments WHERE purchase_invoice_id = ? ORDER BY date DESC`).all(bill.id);

  res.json({ ...bill, lines, payments });
});

router.post('/purchases/bills', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const {
    vendor_invoice_number, date = new Date().toISOString().split('T')[0],
    due_date, supplier_id, notes, lines, autoPost = false
  } = req.body;

  if (!supplier_id || !lines || lines.length === 0) {
    return res.status(400).json({ error: 'Supplier and at least one line item are required' });
  }

  const db = getDb();
  const billNumber = nextSequenceNumber(companyId, 'BILL', 'BILL');
  const billId = generateId('bill');

  let subtotal = 0;
  let taxTotal = 0;

  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const cost = Number(l.unit_cost) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    const lineSub = roundTo(qty * cost, 2);
    const lineTax = roundTo(lineSub * (taxRate / 100), 2);
    const lineTot = roundTo(lineSub + lineTax, 2);

    subtotal = roundTo(subtotal + lineSub, 2);
    taxTotal = roundTo(taxTotal + lineTax, 2);

    return {
      productId: l.product_id || null,
      description: l.description || 'Goods / Services',
      quantity: qty,
      unitCost: cost,
      taxRateId: l.tax_rate_id || null,
      taxRate,
      taxAmount: lineTax,
      lineTotal: lineTot
    };
  });

  const total = roundTo(subtotal + taxTotal, 2);

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO purchase_invoices (id, company_id, bill_number, vendor_invoice_number, date, due_date, supplier_id, subtotal, tax_total, total, amount_paid, balance_due, status, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?, datetime('now'))
      `).run(billId, companyId, billNumber, vendor_invoice_number || null, date, due_date || date, supplier_id, subtotal, taxTotal, total, total, notes || null, user.id);

      const insertLine = db.prepare(`
        INSERT INTO purchase_invoice_lines (id, bill_id, product_id, description, quantity, unit_cost, tax_rate_id, tax_rate, tax_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ld of lineData) {
        insertLine.run(generateId('bl'), billId, ld.productId, ld.description, ld.quantity, ld.unitCost, ld.taxRateId, ld.taxRate, ld.taxAmount, ld.lineTotal);
      }

      logAudit(companyId, user.id, user.full_name, 'PURCHASES', 'CREATE', billId, `Created purchase bill draft ${billNumber} ($${total})`);
    })();

    if (autoPost) {
      postPurchaseInvoice(companyId, billId, user);
    }

    res.json({ id: billId, billNumber, total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/purchases/bills/:id/post', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postPurchaseInvoice(companyId, req.params.id, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/purchases/returns', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const returns = db.prepare(`
    SELECT r.*, s.name as supplier_name
    FROM purchase_returns r
    JOIN suppliers s ON r.supplier_id = s.id
    WHERE r.company_id = ?
    ORDER BY r.date DESC, r.created_at DESC
  `).all(companyId);
  res.json(returns);
});

router.post('/purchases/returns', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postPurchaseReturn(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 9. PAYMENTS & CASH / BANK
// --------------------------------------------------------------------------
router.get('/payments/bank-accounts', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const accounts = db.prepare(`
    SELECT b.*, a.code as account_code, a.name as gl_account_name
    FROM bank_accounts b
    JOIN accounts a ON b.account_id = a.id
    WHERE b.company_id = ?
    ORDER BY b.account_type ASC, b.bank_name ASC
  `).all(companyId);
  res.json(accounts);
});

router.post('/payments/bank-accounts', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { bank_name, account_number, account_type = 'BANK', currency = 'USD', opening_balance = 0, gl_code } = req.body;
  if (!bank_name || !account_number) {
    return res.status(400).json({ error: 'Bank Name and Account Number are required' });
  }

  const db = getDb();
  const id = generateId('bank');

  try {
    // Find or create GL account
    let glAccount = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, gl_code || '1020');
    if (!glAccount) {
      glAccount = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND subtype = ?').get(companyId, account_type);
    }

    db.prepare(`
      INSERT INTO bank_accounts (id, company_id, account_id, bank_name, account_number, account_type, currency, current_balance, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, companyId, glAccount.id, bank_name, account_number, account_type, currency, Number(opening_balance) || 0);

    logAudit(companyId, user.id, user.full_name, 'BANKING', 'CREATE', id, `Added ${account_type} account ${bank_name}`);
    res.json({ id, bank_name, account_number });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/payments', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const payments = db.prepare(`
    SELECT p.*, b.bank_name, b.account_type,
           c.name as customer_name, s.name as supplier_name,
           a_exp.name as expense_account_name, a_inc.name as income_account_name
    FROM payments p
    JOIN bank_accounts b ON p.bank_account_id = b.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN accounts a_exp ON p.expense_account_id = a_exp.id
    LEFT JOIN accounts a_inc ON p.income_account_id = a_inc.id
    WHERE p.company_id = ?
    ORDER BY p.date DESC, p.created_at DESC
  `).all(companyId);
  res.json(payments);
});

router.post('/payments', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = recordPayment(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 10. JOURNAL ENTRIES & ACCOUNTING
// --------------------------------------------------------------------------
router.get('/journal-entries', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const entries = db.prepare(`
    SELECT je.*, u.full_name as created_by_name
    FROM journal_entries je
    LEFT JOIN users u ON je.created_by = u.id
    WHERE je.company_id = ?
    ORDER BY je.date DESC, je.entry_number DESC
  `).all(companyId);
  res.json(entries);
});

router.get('/journal-entries/:id', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const entry = db.prepare(`SELECT * FROM journal_entries WHERE id = ? AND company_id = ?`).get(req.params.id, companyId);
  if (!entry) return res.status(404).json({ error: 'Journal entry not found' });

  const lines = db.prepare(`
    SELECT jel.*, a.code as account_code, a.name as account_name
    FROM journal_entry_lines jel
    JOIN accounts a ON jel.account_id = a.id
    WHERE jel.journal_entry_id = ?
    ORDER BY jel.line_number ASC
  `).all(entry.id);

  res.json({ ...entry, lines });
});

router.post('/journal-entries', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { date, reference, description, lines } = req.body;
  if (!description || !lines || lines.length < 2) {
    return res.status(400).json({ error: 'Description and at least two balanced lines are required' });
  }

  try {
    const result = createJournalEntry({
      companyId,
      date,
      reference,
      description,
      sourceType: 'MANUAL',
      lines,
      user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/journal-entries/:id/reverse', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { reason } = req.body;
  try {
    const result = reverseJournalEntry(companyId, req.params.id, reason, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 11. FINANCIAL REPORTS
// --------------------------------------------------------------------------
router.get('/reports/dashboard', (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    res.json(reports.getDashboardStats(companyId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/trial-balance', (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getTrialBalance(companyId, req.query.asOfDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/profit-loss', (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    res.json(reports.getProfitAndLoss(companyId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/balance-sheet', (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getBalanceSheet(companyId, req.query.asOfDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/cash-flow', (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    res.json(reports.getCashFlowStatement(companyId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/general-ledger', (req, res) => {
  const { companyId } = getSessionContext(req);
  const { accountId, startDate, endDate } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });
  try {
    res.json(reports.getGeneralLedger(companyId, accountId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/ar-aging', (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getArAging(companyId, req.query.asOfDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/ap-aging', (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getApAging(companyId, req.query.asOfDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/tax-report', (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    res.json(reports.getTaxReport(companyId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 12. TAX RATES
// --------------------------------------------------------------------------
router.get('/taxes', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  res.json(db.prepare('SELECT * FROM tax_rates WHERE company_id = ? ORDER BY rate DESC').all(companyId));
});

router.post('/taxes', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { code, name, rate, sales_tax_account_id, purchase_tax_account_id, is_inclusive } = req.body;
  if (!code || !name || rate === undefined) {
    return res.status(400).json({ error: 'Code, Name, and Rate are required' });
  }

  const db = getDb();
  const id = generateId('tax');
  try {
    db.prepare(`
      INSERT INTO tax_rates (id, company_id, code, name, rate, is_inclusive, sales_tax_account_id, purchase_tax_account_id, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, companyId, code, name, Number(rate), is_inclusive ? 1 : 0, sales_tax_account_id || null, purchase_tax_account_id || null);

    logAudit(companyId, user.id, user.full_name, 'TAXES', 'CREATE', id, `Created tax rate ${code} (${rate}%)`);
    res.json({ id, code, name, rate });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 13. AUDIT TRAIL
// --------------------------------------------------------------------------
router.get('/audit-trail', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const moduleName = req.query.module;
  let sql = 'SELECT * FROM audit_logs WHERE company_id = ?';
  const params = [companyId];
  if (moduleName) {
    sql += ' AND module = ?';
    params.push(moduleName);
  }
  sql += ' ORDER BY timestamp DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

// --------------------------------------------------------------------------
// 14. BACKUP & RESTORE / DEMO RESET
// --------------------------------------------------------------------------
router.get('/backup/export', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const backupData = {
      genesisVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      company: db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId),
      accounts: db.prepare('SELECT * FROM accounts WHERE company_id = ?').all(companyId),
      taxRates: db.prepare('SELECT * FROM tax_rates WHERE company_id = ?').all(companyId),
      bankAccounts: db.prepare('SELECT * FROM bank_accounts WHERE company_id = ?').all(companyId),
      customers: db.prepare('SELECT * FROM customers WHERE company_id = ?').all(companyId),
      suppliers: db.prepare('SELECT * FROM suppliers WHERE company_id = ?').all(companyId),
      products: db.prepare('SELECT * FROM products WHERE company_id = ?').all(companyId),
      journalEntries: db.prepare('SELECT * FROM journal_entries WHERE company_id = ?').all(companyId),
      journalLines: db.prepare(`
        SELECT jel.* FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE je.company_id = ?
      `).all(companyId),
      inventoryMovements: db.prepare('SELECT * FROM inventory_movements WHERE company_id = ?').all(companyId),
      salesInvoices: db.prepare('SELECT * FROM sales_invoices WHERE company_id = ?').all(companyId),
      salesInvoiceLines: db.prepare(`
        SELECT sil.* FROM sales_invoice_lines sil
        JOIN sales_invoices si ON sil.invoice_id = si.id
        WHERE si.company_id = ?
      `).all(companyId),
      purchaseInvoices: db.prepare('SELECT * FROM purchase_invoices WHERE company_id = ?').all(companyId),
      purchaseInvoiceLines: db.prepare(`
        SELECT pil.* FROM purchase_invoice_lines pil
        JOIN purchase_invoices pi ON pil.bill_id = pi.id
        WHERE pi.company_id = ?
      `).all(companyId),
      payments: db.prepare('SELECT * FROM payments WHERE company_id = ?').all(companyId)
    };

    logAudit(companyId, user.id, user.full_name, 'SYSTEM', 'BACKUP', companyId, 'Exported complete database backup JSON');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="genesis-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backup/import', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const data = req.body;
  if (!data || !data.genesisVersion) {
    return res.status(400).json({ error: 'Invalid backup file format' });
  }

  const db = getDb();
  try {
    db.transaction(() => {
      // Clear current company data
      db.prepare('DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id = ?)').run(companyId);
      db.prepare('DELETE FROM journal_entries WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM sales_invoice_lines WHERE invoice_id IN (SELECT id FROM sales_invoices WHERE company_id = ?)').run(companyId);
      db.prepare('DELETE FROM sales_invoices WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM purchase_invoice_lines WHERE bill_id IN (SELECT id FROM purchase_invoices WHERE company_id = ?)').run(companyId);
      db.prepare('DELETE FROM purchase_invoices WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM inventory_movements WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM payments WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM products WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM customers WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM suppliers WHERE company_id = ?').run(companyId);

      // Restore accounts if provided
      if (Array.isArray(data.products)) {
        const insP = db.prepare(`
          INSERT OR REPLACE INTO products (id, company_id, sku, barcode, name, description, category, type, unit, cost_price, selling_price, tax_rate_id, min_stock_level, current_stock, warehouse_location, sales_account_id, cogs_account_id, inventory_account_id, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of data.products) {
          insP.run(p.id, companyId, p.sku, p.barcode, p.name, p.description, p.category, p.type, p.unit, p.cost_price, p.selling_price, p.tax_rate_id, p.min_stock_level, p.current_stock, p.warehouse_location, p.sales_account_id, p.cogs_account_id, p.inventory_account_id, p.active);
        }
      }

      if (Array.isArray(data.customers)) {
        const insC = db.prepare(`
          INSERT OR REPLACE INTO customers (id, company_id, code, name, contact_person, email, phone, address, tax_id, credit_limit, payment_terms, opening_balance, current_balance, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of data.customers) {
          insC.run(c.id, companyId, c.code, c.name, c.contact_person, c.email, c.phone, c.address, c.tax_id, c.credit_limit, c.payment_terms, c.opening_balance, c.current_balance, c.active);
        }
      }

      if (Array.isArray(data.suppliers)) {
        const insS = db.prepare(`
          INSERT OR REPLACE INTO suppliers (id, company_id, code, name, contact_person, email, phone, address, tax_id, payment_terms, opening_balance, current_balance, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of data.suppliers) {
          insS.run(s.id, companyId, s.code, s.name, s.contact_person, s.email, s.phone, s.address, s.tax_id, s.payment_terms, s.opening_balance, s.current_balance, s.active);
        }
      }

      logAudit(companyId, user.id, user.full_name, 'SYSTEM', 'RESTORE', companyId, 'Restored database from uploaded backup JSON');
    })();

    res.json({ success: true, message: 'Backup restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backup/reset-demo', (req, res) => {
  const { user } = getSessionContext(req);
  const db = getDb();
  try {
    // Drop all tables and re-initialize
    const tables = [
      'audit_logs', 'payments', 'purchase_return_lines', 'purchase_returns',
      'purchase_invoice_lines', 'purchase_invoices', 'purchase_order_lines', 'purchase_orders',
      'credit_note_lines', 'credit_notes', 'sales_invoice_lines', 'sales_invoices',
      'sales_order_lines', 'sales_orders', 'sales_quote_lines', 'sales_quotes',
      'physical_inventory_lines', 'physical_inventory_counts', 'stock_adjustment_lines', 'stock_adjustments',
      'inventory_movements', 'journal_entry_lines', 'journal_entries', 'products',
      'suppliers', 'customers', 'bank_accounts', 'tax_rates', 'accounts', 'users', 'companies'
    ];

    db.transaction(() => {
      for (const t of tables) {
        db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
      }
    })();

    // Re-seed
    const { DB_PATH } = require('../db');
    // Re-trigger schema & seed
    const newDb = getDb();

    logAudit('comp-genesis-01', user.id, user.full_name, 'SYSTEM', 'RESTORE', 'all', 'Reset database to pristine demo state');
    res.json({ success: true, message: 'Database reset to demo state successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
