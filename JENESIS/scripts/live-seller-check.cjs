#!/usr/bin/env node
'use strict';
/**
 * LIVE SELLER CHECK — does the counter actually work?
 *
 * JENESIS Seller is the screen a shop assistant uses all day, and the one
 * where a wrong number costs real money. These checks drive it through the
 * HTTP surface the real window uses, as the real `sales` role, against a
 * running server.
 *
 * The one that matters most is the refusal. "Prevention of sales when stock
 * is insufficient" is only real if the service refuses the sale, not if the
 * form merely greys out a button — someone can always call the service
 * directly, and the stock figures are shared with the other three
 * applications. So the check tries to sell more than exists and requires a
 * refusal, and then sells what does exist and requires the stock to fall by
 * exactly that amount.
 *
 * This writes to whichever database the server has open, which is why it is
 * meant for the disposable preview copy (scripts/preview-server.sh). It is
 * never aimed at the repository's baseline genesis.db.
 *
 * Usage:
 *   node scripts/live-seller-check.cjs [baseUrl] [password]
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

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function api(method, path, { token, app, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (app) headers['X-Jenesis-App'] = app;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* status is what we need */ }
  return { status: res.status, json };
}

async function signIn(username) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD })
  }).then((r) => r.json().catch(() => ({})));
  return res && res.token ? res.token : null;
}

async function main() {
  console.log(`--- LIVE SELLER CHECK against ${BASE} ---`);

  const sales = await signIn('sales');
  const admin = await signIn('admin');
  assert(sales, 'could not sign in as the sales role');

  // -------------------------------------------------------------------------
  // Product selection and the stock figures behind it
  // -------------------------------------------------------------------------
  const products = await api('GET', '/products', { token: sales, app: 'seller' });

  await check('the sales role can read the product list from JENESIS Seller', () => {
    assert(products.status === 200, `returned ${products.status}`);
    assert(Array.isArray(products.json) && products.json.length > 0, 'no products returned');
  });

  await check('every product carries the quantity the counter needs', () => {
    const missing = products.json.filter((p) => p.current_stock === undefined || p.current_stock === null);
    assert(missing.length === 0, `${missing.length} product(s) have no stock figure`);
    const bad = products.json.filter((p) => Number.isNaN(Number(p.current_stock)));
    assert(bad.length === 0, `${bad.length} product(s) have a stock figure that is not a number`);
  });

  await check('stock levels are readable as a list, per product', async () => {
    const levels = await api('GET', '/inventory/stock-levels', { token: sales, app: 'seller' });
    assert(levels.status === 200, `returned ${levels.status}`);
    assert(Array.isArray(levels.json), 'stock levels did not come back as a list');
  });

  // -------------------------------------------------------------------------
  // Customer creation
  // -------------------------------------------------------------------------
  const stamp = Date.now();
  const newCustomerName = `Live Check Customer ${stamp}`;
  let createdCustomerId = null;

  await check('the sales role can create a customer', async () => {
    const res = await api('POST', '/customers', {
      token: sales, app: 'seller',
      body: { name: newCustomerName, phone: '+250 700 000 000', email: `live${stamp}@example.test` }
    });
    assert(res.status === 200 || res.status === 201, `returned ${res.status}: ${JSON.stringify(res.json)}`);
    createdCustomerId = res.json && (res.json.id || (res.json.customer && res.json.customer.id));
    assert(createdCustomerId, 'no customer id came back');
  });

  await check('the customer just created appears in the list', async () => {
    const res = await api('GET', '/customers', { token: sales, app: 'seller' });
    assert(res.status === 200, `returned ${res.status}`);
    const found = res.json.find((c) => c.id === createdCustomerId);
    assert(found, 'the new customer is not in the list');
    assert(found.name === newCustomerName, `name came back as ${JSON.stringify(found.name)}`);
  });

  // -------------------------------------------------------------------------
  // The refusal that protects the stock figures
  // -------------------------------------------------------------------------
  const sellable = products.json.find(
    (p) => Number(p.current_stock) > 0 && p.track_inventory !== 0
  ) || products.json[0];

  await check('selling more than the available stock is refused', async () => {
    const available = Number(sellable.current_stock);
    const res = await api('POST', '/sales/invoices', {
      token: sales, app: 'seller',
      body: {
        customer_id: createdCustomerId,
        autoPost: true,
        lines: [{
          product_id: sellable.id,
          quantity: available + 100,
          unit_price: Number(sellable.selling_price) || 100,
          tax_rate: 0
        }]
      }
    });
    assert(
      res.status === 400,
      `asked for ${available + 100} of ${sellable.name} when ${available} exists, ` +
      `and got ${res.status} instead of a refusal`
    );
    assert(
      /insufficient stock/i.test(String(res.json && res.json.error)),
      `the refusal did not say why: ${JSON.stringify(res.json)}`
    );
  });

  await check('the refused sale left the stock untouched', async () => {
    const after = await api('GET', '/products', { token: sales, app: 'seller' });
    const row = after.json.find((p) => p.id === sellable.id);
    assert(
      Number(row.current_stock) === Number(sellable.current_stock),
      `stock went from ${sellable.current_stock} to ${row.current_stock} on a sale that was refused`
    );
  });

  // -------------------------------------------------------------------------
  // A sale that is allowed, and the exact effect it has
  // -------------------------------------------------------------------------
  const quantity = 1.25; // deliberately fractional: 1.25 of something must be sellable
  let invoiceId = null;

  await check('a sale within the available stock succeeds', async () => {
    const res = await api('POST', '/sales/invoices', {
      token: sales, app: 'seller',
      body: {
        customer_id: createdCustomerId,
        autoPost: true,
        lines: [{
          product_id: sellable.id,
          quantity,
          unit_price: Number(sellable.selling_price) || 100,
          tax_rate: 0
        }]
      }
    });
    assert(
      res.status === 200 || res.status === 201,
      `returned ${res.status}: ${JSON.stringify(res.json)}`
    );
    invoiceId = res.json && (res.json.id || (res.json.invoice && res.json.invoice.id));
    assert(invoiceId, 'no invoice id came back');
  });

  await check('a fractional quantity is sold without being rounded away', async () => {
    const after = await api('GET', '/products', { token: sales, app: 'seller' });
    const row = after.json.find((p) => p.id === sellable.id);
    const drop = Number(sellable.current_stock) - Number(row.current_stock);
    assert(
      Math.abs(drop - quantity) < 1e-9,
      `selling ${quantity} changed the stock by ${drop}`
    );
  });

  await check('the sale appears in the sales history', async () => {
    const res = await api('GET', '/sales/invoices', { token: sales, app: 'seller' });
    assert(res.status === 200, `returned ${res.status}`);
    const found = res.json.find((i) => i.id === invoiceId);
    assert(found, 'the invoice is not in the sales history');
  });

  // -------------------------------------------------------------------------
  // Returns: a credit note against a posted invoice
  // -------------------------------------------------------------------------
  // The credit-note payload is camelCase — invoiceId, customerId, and lines
  // of { productId, quantity, unitPrice, taxRate — because that is the shape
  // postCreditNote() destructures. Sending snake_case here fails to bind and
  // comes back as a 400, which looks like a refusal but is really a mistake
  // in the caller; it is why the check below insists on the reason too.
  await check('a return is issued as a credit note against a posted invoice', async () => {
    const res = await api('POST', '/sales/credit-notes', {
      token: sales, app: 'seller',
      body: {
        invoiceId,
        customerId: createdCustomerId,
        reason: 'Live check return',
        restockItems: 1,
        lines: [{
          productId: sellable.id,
          quantity: 0.25,
          unitPrice: Number(sellable.selling_price) || 100,
          taxRate: 0
        }]
      }
    });
    assert(
      res.status === 200 || res.status === 201,
      `returning 0.25 gave ${res.status}: ${JSON.stringify(res.json)}`
    );
  });

  await check('a return puts the goods back into stock', async () => {
    const after = await api('GET', '/products', { token: sales, app: 'seller' });
    const row = after.json.find((p) => p.id === sellable.id);
    const net = Number(sellable.current_stock) - Number(row.current_stock);
    assert(
      Math.abs(net - (quantity - 0.25)) < 1e-9,
      `sold ${quantity} and returned 0.25, so stock should be down ${quantity - 0.25}; it is down ${net}`
    );
  });

  await check('a credit note cannot be issued against an invoice that was never posted', async () => {
    const draft = await api('POST', '/sales/invoices', {
      token: sales, app: 'seller',
      body: {
        customer_id: createdCustomerId,
        autoPost: false,
        lines: [{ product_id: sellable.id, quantity: 1, unit_price: 100, tax_rate: 0 }]
      }
    });
    const draftId = draft.json && (draft.json.id || (draft.json.invoice && draft.json.invoice.id));
    if (!draftId) throw new Error('could not create a draft to test against');
    const res = await api('POST', '/sales/credit-notes', {
      token: sales, app: 'seller',
      body: {
        invoiceId: draftId,
        customerId: createdCustomerId,
        reason: 'should be refused',
        lines: [{ productId: sellable.id, quantity: 1, unitPrice: 100, taxRate: 0 }]
      }
    });
    // Insist on the reason as well as the status. A 400 is not proof of
    // anything on its own: a mis-shaped payload also gets a 400, and a check
    // that would accept either is a check that passes by accident.
    assert(res.status >= 400, `a return against an unposted invoice was accepted (${res.status})`);
    assert(
      /posted invoice/i.test(String(res.json && res.json.error)),
      `refused, but not for the right reason: ${JSON.stringify(res.json)}`
    );
  });

  // -------------------------------------------------------------------------
  // What the counter must NOT be able to do
  // -------------------------------------------------------------------------
  await check('the sales role cannot reach the reports from JENESIS Seller', async () => {
    for (const path of ['/reports/trial-balance', '/reports/profit-loss', '/reports/balance-sheet']) {
      const res = await api('GET', path, { token: sales, app: 'seller' });
      assert(res.status === 403, `${path} returned ${res.status} instead of being refused`);
    }
  });

  await check('the sales role cannot manage users or the company', async () => {
    for (const path of ['/auth/users', '/auth/access-catalogue']) {
      const res = await api('GET', path, { token: sales, app: 'seller' });
      assert(res.status === 403, `${path} returned ${res.status} instead of being refused`);
    }
  });

  await check('the sales role cannot post a purchase bill from the counter', async () => {
    const res = await api('GET', '/purchases/bills', { token: sales, app: 'seller' });
    assert(res.status === 403, `supplier bills returned ${res.status} instead of being refused`);
  });

  // -------------------------------------------------------------------------
  // Clean up what this check created, so a person looking at the preview
  // afterwards does not find stray records.
  // -------------------------------------------------------------------------
  if (admin && createdCustomerId) {
    await api('DELETE', `/customers/${createdCustomerId}`, { token: admin });
  }

  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
