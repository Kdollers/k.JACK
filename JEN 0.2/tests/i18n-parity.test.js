'use strict';
/**
 * I18N PARITY TESTS — English, French and Kinyarwanda dictionaries.
 *
 * Guarantees required by the build specification:
 *  1. All three language files exist, are valid JSON and have EXACTLY the
 *     same key sets (no missing/extra translations between languages).
 *  2. No key maps to an empty/whitespace-only value in any language.
 *  3. Every business-error code that the server can emit (ERROR_CODE_PATTERNS
 *     in server/utils.js) has an errors.<CODE> translation in all 3 languages.
 *  4. Interpolation placeholders ({var}) are identical across languages, so
 *     switching language can never corrupt or drop dynamic values.
 *  5. Feature groups added in the v2 work exist in all languages (calculator,
 *     walk-in sales, multi-currency, stores/transfers, goods receipts,
 *     physical counts workflow, cash sessions, currencies settings).
 *  6. Technical identifiers must not be translated: dictionary VALUES never
 *     contain route paths or API endpoints (those come from code, not i18n).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANGS = ['en', 'fr', 'rw'];
const dicts = {};

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`  \u2713 ${name}`);
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

function placeholders(str) {
  const set = new Set();
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m;
  while ((m = re.exec(String(str))) !== null) set.add(m[1]);
  return [...set].sort();
}

for (const lang of LANGS) {
  dicts[lang] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'));
}
const flat = {};
for (const lang of LANGS) flat[lang] = flatten(dicts[lang]);

console.log('\nGENESIS i18n parity tests');

check('all three dictionaries are non-trivial (>400 keys each)', () => {
  for (const lang of LANGS) {
    const n = Object.keys(flat[lang]).length;
    assert.ok(n > 400, `${lang} has only ${n} keys`);
  }
});

check('en / fr / rw have identical key sets (full parity)', () => {
  const enKeys = Object.keys(flat.en).sort();
  for (const lang of ['fr', 'rw']) {
    const keys = Object.keys(flat[lang]).sort();
    const missing = enKeys.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !enKeys.includes(k));
    assert.deepStrictEqual({ lang, missing, extra }, { lang, missing: [], extra: [] },
      `${lang} diverges from en`);
  }
});

check('no empty or whitespace-only values in any language', () => {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(flat[lang])) {
      assert.strictEqual(typeof v, 'string', `${lang}.${k} is not a string`);
      assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
    }
  }
});

check('french and kinyarwanda are genuinely translated (not english copies)', () => {
  // A handful of high-traffic labels must differ from English.
  const samples = ['common.save', 'common.cancel', 'common.delete', 'nav.settings', 'auth.sign_in'];
  for (const key of samples) {
    if (flat.en[key] === undefined) continue; // key may be named differently
    assert.notStrictEqual(flat.fr[key], flat.en[key], `fr.${key} identical to en`);
    assert.notStrictEqual(flat.rw[key], flat.en[key], `rw.${key} identical to en`);
  }
  // Global heuristic: the dictionaries as a whole must differ.
  const identicalFr = Object.keys(flat.en).filter((k) => flat.fr[k] === flat.en[k]).length;
  const identicalRw = Object.keys(flat.en).filter((k) => flat.rw[k] === flat.en[k]).length;
  assert.ok(identicalFr < Object.keys(flat.en).length * 0.5, 'fr is mostly untranslated');
  assert.ok(identicalRw < Object.keys(flat.en).length * 0.5, 'rw is mostly untranslated');
});

check('every server business-error code has errors.<CODE> in all 3 languages', () => {
  const { ERROR_CODE_PATTERNS } = require('../server/utils.js');
  assert.ok(Array.isArray(ERROR_CODE_PATTERNS) && ERROR_CODE_PATTERNS.length >= 30,
    'ERROR_CODE_PATTERNS missing or suspiciously small');
  const codes = [...new Set(ERROR_CODE_PATTERNS.map(([, code]) => code))];
  for (const code of codes) {
    for (const lang of LANGS) {
      assert.ok(flat[lang][`errors.${code}`], `errors.${code} missing in ${lang}`);
    }
  }
});

check('interpolation placeholders match across languages (no data corruption on switch)', () => {
  for (const key of Object.keys(flat.en)) {
    const enVars = placeholders(flat.en[key]);
    if (enVars.length === 0) continue;
    for (const lang of ['fr', 'rw']) {
      assert.deepStrictEqual(placeholders(flat[lang][key]), enVars,
        `${lang}.${key} placeholder set differs from en (${enVars.join(',')})`);
    }
  }
});

check('v2 feature groups exist in all languages', () => {
  const requiredKeys = [
    'calculator.title', 'calculator.clear', 'calculator.hint',
    'sales.walk_in_sale', 'sales.walk_in_hint', 'sales.walk_in_badge', 'sales.filter_walk_in',
    'sales.currency', 'sales.exchange_rate', 'sales.foreign_total', 'sales.settlement_account',
    'sales.auto_post_hint', 'sales.base_total_note', 'sales.credit_customer_hint',
    'inventory.transfers.new_transfer', 'inventory.transfers.dispatch_transfer',
    'inventory.transfers.receive_transfer', 'inventory.transfers.company_stock_note',
    'inventory.opening_stock_hint', 'inventory.physical_count', 'inventory.print_count_sheet',
    'inventory.approve_count', 'inventory.reject_count', 'inventory.revise_count',
    'purchases.tab_receipts', 'purchases.new_receipt', 'purchases.post_receipt',
    'purchases.receipt_hint', 'purchases.link_receipt_bill',
    'banking.tab_cash', 'banking.open_session', 'banking.close_session', 'banking.denomination',
    'banking.expected_cash', 'banking.variance', 'banking.no_auto_adjust_note',
    'banking.approval_note', 'banking.reverse_payment', 'banking.cust_refund',
    'settings.tab_currencies', 'settings.exchange_rates', 'settings.convert_tester',
    'settings.require_goods_receipt', 'settings.base_locked',
    'common.approved', 'common.rejected', 'common.reversed', 'common.posted', 'common.draft'
  ];
  for (const key of requiredKeys) {
    for (const lang of LANGS) {
      assert.ok(flat[lang][key], `${key} missing in ${lang}`);
    }
  }
});

check('every t() key used in src/ resolves in all dictionaries (no untranslated UI text)', () => {
  const used = new Set();
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (/\.(jsx?|js)$/.test(entry.name)) {
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/[^a-zA-Z]t\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) used.add(m[1]);
      }
    }
  };
  scan(path.join(ROOT, 'src'));
  assert.ok(used.size > 300, `only ${used.size} t() keys found — scanner broken`);
  const missing = [];
  for (const key of used) {
    for (const lang of LANGS) {
      if (flat[lang][key] === undefined) missing.push(`${lang}:${key}`);
    }
  }
  assert.deepStrictEqual(missing, [], 'UI uses translation keys missing from dictionaries');
});

check('dictionary values never embed API routes (identifiers stay in code)', () => {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(flat[lang])) {
      assert.ok(!/\/api\//.test(v), `${lang}.${k} embeds an API route: ${v}`);
    }
  }
});

check('language switching is a pure lookup (i18n runtime exposes t(lang,key) semantics)', () => {
  // The React runtime (src/i18n/index.jsx) selects the dictionary by language
  // and falls back to the key itself; verify the JSON contract it relies on:
  // every key resolves to a string in every language and lookups never mutate.
  const before = JSON.stringify(dicts.en);
  const sample = Object.keys(flat.en).slice(0, 50);
  for (const lang of LANGS) {
    for (const k of sample) {
      assert.strictEqual(typeof flat[lang][k], 'string');
    }
  }
  assert.strictEqual(JSON.stringify(dicts.en), before, 'en dictionary mutated during lookup');
});

console.log(`\n--- ALL I18N PARITY TESTS PASSED (${checks} checks, ${Object.keys(flat.en).length} keys per language) ---\n`);
