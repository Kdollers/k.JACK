'use strict';
// Dictionary, formatter, enum, ledger/audit, and CSV tests. Never open the
// repository database: seeded chart assertions use a disposable installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ROOT = path.join(__dirname, '..');
const languages = ['en', 'fr', 'rw'];
const catalogs = Object.fromEntries(languages.map((lang) => [lang,
  JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/${lang}.json`), 'utf8'))]));

const importSource = async (file) => import(pathToFileURL(path.join(ROOT, 'src/i18n', file)).href);
const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([key, value]) =>
  value && typeof value === 'object'
    ? flat(value, `${prefix}${key}.`)
    : [[`${prefix}${key}`, value]]);
const t = (core, lang) => (key, vars) => core.translateFromDictionaries(key, lang, catalogs, vars);
let count = 0;
function check(name, fn) {
  fn();
  console.log('  ✓ ' + name);
  count++;
}

async function main() {
  const core = await importSource('core.mjs');
  const labels = await importSource('labels.mjs');
  const ledger = await importSource('ledger-text.mjs');
  const audit = await importSource('audit-text.mjs');
  const format = await importSource('format.mjs');
  const csv = await importSource('csv.mjs');

  check('native desktop menus and startup errors cover English, French and Kinyarwanda', () => {
    const { messages, languageFor, VALID_LANGUAGES } = require('../electron/desktop-i18n.cjs');
    assert.deepEqual(VALID_LANGUAGES, languages);
    for (const lang of languages) {
      assert.deepEqual(Object.keys(messages[lang]).sort(), Object.keys(messages.en).sort());
      for (const [key, label] of Object.entries(messages[lang])) {
        assert.ok(label.trim(), `${lang}:${key}`);
      }
      assert.equal(languageFor(lang + '-RW'), lang);
    }
    assert.equal(languageFor('unknown-LATN'), 'en');
    assert.notEqual(messages.fr.backendStopped, messages.en.backendStopped);
    assert.notEqual(messages.rw.backendStopped, messages.en.backendStopped);
    for (const lang of ['fr', 'rw']) {
      assert.notEqual(messages[lang].existingDetail, messages.en.existingDetail);
      assert.notEqual(messages[lang].confirmDetail, messages.en.confirmDetail);
    }
  });

  check('all three dictionaries have identical, nonempty keys and placeholders', () => {
    const reference = new Map(flat(catalogs.en));
    for (const lang of languages) {
      const entries = new Map(flat(catalogs[lang]));
      assert.deepEqual([...entries.keys()].sort(), [...reference.keys()].sort(), lang);
      for (const [key, value] of entries) {
        assert.equal(typeof value, 'string', `${lang}:${key}`);
        assert.ok(value.trim(), `${lang}:${key}`);
        const placeholders = (text) => [...new Set(text.match(/\{\w+\}/g) || [])].sort();
        assert.deepEqual(placeholders(value), placeholders(reference.get(key)), `${lang}:${key}`);
      }
    }
    assert.ok(reference.size >= 900, 'all modules and error codes must remain covered');
  });

  check('static JSX and notification audit finds no untranslated literals', () => {
    const out = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-i18n.cjs')],
      { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /0 findings/);
  });

  check('interpolation, fallback, error selection, plurals, and live language selection', () => {
    const sample = { number: 'INV-42' };
    assert.match(t(core, 'fr')('sales.invoice_posted_notice', sample), /INV-42/);
    assert.notEqual(t(core, 'fr')('auth.sign_in'), t(core, 'en')('auth.sign_in'));
    assert.notEqual(t(core, 'rw')('auth.sign_in'), t(core, 'en')('auth.sign_in'));
    assert.equal(core.pluralCategory('en', 1), 'one');
    assert.equal(core.pluralCategory('en', 2), 'other');
    assert.equal(core.pluralCategory('rw', 1), 'one');
    assert.equal(core.pluralCategory('rw', 2), 'other');
    for (const lang of languages) {
      const one = t(core, lang)(`inventory.product_count.${core.pluralCategory(lang, 1)}`, { count: 1 });
      const many = t(core, lang)(`inventory.product_count.${core.pluralCategory(lang, 2)}`, { count: 2 });
      assert.notEqual(one, many, `${lang} plural form`);
      assert.ok(!many.includes('{count}'));
    }
    assert.equal(core.errorKeyFor({ code: 'INVALID_CREDENTIALS' }, catalogs.en), 'errors.INVALID_CREDENTIALS');
    assert.equal(core.errorKeyFor(new TypeError('fetch failed'), catalogs.en), 'errors.NETWORK');
    assert.equal(core.errorKeyFor({ code: 'SQLITE_SECRET' }, catalogs.en), 'errors.GENERIC');
    assert.equal(t(core, 'fr')('not.a.real.key'), catalogs.en.errors.GENERIC);
  });

  check('all dynamic code/ledger/audit keys exist in every language', () => {
    for (const lang of languages) {
      const all = new Map(flat(catalogs[lang]));
      for (const key of Object.values(labels.ENUM_KEYS).concat(ledger.LEDGER_KEYS, audit.AUDIT_KEYS)) {
        assert.ok(all.get(key)?.trim(), `${lang}:${key}`);
      }
    }
  });

  check('seeded names translate only when the underlying names are untouched', () => {
    const fr = t(core, 'fr');
    const rw = t(core, 'rw');
    const account = { code: '1100', name: labels.DEFAULT_ACCOUNT_NAMES['1100'] };
    assert.equal(labels.accountLabel(account, fr), fr('chart.1100'));
    assert.equal(labels.accountLabel(account, rw), rw('chart.1100'));
    assert.equal(labels.accountLabel({ ...account, name: 'My custom A/R' }, fr), 'My custom A/R');
    assert.equal(labels.labelFor('PARTIALLY_PAID', fr), fr('common.partially_paid'));
    assert.equal(labels.labelFor('admin', rw), rw('settings.role_admin'));
    assert.equal(labels.moduleLabel('INVENTORY', rw), rw('nav.inventory'));
    assert.equal(labels.labelFor('INVENTORY', rw), rw('enums.subtype_inventory'));
    assert.equal(labels.taxLabel({ code: 'VAT18', name: 'Standard VAT 18%' }, fr), fr('seed_tax.VAT18'));
    assert.equal(labels.taxLabel({ code: 'VAT18', name: 'Custom Tax' }, fr), 'Custom Tax');
    const seededBank = { account_number: 'BANK-MAIN', bank_name: 'Main Bank Account' };
    assert.equal(labels.bankLabel(seededBank, rw), rw('seed_bank.BANK-MAIN'));
    assert.equal(labels.bankNumberLabel(seededBank, rw), rw('banking.placeholder_account_number'));
    assert.equal(labels.bankNumberLabel({ account_number: 'verified-123', bank_name: 'My Bank' }, rw), 'verified-123');
  });

  check('view-only chart catalog matches a newly seeded temporary installation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-i18n-chart-'));
    const dbFile = path.join(dir, 'genesis.db');
    // Database paths are read by server/db at require time. This process has
    // never required it before, and its path points exclusively to this temp dir.
    process.env.GENESIS_DB_PATH = dbFile;
    const { getDb, closeDb } = require('../server/db');
    try {
      const db = getDb();
      const rows = db.prepare('SELECT code, name FROM accounts ORDER BY code').all();
      assert.ok(rows.length > 20);
      assert.equal(rows.length, Object.keys(labels.DEFAULT_ACCOUNT_NAMES).length);
      for (const row of rows) {
        assert.equal(labels.DEFAULT_ACCOUNT_NAMES[row.code], row.name, row.code);
        for (const lang of languages) assert.ok(new Map(flat(catalogs[lang])).get(`chart.${row.code}`));
      }
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
    } finally {
      closeDb();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  check('known ledger/audit templates translate; personal memos and originals remain intact', () => {
    const fr = t(core, 'fr');
    const rw = t(core, 'rw');
    const template = 'Sales Invoice #INV-42 - Acme & Co';
    assert.equal(ledger.translateLedgerText(template, 'SALES_INVOICE', rw), rw('ledger.sales_invoice', { number: 'INV-42', party: 'Acme & Co' }));
    assert.equal(ledger.translateLedgerText(template, 'MANUAL', fr), template);
    assert.match(ledger.translateLedgerText('Reversal of: Sales Revenue: Inv #INV-42', 'REVERSAL', fr), /INV-42/);
    assert.equal(ledger.translateLedgerText('A customer typed this note', 'SALES_INVOICE', fr), 'A customer typed this note');
    const event = { module: 'SALES', action: 'POST', record_id: 'id-42', description: 'Posted Sales Invoice INV-42 for customer Acme ($1234.56)' };
    const localized = audit.auditDescription(event, rw, (n) => format.formatMoney(n, { currency_code: 'USD', currency_symbol: '$' }, 'rw'));
    assert.match(localized, /INV-42/);
    assert.match(localized, /Acme/);
    assert.ok(!localized.includes('Posted Sales Invoice'));
    assert.equal(event.description, 'Posted Sales Invoice INV-42 for customer Acme ($1234.56)', 'never mutate audit evidence');
    const unknown = audit.auditDescription({ module: 'INVENTORY', action: 'POST', record_id: 'X', description: 'an unrecognized legacy log' }, fr, String);
    assert.equal(unknown, fr('audit.other_event', { action: labels.labelFor('POST', fr), module: fr('nav.inventory'), record: 'X' }));
  });

  check('locale formatting changes presentation without changing amount or currency', () => {
    const value = 1234.56;
    const config = { currency_code: 'USD', currency_symbol: '$', currency_decimals: 2 };
    const fr = format.formatMoney(value, config, 'fr');
    const en = format.formatMoney(value, config, 'en');
    const rw = format.formatMoney(value, config, 'rw');
    for (const result of [fr, en, rw]) assert.ok(result.includes('$'), result);
    assert.notEqual(fr, en);
    assert.notEqual(fr, rw);
    assert.equal(value, 1234.56);
    assert.equal(config.currency_code, 'USD');
    assert.notEqual(format.formatDate('2026-10-16', 'en'), format.formatDate('2026-10-16', 'fr'));
    assert.match(format.inputDate(new Date(2026, 9, 16)), /^2026-10-16$/);
    assert.match(format.formatPercent(18.5, 'fr', 1), /18,5/);
  });

  check('CSV escapes delimiters/formulas and preserves numeric data', () => {
    const exportText = csv.serializeCsv([[t(core, 'rw')('common.account_name'), t(core, 'rw')('common.amount')],
      ['=2+2, "quoted"', 1234.56], ['Alice\nBob', -100.25]]);
    assert.ok(exportText.startsWith('\uFEFF'));
    assert.match(exportText, /"'=2\+2, ""quoted"""/);
    assert.match(exportText, /"1234\.56"/);
    assert.match(exportText, /"-100\.25"/);
    assert.match(exportText, /"Alice\nBob"/);
    assert.ok(!exportText.includes('Account Name'));
  });
  console.log(`--- ${count} I18N CHECKS PASSED ---`);
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
