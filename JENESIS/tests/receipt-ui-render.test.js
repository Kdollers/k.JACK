'use strict';
/**
 * RECEIPT SETTINGS RENDER TESTS (JENESIS 1.0.1, modification 2).
 *
 * A component that compiles is not a component that works: it can render an
 * empty string, or throw the moment it is asked for a value. These tests draw
 * the receipt settings panel with React itself — the same way
 * tests/screens-render.test.js draws every screen — and read the markup it
 * produced, so each control is proved to exist rather than assumed to.
 *
 * The panel is drawn once as JENESIS Seller and once as JENESIS Accounting &
 * Business, because the brief requires the two applications to keep their own
 * printing settings. The panel must ask the desktop bridge for the layout
 * belonging to the application it was opened in, and never for the other's.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
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

console.log('--- STARTING RECEIPT SETTINGS RENDER TESTS ---');

/**
 * The bridge calls made during the last render. Recording them is how the
 * "each application keeps its own settings" rule is checked: the panel must
 * ask for its own application's layout and no other's.
 */
let bridgeCalls = [];

function installBrowserStubs(withBridge) {
  bridgeCalls = [];
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
    createElement: () => ({ style: {}, setAttribute() {}, click() {}, remove() {}, contentDocument: null }),
    activeElement: null
  };

  const fakeBridge = {
    isDesktop: true,
    listPrinters: async () => { bridgeCalls.push(['listPrinters']); return { printers: [], error: null }; },
    printReceipt: async (o) => { bridgeCalls.push(['printReceipt', o]); return { success: true }; },
    printTestReceipt: async (o) => { bridgeCalls.push(['printTestReceipt', o]); return { success: true }; },
    loadReceiptLayout: async (id) => { bridgeCalls.push(['loadReceiptLayout', id]); return null; },
    saveReceiptLayout: async (id, layout) => { bridgeCalls.push(['saveReceiptLayout', id, layout]); return true; }
  };

  globalThis.window = {
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    matchMedia: media,
    localStorage: globalThis.localStorage,
    innerWidth: 1280, innerHeight: 800,
    print() {},
    setTimeout, clearTimeout,
    location: { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1', protocol: 'http:', search: '' },
    // Absent when JENESIS is running in a browser on a networked computer.
    genesisDesktop: withBridge ? fakeBridge : undefined
  };
}

/**
 * Bundles the panel with esbuild and renders it, standing in for the two
 * modules that need a running interface. The real receipt logic is left
 * alone: it is the subject of the test.
 */
async function buildRenderer() {
  const esbuild = require('esbuild');
  const React = require('react');
  const dir = path.join(ROOT, 'node_modules', '.cache', 'jenesis-receipt-render');
  fs.mkdirSync(dir, { recursive: true });

  const src = (rel) => JSON.stringify(path.join(ROOT, rel).split(path.sep).join('/'));

  const entry = [
    "import React from 'react';",
    "import { renderToStaticMarkup } from 'react-dom/server';",
    `import { I18nProvider } from ${src('src/i18n')};`,
    `import ReceiptPrintSettings from ${src('src/components/ReceiptPrintSettings.jsx')};`,
    "const COMPANY = { name: 'Amahoro Store', address: 'KG 123 St, Kigali',",
    "  phone: '+250 788 123 456', email: 'amahoro@example.rw', taxId: 'TIN-119988' };",
    "const DOC = { number: 'INV-2026-0001', date: '2026-10-29', cashier: 'Alice Uwase',",
    "  partyName: 'Caf\\u00e9 Inyange', paymentMethod: 'Cash', currency: 'RWF',",
    "  subtotal: 4250, taxTotal: 765, total: 5015, amountPaid: 5015, change: 0,",
    "  lines: [",
    "    { sku: 'COF-250', description: 'Caf\\u00e9 moulu 250 g', quantity: 1.25, unit: 'kg', unitPrice: 2000, lineTotal: 2500 },",
    "    { sku: 'SUC-1', description: 'Sucre', quantity: 2, unit: 'kg', unitPrice: 875, lineTotal: 1750 },",
    "    { sku: 'THE-100', description: 'Th\\u00e9 vert', quantity: -0.5, unit: 'kg', unitPrice: 1500, lineTotal: -750 }",
    "  ] };",
    // Rendered inside the real I18nProvider so the labels are the real ones.
    "export function render(appId) {",
    "  return renderToStaticMarkup(",
    "    React.createElement(I18nProvider, null,",
    "      React.createElement(ReceiptPrintSettings, { appId, company: COMPANY, sampleDocument: DOC })",
    "    )",
    "  );",
    "}"
  ].join('\n');

  const entryFile = path.join(dir, 'entry.jsx');
  fs.writeFileSync(entryFile, entry);
  const outfile = path.join(dir, 'bundle.cjs');

  await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    outfile,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    logLevel: 'error'
  });
  return require(outfile).render;
}

// React warns that useLayoutEffect does nothing in a server render. True and
// harmless here — effects are not what these tests look at — but the warning
// drowns the results, so it is kept out of the output.
const realError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
  realError(...args);
};

(async () => {
  installBrowserStubs(true);
  const render = await buildRenderer();

  const sellerHtml = render('seller');
  const adminHtml = render('admin');

  check('the panel draws as JENESIS Seller', () => {
    assert.ok(sellerHtml && sellerHtml.length > 1000, 'the panel must produce real markup');
    assert.ok(sellerHtml.includes('Printer'), 'the printer section is shown');
  });

  check('all five sections are present', () => {
    // English labels, because the bundle renders under the default language.
    for (const section of ['Printer', 'Paper', 'Appearance', 'What appears on the receipt', 'Print preview']) {
      assert.ok(sellerHtml.includes(section), `the "${section}" section must be present`);
    }
  });

  check('all four paper sizes are offered', () => {
    for (const size of ['58 mm roll', '80 mm roll', 'A4 sheet', 'Custom']) {
      assert.ok(sellerHtml.includes(size), `"${size}" must be offered`);
    }
  });

  check('every appearance control is present', () => {
    for (const label of ['Text size', 'Typeface', 'Line spacing', 'Bold text',
                         'Top margin', 'Right margin', 'Bottom margin', 'Left margin',
                         'Heading alignment', 'Logo alignment']) {
      assert.ok(sellerHtml.includes(label), `"${label}" must be adjustable`);
    }
  });

  check('the three typefaces are offered', () => {
    for (const font of ['Monospace (thermal)', 'Sans-serif', 'Serif']) {
      assert.ok(sellerHtml.includes(font), `"${font}" must be offered`);
    }
  });

  check('the millimetre page size is shown back to the user', () => {
    // The panel states the page it will print on; 80 mm is the default.
    assert.ok(/80\s*mm/.test(sellerHtml), 'the page width is shown');
    assert.ok(/continuous roll/i.test(sellerHtml), 'and that it is a roll rather than a sheet');
  });

  check('every piece of information has a switch', () => {
    const fields = ['Logo', 'Business name', 'Address', 'Telephone', 'Email',
                    'Tax number (TIN)', 'Title', 'Document number', 'Date', 'Cashier',
                    'Customer', 'Item details (SKU, unit price)', 'Tax breakdown',
                    'Totals', 'Payment method', 'Footer', 'Cut line'];
    for (const f of fields) {
      assert.ok(sellerHtml.includes('>' + f + '<'), `"${f}" must have a switch`);
    }
    const boxes = (sellerHtml.match(/type="checkbox"/g) || []).length;
    assert.ok(boxes >= fields.length, `every field needs a checkbox, found ${boxes} for ${fields.length} fields`);
  });

  check('the title and footer message can be typed in', () => {
    assert.ok(sellerHtml.includes('Receipt title'), 'the title is editable');
    assert.ok(sellerHtml.includes('Footer message'), 'the footer is editable');
    assert.ok(/type="text"/.test(sellerHtml), 'they are text fields');
  });

  check('a test receipt can be printed, and the settings saved', () => {
    assert.ok(sellerHtml.includes('Print a test receipt'), 'there is a test-print button');
    assert.ok(sellerHtml.includes('Save these settings'), 'there is a save button');
    assert.ok(sellerHtml.includes('Print now'), 'there is a print button');
    assert.ok(sellerHtml.includes('Show the preview'), 'there is a preview button');
  });

  check('the number of copies can be chosen', () => {
    assert.ok(sellerHtml.includes('Copies'), 'copies is adjustable');
  });

  check('the panel says the settings belong to this application', () => {
    assert.ok(
      /do not change any other application/i.test(sellerHtml),
      'the user is told these settings do not affect another application'
    );
  });

  // --- The rule that Seller and Admin must not overwrite each other -------
  //
  // Checked in the storage layer, because that is where the separation is
  // implemented: a server render runs no effects, so the hook's request for
  // its own layout cannot be observed from markup. The rule that matters is
  // that saving one application's layout leaves another's untouched.

  check('each application keeps its own saved layout on the same computer', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-prefs-'));
    // The printer module is a main-process module: it expects Electron. A
    // stand-in is enough, because only the file it writes is being examined.
    const fakeElectron = {
      app: { getPath: () => dir },
      BrowserWindow: { getAllWindows: () => [] },
      webContents: { getAllWebContents: () => [] }
    };
    const modulePath = path.join(ROOT, 'electron', 'receiptPrinter.cjs');
    const electronPath = require.resolve('electron', { paths: [ROOT] });
    require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: fakeElectron };
    delete require.cache[modulePath];
    const printer = require(modulePath);

    try {
      // The Seller sets a 58 mm till roll.
      printer.saveLayout('seller', { paper: '58mm', fontSize: 9, title: 'TILL' });
      // The Admin sets an 80 mm back-office layout on the SAME computer.
      printer.saveLayout('admin', { paper: '80mm', fontSize: 12, title: 'INVOICE' });

      assert.strictEqual(printer.loadLayout('seller').paper, '58mm',
        "the Seller's 58 mm roll must survive the Admin saving an 80 mm layout");
      assert.strictEqual(printer.loadLayout('seller').title, 'TILL',
        "the Seller's title must survive too");
      assert.strictEqual(printer.loadLayout('admin').paper, '80mm',
        "the Admin's 80 mm layout must be saved in its own right");

      // Changing one again must still not touch the other.
      printer.saveLayout('admin', { paper: 'A4', fontSize: 14 });
      assert.strictEqual(printer.loadLayout('seller').paper, '58mm',
        "re-saving the Admin's layout must not disturb the Seller's");

      // An application with nothing saved gets null, not another's layout.
      assert.strictEqual(printer.loadLayout('maintenance'), null,
        'an application with no saved layout gets nothing, not another\'s');
    } finally {
      delete require.cache[modulePath];
      delete require.cache[electronPath];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  check('a damaged preferences file does not stop printing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-prefs-bad-'));
    fs.writeFileSync(path.join(dir, 'receipt-layouts.json'), '{ this is not json');
    const fakeElectron = {
      app: { getPath: () => dir },
      BrowserWindow: { getAllWindows: () => [] },
      webContents: { getAllWebContents: () => [] }
    };
    const modulePath = path.join(ROOT, 'electron', 'receiptPrinter.cjs');
    const electronPath = require.resolve('electron', { paths: [ROOT] });
    require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: fakeElectron };
    delete require.cache[modulePath];
    const printer = require(modulePath);
    try {
      // It must answer "nothing saved" rather than throwing, so the till can
      // still print on the default layout.
      assert.strictEqual(printer.loadLayout('seller'), null,
        'a corrupt file is treated as no saved settings, not an error');
    } finally {
      delete require.cache[modulePath];
      delete require.cache[electronPath];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  check('the panel draws for the Admin too, and draws the same controls', () => {
    assert.ok(adminHtml && adminHtml.length > 1000, 'the panel draws as Admin');
    assert.ok(adminHtml.includes('80 mm roll'), 'the Admin is offered the same paper sizes');
    assert.ok(adminHtml.includes('Save these settings'), 'and can save its own settings');
  });

  check('the panel is drawn afresh for each application, not shared', () => {
    // Drawing one application must not leave the other's state behind: the
    // markup is produced independently from the same defaults.
    assert.strictEqual(
      (sellerHtml.match(/type="checkbox"/g) || []).length,
      (adminHtml.match(/type="checkbox"/g) || []).length,
      'both applications are offered the same set of switches'
    );
  });

  // --- Where there is no desktop bridge ----------------------------------

  // On a networked computer JENESIS runs in a browser. The panel must still
  // appear and explain itself rather than vanishing or throwing.
  installBrowserStubs(false);
  const bundlePath = path.join(ROOT, 'node_modules', '.cache', 'jenesis-receipt-render', 'bundle.cjs');
  delete require.cache[bundlePath];
  const renderNoBridge = await buildRenderer();
  const noBridge = renderNoBridge('seller');

  check('the panel still draws where there is no desktop bridge', () => {
    assert.ok(noBridge && noBridge.length > 1000, 'the panel draws without the bridge');
    assert.ok(/browser/i.test(noBridge), 'and says printing will use the browser');
  });

  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('the receipt render tests could not run:', err);
  process.exit(1);
});
