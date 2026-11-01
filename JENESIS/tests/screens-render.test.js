'use strict';
/**
 * SCREEN RENDER TESTS.
 *
 * "The screen does not work" is often a component that throws while it is
 * being drawn: an identifier that was never imported, or a value that is not
 * there yet. The production build does not notice either of them — an unknown
 * bare identifier is simply treated as a global — so the interface is the
 * first place the mistake appears, as a blank screen.
 *
 * These tests draw every screen with React itself (esbuild + react-dom/server,
 * both already installed for the build) and fail on the first error. The
 * contexts and the network are replaced by stubs, so what is being tested is
 * the drawing of the screen, not the data.
 *
 * What they CANNOT see: anything that only happens after data arrives or after
 * a click (effects do not run in a server render), and anything that depends
 * on a real browser. Those remain unverified here and are listed as such in
 * the testing report.
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

/** The contexts and the network, replaced so only the drawing is tested. */
const STUB_CONTEXT = `
import React from 'react';

const company = {
  id: 'comp-render-1', code: 'RND', name: 'Render Company Ltd',
  currency_code: 'USD', currency_symbol: '$', currency_decimals: 2,
  fiscal_year_start: '01-01', fiscal_year_end: '12-31',
  inventory_valuation_method: 'WEIGHTED_AVERAGE', default_language: 'en'
};

export function useApp() {
  return {
    currentCompany: company,
    companies: [company],
    user: { id: 'usr-render-1', username: 'admin', full_name: 'Render Admin', role: 'admin' },
    currentUser: { id: 'usr-render-1', username: 'admin', full_name: 'Render Admin', role: 'admin' },
    switchCompany: () => {},
    logout: () => {},
    permissions: [
      'dashboard:read', 'sales:read', 'sales:write', 'purchases:read', 'purchases:write',
      'inventory:read', 'inventory:write', 'inventory:adjust', 'inventory:approve',
      'contacts:read', 'contacts:write', 'banking:read', 'accounting:read',
      'reports:read', 'audit:read', 'settings:manage', 'stores:manage', 'users:manage'
    ],
    hasPermission: () => true,
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
  return {
    appId: 'admin',
    app: {
      id: 'admin', nameKey: 'identity.admin_name', shortKey: 'identity.admin_short', tone: 'admin', colour: 'blue',
      views: [
        'dashboard', 'sales', 'purchases', 'inventory', 'customers', 'suppliers',
        'banking', 'accounting', 'reports', 'settings', 'maintenance', 'help'
      ]
    },
    canOpen: () => true
  };
}
`;

const STUB_API = `
export function apiRequest() { return Promise.resolve([]); }
export function translateError(t, err) { return String((err && err.message) || err); }
export function interpolateVars(text) { return String(text); }
export function setApiBase() {}
export function getServerUrl() { return 'http://127.0.0.1:3000'; }
export function setServerUrl() {}
export function downloadAuthenticated() { return Promise.resolve(); }
`;

/** The screens, and what must be visible in each one's markup. */
const SCREENS = [
  { file: 'src/views/DashboardView.jsx', name: 'Dashboard', expect: /JENESIS|dashboard/i, keys: ['dashboard'] },
  { file: 'src/views/SalesView.jsx', name: 'Sales', expect: /./, keys: ['sales'] },
  { file: 'src/views/PurchasesView.jsx', name: 'Purchases', expect: /./, keys: ['purchases'] },
  { file: 'src/views/InventoryView.jsx', name: 'Inventory', expect: /./, keys: ['inventory'] },
  { file: 'src/views/ReportsView.jsx', name: 'Reports', expect: /./, keys: ['reports'] },
  { file: 'src/views/AccountingView.jsx', name: 'Accounting', expect: /./, keys: ['accounting'] },
  { file: 'src/views/BankingView.jsx', name: 'Banking', expect: /./, keys: ['banking'] },
  { file: 'src/views/CustomersView.jsx', name: 'Customers', expect: /./, keys: ['customers'] },
  { file: 'src/views/SuppliersView.jsx', name: 'Suppliers', expect: /./, keys: ['suppliers'] },
  { file: 'src/views/SettingsView.jsx', name: 'Settings', expect: /./, keys: ['settings'] },
  { file: 'src/views/MaintenanceView.jsx', name: 'Maintenance', expect: /./, keys: ['maintenance'] },
  { file: 'src/views/HelpView.jsx', name: 'Help', expect: /./, keys: ['help'] }
];

const OVERLAYS = [
  { file: 'src/components/CalculatorModal.jsx', name: 'Calculator', expect: /0<\/div>|calculator/i, props: { onClose: () => {} } },
  { file: 'src/components/ShortcutsReference.jsx', name: 'Shortcut reference', expect: /Ctrl|Alt/ },
  { file: 'src/components/Navbar.jsx', name: 'Header', expect: /./ },
  { file: 'src/components/Sidebar.jsx', name: 'Sidebar', expect: /./ },
  { file: 'src/components/ThemeToggle.jsx', name: 'Theme toggle', expect: /./ }
];

async function build() {
  const esbuild = require('esbuild');
  // The bundle must live inside the project so `react` resolves; node_modules
  // is git-ignored, so nothing is added to the repository.
  const dir = path.join(ROOT, 'node_modules', '.cache', 'jenesis-screens-render');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'stub-context.jsx'), STUB_CONTEXT);
  fs.writeFileSync(path.join(dir, 'stub-api.js'), STUB_API);

  const src = (rel) => JSON.stringify(path.join(ROOT, rel).split(path.sep).join('/'));
  const lines = [
    "import React from 'react';",
    "import { renderToStaticMarkup } from 'react-dom/server';",
    `import { I18nProvider } from ${src('src/i18n')};`,
    `import { ThemeProvider } from ${src('src/context/ThemeContext')};`,
    "const renders = {};"
  ];
  const all = [
    ...SCREENS.map((s) => ({ ...s, exportName: `view_${path.basename(s.file, '.jsx')}` })),
    ...OVERLAYS.map((s) => ({ ...s, exportName: `part_${path.basename(s.file, '.jsx')}` }))
  ];
  for (const s of all) {
    lines.push(`import ${s.exportName} from ${src(s.file)};`);
  }
  lines.push(
    'const wrap = (el) => renderToStaticMarkup(',
    '  React.createElement(ThemeProvider, { appId: "admin" },',
    '    React.createElement(I18nProvider, null, el)',
    '  )',
    ');'
  );
  for (const s of all) {
    const props = s.props ? JSON.stringify(s.props) : 'null';
    lines.push(`renders[${JSON.stringify(s.name)}] = () => wrap(React.createElement(${s.exportName}, ${props}));`);
  }
  lines.push('export { renders };');

  const entry = path.join(dir, 'entry.jsx');
  fs.writeFileSync(entry, lines.join('\n'));

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
  return require(outfile).renders;
}

console.log('--- SCREEN RENDER TESTS (every screen must draw, without a browser) ---');

installBrowserStubs();

// React warns that useLayoutEffect does nothing in a server render. That is
// true and harmless here — effects are not what these tests are looking at —
// but the warning drowns the results, so it is kept out of the output.
const realError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
  realError(...args);
};

async function main() {
  let renders = null;
  let buildError = null;
  try {
    renders = await build();
  } catch (err) {
    buildError = err;
  }

  check('the interface can be compiled for Node', () => {
    assert.ok(!buildError, `the screens could not be compiled: ${buildError && buildError.message}`);
    assert.ok(renders && typeof renders === 'object', 'the compiled screens must be usable');
  });

  if (!renders) return;

  for (const screen of SCREENS) {
    check(`${screen.name} draws without an error`, () => {
      const html = renders[screen.name]();
      assert.ok(typeof html === 'string' && html.length > 0, `${screen.name} produced no markup`);
      assert.ok(screen.expect.test(html), `${screen.name} markup does not look like ${screen.name}`);
      assert.ok(!/>undefined<|NaN/.test(html), `${screen.name} must not print "undefined" or "NaN"`);
    });
  }

  for (const part of OVERLAYS) {
    check(`${part.name} draws without an error`, () => {
      const html = renders[part.name]();
      assert.ok(typeof html === 'string' && html.length > 0, `${part.name} produced no markup`);
      assert.ok(part.expect.test(html), `${part.name} markup does not look like ${part.name}`);
    });
  }

  check('the calculator draws its keys and its display', () => {
    const html = renders.Calculator();
    for (const key of ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '+', '=', 'C']) {
      assert.ok(html.includes(`>${key}<`), `the calculator must show the ${key} key`);
    }
    assert.ok(/data-testid="calculator-display"/.test(html), 'the calculator must show its display');
  });

  check('the header names the keys the shortcut list really uses', () => {
    const html = renders.Header();
    assert.ok(html.includes('Ctrl+Shift+K'), 'the calculator button must advertise Ctrl+Shift+K');
    assert.ok(html.includes('Ctrl+Shift+M'), 'the Messenger button must advertise Ctrl+Shift+M');
    assert.ok(
      !/calculator[^<]*\(Ctrl\+Shift\+C\)/.test(html),
      'the calculator must not advertise the Customers shortcut'
    );
  });
}

main().then(() => {
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
}).catch((err) => {
  console.log(`  ✗ the screen render suite could not run\n      ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
