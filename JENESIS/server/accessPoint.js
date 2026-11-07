'use strict';
/**
 * The Access Point — who may open which JENESIS application, and which
 * permissions a particular user holds on top of their role.
 *
 * JENESIS Settings & Access Point (the yellow application) is the one place
 * these are managed. Three things it must be able to decide per user:
 *
 *  1. WHICH APPLICATIONS they may open. A role gives a sensible default, and
 *     an administrator may then narrow or widen it for one person.
 *  2. WHICH PERMISSIONS they hold beyond their role — an extra grant here, a
 *     single permission taken away there.
 *  3. WHEN SOMETHING CHANGED, so the other three applications, already open on
 *     other windows, pick the change up instead of working from a stale copy.
 *
 * Everything lives in the shared database, so there is only ever ONE copy of
 * the truth. The other applications do not keep their own settings; they ask.
 */
const { APP_IDS } = require('./appScope');

/**
 * Which permission opens each application by default.
 *
 * A user is not given a list of applications at sign-up — that would be one
 * more thing to forget. Instead the applications they need follow from the
 * permissions their role already carries.
 */
const APP_DEFAULT_PERMISSIONS = {
  seller: ['sales:write', 'sales:post', 'sales:read'],
  maintenance: ['network:manage', 'logs:read'],
  admin: ['dashboard:read', 'accounting:read', 'purchases:read', 'inventory:read', 'banking:read', 'reports:read'],
  settings: ['settings:access']
};

/** The applications a role reaches, before anyone changes it for one person. */
function defaultAppAccess(rolePermissions) {
  const held = rolePermissions instanceof Set
    ? rolePermissions
    : new Set(Array.isArray(rolePermissions) ? rolePermissions : []);
  const access = {};
  for (const appId of APP_IDS) {
    const needed = APP_DEFAULT_PERMISSIONS[appId] || [];
    access[appId] = needed.some((permission) => held.has(permission));
  }
  return access;
}

function rowToObject(rows) {
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

/**
 * The applications this user may open: the role's default, with an
 * administrator's explicit decision overriding it where one exists.
 */
function appAccessFor(db, { companyId, userId, rolePermissions }) {
  const access = defaultAppAccess(rolePermissions);
  let rows = [];
  try {
    rows = db.prepare(
      'SELECT app_id AS key, allowed AS value FROM user_app_access WHERE company_id = ? AND user_id = ?'
    ).all(companyId, userId);
  } catch (_) {
    // The table does not exist yet (a database opened before migration 6): the
    // role's default is the honest answer and nothing is lost.
    return access;
  }
  const explicit = rowToObject(rows);
  for (const appId of APP_IDS) {
    if (explicit[appId] !== undefined) access[appId] = Number(explicit[appId]) !== 0;
  }
  return access;
}

/** Records one user's access to one application. */
function setAppAccess(db, { companyId, userId, appId, allowed, actorId }) {
  if (!APP_IDS.includes(appId)) throw Object.assign(new Error('Unknown application.'), { code: 'APP_UNKNOWN' });
  const id = `uaa-${userId}-${appId}`;
  db.prepare(`
    INSERT INTO user_app_access (id, company_id, user_id, app_id, allowed, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, user_id, app_id)
    DO UPDATE SET allowed = excluded.allowed, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(id, companyId, userId, appId, allowed ? 1 : 0, new Date().toISOString(), actorId || null);
  return { appId, allowed: !!allowed };
}

/**
 * The permissions this user actually holds.
 *
 * Their role's list, plus anything an administrator granted them, minus
 * anything an administrator took away. Revocation wins over a grant, and a
 * grant can only ever ADD to the role — so narrowing a role never silently
 * gives someone more than they had.
 */
function effectivePermissions(db, { companyId, userId, role }) {
  const { ROLE_PERMISSIONS } = require('./auth');
  const held = new Set(ROLE_PERMISSIONS[role] || []);
  let rows = [];
  try {
    rows = db.prepare(
      'SELECT permission, effect FROM user_permissions WHERE company_id = ? AND user_id = ?'
    ).all(companyId, userId);
  } catch (_) {
    return held; // pre-migration database: the role is the whole answer
  }
  const grants = [];
  const revokes = [];
  for (const row of rows) {
    if (row.effect === 'grant') grants.push(row.permission);
    else if (row.effect === 'revoke') revokes.push(row.permission);
  }
  for (const permission of grants) held.add(permission);
  for (const permission of revokes) held.delete(permission);
  return held;
}

/** What an administrator has granted or revoked for one user. */
function permissionOverrides(db, { companyId, userId }) {
  let rows = [];
  try {
    rows = db.prepare(
      'SELECT permission, effect FROM user_permissions WHERE company_id = ? AND user_id = ? ORDER BY permission'
    ).all(companyId, userId);
  } catch (_) {
    return { grants: [], revokes: [] };
  }
  return {
    grants: rows.filter((r) => r.effect === 'grant').map((r) => r.permission),
    revokes: rows.filter((r) => r.effect === 'revoke').map((r) => r.permission)
  };
}

/**
 * Grants, revokes, or (with effect null) removes the override on one
 * permission.
 */
function setPermissionOverride(db, { companyId, userId, permission, effect, actorId }) {
  const { PERMISSIONS } = require('./auth');
  if (!PERMISSIONS.includes(permission)) {
    throw Object.assign(new Error('Unknown permission.'), { code: 'PERMISSION_UNKNOWN' });
  }
  if (effect !== null && effect !== 'grant' && effect !== 'revoke') {
    throw Object.assign(new Error('An override is either a grant or a revocation.'), { code: 'EFFECT_INVALID' });
  }
  const id = `upm-${userId}-${permission}`;
  if (effect === null) {
    db.prepare('DELETE FROM user_permissions WHERE company_id = ? AND user_id = ? AND permission = ?')
      .run(companyId, userId, permission);
    return { permission, effect: null };
  }
  db.prepare(`
    INSERT INTO user_permissions (id, company_id, user_id, permission, effect, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, user_id, permission)
    DO UPDATE SET effect = excluded.effect, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(id, companyId, userId, permission, effect, new Date().toISOString(), actorId || null);
  return { permission, effect };
}

/**
 * Records that something in the shared configuration changed.
 *
 * The other three applications — already open on other windows — cannot be
 * told directly, so the change is given a number. A window compares the
 * number it last saw with the one the service now reports and re-reads what
 * it needs. This is how a permission changed in Settings & Access Point takes
 * effect in a Seller window that is already signed in.
 */
function recordConfigEvent(db, companyId, scope) {
  try {
    const result = db.prepare('INSERT INTO config_events (company_id, scope, changed_at) VALUES (?, ?, ?)')
      .run(companyId, String(scope || 'general').slice(0, 40), new Date().toISOString());
    return Number(result.lastInsertRowid);
  } catch (_) {
    return 0; // pre-migration database: the other windows simply re-read as usual
  }
}

/** The number the other applications compare against. */
function configVersion(db, companyId) {
  try {
    const row = db.prepare('SELECT MAX(id) AS version FROM config_events WHERE company_id = ?').get(companyId);
    return Number(row && row.version) || 0;
  } catch (_) {
    return 0;
  }
}

module.exports = {
  APP_DEFAULT_PERMISSIONS,
  defaultAppAccess,
  appAccessFor,
  setAppAccess,
  effectivePermissions,
  permissionOverrides,
  setPermissionOverride,
  recordConfigEvent,
  configVersion
};
