const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb, DB_PATH } = require('../db');
const { buildBackup, validateBackup, restoreBackup, verifiedCopy } = require('../backup');
const { createLimiter, clientIp, MINUTE } = require('../rateLimit');
const { hashPassword, verifyPassword } = require('../passwords');
const { setupStatus } = require('../setup-state');
const { normalizeUser, userConflict } = require('../user-validation');
const { ValidationError, requiredText, optionalText, nonnegative, activeFlag,
  entityCode, validateEmail, nextEntityCode, searchPattern, sendWriteError } = require('../crud-validation');
const { newCompanyConfig, updatedCompanyConfig } = require('../company-config');
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
  modeSupportsRole,
  MODE_ROLES,
  ROLES
} = require('../auth');
const {
  roundTo,
  assertMoneyPrecision,
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

// XAF/RWF/UGX have no minor monetary unit. Until jurisdiction-specific
// fractional-tax rounding is implemented, refuse a draft whose totals would be
// rounded away when displayed. USD/EUR keep the existing two-decimal behavior.
// Every monetary API body is in the company's base currency. Explicit foreign
// currency tags (including per-line tags) must never be silently reinterpreted;
// a foreign-currency contact cannot be invoiced without an FX ledger either.
function assertBaseCurrency(db, companyId, body, contactTable, contactId) {
  const base = db.prepare('SELECT currency_code FROM companies WHERE id = ?').get(companyId)?.currency_code;
  if (!base) throw new ValidationError('NOT_FOUND', 404);
  for (const entry of [body, ...(Array.isArray(body?.lines) ? body.lines : [])]) {
    if (!entry || typeof entry !== 'object') continue;
    for (const key of ['currency', 'currency_code', 'currencyCode']) {
      if (entry[key] !== undefined && entry[key] !== base) {
        throw new ValidationError('FOREIGN_CURRENCY_UNSUPPORTED', 409);
      }
    }
    const productId = entry.product_id ?? entry.productId;
    if (productId && !db.prepare('SELECT 1 FROM products WHERE id = ? AND company_id = ?').get(productId, companyId)) {
      throw new ValidationError('INVALID_REFERENCE', 409);
    }
    const taxId = entry.tax_rate_id ?? entry.taxRateId;
    if (taxId && !db.prepare('SELECT 1 FROM tax_rates WHERE id = ? AND company_id = ?').get(taxId, companyId)) {
      throw new ValidationError('INVALID_REFERENCE', 409);
    }
  }
  if (contactTable && contactId) {
    if (!['customers', 'suppliers'].includes(contactTable)) throw new Error('Invalid contact table');
    const contact = db.prepare(`SELECT default_currency FROM ${contactTable} WHERE id = ? AND company_id = ?`)
      .get(contactId, companyId);
    if (!contact) throw new ValidationError('INVALID_REFERENCE', 409);
    if (contact.default_currency && contact.default_currency !== base) {
      throw new ValidationError('FOREIGN_CURRENCY_UNSUPPORTED', 409);
    }
  }
  return base;
}

function assertLineMoney(db, companyId, qty, unitPrice, discountPercent, taxRate) {
  assertMoneyPrecision(db, companyId, unitPrice);
  if (db.prepare('SELECT currency_decimals FROM companies WHERE id = ?').get(companyId)?.currency_decimals === 0) {
    const gross = qty * unitPrice;
    const discount = gross * discountPercent / 100;
    const net = gross - discount;
    for (const value of [discount, net, net * taxRate / 100]) {
      assertMoneyPrecision(db, companyId, value);
    }
  }
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
  const { username, password, mode } = req.body || {};
  const result = login({ username, password, mode, ...clientInfo(req) });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error, code: result.code });
  }
  const company = getDb().prepare('SELECT * FROM companies WHERE id = ?').get(result.companyId);
  logAudit(result.companyId, result.user.id, result.user.full_name, 'AUTH', 'LOGIN', result.user.id, `User ${result.user.username} logged in`);
  res.json({
    token: result.token,
    user: publicUser({ ...result.user, must_change_password: result.mustChangePassword }),
    company,
    mode: result.mode,
    mustChangePassword: result.mustChangePassword
  });
});

router.get('/auth/me', (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const fresh = getDb().prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const company = getDb().prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  const allowedRoles = MODE_ROLES[req.auth.mode];
  const companies = getDb().prepare(`SELECT c.* FROM company_memberships m
    JOIN companies c ON c.id = m.company_id WHERE m.user_id = ?
      AND m.role IN (${allowedRoles.map(() => '?').join(',')}) ORDER BY c.name`).all(user.id, ...allowedRoles);
  res.json({ user: publicUser({ ...fresh, role: user.role }), company, companies,
    mode: req.auth.mode, permissions: [...req.auth.permissions].sort() });
});

// Switch by exchanging the current token for a new server-bound session.
// A company header or a client-side dropdown can NEVER grant access by itself.
router.post('/auth/switch-company', requirePermission('dashboard:read'), (req, res) => {
  const targetId = req.body?.company_id;
  if (typeof targetId !== 'string' || targetId.length > 120) return res.status(400).json({ code: 'COMPANY_INVALID' });
  const { user, companyId } = getSessionContext(req);
  const db = getDb();
  try {
    const switchSession = db.transaction(() => {
      const member = db.prepare(`SELECT m.role, c.* FROM company_memberships m
        JOIN companies c ON c.id = m.company_id
        JOIN users u ON u.id = m.user_id
        WHERE m.user_id = ? AND m.company_id = ? AND u.active = 1`).get(user.id, targetId);
      if (!member) return { code: 'COMPANY_FORBIDDEN' };
      if (!modeSupportsRole(req.auth.mode, member.role)) return { code: 'APP_MODE_FORBIDDEN' };
      const { role, ...company } = member;
      if (targetId === companyId) return { token: bearerToken(req), company };
      const token = createSession({ userId: user.id, companyId: targetId,
        mode: req.auth.mode, ...clientInfo(req) });
      revokeSession(bearerToken(req));
      logAudit(targetId, user.id, user.full_name, 'AUTH', 'SWITCH', user.id,
        `User ${user.username} switched company`);
      return { token, company };
    });
    const result = switchSession.immediate();
    return result.code ? res.status(403).json(result) : res.json(result);
  } catch (err) {
    console.error('Company switch failed:', err.code);
    return res.status(500).json({ code: 'GENERIC' });
  }
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

// The database is the only source of first-run state. An empty users table on an
// existing installation does NOT re-open public registration.
router.get('/setup/status', (req, res) => {
  res.json(setupStatus(getDb()));
});

router.post('/setup/initialize', setupLimiter.middleware, (req, res) => {
  const db = getDb();
  const initialState = setupStatus(db);
  if (!initialState.needsSetup) {
    return res.status(409).json({ code: initialState.recoveryRequired ? 'SETUP_RECOVERY_REQUIRED' : 'SETUP_COMPLETE' });
  }
  const { company_name, password, confirm_password } = req.body || {};
  const companyName = typeof company_name === 'string' ? company_name.trim() : '';
  if (!companyName) return res.status(400).json({ code: 'COMPANY_NAME_REQUIRED' });
  if (companyName.length > 120) return res.status(400).json({ code: 'COMPANY_NAME_INVALID' });
  let companyConfig;
  try {
    companyConfig = newCompanyConfig({ ...req.body, name: companyName }, { allowUnspecifiedCountry: true });
  } catch (err) { return sendWriteError(res, err); }
  const user = normalizeUser(req.body);
  if (user.code) return res.status(400).json({ code: user.code });
  const policy = checkPasswordPolicy(password, user.username);
  if (policy) return res.status(400).json({ code: policy.code });
  if (typeof confirm_password !== 'string' || password !== confirm_password) {
    return res.status(400).json({ code: 'PASSWORD_MISMATCH' });
  }
  const passwordHash = hashPassword(password);
  const id = generateId('usr');
  try {
    // BEGIN IMMEDIATE serializes competing installers, even if a second server
    // process points at the same SQLite file. Recheck EVERY condition under lock.
    const initialize = db.transaction(() => {
      const state = setupStatus(db);
      if (!state.needsSetup) return { code: state.recoveryRequired ? 'SETUP_RECOVERY_REQUIRED' : 'SETUP_COMPLETE' };
      const duplicate = userConflict(db, user);
      if (duplicate) return { code: duplicate };
      const company = db.prepare('SELECT id FROM companies ORDER BY created_at ASC LIMIT 1').get();
      if (!company) return { code: 'NO_COMPANY' };
      if (db.prepare('SELECT 1 FROM bank_accounts WHERE company_id = ? AND current_balance <> 0 LIMIT 1').get(company.id)) {
        return { code: 'CURRENCY_CHANGE_REQUIRES_MIGRATION' };
      }
      db.prepare(`UPDATE companies SET name = ?, legal_name = ?, country_code = ?,
        currency_code = ?, currency_symbol = ?, currency_decimals = ?,
        default_language = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(companyConfig.name, companyConfig.legal_name, companyConfig.country_code,
          companyConfig.currency_code, companyConfig.currency_symbol, companyConfig.currency_decimals,
          companyConfig.default_language, company.id);
      // The three freshly seeded cash/bank placeholders still have zero balances.
      // They must use the currency selected on first run, not a stale USD label.
      db.prepare('UPDATE bank_accounts SET currency = ? WHERE company_id = ? AND current_balance = 0')
        .run(companyConfig.currency_code, company.id);
      db.prepare(`INSERT INTO users
        (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
        VALUES (?, ?, ?, ?, ?, 'admin', ?, 1, datetime('now'), 0)`)
        .run(id, user.username, passwordHash, user.full_name, user.email, company.id);
      db.prepare('INSERT INTO company_memberships (user_id, company_id, role) VALUES (?, ?, ?)')
        .run(id, company.id, 'admin');
      db.prepare('UPDATE installation_state SET completed_at = ? WHERE id = 1')
        .run(new Date().toISOString());
      logAudit(company.id, id, user.full_name, 'AUTH', 'SETUP', id, `Initial administrator ${user.username} created`);
      return { success: true };
    });
    const result = initialize.immediate();
    if (!result.success) return res.status(result.code === 'NO_COMPANY' ? 500 : 409).json(result);
    return res.json(result);
  } catch (err) {
    // Never send SQLite internals (which can contain user input) to the client.
    if (err.code === 'SQLITE_BUSY') return res.status(503).json({ code: 'SETUP_BUSY' });
    if (err.code?.startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ code: 'SETUP_COMPLETE' });
    console.error('Initial setup failed:', err);
    return res.status(500).json({ code: 'GENERIC' });
  }
});

router.get('/auth/users', requirePermission('users:manage'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const users = getDb().prepare(`
    SELECT u.id, u.username, u.full_name, u.email, m.role, u.active,
           u.must_change_password, u.last_login_at, u.created_at
    FROM company_memberships m JOIN users u ON u.id = m.user_id
    WHERE m.company_id = ? ORDER BY u.full_name ASC
  `).all(companyId);
  res.json(users);
});

router.post('/auth/users', requirePermission('users:manage'), (req, res) => {
  const { companyId, user: currentUser } = getSessionContext(req);
  const { password, role } = req.body || {};
  if (!role || !password) return res.status(400).json({ code: 'MISSING_FIELDS' });
  if (!ROLES.includes(role)) return res.status(400).json({ code: 'ROLE_INVALID' });
  const person = normalizeUser(req.body);
  if (person.code) return res.status(400).json({ code: person.code });
  const policy = checkPasswordPolicy(password, person.username);
  if (policy) return res.status(400).json({ code: policy.code });

  const db = getDb();
  const id = generateId('usr');
  const passwordHash = hashPassword(password);
  try {
    const create = db.transaction(() => {
      const conflict = userConflict(db, person);
      if (conflict) return { code: conflict };
      db.prepare(`INSERT INTO users
        (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), 1)`)
        .run(id, person.username, passwordHash, person.full_name, person.email, role, companyId);
      db.prepare('INSERT INTO company_memberships (user_id, company_id, role) VALUES (?, ?, ?)')
        .run(id, companyId, role);
      logAudit(companyId, currentUser.id, currentUser.full_name, 'USERS', 'CREATE', id,
        `Created user ${person.username} (${role})`);
      return { id, ...person, role, active: 1, must_change_password: 1 };
    });
    const result = create.immediate();
    return result.code ? res.status(409).json(result) : res.json(result);
  } catch (err) {
    console.error('User creation failed:', err.code);
    return res.status(err.code?.startsWith('SQLITE_CONSTRAINT') ? 409 : 500).json({ code: 'USER_CREATE_FAILED' });
  }
});

router.put('/auth/users/:id', requirePermission('users:manage'), (req, res) => {
  const { companyId, user: currentUser } = getSessionContext(req);
  const { full_name, email, role, active, password } = req.body || {};
  const db = getDb();
  const target = db.prepare(`SELECT u.*, m.role AS membership_role FROM users u
    JOIN company_memberships m ON m.user_id = u.id
    WHERE u.id = ? AND m.company_id = ?`).get(req.params.id, companyId);
  if (!target) return res.status(404).json({ code: 'NOT_FOUND' });
  // A shared user profile is global. Editing it from a secondary company
  // could deactivate or reset that account in the user's original company.
  if (target.company_id !== companyId) return res.status(403).json({ code: 'CROSS_COMPANY_USER_UPDATE' });
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ code: 'ROLE_INVALID' });
  const person = normalizeUser({ username: target.username, full_name: full_name ?? target.full_name, email: email ?? target.email });
  if (person.code) return res.status(400).json({ code: person.code });
  const newRole = role !== undefined ? role : target.membership_role;
  const newActive = active !== undefined ? (active ? 1 : 0) : target.active;
  if (password) {
    const policy = checkPasswordPolicy(password, target.username);
    if (policy) return res.status(400).json({ code: policy.code });
  }
  const newHash = password ? hashPassword(password) : null;
  try {
    const update = db.transaction(() => {
      const fresh = db.prepare(`SELECT m.role, u.active FROM users u
        JOIN company_memberships m ON m.user_id = u.id
        WHERE u.id = ? AND m.company_id = ? AND u.company_id = ?`).get(target.id, companyId, companyId);
      if (!fresh) return { code: 'NOT_FOUND' };
      if (target.id === currentUser.id && (newRole !== 'admin' || newActive === 0)) return { code: 'SELF_LOCKOUT' };
      if (fresh.role === 'admin' && fresh.active && (newRole !== 'admin' || newActive === 0)) {
        const others = db.prepare(`SELECT COUNT(*) AS n FROM company_memberships m
          JOIN users u ON u.id = m.user_id WHERE m.company_id = ?
          AND m.role = 'admin' AND u.active = 1 AND u.id <> ?`)
          .get(companyId, target.id).n;
        if (!others) return { code: 'LAST_ADMIN' };
      }
      const conflict = userConflict(db, { email: person.email }, target.id);
      if (conflict) return { code: conflict };
      db.prepare('UPDATE users SET full_name = ?, email = ?, role = ?, active = ? WHERE id = ?')
        .run(person.full_name, person.email, newRole, newActive, target.id);
      db.prepare('UPDATE company_memberships SET role = ? WHERE user_id = ? AND company_id = ?')
        .run(newRole, target.id, companyId);
      if (newHash) {
        db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, failed_login_count = 0, locked_until = NULL WHERE id = ?')
          .run(newHash, target.id);
      }
      logAudit(companyId, currentUser.id, currentUser.full_name, 'USERS', 'UPDATE', target.id,
        `Updated user ${target.username}: role=${newRole}, active=${newActive}${newHash ? ', password reset' : ''}`);
      return { success: true };
    });
    const result = update.immediate();
    if (result.code) return res.status(result.code === 'NOT_FOUND' ? 404 : 400).json(result);
    if (newHash || newActive === 0 || newRole !== target.membership_role) revokeUserSessions(target.id);
    return res.json(result);
  } catch (err) {
    console.error('User update failed:', err.code);
    return res.status(500).json({ code: 'USER_UPDATE_FAILED' });
  }
});

// --------------------------------------------------------------------------
// 2. COMPANIES
// --------------------------------------------------------------------------
// List only companies with an explicit server-side membership for this user.
router.get('/companies', (req, res) => {
  const { user } = getSessionContext(req);
  const allowedRoles = MODE_ROLES[req.auth.mode];
  const list = getDb().prepare(`SELECT c.* FROM company_memberships m
    JOIN companies c ON c.id = m.company_id WHERE m.user_id = ?
      AND m.role IN (${allowedRoles.map(() => '?').join(',')})
    ORDER BY c.name ASC`).all(user.id, ...allowedRoles);
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
  try {
    const update = db.transaction(() => {
      const current = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
      if (!current) throw new ValidationError('NOT_FOUND', 404);
      const hasInventoryMovements = !!db.prepare('SELECT 1 FROM inventory_movements WHERE company_id = ? LIMIT 1').get(companyId);
      const form = updatedCompanyConfig(req.body || {}, current, hasInventoryMovements);
      db.prepare(`UPDATE companies
        SET name = ?, legal_name = ?, address = ?, phone = ?, email = ?, tax_id = ?,
            country_code = ?, currency_code = ?, currency_symbol = ?, currency_decimals = ?,
            fiscal_year_start = ?, fiscal_year_end = ?, default_language = ?,
            tax_inclusive_pricing = ?, inventory_valuation_method = ?, updated_at = datetime('now')
        WHERE id = ?`).run(form.name, form.legal_name, form.address, form.phone,
        form.email, form.tax_id, form.country_code, form.currency_code, form.currency_symbol,
        form.currency_decimals, form.fiscal_year_start, form.fiscal_year_end,
        form.default_language, form.tax_inclusive_pricing, form.inventory_valuation_method, companyId);
      logAudit(companyId, user.id, user.full_name, 'COMPANY', 'UPDATE', companyId,
        `Updated company profile ${form.name}`);
      return form;
    });
    return res.json({ success: true, company: update.immediate() });
  } catch (err) { return sendWriteError(res, err); }
});

router.post('/companies', requirePermission('company:manage'), (req, res) => {
  const { user, companyId } = getSessionContext(req);
  const db = getDb();
  try {
    const form = newCompanyConfig(req.body || {});
    const create = db.transaction(() => {
      const original = db.prepare('SELECT code, name, type, subtype, normal_balance, parent_id, is_system, active, notes FROM accounts WHERE company_id = ? ORDER BY code')
        .all(companyId);
      const required = ['1010', '1020', '1030', '1100', '1150', '1200', '2010', '2110', '4010', '5010'];
      if (required.some((code) => !original.some((a) => a.code === code))) {
        throw new ValidationError('CHART_INCOMPLETE', 409);
      }
      const id = generateId('comp');
      const code = 'JEN-' + require('node:crypto').randomBytes(6).toString('hex').toUpperCase();
      db.prepare(`INSERT INTO companies
        (id, code, name, legal_name, address, phone, email, tax_id, country_code,
         currency_code, currency_symbol, currency_decimals, fiscal_year_start, fiscal_year_end,
         default_language, tax_inclusive_pricing, inventory_valuation_method, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'WEIGHTED_AVERAGE', datetime('now'), datetime('now'))`)
        .run(id, code, form.name, form.legal_name, form.address, form.phone, form.email,
          form.tax_id, form.country_code, form.currency_code, form.currency_symbol,
          form.currency_decimals, form.fiscal_year_start, form.fiscal_year_end, form.default_language);

      // Clone definitions only. No account balances, tax rates, bank credentials,
      // users or business transactions are copied into a different company.
      const idByCode = new Map();
      const insert = db.prepare(`INSERT INTO accounts
        (id, company_id, code, name, type, subtype, normal_balance, parent_id, is_system, active, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`);
      for (const account of original) {
        const accountId = generateId('acc');
        idByCode.set(account.code, accountId);
        insert.run(accountId, id, account.code, account.name, account.type,
          account.subtype, account.normal_balance, account.is_system, account.active, account.notes);
      }
      // Keep parent/child chart relationships within the cloned company.
      for (const account of original) {
        if (!account.parent_id) continue;
        const sourceParent = db.prepare('SELECT code FROM accounts WHERE id = ? AND company_id = ?')
          .get(account.parent_id, companyId);
        if (!sourceParent || !idByCode.has(sourceParent.code)) throw new ValidationError('CHART_INCOMPLETE', 409);
        db.prepare('UPDATE accounts SET parent_id = ? WHERE id = ?')
          .run(idByCode.get(sourceParent.code), idByCode.get(account.code));
      }
      // Only the authorized creator receives access to the new company.
      db.prepare('INSERT INTO company_memberships (user_id, company_id, role) VALUES (?, ?, ?)')
        .run(user.id, id, 'admin');
      logAudit(id, user.id, user.full_name, 'COMPANY', 'CREATE', id,
        `Created new company ${form.name} (${code})`);
      return { id, code, ...form };
    });
    return res.json(create.immediate());
  } catch (err) { return sendWriteError(res, err); }
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
function contactFields(body, previous, kind, companyCurrency, companyDecimals) {
  const read = (key) => body[key] === undefined ? previous?.[key] : body[key];
  const currency = read('default_currency') || companyCurrency;
  const creditLimit = nonnegative(read('credit_limit'), 'CREDIT_LIMIT_INVALID');
  if (kind === 'customer' && (!previous || creditLimit !== previous.credit_limit)) {
    nonnegative(creditLimit, 'CURRENCY_PRECISION_INVALID', { decimals: companyDecimals ?? 2 });
  }
  if (currency !== companyCurrency && currency !== previous?.default_currency) {
    throw new ValidationError('FOREIGN_CURRENCY_UNSUPPORTED', 409);
  }
  return {
    name: requiredText(read('name'), kind === 'customer' ? 'CUSTOMER_NAME_REQUIRED' : 'SUPPLIER_NAME_REQUIRED'),
    contact_person: optionalText(read('contact_person'), 120),
    email: validateEmail(read('email')),
    phone: optionalText(read('phone'), 60), address: optionalText(read('address'), 300),
    city: optionalText(read('city'), 100), country: optionalText(read('country'), 100),
    tax_id: optionalText(read('tax_id'), 100),
    payment_terms: optionalText(read('payment_terms'), 40) || 'NET_30',
    default_currency: currency,
    active: activeFlag(body.active, previous?.active ?? 1),
    ...(kind === 'customer' ? {
      credit_limit: creditLimit
    } : {
      lead_time_days: nonnegative(read('lead_time_days'), 'LEAD_TIME_INVALID', { decimals: 0, maximum: 3650 }),
      rating: nonnegative(read('rating'), 'RATING_INVALID', { decimals: 0, maximum: 5 })
    })
  };
}
function uniqueContactCode(db, table, companyId, code, id = null) {
  if (db.prepare(`SELECT 1 FROM ${table} WHERE company_id = ? AND code = ? COLLATE NOCASE AND id != ?`)
    .get(companyId, code, id || '')) throw new ValidationError('DUPLICATE_RECORD', 409);
}
router.get('/customers', requirePermission('customers:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    const search = searchPattern(req.query.search);
    let sql = 'SELECT * FROM customers WHERE company_id = ?';
    const params = [companyId];
    if (search) {
      sql += " AND (name LIKE ? ESCAPE '!' OR code LIKE ? ESCAPE '!' OR phone LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!')";
      params.push(search, search, search, search);
    }
    return res.json(getDb().prepare(sql + ' ORDER BY name ASC').all(...params));
  } catch (err) { return sendWriteError(res, err); }
});

router.post('/customers', requirePermission('customers:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const create = db.transaction(() => {
      const body = req.body || {};
      const company = db.prepare('SELECT currency_code, currency_decimals FROM companies WHERE id = ?').get(companyId);
      const form = contactFields(body, null, 'customer', company.currency_code, company.currency_decimals);
      const id = generateId('cust');
      const code = body.code ? entityCode(body.code, 'CODE_INVALID') :
        nextEntityCode(db, 'customers', companyId, 'CUST');
      uniqueContactCode(db, 'customers', companyId, code);
      db.prepare(`INSERT INTO customers (id, company_id, code, name, contact_person, email, phone, address, city, country, tax_id, default_currency, payment_terms, active, credit_limit, opening_balance, current_balance, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'))`)
        .run(id, companyId, code, form.name, form.contact_person, form.email, form.phone, form.address, form.city, form.country, form.tax_id, form.default_currency, form.payment_terms, form.active, form.credit_limit);
      logAudit(companyId, user.id, user.full_name, 'CUSTOMERS', 'CREATE', id,
        `Created customer ${code} - ${form.name}`);
      return db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(id, companyId);
    });
    return res.json(create.immediate());
  } catch (err) { return sendWriteError(res, err); }
});

router.put('/customers/:id', requirePermission('customers:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const update = db.transaction(() => {
      const previous = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?')
        .get(req.params.id, companyId);
      if (!previous) throw new ValidationError('NOT_FOUND', 404);
      const body = req.body || {};
      const company = db.prepare('SELECT currency_code, currency_decimals FROM companies WHERE id = ?').get(companyId);
      const form = contactFields(body, previous, 'customer', company.currency_code, company.currency_decimals);
      const code = body.code === undefined ? previous.code : entityCode(body.code, 'CODE_INVALID');
      uniqueContactCode(db, 'customers', companyId, code, previous.id);
      db.prepare(`UPDATE customers SET code = ?, name = ?, contact_person = ?, email = ?, phone = ?, address = ?,
          city = ?, country = ?, tax_id = ?, default_currency = ?, payment_terms = ?, active = ?, credit_limit = ?
        WHERE id = ? AND company_id = ?`)
        .run(code, form.name, form.contact_person, form.email, form.phone, form.address, form.city, form.country, form.tax_id, form.default_currency, form.payment_terms, form.active, form.credit_limit, previous.id, companyId);
      logAudit(companyId, user.id, user.full_name, 'CUSTOMERS', 'UPDATE', previous.id,
        `Updated customer ${code} - ${form.name}`);
      return db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(previous.id, companyId);
    });
    return res.json({ success: true, customer: update.immediate() });
  } catch (err) { return sendWriteError(res, err); }
});

router.get('/customers/:id/statement', requirePermission('customers:read'), (req, res) => {
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
router.get('/suppliers', requirePermission('suppliers:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    const search = searchPattern(req.query.search);
    let sql = 'SELECT * FROM suppliers WHERE company_id = ?';
    const params = [companyId];
    if (search) {
      sql += " AND (name LIKE ? ESCAPE '!' OR code LIKE ? ESCAPE '!' OR phone LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!')";
      params.push(search, search, search, search);
    }
    return res.json(getDb().prepare(sql + ' ORDER BY name ASC').all(...params));
  } catch (err) { return sendWriteError(res, err); }
});

router.post('/suppliers', requirePermission('suppliers:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const create = db.transaction(() => {
      const body = req.body || {};
      const company = db.prepare('SELECT currency_code, currency_decimals FROM companies WHERE id = ?').get(companyId);
      const form = contactFields(body, null, 'supplier', company.currency_code, company.currency_decimals);
      const id = generateId('supp');
      const code = body.code ? entityCode(body.code, 'CODE_INVALID') :
        nextEntityCode(db, 'suppliers', companyId, 'SUPP');
      uniqueContactCode(db, 'suppliers', companyId, code);
      db.prepare(`INSERT INTO suppliers (id, company_id, code, name, contact_person, email, phone, address, city, country, tax_id, default_currency, payment_terms, active, lead_time_days, rating, opening_balance, current_balance, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'))`)
        .run(id, companyId, code, form.name, form.contact_person, form.email, form.phone, form.address, form.city, form.country, form.tax_id, form.default_currency, form.payment_terms, form.active, form.lead_time_days, form.rating);
      logAudit(companyId, user.id, user.full_name, 'SUPPLIERS', 'CREATE', id,
        `Created supplier ${code} - ${form.name}`);
      return db.prepare('SELECT * FROM suppliers WHERE id = ? AND company_id = ?').get(id, companyId);
    });
    return res.json(create.immediate());
  } catch (err) { return sendWriteError(res, err); }
});

router.put('/suppliers/:id', requirePermission('suppliers:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const update = db.transaction(() => {
      const previous = db.prepare('SELECT * FROM suppliers WHERE id = ? AND company_id = ?')
        .get(req.params.id, companyId);
      if (!previous) throw new ValidationError('NOT_FOUND', 404);
      const body = req.body || {};
      const company = db.prepare('SELECT currency_code, currency_decimals FROM companies WHERE id = ?').get(companyId);
      const form = contactFields(body, previous, 'supplier', company.currency_code, company.currency_decimals);
      const code = body.code === undefined ? previous.code : entityCode(body.code, 'CODE_INVALID');
      uniqueContactCode(db, 'suppliers', companyId, code, previous.id);
      db.prepare(`UPDATE suppliers SET code = ?, name = ?, contact_person = ?, email = ?, phone = ?, address = ?,
          city = ?, country = ?, tax_id = ?, default_currency = ?, payment_terms = ?, active = ?, lead_time_days = ?, rating = ?
        WHERE id = ? AND company_id = ?`)
        .run(code, form.name, form.contact_person, form.email, form.phone, form.address, form.city, form.country, form.tax_id, form.default_currency, form.payment_terms, form.active, form.lead_time_days, form.rating, previous.id, companyId);
      logAudit(companyId, user.id, user.full_name, 'SUPPLIERS', 'UPDATE', previous.id,
        `Updated supplier ${code} - ${form.name}`);
      return db.prepare('SELECT * FROM suppliers WHERE id = ? AND company_id = ?').get(previous.id, companyId);
    });
    return res.json({ success: true, supplier: update.immediate() });
  } catch (err) { return sendWriteError(res, err); }
});

router.get('/suppliers/:id/statement', requirePermission('suppliers:read'), (req, res) => {
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
function productFields(db, companyId, body, previous) {
  assertBaseCurrency(db, companyId, body);
  const read = (key) => body[key] === undefined ? previous?.[key] : body[key];
  const sku = entityCode(read('sku'), 'SKU_REQUIRED', 50);
  const name = requiredText(read('name'), 'PRODUCT_NAME_REQUIRED');
  const decimals = db.prepare('SELECT currency_decimals FROM companies WHERE id = ?')
    .get(companyId)?.currency_decimals ?? 2;
  const price = (key) => {
    const amount = nonnegative(read(key), 'PRICE_INVALID');
    if (!previous || amount !== previous[key]) {
      nonnegative(amount, 'CURRENCY_PRECISION_INVALID', { decimals });
    }
    return amount;
  };
  const type = read('type') || 'GOODS';
  if (!['GOODS', 'SERVICE'].includes(type)) throw new ValidationError('PRODUCT_TYPE_INVALID');
  const stock = nonnegative(read('current_stock'), 'STOCK_INVALID', { decimals: 3, maximum: 1e9 });
  if (previous ? (body.current_stock !== undefined && stock !== previous.current_stock) : stock !== 0) {
    throw new ValidationError('INITIAL_STOCK_REQUIRES_ADJUSTMENT', 409);
  }
  if (type === 'SERVICE' && stock !== 0) throw new ValidationError('STOCK_INVALID');
  if (previous && previous.type !== type && db.prepare('SELECT 1 FROM inventory_movements WHERE product_id = ? LIMIT 1').get(previous.id)) {
    throw new ValidationError('PRODUCT_TYPE_LOCKED', 409);
  }
  const taxRateId = body.tax_rate_id === undefined ? (previous?.tax_rate_id ?? null) : (body.tax_rate_id || null);
  if (taxRateId && !db.prepare('SELECT 1 FROM tax_rates WHERE id = ? AND company_id = ? AND active = 1').get(taxRateId, companyId)) {
    throw new ValidationError('INVALID_REFERENCE');
  }
  const accounts = {};
  for (const [field, code, typeRequired] of [
    ['sales_account_id', '4010', 'REVENUE'], ['cogs_account_id', '5010', 'COGS'],
    ['inventory_account_id', '1200', 'ASSET']
  ]) {
    const explicit = body[field];
    const candidate = explicit !== undefined ? explicit : previous?.[field];
    let account = candidate && db.prepare('SELECT id, type, active FROM accounts WHERE id = ? AND company_id = ?')
      .get(candidate, companyId);
    if (explicit !== undefined && !account) throw new ValidationError('INVALID_REFERENCE');
    if (!account) account = db.prepare('SELECT id, type, active FROM accounts WHERE company_id = ? AND code = ?').get(companyId, code);
    if (!account || !account.active || account.type !== typeRequired) throw new ValidationError('CHART_INCOMPLETE', 409);
    accounts[field] = account.id;
  }
  return {
    sku, name, type,
    barcode: optionalText(read('barcode'), 80) || `BAR-${sku}`,
    description: optionalText(read('description'), 500) || name,
    category: optionalText(read('category'), 100) || 'General',
    unit: requiredText(read('unit') || 'pcs', 'UNIT_INVALID', 30),
    cost_price: price('cost_price'),
    selling_price: price('selling_price'),
    min_stock_level: nonnegative(read('min_stock_level'), 'STOCK_INVALID', { decimals: 3, maximum: 1e9 }),
    current_stock: stock, tax_rate_id: taxRateId,
    warehouse_location: optionalText(read('warehouse_location'), 100) || 'Main Store',
    active: activeFlag(body.active, previous?.active ?? 1),
    ...accounts
  };
}
router.get('/products', requirePermission('inventory:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    const search = searchPattern(req.query.search);
    let sql = 'SELECT * FROM products WHERE company_id = ?';
    const params = [companyId];
    if (search) {
      sql += " AND (name LIKE ? ESCAPE '!' OR sku LIKE ? ESCAPE '!' OR category LIKE ? ESCAPE '!')";
      params.push(search, search, search);
    }
    const rows = getDb().prepare(sql + ' ORDER BY category ASC, name ASC').all(...params);
    if (!req.auth.permissions.has('inventory:valuation:read')) {
      return res.json(rows.map(({ cost_price, sales_account_id, cogs_account_id,
        inventory_account_id, ...product }) => product));
    }
    return res.json(rows);
  } catch (err) { return sendWriteError(res, err); }
});

router.post('/products', requirePermission('inventory:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const create = db.transaction(() => {
      const form = productFields(db, companyId, req.body || {}, null);
      if (db.prepare('SELECT 1 FROM products WHERE company_id = ? AND sku = ? COLLATE NOCASE')
        .get(companyId, form.sku)) throw new ValidationError('DUPLICATE_RECORD', 409);
      const id = generateId('prod');
      db.prepare(`INSERT INTO products
        (id, company_id, sku, barcode, name, description, category, type, unit,
         cost_price, selling_price, tax_rate_id, min_stock_level, current_stock, warehouse_location,
         sales_account_id, cogs_account_id, inventory_account_id, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'))`)
        .run(id, companyId, form.sku, form.barcode, form.name, form.description,
          form.category, form.type, form.unit, form.cost_price, form.selling_price,
          form.tax_rate_id, form.min_stock_level, form.warehouse_location,
          form.sales_account_id, form.cogs_account_id, form.inventory_account_id, form.active);
      logAudit(companyId, user.id, user.full_name, 'PRODUCTS', 'CREATE', id,
        `Created product ${form.sku} - ${form.name}`);
      return db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(id, companyId);
    });
    return res.json(create.immediate());
  } catch (err) { return sendWriteError(res, err); }
});

router.put('/products/:id', requirePermission('inventory:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const update = db.transaction(() => {
      const previous = db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?')
        .get(req.params.id, companyId);
      if (!previous) throw new ValidationError('NOT_FOUND', 404);
      const form = productFields(db, companyId, req.body || {}, previous);
      if (db.prepare('SELECT 1 FROM products WHERE company_id = ? AND sku = ? COLLATE NOCASE AND id != ?')
        .get(companyId, form.sku, previous.id)) throw new ValidationError('DUPLICATE_RECORD', 409);
      db.prepare(`UPDATE products SET sku = ?, barcode = ?, name = ?, description = ?, category = ?,
        type = ?, unit = ?, cost_price = ?, selling_price = ?, tax_rate_id = ?, min_stock_level = ?,
        warehouse_location = ?, sales_account_id = ?, cogs_account_id = ?, inventory_account_id = ?, active = ?
        WHERE id = ? AND company_id = ?`)
        .run(form.sku, form.barcode, form.name, form.description, form.category, form.type, form.unit,
          form.cost_price, form.selling_price, form.tax_rate_id, form.min_stock_level,
          form.warehouse_location, form.sales_account_id, form.cogs_account_id,
          form.inventory_account_id, form.active, previous.id, companyId);
      logAudit(companyId, user.id, user.full_name, 'PRODUCTS', 'UPDATE', previous.id,
        `Updated product ${form.sku} - ${form.name}`);
      return db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(previous.id, companyId);
    });
    return res.json({ success: true, product: update.immediate() });
  } catch (err) { return sendWriteError(res, err); }
});

router.get('/inventory/movements', requirePermission('inventory:valuation:read'), (req, res) => {
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

router.get('/inventory/valuation', requirePermission('inventory:valuation:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  try {
    res.json(reports.getInventoryValuation(companyId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/adjustments', requirePermission('inventory:valuation:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const adjs = db.prepare(`SELECT * FROM stock_adjustments WHERE company_id = ? ORDER BY date DESC, created_at DESC`).all(companyId);
  res.json(adjs);
});

router.post('/inventory/adjustments', requirePermission('inventory:adjust'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    assertBaseCurrency(getDb(), companyId, req.body);
    const result = postStockAdjustment(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/inventory/counts', requirePermission('inventory:valuation:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const counts = db.prepare(`SELECT * FROM physical_inventory_counts WHERE company_id = ? ORDER BY date DESC, created_at DESC`).all(companyId);
  res.json(counts);
});

router.post('/inventory/counts', requirePermission('inventory:adjust'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    assertBaseCurrency(getDb(), companyId, req.body);
    const result = postPhysicalCount(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
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

  try {
  assertBaseCurrency(db, companyId, req.body, 'customers', customer_id);
  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const price = Number(l.unit_price) || 0;
    const disc = Number(l.discount_percent) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    assertLineMoney(db, companyId, qty, price, disc, taxRate);
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
    if (err instanceof ValidationError) return sendWriteError(res, err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/sales/quotes/:id/convert-to-invoice', requirePermission('sales:write'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  const db = getDb();
  try {
    const quote = db.prepare('SELECT * FROM sales_quotes WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    assertBaseCurrency(db, companyId, req.body, 'customers', quote.customer_id);
    for (const value of [quote.subtotal, quote.tax_total, quote.discount_total, quote.total]) {
      assertMoneyPrecision(db, companyId, value);
    }

    const quoteLines = db.prepare('SELECT * FROM sales_quote_lines WHERE quote_id = ?').all(quote.id);
    for (const line of quoteLines) {
      for (const value of [line.unit_price, line.tax_amount, line.line_total]) {
        assertMoneyPrecision(db, companyId, value);
      }
    }
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
    if (err instanceof ValidationError) return sendWriteError(res, err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/sales/invoices', requirePermission('sales:read'), (req, res) => {
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

router.get('/sales/invoices/:id', requirePermission('sales:read'), (req, res) => {
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

  const visibleLines = req.auth.permissions.has('inventory:valuation:read') ? lines :
    lines.map(({ unit_cost, ...line }) => line);
  res.json({ ...invoice, lines: visibleLines, payments });
});

router.post('/sales/invoices', requirePermission('sales:write'), (req, res) => {
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

  try {
  assertBaseCurrency(db, companyId, req.body, 'customers', customer_id);
  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const price = Number(l.unit_price) || 0;
    const disc = Number(l.discount_percent) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    assertLineMoney(db, companyId, qty, price, disc, taxRate);
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
      if (autoPost) postSalesInvoice(companyId, invId, user);
    })();

    res.json({ id: invId, invoiceNumber: invNumber, total });
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/sales/invoices/:id/post', requirePermission('sales:post'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postSalesInvoice(companyId, req.params.id, user);
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
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
    assertBaseCurrency(getDb(), companyId, req.body, 'customers', req.body?.customerId);
    const result = postCreditNote(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
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

  try {
  assertBaseCurrency(db, companyId, req.body, 'suppliers', supplier_id);
  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const cost = Number(l.unit_cost) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    assertLineMoney(db, companyId, qty, cost, 0, taxRate);
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
    if (err instanceof ValidationError) return sendWriteError(res, err);
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

  try {
  assertBaseCurrency(db, companyId, req.body, 'suppliers', supplier_id);
  const lineData = lines.map(l => {
    const qty = Number(l.quantity) || 1;
    const cost = Number(l.unit_cost) || 0;
    const taxRate = Number(l.tax_rate) || 0;
    assertLineMoney(db, companyId, qty, cost, 0, taxRate);
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
      if (autoPost) postPurchaseInvoice(companyId, billId, user);
    })();

    res.json({ id: billId, billNumber, total });
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/purchases/bills/:id/post', requirePermission('purchases:post'), (req, res) => {
  const { companyId, user } = getSessionContext(req);
  try {
    const result = postPurchaseInvoice(companyId, req.params.id, user);
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
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
    assertBaseCurrency(getDb(), companyId, req.body, 'suppliers', req.body?.supplierId);
    const result = postPurchaseReturn(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
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
  const { bank_name, account_number, account_type = 'BANK', currency, opening_balance = 0, gl_code } = req.body || {};
  if (!bank_name || !account_number) {
    return res.status(400).json({ code: 'BANK_FIELDS_REQUIRED' });
  }
  const db = getDb();
  try {
    const company = db.prepare('SELECT currency_code FROM companies WHERE id = ?').get(companyId);
    if (!['BANK', 'CASH', 'MOBILE_MONEY'].includes(account_type)) throw new ValidationError('BANK_TYPE_INVALID');
    // There is no exchange-rate ledger in this release. A USD bank in an XAF
    // company would silently book USD as XAF; refuse it rather than guessing.
    const baseCurrency = company.currency_code;
    if (currency && currency !== baseCurrency) throw new ValidationError('FOREIGN_CURRENCY_UNSUPPORTED', 409);
    // A nonzero balance with no matching journal creates an unbalanced ledger.
    if (Number(opening_balance) !== 0 || !Number.isFinite(Number(opening_balance))) {
      throw new ValidationError('OPENING_BALANCE_REQUIRES_JOURNAL', 409);
    }
    const result = db.transaction(() => {
      const glAccount = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?')
        .get(companyId, gl_code || ({ CASH: '1010', BANK: '1020', MOBILE_MONEY: '1030' })[account_type]);
      if (!glAccount) throw new ValidationError('ACCOUNT_NOT_FOUND');
      const id = generateId('bank');
      db.prepare(`INSERT INTO bank_accounts
        (id, company_id, account_id, bank_name, account_number, account_type, currency, current_balance, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`)
        .run(id, companyId, glAccount.id, bank_name, account_number, account_type, baseCurrency);
      logAudit(companyId, user.id, user.full_name, 'BANKING', 'CREATE', id, `Added ${account_type} account ${bank_name}`);
      return { id, bank_name, account_number, currency: baseCurrency };
    })();
    res.json(result);
  } catch (err) { sendWriteError(res, err); }
});

router.get('/payments', requirePermission('banking:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const payments = db.prepare(`
    SELECT p.*, b.bank_name, b.account_type, b.account_number as bank_account_number,
           c.name as customer_name, s.name as supplier_name,
           a_exp.name as expense_account_name, a_exp.code as expense_account_code,
           a_inc.name as income_account_name, a_inc.code as income_account_code
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
    assertBaseCurrency(getDb(), companyId, req.body);
    const result = recordPayment(companyId, req.body, user);
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) return sendWriteError(res, err);
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
    assertBaseCurrency(getDb(), companyId, req.body);
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
    if (err instanceof ValidationError) return sendWriteError(res, err);
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
// 11. APP-SPECIFIC OVERVIEWS AND FINANCIAL REPORTS
// --------------------------------------------------------------------------
// Seller overview contains no costs, journals, supplier records or profit.
router.get('/seller/overview', requirePermission('sales:read'), (req, res) => {
  const { companyId } = getSessionContext(req);
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const sales = db.prepare(`SELECT COUNT(*) AS invoices, COALESCE(SUM(total), 0) AS sales_total
    FROM sales_invoices WHERE company_id = ? AND date = ? AND status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')`)
    .get(companyId, today);
  const customers = db.prepare('SELECT COUNT(*) AS count FROM customers WHERE company_id = ? AND active = 1').get(companyId);
  const lowStock = db.prepare(`SELECT COUNT(*) AS count FROM products WHERE company_id = ?
    AND active = 1 AND type = 'GOODS' AND current_stock <= min_stock_level`).get(companyId);
  res.json({ date: today, currency_code: db.prepare('SELECT currency_code FROM companies WHERE id = ?').get(companyId).currency_code,
    invoices: sales.invoices, sales_total: sales.sales_total,
    customers: customers.count, low_stock: lowStock.count });
});

// Health is company-independent and discloses no business amounts or identities.
router.get('/network/health', requirePermission('network:read'), (req, res) => {
  const db = getDb();
  res.json({ status: 'healthy', database: db.pragma('quick_check', { simple: true }),
    foreign_keys: db.pragma('foreign_keys', { simple: true }) === 1,
    version: require('../../package.json').version, timestamp: new Date().toISOString() });
});

router.get('/network/hosting', requirePermission('network:read'), (req, res) => {
  res.json(require('../lan-host').lanHost.status());
});
router.post('/network/hosting', requirePermission('network:manage'), async (req, res) => {
  // Never allow a remote session to reconfigure the LAN listener. Sessions and
  // permissions still apply to requests from the host's local desktop window.
  if (req.socket.encrypted || !require('../lan-host').isLoopback(req.socket.remoteAddress)) {
    return res.status(403).json({ code: 'LAN_HOST_ONLY' });
  }
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ code: 'INVALID_INPUT' });
  try {
    const lan = require('../lan-host').lanHost;
    const result = req.body.enabled ? await lan.enable() : await lan.disable();
    logAudit(req.auth.companyId, req.auth.user.id, req.auth.user.full_name, 'NETWORK',
      req.body.enabled ? 'ENABLE' : 'DISABLE', req.auth.companyId,
      req.body.enabled ? 'TLS LAN hosting enabled on the host' : 'TLS LAN hosting disabled on the host');
    res.json(result);
  } catch (err) {
    console.error('LAN hosting change failed:', err.code || err.name);
    res.status(409).json({ code: err.code?.startsWith('LAN_') ? err.code : 'LAN_START_FAILED' });
  }
});

// Maintenance can create an integrity-checked SQLite snapshot on the host.
// The response contains only metadata; only an administrator can download a
// company's business export or restore it with password reauthentication.
router.post('/network/snapshot', requirePermission('network:manage'), async (req, res) => {
  const db = getDb();
  try {
    const target = await verifiedCopy(db, DB_PATH, path.join(path.dirname(DB_PATH), 'backups'), 'jenesis-snapshot');
    logAudit(req.auth.companyId, req.auth.user.id, req.auth.user.full_name, 'NETWORK', 'BACKUP',
      req.auth.companyId, 'Verified SQLite snapshot created on the host');
    res.json({ success: true, name: path.basename(target), bytes: require('node:fs').statSync(target).size });
  } catch (err) {
    console.error('Snapshot failed:', err.code || err.name);
    res.status(500).json({ code: 'SAFETY_COPY_FAILED' });
  }
});

router.get('/reports/dashboard', requirePermission('reports:read'), (req, res) => {
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
router.get('/taxes', requirePermission('taxes:read'), (req, res) => {
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
    const backup = buildBackup(getDb(), companyId, { jenesisVersion: APP_VERSION });
    logAudit(companyId, user.id, user.full_name, 'SYSTEM', 'BACKUP', companyId, `Exported company backup (${backup.rowCounts.journal_entries} journal entries)`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="jenesis-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore: step-up authentication (current password) and typed confirmation are required.
// Body: { backup: <export document>, password: "<current password>", confirm: "RESTORE" }
router.post('/backup/import', requirePermission('backup:restore'), restoreLimiter.middleware, async (req, res) => {
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
  const check = validateBackup(backup, companyId, db);
  if (!check.ok) {
    return res.status(400).json({ error: check.error, code: check.code });
  }

  let safetyCopy;
  try {
    safetyCopy = await verifiedCopy(db, DB_PATH, path.join(path.dirname(DB_PATH), 'backups'), 'pre-restore');
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
