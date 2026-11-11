#!/usr/bin/env node
'use strict';
/**
 * LIVE PERMISSION PROBE — proves the four applications really are separated.
 *
 * `tests/app-separation.test.js` reads the rules and checks them against
 * themselves. That is worth doing, but it cannot catch the failure that
 * matters: a route that forgets to ask. If a handler never calls
 * requirePermission, no amount of rule-checking notices, and JENESIS Seller
 * quietly serves the general ledger.
 *
 * So this walks the real HTTP surface instead. It signs in as each of the six
 * roles, then calls every read-only route from each of the four applications
 * in turn — exactly what a window would do if a user pointed it somewhere it
 * did not belong. The expected answer is derived from the server's own rules
 * (the role's permissions, the application's forbidden list and the
 * user's application access), and compared with what actually came back.
 *
 * Only GET routes are swept, because a sweep must not change the books. The
 * script finishes by counting the journal entries: if that number moved, the
 * probe wrote something and its own result cannot be trusted.
 *
 * Usage:
 *   node scripts/live-permission-probe.cjs [baseUrl] [password]
 */
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const PASSWORD = process.argv[3] || 'Jenesis-2026';
const ROOT = path.join(__dirname, '..');

const { ROLE_PERMISSIONS } = require(path.join(ROOT, 'server', 'auth.js'));
const { APP_FORBIDDEN, APP_IDS } = require(path.join(ROOT, 'server', 'appScope.js'));
const { APP_DEFAULT_PERMISSIONS } = require(path.join(ROOT, 'server', 'accessPoint.js'));

const ROLES = ['admin', 'accountant', 'sales', 'purchases', 'inventory', 'manager'];

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push(`${name}: ${err && err.message ? err.message : err}`);
    console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
  }
}

/**
 * Endpoints the sweep must skip, and why.
 *
 * GET /messenger/stream is a Server-Sent Events feed: it answers 200 and then
 * stays open for as long as the window is, by design. A permission sweep waits
 * for the status line and nothing more, so including it would hang forever —
 * and it would hang on the one endpoint where "no answer" looks most like
 * "allowed". It is therefore named here rather than quietly timing out.
 */
const SKIP = new Set(['/messenger/stream']);

async function call(method, url, { token, app } = {}, retries = 0) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (app) headers['X-Jenesis-App'] = app;
  // No single call may hold the sweep up. Ten seconds is generous for a local
  // permission check; anything slower is a route worth investigating anyway.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(`${BASE}${url}`, { method, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  // The service allows 1200 API calls a minute from one address, which is
  // generous for a person and not enough for a sweep of fifteen hundred. That
  // limit is a feature, not an obstacle, so the probe waits it out rather than
  // reading a 429 as a refusal it never was.
  if (res.status === 429) {
    const waitMs = Math.min(Number(res.headers.get('retry-after') || 60), 70) * 1000 + 500;
    if (retries >= 3) return { status: 429, body: null, rateLimited: true };
    await new Promise((r) => setTimeout(r, waitMs));
    return call(method, url, { token, app }, retries + 1);
  }

  let body = null;
  try { body = await res.json(); } catch (_) { /* not JSON: status is what we need */ }
  return { status: res.status, body };
}

/** The applications a role reaches before anyone overrides it for one person. */
function defaultAppAccess(role) {
  const held = new Set(ROLE_PERMISSIONS[role] || []);
  const access = {};
  for (const appId of APP_IDS) {
    const needed = APP_DEFAULT_PERMISSIONS[appId] || [];
    access[appId] = needed.some((p) => held.has(p));
  }
  return access;
}

/**
 * Why a request should be refused, or null when it should be allowed.
 *
 * `permissions` is the route's WHOLE list, not just its first entry. A route
 * guarded by requireAnyPermission('accounting:read', 'sales:read') is open to
 * a sales clerk even though that role holds no accounting:read — which is the
 * point of it, since JENESIS Seller needs the VAT rates to raise an invoice.
 * Reading only the first permission would report that as a security hole.
 *
 * The order of the questions below is the order the server asks them, so a
 * mismatch names the rule that disagreed rather than merely "wrong status".
 */
function expectedRefusal(role, app, permissions) {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  const held = new Set(ROLE_PERMISSIONS[role] || []);
  const forbidden = APP_FORBIDDEN[app] || [];

  if (!defaultAppAccess(role)[app]) return 'APP_ACCESS_DENIED';

  const possessed = list.filter((p) => held.has(p));
  if (possessed.length === 0) return 'FORBIDDEN';

  if (possessed.every((p) => forbidden.includes(p))) return 'APP_SCOPE_FORBIDDEN';
  return null;
}

/**
 * Every GET route and the permission it demands, read out of the route file
 * rather than retyped here, so a new route joins the sweep automatically.
 */
function readRoutes() {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'api.js'), 'utf8');
  const lines = src.split('\n');
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,/.exec(lines[i]);
    if (!m) continue;
    const verb = m[1].toUpperCase();
    if (verb !== 'GET') continue; // a sweep must never change the books
    const chunk = lines.slice(i, i + 6).join('\n');
    // A route may be guarded by requireAnyPermission('a', 'b'): every name in
    // the call is captured, not only the first, because the second is exactly
    // what opens the route to a role the first would exclude.
    const guard = /require(?:Any)?Permission\(([^)]*)\)/.exec(chunk);
    const perms = guard ? [...guard[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
    rows.push({ verb, path: m[2], perms });
  }
  return rows;
}

async function main() {
  console.log(`--- LIVE PERMISSION PROBE against ${BASE} ---`);

  // The server has to be there at all.
  const health = await call('GET', '/api/health').catch(() => null);
  if (!health || health.status >= 500) {
    console.log('  ! the server is not answering — start it with scripts/preview-server.sh');
    process.exit(1);
  }

  // Sign in as each role.
  const tokens = {};
  for (const role of ROLES) {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: role, password: PASSWORD })
    }).then((r) => r.json().catch(() => ({}))).catch(() => ({}));
    tokens[role] = login && login.token ? login.token : null;
  }

  check('all six roles can sign in', () => {
    const missing = ROLES.filter((r) => !tokens[r]);
    if (missing.length) throw new Error(`no session for: ${missing.join(', ')}`);
  });

  const routes = readRoutes().filter((r) => r.perms.length > 0 && !SKIP.has(r.path));
  check('the sweep found the read-only routes it is supposed to cover', () => {
    if (routes.length < 40) throw new Error(`only ${routes.length} guarded GET routes found`);
  });

  // Journal entry count, taken before the sweep so we can prove it afterwards.
  const before = await call('GET', '/api/journal-entries', { token: tokens.admin });
  const beforeCount = Array.isArray(before.body) ? before.body.length : null;

  let probes = 0;
  let refusals = 0;
  const wrong = [];
  console.log(`  (${ROLES.length} roles x ${APP_IDS.length} apps x ${routes.length} routes = ${ROLES.length * APP_IDS.length * routes.length} calls)`);

  for (const role of ROLES) {
    for (const app of APP_IDS) {
      for (const route of routes) {
        // A path with :id in it is called with a harmless placeholder: the
        // permission guard runs before the handler, so the answer is the same.
        const url = `/api${route.path}`.replace(/:id/g, 'probe-nonexistent');
        const expected = expectedRefusal(role, app, route.perms);
        const res = await call('GET', url, { token: tokens[role], app });
        probes += 1;

        if (expected) {
          refusals += 1;
          if (res.status !== 403) {
            wrong.push(
              `${role} in ${app} -> GET ${route.path} (needs ${route.perms.join('|')}) ` +
              `should be refused as ${expected}, but returned ${res.status}`
            );
          } else if (res.body && res.body.code && res.body.code !== expected) {
            wrong.push(
              `${role} in ${app} -> GET ${route.path}: refused as ${res.body.code}, ` +
              `expected ${expected}`
            );
          }
        } else if (res.status === 403) {
          wrong.push(
            `${role} in ${app} -> GET ${route.path} (needs ${route.perms.join('|')}) ` +
            `should be ALLOWED, but was refused (${res.body && res.body.code})`
          );
        } else if (res.status >= 500) {
          wrong.push(
            `${role} in ${app} -> GET ${route.path} (needs ${route.perms.join('|')}) ` +
            `crashed with ${res.status}`
          );
        }
      }
    }
  }

  check(
    `every application refuses what it must, and allows what it should ` +
    `(${probes} calls, ${refusals} of them expected refusals)`,
    () => {
      if (wrong.length) {
        throw new Error(
          `${wrong.length} wrong answer(s):\n      ` + wrong.slice(0, 12).join('\n      ')
        );
      }
      if (refusals === 0) throw new Error('nothing was ever refused — the probe is not asking');
    }
  );

  // The probe must have left the books alone.
  const after = await call('GET', '/api/journal-entries', { token: tokens.admin });
  check('the sweep changed nothing (it only ever read)', () => {
    if (beforeCount === null) throw new Error('could not count journal entries beforehand');
    const afterCount = Array.isArray(after.body) ? after.body.length : null;
    if (afterCount !== beforeCount) {
      throw new Error(`journal entries went from ${beforeCount} to ${afterCount}`);
    }
  });

  // The headline claim, stated plainly rather than inferred from the sweep:
  // from JENESIS Seller, nobody reaches the reports or the ledger — not even
  // an administrator, whose role would allow both anywhere else.
  const SELLER_MUST_NOT_REACH = [
    ['/api/reports/trial-balance', 'trial balance'],
    ['/api/reports/profit-loss', 'profit and loss'],
    ['/api/reports/balance-sheet', 'balance sheet'],
    ['/api/reports/ar-aging', 'receivables ageing'],
    ['/api/reports/ap-aging', 'payables ageing'],
    ['/api/journal-entries', 'journal entries'],
    ['/api/accounts', 'chart of accounts']
  ];
  for (const role of ROLES) {
    const leaked = [];
    for (const [url, label] of SELLER_MUST_NOT_REACH) {
      const res = await call('GET', url, { token: tokens[role], app: 'seller' });
      if (res.status !== 403) leaked.push(`${label} (${res.status})`);
    }
    check(`the ${role} role cannot reach reports or the ledger from JENESIS Seller`, () => {
      if (leaked.length) throw new Error(`reached: ${leaked.join(', ')}`);
    });
  }

  // And the same for Network & Maintenance, which must not be a second
  // accounting program: customers, suppliers, products and stock are all
  // outside what it does.
  const MAINTENANCE_MUST_NOT_REACH = [
    ['/api/customers', 'customers'],
    ['/api/suppliers', 'suppliers'],
    ['/api/products', 'products'],
    ['/api/sales/invoices', 'sales invoices'],
    ['/api/purchases/bills', 'supplier bills'],
    ['/api/reports/trial-balance', 'trial balance']
  ];
  for (const role of ROLES) {
    const leaked = [];
    for (const [url, label] of MAINTENANCE_MUST_NOT_REACH) {
      const res = await call('GET', url, { token: tokens[role], app: 'maintenance' });
      if (res.status !== 403) leaked.push(`${label} (${res.status})`);
    }
    check(`the ${role} role cannot reach business records from Network & Maintenance`, () => {
      if (leaked.length) throw new Error(`reached: ${leaked.join(', ')}`);
    });
  }

  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
