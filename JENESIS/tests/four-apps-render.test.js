'use strict';
/**
 * FOUR APPLICATIONS — DRAWING TESTS.
 *
 * Modification 4 turns JENESIS into four sub-applications. The requirement is
 * not that four sets of files exist: it is that a user opening any one of them
 * gets that application, in its own colour, with its own name, and with only
 * the screens it is allowed to have.
 *
 * The failure this is written against is the blank window. A missing import or
 * an absent value throws while React draws, the production build does not
 * notice, and the user is left with an empty screen. So each application is
 * drawn here with React itself and the markup is read back.
 *
 * What these CANNOT see: effects do not run in a server render, so anything
 * that only happens once data arrives is not covered, and nothing here opens a
 * Windows shortcut. The installer's four shortcuts are asserted separately
 * from build/installer.nsh.
 */
const assert = require('assert');
const { srcPath, installBrowserStubs, bundle, silenceServerRenderWarnings, escapeHtml } = require('./helpers/render-app.cjs');

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

/** The circumstances of one drawing. Read by the bundle through a global. */
const STATE = { appId: 'admin', isLauncher: false, activeView: 'dashboard', lang: 'en' };
globalThis.__JENESIS_APPS__ = STATE;

// An administrator: holds everything, so no permission gate can stand in for
// the screen we are trying to look at.
const ALL_PERMISSIONS = [
  'dashboard:read', 'sales:read', 'sales:write', 'purchases:read', 'purchases:write',
  'inventory:read', 'inventory:write', 'inventory:adjust', 'inventory:approve',
  'contacts:read', 'contacts:write', 'banking:read', 'banking:write',
  'accounting:read', 'accounting:write', 'reports:read', 'audit:read',
  'settings:manage', 'settings:access', 'stores:manage', 'users:manage',
  'company:manage', 'records:deactivate', 'records:delete', 'maintenance:read'
];

const STUB_CONTEXT = `
import React from 'react';

const company = {
  id: 'comp-apps-1', code: 'APP', name: 'Four Apps Company Ltd',
  currency_code: 'XAF', currency_symbol: 'XFA', currency_decimals: 2,
  fiscal_year_start: '01-01', fiscal_year_end: '12-31',
  inventory_valuation_method: 'WEIGHTED_AVERAGE', default_language: 'en'
};

const user = { id: 'usr-apps-1', username: 'admin', full_name: 'Apps Admin', role: 'admin' };

export function AppProvider({ children }) { return children; }

export { APPS, APP_IDS, appTitle } from ${srcPath('src/appIdentity.js')};
import { APPS } from ${srcPath('src/appIdentity.js')};

export function useApp() {
  const state = globalThis.__JENESIS_APPS__;
  return {
    currentCompany: company,
    companies: [company],
    user, currentUser: user,
    switchCompany: () => {},
    logout: () => {},
    permissions: ${JSON.stringify(ALL_PERMISSIONS)},
    hasPermission: (perm) => ${JSON.stringify(ALL_PERMISSIONS)}.includes(perm),
    loading: false,
    authState: 'ready',
    activeView: state.activeView,
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
  const state = globalThis.__JENESIS_APPS__;
  const app = APPS[state.appId];
  return {
    appId: state.appId,
    app,
    isLauncher: state.isLauncher,
    canOpen: (view) => (app ? app.views.includes(view) : false),
    landingView: app ? app.defaultView : 'dashboard'
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

console.log('--- FOUR APPLICATIONS DRAWING TESTS (real React render, no browser) ---');

installBrowserStubs();
silenceServerRenderWarnings();

/**
 * Screens that must never appear inside Network & Maintenance: it is a network
 * tool, not a second accounting program.
 */
const BUSINESS_SCREENS = [
  'accounting', 'sales', 'purchases', 'customers', 'suppliers', 'inventory', 'reports'
];

async function main() {
  let mod = null;
  let buildError = null;
  try {
    mod = await bundle({
      name: 'jenesis-four-apps-render',
      stubContext: STUB_CONTEXT,
      stubApi: STUB_API,
      entry: [
        "import React from 'react';",
        "import { renderToStaticMarkup } from 'react-dom/server';",
        `import App from ${srcPath('src/App.jsx')};`,
        `export { APPS, APP_IDS, appTitle } from ${srcPath('src/appIdentity.js')};`,
        'export function draw() { return renderToStaticMarkup(React.createElement(App)); }'
      ].join('\n')
    });
  } catch (err) {
    buildError = err;
  }

  check('all four applications can be compiled for Node', () => {
    assert.ok(!buildError, `they could not be compiled: ${buildError && buildError.message}`);
    assert.ok(mod && typeof mod.draw === 'function', 'the compiled shell must be usable');
  });

  if (!mod) return;

  const { draw, APPS, APP_IDS, appTitle } = mod;

  function render({ appId, activeView, lang = 'en', isLauncher = false }) {
    STATE.appId = appId;
    STATE.activeView = activeView;
    STATE.lang = lang;
    STATE.isLauncher = isLauncher;
    globalThis.localStorage.setItem('genesis_lang', lang);
    return draw();
  }

  check('there are exactly four applications', () => {
    assert.deepStrictEqual(APP_IDS.slice().sort(), ['admin', 'maintenance', 'seller', 'settings']);
  });

  for (const appId of APP_IDS) {
    const app = APPS[appId];

    check(`JENESIS ${appId} draws its own screens instead of a blank window`, () => {
      const html = render({ appId, activeView: app.defaultView });
      assert.ok(html.length > 500, `${appId} drew only ${html.length} characters — a blank screen`);
      assert.ok(!/>undefined<|NaN/.test(html), `${appId} must not print "undefined" or "NaN"`);
      assert.ok(/JENESIS/i.test(html), `${appId} must carry the JENESIS name`);
    });

    check(`JENESIS ${appId} is named and coloured as itself`, () => {
      const html = render({ appId, activeView: app.defaultView });
      assert.ok(
        html.includes(escapeHtml(appTitle(appId))),
        `${appId} must show its own name "${appTitle(appId)}"`
      );
      // The mark is drawn in the application's own tone, which is what keeps
      // the four windows tellable apart at a glance.
      assert.ok(
        html.includes(`data-jenesis-mark="${app.tone}"`),
        `${appId} must draw the JENESIS mark in its own tone (${app.tone})`
      );
    });

    check(`JENESIS ${appId} stays translated in French and Kinyarwanda`, () => {
      for (const lang of ['fr', 'rw']) {
        const html = render({ appId, activeView: app.defaultView, lang });
        assert.ok(html.length > 500, `${appId} in ${lang} drew only ${html.length} characters`);
        assert.ok(!/>undefined<|NaN/.test(html), `${appId} in ${lang} must not print "undefined" or "NaN"`);
      }
    });
  }

  check('Network & Maintenance offers no accounting, sales, purchase or stock screen', () => {
    const html = render({ appId: 'maintenance', activeView: 'maintenance' });
    // Its own menu must be exactly what the identity says it is.
    assert.deepStrictEqual(
      APPS.maintenance.views.slice().sort(),
      ['help', 'maintenance'],
      'Network & Maintenance may only open its own screen and Help'
    );
    for (const screen of BUSINESS_SCREENS) {
      assert.ok(
        !APPS.maintenance.views.includes(screen),
        `Network & Maintenance must not offer the ${screen} screen`
      );
    }
    assert.ok(html.length > 500, 'Network & Maintenance must still draw its own screen');
  });

  check('the launcher offers all four applications, each with its own mark', () => {
    const html = render({ appId: 'launcher', activeView: 'dashboard', isLauncher: true });
    for (const appId of APP_IDS) {
      assert.ok(
        html.includes(`data-jenesis-mark="${APPS[appId].tone}"`),
        `the launcher must show the ${appId} application in its own colour`
      );
    }
    assert.ok(html.length > 800, `the launcher drew only ${html.length} characters`);
    assert.ok(!/>undefined<|NaN/.test(html), 'the launcher must not print "undefined" or "NaN"');
  });

  check('the four applications are four different colours', () => {
    const colours = APP_IDS.map((id) => APPS[id].colour);
    assert.strictEqual(new Set(colours).size, 4, `the four colours must differ (got ${colours.join(', ')})`);
    const tones = APP_IDS.map((id) => APPS[id].tone);
    assert.strictEqual(new Set(tones).size, 4, `the four marks must differ (got ${tones.join(', ')})`);
  });
}

main().then(() => {
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
