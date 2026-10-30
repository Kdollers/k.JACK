'use strict';
/**
 * PRODUCTION START-UP TESTS — the failure that a passing build cannot see.
 *
 * A packaged desktop application can compile, install, start its backend and
 * still show an EMPTY WHITE WINDOW: if the built interface (index.html and its
 * JavaScript and CSS files) cannot be loaded or executed, nothing is drawn and
 * nothing is logged. That is exactly what happened in the field, and no amount
 * of accounting testing would have caught it.
 *
 * These checks guard the three things that keep it from ever happening again:
 *   1. the start-up guard (public/boot.js) runs before the application bundle
 *      and is reachable under the production Content-Security-Policy;
 *   2. the interface is shipped where every process can read it, and the shell
 *      verifies it is really served before the window is shown;
 *   3. when something does fail, the user is told what happened instead of
 *      being left with a blank screen.
 *
 * Every check here runs against the real files of the project.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    }
  };
}

function fakeRoot() {
  const classes = new Set();
  return {
    classes,
    attributes: {},
    style: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => (force ? classes.add(name) : classes.delete(name))
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    removeAttribute(name) {
      delete this.attributes[name];
    }
  };
}

/** Runs public/boot.js exactly as the browser runs it, on a minimal page. */
function runBootScript({ store = {}, systemDark = false, sandboxExtras = {} } = {}) {
  const element = fakeRoot();
  const sandbox = {
    localStorage: memoryStorage(store),
    document: { documentElement: element },
    window: { matchMedia: (query) => ({ matches: systemDark && query.includes('dark') }) },
    console,
    ...sandboxExtras
  };
  vm.runInNewContext(read('public/boot.js'), sandbox);
  return { element, sandbox };
}

// ---------------------------------------------------------------------------
// 1. The start-up guard is part of the page and can run in production
// ---------------------------------------------------------------------------
const html = read('index.html');
const bootSource = read('public/boot.js');
const security = read('server/security.js');

check('the start-up guard is a file of its own, not an inline script', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'public', 'boot.js')), 'public/boot.js must exist');
  assert.ok(
    html.includes('src="/boot.js"'),
    'index.html must load /boot.js as a file — an inline script is blocked by the production CSP'
  );
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  const inlineWithCode = inline.filter((match) => match[1].trim().length > 0);
  assert.deepStrictEqual(
    inlineWithCode.map((match) => match[1].trim().slice(0, 20)),
    [],
    'index.html must not contain inline JavaScript: the CSP forbids it, so it could never run'
  );
});

check('the production Content-Security-Policy allows the start-up guard', () => {
  const policy = /CONTENT_SECURITY_POLICY\s*=\s*\[([\s\S]*?)\]/.exec(security);
  assert.ok(policy, 'server/security.js must define a Content-Security-Policy');
  const directives = policy[1];
  const scriptSrc = /"script-src\s+([^"]+)"/.exec(directives);
  assert.ok(scriptSrc, 'the policy must set script-src');
  assert.ok(/'self'/.test(scriptSrc[1]), 'script-src must allow this origin (boot.js)');
  assert.ok(
    !/unsafe-inline/.test(scriptSrc[1]),
    'script-src must stay without unsafe-inline: that is why the guard is a file'
  );
});

check('the start page always shows something, even before the bundle runs', () => {
  assert.ok(html.includes('id="root"'), 'the React mount point must exist');
  assert.ok(html.includes('id="jenesis-boot"'), 'the start-up card must exist');
  assert.ok(
    html.includes('id="jenesis-boot-message"'),
    'the card must have a message element the guard can update'
  );
  // Styled inline: the card stays visible even when the stylesheet is missing.
  const card = /<div\s+id="jenesis-boot"[\s\S]*?>/.exec(html);
  assert.ok(card && card[0].includes('style='), 'the card must carry inline styles');
  assert.ok(/Starting JENESIS/.test(html), 'the card must say that JENESIS is starting');
});

// ---------------------------------------------------------------------------
// 2. What the guard does
// ---------------------------------------------------------------------------
check('the guard paints the saved theme before the first frame', () => {
  const dark = runBootScript({ store: { jenesis_app: 'seller', 'jenesis_theme:seller': 'dark' } });
  assert.ok(dark.element.classes.has('dark'), 'Seller must paint its remembered Dark Mode');
  assert.strictEqual(dark.element.attributes['data-theme'], 'dark');
  assert.strictEqual(dark.element.attributes['data-app'], 'seller');

  const light = runBootScript({ store: { jenesis_app: 'admin', 'jenesis_theme:admin': 'light' } });
  assert.ok(!light.element.classes.has('dark'), 'Admin must paint its remembered Light Mode');
  assert.strictEqual(light.element.attributes['data-app'], 'admin');

  const system = runBootScript({ store: { jenesis_theme: 'system' }, systemDark: true });
  assert.ok(system.element.classes.has('dark'), 'System Default must follow the operating system');
});

check('the guard detects a file that fails to load — the white-screen cause', () => {
  assert.ok(
    bootSource.includes("addEventListener(\n      'error'") ||
      /addEventListener\(\s*'error'/.test(bootSource),
    'the guard must listen for resource errors'
  );
  assert.ok(/true\s*\)\s*;?\s*$|,\s*true\s*\)/.test(bootSource), 'the listener must capture (element errors do not bubble)');
  assert.ok(bootSource.includes('target.src') || bootSource.includes('target.href'),
    'the guard must recognise an element error (a missing script, stylesheet or icon)');
});

check('the guard reports a stalled start instead of leaving an empty window', () => {
  assert.ok(/MOUNT_TIMEOUT_MS\s*=\s*\d+/.test(bootSource), 'the guard must have a start-up timeout');
  assert.ok(/data-jenesis-ready/.test(bootSource), 'the guard must wait for the interface to say it is up');
  assert.ok(/unhandledrejection/.test(bootSource), 'the guard must catch rejected promises');
});

check('the guard writes its diagnosis to the desktop log', () => {
  assert.ok(bootSource.includes('reportStartup'), 'the guard must report through the preload bridge');
  const preload = read('electron/preload.cjs');
  assert.ok(preload.includes('reportStartup'), 'the preload must expose reportStartup');
  assert.ok(preload.includes('genesis:startup-report'), 'the report must use its own IPC channel');
  assert.ok(!preload.includes('require(\'fs\')') && !preload.includes('require("fs")'),
    'the preload must never give the page file access');
});

check('the guard is safe to run anywhere: no network, no eval, no data access', () => {
  assert.ok(!/\beval\s*\(/.test(bootSource), 'the guard must not use eval');
  assert.ok(!/XMLHttpRequest|\bfetch\s*\(/.test(bootSource), 'the guard must not contact the network');
  assert.ok(!/localStorage\.setItem/.test(bootSource), 'the guard must not write to storage');
  assert.ok(!/genesis_session_token|password/i.test(bootSource), 'the guard must never touch credentials');
});

check('the guard never throws, whatever the page lacks', () => {
  // A start-up guard that throws would take the page down with it.
  assert.doesNotThrow(() => vm.runInNewContext(read('public/boot.js'), {}));
  assert.doesNotThrow(() => vm.runInNewContext(read('public/boot.js'), { window: {} }));
  const partial = runBootScript({ sandboxExtras: { setTimeout: (fn) => fn() } });
  assert.ok(partial.element.attributes['data-theme'], 'the theme is applied even on a minimal page');
});

check('the guard exposes its theme logic for the theme tests to execute', () => {
  const { sandbox } = runBootScript({ store: { jenesis_app: 'maintenance', 'jenesis_theme:maintenance': 'dark' } });
  assert.ok(sandbox.JENESIS_BOOT, 'public/boot.js must expose JENESIS_BOOT');
  assert.strictEqual(typeof sandbox.JENESIS_BOOT.applyJenesisTheme, 'function');
  assert.strictEqual(JSON.stringify(sandbox.JENESIS_BOOT.APP_IDS), JSON.stringify(['seller', 'maintenance', 'admin']));
});

// ---------------------------------------------------------------------------
// 3. A crash inside the interface is shown, not hidden
// ---------------------------------------------------------------------------
check('an interface that throws shows a translated message instead of a blank screen', () => {
  const app = read('src/App.jsx');
  assert.ok(app.includes('AppErrorBoundary'), 'App must wrap its content in an error boundary');
  const boundary = read('src/components/AppCrashScreen.jsx');
  assert.ok(boundary.includes('getDerivedStateFromError') || boundary.includes('componentDidCatch'),
    'the boundary must be a real React error boundary');
  assert.ok(boundary.includes('reportStartup'), 'a crash must be written to the desktop log');
  assert.ok(boundary.includes('password'), 'crash details must be scrubbed of credentials');
  for (const lang of ['en', 'fr', 'rw']) {
    const dict = readJson(`src/i18n/${lang}.json`);
    for (const key of ['title', 'subtitle', 'hint', 'retry', 'copy', 'copied']) {
      assert.ok(dict.crash && dict.crash[key], `${lang} must translate crash.${key}`);
    }
  }
});

check('the interface tells the shell when it is really mounted', () => {
  const main = read('src/main.jsx');
  assert.ok(main.includes('data-jenesis-ready'), 'the mounted interface must be marked ready');
  assert.ok(main.includes('jenesis-boot'), 'the start-up card must be removed once the interface mounts');
  assert.ok(main.includes("reportStartup('ready'") || main.includes('reportStartup(\'ready\''),
    'the interface must report a successful start to the desktop log');
});

// ---------------------------------------------------------------------------
// 4. The interface is packaged where every process can read it
// ---------------------------------------------------------------------------
const distLocation = require('../electron/dist-location.cjs');

check('the packaged interface is read from a real directory, not only from inside the archive', () => {
  const pkg = readJson('package.json');
  const resources = pkg.build.extraResources || [];
  const frontend = resources.find((entry) => entry.from === 'dist');
  assert.ok(frontend, 'the built interface must be shipped as an extra resource');
  assert.strictEqual(frontend.to, distLocation.RESOURCES_FRONTEND_DIR);
  assert.ok(
    (pkg.build.files || []).includes('dist/**/*'),
    'the copy inside the archive must stay as the fallback'
  );
});

check('the interface location prefers the real directory and falls back safely', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jenesis-frontend-'));
  const resources = path.join(tmp, 'resources', distLocation.RESOURCES_FRONTEND_DIR);
  const asar = path.join(tmp, 'app.asar', distLocation.ASAR_FRONTEND_DIR);
  fs.mkdirSync(resources, { recursive: true });
  fs.mkdirSync(asar, { recursive: true });
  fs.writeFileSync(path.join(asar, 'index.html'), '<html></html>');

  const onlyAsar = distLocation.resolveFrontendDir({ packaged: true, resourcesPath: path.join(tmp, 'resources'), appPath: path.join(tmp, 'app.asar') });
  assert.strictEqual(onlyAsar.kind, 'asar', 'without the extra resource the archive copy is used');
  assert.strictEqual(onlyAsar.indexHtml, path.join(asar, 'index.html'));

  fs.writeFileSync(path.join(resources, 'index.html'), '<html></html>');
  const both = distLocation.resolveFrontendDir({ packaged: true, resourcesPath: path.join(tmp, 'resources'), appPath: path.join(tmp, 'app.asar') });
  assert.strictEqual(both.kind, 'resources', 'the real directory wins: any process can read it');
  assert.strictEqual(both.indexHtml, path.join(resources, 'index.html'));

  const empty = distLocation.resolveFrontendDir({ packaged: true, resourcesPath: path.join(tmp, 'nope'), appPath: path.join(tmp, 'nope') });
  assert.strictEqual(empty.kind, 'missing', 'a package without an interface is reported, never guessed');
  assert.strictEqual(empty.indexHtml, null);

  const dev = distLocation.resolveFrontendDir({ packaged: false, resourcesPath: null, appPath: tmp });
  assert.strictEqual(dev.kind, 'missing', 'a development tree without a build is reported as missing');
});

// ---------------------------------------------------------------------------
// 5. The shell proves the interface is served before it shows the window
// ---------------------------------------------------------------------------
const mainSource = read('electron/main.cjs');

check('the shell verifies the built interface before the window is shown', () => {
  assert.ok(mainSource.includes('verifyInterface'), 'the shell must check the interface');
  assert.ok(mainSource.includes('ensureInterface'), 'the shell must be able to recover');
  assert.ok(mainSource.includes('id="root"'), 'the check must require the real start page');
  assert.ok(mainSource.includes('/boot.js'), 'the check must require the start-up guard');
  assert.ok(/ensureInterface\(\)/.test(mainSource) && /createWindow\(/.test(mainSource),
    'the check must run before the window opens');
});

check('a missing interface is retried with the other copy and then reported', () => {
  assert.ok(/frontendOverrideDir/.test(mainSource), 'the shell must be able to switch copies');
  assert.ok(mainSource.includes('showInterfaceError'), 'the shell must explain the failure');
  const dialog = /showInterfaceError[\s\S]{0,800}?business data is kept|Reinstalling JENESIS/.test(mainSource);
  assert.ok(dialog, 'the message must say what to do and that data is safe');
});

check('the start-up is logged well enough to diagnose it afterwards', () => {
  assert.ok(mainSource.includes('Interface directory:'), 'the log must record which copy was used');
  assert.ok(mainSource.includes('Interface check:'), 'the log must record the result of the check');
  assert.ok(mainSource.includes('genesis:startup-report'), 'the shell must receive the interface reports');
  assert.ok(/The interface did not report that it started/.test(mainSource),
    'a page that loads but never starts must be recorded');
  assert.ok(mainSource.includes('render-process-gone'), 'a lost renderer must be recorded');
  assert.ok(mainSource.includes('did-fail-load'), 'a failed load must be recorded');
});

check('the shell never shows a window it already knows is empty', () => {
  assert.ok(/reloadOnce\(/.test(mainSource), 'a failed or stalled load must be retried');
  assert.ok(/did not finish within/.test(mainSource), 'a stalled load must have a timeout');
  assert.ok(/showing it anyway/.test(mainSource), 'the window is shown even if ready-to-show never fires');
});

check('the packaged version identifies this corrected build', () => {
  const pkg = readJson('package.json');
  assert.strictEqual(pkg.version, '0.5.1');
  assert.strictEqual(pkg.build.win.artifactName, 'JEN 0.5.1 Setup.${ext}');
});

console.log(`--- ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
