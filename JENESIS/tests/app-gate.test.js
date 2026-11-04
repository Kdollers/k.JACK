'use strict';
/**
 * APPLICATION ACCESS GATE TESTS.
 *
 * Modification 4 gives JENESIS four sub-applications. One of them — JENESIS
 * Settings & Access Point — changes the company record, the users and their
 * permissions, so it is not for everybody: an application may name a
 * permission a user must hold simply to open it.
 *
 * Without that gate the failure was silent and ugly: a Seller who opened the
 * yellow shortcut landed inside the settings screens, and every button there
 * was refused by the server. The screen looked broken rather than closed.
 *
 * These tests draw the real App component with React itself (esbuild +
 * react-dom/server, both already installed for the build) and read the markup,
 * so what is checked is what a user would actually see, in each language.
 *
 * What they CANNOT see: nothing here opens a window or clicks a shortcut.
 * The gate is proven at the drawing level; the Windows shortcut that starts the
 * Settings application is only asserted from build/installer.nsh elsewhere.
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
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
  }
}

// ---------------------------------------------------------------------------
// The browser the interface expects to find while it renders.
// ---------------------------------------------------------------------------
function installBrowserStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  const media = () => ({
    matches: false,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });
  globalThis.matchMedia = media;
  globalThis.document = {
    documentElement: { classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} },
    body: { classList: { add() {}, remove() {}, toggle() {} }, style: {} },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, click() {} }),
    activeElement: null
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() {},
    matchMedia: media,
    localStorage: globalThis.localStorage,
    innerWidth: 1280, innerHeight: 800,
    print() {},
    setTimeout, clearTimeout,
    location: { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1', protocol: 'http:' }
  };
}

/**
 * The state a single render is made under. The bundle below reads it through a
 * global, so one compilation serves every case.
 */
const GATE = { appId: 'settings', permissions: [], lang: 'en' };
globalThis.__JENESIS_GATE__ = GATE;

const STUB_CONTEXT = `
import React from 'react';

const company = {
  id: 'comp-gate-1', code: 'GAT', name: 'Gate Company Ltd',
  currency_code: 'USD', currency_symbol: '$', currency_decimals: 2,
  fiscal_year_start: '01-01', fiscal_year_end: '12-31',
  inventory_valuation_method: 'WEIGHTED_AVERAGE', default_language: 'en'
};

const user = { id: 'usr-gate-1', username: 'seller1', full_name: 'Gate Seller', role: 'sales' };

export function AppProvider({ children }) { return children; }

export function useApp() {
  const gate = globalThis.__JENESIS_GATE__;
  return {
    currentCompany: company,
    companies: [company],
    user, currentUser: user,
    switchCompany: () => {},
    logout: () => {},
    permissions: gate.permissions,
    hasPermission: (perm) => gate.permissions.includes(perm),
    // Signed in and finished loading, so neither the sign-in screen nor the
    // "initializing" screen can stand in for the gate we are looking for.
    loading: false,
    authState: 'ready',
    activeView: 'dashboard',
    setActiveView: () => {},
    showToast: () => {},
    refreshKey: 0,
    triggerRefresh: () => {},
    formatCurrency: (n) => String(n),
    formatDate: (d) => String(d || ''),
    formatNumber: (n) => String(n)
  };
}

export function useEscapeLayer() { return undefined; }
export function useShortcutAction() { return undefined; }
export function useShortcuts() {
  return {
    registerLayer: () => () => {},
    registerAction: () => () => {},
    openHelp: () => {}, triggerRefresh: () => {},
    goBack: () => false, goForward: () => false,
    canGoBack: false, canGoForward: false,
    calculatorOpen: false, openCalculator: () => {}, closeCalculator: () => {}, toggleCalculator: () => {},
    messengerOpen: false, openMessenger: () => {}, closeMessenger: () => {}, toggleMessenger: () => {},
    messengerUnread: 0, setMessengerUnread: () => {}, refreshMessengerUnread: () => {},
    referenceOpen: false, openReference: () => {}, closeReference: () => {}, toggleReference: () => {},
    catalogue: [], refreshKey: 0
  };
}
// The real module, so the refusal names the application exactly as the
// production code does — a stubbed title would hide a mismatch.
export { appTitle } from __APP_IDENTITY__;
import { APPS } from __APP_IDENTITY__;

export function ShortcutsProvider({ children }) { return children; }
export function AppModeProvider({ children }) { return children; }
export function useAppMode() {
  const gate = globalThis.__JENESIS_GATE__;
  return {
    appId: gate.appId,
    app: APPS[gate.appId],
    isLauncher: false,
    canOpen: () => true,
    landingView: 'settings'
  };
}
`;

const STUB_API = `
export function apiRequest() { return Promise.resolve([]); }
export function getSessionToken() { return 'stub-session-token'; }
export function translateError(t, err) { return String((err && err.message) || err); }
export function interpolateVars(text) { return String(text); }
export function setApiBase() {}
export function getServerUrl() { return 'http://127.0.0.1:3000'; }
export function setServerUrl() {}
export function downloadAuthenticated() { return Promise.resolve(); }
`;

let renderApp = null;

async function build() {
  const esbuild = require('esbuild');
  const dir = path.join(ROOT, 'node_modules', '.cache', 'jenesis-app-gate');
  fs.mkdirSync(dir, { recursive: true });
  // appTitle is re-exported from the real src/appIdentity.js, which lives
  // outside the cache directory, so the path is written in as an absolute one.
  const identityPath = path.join(ROOT, 'src', 'appIdentity.js').split(path.sep).join('/');
  fs.writeFileSync(
    path.join(dir, 'stub-context.jsx'),
    STUB_CONTEXT.split('__APP_IDENTITY__').join(JSON.stringify(identityPath))
  );
  fs.writeFileSync(path.join(dir, 'stub-api.js'), STUB_API);

  const src = (rel) => JSON.stringify(path.join(ROOT, rel).split(path.sep).join('/'));
  const entry = path.join(dir, 'entry.jsx');
  fs.writeFileSync(entry, [
    "import React from 'react';",
    "import { renderToStaticMarkup } from 'react-dom/server';",
    `import App from ${src('src/App.jsx')};`,
    "export function draw() { return renderToStaticMarkup(React.createElement(App)); }"
  ].join('\n'));

  const outfile = path.join(dir, 'bundle.cjs');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    logLevel: 'error',
    plugins: [{
      name: 'stub-contexts',
      setup(build) {
        const map = {
          'context/AppContext': path.join(dir, 'stub-context.jsx'),
          'context/ShortcutsContext': path.join(dir, 'stub-context.jsx'),
          'context/AppModeContext': path.join(dir, 'stub-context.jsx'),
          'services/api': path.join(dir, 'stub-api.js')
        };
        build.onResolve({ filter: /(context|services)\/(AppContext|ShortcutsContext|AppModeContext|api)$/ }, (args) => {
          const hit = Object.keys(map).find((k) => args.path.endsWith(k));
          return hit ? { path: map[hit] } : null;
        });
      }
    }]
  });
  return require(outfile).draw;
}

/** What React writes into markup for these characters. */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Draws the application under one set of circumstances. */
function draw({ appId, permissions = [], lang = 'en' }) {
  GATE.appId = appId;
  GATE.permissions = permissions;
  GATE.lang = lang;
  globalThis.localStorage.setItem('genesis_lang', lang);
  return renderApp();
}

// The words the gate must use, taken from the translation files themselves so
// a renamed key cannot silently empty the screen.
function gateText(lang) {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'));
  return {
    title: dict.identity.no_access_title,
    body: dict.identity.no_access_body,
    button: dict.identity.open_another
  };
}

console.log('--- APPLICATION ACCESS GATE TESTS (real React render, no browser) ---');

installBrowserStubs();

const realError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
  realError(...args);
};

async function main() {
  let buildError = null;
  try {
    renderApp = await build();
  } catch (err) {
    buildError = err;
  }

  check('the application shell can be compiled for Node', () => {
    assert.ok(!buildError, `the shell could not be compiled: ${buildError && buildError.message}`);
    assert.ok(typeof renderApp === 'function', 'the compiled shell must be usable');
  });

  if (!renderApp) return;

  check('a user without the permission is stopped at the Settings application', () => {
    const en = gateText('en');
    const html = draw({ appId: 'settings', permissions: ['sales:read', 'dashboard:read'] });
    assert.ok(html.includes(esc(en.title)), `the closed screen must say "${en.title}"`);
    assert.ok(html.includes(esc(en.button)), 'the closed screen must offer a way out');
    // The message names the application, so the user knows which one refused.
    const body = esc(en.body.replace('{app}', 'JENESIS Settings & Access Point'));
    assert.ok(html.includes(body.slice(0, 40)), 'the message must name the application');
  });

  check('the refusal is translated, not left in English', () => {
    for (const lang of ['fr', 'rw']) {
      const dict = gateText(lang);
      const html = draw({ appId: 'settings', permissions: ['sales:read'], lang });
      assert.ok(html.includes(esc(dict.title)), `${lang}: the refusal must be translated`);
      assert.ok(html.includes(esc(dict.button)), `${lang}: the way out must be translated`);
      assert.ok(!html.includes(esc(gateText('en').title)), `${lang}: the refusal must not stay in English`);
    }
  });

  check('a user who holds the permission is let through to the application', () => {
    const en = gateText('en');
    const html = draw({ appId: 'settings', permissions: ['settings:access'] });
    assert.ok(!html.includes(esc(en.title)), 'the holder of settings:access must not be refused');
    assert.ok(html.length > 200, 'the application itself must draw, not a blank page');
  });

  check('the other three applications are open to every signed-in user', () => {
    const en = gateText('en');
    for (const appId of ['seller', 'maintenance', 'admin']) {
      const html = draw({ appId, permissions: ['sales:read'] });
      assert.ok(!html.includes(esc(en.title)), `${appId} must not demand a permission to be opened`);
      assert.ok(html.length > 200, `${appId} must draw its own screens`);
    }
  });

  check('the gate is what stops the user, not an empty page', () => {
    const html = draw({ appId: 'settings', permissions: [] });
    assert.ok(!/>undefined<|NaN/.test(html), 'the closed screen must not print "undefined" or "NaN"');
    assert.ok(/JENESIS/i.test(html), 'the closed screen must still carry the JENESIS mark');
  });
}

main().then(() => {
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
