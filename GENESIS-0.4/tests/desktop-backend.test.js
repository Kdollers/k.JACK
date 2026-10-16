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
const crypto = require('crypto');
const Database = require('better-sqlite3');

const { BackendProcess, findFreePort, waitForHealth } = require('../electron/backend-manager.cjs');
const {
  prepareDataDirectory, backupDatabase, chooseDataDirectory, shouldOfferInstallationChoice,
  alternativeInstallation, readInstallationChoice, readInstallationRecord,
  saveInstallationChoice, markInstallationInitialized, dataDirectories, CHOICE_FILE_NAME
} = require('../electron/data-location.cjs');
const { modeFromArgs, modeUrl } = require('../electron/entry-points.cjs');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = require('./fixture-db.cjs').legacyFixturePath();

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
test('mode shortcuts select isolated URLs and reject unknown modes', () => {
  assert.equal(modeFromArgs(['JENESIS.exe']), 'administrator');
  for (const mode of ['seller', 'administrator', 'network']) {
    assert.equal(modeFromArgs(['JENESIS.exe', `--jenesis-mode=${mode}`]), mode);
    assert.equal(modeUrl('http://127.0.0.1:3456/', mode), `http://127.0.0.1:3456/${mode}`);
  }
  assert.throws(() => modeFromArgs(['--jenesis-mode=unsafe']), /Unknown/);
  assert.throws(() => modeUrl('http://127.0.0.1', 'unsafe'), /Unknown/);
});

test('legacy data location is retained; conflicting directories are refused', () => {
  const root = tmpDir('choose');
  const legacy = path.join(root, 'GENESIS');
  const current = path.join(root, 'JENESIS');
  assert.equal(chooseDataDirectory(root), current);
  fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, 'genesis.db'), 'legacy untouched');
  assert.equal(chooseDataDirectory(root), legacy);
  fs.mkdirSync(current);
  fs.writeFileSync(path.join(current, 'genesis.db'), 'new untouched');
  assert.throws(() => chooseDataDirectory(root), /Both GENESIS and JENESIS/);
  assert.equal(fs.readFileSync(path.join(legacy, 'genesis.db'), 'utf8'), 'legacy untouched');
  assert.equal(fs.readFileSync(path.join(current, 'genesis.db'), 'utf8'), 'new untouched');
});

test('an existing GENESIS ledger prompts once and selecting it never opens a blank DB', () => {
  const root = tmpDir('existing-choice');
  try {
    const { legacy, current } = dataDirectories(root);
    fs.mkdirSync(legacy);
    const oldDb = copyDb(legacy);
    const before = crypto.createHash('sha256').update(fs.readFileSync(oldDb)).digest('hex');
    assert.strictEqual(shouldOfferInstallationChoice(root), true);
    assert.strictEqual(readInstallationChoice(root), null);
    saveInstallationChoice(root, 'legacy');
    assert.strictEqual(readInstallationChoice(root), 'legacy');
    assert.strictEqual(shouldOfferInstallationChoice(root), false);
    assert.strictEqual(chooseDataDirectory(root), legacy);
    assert.strictEqual(fs.existsSync(path.join(current, 'genesis.db')), false);
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(oldDb)).digest('hex'), before);
    assert.deepStrictEqual(alternativeInstallation(root, legacy), { target: 'current', newDatabase: true });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('explicit separate installation has no users; legacy records and backup files stay untouched', async () => {
  const root = tmpDir('separate-choice');
  try {
    const { legacy, current } = dataDirectories(root);
    fs.mkdirSync(legacy);
    const oldDb = copyDb(legacy);
    const backup = path.join(legacy, 'owner-backup.db');
    fs.copyFileSync(oldDb, backup);
    const before = crypto.createHash('sha256').update(fs.readFileSync(oldDb)).digest('hex');
    assert.strictEqual(shouldOfferInstallationChoice(root), true);
    saveInstallationChoice(root, 'current');
    assert.strictEqual(chooseDataDirectory(root), current);
    const result = prepareDataDirectory({ dataDir: chooseDataDirectory(root), backupExisting: false });
    assert.strictEqual(result.seeded, false);
    assert.strictEqual(fs.existsSync(result.dbPath), false, 'no archived users are imported');
    const port = await findFreePort();
    const proc = await startBackend(result.dbPath, port);
    try {
      const status = JSON.parse((await getJson(`http://127.0.0.1:${port}/api/setup/status`)).text);
      assert.deepStrictEqual(status, { needsSetup: true, recoveryRequired: false, hasAdministrator: false });
    } finally { await proc.stop(5000); }
    markInstallationInitialized(root, current);
    assert.strictEqual(readInstallationRecord(root).currentInitialized, true);
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(oldDb)).digest('hex'), before);
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'), before);
    assert.strictEqual(companyCount(oldDb), companyCount(SOURCE_DB));
    assert.deepStrictEqual(alternativeInstallation(root, current), { target: 'legacy', newDatabase: false });
    // Switching back is an explicit selection. Neither DB file is touched.
    const modernHash = crypto.createHash('sha256').update(fs.readFileSync(result.dbPath)).digest('hex');
    saveInstallationChoice(root, 'legacy');
    assert.strictEqual(chooseDataDirectory(root), legacy);
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(result.dbPath)).digest('hex'), modernHash);
    saveInstallationChoice(root, 'current');
    assert.strictEqual(chooseDataDirectory(root), current);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('two independent backend processes racing first-run registration can create only one admin', async () => {
  const dir = tmpDir('setup-race');
  const dbPath = path.join(dir, 'genesis.db');
  const firstPort = await findFreePort();
  const first = await startBackend(dbPath, firstPort);
  let second = null;
  try {
    const secondPort = await findFreePort();
    second = await startBackend(dbPath, secondPort);
    const body = {
      company_name: 'Concurrency Test', full_name: 'First Owner', username: 'first.owner',
      password: 'Private-Concurrent-Passw0rd', confirm_password: 'Private-Concurrent-Passw0rd'
    };
    const submit = async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/setup/initialize`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      return { status: res.status, json: await res.json() };
    };
    const replies = await Promise.all([submit(firstPort), submit(secondPort)]);
    assert.deepStrictEqual(replies.map((r) => r.status).sort(), [200, 409]);
    const status = JSON.parse((await getJson(`http://127.0.0.1:${firstPort}/api/setup/status`)).text);
    assert.deepStrictEqual(status, { needsSetup: false, recoveryRequired: false, hasAdministrator: true });
    const db = new Database(dbPath, { readonly: true });
    try {
      assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
      assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM company_memberships WHERE role = 'admin'").get().n, 1);
    } finally { db.close(); }
  } finally {
    if (second) await second.stop(5000);
    await first.stop(5000);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a corrupt choice, lost selected DB or ambiguous pair fails closed, never creates an empty replacement', () => {
  const root = tmpDir('invalid-choice');
  try {
    const { legacy, current } = dataDirectories(root);
    fs.mkdirSync(legacy);
    fs.mkdirSync(current);
    fs.writeFileSync(path.join(legacy, 'genesis.db'), 'legacy');
    fs.writeFileSync(path.join(current, 'genesis.db'), 'modern');
    assert.throws(() => chooseDataDirectory(root), /Both GENESIS and JENESIS/);
    assert.throws(() => saveInstallationChoice(root, 'current'), /Installation choice changed/);
    fs.writeFileSync(path.join(current, CHOICE_FILE_NAME), '{bad json');
    assert.throws(() => chooseDataDirectory(root), /cannot be read/);
    fs.writeFileSync(path.join(current, CHOICE_FILE_NAME), '{"version":1,"selected":"../../bad","currentInitialized":false}');
    assert.throws(() => chooseDataDirectory(root), /invalid/);
    fs.unlinkSync(path.join(current, 'genesis.db'));
    fs.unlinkSync(path.join(current, CHOICE_FILE_NAME));
    saveInstallationChoice(root, 'legacy');
    fs.unlinkSync(path.join(legacy, 'genesis.db'));
    assert.throws(() => chooseDataDirectory(root), /selected GENESIS database is missing/);
    assert.strictEqual(fs.existsSync(path.join(legacy, 'genesis.db')), false);
    assert.strictEqual(fs.existsSync(path.join(current, 'genesis.db')), false);
    fs.writeFileSync(path.join(legacy, 'genesis.db'), 'legacy');
    fs.writeFileSync(path.join(current, 'genesis.db'), 'modern');
    saveInstallationChoice(root, 'current');
    fs.unlinkSync(path.join(current, 'genesis.db'));
    assert.throws(() => chooseDataDirectory(root), /selected JENESIS database is missing/);
    assert.strictEqual(alternativeInstallation(root, legacy), null, 'cannot claim a lost modern ledger as a fresh one');
    assert.strictEqual(fs.readFileSync(path.join(legacy, 'genesis.db'), 'utf8'), 'legacy');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('backend starts on loopback, identifies itself, serves UI and stops cleanly', async () => {
  const dir = tmpDir('start');
  const dbPath = copyDb(dir);
  const port = await findFreePort();
  const proc = await startBackend(dbPath, port);
  try {
    const health = await getJson(`http://127.0.0.1:${port}/api/health`);
    assert.strictEqual(health.status, 200);
    const body = JSON.parse(health.text);
    assert.strictEqual(body.appId, 'jenesis-accounting');
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
      // A different process may independently listen on this LAN address and
      // port even though the port is free on loopback. Refuse *our* backend's
      // identity, not every possible HTTP response on another interface.
      let remote = null;
      try { remote = await getJson(`http://${lan.address}:${port}/api/health`); }
      catch (err) { if (!['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(err.code)) throw err; }
      if (remote) {
        let body;
        try { body = JSON.parse(remote.text); } catch { /* unrelated listener */ }
        assert.notStrictEqual(body?.appId, 'jenesis-accounting', 'backend must not serve a LAN address');
      }
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

test('a working directory that is a file is reported as a spawn error (packaged app.asar case)', async () => {
  const dir = tmpDir('badcwd');
  const fileAsCwd = path.join(dir, 'app.asar');
  fs.writeFileSync(fileAsCwd, 'not a directory');
  const proc = new BackendProcess({
    nodeExecutable: process.execPath,
    serverEntry: path.join(ROOT, 'server', 'index.js'),
    cwd: fileAsCwd,
    env: {},
    startupTimeoutMs: 3000
  });
  const port = await findFreePort();
  await assert.rejects(() => proc.start(port), /ENOTDIR|spawn error/);
});

test('startup times out with a clear message when nothing answers', async () => {
  const port = await findFreePort();
  await assert.rejects(
    () => waitForHealth({ port, timeoutMs: 600, intervalMs: 100 }),
    /did not become ready within/
  );
});

test('an existing database is never overwritten even if an explicit seed path is supplied', () => {
  const userData = tmpDir('userdata');
  const seed = copyDb(tmpDir('seed'));
  const existing = path.join(userData, 'genesis.db');
  fs.writeFileSync(existing, 'USER DATA');

  const result = prepareDataDirectory({ dataDir: userData, seedPath: seed, now: new Date(2026, 0, 1, 10, 0, 0) });
  assert.strictEqual(result.seeded, false);
  assert.strictEqual(fs.readFileSync(existing, 'utf8'), 'USER DATA', 'existing data untouched');
  assert.ok(result.backupPath && fs.existsSync(result.backupPath), 'a backup is taken before launch');
});

test('first run uses no bundled database; the backend creates a fresh database with no users', async () => {
  const userData = tmpDir('firstrun');
  const result = prepareDataDirectory({ dataDir: userData });
  assert.strictEqual(result.seeded, false);
  assert.strictEqual(fs.existsSync(result.dbPath), false);
  const port = await findFreePort();
  const proc = await startBackend(result.dbPath, port);
  try {
    const status = await getJson(`http://127.0.0.1:${port}/api/setup/status`);
    assert.strictEqual(JSON.parse(status.text).needsSetup, true);
  } finally {
    await proc.stop(5000);
  }
  assert.strictEqual(fs.existsSync(result.dbPath), true);
  const db = new Database(result.dbPath, { readonly: true });
  try {
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 0);
  } finally { db.close(); }
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
