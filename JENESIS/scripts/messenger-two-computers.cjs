#!/usr/bin/env node
'use strict';
/**
 * MESSENGER — TWO COMPUTERS VERIFICATION.
 *
 * The Messenger must be proven between two separate computers on the same
 * network, not between two windows on one machine. This script is the harness
 * for that proof: it signs in two real users over real HTTP, sends a message
 * from one to the other, waits for the delivery, waits for the reply, and
 * checks the unread badge and the read receipt.
 *
 * HOW TO RUN IT (Windows, two computers)
 * ---------------------------------------------------------------------------
 * 1. On the computer that holds the data (computer A):
 *      - open JENESIS Maintenance,
 *      - switch ON "Allow other computers on this network to connect",
 *      - note the address it shows (for example http://192.168.1.20:3000).
 * 2. On computer B (a second PC on the same network):
 *      node scripts\messenger-two-computers.cjs --server http://192.168.1.20:3000 ^
 *           --user admin --peer accountant --password <password> --password-peer <password>
 *    (Node.js is only needed to run this check; JENESIS itself is installed
 *    normally and does not need it.)
 * 3. Read the result. Every step prints PASS or FAIL; the script exits with
 *    code 1 if any step failed.
 *
 * The two users can also be the demo accounts of a training database
 * (GENESIS_SEED_DEMO=1). Never use those accounts in production.
 *
 * WHAT IT PROVES
 *   - the second computer reaches the service over the network,
 *   - both sessions are authenticated and permission-checked,
 *   - a message written on one computer is stored, delivered and read on the
 *     other, with timestamps, unread counting and read receipts,
 *   - nothing is simulated: every step is a real HTTP request.
 *
 * OPTIONS
 *   --server <url>        address of the JENESIS service (default http://127.0.0.1:3000)
 *   --user <name>         first account      (default admin)
 *   --peer <name>         second account     (default accountant)
 *   --password <pw>       password of the first account
 *   --password-peer <pw>  password of the second account (defaults to --password)
 *   --timeout <ms>        how long to wait for delivery (default 20000)
 */

const assert = require('assert');

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i > -1 && args[i + 1] ? args[i + 1] : fallback;
}

const SERVER = (option('server', 'http://127.0.0.1:3000') || '').replace(/\/+$/, '');
const USER = option('user', 'admin');
const PEER = option('peer', 'accountant');
const PASSWORD = option('password', '');
const PASSWORD_PEER = option('password-peer', PASSWORD);
const TIMEOUT = Number(option('timeout', '20000'));

let passed = 0;
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${SERVER}/api${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
  return { status: res.status, json, text };
}

async function signIn(username, password, label) {
  if (!password) {
    throw new Error(`no password for ${label} ("${username}") — pass --password / --password-peer`);
  }
  const res = await api('POST', '/auth/login', { body: { username, password } });
  assert.strictEqual(res.status, 200, `sign-in of ${username} failed: ${res.text}`);
  assert.ok(res.json && res.json.token, 'no session token returned');
  console.log(`  ....  ${label}: ${username} signed in (role ${res.json.user.role}, company ${res.json.company.name})`);
  return { token: res.json.token, user: res.json.user };
}

/** Polls until fn() returns a truthy value, or fails after TIMEOUT. */
async function waitFor(what, fn, intervalMs = 500) {
  const deadline = Date.now() + TIMEOUT;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`${what} did not happen within ${TIMEOUT / 1000} s${lastError ? ` (${lastError.message})` : ''}`);
}

(async () => {
  console.log('--- JENESIS MESSENGER: TWO-COMPUTER CHECK ---');
  console.log(`  service : ${SERVER}`);
  console.log(`  users   : ${USER} <-> ${PEER}`);
  if (SERVER.includes('127.0.0.1') || SERVER.includes('localhost')) {
    console.log('  note    : this is the SAME computer. Run it from a second PC with');
    console.log('            --server http://<address of the other computer>:3000 to prove the network.');
  }
  console.log('');

  const stamp = new Date().toISOString();
  const textA = `Two-computer check from ${USER} at ${stamp}`;
  const textB = `Reply from ${PEER} at ${stamp}`;

  let a;
  let b;
  let peerId;

  await step('the service answers and identifies itself as JENESIS', async () => {
    const res = await fetch(`${SERVER}/api/health`);
    assert.strictEqual(res.status, 200, `no answer from ${SERVER}`);
    const body = await res.json();
    assert.strictEqual(body.appId, 'genesis-accounting', 'this is not a JENESIS service');
    assert.ok(body.application.includes('JENESIS'), 'unexpected product name');
  });

  await step('both accounts can sign in over the network', async () => {
    a = await signIn(USER, PASSWORD, 'first account');
    b = await signIn(PEER, PASSWORD_PEER, 'second account');
    assert.notStrictEqual(a.user.id, b.user.id, 'use two different accounts');
    assert.strictEqual(a.user.company_id, b.user.company_id, 'both accounts must share the company');
  });

  await step('each account sees the other as a colleague', async () => {
    const list = await api('GET', '/messenger/users', { token: a.token });
    assert.strictEqual(list.status, 200, JSON.stringify(list.json));
    const peer = (list.json || []).find((u) => u.id === b.user.id);
    assert.ok(peer, `${PEER} is not visible to ${USER} (messaging:read permission?)`);
    peerId = peer.id;
  });

  let sentId;

  await step(`${USER} sends a message to ${PEER}`, async () => {
    const res = await api('POST', '/messenger/messages', {
      token: a.token,
      body: { recipientId: peerId, body: textA }
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.json));
    assert.strictEqual(res.json.status, 'SENT', 'the message was not stored');
    sentId = res.json.id;
  });

  await step(`${PEER} receives it (delivered over the network)`, async () => {
    await waitFor('the message on the receiving side', async () => {
      const thread = await api('GET', `/messenger/messages?peerId=${a.user.id}`, { token: b.token });
      if (thread.status !== 200) throw new Error(`HTTP ${thread.status}`);
      const msg = (thread.json || []).find((m) => m.id === sentId);
      if (!msg) return null;
      assert.strictEqual(msg.body, textA, 'the text arrived altered');
      assert.strictEqual(msg.mine, false, 'the received message is not marked as received');
      assert.ok(['DELIVERED', 'READ'].includes(msg.status), `unexpected status ${msg.status}`);
      return msg;
    });
  });

  await step(`the unread badge of ${PEER} counts that message`, async () => {
    const unread = await api('GET', '/messenger/unread', { token: b.token });
    assert.strictEqual(unread.status, 200);
    assert.ok(unread.json.unread >= 1, 'nothing is announced as unread');
  });

  await step(`${PEER} replies and ${USER} receives the reply`, async () => {
    const res = await api('POST', '/messenger/messages', {
      token: b.token,
      body: { recipientId: a.user.id, body: textB }
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.json));
    await waitFor('the reply on the first computer', async () => {
      const thread = await api('GET', `/messenger/messages?peerId=${peerId}`, { token: a.token });
      if (thread.status !== 200) throw new Error(`HTTP ${thread.status}`);
      const msg = (thread.json || []).find((m) => m.body === textB);
      return msg || null;
    });
  });

  await step(`${USER} reads the reply and ${PEER} sees the read receipt`, async () => {
    const read = await api('POST', `/messenger/conversations/${peerId}/read`, { token: a.token });
    assert.strictEqual(read.status, 200, JSON.stringify(read.json));
    assert.ok(read.json.markedRead >= 1, 'nothing was marked read');
    await waitFor('the read receipt on the sender side', async () => {
      const thread = await api('GET', `/messenger/messages?peerId=${a.user.id}`, { token: b.token });
      if (thread.status !== 200) throw new Error(`HTTP ${thread.status}`);
      const mine = (thread.json || []).find((m) => m.body === textB);
      return mine && mine.status === 'READ' ? mine : null;
    });
  });

  console.log('');
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  if (failed === 0) {
    console.log('Messenger works end to end between the two sessions that ran this check.');
  } else {
    console.log('Messenger is NOT proven. Read the failures above before trusting it.');
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nThe check could not be completed:', err.message);
  process.exit(1);
});
