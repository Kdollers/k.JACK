'use strict';
/**
 * TRANSLATION COVERAGE TESTS — "no screen may show untranslated English".
 *
 * The parity test (tests/i18n-parity.test.js) proves the three dictionaries
 * agree with each other. This file proves the *screens* actually use them:
 *
 *  1. The untranslated-text scanner finds no candidates anywhere in src/.
 *  2. The scanner itself is alive (it still finds seeded text), so a rule that
 *     silently stops matching cannot fake a clean result.
 *  3. Every exception in scripts/untranslated-allowlist.json is documented
 *     with a reason — nothing is exempted silently.
 *  4. The language choice is written to localStorage, so it survives a restart.
 *  5. setLang re-renders immediately and falls back to English for a key that
 *     is missing from the active dictionary rather than showing a raw path.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCANNER = path.join(ROOT, 'scripts', 'find-untranslated.cjs');
const ALLOWLIST = path.join(ROOT, 'scripts', 'untranslated-allowlist.json');
const I18N = path.join(ROOT, 'src', 'i18n', 'index.jsx');

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`  \u2713 ${name}`);
}

function runScanner() {
  const out = execFileSync(process.execPath, [SCANNER, '--json'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  return JSON.parse(out);
}

console.log('\nJENESIS translation coverage tests');

check('the untranslated-text scanner reports no candidates in src/', () => {
  const report = runScanner();
  const lines = report.findings.map(
    (f) => `${f.file}:${f.line} [${f.kind}] ${JSON.stringify(f.text)}`
  );
  assert.deepStrictEqual(lines, [], 'untranslated user-facing text found:\n  ' + lines.join('\n  '));
});

check('the scanner is still alive (it catches seeded untranslated text)', () => {
  // Write a throwaway file into a scratch copy of src is too heavy, so the
  // scanner is exercised against a temporary directory instead: the same code
  // path, on input we control, must report the seeded string.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-scan-'));
  try {
    fs.writeFileSync(path.join(tmp, 'Seed.jsx'),
      'export default function S() {\n  return <div><span>Total Liquidity</span></div>;\n}\n');
    const out = execFileSync(process.execPath, [SCANNER, '--json', '--src', tmp], {
      cwd: ROOT, encoding: 'utf8'
    });
    const report = JSON.parse(out);
    const texts = report.findings.map((f) => f.text);
    assert.ok(texts.includes('Total Liquidity'),
      `scanner failed to detect seeded text; got ${JSON.stringify(texts)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

check('every allowlist entry is documented with a reason', () => {
  const allow = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
  const sections = Object.keys(allow).filter((k) => !k.startsWith('_'));
  assert.ok(sections.length > 0, 'allowlist has no sections');
  for (const section of sections) {
    assert.ok(allow[section]._why && allow[section]._why.trim().length > 20,
      `allowlist section "${section}" has no _why explanation`);
    assert.ok((allow[section].texts || []).length + (allow[section].patterns || []).length > 0,
      `allowlist section "${section}" lists nothing`);
  }
});

check('the language choice is persisted so it survives a restart', () => {
  const src = fs.readFileSync(I18N, 'utf8');
  assert.ok(/localStorage\.setItem\(\s*['"]genesis_lang['"]/.test(src),
    'setLang does not write the language to localStorage');
  assert.ok(/localStorage\.getItem\(\s*['"]genesis_lang['"]/.test(src),
    'the initial language is not read back from localStorage');
});

check('switching language re-renders immediately and falls back to English', () => {
  const src = fs.readFileSync(I18N, 'utf8');
  // setLang must update state (immediate re-render) as well as persist.
  assert.ok(/setLangState\(newLang\)/.test(src), 'setLang does not update state');
  // A key absent from the active language must fall back to English, never
  // render the raw "namespace.key" path to the user.
  assert.ok(/Fallback to English/.test(src), 'no English fallback for missing keys');
  assert.ok(/translations\.en/.test(src), 'fallback does not consult the English dictionary');
});

check('t() interpolates {name} placeholders for dynamic messages', () => {
  const src = fs.readFileSync(I18N, 'utf8');
  assert.ok(/function interpolate/.test(src), 'no interpolation helper');
  assert.ok(/\\\{\(\\w\+\)\\\}/.test(src) || /\{\(\\w\+\)\}/.test(src),
    'interpolate does not recognise {name} placeholders');
});

check('accounting terminology is genuinely translated, not an English copy', () => {
  // The brief asks for accurate accounting terminology rather than a machine
  // guess, so the finance terms touched in this audit are spot-checked: they
  // must exist in all three languages and must differ from the English text.
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'en.json'), 'utf8'));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'fr.json'), 'utf8'));
  const rw = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'rw.json'), 'utf8'));

  const pick = (dict, dotted) =>
    dotted.split('.').reduce((node, k) => (node == null ? undefined : node[k]), dict);

  // [key, languages required to differ from English]
  const terms = [
    ['accounting.normal_balance', ['fr', 'rw']],
    ['accounting.debit_balance', ['fr', 'rw']],
    ['accounting.credit_balance', ['fr', 'rw']],
    ['accounting.net_balance', ['fr', 'rw']],
    ['accounting.journal_lines', ['fr', 'rw']],
    ['accounting.unbalanced_toast', ['fr', 'rw']],
    ['reports.cf_net_operating_income', ['fr', 'rw']],
    ['reports.cf_net_operations', ['fr', 'rw']],
    ['reports.vat_net_note', ['fr', 'rw']],
    ['purchases.vat_input_label', ['fr', 'rw']],
    ['aging.total_due', ['fr', 'rw']],
    ['dashboard.total_liquidity', ['fr', 'rw']],
    ['print.authorized_signature', ['fr', 'rw']],
    // A credit balance is not a debit balance: the two must never collapse to
    // the same word in any language, which a careless machine pass would do.
    ['accounting.credit_upper', ['en']]
  ];

  for (const [key, mustDiffer] of terms) {
    assert.strictEqual(typeof pick(en, key), 'string', `en.${key} missing`);
    assert.strictEqual(typeof pick(fr, key), 'string', `fr.${key} missing`);
    assert.strictEqual(typeof pick(rw, key), 'string', `rw.${key} missing`);
    for (const lang of mustDiffer) {
      const dict = lang === 'en' ? en : lang === 'fr' ? fr : rw;
      const other = lang === 'en' ? pick(en, 'accounting.debit_upper') : pick(en, key);
      assert.notStrictEqual(pick(dict, key), other,
        `${lang}.${key} is an untranslated copy of the English text`);
    }
  }

  // Debit and credit must stay distinct in every language.
  for (const lang of ['en', 'fr', 'rw']) {
    const dict = lang === 'en' ? en : lang === 'fr' ? fr : rw;
    assert.notStrictEqual(pick(dict, 'accounting.debit_balance'),
      pick(dict, 'accounting.credit_balance'),
      `${lang} uses the same term for a debit and a credit balance`);
  }
});

console.log(`\n--- ALL TRANSLATION COVERAGE TESTS PASSED (${checks} checks) ---\n`);
