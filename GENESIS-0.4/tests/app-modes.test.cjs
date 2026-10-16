'use strict';
// Exercise the three independently launchable modes with a disposable DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jenesis-modes-'));
process.env.GENESIS_DB_PATH = path.join(dir, 'jenesis.db');
const { startServer } = require('../server/index');
const { getDb } = require('../server/db');
let server, base;
async function api(method, pathName, token, body) {
  const res = await fetch(`${base}/api${pathName}`, { method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, data: await res.json() };
}
async function login(username, password, mode) {
  const r = await api('POST', '/auth/login', null, { username, password, mode });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}
async function main() {
  const password = 'Mode-Safety-Password-2026';
  try {
    server = await startServer({ host: '127.0.0.1', port: 0 });
    base = `http://127.0.0.1:${server.port}`;
    assert.equal((await api('POST', '/setup/initialize', null, { company_name: 'Local Company',
      country_code: 'CM', currency_code: 'USD', username: 'main.admin', full_name: 'Main Admin',
      password, confirm_password: password })).status, 200);
    const admin = await login('main.admin', password, 'administrator');
    const seller = await login('main.admin', password, 'seller');
    const network = await login('main.admin', password, 'network');
    for (const [token, mode] of [[admin, 'administrator'], [seller, 'seller'], [network, 'network']]) {
      const me = await api('GET', '/auth/me', token);
      assert.equal(me.status, 200);
      assert.equal(me.data.mode, mode);
      assert.equal(me.data.user.role, 'admin');
    }
    console.log('  ✓ three independent sessions bind an administrator to their entry-point permissions');
    const prod = await api('POST', '/products', admin, { sku: 'TEST-001', name: 'Test Item',
      cost_price: 45, selling_price: 70 });
    assert.equal(prod.status, 200, JSON.stringify(prod.data));
    const sellerProducts = await api('GET', '/products', seller);
    assert.equal(sellerProducts.status, 200);
    assert.equal(sellerProducts.data[0].selling_price, 70);
    assert.equal('cost_price' in sellerProducts.data[0], false, 'seller cannot receive inventory costs');
    assert.equal((await api('GET', '/suppliers', seller)).status, 403);
    assert.equal((await api('GET', '/reports/dashboard', seller)).status, 403);
    assert.equal((await api('GET', '/inventory/valuation', seller)).status, 403);
    assert.equal((await api('GET', '/seller/overview', seller)).status, 200);
    assert.equal((await api('GET', '/taxes', seller)).status, 200);
    console.log('  ✓ seller sees sales data but not costs, suppliers, valuations or financial reports');
    assert.equal((await api('GET', '/network/health', admin)).status, 403);
    assert.equal((await api('GET', '/network/health', network)).status, 200);
    assert.equal((await api('GET', '/products', network)).status, 403);
    const exported = await api('GET', '/backup/export', network);
    assert.equal(exported.status, 200, 'admin may export in maintenance app');
    assert.equal(exported.data.jenesisVersion, require('../package.json').version);
    assert.equal(exported.data.genesisVersion, undefined, 'new exports carry the JENESIS identity');
    const copy = await api('POST', '/network/snapshot', network);
    assert.equal(copy.status, 200, JSON.stringify(copy.data));
    const snapshot = path.join(dir, 'backups', copy.data.name);
    assert.ok(fs.existsSync(snapshot));
    const check = new Database(snapshot, { readonly: true });
    try { assert.equal(check.pragma('integrity_check', { simple: true }), 'ok'); }
    finally { check.close(); }
    console.log('  ✓ network app offers verified host snapshot without granting business reads');
    const createNetworkUser = await api('POST', '/auth/users', admin, {
      username: 'maintenance', full_name: 'Network Staff', password: 'Network-Initial-2026', role: 'network'
    });
    assert.equal(createNetworkUser.status, 200, JSON.stringify(createNetworkUser.data));
    const initial = await login('maintenance', 'Network-Initial-2026', 'network');
    assert.equal((await api('POST', '/auth/change-password', initial, {
      current_password: 'Network-Initial-2026', new_password: 'Network-Changed-2026'
    })).status, 200);
    assert.equal((await api('GET', '/network/health', initial)).status, 200);
    assert.equal((await api('GET', '/products', initial)).status, 403);
    assert.equal((await api('GET', '/backup/export', initial)).status, 403);
    assert.equal((await api('POST', '/network/snapshot', initial)).status, 200);
    assert.equal((await api('POST', '/auth/login', null, { username: 'maintenance',
      password: 'Network-Changed-2026', mode: 'administrator' })).status, 403);
    console.log('  ✓ dedicated network role has no business or backup-download access');
    const loginSales = await api('POST', '/auth/login', null, { username: 'main.admin', password, mode: 'nonsense' });
    assert.equal(loginSales.status, 400);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM products').get().n, 1);
    console.log('--- APP MODE ISOLATION PASSED ---');
  } finally {
    if (server) await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
