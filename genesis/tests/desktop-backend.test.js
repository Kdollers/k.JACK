'use strict';
/**
 * Desktop backend lifecycle tests.
 * These exercise exactly what the Electron shell relies on, using plain Node.js:
 *   - the backend starts on loopback, reports its identity, and serves the UI,
 *   - data survives a restart, and shutdown is clean,
 *   - an unrelated server on the port is not mistaken for GENESIS,
 *   - database preparation never overwrites existing data.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { BackendProcess, findFreePort, waitForHealth } = require('../electron/backend-manager.cjs');
const { prepareDataDirectory, backupDatabase } = require('../electron/data-location.cjs');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

function tmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `genesis-desktop-${label}-`));
}

function copyDb(dir) {
  const dest = path.join(dir, 'genesis.db');
  fs.copyFileSync(SOURCE_DB, dest);
  return dest;
}

function companyCount(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
  } finally {
    db.close();
  }
}

function startBackend(dbPath, port, extraEnv = {}) {
  const proc = new BackendProcess({
    nodeExecutable: process.execPath,
    runAsNode: false,
    serverEntry: path.join(ROOT, 'server', 'index.js'),
    cwd: ROOT,
    env: { GENESIS_DB_PATH: dbPath, GENESIS_DIST_DIR: path.join(ROOT, 'dist'), ...extraEnv },
    startupTimeoutMs: 20000
  });
  return proc.start(port).then(() => proc);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
test('backend starts on loopback, identifies itself, serves UI and stops cleanly', async () => {
  const dir = tmpDir('start');
  const dbPath = copyDb(dir);
  const port = await findFreePort();
  const proc = await startBackend(dbPath, port);
  try {
    const health = await getJson(`http://127.0.0.1:${port}/api/health`);
    assert.strictEqual(health.status, 200);
    const body = JSON.parse(health.text);
    assert.strictEqual(body.appId, 'genesis-accounting');
    assert.strictEqual(body.status, 'healthy');

    // Unknown API paths are answered only after authentication, so anonymous callers
    // cannot use 404/200 differences to map the API.
    const unknownApi = await getJson(`http://127.0.0.1:${port}/api/does-not-exist`);
    assert.strictEqual(unknownApi.status, 401);
    assert.ok(unknownApi.headers['content-type'].includes('application/json'));

    if (fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
      const page = await getJson(`http://127.0.0.1:${port}/`);
      assert.strictEqual(page.status, 200);
      assert.ok(page.text.includes('<div id="root">') || page.text.includes('<html'), 'UI index.html is served');
    }

    // Shutdown must be graceful (exit code 0, not killed).
    const info = await proc.stop(5000);
    assert.strictEqual(info.code, 0, `expected clean exit, got ${JSON.stringify(info)}`);
  } finally {
    await proc.stop(1000);
  }
});

test('backend binds only to the loopback interface', async () => {
  const dir = tmpDir('bind');
  const dbPath = copyDb(dir);
  const port = await findFreePort();
  const proc = await startBackend(dbPath, port);
  try {
    // Connecting via a non-loopback address of this machine must not be served.
    const nets = os.networkInterfaces();
    const lan = Object.values(nets).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    if (lan) {
      await assert.rejects(
        () => getJson(`http://${lan.address}:${port}/api/health`),
        'backend must not listen on a LAN address'
      );
    }
    const res = await getJson(`http://127.0.0.1:${port}/api/health`);
    assert.strictEqual(res.status, 200);
  } finally {
    await proc.stop(5000);
  }
});

test('data remains available after the backend restarts', async () => {
  const dir = tmpDir('restart');
  const dbPath = copyDb(dir);
  const before = companyCount(SOURCE_DB);

  const port1 = await findFreePort();
  const p1 = await startBackend(dbPath, port1);
  await getJson(`http://127.0.0.1:${port1}/api/health`);
  await p1.stop(5000);

  const port2 = await findFreePort();
  const p2 = await startBackend(dbPath, port2);
  await p2.stop(5000);

  assert.strictEqual(companyCount(dbPath), before, 'company records are preserved across restarts');
});

test('a foreign server on the port is rejected, not attached to', async () => {
  const port = await findFreePort();
  const impostor = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', appId: 'something-else' }));
  });
  await new Promise((r) => impostor.listen(port, '127.0.0.1', r));
  try {
    await assert.rejects(
      () => waitForHealth({ port, timeoutMs: 2000, intervalMs: 100 }),
      /Another service is listening/
    );
  } finally {
    await new Promise((r) => impostor.close(r));
  }
});

test('startup fails with a clear message when the backend cannot start', async () => {
  const port = await findFreePort();
  const proc = new BackendProcess({
    nodeExecutable: process.execPath,
    runAsNode: false,
    serverEntry: path.join(ROOT, 'server', 'does-not-exist.js'),
    cwd: ROOT,
    env: {},
    startupTimeoutMs: 5000
  });
  await assert.rejects(() => proc.start(port), /exited before it became ready/);
});

test('startup times out with a clear message when nothing answers', async () => {
  const port = await findFreePort();
  await assert.rejects(
    () => waitForHealth({ port, timeoutMs: 600, intervalMs: 100 }),
    /did not become ready within/
  );
});

test('an existing database is never overwritten by the bundled seed', () => {
  const userData = tmpDir('userdata');
  const seed = copyDb(tmpDir('seed'));
  const existing = path.join(userData, 'genesis.db');
  fs.writeFileSync(existing, 'USER DATA');

  const result = prepareDataDirectory({ dataDir: userData, seedPath: seed, now: new Date(2026, 0, 1, 10, 0, 0) });
  assert.strictEqual(result.seeded, false);
  assert.strictEqual(fs.readFileSync(existing, 'utf8'), 'USER DATA', 'existing data untouched');
  assert.ok(result.backupPath && fs.existsSync(result.backupPath), 'a backup is taken before launch');
});

test('first run creates the database from the seed', () => {
  const userData = tmpDir('firstrun');
  const seed = copyDb(tmpDir('seed2'));
  const result = prepareDataDirectory({ dataDir: userData, seedPath: seed });
  assert.strictEqual(result.seeded, true);
  assert.strictEqual(companyCount(result.dbPath), companyCount(seed));
});

test('backups are pruned to the configured limit and never touch the source', () => {
  const dir = tmpDir('prune');
  const dbPath = path.join(dir, 'genesis.db');
  fs.writeFileSync(dbPath, 'x');
  const backupDir = path.join(dir, 'backups');
  for (let i = 0; i < 25; i++) {
    backupDatabase(dbPath, backupDir, new Date(2026, 0, 1, 0, 0, i));
  }
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
  assert.ok(files.length <= 20, `expected at most 20 backups, got ${files.length}`);
  assert.strictEqual(fs.readFileSync(dbPath, 'utf8'), 'x');
});

// ---------------------------------------------------------------------------
(async () => {
  console.log('--- DESKTOP BACKEND LIFECYCLE TESTS ---');
  if (!fs.existsSync(SOURCE_DB)) {
    console.log('genesis.db not found; lifecycle tests need the seed database.');
  }
  for (const t of pending) {
    try {
      await t.fn();
      passed++;
      console.log(`✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`✗ ${t.name}\n   ${err.message}`);
    }
  }
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
})();
