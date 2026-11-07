'use strict';
/**
 * FOUR APPLICATIONS TESTS.
 *
 * JENESIS is four applications — Seller, Network & Maintenance, Accounting &
 * Business and Settings & Access Point — not one program with four modes.
 * Each one is opened by its own shortcut, opens directly in its own
 * environment, has its own name, colour, menu, Windows identity and remembered
 * theme, and all four share ONE database.
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

console.log('--- FOUR APPLICATIONS TESTS (Seller / Network & Maintenance / Accounting & Business / Settings & Access Point) ---');

check('there are exactly four applications', () => {
  // Compared as JSON: the module is loaded in a sandbox, so its array is not
  // reference-equal to one built here.
  const FOUR = ['seller', 'maintenance', 'admin', 'settings'];
  assert.strictEqual(JSON.stringify(appIdentity.APP_IDS), JSON.stringify(FOUR));
  assert.strictEqual(JSON.stringify(appMode.APP_IDS), JSON.stringify(FOUR),
    'the desktop shell must know the same four applications');
  for (const id of appIdentity.APP_IDS) {
    assert.ok(appIdentity.APPS[id], `the catalogue must define ${id}`);
    assert.ok(appIdentity.isAppId(id));
  }
  assert.strictEqual(appIdentity.isAppId('launcher'), false);
  assert.strictEqual(appIdentity.resolveAppId('nonsense'), null);
});

check('each application has its own colour: Seller red, Maintenance green, Accounting blue, Settings yellow', () => {
  assert.strictEqual(appIdentity.APPS.seller.colour, 'red');
  assert.strictEqual(appIdentity.APPS.maintenance.colour, 'green');
  assert.strictEqual(appIdentity.APPS.admin.colour, 'blue');
  assert.strictEqual(appIdentity.APPS.settings.colour, 'yellow');
  const colours = appIdentity.APP_IDS.map((id) => appIdentity.APPS[id].colour);
  assert.strictEqual(new Set(colours).size, 4, 'the four applications must never share a colour');
  const accents = appIdentity.APP_IDS.map((id) => appIdentity.APPS[id].accent.light);
  assert.strictEqual(new Set(accents).size, 4, 'the four identity colours must be different');
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

check('the renderer and the desktop shell describe the same four applications', () => {
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
  assert.strictEqual(appMode.resolveAppId('--app=settings'), 'settings');
});

check('the applications carry their full names, and Admin has been renamed', () => {
  // "JENESIS Admin" became "JENESIS Accounting & Business" and "JENESIS
  // Maintenance" became "JENESIS Network & Maintenance". A shortcut left with
  // the old name would open the right program under the wrong title.
  assert.strictEqual(appIdentity.appTitle('seller'), 'JENESIS Seller');
  assert.strictEqual(appIdentity.appTitle('maintenance'), 'JENESIS Network & Maintenance');
  assert.strictEqual(appIdentity.appTitle('admin'), 'JENESIS Accounting & Business');
  assert.strictEqual(appIdentity.appTitle('settings'), 'JENESIS Settings & Access Point');
  for (const id of appIdentity.APP_IDS) {
    assert.strictEqual(appIdentity.appTitle(id), appMode.APP_TITLES[id],
      `the desktop shell must use the same title for ${id}`);
  }
  // No leftover of the old short names in the titles actually installed.
  const nsis = read('build/installer.nsh');
  assert.ok(!/CreateJenesisShortcut "\w+" "JENESIS Admin"/.test(nsis),
    'the installer must not still create a shortcut called "JENESIS Admin"');
  assert.ok(!/CreateJenesisShortcut "\w+" "JENESIS Maintenance"/.test(nsis),
    'the installer must not still create a shortcut called "JENESIS Maintenance"');
});

check('the installer creates four shortcuts, each naming its application, argument and icon', () => {
  // Reading the installer script is not the same as clicking the shortcuts —
  // that can only be done on Windows — but it is worth being exact about it:
  // a shortcut with the right name and the wrong --app= would open the wrong
  // application, and a wrong icon filename would silently install no icon.
  const nsis = read('build/installer.nsh');
  const install = nsis.slice(nsis.indexOf('!macro customInstall'), nsis.indexOf('!macro customUnInstall'));
  const calls = [...install.matchAll(/CreateJenesisShortcut "([^"]+)" "([^"]+)" "([^"]+)"/g)];
  assert.strictEqual(calls.length, 4, `four shortcuts must be created, found ${calls.length}`);

  const byId = {};
  for (const [, appId, name, icon] of calls) {
    byId[appId] = { name, icon };
    assert.ok(appIdentity.APP_IDS.includes(appId), `"${appId}" is not one of the four applications`);
    assert.strictEqual(name, appIdentity.appTitle(appId),
      `the ${appId} shortcut must be named "${appIdentity.appTitle(appId)}", not "${name}"`);
    assert.strictEqual(icon, `icon-${appId}.ico`,
      `the ${appId} shortcut must carry icon-${appId}.ico, not "${icon}"`);
    assert.ok(fs.existsSync(path.join(ROOT, 'build', icon)),
      `${icon} is named by the installer but is missing from build/`);
  }
  assert.deepStrictEqual(Object.keys(byId).sort(), ['admin', 'maintenance', 'seller', 'settings'],
    'every application must have a shortcut');

  // The argument that chooses the application, and both places it is created.
  const macro = nsis.slice(nsis.indexOf('!macro CreateJenesisShortcut'), nsis.indexOf('!macro DeleteJenesisShortcut'));
  assert.ok(macro.includes('"--app=${APPID}"'), 'each shortcut must pass --app=<id> to the executable');
  assert.ok(macro.includes('$DESKTOP\\${NAME}.lnk'), 'a Desktop shortcut must be created');
  assert.ok(macro.includes('$SMPROGRAMS\\JENESIS\\${NAME}.lnk'), 'a Start Menu shortcut must be created');
  assert.ok(macro.includes('$INSTDIR\\resources\\app-icons\\${ICONFILE}'),
    'the shortcut icon must come from the packaged app-icons folder');

  // Uninstalling must remove all four, and the two names they used to have.
  const uninstall = nsis.slice(nsis.indexOf('!macro customUnInstall'));
  for (const name of Object.values(byId).map((v) => v.name).concat(['JENESIS Maintenance', 'JENESIS Admin'])) {
    assert.ok(uninstall.includes(`DeleteJenesisShortcut "${name}"`),
      `uninstalling must remove the "${name}" shortcut`);
  }
});

check('every application opens directly in its own environment', () => {
  // The Seller opens on its OWN dashboard: the counter, not the accounting
  // desk it used to be shown. Same database — a different question.
  assert.strictEqual(appIdentity.APPS.seller.defaultView, 'dashboard', 'Seller opens on its own dashboard');
  assert.strictEqual(appIdentity.APPS.maintenance.defaultView, 'maintenance',
    'Network & Maintenance opens on its own screen');
  assert.strictEqual(appIdentity.APPS.admin.defaultView, 'dashboard',
    'Accounting & Business opens on the dashboard');
  assert.strictEqual(appIdentity.APPS.settings.defaultView, 'settings',
    'Settings & Access Point opens on Settings');
  for (const id of appIdentity.APP_IDS) {
    const views = appIdentity.viewsForApp(id);
    assert.ok(views.includes('help'), `${id} always offers Help`);
    assert.ok(views.includes(appIdentity.APPS[id].defaultView),
      `${id} always offers the screen it opens on`);
  }
  // A remembered screen is honoured only inside the application that offers it.
  assert.strictEqual(appIdentity.landingViewFor('seller', 'reports'), 'dashboard',
    'a Seller user who last looked at Reports lands on the Seller dashboard');
  assert.strictEqual(appIdentity.landingViewFor('admin', 'reports'), 'reports');
});

check('no application renders a screen it does not own', () => {
  assert.strictEqual(appIdentity.canOpenView('seller', 'accounting'), false);
  assert.strictEqual(appIdentity.canOpenView('seller', 'purchases'), false);
  assert.strictEqual(appIdentity.canOpenView('seller', 'sales'), true);
  assert.strictEqual(appIdentity.canOpenView('maintenance', 'sales'), false);
  assert.strictEqual(appIdentity.canOpenView('maintenance', 'maintenance'), true);
  assert.strictEqual(appIdentity.canOpenView('settings', 'reports'), false);
  assert.strictEqual(appIdentity.canOpenView('settings', 'settings'), true);
  for (const view of ['sales', 'purchases', 'accounting', 'reports', 'maintenance']) {
    assert.strictEqual(appIdentity.canOpenView('admin', view), true,
      `Accounting & Business offers ${view}`);
  }
  // Configuration has moved out: company, users, permissions, taxes and
  // currencies are managed once, in JENESIS Settings & Access Point, instead
  // of being duplicated here and drifting out of step with the copy there.
  assert.strictEqual(appIdentity.canOpenView('admin', 'settings'), false,
    'Accounting & Business no longer offers settings');
  assert.strictEqual(appIdentity.canOpenView('settings', 'settings'), true,
    'settings live in Settings & Access Point');
  // Enforced in the interface, not only in the menu.
  const app = read('src/App.jsx');
  assert.ok(app.includes('canOpen'), 'the shell refuses a screen the application does not own');
  const sidebar = read('src/components/Sidebar.jsx');
  assert.ok(sidebar.includes("app.views.includes(item.id)"), 'the menu is scoped to the application');
});

check('Network & Maintenance holds no business screen at all', () => {
  // Modification 6: the maintenance application is a technical tool. It must
  // not be able to reach accounting, sales, purchases, customers, suppliers,
  // products, inventory or reports — not in its menu, not by URL.
  const forbidden = [
    'dashboard', 'sales', 'purchases', 'customers', 'suppliers',
    'inventory', 'accounting', 'banking', 'reports'
  ];
  for (const view of forbidden) {
    assert.strictEqual(appIdentity.canOpenView('maintenance', view), false,
      `Network & Maintenance must not be able to open ${view}`);
  }
  const views = [...appIdentity.viewsForApp('maintenance')];
  assert.deepStrictEqual(views.slice().sort(), ['help', 'maintenance'],
    `Network & Maintenance owns only its own screen and Help; found ${views.join(', ')}`);
});

check('Settings & Access Point is configuration only', () => {
  const views = [...appIdentity.viewsForApp('settings')];
  assert.deepStrictEqual(views.slice().sort(), ['help', 'settings'],
    `Settings & Access Point owns only Settings and Help; found ${views.join(', ')}`);
  for (const view of ['sales', 'purchases', 'reports', 'accounting', 'inventory']) {
    assert.strictEqual(appIdentity.canOpenView('settings', view), false,
      `Settings & Access Point must not be able to open ${view}`);
  }
});

check('each application remembers its own Light/Dark/System choice', () => {
  const keys = appIdentity.APP_IDS.map((id) => appIdentity.themeStorageKey(id));
  assert.strictEqual(new Set(keys).size, 4, 'the four applications must not share a theme key');
  for (const id of appIdentity.APP_IDS) {
    assert.strictEqual(appIdentity.themeStorageKey(id), `jenesis_theme:${id}`);
  }
  const context = read('src/context/ThemeContext.jsx');
  assert.ok(context.includes('themeStorageKey(appId)'), 'the provider writes the per-application key');
  const theme = read('src/theme.mjs');
  assert.ok(theme.includes("THEME_STORAGE_KEY = 'jenesis_theme'"),
    'the single key used before the split is still honoured');
  assert.ok(theme.includes('jenesis_theme:'), 'the preference is stored per application');
  // And the choice is painted before the first frame, per application. The
  // bootstrap lives in public/boot.js: an inline script in index.html is
  // blocked by the production Content-Security-Policy, so it could not run.
  const boot = read('public/boot.js');
  assert.ok(boot.includes("'jenesis_theme:' + appId"), 'the bootstrap reads the per-application key');
  const html = read('index.html');
  assert.ok(html.includes('src="/boot.js"'), 'the start page must load the bootstrap');
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
  assert.strictEqual(hashes.size, 4, 'the four icons must be four different files');
  assert.ok(exists('build/icon.ico'), 'the product mark is still shipped for the launcher');
});

check('the installer creates one shortcut per application, each with its own icon', () => {
  const nsis = read('build/installer.nsh');
  const pkg = JSON.parse(read('package.json'));
  const created = nsis.match(/!insertmacro CreateJenesisShortcut "/g) || [];
  assert.strictEqual(created.length, 4, `the installer must create four shortcuts, found ${created.length}`);
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
  // The Windows identity of each window keeps the four apart in the taskbar.
  const main = read('electron/main.cjs');
  assert.ok(main.includes('setAppDetails'), 'each window carries its own Windows identity');
  assert.ok(main.includes('appUserModelId(appId)'));
});

check('the installation package carries everything the four applications need', () => {
  const pkg = JSON.parse(read('package.json'));
  const files = JSON.stringify(pkg.build.files || []);
  // The shortcuts read their icons from resources/app-icons (outside app.asar),
  // and each window loads build/icon-<app>.ico from inside the package.
  for (const id of appIdentity.APP_IDS) {
    assert.ok(files.includes('build/icon-*.ico'), `the ${id} icon must be inside the package`);
    assert.ok(files.includes('build/icon-*.png'), `the ${id} icon must be inside the package`);
  }
  const extra = JSON.stringify(pkg.build.extraResources || []);
  assert.ok(extra.includes('icon-*.ico'), 'Windows must be able to read the shortcut icons');
  // The four applications are the same program, so these never change.
  assert.ok(files.includes('dist/**/*'), 'the built interface must be packaged');
  assert.ok(files.includes('server/**/*'), 'the accounting service must be packaged');
  assert.ok(files.includes('electron/**/*'), 'the desktop shell must be packaged');
  assert.ok(JSON.stringify(pkg.build.asarUnpack || []).includes('*.node'),
    'the native SQLite driver must be unpacked from the asar archive');
  // No business data travels inside the installer, and no test material either.
  assert.ok(!files.includes('genesis.db'), 'no database may be shipped inside the installer');
  assert.ok(files.includes('!**/tests/**'), 'the test suite is not shipped');
});

check('the launcher offers the four applications and remembers the choice', () => {
  assert.ok(exists('src/views/LauncherView.jsx'), 'the chooser exists');
  const launcher = read('src/views/LauncherView.jsx');
  assert.ok(launcher.includes('APP_IDS'), 'it offers the four applications');
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

check('the four applications share one database and one accounting engine', () => {
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
