'use strict';
/**
 * MONEY FORMATTING TESTS (Modification 2 of JENESIS 0.5.4).
 *
 * A company whose currency is written as a code used to see the code pushed
 * against the digits: "1 400,00XFA". Every screen built its own string, so the
 * same amount could read differently in a report and in an invoice.
 *
 * src/money.js is now the single place that decides, and these tests hold it
 * to the rule:
 *   - the amount and the currency are always separated by a space;
 *   - a code (XFA, RWF, USD, EUR, FCFA) goes BEHIND the amount;
 *   - a graphic sign ($, €, £, ₣) stays IN FRONT of it;
 *   - and none of it touches the number, the decimals, the stored values or
 *     any calculation.
 *
 * The numbers are compared with an explicit 'en-US' locale so the test says
 * the same thing on every machine the suite runs on.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

/** src/money.js is an ES module; the same loader the other src tests use. */
function loadMoney() {
  const source = fs.readFileSync(path.join(ROOT, 'src/money.js'), 'utf8');
  const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1]);
  // `export default` has no name to collect, so it is dropped before the rest.
  const body = source
    .replace(/export\s+default\s+[^;\n]*;?/g, '')
    .replace(/export (function|const)/g, '$1');
  vm.runInThisContext(`${body}\n;globalThis.__money = { ${names.join(', ')} };`, { filename: 'money.js' });
  const loaded = globalThis.__money;
  delete globalThis.__money;
  return loaded;
}

const money = loadMoney();
const EN = 'en-US';

console.log('--- MONEY FORMATTING TESTS (one rule, every currency) ---');

check('the amount and the currency are separated by a space', () => {
  // The exact case that was reported: XFA running into the digits.
  assert.strictEqual(money.formatMoney(1400, { symbol: 'XFA', decimals: 2, locale: EN }), '1,400.00 XFA');
  assert.notStrictEqual(money.formatMoney(1400, { symbol: 'XFA', decimals: 2, locale: EN }), 'XFA1,400.00');
  for (const code of ['XFA', 'XAF', 'RWF', 'USD', 'EUR', 'FCFA', 'Frw']) {
    const out = money.formatMoney(1400, { symbol: code, decimals: 2, locale: EN });
    assert.ok(out.includes(' '), `${code} must be separated from the amount: ${out}`);
    assert.strictEqual(out.split(' ').length, 2, `${code}: exactly one space in "${out}"`);
  }
});

check('a code goes behind the amount, a graphic sign in front of it', () => {
  assert.strictEqual(money.formatMoney(1400, { symbol: 'RWF', decimals: 2, locale: EN }), '1,400.00 RWF');
  assert.strictEqual(money.formatMoney(1400, { symbol: 'USD', decimals: 2, locale: EN }), '1,400.00 USD');
  assert.strictEqual(money.formatMoney(1400, { symbol: '$', decimals: 2, locale: EN }), '$1,400.00');
  assert.strictEqual(money.formatMoney(1400, { symbol: '€', decimals: 2, locale: EN }), '€1,400.00');
  assert.strictEqual(money.formatMoney(1400, { symbol: '£', decimals: 2, locale: EN }), '£1,400.00');
  assert.strictEqual(money.formatMoney(1400, { symbol: '₣', decimals: 2, locale: EN }), '₣1,400.00');
  assert.strictEqual(money.isGraphicSign('$'), true);
  assert.strictEqual(money.isGraphicSign('XFA'), false);
  assert.strictEqual(money.isGraphicSign('RWF'), false);
});

check('the code is used when the company configured no symbol', () => {
  assert.strictEqual(money.moneyToken({ symbol: '', code: 'RWF' }), 'RWF');
  assert.strictEqual(money.moneyToken({ symbol: '  ', code: 'RWF' }), 'RWF');
  assert.strictEqual(money.moneyToken({ symbol: 'Frw', code: 'RWF' }), 'Frw');
  assert.strictEqual(money.formatMoney(1400, { symbol: '', code: 'RWF', decimals: 2, locale: EN }), '1,400.00 RWF');
});

check('the four currencies named in the brief all read consistently', () => {
  const out = {
    XFA: money.formatMoney(1400, { symbol: 'XFA', decimals: 2, locale: EN }),
    RWF: money.formatMoney(1400, { symbol: 'RWF', decimals: 2, locale: EN }),
    USD: money.formatMoney(1400, { symbol: 'USD', decimals: 2, locale: EN }),
    EUR: money.formatMoney(1400, { symbol: 'EUR', decimals: 2, locale: EN })
  };
  for (const [code, text] of Object.entries(out)) {
    assert.ok(text.endsWith(` ${code}`), `${code} must end with the code: ${text}`);
    assert.ok(text.startsWith('1,400.00'), `${code} must keep the amount: ${text}`);
  }
});

check('display only: the number, its decimals and its value are untouched', () => {
  // Decimals are honoured exactly as configured, never rounded away.
  assert.strictEqual(money.formatMoney(1400.456, { symbol: 'RWF', decimals: 2, locale: EN }), '1,400.46 RWF');
  assert.strictEqual(money.formatMoney(1400.456, { symbol: 'RWF', decimals: 0, locale: EN }), '1,400 RWF');
  assert.strictEqual(money.formatMoney(1400.456, { symbol: 'RWF', decimals: 4, locale: EN }), '1,400.4560 RWF');
  // A negative amount keeps its sign and its value.
  assert.strictEqual(money.formatMoney(-1400, { symbol: 'RWF', decimals: 2, locale: EN }), '-1,400.00 RWF');
  // Zero and empty input never produce "NaN".
  assert.strictEqual(money.formatMoney(0, { symbol: 'RWF', decimals: 2, locale: EN }), '0.00 RWF');
  assert.strictEqual(money.formatMoney(null, { symbol: 'RWF', decimals: 2, locale: EN }), '0.00 RWF');
  assert.strictEqual(money.formatMoney(undefined, { symbol: 'RWF', decimals: 2, locale: EN }), '0.00 RWF');
  assert.strictEqual(money.formatMoney('abc', { symbol: 'RWF', decimals: 2, locale: EN }), '0.00 RWF');
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.ok(!money.formatMoney(bad, { symbol: 'RWF', decimals: 2, locale: EN }).includes('NaN'));
  }
});

check('a foreign currency follows the same rule', () => {
  assert.strictEqual(
    money.formatForeignMoney(1400, { code: 'EUR', decimals: 2 }, { locale: EN }),
    '1,400.00 EUR'
  );
  assert.strictEqual(
    money.formatForeignMoney(1400, { symbol: '$', decimals: 2 }, { locale: EN }),
    '$1,400.00'
  );
});

check('the amount can be printed alone, with no currency at all', () => {
  assert.strictEqual(money.formatAmount(1400, { decimals: 2, locale: EN }), '1,400.00');
  assert.strictEqual(money.formatAmount(1400, { decimals: 0, locale: EN }), '1,400');
});

check('no screen builds a money string by hand any more', () => {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.jsx?$/.test(entry.name)) files.push(full);
    }
  })(path.join(ROOT, 'src'));

  const offenders = [];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    // A currency glued to a number: "XFA" + amount, or amount + "XFA".
    if (/\bcurrency_symbol\b[\s\S]{0,120}\$\{/.test(code) && rel !== 'src/money.js') {
      // Allowed only inside the settings form, where the symbol is an input value.
      if (!/settings/i.test(rel) && !/SettingsView/.test(rel)) {
        offenders.push(`${rel}: builds a money string from currency_symbol`);
      }
    }
    for (const m of code.matchAll(/\}\s*\{?\s*(currency_code|currency_symbol)\s*\}?\s*</g)) {
      offenders.push(`${rel}: prints ${m[1]} next to a figure instead of using formatCurrency`);
    }
  }
  assert.deepStrictEqual(offenders, [], `money must be printed by src/money.js:\n      ${offenders.join('\n      ')}`);
});

check('the application context uses the shared function', () => {
  const context = fs.readFileSync(path.join(ROOT, 'src/context/AppContext.jsx'), 'utf8');
  assert.ok(/from '\.\.\/money'/.test(context), 'AppContext must import the shared money module');
  assert.ok(/formatMoney\(val,/.test(context), 'formatCurrency must delegate to formatMoney');
  assert.ok(!/`\$\{sym\}\$\{/.test(context), 'the old glued string must be gone');
});

console.log(`--- ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
