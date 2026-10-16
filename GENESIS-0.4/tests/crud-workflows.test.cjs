'use strict';
// CRUD regression tests use only a NEW temporary SQLite installation. The
// checked-in historical database is never opened or used by this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jenesis-crud-'));
process.env.GENESIS_DB_PATH = path.join(dir, 'test.db');
const { startServer } = require('../server/index');
const { getDb } = require('../server/db');

let server, base, token, companyId;
async function request(method, endpoint, data, bearer = token, headers = {}) {
  const res = await fetch(`${base}/api${endpoint}`, {
    method, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(data ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  return { status: res.status, body: await res.json() };
}
async function success(method, endpoint, data, bearer) {
  const { status, body } = await request(method, endpoint, data, bearer);
  assert.equal(status, 200, `${method} ${endpoint}: HTTP ${status}, ${JSON.stringify(body)}`);
  return body;
}
async function test(name, action) { await action(); console.log('  ✓ ' + name); }

async function main() {
  try {
    server = await startServer({ host: '127.0.0.1', port: 0 });
    base = `http://127.0.0.1:${server.port}`;
    await success('POST', '/setup/initialize', { company_name: 'Original Trading',
      username: 'owner', full_name: 'Business Owner', password: 'Only-In-Temp-Test-2026',
      confirm_password: 'Only-In-Temp-Test-2026' }, null);
    token = (await success('POST', '/auth/login',
      { username: 'owner', password: 'Only-In-Temp-Test-2026' }, null)).token;
    assert.ok(token);
    companyId = (await success('GET', '/auth/me')).company.id;
    const origAccounts = getDb().prepare('SELECT COUNT(*) AS n FROM accounts WHERE company_id = ?').get(companyId).n;
    const origJournals = getDb().prepare('SELECT COUNT(*) AS n FROM journal_entries WHERE company_id = ?').get(companyId).n;

    for (const [kind, data] of [
      ['customers', { code: 'CUST-NEW', name: 'Kigali Customer', credit_limit: 100, payment_terms: 'NET_30' }],
      ['suppliers', { code: 'SUPP-NEW', name: 'Douala Supplier', payment_terms: 'NET_30' }]
    ]) {
      await test(`${kind}: create, search, edit without deactivating, reject invalid and missing`, async () => {
        const created = await success('POST', `/${kind}`, data);
        const found = await success('GET', `/${kind}?search=${encodeURIComponent(data.name)}`);
        assert.equal(found.find((row) => row.id === created.id)?.name, data.name);
        await success('PUT', `/${kind}/${created.id}`, { ...data, name: data.name + ' Revised' });
        const revised = (await success('GET', `/${kind}?search=Revised`)).find((row) => row.id === created.id);
        assert.equal(revised?.name, data.name + ' Revised');
        assert.equal(revised?.active, 1, 'editing must not silently deactivate the record');
        assert.equal((await request('POST', `/${kind}`, { ...data, code: 'X', name: '   ' })).status, 400);
        const duplicate = await request('POST', `/${kind}`, { ...data, code: data.code.toLowerCase() });
        assert.equal(duplicate.status, 409, 'codes are unique regardless of letter case');
        assert.equal((await request('PUT', `/${kind}/not-a-record`, data)).status, 404);
        assert.equal((await success('GET', `/${kind}?search=%25`)).length, 0, 'search wildcard is literal');
        await success('PUT', `/${kind}/${created.id}`, { active: 0 });
        assert.equal((await success('GET', `/${kind}`)).find((r) => r.id === created.id).active, 0);
        await success('PUT', `/${kind}/${created.id}`, { active: 1 });
        assert.equal((await success('GET', `/${kind}`)).find((r) => r.id === created.id).active, 1);
      });
    }

    await test('product: create with company-owned accounts/tax, edit, search and validate prices', async () => {
      const data = { sku: 'NEW-ITEM', name: 'Test Product', type: 'GOODS', unit: 'pcs',
        cost_price: 20.25, selling_price: 35.50, category: 'General',
        min_stock_level: 2, warehouse_location: 'Test shelf' };
      const created = await success('POST', '/products', data);
      const original = (await success('GET', '/products?search=NEW-ITEM')).find((p) => p.id === created.id);
      assert.equal(original?.selling_price, 35.5);
      for (const col of ['sales_account_id', 'cogs_account_id', 'inventory_account_id']) {
        const acc = getDb().prepare('SELECT company_id FROM accounts WHERE id = ?').get(original[col]);
        assert.equal(acc?.company_id, companyId, `${col} belongs to this company`);
      }
      await success('PUT', `/products/${created.id}`, { ...data, name: 'Edited Product' });
      const edited = (await success('GET', '/products?search=Edited Product')).find((p) => p.id === created.id);
      assert.equal(edited?.active, 1);
      assert.equal(edited?.name, 'Edited Product');
      assert.equal((await request('POST', '/products', { ...data, sku: 'WRONG-PRICE', cost_price: -10 })).status, 400);
      const illegalStock = await request('POST', '/products', { ...data, sku: 'UNPOSTED-STOCK', current_stock: 20 });
      assert.equal(illegalStock.status, 409);
      assert.equal(illegalStock.body.code, 'INITIAL_STOCK_REQUIRES_ADJUSTMENT');
      assert.equal((await request('POST', '/products', { ...data, sku: 'new-item' })).status, 409);
      assert.equal((await request('PUT', `/products/${created.id}`, { current_stock: 100 })).status, 409);
      assert.equal((await request('PUT', '/products/not-found', data)).status, 404);
    });

    let newCompany;
    await test('authorized new company has a validated country/currency and a separate chart', async () => {
      const unsupported = await request('POST', '/companies', { name: 'Wrong currency',
        country_code: 'CM', currency_code: 'XOF' });
      assert.equal(unsupported.status, 400);
      assert.equal(unsupported.body.code, 'CURRENCY_UNSUPPORTED');
      assert.equal((await request('POST', '/companies', { name: 'Unknown region',
        country_code: 'ZZ', currency_code: 'USD' })).status, 400);
      newCompany = await success('POST', '/companies', { name: 'Cameroon Services', country_code: 'CM',
        currency_code: 'XAF', currency_symbol: 'FCFA', currency_decimals: 0,
        fiscal_year_start: '01-01', fiscal_year_end: '12-31' });
      const companies = await success('GET', '/companies');
      assert.equal(companies.length, 2);
      assert.ok(companies.some((c) => c.id === newCompany.id && c.country_code === 'CM' && c.currency_code === 'XAF'));
      const newAccounts = getDb().prepare('SELECT COUNT(*) AS n FROM accounts WHERE company_id = ?').get(newCompany.id).n;
      assert.equal(newAccounts, origAccounts);
      assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM accounts WHERE company_id = ?').get(companyId).n, origAccounts);
      assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM journal_entries WHERE company_id = ?').get(companyId).n, origJournals);
    });

    await test('creator can switch company using a newly issued session; other companies remain isolated', async () => {
      const oldToken = token;
      const result = await success('POST', '/auth/switch-company', { company_id: newCompany.id });
      assert.ok(result.token && result.token !== oldToken);
      token = result.token;
      assert.equal((await request('GET', '/auth/me', null, oldToken)).status, 401);
      assert.equal((await success('GET', '/auth/me')).company.id, newCompany.id);
      assert.equal((await success('GET', '/auth/users')).some((u) => u.username === 'owner'), true);
      assert.equal((await success('GET', '/products')).some((p) => p.sku === 'NEW-ITEM'), false);
      assert.equal((await request('GET', '/products', null, token, { 'x-company-id': companyId })).status, 403);
    });

    await test('product in the new company posts only against its own account IDs', async () => {
      const fractional = await request('POST', '/products', { sku: 'CM-001-X', name: 'Fractional XAF',
        cost_price: 0.25, selling_price: 35.5 });
      assert.equal(fractional.status, 400);
      assert.equal(fractional.body.code, 'CURRENCY_PRECISION_INVALID');
      const changeCurrency = await request('PUT', '/companies/current', { currency_code: 'USD' });
      assert.equal(changeCurrency.status, 409);
      assert.equal(changeCurrency.body.code, 'CURRENCY_CHANGE_REQUIRES_MIGRATION');
      const newProduct = await success('POST', '/products', { sku: 'CM-001', name: 'Separate Product',
        cost_price: 0, selling_price: 100, type: 'SERVICE' });
      const row = getDb().prepare('SELECT * FROM products WHERE id = ?').get(newProduct.id);
      assert.equal(row.company_id, newCompany.id);
      for (const col of ['sales_account_id', 'cogs_account_id', 'inventory_account_id']) {
        assert.equal(getDb().prepare('SELECT company_id FROM accounts WHERE id = ?').get(row[col])?.company_id,
          newCompany.id, col);
      }
    });

    await test('bank accounts use the selected base currency and cannot invent an unposted opening balance', async () => {
      const path = '/payments/bank-accounts';
      const before = getDb().prepare('SELECT COUNT(*) AS n FROM bank_accounts WHERE company_id = ?').get(newCompany.id).n;
      const body = { bank_name: 'Yaoundé branch', account_number: 'BRANCH-123', account_type: 'BANK' };
      const foreign = await request('POST', path, { ...body, currency: 'USD' });
      assert.equal(foreign.status, 409);
      assert.equal(foreign.body.code, 'FOREIGN_CURRENCY_UNSUPPORTED');
      const unbalanced = await request('POST', path, { ...body, currency: 'XAF', opening_balance: 500 });
      assert.equal(unbalanced.status, 409);
      assert.equal(unbalanced.body.code, 'OPENING_BALANCE_REQUIRES_JOURNAL');
      assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM bank_accounts WHERE company_id = ?').get(newCompany.id).n, before);
      const created = await success('POST', path, body);
      const bank = getDb().prepare('SELECT * FROM bank_accounts WHERE id = ?').get(created.id);
      assert.equal(bank.currency, 'XAF');
      assert.equal(bank.current_balance, 0);
      assert.equal(bank.company_id, newCompany.id);
      assert.equal(getDb().prepare('SELECT company_id FROM accounts WHERE id = ?').get(bank.account_id).company_id, newCompany.id);
    });

    await test('new users only see their assigned company; headers and switch requests cannot grant access', async () => {
      await success('POST', '/auth/users', { username: 'branch.staff', full_name: 'Branch Staff',
        password: 'Initial-Password-2026', role: 'sales' });
      const staffToken = (await success('POST', '/auth/login', { username: 'branch.staff',
        password: 'Initial-Password-2026' }, null)).token;
      await success('POST', '/auth/change-password', {
        current_password: 'Initial-Password-2026', new_password: 'Staff-Changed-Password-2026'
      }, staffToken);
      assert.deepEqual((await success('GET', '/companies', null, staffToken)).map((c) => c.id), [newCompany.id]);
      const forbidden = await request('POST', '/auth/switch-company', { company_id: companyId }, staffToken);
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.body.code, 'COMPANY_FORBIDDEN');
      assert.equal((await request('GET', '/products', null, staffToken, { 'x-company-id': companyId })).status, 403);
    });

    await test('cross-company account references and forged restore files are rejected before mutation', async () => {
      const foreignAccount = getDb().prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?')
        .get(companyId, '4010').id;
      const invalid = await request('POST', '/products', { sku: 'CROSS-ACCOUNT', name: 'Unsafe',
        sales_account_id: foreignAccount });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.code, 'INVALID_REFERENCE');
      const backup = await success('GET', '/backup/export');
      const forged = structuredClone(backup);
      forged.data.tables.products[0].sales_account_id = foreignAccount;
      forged.checksum = require('../server/backup').checksumOf(forged.data);
      const restored = await request('POST', '/backup/import', { backup: forged,
        password: 'Only-In-Temp-Test-2026', confirm: 'RESTORE' });
      assert.equal(restored.status, 400);
      assert.equal(restored.body.code, 'BACKUP_FK_FAILED');
      assert.equal((await success('GET', '/auth/me')).company.id, newCompany.id);
      assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM journal_entries WHERE company_id = ?').get(companyId).n, origJournals);
    });

    await server.close();
    server = await startServer({ host: '127.0.0.1', port: 0 });
    base = `http://127.0.0.1:${server.port}`;
    await test('restart preserves all created records, company access, settings, and business totals', async () => {
      assert.equal((await success('GET', '/auth/me')).company.id, newCompany.id);
      assert.ok((await success('GET', '/products?search=CM-001')).some((p) => p.name === 'Separate Product'));
      assert.equal((await success('GET', '/companies')).length, 2);
      assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM journal_entries WHERE company_id = ?').get(companyId).n, origJournals);
    });
    console.log('--- CRUD WORKFLOWS PASSED ---');
  } finally {
    if (server) await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
