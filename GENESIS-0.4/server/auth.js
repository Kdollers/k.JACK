'use strict';
/**
 * Authentication and authorization for the JENESIS API.
 *
 *  - Passwords: scrypt with a random per-user salt (legacy SHA-256 hashes are
 *    accepted once, then upgraded on successful login).
 *  - Sessions: random 256-bit bearer tokens. Only the SHA-256 digest of a token
 *    is stored, so a database copy cannot be used to impersonate users.
 *  - Expiry: idle timeout and absolute lifetime. Logout and password changes
 *    revoke sessions.
 *  - Lockout: repeated failed logins lock the account for a short period.
 *  - Authorization: every API route declares a permission; the backend checks it.
 */
const crypto = require('crypto');
const { getDb } = require('./db');
const { hashPassword, verifyPassword, legacyHash } = require('./passwords');

const SESSION_IDLE_MINUTES = 30;
const SESSION_ABSOLUTE_HOURS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
const PERMISSIONS = [
  'dashboard:read', 'reports:read', 'audit:read',
  'customers:read', 'customers:write', 'suppliers:read', 'suppliers:write',
  'taxes:read',
  'network:read', 'network:manage',
  'sales:read', 'sales:write', 'sales:post',
  'purchases:read', 'purchases:write', 'purchases:post',
  'inventory:read', 'inventory:valuation:read', 'inventory:write', 'inventory:adjust',
  'banking:read', 'banking:write',
  'accounting:read', 'accounting:write', 'journal:post', 'journal:reverse',
  'fx:read', 'fx:write', 'fx:revalue',
  'company:manage', 'users:manage', 'backup:export', 'backup:restore', 'demo:reset'
];

const READ_ALL = PERMISSIONS.filter((p) => p.endsWith(':read'));

const ROLE_PERMISSIONS = {
  admin: PERMISSIONS,
  accountant: [
    'dashboard:read', 'reports:read', 'audit:read',
    'customers:read', 'suppliers:read', 'taxes:read', 'sales:read', 'purchases:read', 'inventory:read', 'inventory:valuation:read',
    'banking:read', 'banking:write',
    'accounting:read', 'accounting:write', 'journal:post', 'journal:reverse',
    'fx:read', 'fx:write', 'fx:revalue'
  ],
  sales: [
    'dashboard:read',
    'customers:read', 'customers:write', 'taxes:read',
    'sales:read', 'sales:write', 'sales:post',
    'inventory:read'
  ],
  purchases: [
    'dashboard:read',
    'suppliers:read', 'suppliers:write', 'taxes:read',
    'purchases:read', 'purchases:write', 'purchases:post',
    'inventory:read', 'inventory:valuation:read'
  ],
  inventory: [
    'dashboard:read',
    'inventory:read', 'inventory:valuation:read', 'inventory:write', 'inventory:adjust',
    'sales:read', 'purchases:read', 'customers:read', 'suppliers:read'
  ],
  network: ['network:read', 'network:manage', 'dashboard:read'],
  // Managers have full visibility but cannot change or post anything.
  manager: [...READ_ALL]
};

const ROLES = Object.keys(ROLE_PERMISSIONS);

// An entry point can only REDUCE an authenticated company's permissions.
// A user may request a different app mode, but cannot acquire a permission
// that their verified per-company membership does not already grant.
const MODE_ROLES = {
  general: ROLES, // Existing sessions and tests retain their legacy behavior.
  seller: ['sales', 'admin'],
  administrator: ['admin', 'accountant', 'purchases', 'inventory', 'manager'],
  network: ['network', 'admin']
};
const MODE_PERMISSIONS = {
  seller: new Set(['dashboard:read', 'customers:read', 'customers:write', 'taxes:read',
    'sales:read', 'sales:write', 'sales:post', 'inventory:read']),
  administrator: new Set(PERMISSIONS.filter((p) => !p.startsWith('network:'))),
  network: new Set(['network:read', 'network:manage', 'dashboard:read',
    'backup:export', 'backup:restore'])
};
function modeSupportsRole(mode, role) {
  return Object.hasOwn(MODE_ROLES, mode) && MODE_ROLES[mode].includes(role);
}
function permissionsFor(role, mode = 'general') {
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  if (mode === 'general') return new Set(rolePermissions);
  const allowed = MODE_PERMISSIONS[mode];
  return new Set(rolePermissions.filter((p) => allowed?.has(p)));
}

// Actions a user may perform while their password must still be changed.
const PASSWORD_CHANGE_ALLOWED = new Set(['GET /auth/me', 'POST /auth/logout', 'POST /auth/change-password']);

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------
/** Returns an error descriptor or null when the password is acceptable. */
function checkPasswordPolicy(password, username = '') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { code: 'PASSWORD_TOO_SHORT', error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { code: 'PASSWORD_TOO_LONG', error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  if (username && password.toLowerCase() === String(username).toLowerCase()) {
    return { code: 'PASSWORD_MATCHES_USERNAME', error: 'Password must not be the same as the username.' };
  }
  if (/^(.)\1+$/.test(password)) {
    return { code: 'PASSWORD_TOO_SIMPLE', error: 'Password must not be a single repeated character.' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
function digest(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function createSession({ userId, companyId, mode = 'general', ip = null, userAgent = null }) {
  if (!Object.hasOwn(MODE_ROLES, mode)) throw new Error('Invalid application mode');
  const db = getDb();
  const token = crypto.randomBytes(32).toString('base64url');
  const created = new Date();
  db.prepare(`
    INSERT INTO sessions (id, user_id, company_id, app_mode, created_at, last_seen_at, idle_expires_at, absolute_expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    digest(token), userId, companyId, mode, created.toISOString(), created.toISOString(),
    addMinutes(created, SESSION_IDLE_MINUTES),
    new Date(created.getTime() + SESSION_ABSOLUTE_HOURS * 3600000).toISOString(),
    ip, userAgent
  );
  return token;
}

function revokeSession(token) {
  if (!token) return;
  getDb().prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(nowIso(), digest(token));
}

function revokeUserSessions(userId, exceptSessionId = null) {
  const db = getDb();
  if (exceptSessionId) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?')
      .run(nowIso(), userId, exceptSessionId);
  } else {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(nowIso(), userId);
  }
}

/** Revokes every live session (used after a backup restore). */
function revokeAllSessions() {
  getDb().prepare('UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL').run(nowIso());
}

/** Resolves a bearer token to a live session and user, or null. */
function resolveSession(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(digest(token));
  if (!session || session.revoked_at) return null;
  const now = new Date();
  if (now > new Date(session.idle_expires_at) || now > new Date(session.absolute_expires_at)) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(now.toISOString(), session.id);
    return null;
  }
  const user = db.prepare(`
    SELECT id, username, full_name, email, role, company_id, active, must_change_password
    FROM users WHERE id = ?
  `).get(session.user_id);
  if (!user || !user.active) return null;
  const membership = db.prepare(`SELECT role FROM company_memberships
    WHERE user_id = ? AND company_id = ?`).get(user.id, session.company_id);
  if (!membership || !modeSupportsRole(session.app_mode || 'general', membership.role)) return null;
  // The company role comes from the server-side membership, NEVER a request
  // header. The user's original company_id remains intact for legacy login.
  user.role = membership.role;

  // Sliding idle timeout, refreshed at most once a minute to limit writes.
  if (now - new Date(session.last_seen_at) > 60000) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE id = ?')
      .run(now.toISOString(), addMinutes(now, SESSION_IDLE_MINUTES), session.id);
  }
  return { session, user };
}

// ---------------------------------------------------------------------------
// Login with lockout
// ---------------------------------------------------------------------------
/**
 * Attempts a login. Returns { ok:true, user, token, mustChangePassword }
 * or { ok:false, code, error, status }.
 */
function login({ username, password, mode = 'general', ip, userAgent }) {
  const db = getDb();
  const name = typeof username === 'string' ? username.trim() : '';
  if (!name || typeof password !== 'string' || !password) {
    return { ok: false, status: 400, code: 'CREDENTIALS_REQUIRED', error: 'Username and password are required.' };
  }
  if (name.length > 40 || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', error: 'Invalid username or password.' };
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(name);
  const GENERIC = { ok: false, status: 401, code: 'INVALID_CREDENTIALS', error: 'Invalid username or password.' };

  if (!user) {
    // Spend comparable time so response timing does not reveal valid usernames.
    hashPassword(password);
    return GENERIC;
  }
  if (!user.active) return GENERIC;

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { ok: false, status: 423, code: 'ACCOUNT_LOCKED', error: 'Account temporarily locked after too many failed attempts. Try again later.' };
  }

  const result = verifyPassword(password, user.password_hash);
  if (!result.ok) {
    const failures = (user.failed_login_count || 0) + 1;
    const lockUntil = failures >= MAX_FAILED_LOGINS ? addMinutes(new Date(), LOCKOUT_MINUTES) : null;
    db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?')
      .run(lockUntil ? 0 : failures, lockUntil, user.id);
    return lockUntil
      ? { ok: false, status: 423, code: 'ACCOUNT_LOCKED', error: 'Account temporarily locked after too many failed attempts. Try again later.' }
      : GENERIC;
  }

  if (result.legacy) {
    // Upgrade the legacy hash to scrypt and require a fresh password on next use.
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
      .run(hashPassword(password), user.id);
  }

  db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?')
    .run(nowIso(), user.id);

  // Never attach a legacy user with a missing company to somebody else's data.
  const company = db.prepare('SELECT id FROM companies WHERE id = ?').get(user.company_id);
  const membership = company && db.prepare('SELECT role FROM company_memberships WHERE user_id = ? AND company_id = ?')
    .get(user.id, company.id);
  if (!membership) return { ok: false, status: 403, code: 'ACCOUNT_NO_COMPANY', error: 'This account has no valid company. Contact an administrator.' };
  if (!Object.hasOwn(MODE_ROLES, mode)) return { ok: false, status: 400, code: 'APP_MODE_INVALID' };
  if (!modeSupportsRole(mode, membership.role)) return { ok: false, status: 403, code: 'APP_MODE_FORBIDDEN' };
  const companyId = company.id;
  const token = createSession({ userId: user.id, companyId, mode, ip, userAgent });
  const fresh = db.prepare('SELECT must_change_password FROM users WHERE id = ?').get(user.id);
  return { ok: true, user: { ...user, role: membership.role }, token, companyId, mode,
    mustChangePassword: !!fresh.must_change_password };
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------
function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

/** Requires a valid session. Attaches req.auth = { user, session, companyId, permissions }. */
function authenticate(req, res, next) {
  const token = bearerToken(req);
  const resolved = resolveSession(token);
  if (!resolved) {
    return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
  }
  const { session, user } = resolved;

  // The client may name a company, but only the company bound to the session is accessible.
  const requested = req.headers['x-company-id'];
  if (requested && requested !== session.company_id) {
    return res.status(403).json({ error: 'You do not have access to this company.', code: 'COMPANY_FORBIDDEN' });
  }

  req.auth = {
    user,
    session,
    companyId: session.company_id,
    mode: session.app_mode || 'general',
    permissions: permissionsFor(user.role, session.app_mode || 'general')
  };

  if (user.must_change_password) {
    const routeKey = `${req.method} ${req.path}`.replace(/\/+$/, '');
    if (!PASSWORD_CHANGE_ALLOWED.has(routeKey)) {
      return res.status(403).json({ error: 'You must change your password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
  }
  return next();
}

/** Route guard. Must run after authenticate(). */
function requirePermission(permission) {
  if (!PERMISSIONS.includes(permission)) {
    throw new Error(`Unknown permission in route definition: ${permission}`);
  }
  const guard = (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
    if (!req.auth.permissions.has(permission)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.', code: 'FORBIDDEN', permission });
    }
    return next();
  };
  guard.permission = permission; // read by tests to verify every route is guarded
  return guard;
}

module.exports = {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  MODE_ROLES,
  modeSupportsRole,
  MIN_PASSWORD_LENGTH,
  SESSION_IDLE_MINUTES,
  SESSION_ABSOLUTE_HOURS,
  MAX_FAILED_LOGINS,
  hashPassword,
  verifyPassword,
  legacyHash,
  checkPasswordPolicy,
  createSession,
  revokeSession,
  revokeUserSessions,
  revokeAllSessions,
  resolveSession,
  login,
  authenticate,
  requirePermission,
  permissionsFor,
  bearerToken
};
