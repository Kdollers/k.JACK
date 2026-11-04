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
 * These tests draw the real App component with React itself and read the
 * markup, so what is checked is what a user would actually see, in each
 * language.
 *
 * What they CANNOT see: nothing here opens a window or clicks a shortcut. The
 * gate is proven at the drawing level; the Windows shortcut that starts the
 * Settings application is only asserted from build/installer.nsh elsewhere.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ROOT, srcPath, installBrowserStubs, bundle, silenceServerRenderWarnings, escapeHtml } = require('./helpers/render-app.cjs');

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

// The real modules, so the refusal names the application exactly as the
// production code does — a stubbed title would hide a mismatch.
export { appTitle } from ${srcPath('src/appIdentity.js')};
import { APPS } from ${srcPath('src/appIdentity.js')};

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
silenceServerRenderWarnings();

async function main() {
  let buildError = null;
  try {
    const mod = await bundle({
      name: 'jenesis-app-gate',
      stubContext: STUB_CONTEXT,
      stubApi: STUB_API,
      entry: [
        "import React from 'react';",
        "import { renderToStaticMarkup } from 'react-dom/server';",
        `import App from ${srcPath('src/App.jsx')};`,
        'export function draw() { return renderToStaticMarkup(React.createElement(App)); }'
      ].join('\n')
    });
    renderApp = mod.draw;
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
    assert.ok(html.includes(escapeHtml(en.title)), `the closed screen must say "${en.title}"`);
    assert.ok(html.includes(escapeHtml(en.button)), 'the closed screen must offer a way out');
    // The message names the application, so the user knows which one refused.
    const body = escapeHtml(en.body.replace('{app}', 'JENESIS Settings & Access Point'));
    assert.ok(html.includes(body.slice(0, 40)), 'the message must name the application');
  });

  check('the refusal is translated, not left in English', () => {
    for (const lang of ['fr', 'rw']) {
      const dict = gateText(lang);
      const html = draw({ appId: 'settings', permissions: ['sales:read'], lang });
      assert.ok(html.includes(escapeHtml(dict.title)), `${lang}: the refusal must be translated`);
      assert.ok(html.includes(escapeHtml(dict.button)), `${lang}: the way out must be translated`);
      assert.ok(!html.includes(escapeHtml(gateText('en').title)), `${lang}: the refusal must not stay in English`);
    }
  });

  check('a user who holds the permission is let through to the application', () => {
    const en = gateText('en');
    const html = draw({ appId: 'settings', permissions: ['settings:access'] });
    assert.ok(!html.includes(escapeHtml(en.title)), 'the holder of settings:access must not be refused');
    assert.ok(html.length > 200, 'the application itself must draw, not a blank page');
  });

  check('the other three applications are open to every signed-in user', () => {
    const en = gateText('en');
    for (const appId of ['seller', 'maintenance', 'admin']) {
      const html = draw({ appId, permissions: ['sales:read'] });
      assert.ok(!html.includes(escapeHtml(en.title)), `${appId} must not demand a permission to be opened`);
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
