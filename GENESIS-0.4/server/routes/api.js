const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb, DB_PATH } = require('../db');
const { buildBackup, validateBackup, restoreBackup, verifiedCopy } = require('../backup');
const { createLimiter, clientIp, MINUTE } = require('../rateLimit');
const { hashPassword, verifyPassword } = require('../passwords');
const {
  authenticate,
  requirePermission,
  checkPasswordPolicy,
  createSession,
  revokeSession,
  revokeUserSessions,
  revokeAllSessions,
  login,
  bearerToken,
  ROLES
} = require('../auth');
const {
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
} = require('../accountingEngine');
const stores = require('../inventoryStores');
const goodsReceipts = require('../goodsReceipts');
const cashManagement = require('../cashManagement');
const fx = require('../fx');
const stockLedger = require('../stockLedger');
const reports = require('../reports');

const APP_VERSION = require('../../package.json').version;

// Rate limits for sensitive operations (see server/rateLimit.js).
const loginLimiter = createLimiter({
  name: 'login-account', windowMs: 15 * MINUTE, max: 10,
  keyFn: (req) => `${clientIp(req)}|${String((req.body && req.body.username) || '').toLowerCase().slice(0, 64)}`
});
const loginIpLimiter = createLimiter({ name: 'login-ip', windowMs: 15 * MINUTE, max: 100, keyFn: (req) => clientIp(req) });
const setupLimiter = createLimiter({ name: 'setup', windowMs: 15 * MINUTE, max: 10, keyFn: (req) => clientIp(req) });
const passwordLimiter = createLimiter({ name: 'change-password', windowMs: 15 * MINUTE, max: 10, keyFn: (req) => (req.auth ? req.auth.user.id : null) });
const restoreLimiter = createLimiter({ name: 'restore', windowMs: 60 * MINUTE, max: 5, keyFn: (req) => (req.auth ? req.auth.user.id : null) });

// Public endpoints: the only routes reachable without a valid session.
const PUBLIC_ROUTES = new Set([
  'POST /auth/login',
  'GET /setup/status',
  'POST /setup/initialize'
]);

// Every other route requires a valid session. Each route additionally declares
// its permission with requirePermission(...). A test verifies no route is unguarded.
router.use((req, res, next) => {
  if (PUBLIC_ROUTES.has(`${req.method} ${req.path}`)) return next();
  return authenticate(req, res, next);
});

/** Returns the authenticated company and user for the current request. */
function getSessionContext(req) {
  if (!req.auth) throw new Error('getSessionContext called without authentication');
  return { companyId: req.auth.companyId, user: req.auth.user };
}

// --------------------------------------------------------------------------
// 1. AUTH, SESSIONS & USERS
// --------------------------------------------------------------------------
function clientInfo(req) {
  return { ip: req.socket?.remoteAddress || null, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) };
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    role: u.role,
    email: u.email,
    must_change_password: !!u.must_change_password
  };
}

router.post('/auth/login', loginIpLimiter.middleware, loginLimiter.middleware, (req, res) => {
  const { username, password } = req.body || {};
  const result = login({ username, password, ...clientInfo(req) });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error, code: result.code });
  }
  const company = getDb().prepare('SELECT * FROM companies WHERE id = ?').get(result.companyId);
  logAudit(result.companyId, result.user.id, result.user.full_name, 'AUTH', 'LOGIN', result.user.id, `User ${result.user.username} logged in`);
  res.json({
    token: result.token,
    user: publicUser({ ...result.user, must_change_password: result.mustChangePassword }),
    company,
    mustChangePassword: result.mustChangePassword
  });
});

router.get('/auth/me', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const fresh = getDb().prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const company = getDb().prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  res.json({ user: publicUser(fresh), company, permissions: [...req.auth.permissions].sort() });
});

router.post('/auth/logout', (req, res) => {
  revokeSession(bearerToken(req));
  res.json({ success: true });
});

router.post('/auth/change-password', passwordLimiter.middleware, (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { current_password, new_password } = req.body || {};
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!verifyPassword(current_password, row.password_hash).ok) {
    return res.status(400).json({ error: 'Current password is incorrect.', code: 'CURRENT_PASSWORD_INCORRECT' });
  }
  const policy = checkPasswordPolicy(new_password, row.username);
  if (policy) return res.status(400).json({ error: policy.error, code: policy.code });
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hashPassword(new_password), user.id);
  // Other sessions of this user are no longer trusted after a password change.
  revokeUserSessions(user.id, req.auth.session.id);
  logAudit(companyId, user.id, user.full_name, 'AUTH', 'PASSWORD_CHANGE', user.id, `User ${user.username} changed password`);
  res.json({ success: true });
});

// Initial administrator setup: only possible while no active user exists.
router.get('/setup/status', (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT COUNT(*) AS n FROM users WHERE active = 1').get().n;
  res.json({ needsSetup: users === 0 });
});

router.post('/setup/initialize', setupLimiter.middleware, (req, res) => {
  const db = getDb();
  const activeUsers = db.prepare('SELECT COUNT(*) AS n FROM users WHERE active = 1').get().n;
  if (activeUsers > 0) {
    return res.status(409).json({ error: 'Setup has already been completed.', code: 'SETUP_COMPLETE' });
  }
  const { company_name, username, password, full_name, email } = req.body || {};
  if (!company_name || !String(company_name).trim()) {
    return res.status(400).json({ error: 'Company name is required.', code: 'COMPANY_NAME_REQUIRED' });
  }
  if (!username || !/^[A-Za-z0-9._-]{3,40}$/.test(String(username))) {
    return res.status(400).json({ error: 'Username must be 3-40 characters: letters, digits, dot, dash or underscore.', code: 'USERNAME_INVALID' });
  }
  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'Full name is required.', code: 'FULL_NAME_REQUIRED' });
  }
  const policy = checkPasswordPolicy(password, username);
  if (policy) return res.status(400).json({ error: policy.error, code: policy.code });

  const companyRow = db.prepare('SELECT id FROM companies ORDER BY created_at ASC LIMIT 1').get();
  if (!companyRow) {
    return res.status(500).json({ error: 'No company record exists. Restart GENESIS to initialise the database.', code: 'NO_COMPANY' });
  }
  const id = generateId('usr');
  db.transaction(() => {
    db.prepare('UPDATE companies SET name = ?, legal_name = ? WHERE id = ?')
      .run(String(company_name).trim(), String(company_name).trim(), companyRow.id);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
      VALUES (?, ?, ?, ?, ?, 'admin', ?, 1, datetime('now'), 0)
    `).run(id, username, hashPassword(password), String(full_name).trim(), email || null, companyRow.id);
  })();
  logAudit(companyRow.id, id, String(full_name).trim(), 'AUTH', 'SETUP', id, `Initial administrator ${username} created`);
  res.json({ success: true });
});

router.get('/auth/users', requirePermission('users:manage'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const users = getDb().prepare(`
    SELECT id, username, full_name, email, role, active, must_change_password, last_login_at, created_at
    FROM users WHERE company_id = ? ORDER BY full_name ASC
  `).all(companyId);
  res.json(users);
});

router.post('/auth/users', requirePermission('users:manage'), (req, res) => {
  const { companyId, user: currentUser } = getSessionContext(req);
  const { username, password, full_name, email, role } = req.body || {};
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Missing required user fields', code: 'MISSING_FIELDS' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Unknown role.', code: 'ROLE_INVALID' });
  }
  const policy = checkPasswordPolicy(password, username);
  if (policy) return res.status(400).json({ error: policy.error, code: policy.code });

  const db = getDb();
  const id = generateId('usr');
  try {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), 1)
    `).run(id, username, hashPassword(password), full_name, email, role, companyId);

    logAudit(companyId, currentUser.id, currentUser.full_name, 'USERS', 'CREATE', id, `Created user ${username} (${role})`);
    res.json({ id, username, full_name, email, role, active: 1, must_change_password: 1 });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Username already exists.' : err.message, code: 'USER_CREATE_FAILED' });
  }
});

router.put('/auth/users/:id', requirePermission('users:manage'), (req, res) => {
  const { companyId, user: currentUser } = getSessionContext(req);
  const { full_name, email, role, active, password } = req.body || {};
  const db = getDb();
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
  if (!target) return res.status(404).json({ error: 'User not found.', code: 'NOT_FOUND' });

  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Unknown role.', code: 'ROLE_INVALID' });
  }
  const newRole = role !== undefined ? role : target.role;
  const newActive = active !== undefined ? (active ? 1 : 0) : target.active;

  // Protect against lock-out: administrators cannot remove their own admin rights or disable themselves,
  // and the last active administrator can never be demoted or disabled.
  const losesAdmin = target.role === 'admin' && (newRole !== 'admin' || newActive === 0);
  if (losesAdmin) {
    if (target.id === currentUser.id) {
      return res.status(400).json({ error: 'You cannot remove your own administrator rights or disable your own account.', code: 'SELF_LOCKOUT' });
    }
    const otherAdmins = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND role = 'admin' AND active = 1 AND id <> ?`)
      .get(companyId, target.id).n;
    if (otherAdmins === 0) {
      return res.status(400).json({ error: 'At least one active administrator must remain.', code: 'LAST_ADMIN' });
    }
  }
  if (target.id === currentUser.id && newActive === 0) {
    return res.status(400).json({ error: 'You cannot disable your own account.', code: 'SELF_LOCKOUT' });
  }

  try {
    db.transaction(() => {
      db.prepare('UPDATE users SET full_name = ?, email = ?, role = ?, active = ? WHERE id = ?')
        .run(full_name ?? target.full_name, email ?? target.email, newRole, newActive, target.id);
      if (password) {
        const policy = checkPasswordPolicy(password, target.username);
        if (policy) throw Object.assign(new Error(policy.error), { code: policy.code });
        db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, failed_login_count = 0, locked_until = NULL WHERE id = ?')
          .run(hashPassword(password), target.id);
      }
    })();
    if (password || newActive === 0 || newRole !== target.role) {
      revokeUserSessions(target.id);
    }
    logAudit(companyId, currentUser.id, currentUser.full_name, 'USERS', 'UPDATE', target.id,
      `Updated user ${target.username}: role=${newRole}, active=${newActive}${password ? ', password reset' : ''}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'USER_UPDATE_FAILED' });
  }
});

// --------------------------------------------------------------------------
// 2. COMPANIES
// --------------------------------------------------------------------------
// Users can only see the company bound to their session.
router.get('/companies', (req, res) => {
  const { companyId } = getSessionContext(req);
  const list = getDb().prepare('SELECT * FROM companies WHERE id = ?').all(companyId);
  res.json(list);
});

router.get('/companies/current', (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  res.json(company || null);
});

router.put('/companies/current', requirePermission('company:manage'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  const {
    name, legal_name, address, phone, email, tax_id,
    currency_code, currency_symbol, currency_decimals,
    fiscal_year_start, fiscal_year_end, default_language, tax_inclusive_pricing, inventory_valuation_method,
    require_goods_receipt
  } = req.body;

  try {
    db.prepare(`
      UPDATE companies
      SET name = ?, legal_name = ?, address = ?, phone = ?, email = ?, tax_id = ?,
          currency_code = ?, currency_symbol = ?, currency_decimals = ?,
          fiscal_year_start = ?, fiscal_year_end = ?, default_language = ?,
          tax_inclusive_pricing = ?, inventory_valuation_method = ?, require_goods_receipt = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name, legal_name, address, phone, email, tax_id,
      currency_code, currency_symbol, currency_decimals,
      fiscal_year_start, fiscal_year_end, default_language,
      tax_inclusive_pricing ? 1 : 0, inventory_valuation_method || 'WEIGHTED_AVERAGE',
      require_goods_receipt ? 1 : 0,
      companyId
    );

    logAudit(companyId, user.id, user.full_name, 'COMPANY', 'UPDATE', companyId, `Updated company profile ${name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/companies', requirePermission('company:manage'), (req, res) => {
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
router.get('/accounts', requirePermission('accounting:read'), (req, res) => {
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

router.post('/accounts', requirePermission('accounting:write'), (req, res) => {
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

router.put('/accounts/:id', requirePermission('accounting:write'), (req, res) => {
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
router.get('/customers', requirePermission('contacts:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const search = req.query.search ? `%${req.query.search}%` : null;
  let sql = 'SELECT * FROM customers WHERE company_id = ?';
  const params = [companyId];
  // The anonymous walk-in customer is hidden from pickers/lists by default.
  if (req.query.include_walk_in !== '1') sql += ' AND is_walk_in = 0';
  if (search) {
    sql += ' AND (name LIKE ? OR code LIKE ? OR phone LIKE ? OR email LIKE ?)';
    params.push(search, search, search, search);
  }
  sql += ' ORDER BY name ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/customers', requirePermission('contacts:write'), (req, res) => {
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

router.put('/customers/:id', requirePermission('contacts:write'), (req, res) => {
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

router.get('/customers/:id/statement', requirePermission('contacts:read'), (req, res) => {
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
router.get('/suppliers', requirePermission('contacts:read'), (req, res) => {
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

router.post('/suppliers', requirePermission('contacts:write'), (req, res) => {
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

router.put('/suppliers/:id', requirePermission('contacts:write'), (req, res) => {
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

router.get('/suppliers/:id/statement', requirePermission('contacts:read'), (req, res) => {
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
router.get('/products', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const search = req.query.search ? `%${req.query.search}%` : null;
  let sql = 'SELECT * FROM products WHERE company_id = ?';
  const params = [companyId];
  if (search) {
    sql += ' AND (name LIKE ? OR sku LIKE ? OR category LIKE ? OR barcode LIKE ?)';
    params.push(search, search, search, search);
  }
  sql += ' ORDER BY category ASC, name ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/products', requirePermission('inventory:write'), (req, res) => {
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

router.put('/products/:id', requirePermission('inventory:write'), (req, res) => {
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

router.get('/inventory/movements', requirePermission('inventory:read'), (req, res) => {
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

router.get('/inventory/valuation', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getInventoryValuation(companyId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/adjustments', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const adjs = db.prepare(`SELECT * FROM stock_adjustments WHERE company_id = ? ORDER BY date DESC, created_at DESC`).all(companyId);
  res.json(adjs);
});

router.post('/inventory/adjustments', requirePermission('inventory:adjust'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postStockAdjustment(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/counts', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const counts = db.prepare(`SELECT * FROM physical_inventory_counts WHERE company_id = ? ORDER BY date DESC, created_at DESC`).all(companyId);
  res.json(counts);
});

// Direct one-shot posting stays available for approvers (admin/accountant).
// Inventory Officers use the draft → submit → approve → post workflow below.
router.post('/inventory/counts', requirePermission('inventory:approve'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postPhysicalCount(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/counts/:id', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const count = db.prepare(`
    SELECT pic.*, w.name AS warehouse_name, w.code AS warehouse_code,
      uc.full_name AS created_by_name, us.full_name AS submitted_by_name,
      ur.full_name AS reviewed_by_name, ua.full_name AS approved_by_name
    FROM physical_inventory_counts pic
    LEFT JOIN warehouses w ON w.id = pic.warehouse_id
    LEFT JOIN users uc ON uc.id = pic.created_by
    LEFT JOIN users us ON us.id = pic.submitted_by
    LEFT JOIN users ur ON ur.id = pic.reviewed_by
    LEFT JOIN users ua ON ua.id = pic.approved_by
    WHERE pic.id = ? AND pic.company_id = ?
  `).get(req.params.id, companyId);
  if (!count) return res.status(404).json({ error: 'Physical count not found' });
  const lines = db.prepare(`
    SELECT l.*, p.sku, p.name AS product_name, p.unit
    FROM physical_inventory_lines l JOIN products p ON p.id = l.product_id
    WHERE l.count_id = ?
  `).all(count.id);
  res.json({ ...count, lines });
});

// --- Physical count workflow (Inventory Officer) ---
router.post('/inventory/counts/draft', requirePermission('inventory:adjust'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(createCountDraft(companyId, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/inventory/counts/:id', requirePermission('inventory:adjust'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(updateCountDraft(companyId, req.params.id, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/inventory/counts/:id/submit', requirePermission('inventory:adjust'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(submitCountForReview(companyId, req.params.id, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/inventory/counts/:id/approve', requirePermission('inventory:approve'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(approveCount(companyId, req.params.id, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/inventory/counts/:id/reject', requirePermission('inventory:approve'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(rejectCount(companyId, req.params.id, req.body?.reason, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/inventory/counts/:id/post', requirePermission('inventory:approve'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(postApprovedCount(companyId, req.params.id, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Multiple stores (warehouses) ---
router.get('/inventory/warehouses', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  res.json(stores.listWarehouses(companyId, { includeInactive: req.query.include_inactive === '1' }));
});

router.post('/inventory/warehouses', requirePermission('stores:manage'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(stores.createWarehouse(companyId, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/inventory/warehouses/:id', requirePermission('stores:manage'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(stores.updateWarehouse(companyId, req.params.id, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/stock-levels', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  if (req.query.product_id) {
    try {
      res.json(stores.productStockByStore(companyId, req.query.product_id));
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
    return;
  }
  res.json(stockLedger.stockByWarehouse(db, companyId));
});

// --- Inter-store stock transfers ---
router.get('/inventory/transfers', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  res.json(stores.listTransfers(companyId, { status: req.query.status || null }));
});

router.get('/inventory/transfers/:id', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const t = stores.getTransfer(companyId, req.params.id);
  if (!t) return res.status(404).json({ error: 'Transfer not found' });
  res.json(t);
});

router.post('/inventory/transfers', requirePermission('inventory:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(stores.createTransfer(companyId, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/inventory/transfers/:id/dispatch', requirePermission('inventory:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(stores.dispatchTransfer(companyId, req.params.id, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/inventory/transfers/:id/receive', requirePermission('inventory:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(stores.receiveTransfer(companyId, req.params.id, req.body?.lines || null, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/inventory/transfers/:id/cancel', requirePermission('inventory:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(stores.cancelTransfer(companyId, req.params.id, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 7. SALES (Quotes, Orders, Invoices, Credit Notes)
// --------------------------------------------------------------------------
router.get('/sales/quotes', requirePermission('sales:read'), (req, res) => {
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

router.post('/sales/quotes', requirePermission('sales:write'), (req, res) => {
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

router.post('/sales/quotes/:id/convert-to-invoice', requirePermission('sales:write'), (req, res) => {
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

router.get('/sales/invoices', requirePermission('sales:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  // Searchable sales history: free-text (number / customer), status, customer,
  // walk-in flag and date-range filters.
  const { q = '', status = '', customer_id = '', walk_in = '', from = '', to = '' } = req.query;
  const params = [companyId];
  let sql = `
    SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.is_walk_in as customer_is_walk_in
    FROM sales_invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.company_id = ?`;
  if (q) {
    sql += ` AND (i.invoice_number LIKE ? OR c.name LIKE ? OR i.notes LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (status) { sql += ` AND i.status = ?`; params.push(status); }
  if (customer_id) { sql += ` AND i.customer_id = ?`; params.push(customer_id); }
  if (walk_in === '1' || walk_in === 'true') sql += ` AND i.walk_in = 1`;
  if (walk_in === '0' || walk_in === 'false') sql += ` AND i.walk_in = 0`;
  if (from) { sql += ` AND i.date >= ?`; params.push(from); }
  if (to) { sql += ` AND i.date <= ?`; params.push(to); }
  sql += ` ORDER BY i.date DESC, i.created_at DESC LIMIT 1000`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/sales/invoices/:id', requirePermission('sales:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.address as customer_address, c.tax_id as customer_tax_id, c.is_walk_in as customer_is_walk_in
    FROM sales_invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
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

router.post('/sales/invoices', requirePermission('sales:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const {
    date = new Date().toISOString().split('T')[0], due_date, customer_id, notes, lines, autoPost = false,
    walk_in = false, warehouse_id = null, currency_code = null, exchange_rate = null,
    bank_account_id = null, payment_method = 'CASH'
  } = req.body;
  if (!lines || lines.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }

  const db = getDb();

  // --- Customer resolution -------------------------------------------------
  // Walk-in (anonymous) sales use the system walk-in customer; ordinary sales
  // require a named customer (credit sales must always have one).
  const isWalkIn = !!walk_in;
  let customerId = customer_id || null;
  if (isWalkIn) {
    const wi = db.prepare(`SELECT id FROM customers WHERE company_id = ? AND is_walk_in = 1 ORDER BY created_at ASC LIMIT 1`).get(companyId);
    if (!wi) return res.status(400).json({ error: 'Walk-in customer is not configured for this company.' });
    customerId = wi.id;
  } else if (customerId) {
    const c = db.prepare(`SELECT id, is_walk_in FROM customers WHERE id = ? AND company_id = ?`).get(customerId, companyId);
    if (!c) return res.status(400).json({ error: 'Customer not found' });
    if (c.is_walk_in) return res.status(400).json({ error: 'The walk-in customer can only be used through walk-in sales.' });
  }
  if (!customerId) {
    return res.status(400).json({ error: 'Customer is required. For an anonymous cash sale, enable walk-in mode.' });
  }

  // --- Currency handling ----------------------------------------------------
  // Line amounts are entered in the transaction currency; ledger columns store
  // base-currency amounts, with the rate and foreign total preserved.
  const company = db.prepare(`SELECT currency_code FROM companies WHERE id = ?`).get(companyId);
  const baseCode = company?.currency_code || 'USD';
  const txCurrency = String(currency_code || baseCode).toUpperCase();
  const curInfo = fx.currencyInfo(db, companyId, txCurrency);
  if (currency_code && !curInfo) {
    return res.status(400).json({ error: `Currency ${txCurrency} is not configured. Add it in Settings → Currencies.` });
  }
  const fDec = curInfo ? curInfo.decimals : 2;

  const invNumber = nextSequenceNumber(companyId, 'INVOICE', 'INV');
  const invId = generateId('inv');

  let subtotalF = 0;
  let taxTotalF = 0;
  let discountTotalF = 0;

  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const price = Number(l.unit_price) || 0;
    const disc = Number(l.discount_percent) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    const lineSub = roundTo(qty * price * (1 - disc / 100), fDec);
    const lineTax = roundTo(lineSub * (taxRate / 100), fDec);
    const lineTot = roundTo(lineSub + lineTax, fDec);

    subtotalF = roundTo(subtotalF + lineSub, fDec);
    taxTotalF = roundTo(taxTotalF + lineTax, fDec);
    discountTotalF = roundTo(discountTotalF + (qty * price * (disc / 100)), fDec);

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

  let rate = 1;
  let subtotal = subtotalF;
  let taxTotal = taxTotalF;
  let discountTotal = discountTotalF;
  let foreignTotal = null;
  try {
    if (txCurrency !== baseCode) {
      rate = exchange_rate != null && Number(exchange_rate) > 0
        ? Number(exchange_rate)
        : fx.getRate(companyId, txCurrency, baseCode, date);
      subtotal = roundTo(subtotalF * rate, 2);
      taxTotal = roundTo(taxTotalF * rate, 2);
      discountTotal = roundTo(discountTotalF * rate, 2);
      foreignTotal = roundTo(subtotalF + taxTotalF, fDec);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const total = roundTo(subtotal + taxTotal, 2);

  const whId = warehouse_id || stockLedger.defaultWarehouseId(db, companyId);

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id, subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, notes, created_by, created_at, walk_in, warehouse_id, currency_code, exchange_rate, foreign_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?, datetime('now'), ?, ?, ?, ?, ?)
      `).run(invId, companyId, invNumber, date, due_date || date, customerId, subtotal, taxTotal, discountTotal, total, total, notes || null, user.id,
        isWalkIn ? 1 : 0, whId, txCurrency, rate, foreignTotal);

      const insertLine = db.prepare(`
        INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, unit_cost, discount_percent, tax_rate_id, tax_rate, tax_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ld of lineData) {
        insertLine.run(generateId('inl'), invId, ld.productId, ld.description, ld.quantity, ld.unitPrice, ld.unitCost, ld.discountPercent, ld.taxRateId, ld.taxRate, ld.taxAmount, ld.lineTotal);
      }

      logAudit(companyId, user.id, user.full_name, 'SALES', 'CREATE', invId,
        `Created sales invoice draft ${invNumber}${isWalkIn ? ' (walk-in)' : ''} (${foreignTotal != null ? `${foreignTotal} ${txCurrency} = ` : ''}${total} base)`);
    })();

    if (autoPost) {
      if (isWalkIn) {
        // Walk-in sales settle immediately in ONE transaction.
        postWalkInSale(companyId, invId, { bankAccountId: bank_account_id, paymentMethod: payment_method, date }, user);
      } else {
        postSalesInvoice(companyId, invId, user);
      }
    }

    res.json({ id: invId, invoiceNumber: invNumber, total, walkIn: isWalkIn, currencyCode: txCurrency, exchangeRate: rate, foreignTotal });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sales/invoices/:id/post', requirePermission('sales:post'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const inv = getDb().prepare(`SELECT walk_in FROM sales_invoices WHERE id = ? AND company_id = ?`).get(req.params.id, companyId);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    // Walk-in invoices settle immediately (post + full payment in one transaction).
    const result = inv.walk_in
      ? postWalkInSale(companyId, req.params.id, {
        bankAccountId: req.body?.bank_account_id || null,
        paymentMethod: req.body?.payment_method || 'CASH'
      }, user)
      : postSalesInvoice(companyId, req.params.id, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sales/credit-notes', requirePermission('sales:read'), (req, res) => {
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

router.post('/sales/credit-notes', requirePermission('sales:post'), (req, res) => {
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
router.get('/purchases/orders', requirePermission('purchases:read'), (req, res) => {
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

router.post('/purchases/orders', requirePermission('purchases:write'), (req, res) => {
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

router.get('/purchases/bills', requirePermission('purchases:read'), (req, res) => {
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

router.get('/purchases/bills/:id', requirePermission('purchases:read'), (req, res) => {
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

router.post('/purchases/bills', requirePermission('purchases:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const {
    vendor_invoice_number, date = new Date().toISOString().split('T')[0],
    due_date, supplier_id, notes, lines, autoPost = false,
    goods_receipt_id = null, currency_code = null, exchange_rate = null
  } = req.body;

  if (!supplier_id || !lines || lines.length === 0) {
    return res.status(400).json({ error: 'Supplier and at least one line item are required' });
  }

  const db = getDb();

  // Optional goods-receipt linkage: when the goods were already received on a
  // posted GRN, posting this bill clears GRNI instead of adding stock again.
  if (goods_receipt_id) {
    const gr = db.prepare(`SELECT * FROM goods_receipts WHERE id = ? AND company_id = ?`).get(goods_receipt_id, companyId);
    if (!gr) return res.status(400).json({ error: 'Linked goods receipt not found' });
    if (gr.status !== 'POSTED') return res.status(400).json({ error: 'Linked goods receipt is not posted' });
    if (gr.supplier_id !== supplier_id) return res.status(400).json({ error: 'The goods receipt belongs to a different supplier' });
  }

  // Currency handling (same rules as sales invoices): ledger columns store
  // base-currency amounts; rate + foreign total are preserved for history.
  const company = db.prepare(`SELECT currency_code FROM companies WHERE id = ?`).get(companyId);
  const baseCode = company?.currency_code || 'USD';
  const txCurrency = String(currency_code || baseCode).toUpperCase();
  const curInfo = fx.currencyInfo(db, companyId, txCurrency);
  if (currency_code && !curInfo) {
    return res.status(400).json({ error: `Currency ${txCurrency} is not configured. Add it in Settings → Currencies.` });
  }
  const fDec = curInfo ? curInfo.decimals : 2;

  const billNumber = nextSequenceNumber(companyId, 'BILL', 'BILL');
  const billId = generateId('bill');

  let subtotalF = 0;
  let taxTotalF = 0;

  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const cost = Number(l.unit_cost) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    const lineSub = roundTo(qty * cost, fDec);
    const lineTax = roundTo(lineSub * (taxRate / 100), fDec);
    const lineTot = roundTo(lineSub + lineTax, fDec);

    subtotalF = roundTo(subtotalF + lineSub, fDec);
    taxTotalF = roundTo(taxTotalF + lineTax, fDec);

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

  let rate = 1;
  let subtotal = subtotalF;
  let taxTotal = taxTotalF;
  let foreignTotal = null;
  try {
    if (txCurrency !== baseCode) {
      rate = exchange_rate != null && Number(exchange_rate) > 0
        ? Number(exchange_rate)
        : fx.getRate(companyId, txCurrency, baseCode, date);
      subtotal = roundTo(subtotalF * rate, 2);
      taxTotal = roundTo(taxTotalF * rate, 2);
      foreignTotal = roundTo(subtotalF + taxTotalF, fDec);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const total = roundTo(subtotal + taxTotal, 2);

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO purchase_invoices (id, company_id, bill_number, vendor_invoice_number, date, due_date, supplier_id, subtotal, tax_total, total, amount_paid, balance_due, status, notes, created_by, created_at, goods_receipt_id, currency_code, exchange_rate, foreign_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?, datetime('now'), ?, ?, ?, ?)
      `).run(billId, companyId, billNumber, vendor_invoice_number || null, date, due_date || date, supplier_id, subtotal, taxTotal, total, total, notes || null, user.id,
        goods_receipt_id || null, txCurrency, rate, foreignTotal);

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

router.post('/purchases/bills/:id/post', requirePermission('purchases:post'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postPurchaseInvoice(companyId, req.params.id, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/purchases/returns', requirePermission('purchases:read'), (req, res) => {
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

router.post('/purchases/returns', requirePermission('purchases:post'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postPurchaseReturn(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Purchase order detail (needed by the goods-receipt screen) ---
router.get('/purchases/orders/:id', requirePermission('purchases:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const po = db.prepare(`
    SELECT po.*, s.name AS supplier_name
    FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.id = ? AND po.company_id = ?
  `).get(req.params.id, companyId);
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  const lines = db.prepare(`
    SELECT l.*, p.sku, p.name AS product_name, p.unit
    FROM purchase_order_lines l LEFT JOIN products p ON p.id = l.product_id
    WHERE l.po_id = ?
  `).all(po.id);
  const receipts = db.prepare(`
    SELECT id, receipt_number, date, status, total_quantity, total_value
    FROM goods_receipts WHERE purchase_order_id = ? ORDER BY created_at DESC
  `).all(po.id);
  res.json({ ...po, lines, receipts });
});

// --- Goods receipts (stock increases ONLY here, never on PO/bill creation) ---
router.get('/purchases/receipts', requirePermission('purchases:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  res.json(goodsReceipts.listGoodsReceipts(companyId));
});

router.get('/purchases/receipts/:id', requirePermission('purchases:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const gr = goodsReceipts.getGoodsReceipt(companyId, req.params.id);
  if (!gr) return res.status(404).json({ error: 'Goods receipt not found' });
  res.json(gr);
});

router.post('/purchases/receipts', requirePermission('purchases:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(goodsReceipts.createGoodsReceipt(companyId, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/purchases/receipts/:id/post', requirePermission('purchases:post'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(goodsReceipts.postGoodsReceipt(companyId, req.params.id, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 9. PAYMENTS & CASH / BANK
// --------------------------------------------------------------------------
router.get('/payments/bank-accounts', requirePermission('banking:read'), (req, res) => {
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

router.post('/payments/bank-accounts', requirePermission('banking:write'), (req, res) => {
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

router.get('/payments', requirePermission('banking:read'), (req, res) => {
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

router.post('/payments', requirePermission('banking:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = recordPayment(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Receipt/payment correction: proper reversal with audit trail (never a silent
// delete). Undoes the journal entry and every balance side effect.
router.post('/payments/:id/reverse', requirePermission('banking:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = reversePayment(companyId, req.params.id, req.body?.reason || '', user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Physical cash counting & reconciliation (denomination based) ---
router.get('/banking/cash-sessions', requirePermission('banking:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  res.json(cashManagement.listCashSessions(companyId));
});

router.get('/banking/cash-sessions/:id', requirePermission('banking:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const session = cashManagement.getCashSession(companyId, req.params.id);
  if (!session) return res.status(404).json({ error: 'Cash session not found' });
  res.json(session);
});

router.post('/banking/cash-sessions/open', requirePermission('cash:count'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(cashManagement.openCashSession(companyId, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/banking/cash-sessions/:id/close', requirePermission('cash:count'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(cashManagement.closeCashSession(companyId, req.params.id, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/banking/cash-sessions/:id/approve', requirePermission('cash:approve'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(cashManagement.approveCashSession(companyId, req.params.id, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Multi-currency: currencies & exchange rates ---
router.get('/fx/currencies', requirePermission('fx:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  res.json(fx.listCurrencies(companyId, { includeInactive: req.query.include_inactive === '1' }));
});

router.post('/fx/currencies', requirePermission('fx:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(fx.createCurrency(companyId, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/fx/currencies/:id', requirePermission('fx:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(fx.updateCurrency(companyId, req.params.id, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/fx/rates', requirePermission('fx:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  res.json(fx.listRates(companyId, { from: req.query.from || null, to: req.query.to || null }));
});

router.post('/fx/rates', requirePermission('fx:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    res.json(fx.setRate(companyId, req.body, user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/fx/convert', requirePermission('fx:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    const amount = Number(req.query.amount || 0);
    const result = fx.convertAmount(companyId, amount, req.query.from, req.query.to, req.query.date || undefined);
    res.json({ amount, from: req.query.from, to: req.query.to, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 10. JOURNAL ENTRIES & ACCOUNTING
// --------------------------------------------------------------------------
router.get('/journal-entries', requirePermission('accounting:read'), (req, res) => {
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

router.get('/journal-entries/:id', requirePermission('accounting:read'), (req, res) => {
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

router.post('/journal-entries', requirePermission('journal:post'), (req, res) => {
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

router.post('/journal-entries/:id/reverse', requirePermission('journal:reverse'), (req, res) => {
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
router.get('/reports/dashboard', requirePermission('dashboard:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    res.json(reports.getDashboardStats(companyId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/trial-balance', requirePermission('reports:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getTrialBalance(companyId, req.query.asOfDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/profit-loss', requirePermission('reports:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    res.json(reports.getProfitAndLoss(companyId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/balance-sheet', requirePermission('reports:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getBalanceSheet(companyId, req.query.asOfDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/cash-flow', requirePermission('reports:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const { startDate, endDate } = req.query;
  try {
    res.json(reports.getCashFlowStatement(companyId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/general-ledger', requirePermission('reports:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const { accountId, startDate, endDate } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });
  try {
    res.json(reports.getGeneralLedger(companyId, accountId, startDate, endDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/ar-aging', requirePermission('reports:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getArAging(companyId, req.query.asOfDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/ap-aging', requirePermission('reports:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getApAging(companyId, req.query.asOfDate));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports/tax-report', requirePermission('reports:read'), (req, res) => {
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
router.get('/taxes', requirePermission('accounting:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  res.json(db.prepare('SELECT * FROM tax_rates WHERE company_id = ? ORDER BY rate DESC').all(companyId));
});

router.post('/taxes', requirePermission('accounting:write'), (req, res) => {
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
router.get('/audit-trail', requirePermission('audit:read'), (req, res) => {
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
router.get('/backup/export', requirePermission('backup:export'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const backup = buildBackup(getDb(), companyId, { genesisVersion: APP_VERSION });
    logAudit(companyId, user.id, user.full_name, 'SYSTEM', 'BACKUP', companyId, `Exported company backup (${backup.rowCounts.journal_entries} journal entries)`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="genesis-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore: step-up authentication (current password) and typed confirmation are required.
// Body: { backup: <export document>, password: "<current password>", confirm: "RESTORE" }
router.post('/backup/import', requirePermission('backup:restore'), restoreLimiter.middleware, (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const { backup, password, confirm } = req.body || {};
  const db = getDb();

  if (confirm !== 'RESTORE') {
    return res.status(400).json({ error: 'Type RESTORE to confirm.', code: 'CONFIRMATION_REQUIRED' });
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  if (typeof password !== 'string' || !row || !verifyPassword(password, row.password_hash).ok) {
    logAudit(companyId, user.id, user.full_name, 'AUTH', 'RESTORE_DENIED', companyId, 'Restore refused: password re-entry failed');
    return res.status(403).json({ error: 'Your password is required to restore a backup.', code: 'REAUTH_FAILED' });
  }
  const check = validateBackup(backup, companyId);
  if (!check.ok) {
    return res.status(400).json({ error: check.error, code: check.code });
  }

  let safetyCopy;
  try {
    safetyCopy = verifiedCopy(db, DB_PATH, path.join(path.dirname(DB_PATH), 'backups'), 'pre-restore');
  } catch (err) {
    return res.status(500).json({ error: err.message, code: 'SAFETY_COPY_FAILED' });
  }

  try {
    const restored = restoreBackup(db, companyId, backup);
    // Everyone must sign in again; credentials and permissions are not changed by a restore.
    revokeAllSessions();
    logAudit(companyId, user.id, user.full_name, 'SYSTEM', 'RESTORE', companyId,
      `Restored company backup from ${backup.exportedAt} (${restored.journal_entries} journal entries); all sessions revoked`);
    res.json({
      success: true,
      message: 'Backup restored. All sessions were signed out; sign in again.',
      restored,
      safetyCopy: path.basename(safetyCopy),
      signedOut: true
    });
  } catch (err) {
    res.status(err.code === 'BACKUP_FK_FAILED' || err.code === 'BACKUP_UNBALANCED' ? 400 : 500)
      .json({ error: err.message, code: err.code || 'RESTORE_FAILED', safetyCopy: path.basename(safetyCopy) });
  }
});

// The former "reset to demo" endpoint dropped every table, including users, and could
// not re-seed the already-open database. It is disabled. Demo data is created only on a
// fresh database started with GENESIS_SEED_DEMO=1.
router.post('/backup/reset-demo', requirePermission('demo:reset'), (req, res) => {
  return res.status(410).json({
    error: 'Resetting the database from the interface is disabled. Use a backup and restore instead.',
    code: 'RESET_DISABLED'
  });
});

module.exports = router;
