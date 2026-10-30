'use strict';
/**
 * THREE APPLICATIONS TESTS.
 *
 * JENESIS is three applications — Seller, Maintenance and Admin — not one
 * program with three modes. Each one is opened by its own shortcut, opens
 * directly in its own environment, has its own name, colour, menu, Windows
 * identity and remembered theme, and all of them share one database.
 *
 * These tests run without a browser: src/appIdentity.js is pure logic and
 * electron/app-mode.cjs is the CommonJS twin the desktop shell uses, so the
 * two can be compared directly and the rest is verified from the sources.
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
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \u2717 ${name}\n      ${err.message}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// src/appIdentity.js is an ES module; load it in a sandbox.
function loadAppIdentity() {
  const source = read('src/appIdentity.js');
  const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1]);
  const body = source.replace(/export (function|const)/g, '$1');
  const sandbox = { module: { exports: {} }, exports: null };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(`${body}\n;module.exports = { ${names.join(', ')} };`, sandbox, {
    filename: 'appIdentity.js'
  });
  return sandbox.module.exports;
}

const appIdentity = loadAppIdentity();
const appMode = require(path.join(ROOT, 'electron', 'app-mode.cjs'));

console.log('--- THREE APPLICATIONS TESTS (Seller / Maintenance / Admin) ---');

check('there are exactly three applications, and they are Seller, Maintenance and Admin', () => {
  // Compared as JSON: the module is loaded in a sandbox, so its array is not
  // reference-equal to one built here.
  assert.strictEqual(JSON.stringify(appIdentity.APP_IDS), JSON.stringify(['seller', 'maintenance', 'admin']));
  assert.strictEqual(JSON.stringify(appMode.APP_IDS), JSON.stringify(['seller', 'maintenance', 'admin']),
    'the desktop shell must know the same three applications');
  for (const id of appIdentity.APP_IDS) {
    assert.ok(appIdentity.APPS[id], `the catalogue must define ${id}`);
    assert.ok(appIdentity.isAppId(id));
  }
  assert.strictEqual(appIdentity.isAppId('launcher'), false);
  assert.strictEqual(appIdentity.resolveAppId('nonsense'), null);
});

check('each application has its own colour: Seller red, Maintenance green, Admin blue', () => {
  assert.strictEqual(appIdentity.APPS.seller.colour, 'red');
  assert.strictEqual(appIdentity.APPS.maintenance.colour, 'green');
  assert.strictEqual(appIdentity.APPS.admin.colour, 'blue');
  const colours = appIdentity.APP_IDS.map((id) => appIdentity.APPS[id].colour);
  assert.strictEqual(new Set(colours).size, 3, 'the three applications must never share a colour');
  const accents = appIdentity.APP_IDS.map((id) => appIdentity.APPS[id].accent.light);
  assert.strictEqual(new Set(accents).size, 3, 'the three identity colours must be different');
  // The colour is bound in CSS per application, and the logo reads the same tone.
  const css = read('src/index.css');
  for (const id of appIdentity.APP_IDS) {
    assert.ok(
      css.includes(`[data-app='${id}']`) || css.includes(`[data-app="${id}"]`),
      `src/index.css must bind the ${id} palette`
    );
  }
  const logo = read('src/components/JenesisLogo.jsx');
  for (const id of appIdentity.APP_IDS) {
    assert.ok(new RegExp(`${id}:\\s*\\[`).test(logo), `the logo must carry the ${id} colour`);
  }
});

check('the renderer and the desktop shell describe the same three applications', () => {
  for (const id of appIdentity.APP_IDS) {
    assert.strictEqual(appIdentity.appTitle(id), appMode.appTitle(id), `title of ${id}`);
    assert.strictEqual(
      appIdentity.appUserModelId(id), appMode.appUserModelId(id), `Windows identity of ${id}`
    );
    const shell = appMode.iconFiles(id);
    assert.strictEqual(appIdentity.APPS[id].iconIco, shell.ico, `icon of ${id}`);
    assert.strictEqual(appIdentity.APPS[id].iconPng, shell.png, `icon of ${id}`);
    assert.ok(/^JENESIS [A-Z]/.test(appIdentity.appTitle(id)), `${id} is titled "JENESIS …"`);
  }
  assert.ok(appMode.appUserModelId('seller').includes('seller'));
  assert.strictEqual(appMode.resolveAppId('--app=Seller'), 'seller');
  assert.strictEqual(appMode.resolveAppId('JENESIS-Maintenance'), 'maintenance');
  assert.strictEqual(appMode.resolveAppId('admin.exe'), 'admin');
});

check('every application opens directly in its own environment', () => {
  assert.strictEqual(appIdentity.APPS.seller.defaultView, 'sales', 'Seller opens on Sales');
  assert.strictEqual(appIdentity.APPS.maintenance.defaultView, 'maintenance',
    'Maintenance opens on its own maintenance screen');
  assert.strictEqual(appIdentity.APPS.admin.defaultView, 'dashboard', 'Admin opens on the dashboard');
  for (const id of appIdentity.APP_IDS) {
    const views = appIdentity.viewsForApp(id);
    assert.ok(views.includes('help'), `${id} always offers Help`);
    assert.ok(views.includes('dashboard'), `${id} always offers the dashboard`);
  }
  // A remembered screen is honoured only inside the application that offers it.
  assert.strictEqual(appIdentity.landingViewFor('seller', 'reports'), 'sales',
    'a Seller user who last looked at Reports lands on Sales');
  assert.strictEqual(appIdentity.landingViewFor('admin', 'reports'), 'reports');
});

check('no application renders a screen it does not own', () => {
  assert.strictEqual(appIdentity.canOpenView('seller', 'accounting'), false);
  assert.strictEqual(appIdentity.canOpenView('seller', 'purchases'), false);
  assert.strictEqual(appIdentity.canOpenView('seller', 'sales'), true);
  assert.strictEqual(appIdentity.canOpenView('maintenance', 'sales'), false);
  assert.strictEqual(appIdentity.canOpenView('maintenance', 'inventory'), true);
  assert.strictEqual(appIdentity.canOpenView('maintenance', 'maintenance'), true);
  for (const view of ['sales', 'purchases', 'accounting', 'reports', 'settings', 'maintenance']) {
    assert.strictEqual(appIdentity.canOpenView('admin', view), true, `Admin offers ${view}`);
  }
  // Enforced in the interface, not only in the menu.
  const app = read('src/App.jsx');
  assert.ok(app.includes('canOpen'), 'the shell refuses a screen the application does not own');
  const sidebar = read('src/components/Sidebar.jsx');
  assert.ok(sidebar.includes("app.views.includes(item.id)"), 'the menu is scoped to the application');
});

check('each application remembers its own Light/Dark/System choice', () => {
  const keys = appIdentity.APP_IDS.map((id) => appIdentity.themeStorageKey(id));
  assert.strictEqual(new Set(keys).size, 3, 'the three applications must not share a theme key');
  for (const id of appIdentity.APP_IDS) {
    assert.strictEqual(appIdentity.themeStorageKey(id), `jenesis_theme:${id}`);
  }
  const context = read('src/context/ThemeContext.jsx');
  assert.ok(context.includes('themeStorageKey(appId)'), 'the provider writes the per-application key');
  const theme = read('src/theme.mjs');
  assert.ok(theme.includes("THEME_STORAGE_KEY = 'jenesis_theme'"),
    'the single key used before the split is still honoured');
  assert.ok(theme.includes('jenesis_theme:'), 'the preference is stored per application');
  // And the choice is painted before the first frame, per application.
  const html = read('index.html');
  assert.ok(html.includes("'jenesis_theme:' + appId"), 'the bootstrap reads the per-application key');
});

check('every application ships its own icon, and none of them is the old G logo', () => {
  // Recorded from the icons JEN 0.2 shipped: a G in a blue square.
  const OLD_G_ICON_MD5 = '2286e6405e456c9d295a0ab10e055d4e';
  const crypto = require('crypto');
  const md5 = (rel) => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
  const hashes = new Set();
  for (const id of appIdentity.APP_IDS) {
    const app = appIdentity.APPS[id];
    assert.ok(exists(app.iconIco), `${app.iconIco} must exist`);
    assert.ok(exists(app.iconPng), `${app.iconPng} must exist`);
    assert.ok(exists(`public${app.favicon}`), `public${app.favicon} must exist`);
    const hash = md5(app.iconIco);
    assert.notStrictEqual(hash, OLD_G_ICON_MD5, `${app.iconIco} must not be the old G icon`);
    hashes.add(hash);
  }
  assert.strictEqual(hashes.size, 3, 'the three icons must be three different files');
  assert.ok(exists('build/icon.ico'), 'the product mark is still shipped for the launcher');
});

check('the installer creates one shortcut per application, each with its own icon', () => {
  const nsis = read('build/installer.nsh');
  const pkg = JSON.parse(read('package.json'));
  assert.strictEqual(pkg.build.nsis.include, 'build/installer.nsh', 'the installer script is used');
  for (const id of appIdentity.APP_IDS) {
    const title = appIdentity.appTitle(id);
    assert.ok(
      nsis.includes(`!insertmacro CreateJenesisShortcut "${id}" "${title}" "icon-${id}.ico"`),
      `a shortcut named ${title} for ${id}`
    );
    assert.ok(nsis.includes('"--app=${APPID}"'), 'each shortcut passes --app=<application>');
    assert.ok(nsis.includes(`icon-${id}.ico`), `the ${id} shortcut uses its own icon`);
  }
  assert.ok(nsis.includes('$SMPROGRAMS\\JENESIS'), 'the Start Menu folder is JENESIS');
  // The icons are shipped outside app.asar so Windows can read them.
  const extra = JSON.stringify(pkg.build.extraResources || []);
  assert.ok(extra.includes('app-icons') && extra.includes('icon-*.ico'),
    'the shortcut icons must be readable by Windows (outside app.asar)');
  // The Windows identity of each window keeps the three apart in the taskbar.
  const main = read('electron/main.cjs');
  assert.ok(main.includes('setAppDetails'), 'each window carries its own Windows identity');
  assert.ok(main.includes('appUserModelId(appId)'));
});

check('the launcher offers the three applications and remembers the choice', () => {
  assert.ok(exists('src/views/LauncherView.jsx'), 'the chooser exists');
  const launcher = read('src/views/LauncherView.jsx');
  assert.ok(launcher.includes('APP_IDS'), 'it offers the three applications');
  assert.ok(launcher.includes('launcher.intro') && launcher.includes('launcher.open'),
    'it is translated');
  assert.ok(launcher.includes('identity.developed_by'), 'it credits the developer');
  for (const id of appIdentity.APP_IDS) {
    assert.ok(launcher.includes('APP_IDS'), `the ${id} card is built from the catalogue`);
  }
  const app = read('src/App.jsx');
  assert.ok(app.includes('<LauncherView'), 'the launcher is shown when no application is requested');
  const context = read('src/context/AppModeContext.jsx');
  assert.strictEqual(appIdentity.APP_STORAGE_KEY, 'jenesis_app');
  assert.ok(context.includes('APP_STORAGE_KEY'), 'the remembered application is read from storage');
  assert.ok(/get\('app'\)/.test(context), 'the mode can be passed on the URL (shortcuts do)');
});

check('the three applications share one database and one accounting engine', () => {
  // One service, one file: the applications differ in what they expose, never
  // in where the records live.
  const db = read('server/db.js');
  assert.ok(!/jenesis[-_]seller|seller\.db|maintenance\.db/.test(db),
    'there is no per-application database');
  const api = read('server/routes/api.js');
  assert.ok(api.includes("'/sales/"), 'sales are still served to whoever may see them');
  assert.ok(api.includes("'/journal-entries'"), 'the journal is shared by all applications');
  assert.ok(api.includes("'/reports/trial-balance'"), 'the Trial Balance is shared by all applications');
  // Permissions, not separate tables, decide what each application may write.
  const auth = read('server/auth.js');
  assert.ok(auth.includes('ROLE_PERMISSIONS') || auth.includes('hasPermission'),
    'permissions still decide what a user may do');
});

check('the identity strings exist in English, French and Kinyarwanda', () => {
  for (const lang of ['en', 'fr', 'rw']) {
    const dict = JSON.parse(read(`src/i18n/${lang}.json`));
    assert.ok(dict.identity, `${lang} must translate the application identities`);
    for (const id of appIdentity.APP_IDS) {
      const app = appIdentity.APPS[id];
      for (const key of [app.nameKey, app.shortKey, app.purposeKey]) {
        const section = key.split('.')[0];
        const leaf = key.split('.')[1];
        assert.ok(dict[section][leaf], `${lang} is missing ${key}`);
      }
    }
    assert.ok(dict.identity.choose_app, `${lang} is missing identity.choose_app`);
    assert.ok(dict.identity.developed_by, `${lang} is missing identity.developed_by`);
    assert.strictEqual(dict.identity.developed_by.includes('KAYIGANWA JACQUES'), true,
      `the developer credit must be present in ${lang}`);
  }
});

console.log(`--- ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
