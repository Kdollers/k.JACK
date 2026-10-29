'use strict';
/**
 * JENESIS MESSENGER TESTS (Part E)
 *
 * Verifies the parts that can honestly be verified here: persistence, delivery,
 * read receipts, company isolation, server-side permission enforcement, the
 * live (SSE) push, and that message text never reaches the audit log.
 *
 * Runs on a temporary COPY of the demo database; the repository genesis.db is
 * never opened for writing.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-msg-'));
const dbPath = path.join(workDir, 'genesis.db');
if (fs.existsSync(SOURCE_DB)) fs.copyFileSync(SOURCE_DB, dbPath);
process.env.GENESIS_DB_PATH = dbPath;
process.env.GENESIS_DIST_DIR = path.join(ROOT, 'dist');

const sourceMd5Before = fs.existsSync(SOURCE_DB)
  ? crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex')
  : null;

const { startServer } = require('../server/index.js');
const { getDb } = require('../server/db');
const { hashPassword } = require('../server/passwords');
const { PERMISSIONS } = require('../server/auth');

let base;
let serverHandle;
let passed = 0;
let failed = 0;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not json */ }
  return { status: res.status, json };
}

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \u2717 ${name}\n      ${err.message}`);
  }
}

const db = () => getDb();
const COMPANY = 'comp-genesis-01';
const OTHER_COMPANY = 'comp-other-01';
const PASSWORD = 'Messenger-Test-Password-2026';

function q(sql, ...params) { return db().prepare(sql).get(...params); }
function all(sql, ...params) { return db().prepare(sql).all(...params); }

/**
 * Reads an SSE response until `want` events arrive or the timeout expires.
 * Returns the parsed payloads.
 */
async function readStream(res, want, timeoutMs = 4000) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';
  const deadline = Date.now() + timeoutMs;
  // Keep ONE pending read across iterations: a read that loses a race would
  // otherwise consume its chunk and drop it on the floor.
  let pending = reader.read();
  while (Date.now() < deadline && events.length < want) {
    let timerId = null;
    const timer = new Promise((resolve) => { timerId = setTimeout(() => resolve({ timedOut: true }), 200); });
    const chunk = await Promise.race([pending, timer]);
    if (timerId) clearTimeout(timerId);
    if (chunk.timedOut) continue;
    pending = reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const data = part.split('\n').find((line) => line.startsWith('data: '));
      if (!data) continue;
      let payload = null;
      try { payload = JSON.parse(data.slice(6)); } catch (_) { /* heartbeat */ }
      // Only message events count; the initial "ready" event is ignored.
      if (payload && payload.id) events.push(payload);
    }
  }
  await reader.cancel().catch(() => {});
  return events;
}

async function main() {
  const started = await startServer({ port: 0, host: '127.0.0.1' });
  serverHandle = started;
  base = `http://127.0.0.1:${started.port}`;

  // A second company with its own user, to prove messages cannot cross companies.
  db().prepare(`INSERT OR IGNORE INTO companies (id, code, name, currency_code, created_at, updated_at)
    VALUES (?, 'OTHER', 'Other Company', 'USD', datetime('now'), datetime('now'))`).run(OTHER_COMPANY);
  assert.ok(q(`SELECT id FROM companies WHERE id = ?`, OTHER_COMPANY), 'second test company created');

  const insertUser = (id, username, role, companyId, name) => {
    db().prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
      VALUES (?, ?, ?, ?, NULL, ?, ?, 1, datetime('now'), 0)`).run(id, username, hashPassword(PASSWORD), name, role, companyId);
  };
  insertUser('usr-msg-a', 'msg.alice', 'admin', COMPANY, 'Alice Admin');
  insertUser('usr-msg-b', 'msg.bob', 'sales', COMPANY, 'Bob Seller');
  insertUser('usr-msg-mgr', 'msg.manager', 'manager', COMPANY, 'Mia Manager');
  insertUser('usr-msg-x', 'msg.other', 'admin', OTHER_COMPANY, 'Xavier Other');

  const tokenFor = async (u) => (await api('POST', '/auth/login', { body: { username: u, password: PASSWORD } })).json.token;
  const alice = await tokenFor('msg.alice');
  const bob = await tokenFor('msg.bob');
  const mgr = await tokenFor('msg.manager');
  assert.ok(alice && bob && mgr, 'test logins');

  console.log('--- MESSENGER TESTS (delivery, permissions, company isolation, live push) ---');

  await check('migration v5 created the messages table', () => {
    const row = q(`SELECT version FROM schema_migrations WHERE version = 5`);
    assert.ok(row, 'schema_migrations must contain version 5');
    const table = q(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'`);
    assert.ok(table, 'messages table missing');
  });

  await check('messaging permissions exist and only managers are read-only', () => {
    assert.ok(PERMISSIONS.includes('messaging:read'));
    assert.ok(PERMISSIONS.includes('messaging:write'));
    const { ROLE_PERMISSIONS } = require('../server/auth');
    for (const role of ['admin', 'accountant', 'sales', 'purchases', 'inventory']) {
      assert.ok(ROLE_PERMISSIONS[role].includes('messaging:write'), `${role} should be able to write messages`);
    }
    assert.ok(ROLE_PERMISSIONS.manager.includes('messaging:read'), 'manager can read');
    assert.ok(!ROLE_PERMISSIONS.manager.includes('messaging:write'), 'manager stays read-only');
  });

  await check('the colleague list contains the same company only (never yourself)', async () => {
    const list = await api('GET', '/messenger/users', { token: alice });
    assert.strictEqual(list.status, 200, JSON.stringify(list.json));
    const ids = list.json.map((u) => u.id);
    assert.ok(ids.includes('usr-msg-b'), 'a colleague of the same company is listed');
    assert.ok(!ids.includes('usr-msg-a'), 'you never appear in your own list');
    assert.ok(!ids.includes('usr-msg-x'), 'a user of another company is never listed');
  });

  await check('anonymous and cross-company access are refused', async () => {
    const anon = await api('GET', '/messenger/users');
    assert.strictEqual(anon.status, 401);
    const noTokenSend = await api('POST', '/messenger/messages', { body: { recipientId: 'usr-msg-b', body: 'hi' } });
    assert.strictEqual(noTokenSend.status, 401);
  });

  let firstMessageId = null;
  await check('a message is stored with the session user as sender (never a client-supplied id)', async () => {
    const res = await api('POST', '/messenger/messages', {
      token: bob,
      body: { recipientId: 'usr-msg-a', body: 'Hello Alice, do we have printers in stock?', senderId: 'usr-msg-x', sender_id: 'usr-msg-x' }
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.json));
    firstMessageId = res.json.id;
    assert.ok(firstMessageId);
    const row = q(`SELECT * FROM messages WHERE id = ?`, firstMessageId);
    assert.strictEqual(row.sender_id, 'usr-msg-b', 'the session identity is used');
    assert.strictEqual(row.recipient_id, 'usr-msg-a');
    assert.strictEqual(row.company_id, COMPANY);
    assert.strictEqual(row.body, 'Hello Alice, do we have printers in stock?');
    assert.strictEqual(res.json.status, 'SENT', 'not yet delivered');
    assert.strictEqual(res.json.mine, true);
  });

  await check('the recipient sees the message and it is marked delivered', async () => {
    const thread = await api('GET', `/messenger/messages?peerId=usr-msg-b`, { token: alice });
    assert.strictEqual(thread.status, 200, JSON.stringify(thread.json));
    assert.strictEqual(thread.json.length, 1);
    assert.strictEqual(thread.json[0].body, 'Hello Alice, do we have printers in stock?');
    assert.strictEqual(thread.json[0].mine, false);
    const row = q(`SELECT delivered_at, read_at FROM messages WHERE id = ?`, firstMessageId);
    assert.ok(row.delivered_at, 'fetching the thread marks it delivered');
    assert.strictEqual(row.read_at, null);
  });

  await check('the unread badge counts only messages received', async () => {
    const aliceUnread = await api('GET', '/messenger/unread', { token: alice });
    assert.strictEqual(aliceUnread.status, 200);
    assert.strictEqual(aliceUnread.json.unread, 1, 'Alice has one unread message');
    const bobUnread = await api('GET', '/messenger/unread', { token: bob });
    assert.strictEqual(bobUnread.json.unread, 0, 'the sender has nothing unread');
  });

  await check('reading a conversation marks it read and shows the receipt to the sender', async () => {
    const read = await api('POST', '/messenger/conversations/usr-msg-b/read', { token: alice });
    assert.strictEqual(read.status, 200, JSON.stringify(read.json));
    assert.strictEqual(read.json.markedRead, 1);
    assert.strictEqual((await api('GET', '/messenger/unread', { token: alice })).json.unread, 0);
    const senderView = await api('GET', `/messenger/messages?peerId=usr-msg-a`, { token: bob });
    const mine = senderView.json.find((m) => m.id === firstMessageId);
    assert.strictEqual(mine.status, 'READ', 'the sender sees the read receipt');
    assert.ok(q(`SELECT read_at FROM messages WHERE id = ?`, firstMessageId).read_at);
  });

  await check('conversations list the last message and the unread count per colleague', async () => {
    await api('POST', '/messenger/messages', { token: bob, body: { recipientId: 'usr-msg-a', body: 'Second question: price of a keyboard?' } });
    const convs = await api('GET', '/messenger/conversations', { token: alice });
    assert.strictEqual(convs.status, 200);
    const withBob = convs.json.find((c) => c.peer.id === 'usr-msg-b');
    assert.ok(withBob, 'the conversation with Bob exists');
    assert.strictEqual(withBob.unread, 1, 'the new message is unread');
    assert.strictEqual(withBob.lastMessage.body, 'Second question: price of a keyboard?');
  });

  await check('invalid messages are refused before anything is stored', async () => {
    const before = q(`SELECT COUNT(*) AS n FROM messages`).n;
    const empty = await api('POST', '/messenger/messages', { token: alice, body: { recipientId: 'usr-msg-b', body: '   ' } });
    assert.strictEqual(empty.status, 400, 'empty body refused');
    const noRecipient = await api('POST', '/messenger/messages', { token: alice, body: { body: 'hello' } });
    assert.strictEqual(noRecipient.status, 400, 'missing recipient refused');
    const tooLong = await api('POST', '/messenger/messages', { token: alice, body: { recipientId: 'usr-msg-b', body: 'x'.repeat(5000) } });
    assert.strictEqual(tooLong.status, 400, 'over-long body refused');
    const self = await api('POST', '/messenger/messages', { token: alice, body: { recipientId: 'usr-msg-a', body: 'note to self' } });
    assert.strictEqual(self.status, 400, 'messaging yourself is refused');
    const across = await api('POST', '/messenger/messages', { token: alice, body: { recipientId: 'usr-msg-x', body: 'outside the company' } });
    assert.strictEqual(across.status, 400, 'a user of another company cannot be messaged');
    const unknown = await api('POST', '/messenger/messages', { token: alice, body: { recipientId: 'usr-nobody', body: 'ghost' } });
    assert.strictEqual(unknown.status, 400);
    assert.strictEqual(q(`SELECT COUNT(*) AS n FROM messages`).n, before, 'nothing invalid was stored');
  });

  await check('reading a thread of another company is refused', async () => {
    const res = await api('GET', `/messenger/messages?peerId=usr-msg-x`, { token: alice });
    assert.strictEqual(res.status, 400, JSON.stringify(res.json));
    assert.strictEqual((await api('GET', `/messenger/messages?peerId=`, { token: alice })).status, 400, 'peerId is required');
  });

  await check('a read-only manager can read but cannot send', async () => {
    const read = await api('GET', '/messenger/conversations', { token: mgr });
    assert.strictEqual(read.status, 200, 'manager messaging:read is allowed');
    const write = await api('POST', '/messenger/messages', { token: mgr, body: { recipientId: 'usr-msg-b', body: 'managers cannot write' } });
    assert.strictEqual(write.status, 403, 'manager messaging:write is refused');
    assert.strictEqual(write.json.code, 'FORBIDDEN');
  });

  await check('the live stream pushes a new message to its recipient only', async () => {
    const res = await fetch(`${base}/api/messenger/stream`, {
      headers: { authorization: `Bearer ${alice}`, accept: 'text/event-stream' }
    });
    assert.strictEqual(res.status, 200, 'the stream opens');
    assert.ok((res.headers.get('content-type') || '').includes('text/event-stream'));

    setTimeout(async () => {
      await api('POST', '/messenger/messages', { token: bob, body: { recipientId: 'usr-msg-a', body: 'Live message from Bob' } });
    }, 250);

    const events = await readStream(res, 1, 5000);
    assert.ok(events.length >= 1, 'the recipient received a live event');
    const live = events.find((e) => e.body === 'Live message from Bob');
    assert.ok(live, 'the live event carries the new message');
    assert.strictEqual(live.senderId, 'usr-msg-b');
    assert.strictEqual(live.recipientId, 'usr-msg-a');
    assert.ok(live.id, 'every event carries the message id so clients can de-duplicate');
  });

  await check('a message sent to somebody else is never pushed to this stream', async () => {
    // Alice listens; Bob writes to the manager — Alice must receive nothing.
    const res = await fetch(`${base}/api/messenger/stream`, {
      headers: { authorization: `Bearer ${alice}`, accept: 'text/event-stream' }
    });
    setTimeout(async () => {
      await api('POST', '/messenger/messages', { token: bob, body: { recipientId: 'usr-msg-mgr', body: 'Private for the manager' } });
    }, 250);
    const events = await readStream(res, 1, 2000);
    assert.ok(!events.some((e) => e.body === 'Private for the manager'), 'no message leaked to another thread');
  });

  await check('the audit trail records the event but never the message text', async () => {
    const rows = all(`SELECT * FROM audit_logs WHERE module = 'MESSENGER' AND action = 'SEND'`);
    assert.ok(rows.length >= 2, `expected MESSENGER audit rows, found ${rows.length}`);
    for (const row of rows) {
      assert.ok(row.description && row.description.length > 0);
      assert.ok(!/printers|keyboard|Live message|Private for/i.test(row.description), 'message text must not be logged');
    }
    // And the whole log file of this run does not contain a message body either.
    const allDescriptions = all(`SELECT description FROM audit_logs`).map((r) => r.description).join('\n');
    assert.ok(!allDescriptions.includes('Live message from Bob'), 'no audit entry contains a message body');
  });

  await check('every messenger route is guarded by exactly one permission', async () => {
    const stack = require('../server/routes/api').stack.filter((l) => l.route);
    const expected = {
      'GET /messenger/users': 'messaging:read',
      'GET /messenger/conversations': 'messaging:read',
      'GET /messenger/unread': 'messaging:read',
      'GET /messenger/messages': 'messaging:read',
      'GET /messenger/stream': 'messaging:read',
      'POST /messenger/messages': 'messaging:write',
      'POST /messenger/conversations/:peerId/read': 'messaging:read'
    };
    for (const [key, permission] of Object.entries(expected)) {
      const layer = stack.find((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}` === key);
      assert.ok(layer, `${key} route missing`);
      const guards = layer.route.stack.map((h) => h.handle.permission).filter(Boolean);
      assert.strictEqual(guards.length, 1, `${key} must have one permission guard`);
      assert.strictEqual(guards[0], permission);
    }
  });

  await check('messages survive a re-read (history is persisted, not only pushed)', async () => {
    const thread = await api('GET', `/messenger/messages?peerId=usr-msg-a`, { token: bob });
    assert.strictEqual(thread.status, 200);
    assert.ok(thread.json.length >= 3, `history should be complete, found ${thread.json.length}`);
    const persisted = q(`
      SELECT COUNT(*) AS n FROM messages
      WHERE company_id = ?
        AND ((sender_id = 'usr-msg-b' AND recipient_id = 'usr-msg-a')
          OR (sender_id = 'usr-msg-a' AND recipient_id = 'usr-msg-b'))`, COMPANY);
    assert.strictEqual(persisted.n, thread.json.length, 'the thread matches the stored rows exactly');
  });

  await check('repository genesis.db unchanged', async () => {
    if (!sourceMd5Before) return;
    const after = crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex');
    assert.strictEqual(after, sourceMd5Before);
  });

  console.log(`--- ${passed} passed, ${failed} failed ---`);
  await serverHandle.close();
  fs.rmSync(workDir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  if (serverHandle) await serverHandle.close();
  process.exit(1);
});
