'use strict';
/**
 * Branding and identity tests for the consolidated JENESIS application.
 *
 * The product was renamed GENESIS -> JENESIS in JAN 0.3. These checks make sure
 * the rename is complete in everything a user can see (window title, installer,
 * shortcuts, in-app strings, documentation) while the internal identifiers that
 * must NOT change (the shell/backend handshake id, the database file name and
 * the GENESIS_* environment variables) stay exactly as they are.
 *
 * A second group of checks catches the class of bug found during the merge: the
 * Windows build/smoke scripts still looked for GENESIS.exe and
 * %APPDATA%\GENESIS, which would have failed against a JENESIS build.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walk(dir, extensions) {
  const out = [];
  const abs = path.join(ROOT, dir);
  (function descend(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        descend(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        out.push(path.relative(ROOT, full));
      }
    }
  })(abs);
  return out;
}

// ---------------------------------------------------------------------------
// 1. Product identity
// ---------------------------------------------------------------------------
test('the product is called JENESIS everywhere a user can see it', () => {
  assert.strictEqual(pkg.productName, 'JENESIS');
  assert.strictEqual(pkg.build.productName, 'JENESIS');
  assert.strictEqual(pkg.build.appId, 'com.jenesis.accounting');
  assert.strictEqual(pkg.build.copyright, 'Copyright (c) JENESIS');
  assert.strictEqual(pkg.author, 'JENESIS');
  assert.strictEqual(pkg.description, 'JENESIS - Professional Business Accounting & Management Software');
  // The installer file is named after the release: "JEN 0.5 Setup.exe".
  assert.ok(
    /^JEN \d+\.\d+ Setup\.\$\{ext\}$/.test(pkg.build.win.artifactName),
    `the installer file must be named "JEN <release> Setup.exe" (found ${pkg.build.win.artifactName})`
  );
  assert.ok(
    pkg.build.win.artifactName.includes(pkg.version.split('.').slice(0, 2).join('.')),
    `the installer name (${pkg.build.win.artifactName}) and the version (${pkg.version}) must agree`
  );
  assert.strictEqual(pkg.build.nsis.shortcutName, 'JENESIS');
  assert.strictEqual(pkg.build.nsis.uninstallDisplayName, 'JENESIS');
});

test('the internal identifiers that must not change are preserved', () => {
  // The desktop shell recognises its backend through this id; changing it would
  // break the handshake for existing installations.
  assert.strictEqual(pkg.name, 'genesis-accounting');
  assert.ok(/'genesis-accounting'|genesis-accounting/.test(read('electron/backend-manager.cjs')),
    'the shell/backend handshake id must remain genesis-accounting');
  assert.ok(read('server/routes/api.js').includes('genesis-accounting') ||
    read('server/index.js').includes('genesis-accounting'),
    'the backend must still advertise genesis-accounting on /api/health');
  assert.ok(read('server/db.js').includes("process.env.GENESIS_DB_PATH"), 'GENESIS_DB_PATH must still be honoured');
});

test('the browser tab and the packaged UI are titled JENESIS', () => {
  for (const file of ['index.html', 'dist/index.html']) {
    const html = read(file);
    assert.ok(/<title>JENESIS\b/.test(html), `${file} must be titled JENESIS (found: ${html.match(/<title>[^<]*/)})`);
  }
});

test('the desktop shell shows the JENESIS name and keeps user data outside the install folder', () => {
  const main = read('electron/main.cjs');
  assert.ok(/APP_TITLE\s*=\s*'JENESIS'/.test(main), 'the window title must be JENESIS');
  assert.ok(main.includes('prepared.migration'), 'the shell must handle the legacy data directory migration');
  const dataLocation = read('electron/data-location.cjs');
  assert.ok(dataLocation.includes("LEGACY_APP_DIR_NAME = 'GENESIS'"),
    'the legacy GENESIS folder must still be recognised for upgrades');
  assert.ok(!/deleteAppDataOnUninstall\s*:\s*true/.test(read('package.json')),
    'uninstalling must never delete user data');
});

// ---------------------------------------------------------------------------
// 2. No stale GENESIS branding in user-facing code
// ---------------------------------------------------------------------------
const ALLOWED_PATTERNS = [
  /GENESIS_[A-Z_]+/,              // environment variables (GENESIS_DB_PATH, GENESIS_PORT, ...)
  /genesis\.db/,                  // the database file name is intentionally unchanged
  /genesis-accounting/,           // handshake id
  /genesis:get-app-info/,         // IPC channel
  /genesis-\d{8}-\d{6}/,          // launch backup file prefix
  /LEGACY_APP_DIR_NAME/,          // the legacy folder constant
  /older GENESIS|previous brand|branded GENESIS|GENESIS before|GENESIS build|GENESIS installation|GENESIS user data/
];

function isComment(line) {
  return /^\s*(\/\/|\*|\/\*|#|<!--)/.test(line) || /^\s*\*/.test(line);
}

test('no user-facing code or script still refers to GENESIS', () => {
  const files = [
    ...walk('server', ['.js']),
    ...walk('src', ['.js', '.jsx', '.json']),
    ...walk('electron', ['.cjs']),
    'scripts/build-windows.ps1',
    'scripts/smoke-test-installed.ps1',
    'scripts/verify-package.cjs'
  ];
  const offenders = [];
  for (const rel of files) {
    read(rel).split(/\r?\n/).forEach((line, index) => {
      if (!line.includes('GENESIS')) return;
      if (isComment(line)) return;
      if (ALLOWED_PATTERNS.some((re) => re.test(line))) return;
      offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepStrictEqual(offenders, [], `stale GENESIS references:\n${offenders.join('\n')}`);
});

test('the Windows scripts follow the product name instead of hard-coding it', () => {
  const smoke = read('scripts/smoke-test-installed.ps1');
  assert.ok(/\$AppName\s*=\s*'JENESIS'/.test(smoke), 'the smoke test must default to the JENESIS brand');
  assert.ok(!/'GENESIS\.exe'|GENESIS-Setup|Uninstall GENESIS\.exe/.test(smoke),
    'the smoke test must not hard-code GENESIS file names');
  assert.ok(/Join-Path \$InstallDir "\$AppName\.exe"/.test(smoke), 'the executable path must follow $AppName');
  assert.ok(/Join-Path \$env:APPDATA \$AppName/.test(smoke), 'the data directory must follow $AppName');

  const build = read('scripts/build-windows.ps1');
  assert.ok(/\$AppName = \$pkg\.build\.productName/.test(build), 'the build script must read the product name');
  assert.ok(!/'GENESIS-Setup/.test(build), 'the build script must not hard-code the installer name');

  const verify = read('scripts/verify-package.cjs');
  assert.ok(/productName\(\)/.test(verify) && /\$\{appName\}\.exe/.test(verify),
    'the package verifier must check <productName>.exe');
});

test('the legacy GENESIS data directory is adopted, not ignored', () => {
  const dataLocation = read('electron/data-location.cjs');
  assert.ok(dataLocation.includes('migrateLegacyDatabase'), 'the migration helper must exist');
  assert.ok(dataLocation.includes('COPYFILE_EXCL'), 'the copy must never overwrite an existing database');
  assert.ok(/fs\.copyFileSync\(sourcePath, dbPath/.test(dataLocation), 'the legacy database is copied');
  assert.ok(!/renameSync|unlinkSync\(sourcePath/.test(dataLocation), 'the legacy database is never moved or deleted');
});

// ---------------------------------------------------------------------------
// 3. Languages
// ---------------------------------------------------------------------------
function flat(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flat(v, `${prefix}${k}.`));
    else out[prefix + k] = v;
  }
  return out;
}

test('English, French and Kinyarwanda dictionaries are complete and in parity', () => {
  const dicts = {};
  for (const lang of ['en', 'fr', 'rw']) {
    dicts[lang] = flat(JSON.parse(read(path.join('src', 'i18n', `${lang}.json`))));
  }
  const en = Object.keys(dicts.en);
  assert.ok(en.length >= 650, `expected at least 650 keys, found ${en.length}`);
  for (const lang of ['fr', 'rw']) {
    const keys = Object.keys(dicts[lang]);
    assert.deepStrictEqual(keys.slice().sort(), en.slice().sort(), `${lang} keys differ from English`);
    const empty = keys.filter((k) => dicts[lang][k] === '' || dicts[lang][k] === null);
    assert.deepStrictEqual(empty, [], `${lang} has empty translations: ${empty.join(', ')}`);
    const english = keys.filter((k) => /[A-Za-z]{4}/.test(String(dicts[lang][k])) && dicts[lang][k] === dicts.en[k]);
    // Proper nouns, codes and numbers may legitimately match; assert the share is small.
    assert.ok(english.length < en.length * 0.2, `${lang} looks like a copy of English (${english.length} identical values)`);
  }
});

test('the revaluation feature is translated in all three languages', () => {
  const dicts = {};
  for (const lang of ['en', 'fr', 'rw']) dicts[lang] = flat(JSON.parse(read(path.join('src', 'i18n', `${lang}.json`))));
  const required = [
    'settings.fx_revaluation',
    'settings.fx_revaluation_hint',
    'settings.run_revaluation',
    'settings.revaluation_history',
    'settings.no_revaluations',
    'settings.reval_gain',
    'settings.reval_loss',
    'settings.reval_docs',
    'errors.FX_REVALUATION_EXISTS',
    'errors.NO_FX_EXPOSURE'
  ];
  for (const key of required) {
    for (const lang of ['en', 'fr', 'rw']) {
      assert.ok(dicts[lang][key], `${lang} is missing ${key}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4. The mark itself: a J, never a G
// ---------------------------------------------------------------------------
test('no screen, document or report draws the old G mark', () => {
  const offenders = [];
  for (const rel of walk('src', ['.jsx', '.js'])) {
    const source = read(rel);
    // A letter on its own line inside a block: the way the old badge was drawn.
    const re = />\s*G\s*</g;
    let m;
    while ((m = re.exec(source))) {
      const line = source.slice(0, m.index).split('\n').length;
      offenders.push(`${rel}:${line}`);
    }
    // The old badge was a blue square with a G in it.
    if (/rounded bg-blue-600[^\n]*\n\s*G\s*\n/.test(source)) offenders.push(`${rel}: blue G badge`);
  }
  assert.deepStrictEqual(offenders, [], `old G marks found:\n${offenders.join('\n')}`);
});

test('printed documents, report letterheads and PDFs carry the JENESIS mark', () => {
  const invoice = read('src/components/InvoicePrintModal.jsx');
  assert.ok(invoice.includes('<JenesisLogo'), 'the invoice/bill print preview must show the JENESIS logo');
  assert.ok(/JenesisLogo tone=\{markTone\}/.test(invoice), 'it uses the colour of the application');
  const reports = read('src/views/ReportsView.jsx');
  assert.ok(reports.includes('<JenesisLogo'), 'reports must print on a JENESIS letterhead');
  // The mark is the same J everywhere: one geometry, generated by make_logo.py.
  const logo = read('src/components/JenesisLogo.jsx');
  const svg = read('public/favicon.svg');
  for (const shape of [/JENESIS_MARK_PATH\s*=\s*'([^']+)'/.exec(logo)[1]]) {
    assert.ok(svg.includes(shape), 'the interface mark and the icon file are the same shape');
  }
  const logoCode = logo
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
    .replace(/GENESIS|SVG|ARGV/g, '');
  assert.ok(!/\bG\b/.test(logoCode), 'the logo component must not draw the old letter');
});

test('no user-facing string still says Genesis (compatibility paths excepted)', () => {
  // These identifiers are deliberately unchanged: renaming them would log
  // users out, reset their language or break the desktop handshake.
  const COMPATIBILITY = [
    /GENESIS_[A-Z_]+/,        // environment variables (GENESIS_DB_PATH, GENESIS_PORT, …)
    /genesis\.db/,            // the database file name is intentionally unchanged
    /genesis-accounting/,     // shell/backend handshake id
    /genesis:\w/,            // IPC channels (genesis:get-app-info)
    /genesis-\d{8}-\d{6}/,   // launch backup file prefix
    /genesis_lang/,           // saved language (JEN 0.2 storage key)
    /genesis_session_token/,  // saved session (JEN 0.2 storage key)
    /comp-genesis-01/,        // id of the company created with the database
    /genesis-backup-/,        // backup file name understood by older builds
    /genesis-\$\{/,           // backup file name template
    /genesis-\\d/,           // backup file name pattern
    /genesisVersion/,         // field name inside backup files: older backups must restore
    /genesis_salt_2026/,      // password-hash salt: changing it would invalidate every password
    /LEGACY_APP_DIR_NAME/,    // the %APPDATA%\\GENESIS folder adopted on upgrade
    /genesisDesktop/,         // the desktop bridge object (preload contract)
    /GENESIS before|older GENESIS|previous brand|branded GENESIS|GENESIS build|GENESIS installation|GENESIS user data|GENESIS folder/
  ];
  const offenders = [];
  for (const rel of [
    ...walk('src', ['.js', '.jsx', '.json']),
    ...walk('server', ['.js']),
    ...walk('electron', ['.cjs'])
  ]) {
    read(rel).split(/\r?\n/).forEach((line, index) => {
      if (!/genesis/i.test(line)) return;
      if (line.includes('JENESIS') || line.includes('jenesis')) return;
      if (/^\s*(\/\/|\*|\/\*|#)/.test(line)) return;
      if (COMPATIBILITY.some((re) => re.test(line))) return;
      offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepStrictEqual(offenders, [], `stale Genesis references:\n${offenders.join('\n')}`);
});

// ---------------------------------------------------------------------------
(async () => {
  console.log('--- BRANDING / IDENTITY TESTS ---');
  for (const { name, fn } of pending) {
    try {
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      failed++;
      console.log(`  \u2717 ${name}\n      ${err.message}`);
    }
  }
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
})();
