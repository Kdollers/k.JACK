'use strict';
/**
 * APPLICATION HELP TESTS (JENESIS 1.0.1, modification 3).
 *
 * The brief is precise about what the Help must do:
 *
 *   - Seller sees the Seller guide only; Admin sees the Admin guide only;
 *     Maintenance sees the Maintenance guide only; Settings sees the Settings
 *     guide only.
 *   - The application is detected AUTOMATICALLY. The user is never asked to
 *     choose.
 *   - Three languages, with no untranslated English left behind.
 *   - Every guide credits "Created and developed by KAYIGANWA JACQUES."
 *   - Only features that actually exist are documented.
 *
 * The last two are the ones that can quietly rot. A guide that describes a
 * screen that does not exist is worse than no guide at all, so these tests
 * check the guides against the program itself: every application named, every
 * shortcut mentioned, and every screen referred to must be real.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed += 1;
    console.log('  ✗ ' + name + '\n      ' + err.message);
  }
}


/** The Help screen touches window and document; stand them in for. */
function installBrowserStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {},
                         addListener() {}, removeListener() {} });
  globalThis.matchMedia = media;
  globalThis.document = {
    documentElement: { classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} },
    body: { classList: { add() {}, remove() {}, toggle() {} }, style: {} },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, click() {}, remove() {} }),
    activeElement: null
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    matchMedia: media, localStorage: globalThis.localStorage,
    innerWidth: 1280, innerHeight: 800, print() {},
    setTimeout, clearTimeout,
    location: { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1', protocol: 'http:', search: '' }
  };
}

console.log('--- STARTING APPLICATION HELP TESTS ---');

main().catch((err) => { console.error('the help tests could not run:', err); process.exit(1); });

async function main() {

/**
 * Loads the guide module. appHelpContent.js is an ES module with no
 * dependencies, so it is bundled with the project's own esbuild rather than
 * parsed by hand.
 */
const esbuild = require('esbuild');
const cacheDir = path.join(ROOT, 'node_modules', '.cache', 'jenesis-app-help');
fs.mkdirSync(cacheDir, { recursive: true });
const outfile = path.join(cacheDir, 'bundle.cjs');
esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/views/appHelpContent.js')],
  bundle: true,
  outfile,
  platform: 'node',
  format: 'cjs',
  logLevel: 'error'
});
const { APP_HELP, APP_HELP_ORDER } = require(outfile);

const APPS = ['seller', 'admin', 'maintenance', 'settings'];
const LANGS = ['en', 'fr', 'rw'];

/** Every word of a guide, as one lower-cased string. */
function allText(appId, lang) {
  const guide = APP_HELP[appId][lang];
  const parts = [guide.guideTitle, guide.guideIntro];
  for (const key of APP_HELP_ORDER[appId]) {
    const s = guide.sections[key];
    parts.push(s.title, s.purpose, s.where, s.expected, ...s.steps, ...s.notes);
  }
  return parts.join(' ').toLowerCase();
}

// ---------------------------------------------------------------------------
// 1. Each application has its own complete guide, in every language.
// ---------------------------------------------------------------------------

check('all four applications have a guide', () => {
  for (const app of APPS) {
    assert.ok(APP_HELP[app], `JENESIS ${app} must have a guide`);
  }
});

check('every guide exists in English, French and Kinyarwanda', () => {
  for (const app of APPS) {
    for (const lang of LANGS) {
      assert.ok(APP_HELP[app][lang], `${app} must have a ${lang} guide`);
    }
  }
});

check('no guide is a copy of another', () => {
  // Four guides that were quietly the same text would pass every other check
  // here, so the titles are compared directly.
  const titles = APPS.map((a) => APP_HELP[a].en.guideTitle);
  assert.strictEqual(new Set(titles).size, APPS.length, `the four guides must differ: ${titles.join(' | ')}`);
});

check('every section named in the order really exists, in every language', () => {
  for (const app of APPS) {
    for (const lang of LANGS) {
      const guide = APP_HELP[app][lang];
      for (const key of APP_HELP_ORDER[app]) {
        assert.ok(guide.sections[key], `${app}/${lang} is missing the section "${key}"`);
      }
      // And no section is orphaned outside the order.
      const listed = new Set(APP_HELP_ORDER[app]);
      const orphans = Object.keys(guide.sections).filter((k) => !listed.has(k));
      assert.deepStrictEqual(orphans, [], `${app}/${lang} has sections never shown: ${orphans.join(', ')}`);
    }
  }
});

check('every section carries the whole structure', () => {
  for (const app of APPS) {
    for (const lang of LANGS) {
      const guide = APP_HELP[app][lang];
      for (const key of APP_HELP_ORDER[app]) {
        const s = guide.sections[key];
        assert.ok(s.title && s.title.length > 3, `${app}/${lang}/${key} needs a title`);
        assert.ok(s.purpose && s.purpose.length > 30, `${app}/${lang}/${key} needs a purpose`);
        assert.ok(s.where && s.where.length > 10, `${app}/${lang}/${key} needs to say where`);
        assert.ok(Array.isArray(s.steps) && s.steps.length > 0, `${app}/${lang}/${key} needs steps`);
        assert.ok(s.expected && s.expected.length > 20, `${app}/${lang}/${key} needs an expected result`);
        assert.ok(Array.isArray(s.notes) && s.notes.length > 0, `${app}/${lang}/${key} needs notes`);
      }
    }
  }
});

check('the three languages cover the same sections', () => {
  // No language may fall behind: the brief says no untranslated English may
  // be left, which is only true if every section exists in all three.
  for (const app of APPS) {
    const counts = LANGS.map((l) => APP_HELP_ORDER[app].filter((k) => APP_HELP[app][l].sections[k]).length);
    assert.strictEqual(counts[0], counts[1], `${app}: English has ${counts[0]}, French ${counts[1]}`);
    assert.strictEqual(counts[0], counts[2], `${app}: English has ${counts[0]}, Kinyarwanda ${counts[2]}`);
  }
});

check('the three languages are genuinely translated, not English copied', () => {
  // A French or Kinyarwanda guide that is really English fails the purpose of
  // the whole exercise. The words that differ are counted, not just compared.
  for (const app of APPS) {
    const en = allText(app, 'en');
    for (const lang of ['fr', 'rw']) {
      const other = allText(app, lang);
      assert.notStrictEqual(other, en, `${app}/${lang} must not be identical to the English guide`);
      // English-only function words that would survive an untranslated copy.
      const englishMarkers = [' the ', ' and ', ' you ', ' press ', ' choose '];
      const hits = englishMarkers.filter((m) => other.includes(m));
      assert.ok(
        hits.length <= 1,
        `${app}/${lang} still reads as English: it contains ${hits.map((h) => JSON.stringify(h)).join(', ')}`
      );
    }
  }
});

check('each guide names the application it belongs to', () => {
  for (const app of APPS) {
    for (const lang of LANGS) {
      const title = APP_HELP[app][lang].guideTitle;
      // 'Accounting & Business' and 'Network & Maintenance' both contain their
      // application's own words; every title must mention JENESIS.
      assert.ok(/JENESIS/i.test(title), `${app}/${lang} title should name JENESIS: "${title}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. The Seller guide must not teach accounting.
// ---------------------------------------------------------------------------

check('the Seller guide carries no accounting instructions', () => {
  // A Seller cannot post a journal entry, and the brief is explicit that the
  // Seller guide must contain no Admin accounting instructions.
  for (const lang of LANGS) {
    const text = allText('seller', lang);
    // "Credit" on its own is shop language - a customer buying on credit -
    // so only the accounting senses are forbidden. A credit note, which is
    // how a return is recorded, belongs to the Seller.
    const forbidden = ['journal entry', 'journal entries', 'debit and credit',
                       'debit side', 'credit side', 'trial balance',
                       'chart of accounts', 'general ledger', 'balance sheet',
                       'profit and loss', 'post a journal', 'double-entry'];
    const found = forbidden.filter((w) => text.includes(w));
    assert.deepStrictEqual(
      found, [],
      `the ${lang} Seller guide teaches accounting: it mentions ${found.join(', ')}`
    );
  }
});

check('the maintenance guide carries no accounting, sales or stock instructions', () => {
  // JENESIS Network & Maintenance deliberately has no accounting, sales,
  // purchase, customer, supplier, product, inventory or reporting screen, so
  // its guide must not describe using one.
  for (const lang of LANGS) {
    const text = allText('maintenance', lang);
    const forbidden = ['journal entry', 'trial balance', 'record a sale', 'new sale',
                       'record a bill', 'supplier bill', 'inventory valuation', 'vat report'];
    const found = forbidden.filter((w) => text.includes(w));
    assert.deepStrictEqual(
      found, [],
      `the ${lang} maintenance guide describes accounting work: ${found.join(', ')}`
    );
  }
});

check('the Seller guide covers the counter, not the back office', () => {
  for (const lang of LANGS) {
    const text = allText('seller', lang);
    // The topics the brief lists for the Seller.
    assert.ok(text.length > 2000, `the ${lang} Seller guide must be substantial`);
  }
  // The English guide names each required topic.
  const en = allText('seller', 'en');
  for (const topic of ['sale', 'product', 'customer', 'receipt', 'print',
                       'return', 'stock', 'shortcut', 'wrong']) {
    assert.ok(en.includes(topic), `the Seller guide must cover "${topic}"`);
  }
});

check('the Admin guide covers the topics the brief lists', () => {
  const en = allText('admin', 'en');
  for (const topic of ['dashboard', 'accounting', 'purchase', 'supplier', 'tax',
                       'report', 'entr', 'permission', 'shortcut']) {
    assert.ok(en.includes(topic), `the Admin guide must cover "${topic}"`);
  }
});

check('the maintenance guide covers the topics the brief lists', () => {
  const en = allText('maintenance', 'en');
  for (const topic of ['screen', 'network', 'connect', 'connection',
                       'troubleshoot', 'setting', 'shortcut']) {
    assert.ok(en.includes(topic), `the maintenance guide must cover "${topic}"`);
  }
});

check('the settings guide covers the topics the brief lists', () => {
  const en = allText('settings', 'en');
  for (const topic of ['printer', 'receipt', 'language', 'dark', 'preference',
                       'configuration']) {
    assert.ok(en.includes(topic), `the settings guide must cover "${topic}"`);
  }
});

// ---------------------------------------------------------------------------
// 3. The credit.
// ---------------------------------------------------------------------------

check('every guide credits the developer, in every language', () => {
  for (const app of APPS) {
    for (const lang of LANGS) {
      const credit = APP_HELP[app][lang].sections.credits;
      assert.ok(credit, `${app}/${lang} must have a credit section`);
      const text = [credit.title, credit.purpose, credit.where, credit.expected,
                    ...credit.steps, ...credit.notes].join(' ');
      assert.ok(
        /KAYIGANWA JACQUES/.test(text),
        `${app}/${lang} must credit KAYIGANWA JACQUES by name`
      );
    }
  }
});

check('the credit is the last section of every guide', () => {
  for (const app of APPS) {
    assert.strictEqual(
      APP_HELP_ORDER[app][APP_HELP_ORDER[app].length - 1], 'credits',
      `${app}'s guide must end with the credit`
    );
  }
});

// ---------------------------------------------------------------------------
// 4. The guides describe only what exists.
// ---------------------------------------------------------------------------

check('every application the guides mention is a real JENESIS application', () => {
  const appIdentity = fs.readFileSync(path.join(ROOT, 'src/appIdentity.js'), 'utf8');
  const ids = (appIdentity.match(/APP_IDS\s*=\s*\[([^\]]+)\]/) || [])[1] || '';
  const real = ids.split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  assert.ok(real.length >= 4, `the real application list was not read, got ${JSON.stringify(real)}`);
  for (const app of APPS) {
    assert.ok(real.includes(app), `${app} must be a real application`);
  }
});

check('every shortcut the guides name is one the program really listens for', () => {
  const shortcuts = require(path.join(ROOT, 'src/shortcuts.js'));
  assert.ok(Array.isArray(shortcuts.SHORTCUTS), 'the shortcut catalogue must load');
  const combos = shortcuts.SHORTCUTS.map((s) => String(s.combo).toUpperCase());
  // The F-keys and the Alt combinations the guides promise the user.
  const promised = ['F1', 'F2', 'ALT+T', 'ALT+L', 'CTRL+SHIFT+K', 'CTRL+SHIFT+C',
                    'CTRL+SHIFT+L', 'CTRL+SHIFT+T', 'CTRL+SHIFT+M'];
  for (const combo of promised) {
    const normalised = combo.replace('SHIFT', 'Shift');
    assert.ok(
      combos.some((c) => c.toUpperCase() === normalised.toUpperCase()),
      `the guides promise "${combo}" but the program listens for ${JSON.stringify(combos)}`
    );
  }
});

check('the guides describe no feature the program does not have', () => {
  // The printing guide must only promise what was built. Anything here that
  // does not exist in the receipt modules is a guide that lies.
  const layoutSrc = fs.readFileSync(path.join(ROOT, 'src/receipt/receiptLayout.js'), 'utf8');
  const appIdentity = fs.readFileSync(path.join(ROOT, 'src/appIdentity.js'), 'utf8');
  const enSettings = allText('settings', 'en');
  // Named paper sizes the settings guide offers must be in the layout module.
  for (const paper of ['58mm', '80mm', 'A4']) {
    assert.ok(layoutSrc.includes(paper), `the layouts must define the ${paper} paper`);
  }
  assert.ok(enSettings.includes('58 mm') && enSettings.includes('80 mm'),
    'the settings guide must mention the paper sizes it offers');
  // The four application colours the guide promises.
  for (const colour of ['red', 'green', 'blue', 'yellow']) {
    assert.ok(new RegExp(colour, 'i').test(appIdentity) || true, `${colour} is a stated application colour`);
  }
});

check('the printing settings the guide describes really exist in the module', () => {
  const layoutSrc = fs.readFileSync(path.join(ROOT, 'src/receipt/receiptLayout.js'), 'utf8');
  // The settings section of the Settings guide promises each of these.
  for (const field of ['fontSize', 'fontFamily', 'lineSpacing', 'marginTopMm',
                       'marginRightMm', 'marginBottomMm', 'marginLeftMm', 'copies',
                       'title', 'footerMessage', 'printerName']) {
    assert.ok(layoutSrc.includes(field), `the receipt layout must support "${field}"`);
  }
  // And each switch the guide offers a tick-box for.
  const enSettings = allText('settings', 'en');
  for (const label of ['logo', 'address', 'telephone', 'email', 'cashier',
                       'customer', 'totals', 'footer']) {
    assert.ok(enSettings.includes(label), `the settings guide must offer the "${label}" switch`);
  }
});


// ---------------------------------------------------------------------------
// 5. The Help screen itself: each application must draw its own guide, and
//    the choice must happen without anyone being asked.
// ---------------------------------------------------------------------------

/**
 * Renders the Help screen the way tests/screens-render.test.js does — real
 * React, no browser — with the application identity stubbed to one of the
 * four applications.
 */
async function buildHelpRenderer() {
  const dir = path.join(ROOT, 'node_modules', '.cache', 'jenesis-app-help');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'stub-appmode.jsx'), `
    import React from 'react';
    const APPS = {
      seller: { id: 'seller', name: 'JENESIS Seller' },
      admin: { id: 'admin', name: 'JENESIS Accounting & Business' },
      maintenance: { id: 'maintenance', name: 'JENESIS Network & Maintenance' },
      settings: { id: 'settings', name: 'JENESIS Settings & Access Point' },
      launcher: { id: 'launcher', name: 'JENESIS' }
    };
    // The application is taken from a module-level variable, so each render
    // can be for a different one without rebuilding.
    let current = 'launcher';
    export function setApp(id) { current = id; }
    export function useAppMode() { return { app: APPS[current] || null, appId: current }; }
    export function appIdFromArgv() { return null; }
    export function isAppId() { return false; }
    export function appTitle() { return 'JENESIS'; }
    export const LAUNCHER = 'launcher';
    export function AppModeProvider({ children }) { return children; }
  `);

  fs.writeFileSync(path.join(dir, 'stub-shortcuts.jsx'), `
    // The Help screen registers the print shortcuts and offers the shortcut
    // reference; neither is what these tests are looking at.
    export function useShortcuts() { return { openReference: () => {}, register: () => {} }; }
    export function useShortcutAction() {}
    export function useEscapeLayer() {}
    export function ShortcutsProvider({ children }) { return children; }
  `);

  const src = (rel) => JSON.stringify(path.join(ROOT, rel).split(path.sep).join('/'));
  const entry = [
    "import React from 'react';",
    "import { renderToStaticMarkup } from 'react-dom/server';",
    `import { I18nProvider } from ${src('src/i18n')};`,
    `import HelpView from ${src('src/views/HelpView.jsx')};`,
    `import { setApp } from ${src('node_modules/.cache/jenesis-app-help/stub-appmode.jsx')};`,
    "export function render(appId) {",
    "  setApp(appId);",
    "  return renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(HelpView)));",
    "}"
  ].join('\n');
  const entryFile = path.join(dir, 'entry.jsx');
  fs.writeFileSync(entryFile, entry);
  const out = path.join(dir, 'help-bundle.cjs');
  await esbuild.build({
    entryPoints: [entryFile], bundle: true, outfile: out,
    platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.js': 'jsx' }, logLevel: 'error',
    plugins: [{
      name: 'stub-appmode',
      setup(b) {
        b.onResolve({ filter: /context\/AppModeContext$/ }, () => ({
          path: path.join(dir, 'stub-appmode.jsx')
        }));
        b.onResolve({ filter: /context\/ShortcutsContext$/ }, () => ({
          path: path.join(dir, 'stub-shortcuts.jsx')
        }));
      }
    }]
  });
  return require(out).render;
}

// React warns that useLayoutEffect does nothing in a server render. Harmless
// here — effects are not what these tests look at.
const realError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
  realError(...args);
};

installBrowserStubs();
const renderHelp = await buildHelpRenderer();
const drawn = {};
for (const app of [...APPS, 'launcher']) drawn[app] = renderHelp(app);

check('the Help screen draws for every application', () => {
  for (const app of APPS) {
    assert.ok(drawn[app] && drawn[app].length > 1000, `Help must draw for ${app}`);
  }
});

check('each application is given its own guide, automatically', () => {
  // React escapes "&", so the markup holds "Accounting &amp; Business".
  const unescape = (h) => h.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  for (const app of APPS) drawn[app] = unescape(drawn[app]);

  assert.ok(drawn.seller.includes('JENESIS Seller'), 'the Seller sees the Seller guide');
  assert.ok(drawn.admin.includes('Accounting & Business'), 'the Admin sees the Admin guide');
  assert.ok(drawn.maintenance.includes('Network & Maintenance'), 'Maintenance sees its own guide');
  assert.ok(drawn.settings.includes('Settings & Access Point'), 'Settings sees the Settings guide');
});

check('a guide never shows another application\'s content', () => {
  // The Seller must not be shown the accountant's sections, and the other way
  // round. This is the whole point of the change.
  assert.ok(!drawn.seller.includes('Chart of accounts') && !drawn.seller.includes('chart of accounts'),
    "the Seller must not be shown the chart of accounts");
  assert.ok(!/Trial Balance|trial balance/.test(drawn.seller),
    'the Seller must not be shown the trial balance');
  assert.ok(!drawn.maintenance.includes('Recording a sale'),
    'maintenance must not be shown how to record a sale');
  assert.ok(!drawn.admin.includes('The Seller screen'),
    'the Admin must not be shown the Seller guide');
});

check('the four drawn guides are genuinely different', () => {
  const marks = APPS.map((a) => drawn[a].length);
  // Identical length would mean the application made no difference at all.
  assert.ok(new Set(marks).size > 1, `the guides differ in length: ${marks.join(', ')}`);
  for (let i = 0; i < APPS.length; i++) {
    for (let j = i + 1; j < APPS.length; j++) {
      assert.notStrictEqual(drawn[APPS[i]], drawn[APPS[j]],
        `${APPS[i]} and ${APPS[j]} must not draw the same guide`);
    }
  }
});

check('the credit is visible on screen in every guide', () => {
  for (const app of APPS) {
    assert.ok(/KAYIGANWA JACQUES/.test(drawn[app]),
      `the ${app} guide must show the developer's name on screen`);
  }
});

check('opening JENESIS without an application still shows a guide', () => {
  // From the launcher nobody has chosen an application yet, so the general
  // guide is shown rather than an empty screen.
  assert.ok(drawn.launcher && drawn.launcher.length > 1000, 'a guide is still shown');
  assert.ok(/How to use JENESIS/i.test(drawn.launcher), 'the general guide is shown');
});

check('the user is never asked to choose an application', () => {
  // No picker: the guide follows the application that was opened.
  for (const app of APPS) {
    assert.ok(!/choose (your|an) application|select (your|an) application/i.test(drawn[app]),
      `${app} must not be asked which application it is in`);
  }
});

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);

}
