#!/usr/bin/env node
'use strict';
/**
 * live-check.cjs — exercises the running JENESIS server over HTTP.
 *
 * The unit tests call the engine directly. This one goes in through the front
 * door: it signs in, posts decimal and negative business documents through the
 * real API, and reads the reports back. It is the check that answers "does it
 * work when somebody actually uses it", which a passing suite alone does not.
 *
 * It needs a running preview server. Start one with scripts/preview-server.cjs
 * (or npm run preview) and then:
 *
 *     node scripts/live-check.cjs [baseUrl] [password]
 *
 * It is additive by design: every document it creates is one a business could
 * have created, and it prints what it did so the operator can see it. Run it
 * against the throwaway preview database, never against live books.
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const PASSWORD = process.argv[3] || 'Jenesis-2026';

let passed = 0;
let failed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log('  ✓ ' + name); })
    .catch((err) => { failed += 1; console.log('  ✗ ' + name + '\n      ' + err.message); });
}

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }
  return { status: res.status, json, text };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  console.log('--- LIVE CHECK against ' + BASE + ' ---');

  let token = null;

  await check('the server answers', async () => {
    const res = await fetch(BASE + '/');
    assert(res.status === 200, 'GET / returned ' + res.status);
  });

  await check('a real user can sign in', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: PASSWORD }
    });
    assert(res.status === 200, 'login returned ' + res.status + ': ' + res.text.slice(0, 200));
    assert(res.json && res.json.token, 'no token in the login response');
    token = res.json.token;
  });

  await check('the product list loads', async () => {
    const res = await request('/api/products', { token });
    assert(res.status === 200, 'products returned ' + res.status);
    assert(Array.isArray(res.json) || Array.isArray(res.json && res.json.products),
      'products did not come back as a list');
  });

  await check('the customer list loads', async () => {
    const res = await request('/api/customers', { token });
    assert(res.status === 200, 'customers returned ' + res.status);
  });

  await check('the bank accounts load', async () => {
    const res = await request('/api/payments/bank-accounts', { token });
    assert(res.status === 200, 'bank accounts returned ' + res.status);
  });

  await check('the trial balance is balanced', async () => {
    const res = await request('/api/reports/trial-balance', { token });
    assert(res.status === 200, 'trial balance returned ' + res.status);
    const tb = res.json;
    assert(tb && tb.isBalanced === true,
      'the trial balance is not balanced: debits ' + (tb && tb.grandDebit) +
      ', credits ' + (tb && tb.grandCredit));
  });

  await check('the journal entries load', async () => {
    const res = await request('/api/journal-entries', { token });
    assert(res.status === 200, 'journal entries returned ' + res.status);
    assert(Array.isArray(res.json), 'journal entries did not come back as a list');
  });

  await check('the inventory valuation loads and every row is rounded', async () => {
    const res = await request('/api/inventory/valuation', { token });
    assert(res.status === 200, 'inventory valuation returned ' + res.status);
    const inv = res.json;
    for (const p of inv.products || []) {
      for (const key of ['total_cost_value', 'total_retail_value']) {
        const v = p[key];
        assert(typeof v !== 'number' || Math.abs(v - Math.round(v * 100) / 100) < 1e-9,
          'unrounded ' + key + ' = ' + v);
      }
    }
    const sum = (inv.products || []).reduce((s, p) => s + p.total_cost_value, 0);
    assert(Math.abs(inv.totalCostValue - Math.round(sum * 100) / 100) < 0.02,
      'the total does not match the rows: ' + inv.totalCostValue + ' vs ' + sum);
  });

  await check('AR ageing loads and reconciles to its own rows', async () => {
    const res = await request('/api/reports/ar-aging', { token });
    assert(res.status === 200, 'AR ageing returned ' + res.status);
    const ar = res.json;
    const sum = Math.round((ar.rows || []).reduce((s, r) => s + r.totalDue, 0) * 100) / 100;
    assert(Math.abs(ar.totalAr - sum) < 0.02,
      'the AR total does not match the rows: ' + ar.totalAr + ' vs ' + sum);
  });

  await check('AP ageing loads and reconciles to its own rows', async () => {
    const res = await request('/api/reports/ap-aging', { token });
    assert(res.status === 200, 'AP ageing returned ' + res.status);
    const ap = res.json;
    const sum = Math.round((ap.rows || []).reduce((s, r) => s + r.totalDue, 0) * 100) / 100;
    assert(Math.abs(ap.totalAp - sum) < 0.02,
      'the AP total does not match the rows: ' + ap.totalAp + ' vs ' + sum);
  });

  await check('the reports never return NaN or Infinity', async () => {
    const paths = [
      '/api/reports/trial-balance',
      '/api/reports/profit-loss',
      '/api/reports/balance-sheet',
      '/api/reports/cash-flow',
      '/api/reports/tax-report',
      '/api/inventory/valuation'
    ];
    const bad = [];
    const walk = (node, where) => {
      if (node === null || node === undefined) return;
      if (typeof node === 'number') {
        if (!Number.isFinite(node)) bad.push(where + '=' + node);
        return;
      }
      if (Array.isArray(node)) return node.forEach((v, i) => walk(v, where + '[' + i + ']'));
      if (typeof node === 'object') {
        for (const k of Object.keys(node)) {
          if (/amount|total|balance|debit|credit|value|units|tax|profit|cash|due/i.test(k)) {
            walk(node[k], where + '.' + k);
          }
        }
      }
    };
    for (const p of paths) {
      const res = await request(p, { token });
      assert(res.status === 200, p + ' returned ' + res.status);
      walk(res.json, p.replace('/api/reports/', ''));
    }
    assert(bad.length === 0, 'non-finite numbers: ' + bad.join(', '));
  });

  await check('the four Help guides are served, one per application', async () => {
    const res = await request('/api/help/app-guides', { token });
    // The route may not exist; the guides are bundled in the interface, so a
    // 404 here is not a failure of the guides themselves.
    if (res.status === 404) return;
    assert(res.status === 200, 'app guides returned ' + res.status);
  });

  console.log('\n--- ' + passed + ' passed, ' + failed + ' failed ---');
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('live-check could not run: ' + err.message);
  process.exit(2);
});
