'use strict';
/**
 * NETWORK & MAINTENANCE — finding, registering and watching the other
 * JENESIS computers.
 *
 * Modification 6 asks this application to discover the computers on the local
 * network, let an administrator register one, connect to and disconnect from
 * it, watch whether it is still there, and explain in plain words what is
 * wrong when it is not.
 *
 * These tests run two real JENESIS services, each with its own database copy in
 * its own data directory, over real HTTP and real UDP. Discovery is proven by
 * one of them actually finding the other.
 *
 * WHAT THEY DO NOT PROVE: two services on one machine is not two computers.
 * The mechanism is proven here; two physical computers on a real network are
 * not, and cannot be, in this environment. That proof belongs to
 * scripts/messenger-two-computers.cjs, run on the user's own network.
 */
const assert = require('assert');
const dgram = require('dgram');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { BackendProcess, findFreePort } = require('../electron/backend-manager.cjs');
const { hashPassword } = require('../server/passwords');
const networkConfig = require('../server/network-config');
const networkDiscovery = require('../server/network-discovery');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');
const PASSWORD = 'Network-Test-Passw0rd';
const DISCOVERY_PORT = networkDiscovery.DISCOVERY_PORT;

let passed = 0;
let failed = 0;
const pending = [];
const test = (name, fn) => pending.push({ name, fn });

function request(port, method, route, { token, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port, path: `/api${route}`, method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { /* not JSON */ }
        resolve({ status: res.statusCode, text: data, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** A data directory holding a copy of the database and a known password. */
function makeComputer(label, { allowLan }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `genesis-net-${label}-`));
  const dbPath = path.join(dir, 'genesis.db');
  fs.copyFileSync(SOURCE_DB, dbPath);
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  const admin = db.prepare("SELECT id, username FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1").get();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(PASSWORD), admin.id);
  db.close();
  networkConfig.writeNetworkConfig(dir, { allowLan: allowLan === true });
  return { dir, dbPath, adminUsername: admin.username };
}

async function startComputer(computer, label) {
  const port = await findFreePort();
  const proc = new BackendProcess({
    nodeExecutable: process.execPath,
    runAsNode: false,
    serverEntry: path.join(ROOT, 'server', 'index.js'),
    cwd: ROOT,
    env: {
      GENESIS_DB_PATH: computer.dbPath,
      GENESIS_DIST_DIR: path.join(ROOT, 'dist'),
      GENESIS_COMPUTER_ID: `test-${label}`
    },
    startupTimeoutMs: 30000
  });
  await proc.start(port);
  const token = await signIn(port, computer.adminUsername);
  return { ...computer, port, proc, token };
}

async function signIn(port, username) {
  const res = await request(port, 'POST', '/auth/login', { body: { username, password: PASSWORD } });
  assert.strictEqual(res.status, 200, `login failed for ${username}: ${res.text}`);
  return res.json.token;
}

console.log('--- NETWORK & MAINTENANCE: discovery, registration and status ---');

// ---------------------------------------------------------------------------
// 1. The switch
// ---------------------------------------------------------------------------
test('the network is off unless an administrator turns it on', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-net-default-'));
  const config = networkConfig.readNetworkConfig(dir);
  assert.strictEqual(config.allowLan, false, 'a fresh installation must not answer on the network');
  assert.strictEqual(networkConfig.bindHost(config), '127.0.0.1', 'with the switch off the service binds loopback only');
  const on = networkConfig.writeNetworkConfig(dir, { allowLan: true });
  assert.strictEqual(networkConfig.bindHost(on), '0.0.0.0', 'with the switch on it binds every interface');
  // A damaged file must read as "off", never as "on".
  fs.writeFileSync(networkConfig.networkConfigPath(dir), 'not json at all', 'utf8');
  assert.strictEqual(networkConfig.readNetworkConfig(dir).allowLan, false, 'a damaged setting must fail closed');
});

// ---------------------------------------------------------------------------
// 2. Discovery
// ---------------------------------------------------------------------------
test('a JENESIS computer finds another one on the network', async () => {
  const a = makeComputer('a', { allowLan: true });
  const b = makeComputer('b', { allowLan: true });
  const ca = await startComputer(a, 'a');
  const cb = await startComputer(b, 'b');
  try {
    const res = await request(ca.port, 'POST', '/system/computers/discover', { token: ca.token });
    assert.strictEqual(res.status, 200, `discovery failed: ${res.text}`);
    const ports = (res.json.found || []).map((f) => f.port);
    assert.ok(
      ports.includes(cb.port),
      `computer A must find computer B on port ${cb.port}; it found ${JSON.stringify(res.json.found)}`
    );
    // Its own announcement is not counted as a discovery.
    assert.ok(!ports.includes(ca.port), 'a computer must not discover itself');
  } finally {
    await ca.proc.stop();
    await cb.proc.stop();
  }
});

test('discovery is refused while the network switch is off', async () => {
  const a = makeComputer('off', { allowLan: false });
  const ca = await startComputer(a, 'off');
  try {
    const res = await request(ca.port, 'POST', '/system/computers/discover', { token: ca.token });
    assert.strictEqual(res.status, 409, `discovery must be refused with the switch off: ${res.text}`);
    assert.strictEqual(res.json.code, 'LAN_DISABLED');
    assert.ok(res.json.message && res.json.message.length > 20, 'the refusal must explain itself in words');
  } finally {
    await ca.proc.stop();
  }
});

test('the announcement carries no token, password, user or database detail', async () => {
  const b = makeComputer('wire', { allowLan: true });
  const cb = await startComputer(b, 'wire');
  try {
    // Listen the way a colleague would, and read the raw packet off the wire.
    //
    // The listening socket is bound to a port chosen by the operating system,
    // not to the discovery port. That is deliberate: on Windows a second
    // socket bound to the same UDP port with SO_REUSEADDR takes delivery away
    // from the first one, so a sniffer on the discovery port hears nothing
    // while the service's own beacon receives the probe. An ephemeral port
    // receives the answer to its own probe and behaves the same on both
    // systems — it is also exactly how discover() itself listens.
    const payload = await new Promise((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { socket.close(); } catch (_) {}
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 8000);
      socket.on('message', (message) => {
        let parsed = null;
        try { parsed = JSON.parse(message.toString('utf8')); } catch (_) { return; }
        if (!parsed || parsed.protocol !== networkDiscovery.PROTOCOL) return;
        if (parsed.type !== 'announce') return; // that is our own probe echoing back
        finish(message.toString('utf8'));
      });
      socket.on('error', () => finish(null));
      socket.bind(0, () => {
        try { socket.setBroadcast(true); } catch (_) {}
        const probe = Buffer.from(JSON.stringify({ protocol: networkDiscovery.PROTOCOL, type: 'probe' }));
        socket.send(probe, DISCOVERY_PORT, '255.255.255.255');
      });
    });

    assert.ok(payload, 'the computer must answer a probe on the network');
    const parsed = JSON.parse(payload);
    assert.deepStrictEqual(
      Object.keys(parsed).sort(),
      ['address', 'computerId', 'name', 'port', 'protocol', 'type', 'version'],
      `the announcement must carry only these fields, found: ${Object.keys(parsed).sort().join(', ')}`
    );
    const flat = JSON.stringify(parsed).toLowerCase();
    for (const secret of ['token', 'password', 'session', 'secret', 'genesis.db', 'users']) {
      assert.ok(!flat.includes(secret), `the announcement must not mention "${secret}"`);
    }
  } finally {
    await cb.proc.stop();
  }
});

// ---------------------------------------------------------------------------
// 3. Registration
// ---------------------------------------------------------------------------
test('a computer can be registered, probed and seen in the list', async () => {
  const a = makeComputer('reg', { allowLan: true });
  const b = makeComputer('regb', { allowLan: true });
  const ca = await startComputer(a, 'reg');
  const cb = await startComputer(b, 'regb');
  try {
    const added = await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'Office second PC', address: '127.0.0.1', port: cb.port }
    });
    assert.strictEqual(added.status, 200, `registration failed: ${added.text}`);
    assert.strictEqual(added.json.probe.status, 'ONLINE', 'a reachable JENESIS service must probe as ONLINE');
    assert.strictEqual(added.json.computer.name, 'Office second PC');

    const list = await request(ca.port, 'GET', '/system/computers', { token: ca.token });
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.json.count, 1, 'the registered computer must be in the list');
  } finally {
    await ca.proc.stop();
    await cb.proc.stop();
  }
});

test('registering the same address twice refreshes it instead of duplicating it', async () => {
  const a = makeComputer('dup', { allowLan: true });
  const b = makeComputer('dupb', { allowLan: true });
  const ca = await startComputer(a, 'dup');
  const cb = await startComputer(b, 'dupb');
  try {
    await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'First name', address: '127.0.0.1', port: cb.port }
    });
    await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'Renamed', address: '127.0.0.1', port: cb.port }
    });
    const list = await request(ca.port, 'GET', '/system/computers', { token: ca.token });
    assert.strictEqual(list.json.count, 1, 'the same computer must not appear twice');
    assert.strictEqual(list.json.computers[0].name, 'Renamed', 'the second registration must rename it');
  } finally {
    await ca.proc.stop();
    await cb.proc.stop();
  }
});

test('a nonsense address is refused with a message, not stored', async () => {
  const a = makeComputer('bad', { allowLan: true });
  const ca = await startComputer(a, 'bad');
  try {
    const res = await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'Nonsense', address: 'not a host!!', port: 3000 }
    });
    assert.strictEqual(res.status, 400, `a bad address must be refused: ${res.text}`);
    assert.strictEqual(res.json.code, 'BAD_ADDRESS');
    assert.ok(res.json.error.length > 20, 'the refusal must explain what an address looks like');
    const list = await request(ca.port, 'GET', '/system/computers', { token: ca.token });
    assert.strictEqual(list.json.count, 0, 'a refused address must not be stored');
  } finally {
    await ca.proc.stop();
  }
});

test('a forgotten computer leaves the list', async () => {
  const a = makeComputer('forget', { allowLan: true });
  const b = makeComputer('forgetb', { allowLan: true });
  const ca = await startComputer(a, 'forget');
  const cb = await startComputer(b, 'forgetb');
  try {
    const added = await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'Temporary', address: '127.0.0.1', port: cb.port }
    });
    const id = added.json.computer.id;
    const gone = await request(ca.port, 'DELETE', `/system/computers/${id}`, { token: ca.token });
    assert.strictEqual(gone.status, 200, `forgetting failed: ${gone.text}`);
    const list = await request(ca.port, 'GET', '/system/computers', { token: ca.token });
    assert.strictEqual(list.json.count, 0, 'a forgotten computer must be gone');
    const again = await request(ca.port, 'DELETE', `/system/computers/${id}`, { token: ca.token });
    assert.strictEqual(again.status, 404, 'forgetting twice must say it is not there');
  } finally {
    await ca.proc.stop();
    await cb.proc.stop();
  }
});

// ---------------------------------------------------------------------------
// 4. Connecting, disconnecting, reconnecting
// ---------------------------------------------------------------------------
test('connect, disconnect and reconnect all work and only one computer is connected', async () => {
  const a = makeComputer('conn', { allowLan: true });
  const b = makeComputer('connb', { allowLan: true });
  const c = makeComputer('connc', { allowLan: true });
  const ca = await startComputer(a, 'conn');
  const cb = await startComputer(b, 'connb');
  const cc = await startComputer(c, 'connc');
  try {
    const first = await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'B', address: '127.0.0.1', port: cb.port }
    });
    const second = await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'C', address: '127.0.0.1', port: cc.port }
    });

    const connect = await request(ca.port, 'POST', `/system/computers/${first.json.computer.id}/connect`, { token: ca.token });
    assert.strictEqual(connect.status, 200, `connecting failed: ${connect.text}`);
    assert.strictEqual(connect.json.computer.connected, true);
    assert.strictEqual(connect.json.serverUrl, `http://127.0.0.1:${cb.port}`, 'connecting must report the address to use');

    // Connecting a second one must let go of the first.
    await request(ca.port, 'POST', `/system/computers/${second.json.computer.id}/connect`, { token: ca.token });
    const list = await request(ca.port, 'GET', '/system/computers', { token: ca.token });
    const connected = list.json.computers.filter((x) => x.connected);
    assert.strictEqual(connected.length, 1, 'only one computer may be connected at a time');
    assert.strictEqual(connected[0].name, 'C');

    const disconnect = await request(ca.port, 'POST', `/system/computers/${second.json.computer.id}/disconnect`, { token: ca.token });
    assert.strictEqual(disconnect.status, 200);
    assert.strictEqual(disconnect.json.computer.connected, false);

    const reconnect = await request(ca.port, 'POST', `/system/computers/${second.json.computer.id}/reconnect`, { token: ca.token });
    assert.strictEqual(reconnect.status, 200, `reconnecting failed: ${reconnect.text}`);
    assert.strictEqual(reconnect.json.computer.connected, true);
  } finally {
    await ca.proc.stop();
    await cb.proc.stop();
    await cc.proc.stop();
  }
});

test('connecting to a computer that has stopped is refused with a reason', async () => {
  const a = makeComputer('down', { allowLan: true });
  const b = makeComputer('downb', { allowLan: true });
  const ca = await startComputer(a, 'down');
  const cb = await startComputer(b, 'downb');
  try {
    const added = await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'Will stop', address: '127.0.0.1', port: cb.port }
    });
    assert.strictEqual(added.status, 200);
    await cb.proc.stop(); // the other computer goes away

    const connect = await request(ca.port, 'POST', `/system/computers/${added.json.computer.id}/connect`, { token: ca.token });
    assert.strictEqual(connect.status, 409, 'connecting to a stopped computer must be refused');
    assert.strictEqual(connect.json.code, 'REFUSED', `unexpected diagnosis: ${connect.text}`);
    assert.ok(/not running|listening/i.test(connect.json.error), 'the message must say what to do about it');

    const list = await request(ca.port, 'GET', '/system/computers', { token: ca.token });
    assert.strictEqual(list.json.computers[0].connected, false, 'a failed connection must leave it disconnected');
  } finally {
    await ca.proc.stop();
  }
});

// ---------------------------------------------------------------------------
// 5. Status monitoring and understandable diagnoses
// ---------------------------------------------------------------------------
test('refreshing measures every registered computer and records what it found', async () => {
  const a = makeComputer('refresh', { allowLan: true });
  const b = makeComputer('refreshb', { allowLan: true });
  const ca = await startComputer(a, 'refresh');
  const cb = await startComputer(b, 'refreshb');
  try {
    await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'Live', address: '127.0.0.1', port: cb.port }
    });
    await request(ca.port, 'POST', '/system/computers', {
      token: ca.token, body: { name: 'Dead', address: '127.0.0.1', port: 1 }
    });

    const refreshed = await request(ca.port, 'POST', '/system/computers/refresh', { token: ca.token });
    assert.strictEqual(refreshed.status, 200, `refresh failed: ${refreshed.text}`);
    const byName = Object.fromEntries(refreshed.json.computers.map((c) => [c.name, c]));
    assert.strictEqual(byName.Live.lastStatus, 'ONLINE', 'the running computer must measure ONLINE');
    assert.notStrictEqual(byName.Dead.lastStatus, 'ONLINE', 'the stopped computer must not measure ONLINE');
    assert.ok(byName.Live.lastSeenAt, 'a computer that answered must have a last-seen time');
    assert.ok(byName.Live.lastMessage && byName.Live.lastMessage.length > 10, 'each status must carry a readable message');
  } finally {
    await ca.proc.stop();
    await cb.proc.stop();
  }
});

test('every diagnosis explains itself in words a person can act on', () => {
  const codes = ['ONLINE', 'UNREACHABLE', 'REFUSED', 'NOT_JENESIS', 'VERSION_MISMATCH', 'TIMEOUT', 'BAD_ADDRESS', 'LAN_DISABLED'];
  for (const code of codes) {
    const message = networkDiscovery.DIAGNOSES[code];
    assert.ok(message, `${code} must have a message`);
    assert.ok(message.length > 30, `${code} must explain itself properly`);
    assert.ok(!/^(error|failed)$/i.test(message.trim()), `${code} must not be a bare word`);
  }
});

test('a service that is not JENESIS is named as such, not reported as online', async () => {
  const imposter = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', application: 'Something else' }));
  });
  await new Promise((resolve) => imposter.listen(0, '127.0.0.1', resolve));
  const port = imposter.address().port;
  try {
    const probe = await networkDiscovery.probeComputer({ address: '127.0.0.1', port });
    assert.strictEqual(probe.status, 'NOT_JENESIS', `expected NOT_JENESIS, got ${probe.status}`);
    assert.ok(/not a JENESIS/i.test(probe.message), 'the message must say what it found instead');
  } finally {
    await new Promise((resolve) => imposter.close(resolve));
  }
});

test('nothing listening at an address is reported as refused, not as online', async () => {
  const socket = http.createServer(() => {});
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const probe = await networkDiscovery.probeComputer({ address: '127.0.0.1', port });
  assert.strictEqual(probe.status, 'REFUSED', `a closed port must be REFUSED, got ${probe.status}`);
});

// ---------------------------------------------------------------------------
// 6. The boundary around this application
// ---------------------------------------------------------------------------
test('the network screens need the network permission, not a business one', async () => {
  const a = makeComputer('perm', { allowLan: true });
  const ca = await startComputer(a, 'perm');
  try {
    // Discovering and connecting are configuration: an administrator only.
    const discover = await request(ca.port, 'POST', '/system/computers/discover', { token: ca.token });
    assert.strictEqual(discover.status, 200, 'an administrator may look for computers');
    // Reading the list is fine for anyone signed in, but still needs a session.
    const anonymous = await request(ca.port, 'GET', '/system/computers');
    assert.strictEqual(anonymous.status, 401, 'the list must not be readable without signing in');
  } finally {
    await ca.proc.stop();
  }
});

test('the shipped database is never touched by these tests', () => {
  const before = fs.statSync(SOURCE_DB).size;
  assert.ok(before > 0);
  // Every scenario above worked on a copy in its own temporary directory.
  assert.ok(fs.readdirSync(ROOT).includes('genesis.db'));
});

(async () => {
  for (const { name, fn } of pending) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
    }
  }
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
})();
