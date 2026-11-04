'use strict';
/**
 * Which JENESIS application a request comes from, and what it may touch.
 *
 * Modification 4 made JENESIS four sub-applications that share one database.
 * Modification 5 is what keeps them honest: sharing a database must not mean
 * that every application can reach everything in it.
 *
 * Permissions already say what a ROLE may do, and that is the first and most
 * important wall — a Seller holds no `reports:read`, so no report opens for
 * them no matter which application they are in. But a role is not an
 * application: an administrator who spends the morning in JENESIS Seller
 * should not, from that window, be pulling the general ledger. Hiding a menu
 * entry does not achieve that; refusing the request does.
 *
 * So each application declares the permissions it must never exercise, and the
 * route guard refuses them. The list is a denylist rather than an allowlist on
 * purpose: an allowlist that missed one permission would break a working
 * screen, whereas a denylist only ever refuses what is named.
 *
 * Requests that do not name an application are untouched. That keeps older
 * clients, the tests and any script working exactly as before; the separation
 * applies to the four applications, which always identify themselves.
 */
const { getDb } = require('./db');

/** The four applications, kept in step with src/appIdentity.js. */
const APP_IDS = ['seller', 'maintenance', 'admin', 'settings'];

/**
 * What each application must never do, whichever role is using it.
 *
 * JENESIS Accounting & Business is the whole program, so it is not restricted.
 */
const APP_FORBIDDEN = {
  admin: [],

  // JENESIS Seller sells. It has no reports, no purchases, no banking, no
  // journals, no users and no company settings to reach for.
  seller: [
    'reports:read', 'audit:read',
    'accounting:read', 'accounting:write', 'journal:post', 'journal:reverse',
    'purchases:read', 'purchases:write', 'purchases:post',
    'banking:read', 'banking:write', 'cash:count', 'cash:approve',
    'users:manage', 'company:manage', 'stores:manage',
    'network:manage', 'logs:read',
    'backup:export', 'backup:restore', 'demo:reset',
    'settings:access',
    'records:deactivate', 'records:delete'
  ],

  // JENESIS Network & Maintenance is a network tool. It watches the service,
  // the network and the log — it is not a second accounting program, and it
  // must not be able to read customers, suppliers, products, stock, sales or
  // purchases.
  maintenance: [
    'accounting:read', 'accounting:write', 'journal:post', 'journal:reverse',
    'sales:read', 'sales:write', 'sales:post',
    'purchases:read', 'purchases:write', 'purchases:post',
    'contacts:read', 'contacts:write',
    'inventory:read', 'inventory:write', 'inventory:adjust', 'inventory:approve',
    'reports:read', 'audit:read',
    'banking:read', 'banking:write', 'cash:count', 'cash:approve',
    'stores:manage', 'users:manage', 'company:manage',
    'records:deactivate', 'records:delete',
    'fx:write', 'fx:revalue',
    'backup:restore', 'demo:reset',
    'settings:access'
  ],

  // JENESIS Settings & Access Point configures the company, the users, the
  // taxes, the currencies and the backups. It does not trade, and it has no
  // business reading the customer and supplier lists either: nothing on its
  // screens needs them, so they are none of its business.
  settings: [
    'sales:read', 'sales:write', 'sales:post',
    'purchases:read', 'purchases:write', 'purchases:post',
    'contacts:read', 'contacts:write',
    'inventory:read', 'inventory:write', 'inventory:adjust', 'inventory:approve',
    'journal:post', 'journal:reverse',
    'banking:read', 'banking:write', 'cash:count', 'cash:approve',
    'reports:read',
    'demo:reset'
  ]
};

/** The permissions an application refuses, or an empty list. */
function forbiddenFor(appId) {
  return APP_FORBIDDEN[appId] || [];
}

/** True when the application must never exercise this permission. */
function isForbidden(appId, permission) {
  return forbiddenFor(appId).includes(permission);
}

/**
 * Reads the application named by a request. Anything unrecognised is ignored
 * rather than rejected: an unknown caller is simply not one of the four
 * applications, and is treated as before.
 */
function appIdFromRequest(req) {
  const raw = req.headers && req.headers['x-jenesis-app'];
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return APP_IDS.includes(value) ? value : null;
}

/** Middleware: records which application is calling, if it says. */
function attachApplication(req, res, next) {
  req.appId = appIdFromRequest(req);
  return next();
}

/**
 * Writes an authorization failure to the audit trail.
 *
 * Only the facts needed to understand the attempt are recorded: who, when,
 * which route, which application, which permission. Never the body, never the
 * headers — a header is where the session token and the password live, and
 * those must not reach a log.
 */
function recordRefusal({ req, code, permission, userId, userName, companyId }) {
  try {
    const db = getDb();
    const route = `${req.method} ${req.originalUrl || req.url}`.split('?')[0];
    const description = [
      code,
      route,
      req.appId ? `app=${req.appId}` : null,
      permission ? `permission=${permission}` : null,
      `ip=${req.ip || 'unknown'}`
    ].filter(Boolean).join(' · ');

    db.prepare(`
      INSERT INTO audit_logs (id, company_id, user_id, user_name, timestamp, module, action, record_id, description)
      VALUES (?, ?, ?, ?, ?, 'security', ?, ?, ?)
    `).run(
      `audit-sec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      companyId || null,
      userId || null,
      userName || 'unauthenticated',
      new Date().toISOString(),
      code,
      null,
      description
    );
  } catch (err) {
    // A refusal must never depend on the audit table being writable; losing
    // the record is better than turning a 403 into a crash.
    console.error('[security] could not record the refusal:', err && err.message);
  }
}

module.exports = {
  APP_IDS,
  APP_FORBIDDEN,
  forbiddenFor,
  isForbidden,
  appIdFromRequest,
  attachApplication,
  recordRefusal
};
