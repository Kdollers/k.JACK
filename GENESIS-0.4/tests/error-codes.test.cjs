'use strict';
// API error mappings and malformed-request integration, always on a TEMP DB.
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { errorPayload } = require('../server/error-codes');
const catalogs = Object.fromEntries(['en', 'fr', 'rw'].map((lang) => [lang,
  require(path.join(__dirname, `../src/i18n/${lang}.json`))]));
let count = 0;
function test(name, fn) { fn(); count++; console.log('  ✓ ' + name); }

async function main() {
  test('exact backend validation and not-found messages become stable codes', () => {
    for (const [message, code] of [
      ['Company name is required', 'COMPANY_NAME_REQUIRED'],
      ['Quote not found', 'QUOTE_NOT_FOUND'],
      ['Payment amount must be greater than zero', 'PAYMENT_AMOUNT_INVALID'],
      ['Journal entry is already reversed', 'ALREADY_REVERSED'],
      ['Not found', 'VALIDATION_FAILED']
    ]) {
      const mapped = errorPayload({ error: message }, 400);
      assert.equal(mapped.code, code);
      assert.ok(!('error' in mapped));
      for (const lang of ['en', 'fr', 'rw']) assert.ok(catalogs[lang].errors[code]?.trim(), `${lang}:${code}`);
    }
  });
  test('dynamic messages map without exposing a product name or SQL constraint', () => {
    for (const [message, code] of [
      ['Unbalanced Journal Entry: 10 != 11', 'JOURNAL_UNBALANCED'],
      ['Cannot post invoice with status DRAFT', 'CANNOT_POST_STATUS'],
      ['Product Product-Secret not found', 'PRODUCT_NOT_FOUND'],
      ['UNIQUE constraint failed: users.password_hash', 'DUPLICATE_RECORD'],
      ['FOREIGN KEY constraint failed', 'INVALID_REFERENCE']
    ]) {
      const mapped = errorPayload({ error: message, safetyCopy: 'safe.db' }, 409);
      assert.deepEqual(mapped, { safetyCopy: 'safe.db', code });
    }
  });
  test('unknown errors fail closed, preserve metadata, and do not affect successes', () => {
    assert.deepEqual(errorPayload({ error: 'SQLITE_INTERNAL_TABLE_SECRET', metadata: 1 }, 500),
      { metadata: 1, code: 'GENERIC' });
    assert.equal(errorPayload({ error: 'unexpected validation' }, 400).code, 'VALIDATION_FAILED');
    assert.equal(errorPayload({ error: 'Not found' }, 404).code, 'NOT_FOUND');
    assert.deepEqual(errorPayload({ error: 'do not change a success' }, 200), { error: 'do not change a success' });
    assert.equal(errorPayload({ code: 'SESSION_EXPIRED', error: 'x' }, 401).code, 'SESSION_EXPIRED');
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-error-codes-'));
  process.env.GENESIS_DB_PATH = path.join(dir, 'test.db');
  process.env.GENESIS_DIST_DIR = path.join(__dirname, '..', 'dist');
  const { startServer } = require('../server/index');
  let server;
  try {
    server = await startServer({ port: 0, host: '127.0.0.1' });
    const url = `http://127.0.0.1:${server.port}`;
    const post = async (text) => {
      const res = await fetch(url + '/api/setup/initialize', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: text
      });
      return { status: res.status, body: await res.json(), type: res.headers.get('content-type') };
    };
    const invalid = await post('{');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'INVALID_JSON');
    assert.ok(!('error' in invalid.body));
    assert.match(invalid.type, /application\/json/);
    count++; console.log('  ✓ malformed JSON returns a coded JSON response, not an English HTML error');

    const status = await fetch(url + '/api/setup/status');
    assert.equal((await status.json()).needsSetup, true);
    count++; console.log('  ✓ error handling does not break first-run setup state');

    const anonymous = await fetch(url + '/api/no-such-endpoint');
    assert.equal(anonymous.status, 401, 'even unrecognized routes must require a session');
    const setup = await post(JSON.stringify({ company_name: 'Error Test', full_name: 'Test Admin',
      username: 'err.admin', password: 'Error-Test-Password', confirm_password: 'Error-Test-Password' }));
    assert.equal(setup.status, 200);
    const signedIn = await fetch(url + '/api/auth/login', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'err.admin', password: 'Error-Test-Password' }) });
    const { token } = await signedIn.json();
    assert.ok(token);
    const notFound = await fetch(url + '/api/no-such-endpoint', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(notFound.status, 404);
    assert.deepEqual(await notFound.json(), { code: 'NOT_FOUND' });
    count++; console.log('  ✓ protected unknown routes return a stable code after sign-in');
  } finally {
    if (server) await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`--- ${count} API ERROR CHECKS PASSED ---`);
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
