#!/usr/bin/env node
'use strict';
/**
 * Live checks against a RUNNING preview - a real HTTP conversation with the
 * real server over the real database. Nothing here is mocked.
 *
 *   node scripts/livecheck.cjs [origin] [password]
 *
 * Two traps this script has already fallen into, and now refuses:
 *   * A comparison of two EMPTY lists proves nothing, so a check that read no
 *     data FAILS instead of passing.
 *   * A login the server refused (HTTP 429) is not a token, and is not used as
 *     if it were.
 */
const BASE = process.argv[2] || process.env.GENESIS_PREVIEW_ORIGIN || 'http://127.0.0.1:3000';
const PASSWORD = process.argv[3] || 'Jenesis-2026';

let pass = 0;
let fail = 0;
const results = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1; else fail += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* not JSON */ }
  return { status: res.status, json };
}

(async () => {
  console.log(`live checks against ${BASE}\n`);

  // 1. The interface is complete enough to load.
  const index = await fetch(BASE + '/');
  const html = await index.text();
  check('the interface is served', index.status === 200, `HTTP ${index.status}`);
  const srcs = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const missing = [];
  for (const s of srcs) {
    if ((await fetch(BASE + s)).status !== 200) missing.push(s);
  }
  check('every script and stylesheet the page asks for is present',
    srcs.length > 0 && missing.length === 0,
    `${srcs.length} assets, ${missing.length} missing${missing.length ? ': ' + missing.join(', ') : ''}`);

  // 2. Unauthenticated requests are refused.
  check('unauthenticated API requests are refused', (await api('/api/me')).status === 401, 'HTTP 401 expected');

  // 3. A wrong password is refused.
  const bad = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'not-the-password' } });
  check('a wrong password is refused', bad.status === 401 || bad.status === 429, `HTTP ${bad.status}`);

  // 4. Every seeded user signs in and is reported with the right role.
  const roles = {
    admin: 'admin', accountant: 'accountant', sales: 'sales',
    purchases: 'purchases', inventory: 'inventory', manager: 'manager'
  };
  const tokens = {};
  for (const [username, role] of Object.entries(roles)) {
    const r = await api('/api/auth/login', { method: 'POST', body: { username, password: PASSWORD } });
    if (r.status === 429) {
      check(`${username} signs in`, false, 'the login rate limiter refused (HTTP 429) — restart the server and re-run');
      continue;
    }
    const token = r.json && r.json.token;
    const ok = r.status === 200 && !!token;
    let gotRole = null;
    if (ok) {
      tokens[username] = token;
      const who = await api('/api/auth/me', { token });
      gotRole = who.json && who.json.user && who.json.user.role;
    }
    check(`${username} signs in and is reported as ${role}`, ok && gotRole === role, ok ? `role=${gotRole}` : `HTTP ${r.status}`);
  }

  // 5. The four applications each serve their own entry.
  for (const app of ['seller', 'admin', 'maintenance', 'settings']) {
    const r = await fetch(`${BASE}/?app=${app}`);
    const body = await r.text();
    check(`the ?app=${app} entry is served`, r.status === 200 && body.length > 500, `HTTP ${r.status}, ${body.length} bytes`);
  }

  // 6. Seller is refused the restricted accounting functions. MOD 2 asks for
  //    the API to refuse, not merely for the menus to be hidden.
  const restricted = [
    ['/api/reports/dashboard', 'the admin accounting dashboard'],
    ['/api/reports/profit-loss', 'profit and loss'],
    ['/api/reports/balance-sheet', 'the balance sheet'],
    ['/api/reports/trial-balance', 'the trial balance'],
    ['/api/reports/general-ledger?accountId=acc-1010', 'the general ledger'],
    ['/api/auth/users', 'user management']
  ];
  const sellerToken = tokens.sales;
  const adminToken = tokens.admin;
  const leaked = [];
  for (const [path, label] of restricted) {
    const r = await api(path, { token: sellerToken });
    if (!(r.status === 403 || r.status === 401)) leaked.push(`${label} -> HTTP ${r.status}`);
  }
  check('Seller is refused every restricted admin function',
    !!sellerToken && leaked.length === 0,
    `${restricted.length - leaked.length}/${restricted.length} refused${leaked.length ? '; leaked: ' + leaked.join(', ') : ''}`);

  // 7. ...and the same endpoints are open to an administrator.
  let openToAdmin = 0;
  for (const [path] of restricted) {
    if ((await api(path, { token: adminToken })).status === 200) openToAdmin += 1;
  }
  check('the same functions are open to an administrator',
    !!adminToken && openToAdmin === restricted.length, `${openToAdmin}/${restricted.length} allowed`);

  // 8. Seller can still reach what its own dashboard needs.
  const sellerOwn = ['/api/products', '/api/customers', '/api/sales/invoices', '/api/inventory/stock-levels'];
  const blocked = [];
  for (const path of sellerOwn) {
    const r = await api(path, { token: sellerToken });
    if (r.status !== 200) blocked.push(`${path} -> HTTP ${r.status}`);
  }
  check('Seller can reach what its own dashboard needs',
    !!sellerToken && blocked.length === 0,
    `${sellerOwn.length - blocked.length}/${sellerOwn.length} allowed${blocked.length ? '; blocked: ' + blocked.join(', ') : ''}`);

  // 9-11. The tax safeguards of MOD 3C. /api/taxes lists active rates by
  //       default, so ask for all of them: a rate this script deactivates on
  //       one run is inactive on the next.
  const taxes = await api('/api/taxes?status=all', { token: adminToken });
  let usedRate = null;
  for (const t of Array.isArray(taxes.json) ? taxes.json : []) {
    const usage = await api(`/api/taxes/${t.id}/usage`, { token: adminToken });
    const n = usage.json && usage.json.total;
    if (typeof n === 'number' && n > 0) { usedRate = { ...t, used: n }; break; }
  }

  if (!usedRate) {
    for (const name of [
      'a tax rate used by transactions cannot be deleted',
      'deactivating a tax rate does not alter historical invoices',
      'a deactivated rate is no longer offered, yet history keeps it'
    ]) check(name, false, 'no used tax rate found to test with');
  } else {
    // 9. Used -> cannot be deleted.
    const del = await api(`/api/taxes/${usedRate.id}`, { method: 'DELETE', token: adminToken });
    check('a tax rate used by transactions cannot be deleted',
      del.status === 400 || del.status === 409 || del.status === 403,
      `${usedRate.name} used ${usedRate.used}x -> HTTP ${del.status}`);

    // 10. Deactivation leaves history alone. Back to active first, so this run
    //     behaves the same whether or not an earlier one deactivated it.
    if (!usedRate.active) await api(`/api/taxes/${usedRate.id}/reactivate`, { method: 'POST', token: adminToken });
    const beforeList = (await api('/api/sales/invoices', { token: adminToken })).json || [];
    const before = JSON.stringify(beforeList);
    const deact = await api(`/api/taxes/${usedRate.id}/deactivate`, { method: 'POST', token: adminToken });
    const afterList = (await api('/api/sales/invoices', { token: adminToken })).json || [];
    const after = JSON.stringify(afterList);
    check('deactivating a tax rate does not alter historical invoices',
      deact.status === 200 && beforeList.length > 0 && before === after,
      `deactivate HTTP ${deact.status}, ${beforeList.length} invoices ${before === after ? 'unchanged' : 'CHANGED'}`);

    // 10b. Inactive rates are not offered for new work, and the rate a stored
    //      invoice was raised at is untouched. It lives on the invoice LINES,
    //      with the percentage snapshotted beside it - so read the detail.
    const offeredIds = ((await api('/api/taxes', { token: adminToken })).json || []).map((t) => t.id);
    const gone = !offeredIds.includes(usedRate.id);
    let carrying = 0;
    let rateKept = 0;
    for (const inv of Array.isArray(afterList) ? afterList : []) {
      const detail = await api(`/api/sales/invoices/${inv.id}`, { token: adminToken });
      for (const line of (detail.json && (detail.json.lines || detail.json.items)) || []) {
        if (line.tax_rate_id === usedRate.id) {
          carrying += 1;
          if (Number(line.tax_rate) === Number(usedRate.rate)) rateKept += 1;
        }
      }
    }
    check('a deactivated rate is no longer offered, yet history keeps it',
      deact.status === 200 && gone && carrying > 0 && carrying === rateKept,
      `offered for new work: ${gone ? 'no' : 'YES'}; kept on ${carrying} historical lines, ${rateKept} at the original ${usedRate.rate}%`);

    // Put it back so the next run starts from the same place.
    await api(`/api/taxes/${usedRate.id}/reactivate`, { method: 'POST', token: adminToken });
  }

  // 11. The tax change is recorded in the audit trail.
  const audit = await api('/api/audit-trail', { token: adminToken });
  // Array.prototype.entries is a built-in method, so `json.entries` is truthy
  // on an array - check for the array itself before looking for a property.
  const entries = Array.isArray(audit.json) ? audit.json : (audit.json && (audit.json.entries || audit.json.rows)) || [];
  const hasTaxEntry = entries.some((e) => JSON.stringify(e).toLowerCase().includes('tax'));
  check('tax changes are recorded in the audit trail',
    audit.status === 200 && hasTaxEntry, `HTTP ${audit.status}, ${entries.length} entries`);

  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('the live check itself failed:', e.message);
  process.exit(2);
});
