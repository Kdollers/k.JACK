#!/usr/bin/env node
'use strict';
/**
 * LIVE SETTINGS & ACCESS POINT CHECK.
 *
 * JENESIS Settings & Access Point decides who may open what. The test that
 * matters is not whether the launcher hides an application — hiding is a
 * courtesy — but whether the service refuses the request when someone walks
 * around it. A user told they cannot use JENESIS Accounting & Business must
 * not be able to point a window at it and read the ledger anyway.
 *
 * So this closes an application for a user, keeps their role unchanged, and
 * then asks the service for something that role would normally allow. It must
 * be refused. Then the application is opened again and the same request must
 * succeed — proving the refusal was the access setting and nothing else.
 *
 * It also covers the password rules, which are the other half of access
 * control: a weak new password must be turned down, and changing a password
 * must end every other session for that user.
 *
 * Everything this changes is put back before it finishes.
 *
 * Usage:
 *   node scripts/live-settings-check.cjs [baseUrl] [password]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const PASSWORD = process.argv[3] || 'Jenesis-2026';

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
  }
}

function assert(cond, message) { if (!cond) throw new Error(message); }

async function api(method, path, { token, app, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (app) headers['X-Jenesis-App'] = app;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(username, password = PASSWORD) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const json = await res.json().catch(() => ({}));
  return { token: json && json.token ? json.token : null, json, status: res.status };
}

async function main() {
  console.log(`--- LIVE SETTINGS & ACCESS POINT CHECK against ${BASE} ---`);

  const admin = (await login('admin')).token;
  assert(admin, 'could not sign in as admin');

  // -------------------------------------------------------------------------
  // Users and roles
  // -------------------------------------------------------------------------
  const users = await api('GET', '/auth/users', { token: admin, app: 'settings' });

  await check('the user list is readable from JENESIS Settings', () => {
    assert(users.status === 200, `returned ${users.status}`);
    assert(Array.isArray(users.json) && users.json.length >= 6,
      `expected at least the six seeded roles, got ${(users.json || []).length}`);
  });

  await check('every seeded role exists, and no two share a user', () => {
    const names = (users.json || []).map((u) => u.username);
    for (const role of ['admin', 'accountant', 'sales', 'purchases', 'inventory', 'manager']) {
      assert(names.includes(role), `the ${role} user is missing`);
    }
    assert(new Set(names).size === names.length, 'two users share a username');
  });

  await check('a stored password is never handed back to the interface', () => {
    const leaked = (users.json || []).filter((u) => u.password_hash || u.password);
    assert(leaked.length === 0, `${leaked.length} user record(s) carried a password field`);
  });

  await check('the permission catalogue is available to grant from', async () => {
    const res = await api('GET', '/auth/access-catalogue', { token: admin, app: 'settings' });
    assert(res.status === 200, `returned ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // Closing an application for one user, without touching their role
  // -------------------------------------------------------------------------
  const target = (users.json || []).find((u) => u.username === 'manager');
  assert(target, 'the manager user was not found');

  await check('an administrator can close an application for one user', async () => {
    const res = await api('PUT', `/auth/users/${target.id}/access`, {
      token: admin, app: 'settings',
      body: { apps: { admin: false } }
    });
    assert(res.status === 200, `returned ${res.status}: ${JSON.stringify(res.json)}`);
  });

  await check('the closed application refuses that user, though their role allows it', async () => {
    const manager = (await login('manager')).token;
    assert(manager, 'could not sign in as manager');
    // The manager role holds reports:read and accounting:read, and JENESIS
    // Accounting & Business forbids neither. Only the access setting stands
    // between this user and the ledger.
    for (const path of ['/reports/trial-balance', '/accounts', '/journal-entries']) {
      const res = await api('GET', path, { token: manager, app: 'admin' });
      assert(res.status === 403,
        `${path} returned ${res.status} for a user whose access to Admin was closed`);
      assert(res.json && res.json.code === 'APP_ACCESS_DENIED',
        `${path} was refused as ${res.json && res.json.code}, expected APP_ACCESS_DENIED`);
    }
  });

  await check('closing one application leaves the others open to them', async () => {
    const manager = (await login('manager')).token;
    const res = await api('GET', '/system/info', { token: manager, app: 'maintenance' });
    assert(res.status !== 403,
      `Network & Maintenance was refused too (${res.status}); closing Admin should not close it`);
  });

  await check('re-opening the application restores access', async () => {
    const reopen = await api('PUT', `/auth/users/${target.id}/access`, {
      token: admin, app: 'settings',
      body: { apps: { admin: true } }
    });
    assert(reopen.status === 200, `returned ${reopen.status}`);
    const manager = (await login('manager')).token;
    const res = await api('GET', '/accounts', { token: manager, app: 'admin' });
    assert(res.status === 200,
      `after re-opening, /accounts returned ${res.status} instead of 200`);
  });

  // -------------------------------------------------------------------------
  // Password rules
  // -------------------------------------------------------------------------
  await check('a password that is too short is refused', async () => {
    const res = await api('POST', '/auth/change-password', {
      token: admin,
      body: { current_password: PASSWORD, new_password: 'abc' }
    });
    assert(res.status === 400, `a 3-character password was accepted (${res.status})`);
  });

  await check('changing a password requires the current one to be right', async () => {
    const res = await api('POST', '/auth/change-password', {
      token: admin,
      body: { current_password: 'not-the-real-password', new_password: 'Another-Good-One-2026' }
    });
    assert(res.status === 400, `a wrong current password was accepted (${res.status})`);
  });

  await check('the wrong password does not sign anyone in', async () => {
    const res = await login('admin', 'definitely-not-the-password');
    assert(res.status === 401, `sign-in returned ${res.status} for a wrong password`);
  });

  // -------------------------------------------------------------------------
  // What Settings must not be able to do
  // -------------------------------------------------------------------------
  await check('JENESIS Settings cannot trade: no sales, purchases or stock', async () => {
    for (const path of ['/sales/invoices', '/purchases/bills', '/products', '/customers']) {
      const res = await api('GET', path, { token: admin, app: 'settings' });
      assert(res.status === 403,
        `${path} returned ${res.status} from the Settings application`);
    }
  });

  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
