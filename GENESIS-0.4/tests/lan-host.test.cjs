'use strict';
// TLS-only browser client and host opt-in, against an isolated single database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jenesis-lan-'));
process.env.GENESIS_DB_PATH = path.join(dir, 'genesis.db');
const { startServer } = require('../server/index');
const { lanHost, isPrivateLan, isLoopback } = require('../server/lan-host');
let server, base, token;
async function local(method, endpoint, body) {
  const res = await fetch(`${base}/api${endpoint}`, { method, headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'content-type': 'application/json' } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, data: await res.json() };
}
async function remote(port, method, endpoint, body, session = token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: '127.0.0.1', port, path: `/api${endpoint}`, method,
      rejectUnauthorized: false, agent: false,
      headers: { ...(session ? { authorization: `Bearer ${session}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}) } }, (res) => {
      const fingerprint = new crypto.X509Certificate(res.socket.getPeerCertificate(true).raw).fingerprint256;
      let data = '';
      res.on('data', (part) => { data += part; });
      res.on('end', () => resolve({ status: res.statusCode, fingerprint, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}
async function main() {
  const realAddresses = lanHost.addressProvider;
  // The sandbox itself has no RFC1918 interface. Inject a private interface
  // only for this test; production discovers real interfaces from the OS.
  lanHost.addressProvider = () => ['192.168.53.4'];
  try {
    assert(isPrivateLan('192.168.53.4'));
    assert(!isPrivateLan('8.8.8.8'));
    assert(!isPrivateLan('169.254.0.2'));
    assert(isLoopback('::ffff:127.0.0.1'));
    server = await startServer({ host: '127.0.0.1', port: 0, lanPort: 0 });
    base = `http://127.0.0.1:${server.port}`;
    assert.equal((await local('GET', '/network/hosting')).status, 401);
    const setup = await local('POST', '/setup/initialize', {
      company_name: 'LAN test company', country_code: 'CM', currency_code: 'XAF',
      username: 'host', full_name: 'Host', password: 'Strong-LAN-2026', confirm_password: 'Strong-LAN-2026'
    });
    assert.equal(setup.status, 200, JSON.stringify(setup.data));
    const login = await local('POST', '/auth/login', { username: 'host', password: 'Strong-LAN-2026', mode: 'network' });
    assert.equal(login.status, 200);
    token = login.data.token;
    assert.equal((await local('GET', '/network/hosting')).data.enabled, false);
    lanHost.addressProvider = () => [];
    const noInterface = await local('POST', '/network/hosting', { enabled: true });
    assert.equal(noInterface.status, 409);
    assert.equal(noInterface.data.code, 'LAN_NO_PRIVATE_INTERFACE');
    assert.equal(fs.existsSync(path.join(dir, 'lan-host.json')), false, 'a failed enable cannot persist a config');
    lanHost.addressProvider = () => ['192.168.53.4'];
    const enabled = await local('POST', '/network/hosting', { enabled: true });
    assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
    const host = enabled.data;
    assert(host.enabled && host.configured);
    assert.equal(host.addresses.length, 1);
    assert.match(host.addresses[0], /^https:\/\/192\.168\.53\.4:\d+$/);
    assert.match(host.fingerprintSha256, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    const port = Number(new URL(host.addresses[0]).port);
    const health = await remote(port, 'GET', '/health', null, null);
    assert.equal(health.status, 200);
    assert.equal(health.data.appId, 'jenesis-accounting');
    assert.equal(health.fingerprint, host.fingerprintSha256);
    const remoteSetupStatus = await remote(port, 'GET', '/setup/status', null, null);
    assert.equal(remoteSetupStatus.status, 200, 'remote UI must be able to reach its login screen');
    assert.equal(remoteSetupStatus.data.needsSetup, false);
    assert.equal((await remote(port, 'POST', '/setup/initialize', {
      company_name: 'Forbidden', username: 'visitor', password: 'No-remote-setup-2026'
    }, null)).data.code, 'LAN_SETUP_LOCAL_ONLY');
    const remoteLogin = await remote(port, 'POST', '/auth/login', {
      username: 'host', password: 'Strong-LAN-2026', mode: 'seller'
    }, null);
    assert.equal(remoteLogin.status, 200, 'browser clients must authenticate on the shared host');
    assert.equal((await remote(port, 'GET', '/auth/me', null, remoteLogin.data.token)).data.mode, 'seller');
    assert.equal((await remote(port, 'POST', '/network/hosting', { enabled: false })).data.code, 'LAN_HOST_ONLY');
    const remoteHealth = await remote(port, 'GET', '/network/health');
    assert.equal(remoteHealth.data.database, 'ok');
    const seller = await local('POST', '/auth/login', { username: 'host', password: 'Strong-LAN-2026', mode: 'seller' });
    assert.equal(seller.status, 200);
    assert.equal((await remote(port, 'GET', '/network/health', null, seller.data.token)).status, 403);
    token = seller.data.token;
    assert.equal((await local('POST', '/network/hosting', { enabled: false })).status, 403,
      'seller mode cannot reconfigure the LAN even on the host');
    token = login.data.token;
    assert.equal((await remote(port, 'GET', '/network/hosting', null, null)).status, 401);
    const keyPath = path.join(dir, 'lan-identity', 'server-key.pem');
    assert(fs.existsSync(keyPath));
    assert.equal(fs.readFileSync(path.join(dir, 'lan-host.json'), 'utf8'), '{"enabled":true}');
    await server.close();
    server = await startServer({ host: '127.0.0.1', port: 0, lanPort: 0 });
    base = `http://127.0.0.1:${server.port}`;
    const resumed = (await local('GET', '/network/hosting')).data;
    assert.equal(resumed.enabled, true);
    assert.equal(resumed.fingerprintSha256, host.fingerprintSha256, 'identity must not silently rotate after restart');
    lanHost.addressProvider = () => ['192.168.53.5'];
    const changed = (await local('GET', '/network/hosting')).data;
    assert.equal(changed.errorCode, 'LAN_ADDRESS_CHANGED');
    assert.deepEqual(changed.addresses, [], 'never advertise a client URL not covered by the certificate');
    const changedOff = await local('POST', '/network/hosting', { enabled: false });
    assert.equal(changedOff.status, 200);
    const refused = await local('POST', '/network/hosting', { enabled: true });
    assert.equal(refused.status, 409);
    assert.equal(refused.data.code, 'LAN_ADDRESS_CHANGED', 'do not silently regenerate an identity after DHCP changes');
    lanHost.addressProvider = () => ['192.168.53.4'];
    const again = await local('POST', '/network/hosting', { enabled: true });
    assert.equal(again.data.fingerprintSha256, host.fingerprintSha256);
    const disabled = await local('POST', '/network/hosting', { enabled: false });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.data.enabled, false);
    assert.equal((await local('GET', '/network/hosting')).data.configured, false);
    assert(fs.existsSync(keyPath), 'disabling must retain the identity for future clients');
    assert.equal(fs.readdirSync(dir).filter((file) => file.endsWith('.db')).length, 1,
      'one host database, never a copied client ledger');
    console.log('  ✓ HTTPS opt-in, host-only setup/config, shared backend, mode restrictions, restart and disable');
    console.log('--- LAN HOST SECURITY CHECKS PASSED ---');
  } finally {
    if (server) await server.close();
    lanHost.addressProvider = realAddresses;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
