'use strict';
// Joined display fields support localized account labels without changing
// transaction amounts or underlying journal entries. Uses a temporary DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-payments-test-'));
process.env.GENESIS_DB_PATH = path.join(dir, 'genesis.db');
const { startServer } = require('../server/index');
const { getDb } = require('../server/db');

async function main() {
  let server;
  try {
    server = await startServer({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${server.port}`;
    const post = async (route, data, token) => {
      const result = await fetch(base + route, { method: 'POST', headers: {
        'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {})
      }, body: JSON.stringify(data) });
      const body = await result.json();
      assert.equal(result.status, 200, `${route} ${result.status}: ${JSON.stringify(body)}`);
      return body;
    };
    await post('/api/setup/initialize', { company_name: 'Payment Test',
      full_name: 'Payment Test Admin', username: 'payment.admin',
      password: 'Payment-Test-Password-1', confirm_password: 'Payment-Test-Password-1' });
    const { token } = await post('/api/auth/login',
      { username: 'payment.admin', password: 'Payment-Test-Password-1' });
    assert.ok(token);
    const values = [
      { paymentType: 'DIRECT_EXPENSE', expenseAccountId: 'acc-6020', bankAccountId: 'bank-02', paymentMethod: 'CASH', amount: 10.23 },
      { paymentType: 'DIRECT_INCOME', incomeAccountId: 'acc-4500', bankAccountId: 'bank-01', paymentMethod: 'BANK_TRANSFER', amount: 234.56 }
    ];
    const entries = [];
    for (const item of values) entries.push(await post('/api/payments',
      { ...item, date: '2026-10-16', notes: 'Record this exactly as entered' }, token));
    const reply = await fetch(base + '/api/payments', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(reply.status, 200);
    const payments = await reply.json();
    assert.equal(payments.length, 2);
    const expense = payments.find((p) => p.id === entries[0].paymentId);
    const income = payments.find((p) => p.id === entries[1].paymentId);
    assert.equal(expense.expense_account_name, 'Office Rent Expense');
    assert.equal(expense.expense_account_code, '6020');
    assert.equal(expense.bank_name, 'Cash Register');
    assert.equal(expense.bank_account_number, 'CASH-MAIN');
    assert.equal(expense.income_account_name, null);
    assert.equal(income.income_account_name, 'Other Income & Interest');
    assert.equal(income.income_account_code, '4500');
    assert.equal(income.bank_name, 'Main Bank Account');
    assert.equal(income.expense_account_name, null);
    assert.deepEqual([expense.amount, income.amount], [10.23, 234.56]);
    assert.equal(expense.notes, 'Record this exactly as entered');
    for (const item of payments) {
      const stored = getDb().prepare('SELECT * FROM payments WHERE id = ?').get(item.id);
      assert.equal(item.amount, stored.amount);
      assert.equal(item.journal_entry_id, stored.journal_entry_id);
    }
    console.log('  ✓ payments endpoint supplies bank and category display fields with unchanged amounts and journal links');
  } finally {
    if (server) await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
