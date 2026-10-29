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
  assert.strictEqual(pkg.build.win.artifactName, 'JENESIS-Setup-${version}.${ext}');
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
