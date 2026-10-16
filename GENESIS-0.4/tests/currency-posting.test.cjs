'use strict';
// End-to-end invoice + journal checks on independent base currencies. No FX.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jenesis-currencies-'));
process.env.GENESIS_DB_PATH = path.join(dir, 'test.db');
const { startServer } = require('../server/index');
const { getDb } = require('../server/db');
let server, base, token;
async function call(method, endpoint, body) {
  const res = await fetch(`${base}/api${endpoint}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: res.status, data: await res.json() };
}
async function ok(method, endpoint, body) {
  const r = await call(method, endpoint, body);
  assert.equal(r.status, 200, `${endpoint}: ${JSON.stringify(r.data)}`);
  return r.data;
}
async function main() {
  try {
    server = await startServer({ host: '127.0.0.1', port: 0 });
    base = `http://127.0.0.1:${server.port}`;
    await ok('POST', '/setup/initialize', { company_name: 'Initial USD', country_code: 'US',
      currency_code: 'USD', username: 'owner', full_name: 'Owner',
      password: 'Independent-Base-2026', confirm_password: 'Independent-Base-2026' });
    token = (await ok('POST', '/auth/login', { username: 'owner', password: 'Independent-Base-2026', mode: 'administrator' })).token;
    const original = (await ok('GET', '/auth/me')).company;
    const configs = [
      ['USD', 'US', 2], ['EUR', 'FR', 2], ['XAF', 'CM', 0], ['RWF', 'RW', 0], ['UGX', 'UG', 0]
    ];
    let firstProductId, firstCustomerId;
    for (const [currency, country, decimals] of configs) {
      const company = currency === 'USD' ? original : await ok('POST', '/companies', {
        name: `Independent ${currency}`, currency_code: currency, country_code: country
      });
      if (currency !== 'USD') {
        const switchResponse = await ok('POST', '/auth/switch-company', { company_id: company.id });
        token = switchResponse.token;
      }
      const current = (await ok('GET', '/auth/me')).company;
      assert.equal(current.currency_code, currency);
      assert.equal(current.currency_decimals, decimals);
      const customer = await ok('POST', '/customers', { name: `Customer ${currency}` });
      const product = await ok('POST', '/products', { sku: 'SERVICE-01', name: `Service ${currency}`,
        type: 'SERVICE', selling_price: 100, cost_price: 0 });
      if (currency === 'USD') {
        firstProductId = product.id;
        firstCustomerId = customer.id;
      } else {
        const foreignProduct = await call('POST', '/sales/invoices', { customer_id: customer.id,
          lines: [{ product_id: firstProductId, quantity: 1, unit_price: 100 }] });
        assert.equal(foreignProduct.status, 409);
        assert.equal(foreignProduct.data.code, 'INVALID_REFERENCE');
        const foreignContact = await call('POST', '/sales/invoices', { customer_id: firstCustomerId,
          lines: [{ product_id: product.id, quantity: 1, unit_price: 100 }] });
        assert.equal(foreignContact.status, 409);
        assert.equal(foreignContact.data.code, 'INVALID_REFERENCE');
      }
      const created = await ok('POST', '/sales/invoices', { customer_id: customer.id,
        autoPost: true, lines: [{ product_id: product.id, description: product.name,
          quantity: 1, unit_price: 100, discount_percent: 0, tax_rate: 18 }] });
      assert.equal(created.total, 118);
      const invoice = (await ok('GET', `/sales/invoices/${created.id}`));
      assert.equal(invoice.status, 'POSTED');
      assert.equal(invoice.total, 118);
      assert.equal(invoice.tax_total, 18);
      const journal = getDb().prepare('SELECT * FROM journal_entries WHERE id = ?').get(invoice.journal_entry_id);
      assert.equal(journal.company_id, company.id);
      assert.equal(journal.total_debit, 118);
      assert.equal(journal.total_credit, 118);
      const bad = await call('POST', '/sales/invoices', { customer_id: customer.id,
        autoPost: true, lines: [{ product_id: product.id, description: product.name,
          quantity: 1, unit_price: 101, discount_percent: 0, tax_rate: 18 }] });
      if (decimals === 0) {
        assert.equal(bad.status, 409, `${currency}: ${JSON.stringify(bad.data)}`);
        assert.equal(bad.data.code, 'CURRENCY_PRECISION_INVALID');
        assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM sales_invoices WHERE company_id = ?').get(company.id).n,
          1, 'rejected invoice must not leave a misleading draft');
      } else {
        assert.equal(bad.status, 200, JSON.stringify(bad.data));
      }
      if (decimals === 0) {
        const bank = await ok('POST', '/payments/bank-accounts', {
          bank_name: `Cash ${currency}`, account_number: `CASH-${currency}`, account_type: 'CASH'
        });
        assert.equal(bank.currency, currency);
        const wrongPayment = await call('POST', '/payments', {
          paymentType: 'CUSTOMER_RECEIPT', bankAccountId: bank.id, customerId: customer.id, amount: 1.5
        });
        assert.equal(wrongPayment.status, 409);
        assert.equal(wrongPayment.data.code, 'CURRENCY_PRECISION_INVALID');
        assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM payments WHERE company_id = ?').get(company.id).n, 0);
        const fractionalTaxReturn = await call('POST', '/sales/credit-notes', {
          customerId: customer.id, invoiceId: created.id, restockItems: 0,
          lines: [{ productId: product.id, quantity: 1, unitPrice: 1, taxRate: 0.49 }]
        });
        assert.equal(fractionalTaxReturn.status, 409);
        assert.equal(fractionalTaxReturn.data.code, 'CURRENCY_PRECISION_INVALID');
        assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM credit_notes WHERE company_id = ?').get(company.id).n, 0);
      }
      const otherCurrency = currency === 'USD' ? 'EUR' : 'USD';
      const beforeTagged = getDb().prepare('SELECT COUNT(*) AS n FROM sales_invoices WHERE company_id = ?').get(company.id).n;
      const foreignTagged = await call('POST', '/sales/invoices', {
        customer_id: customer.id, currency_code: otherCurrency, autoPost: true,
        lines: [{ product_id: product.id, quantity: 1, unit_price: 100 }]
      });
      assert.equal(foreignTagged.status, 409);
      assert.equal(foreignTagged.data.code, 'FOREIGN_CURRENCY_UNSUPPORTED');
      const lineTagged = await call('POST', '/sales/invoices', {
        customer_id: customer.id, autoPost: true,
        lines: [{ product_id: product.id, quantity: 1, unit_price: 100, currency: otherCurrency }]
      });
      assert.equal(lineTagged.status, 409);
      assert.equal(lineTagged.data.code, 'FOREIGN_CURRENCY_UNSUPPORTED');
      assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM sales_invoices WHERE company_id = ?').get(company.id).n,
        beforeTagged, 'foreign tagged amounts must not leave an invoice draft or journal');
      const foreignProduct = await call('POST', '/products', {
        sku: 'FOREIGN', name: 'Foreign priced product', type: 'SERVICE',
        currency_code: otherCurrency, selling_price: 100, cost_price: 0
      });
      assert.equal(foreignProduct.status, 409);
      assert.equal(foreignProduct.data.code, 'FOREIGN_CURRENCY_UNSUPPORTED');
      const taggedJournal = await call('POST', '/journal-entries', {
        currency_code: otherCurrency, description: 'Unsupported foreign journal', lines: [
          { accountId: 'invalid', debit: 1 }, { accountId: 'invalid', credit: 1 }
        ]
      });
      assert.equal(taggedJournal.status, 409);
      assert.equal(taggedJournal.data.code, 'FOREIGN_CURRENCY_UNSUPPORTED');
      // A legacy foreign-default contact remains unchanged on disk, but cannot
      // silently originate a new base-currency invoice without an FX ledger.
      getDb().prepare('UPDATE customers SET default_currency = ? WHERE id = ?')
        .run(otherCurrency, customer.id);
      const legacyContact = await call('POST', '/sales/invoices', {
        customer_id: customer.id, lines: [{ product_id: product.id, quantity: 1, unit_price: 100 }]
      });
      assert.equal(legacyContact.status, 409);
      assert.equal(legacyContact.data.code, 'FOREIGN_CURRENCY_UNSUPPORTED');
      getDb().prepare('UPDATE customers SET default_currency = ? WHERE id = ?')
        .run(currency, customer.id);
      const badJournal = await call('POST', '/journal-entries', { description: 'Precision check',
        lines: [{ accountId: getDb().prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(company.id, '1010').id, debit: 1.5, credit: 0 },
          { accountId: getDb().prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(company.id, '3010').id, debit: 0, credit: 1.5 }] });
      if (decimals === 0) {
        assert.equal(badJournal.status, 409);
        assert.equal(badJournal.data.code, 'CURRENCY_PRECISION_INVALID');
      } else assert.equal(badJournal.status, 200, JSON.stringify(badJournal.data));
      console.log(`  ✓ ${currency}: ${decimals}-decimal company invoice/ledger integrity and fractional protection`);
      if (currency !== 'USD') {
        token = (await ok('POST', '/auth/switch-company', { company_id: original.id })).token;
      }
    }
    console.log('--- INDEPENDENT CURRENCY POSTINGS PASSED ---');
  } finally {
    if (server) await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
