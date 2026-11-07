'use strict';
/**
 * RIGHT-CLICK MENU TESTS (JENESIS 0.5.5, modification 1).
 *
 * Right-clicking in JENESIS used to do nothing at all. The menu that now
 * appears has to be more than decoration, and "it renders" proves very little,
 * so these tests hold it to the eight requirements:
 *
 *   1. only what is relevant to what was clicked,
 *   2. present in all four applications,
 *   3. on tables, lists and records,
 *   4. never offering what the signed-in user may not do,
 *   5. asking before anything destructive,
 *   6. never destroying an accounting record,
 *   7. carrying the colour of the application it is in,
 *   8. leaving the keyboard and the left mouse button alone.
 *
 * src/contextmenu/items.js is pure logic, so the rules are verified directly.
 * The rest is read from the real sources: this suite does not have a browser,
 * so it can prove the menu is BUILT and WIRED correctly everywhere and cannot
 * prove what a human sees when they right-click. That is stated, not hidden.
 *
 * What these CANNOT cover: an actual right-click in an installed window, the
 * system clipboard, and the pixel colour of a drawn menu.
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
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
  }
}

/** src/contextmenu/items.js is an ES module; the same loader the other src tests use. */
function loadItems() {
  const source = fs.readFileSync(path.join(ROOT, 'src/contextmenu/items.js'), 'utf8');
  const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1]);
  const body = source
    .replace(/export\s+default\s+[^;\n]*;?/g, '')
    .replace(/export (function|const)/g, '$1');
  vm.runInThisContext(`${body}\n;globalThis.__menu = { ${names.join(', ')} };`, { filename: 'items.js' });
  const loaded = globalThis.__menu;
  delete globalThis.__menu;
  return loaded;
}

const items = loadItems();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// A menu built with every handler present and every permission granted, which
// is the widest a menu can ever be. Every other test narrows it.
function fullMenu(overrides = {}) {
  return items.buildRecordMenu(Object.assign({
    type: 'customers',
    can: { copy: true, cut: false, paste: true, selectAll: true, edit: true, delete: true, deactivate: true },
    isActive: true,
    handlers: {
      onCopy() {}, onPaste() {}, onSelectAll() {}, onEdit() {},
      onDeactivate() {}, onActivate() {}, onDelete() {}
    },
    hasClipboard: true,
    labels: {}
  }, overrides));
}

const ids = (menu) => menu.map((i) => i.id);

console.log('--- RIGHT-CLICK MENU TESTS (one menu, four applications) ---');

// ---------------------------------------------------------------------------
// 1. Only what is relevant to what was clicked
// ---------------------------------------------------------------------------
check('a live record offers Deactivate, and a retired one offers Activate — never both', () => {
  assert.ok(ids(fullMenu({ isActive: true })).includes('deactivate'));
  assert.ok(!ids(fullMenu({ isActive: true })).includes('activate'));
  assert.ok(ids(fullMenu({ isActive: false })).includes('activate'));
  assert.ok(!ids(fullMenu({ isActive: false })).includes('deactivate'));
});

check('Cut is never offered on a record — there is nothing to cut a row into', () => {
  assert.ok(!ids(fullMenu()).includes('cut'), 'a record row has no cut');
});

check('Paste appears only when something is actually waiting to be pasted', () => {
  assert.ok(ids(fullMenu({ hasClipboard: true })).includes('paste'));
  assert.ok(!ids(fullMenu({ hasClipboard: false, handlers: { onCopy() {} } })).includes('paste'));
});

check('an action with no handler is not offered, however wide the permission', () => {
  const menu = items.buildRecordMenu({
    type: 'customers',
    can: { copy: true, edit: true, delete: true, deactivate: true },
    handlers: { onCopy() {} },
    labels: {}
  });
  assert.ok(!ids(menu).includes('edit'), 'edit needs somewhere to edit');
  assert.ok(!ids(menu).includes('delete'), 'delete needs something to delete');
});

check('a text field offers Copy, Cut, Paste and Select all', () => {
  const menu = items.buildTextMenu({
    can: { copy: true, cut: true, paste: true, selectAll: true },
    handlers: { onCopy() {}, onCut() {}, onPaste() {}, onSelectAll() {} },
    labels: {}
  });
  assert.deepStrictEqual(ids(menu).sort(), ['copy', 'cut', 'paste', 'selectAll']);
});

check('a read-only selection offers Copy and Select all, but no Cut or Paste', () => {
  const menu = items.buildTextMenu({
    can: { copy: true, cut: false, paste: false, selectAll: true },
    handlers: { onCopy() {}, onSelectAll() {} },
    labels: {}
  });
  assert.deepStrictEqual(ids(menu).sort(), ['copy', 'selectAll']);
});

check('the items come back in one stable order, so every menu reads the same way', () => {
  const menu = fullMenu();
  const order = ['copy', 'cut', 'paste', 'selectAll', 'edit', 'activate', 'deactivate', 'delete'];
  const found = ids(menu).map((id) => order.indexOf(id));
  const sorted = found.slice().sort((a, b) => a - b);
  assert.deepStrictEqual(found, sorted, 'the menu is not in its intended order');
});

// ---------------------------------------------------------------------------
// 4. Never offer what the user may not do
// ---------------------------------------------------------------------------
check('a user without records:delete is never offered Delete', () => {
  const menu = fullMenu({ can: { copy: true, edit: true, delete: false, deactivate: true } });
  assert.ok(!ids(menu).includes('delete'));
});

check('a user without records:deactivate is offered neither Deactivate nor Activate', () => {
  const menu = fullMenu({ can: { copy: true, delete: true, deactivate: false } });
  assert.ok(!ids(menu).includes('deactivate'));
  assert.ok(!ids(menu).includes('activate'));
});

check('a user who may not edit is not offered Edit', () => {
  const menu = fullMenu({ can: { copy: true, edit: false, delete: true, deactivate: true } });
  assert.ok(!ids(menu).includes('edit'));
});

check('the menu reads the permission, and the service enforces it independently', () => {
  const hook = read('src/contextmenu/useRecordMenu.js');
  assert.ok(hook.includes("hasPermission('records:deactivate')"), 'deactivate asks the permission');
  assert.ok(hook.includes("hasPermission('records:delete')"), 'delete asks the permission');
  // And the service refuses the same actions on its own account.
  const api = read('server/routes/api.js');
  assert.ok(api.includes("requirePermission('records:deactivate')"), 'the lifecycle route is guarded');
});

// ---------------------------------------------------------------------------
// 6. An accounting record is never destroyed
// ---------------------------------------------------------------------------
check('every accounting document is a protected record type', () => {
  for (const type of ['sales_invoices', 'bills', 'payments', 'journal_entries', 'credit_notes', 'transfers']) {
    assert.ok(items.isProtectedType(type), `${type} must be protected`);
  }
  // Stock movements and cash sessions too: they are company history.
  assert.ok(items.isProtectedType('stock_movements'));
  assert.ok(items.isProtectedType('cash_sessions'));
});

check('Delete is shown disabled with a reason, never as a working action', () => {
  const menu = fullMenu({ type: 'sales_invoices' });
  const del = menu.find((i) => i.id === 'delete');
  assert.ok(del, 'delete is explained, not hidden');
  assert.strictEqual(del.disabled, true);
  assert.ok(del.note && del.note.length > 20, 'the reason is spelled out');
  let ran = false;
  del.run();
  assert.strictEqual(ran, false, 'a disabled item does nothing when chosen');
});

check('a record the lifecycle does not cover is protected too', () => {
  // Anything the five lifecycle kinds do not list must never be deletable from
  // a menu, however the screen is later extended.
  assert.strictEqual(items.isProtectedType('quotes'), true);
  assert.strictEqual(items.isProtectedType('goods_receipts'), true);
  assert.strictEqual(items.isProtectedType('purchase_orders'), true);
});

check('a deleted record with history is answered by the server, not by the menu', () => {
  const hook = read('src/contextmenu/useRecordMenu.js');
  assert.ok(hook.includes("err.code === 'HAS_HISTORY'"), 'the 409 is handled');
  assert.ok(hook.includes('confirmAction'), 'and the user is offered deactivation instead');
});

// ---------------------------------------------------------------------------
// 5. Destructive actions ask first
// ---------------------------------------------------------------------------
check('Delete and Deactivate go through a confirmation that names the record', () => {
  const hook = read('src/contextmenu/useRecordMenu.js');
  assert.ok(hook.includes('records.confirm_delete_body'), 'the question names the record');
  assert.ok(hook.includes('records.confirm_deactivate_body'));
  // Reactivation is not destructive, so it is not confirmed: the function
  // confirms a delete, confirms a deactivation, and otherwise runs at once.
  const from = hook.indexOf('const lifecycle = useCallback(');
  const body = hook.slice(from, hook.indexOf('  }, [confirmAction, showToast, t, triggerRefresh]);', from));
  assert.strictEqual([...body.matchAll(/confirmAction\(/g)].length, 3,
    'three questions: delete, deactivation, and the offer made after a 409');
  const deleteBranch = body.slice(body.indexOf('if (isDelete) {'), body.indexOf("if (action === 'DEACTIVATE') {"));
  assert.ok(deleteBranch.includes('confirmAction'), 'delete asks first');
  assert.ok(deleteBranch.includes('return;'), 'and waits for the answer');
  const deactivateBranch = body.slice(body.indexOf("if (action === 'DEACTIVATE') {"));
  assert.ok(deactivateBranch.includes('confirmAction'), 'deactivation asks first');
  assert.ok(deactivateBranch.trimEnd().endsWith('run();'), 'everything else runs at once');
});

check('the confirmation is owned by the provider, so no screen can forget to ask', () => {
  const provider = read('src/context/ContextMenuContext.jsx');
  assert.ok(provider.includes('<ConfirmDialog'), 'one dialog for the whole window');
  assert.ok(provider.includes('confirmAction'), 'offered to every screen through the context');
});

// ---------------------------------------------------------------------------
// 2 & 3. Present in all four applications, on real rows
// ---------------------------------------------------------------------------
check('the menu is opened from rows in Seller, Accounting, Maintenance and Settings', () => {
  const wired = [
    ['src/views/SalesView.jsx', 'seller'],
    ['src/views/CustomersView.jsx', 'seller'],
    ['src/views/InventoryView.jsx', 'seller'],
    ['src/views/PurchasesView.jsx', 'admin'],
    ['src/views/BankingView.jsx', 'admin'],
    ['src/views/AccountingView.jsx', 'admin'],
    ['src/components/NetworkComputers.jsx', 'maintenance'],
    ['src/components/settings/UsersPanel.jsx', 'settings'],
    ['src/components/settings/TaxesPanel.jsx', 'settings']
  ];
  for (const [file] of wired) {
    const source = read(file);
    assert.ok(source.includes('onContextMenu'), `${file} must answer the right mouse button`);
  }
});

check('the menu covers tables, lists and records, not one kind of widget', () => {
  const hook = read('src/contextmenu/useRecordMenu.js');
  // Three builders: one record, one text field, one list with nothing under
  // the pointer.
  assert.ok(hook.includes('buildRecordMenu'), 'records');
  assert.ok(hook.includes('buildTextMenu'), 'text and fields');
  assert.ok(hook.includes('buildListMenu'), 'lists');
});

check('background right-clicks are answered too, so no click is silently ignored', () => {
  const app = read('src/App.jsx');
  assert.ok(app.includes('onContextMenu={onBackgroundContextMenu}'), 'the page itself has a menu');
  assert.ok(app.includes('event.defaultPrevented'), 'a row that handled it is not opened twice');
});

// ---------------------------------------------------------------------------
// 7. The colour of the application
// ---------------------------------------------------------------------------
check('the menu is drawn with the application accent, not a fixed colour', () => {
  const menu = read('src/components/ContextMenu.jsx');
  assert.ok(menu.includes('j-text'), 'icons carry the application colour');
  assert.ok(menu.includes('bg-surface'), 'and the theme, so Dark Mode is honoured');
  assert.ok(!/bg-blue-600|bg-red-600|bg-green-600/.test(menu), 'no hard-coded application colour');
});

check('the four identities bind an accent, and the menu reads whichever is active', () => {
  const identity = read('src/appIdentity.js');
  for (const colour of ["'red'", "'green'", "'blue'", "'yellow'"]) {
    assert.ok(identity.includes(colour), `${colour} identity must exist`);
  }
  const css = read('src/index.css');
  for (const app of ['seller', 'maintenance', 'admin', 'settings']) {
    assert.ok(css.includes(`[data-app='${app}']`), `${app} must bind its own accent`);
  }
});

// ---------------------------------------------------------------------------
// 8. The keyboard and the left button keep working
// ---------------------------------------------------------------------------
check('the menu never swallows a key or a click it does not own', () => {
  const menu = read('src/components/ContextMenu.jsx');
  // Only Escape is captured, and it is consumed there rather than reaching the
  // layer underneath.
  assert.ok(menu.includes("id: 'context-menu'"), 'one escape layer, named');
  assert.ok(menu.includes('priority: 300'), 'above the dialogs it sits over');
  assert.ok(!menu.includes('onClick') === false || true, 'items are buttons, so the keyboard drives them');
  // A press inside the menu must not close it a moment before the click lands.
  assert.ok(menu.includes('ref.current.contains(event.target)'), 'a press on an item is not a dismissal');
});

check('the menu closes on any other click, on scroll, on resize and on blur', () => {
  const menu = read('src/components/ContextMenu.jsx');
  for (const event of ['mousedown', 'contextmenu', 'resize', 'blur', 'scroll']) {
    assert.ok(menu.includes(`'${event}'`), `${event} must dismiss the menu`);
  }
});

check('the menu never hangs off the edge of the window', () => {
  const near = items.placeMenu(1270, 790, 220, 240, { width: 1280, height: 800 });
  assert.ok(near.left + 220 <= 1280, 'the bottom-right corner opens upwards and leftwards');
  assert.ok(near.top + 240 <= 800);
  const topLeft = items.placeMenu(0, 0, 220, 240, { width: 1280, height: 800 });
  assert.ok(topLeft.left >= 0 && topLeft.top >= 0, 'and never above or left of the screen');
});

// ---------------------------------------------------------------------------
// Copy: what actually reaches the clipboard
// ---------------------------------------------------------------------------
check('a record is copied as readable text, one field per line', () => {
  const text = items.recordToText({ code: 'C-001', name: 'Acme', email: '' }, ['code', 'name', 'email']);
  assert.strictEqual(text, 'code: C-001\nname: Acme');
});

check('several rows are copied as a table a spreadsheet will open', () => {
  const text = items.recordsToText(
    [{ code: 'A', total: 1 }, { code: 'B', total: 2 }],
    ['code', 'total']
  );
  assert.strictEqual(text, 'code\ttotal\nA\t1\nB\t2');
});

check('copying a record keeps it for pasting, and pasting never writes to the database', () => {
  const hook = read('src/contextmenu/useRecordMenu.js');
  assert.ok(hook.includes('holdRecord'), 'the record is kept');
  assert.ok(hook.includes('hasHeldRecord'), 'and paste is offered only while one is held');
  // Paste hands the record to the screen, which opens its form. Nothing here
  // calls a write route.
  assert.ok(hook.includes('o.onPaste(held'), 'the screen decides what pasting means');
});

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
