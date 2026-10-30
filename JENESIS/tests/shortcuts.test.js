'use strict';
/**
 * KEYBOARD SHORTCUT TESTS (Part C + Part D rules).
 *
 * These tests run without a browser: src/shortcuts.js is pure logic, so the
 * rules can be verified directly, and the React sources are inspected to prove
 * the structural requirements:
 *   - exactly ONE keydown listener exists in the whole application,
 *   - every documented shortcut has a real destination,
 *   - typing is never interrupted,
 *   - Escape is layered and never closes the application,
 *   - the calculator captures keys without leaking them to the app.
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

// src/shortcuts.js is an ES module; load it in a sandbox for these assertions.
function loadShortcuts() {
  const file = path.join(ROOT, 'src', 'shortcuts.js');
  const source = fs.readFileSync(file, 'utf8');
  const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1]);
  const body = source.replace(/export (function|const)/g, '$1');
  const sandbox = { module: { exports: {} }, exports: null };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(`${body}\n;module.exports = { ${names.join(', ')} };`, sandbox, { filename: 'shortcuts.js' });
  return sandbox.module.exports;
}

const S = loadShortcuts();

/** Minimal DOM-ish event object for the pure helpers. */
function ev(over) {
  return Object.assign({
    key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null
  }, over);
}

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('--- KEYBOARD SHORTCUT TESTS (single listener, typing safety, destinations) ---');

check('combos are normalised whatever the casing or order', () => {
  assert.strictEqual(S.normalizeCombo('ctrl+n'), 'Ctrl+N');
  assert.strictEqual(S.normalizeCombo('Shift+Ctrl+C'), 'Ctrl+Shift+C');
  assert.strictEqual(S.normalizeCombo('alt+ArrowLeft'), 'Alt+ArrowLeft');
  assert.strictEqual(S.normalizeCombo('F2'), 'F2');
  assert.strictEqual(S.normalizeCombo('escape'), 'Escape');
  assert.ok(S.combosEqual('ctrl+shift+c', 'Ctrl+Shift+C'));
});

check('key names come from the layout-independent key code', () => {
  assert.strictEqual(S.comboFromEvent(ev({ key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+C');
  assert.strictEqual(S.comboFromEvent(ev({ key: '!', code: 'Digit1', shiftKey: true })), 'Shift+1');
  assert.strictEqual(S.comboFromEvent(ev({ key: '1', code: 'Numpad1' })), '1');
  assert.strictEqual(S.comboFromEvent(ev({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true })), 'Alt+ArrowLeft');
  assert.strictEqual(S.comboFromEvent(ev({ key: 'F3', code: 'F3' })), 'F3');
  assert.strictEqual(S.comboFromEvent(ev({ key: '/', code: 'Slash', ctrlKey: true })), 'Ctrl+/');
  assert.strictEqual(S.comboFromEvent(ev({ key: 'Enter', code: 'Enter' })), 'Enter');
  assert.strictEqual(S.comboFromEvent(ev({ key: ' ', code: 'Space' })), 'Space');
});

check('text fields are recognised (and checkboxes/buttons are not)', () => {
  assert.strictEqual(S.isTypingTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.strictEqual(S.isTypingTarget({ tagName: 'INPUT', type: 'number' }), true);
  assert.strictEqual(S.isTypingTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.strictEqual(S.isTypingTarget({ tagName: 'INPUT', type: 'radio' }), false);
  assert.strictEqual(S.isTypingTarget({ tagName: 'INPUT', type: 'button' }), false);
  assert.strictEqual(S.isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.strictEqual(S.isTypingTarget({ tagName: 'SELECT' }), true);
  assert.strictEqual(S.isTypingTarget({ isContentEditable: true }), true);
  assert.strictEqual(S.isTypingTarget({ tagName: 'DIV' }), false);
  assert.strictEqual(S.isTypingTarget(null), false);
});

check('typing is never interrupted: only function keys, Esc and Alt/Shift combos get through', () => {
  assert.strictEqual(S.allowedWhileTyping('F2'), true);
  assert.strictEqual(S.allowedWhileTyping('Escape'), true);
  assert.strictEqual(S.allowedWhileTyping('Alt+ArrowLeft'), true);
  assert.strictEqual(S.allowedWhileTyping('Ctrl+Shift+C'), true);
  assert.strictEqual(S.allowedWhileTyping('Ctrl+N'), false, 'plain Ctrl+letter must not fire while typing');
  assert.strictEqual(S.allowedWhileTyping('Ctrl+P'), false);
  assert.strictEqual(S.allowedWhileTyping('N'), false, 'a bare letter is typing, not a shortcut');
});

check('matchesEvent combines the combo and the typing guard', () => {
  const typing = { tagName: 'INPUT', type: 'text' };
  assert.strictEqual(S.matchesEvent('F3', ev({ key: 'F3', code: 'F3', target: typing })), true);
  assert.strictEqual(S.matchesEvent('Ctrl+N', ev({ key: 'n', code: 'KeyN', ctrlKey: true, target: typing })), false);
  assert.strictEqual(S.matchesEvent('Ctrl+N', ev({ key: 'n', code: 'KeyN', ctrlKey: true, target: { tagName: 'DIV' } })), true);
  assert.strictEqual(S.matchesEvent('F2', ev({ key: 'F5', code: 'F5' })), false);
});

check('escape layers close top-most first (priority, then registration order)', () => {
  const layers = [
    { id: 'screen', priority: 50, seq: 1, onEscape: () => {} },
    { id: 'panel', priority: 80, seq: 2, onEscape: () => {} },
    { id: 'dialog', priority: 100, seq: 3, onEscape: () => {} }
  ];
  assert.strictEqual(S.topEscapeLayer(layers).id, 'dialog');
  const two = [
    { id: 'first', priority: 100, seq: 1, onEscape: () => {} },
    { id: 'second', priority: 100, seq: 2, onEscape: () => {} }
  ];
  assert.strictEqual(S.topEscapeLayer(two).id, 'second', 'the newest dialog of equal priority wins');
  assert.strictEqual(S.topEscapeLayer(layers.filter((l) => l.id !== 'dialog')).id, 'panel');
  assert.strictEqual(S.topEscapeLayer([]), null);
  assert.strictEqual(S.topEscapeLayer([{ id: 'no-escape', priority: 200 }]), null);
});

check('only a declared key-capturing layer receives raw keys', () => {
  const layers = [
    { id: 'panel', priority: 80, captureKeys: false, onKey: () => true },
    { id: 'calculator', priority: 90, captureKeys: true, onKey: () => true }
  ];
  assert.strictEqual(S.keyCaptureLayer(layers).id, 'calculator');
  assert.strictEqual(S.keyCaptureLayer(layers.filter((l) => l.id !== 'calculator')), null);
});

check('actions are resolved by order and can disable themselves with when()', () => {
  const actions = [
    { id: 'screen', combo: 'F2', order: 10, when: () => false },
    { id: 'other', combo: 'F2', order: 5, when: () => true }
  ];
  assert.strictEqual(S.resolveAction(actions, 'F2', ev({})).id, 'other', 'a disabled handler must not win');
  const plain = [
    { id: 'low', combo: 'F3', order: 1 },
    { id: 'high', combo: 'F3', order: 20 }
  ];
  assert.strictEqual(S.resolveAction(plain, 'F3', ev({})).id, 'high');
  assert.strictEqual(S.resolveAction(plain, 'F4', ev({})), null);
  assert.strictEqual(S.resolveAction([{ id: 'all', combo: 'F2', when: () => false }], 'F2', ev({})).id, 'all',
    'if nothing is usable the registered action still answers, so the key is not lost');
});

check('the reference list is searchable by keys, action and group', () => {
  const entries = [
    { id: 'print', combo: 'F3', label: 'Print the selected document', group: 'document' },
    { id: 'settle', combo: 'F2', label: 'Settle the selected document', group: 'document' },
    { id: 'messenger', combo: 'Ctrl+K', label: 'Open Messenger', group: 'app' }
  ];
  assert.strictEqual(S.searchShortcuts(entries, '').length, 3);
  assert.deepStrictEqual(S.searchShortcuts(entries, 'print').map((e) => e.id), ['print']);
  assert.deepStrictEqual(S.searchShortcuts(entries, 'f2').map((e) => e.id), ['settle']);
  assert.deepStrictEqual(S.searchShortcuts(entries, 'document').map((e) => e.id), ['print', 'settle']);
  assert.deepStrictEqual(S.searchShortcuts(entries, 'ctrl k').map((e) => e.id), ['messenger'], 'multi-term search');
  assert.deepStrictEqual(S.searchShortcuts(entries, 'nothing here'), []);
});

check('the catalogue is consistent and translated in all three languages', () => {
  const ids = S.SHORTCUTS.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'shortcut ids are unique');
  for (const item of S.SHORTCUTS) {
    assert.strictEqual(S.normalizeCombo(item.combo), item.combo, `${item.id} combo must be canonical`);
    assert.ok(['document', 'navigation', 'app'].includes(item.group), `${item.id} group`);
  }
  for (const lang of ['en', 'fr', 'rw']) {
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'));
    const section = dict.shortcuts;
    assert.ok(section, `shortcuts section missing in ${lang}`);
    for (const item of S.SHORTCUTS) {
      assert.ok(section[item.key], `shortcuts.${item.key} missing in ${lang}`);
      assert.ok(section[item.key].trim().length > 0);
    }
  }
});

check('exactly one keydown listener exists in the whole application', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.ok(files.length > 20);
  const withListeners = files
    .map((f) => ({ file: path.relative(ROOT, f).split(path.sep).join('/'), source: fs.readFileSync(f, 'utf8') }))
    .filter((f) => /addEventListener\(\s*['"]keydown['"]/.test(f.source));
  assert.deepStrictEqual(
    withListeners.map((f) => f.file),
    ['src/context/ShortcutsContext.jsx'],
    'only the shortcut provider may listen for keydown (no duplicate listeners)'
  );
});

check('the provider handles Escape first and never quits the application', () => {
  const src = readSrc('src/context/ShortcutsContext.jsx');
  assert.ok(/if \(combo === 'Escape'\)/.test(src), 'Escape is handled before anything else');
  assert.ok(/const layer = topEscapeLayer\(layers\)/.test(src));
  assert.ok(/if \(goBack\(\)\)/.test(src), 'with nothing open Escape goes back to the previous screen');
  assert.ok(!/app\.quit|window\.close|process\.exit/.test(src), 'no shortcut may close the application');
});

check('every catalogue shortcut has a real destination in the code', () => {
  const provider = readSrc('src/context/ShortcutsContext.jsx');
  const builtinBlock = /const builtin = \{([\s\S]*?)\}\[combo\];/.exec(provider);
  assert.ok(builtinBlock, 'the provider must define its built-in handlers in one object');
  const builtins = new Set(
    [...builtinBlock[1].matchAll(/'?([A-Za-z0-9]+(?:\+[A-Za-z0-9]+)*)'?:\s*\(\)\s*=>/g)].map((m) => m[1])
      .concat([...builtinBlock[1].matchAll(/'([^']+)':\s*\(\)\s*=>/g)].map((m) => m[1]))
  );
  const srcFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.jsx?$/.test(entry.name)) srcFiles.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(ROOT, 'src'));
  const registered = new Set(
    srcFiles.join('\n').match(/useShortcutAction\(\s*['"]([^'"]+)['"]/g)
      ? srcFiles.join('\n').match(/useShortcutAction\(\s*['"]([^'"]+)['"]/g).map((m) => /['"]([^'"]+)['"]/.exec(m)[1])
      : []
  );
  for (const item of S.SHORTCUTS) {
    const combo = S.normalizeCombo(item.combo);
    const inBuiltins = [...builtins].some((b) => S.normalizeCombo(b) === combo);
    const registeredSomewhere = [...registered].some((r) => S.normalizeCombo(r) === combo);
    assert.ok(
      inBuiltins || registeredSomewhere || combo === 'Escape',
      `${combo} (${item.id}) has no destination: neither a builtin handler nor a registered action`
    );
  }
});

check('F2/F3/Ctrl+N are registered by the screens that own them', () => {
  const sales = readSrc('src/views/SalesView.jsx');
  const purchases = readSrc('src/views/PurchasesView.jsx');
  assert.ok(/useShortcutAction\('F2'/.test(sales) && /useShortcutAction\('F2'/.test(purchases), 'F2 settles on both screens');
  assert.ok(/useShortcutAction\('F3'/.test(sales) && /useShortcutAction\('F3'/.test(purchases), 'F3 prints on both screens');
  assert.ok(/useShortcutAction\('Ctrl\+N'/.test(sales) && /useShortcutAction\('Ctrl\+N'/.test(purchases));
  // F2 must be a no-op with a clear message when nothing is selected.
  assert.ok(/shortcuts\.settle_none/.test(sales) && /shortcuts\.settle_none/.test(purchases));
});

check('the calculator captures the keyboard without leaking shortcuts', () => {
  const calc = readSrc('src/components/CalculatorModal.jsx');
  assert.ok(/captureKeys:\s*true/.test(calc), 'the calculator is the key-capturing layer');
  assert.ok(!/addEventListener\(\s*['"]keydown['"]/.test(calc), 'no private keydown listener');
  assert.ok(/event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey/.test(calc), 'modifier combos stay with the application');
  assert.ok(/\^F\\d\{1,2\}\$/.test(calc), 'function keys stay with the application');
  for (const key of ['0', '9']) {
    assert.ok(new RegExp(`event\\.key >= '0' && event\\.key <= '9'`).test(calc), `digits handled (${key})`);
  }
  assert.ok(calc.includes("event.key === '+'"), 'plus is handled');
  assert.ok(calc.includes("event.key === '*'"), 'multiply is handled');
  assert.ok(calc.includes("event.key === '/'"), 'divide is handled');
  assert.ok(/event\.key === 'Enter' \|\| event\.key === '='/.test(calc), 'Enter and = give the result');
  assert.ok(/event\.key === 'Backspace'/.test(calc) && /event\.key === 'Escape'/.test(calc));
  assert.ok(/divide_by_zero/.test(calc), 'division by zero shows a real message');
});

check('a key the capture layer refuses still reaches the application', () => {
  const provider = readSrc('src/context/ShortcutsContext.jsx');
  assert.ok(
    /if \(capture && capture\.onKey\(event, combo\)\)/.test(provider),
    'the provider must fall through when the capture layer does not handle a key'
  );
  assert.ok(
    /falls? through to the application shortcuts below/.test(provider),
    'the fall-through must be documented in the provider'
  );
});

check('the calculator keeps accounting precision (no floating-point noise)', () => {
  const calc = readSrc('src/components/CalculatorModal.jsx');
  assert.ok(/PRECISION = 1e8/.test(calc), 'results are rounded to 8 decimals');
  assert.ok(/Math\.round\(n \* PRECISION\) \/ PRECISION/.test(calc));
  assert.ok(/s === '-0' \? '0' : s/.test(calc), 'negative zero is never displayed');
});

check('permission-aware: shortcuts check permissions before acting', () => {
  const sales = readSrc('src/views/SalesView.jsx');
  const purchases = readSrc('src/views/PurchasesView.jsx');
  assert.ok(/hasPermission\('sales:write'\)/.test(sales), 'Ctrl+N is refused without sales:write');
  assert.ok(/hasPermission\('purchases:write'\)/.test(purchases), 'Ctrl+N is refused without purchases:write');
  assert.ok(/hasPermission\('inventory:write'\)/.test(readSrc('src/views/InventoryView.jsx')));
  assert.ok(/hasPermission\('banking:write'\)/.test(readSrc('src/views/BankingView.jsx')));
});

// --- The user's shortcut table, verified key by key -------------------------
// Every line of the delivered table must match the catalogue exactly.
const USER_TABLE = [
  ['F1', 'help'], ['F2', 'settle'], ['F3', 'print'], ['F5', 'refresh'],
  ['Escape', 'escape'], ['Ctrl+S', 'save'], ['Ctrl+N', 'new'], ['Ctrl+E', 'edit'],
  ['Ctrl+F', 'search'], ['Ctrl+P', 'printCtrl'], ['Ctrl+D', 'duplicate'],
  ['Ctrl+Enter', 'submit'], ['Alt+ArrowLeft', 'back'],
  ['Ctrl+Shift+S', 'openSales'], ['Ctrl+Shift+R', 'newReceipt'],
  ['Ctrl+Shift+C', 'searchCustomers'], ['Ctrl+Shift+P', 'openPurchases'],
  ['Ctrl+Shift+V', 'searchSuppliers'], ['Ctrl+Shift+N', 'newPurchase'],
  ['Ctrl+Shift+I', 'openInventory'], ['Ctrl+Shift+F', 'searchProducts'],
  ['Ctrl+Shift+T', 'stockTransfers'], ['Ctrl+Shift+A', 'openAccounting'],
  ['Ctrl+Shift+B', 'openBanking'], ['Ctrl+Shift+L', 'openLedger'],
  ['Ctrl+Shift+G', 'openReports'], ['Ctrl+Shift+K', 'calculator'],
  ['Ctrl+Shift+M', 'messenger']
];

check("the catalogue matches the user's shortcut table exactly", () => {
  for (const [combo, id] of USER_TABLE) {
    const item = S.SHORTCUTS.find((x) => x.id === id);
    assert.ok(item, `the catalogue must define ${id}`);
    assert.strictEqual(
      S.normalizeCombo(item.combo), S.normalizeCombo(combo),
      `${id} must be ${combo} (found ${item.combo})`
    );
  }
});

check('no two shortcuts share the same key combination', () => {
  const seen = new Map();
  for (const item of S.SHORTCUTS) {
    const combo = S.normalizeCombo(item.combo);
    assert.ok(!seen.has(combo), `${combo} is used by both ${seen.get(combo)} and ${item.id}`);
    seen.set(combo, item.id);
  }
});

check('theme and language moved off the Ctrl+Shift+<letter> screen keys', () => {
  const byId = new Map(S.SHORTCUTS.map((x) => [x.id, S.normalizeCombo(x.combo)]));
  assert.strictEqual(byId.get('theme'), 'Alt+T', 'theme is Alt+T');
  assert.strictEqual(byId.get('language'), 'Alt+L', 'language is Alt+L');
  for (const id of ['stockTransfers', 'openLedger']) {
    assert.ok(!['Alt+T', 'Alt+L'].includes(byId.get(id)), `${id} must not collide with theme/language`);
  }
});

check('every screen navigation shortcut is guarded by the application and permissions', () => {
  const provider = readSrc('src/context/ShortcutsContext.jsx');
  assert.ok(provider.includes('VIEW_PERMISSION'), 'a permission map per screen');
  assert.ok(provider.includes('mode.canOpen(viewId)'), 'a screen outside this application is refused');
  assert.ok(provider.includes('hasPermission(required)'), 'a screen outside the role is refused');
  for (const [combo, id] of USER_TABLE) {
    if (!/^Ctrl\+Shift\+[A-Z]$/.test(combo)) continue;
    assert.ok(
      provider.includes(`'${combo}':`),
      `${combo} (${id}) must be handled by the shortcut provider`
    );
  }
});

check('Ctrl+S and Ctrl+Enter save by submitting the form under the cursor', () => {
  const provider = readSrc('src/context/ShortcutsContext.jsx');
  assert.ok(provider.includes("'Ctrl+S': () => submitFocusedForm()"));
  assert.ok(provider.includes("'Ctrl+Enter': () => submitFocusedForm()"));
  assert.ok(provider.includes('requestSubmit'), 'the native form submission is used');
  // Never while the user is typing in a field that needs the key.
  assert.ok(
    provider.includes('isTypingTarget'),
    'plain-letter shortcuts stay suspended while typing'
  );
});

check('Ctrl+F and the search shortcuts focus the search box of the screen', () => {
  const provider = readSrc('src/context/ShortcutsContext.jsx');
  assert.ok(provider.includes("'Ctrl+F': () => focusSearchBox()"));
  assert.ok(provider.includes('data-j-search'), 'screens mark their search field');
  const views = ['src/views/CustomersView.jsx', 'src/views/SuppliersView.jsx', 'src/views/InventoryView.jsx'];
  for (const view of views) {
    assert.ok(readSrc(view).includes('data-j-search'), `${view} must mark its search field`);
  }
});

console.log(`--- ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
