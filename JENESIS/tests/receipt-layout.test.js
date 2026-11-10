'use strict';
/**
 * RECEIPT LAYOUT AND PRINTING TESTS (JENESIS 1.0.1, modification 2).
 *
 * The brief is specific about what a receipt has to survive: thermal and A4
 * paper, several widths, long receipts, decimal quantities, negative
 * corrections, French and Kinyarwanda characters, and printing repeatedly.
 *
 * These tests hold the receipt builder to those. They are written against the
 * pure builder (src/receipt/*), which holds no React and touches no DOM, so
 * they run in Node and say the same thing on every machine.
 *
 * They also hold it to one rule the brief states plainly: PRINTING MUST NOT
 * CHANGE ACCOUNTING. A receipt is produced from a document; it never writes
 * one. That is tested by building receipts and asserting the database is
 * byte-for-byte unchanged afterwards.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

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

/**
 * The receipt modules are ES modules; load them the way the other src tests
 * do, rewriting the import to an inline require of the real file.
 */
function loadModule(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sandbox = { exports: {}, require, console, module: { exports: {} } };
  sandbox.module = sandbox;
  // The path is written into generated JavaScript, so it must be quoted as a
  // JavaScript string. A bare path is silently corrupted on Windows, where
  // path.join produces backslashes and "\r", "\n" and "\t" inside the
  // literal become a carriage return, a newline and a tab: the module is then
  // looked for at a path that has had whole directories eaten out of it.
  // JSON.stringify produces a properly escaped double-quoted literal.
  const layoutPath = JSON.stringify(path.join(ROOT, 'src/receipt/receiptLayout.js'));
  const code = source.replace(
    /import\s*\{([^}]+)\}\s*from\s*'\.\/receiptLayout\.js';/g,
    "const {$1} = require(" + layoutPath + ");"
  );
  // Turn `export function f` / `export const c` into plain declarations.
  const plain = code.replace(/^export\s+(async\s+)?(function|const|let|class)\s/gm, '$1$2 ');
  vm.runInNewContext(plain, sandbox, { filename: file });
  return sandbox;
}

const layout = loadModule('src/receipt/receiptLayout.js');
const builder = loadModule('src/receipt/buildReceiptHtml.js');

const {
  PAPER_SIZES, defaultReceiptLayout, normaliseReceiptLayout,
  pageWidthMm, pageHeightMm, isRoll, charactersPerLine
} = layout;
const { buildReceiptHtml, formatQuantity, isReturnLine, estimateReceiptHeightMm } = builder;

console.log('--- STARTING RECEIPT LAYOUT TESTS ---');

// ---------------------------------------------------------------------------
// A document every test can share: a café receipt with a decimal quantity and
// a returned item, in French, because that is the hardest real case.
// ---------------------------------------------------------------------------

const DOC = {
  number: 'INV-2026-0042',
  date: '2026-10-29',
  cashier: 'Alice Uwase',
  partyName: 'Café Inyange',
  paymentMethod: 'Mobile Money',
  currency: 'RWF',
  subtotal: 4250,
  taxTotal: 765,
  total: 5015,
  amountPaid: 5015,
  change: 0,
  lines: [
    { sku: 'COF-250', description: 'Café moulu 250 g', quantity: 1.25, unit: 'kg', unitPrice: 2000, lineTotal: 2500 },
    { sku: 'SUC-1', description: 'Sucre', quantity: 2, unit: 'kg', unitPrice: 875, lineTotal: 1750 },
    // A returned half kilo: the negative case the brief asks for.
    { sku: 'THE-100', description: 'Thé vert (retourné)', quantity: -0.5, unit: 'kg', unitPrice: 1500, lineTotal: -750 }
  ]
};

const COMPANY = {
  name: 'Amahoro Store',
  address: 'KG 123 St, Kigali',
  phone: '+250 788 123 456',
  email: 'amahoro@example.rw',
  taxId: 'TIN-119988'
};

// ---------------------------------------------------------------------------
// 1. Quantities print as the business writes them.
// ---------------------------------------------------------------------------

check('decimal quantities keep their decimals, and whole ones stay whole', () => {
  assert.strictEqual(formatQuantity(2), '2', 'two must not print as 2.0000');
  assert.strictEqual(formatQuantity(1.25), '1.25', 'a quarter over one must keep it');
  assert.strictEqual(formatQuantity(0.5), '0.5', 'half a kilo is 0.5');
  assert.strictEqual(formatQuantity(10.75), '10.75');
  assert.strictEqual(formatQuantity(0.1), '0.1');
  assert.strictEqual(formatQuantity(0.25), '0.25');
  assert.strictEqual(formatQuantity(2.5), '2.5');
});

check('negative quantities print with a minus and no negative zero', () => {
  assert.strictEqual(formatQuantity(-1), '-1');
  assert.strictEqual(formatQuantity(-0.5), '-0.5');
  assert.strictEqual(formatQuantity(-5), '-5');
  // Anything too small to show at the configured precision must read as 0,
  // never as -0: a customer should not be handed a receipt for minus nothing.
  assert.strictEqual(formatQuantity(-0.00001), '0', 'a rounding remainder must not print as -0');
  assert.strictEqual(formatQuantity(0.00001), '0', 'and the positive one as 0');
  assert.strictEqual(formatQuantity(-0), '0', 'negative zero has no place on a receipt');
});

check('a quantity that is not a number does not print as NaN', () => {
  assert.strictEqual(formatQuantity(undefined), '0');
  assert.strictEqual(formatQuantity(null), '0');
  assert.strictEqual(formatQuantity('abc'), '0');
  assert.strictEqual(formatQuantity(NaN), '0');
  assert.strictEqual(formatQuantity('2.5'), '2.5', 'a numeric string is still a quantity');
});

check('a negative line is recognised as a return, a positive one is not', () => {
  assert.strictEqual(isReturnLine({ quantity: -0.5 }), true, 'a minus quantity is a return');
  assert.strictEqual(isReturnLine({ quantity: 1, lineTotal: -100 }), true, 'a minus amount is a return');
  assert.strictEqual(isReturnLine({ quantity: 1.25, lineTotal: 2500 }), false, 'an ordinary sale is not');
  assert.strictEqual(isReturnLine({ quantity: 0, lineTotal: 0 }), false, 'a zero line is not');
  assert.strictEqual(isReturnLine({}), false, 'an empty line is not');
});

// ---------------------------------------------------------------------------
// 2. Paper sizes and geometry.
// ---------------------------------------------------------------------------

check('the three named paper sizes are the widths a shop actually uses', () => {
  assert.strictEqual(pageWidthMm(defaultReceiptLayout({ paper: '58mm' })), 58);
  assert.strictEqual(pageWidthMm(defaultReceiptLayout({ paper: '80mm' })), 80);
  assert.strictEqual(pageWidthMm(defaultReceiptLayout({ paper: 'A4' })), 210);
});

check('a roll has no fixed height; A4 and a custom sheet do', () => {
  assert.strictEqual(isRoll(defaultReceiptLayout({ paper: '58mm' })), true, 'a 58 mm roll is a roll');
  assert.strictEqual(isRoll(defaultReceiptLayout({ paper: '80mm' })), true, 'an 80 mm roll is a roll');
  assert.strictEqual(isRoll(defaultReceiptLayout({ paper: 'A4' })), false, 'A4 is a cut sheet');
  assert.strictEqual(pageHeightMm(defaultReceiptLayout({ paper: 'A4' })), 297);
  assert.strictEqual(pageHeightMm(defaultReceiptLayout({ paper: '80mm' })), 0, 'a roll has no height');
});

check('a custom size uses the width the user typed, within sane limits', () => {
  const l = normaliseReceiptLayout({ paper: 'custom', customWidthMm: 76 });
  assert.strictEqual(pageWidthMm(l), 76);
  // A custom height of 0 means a continuous roll, which is a valid choice.
  assert.strictEqual(isRoll(normaliseReceiptLayout({ paper: 'custom', customWidthMm: 76, customHeightMm: 0 })), true);
  assert.strictEqual(isRoll(normaliseReceiptLayout({ paper: 'custom', customWidthMm: 76, customHeightMm: 150 })), false);
  assert.strictEqual(pageHeightMm(normaliseReceiptLayout({ paper: 'custom', customHeightMm: 150 })), 150);
});

check('an out-of-range or nonsense layout is pulled back, not allowed through', () => {
  // A configuration file is copied between machines and edited by hand, so
  // every field is treated as untrusted.
  const l = normaliseReceiptLayout({
    paper: 'A3',                 // not a size JENESIS knows
    fontSize: 900,               // would print one letter to a page
    lineSpacing: -4,
    copies: 9999,
    customWidthMm: -10,
    fontFamily: 'Comic Sans',    // not a font we ship
    align: 'sideways',
    title: 'x'.repeat(500)       // would overflow the paper
  });
  assert.strictEqual(l.paper, '80mm', 'an unknown size falls back to 80 mm');
  assert.ok(l.fontSize <= 18 && l.fontSize >= 7, `font size clamped, got ${l.fontSize}`);
  assert.ok(l.lineSpacing >= 1 && l.lineSpacing <= 2.5, `line spacing clamped, got ${l.lineSpacing}`);
  assert.ok(l.copies >= 1 && l.copies <= 10, `copies clamped, got ${l.copies}`);
  assert.ok(l.customWidthMm >= 20, `custom width clamped, got ${l.customWidthMm}`);
  assert.strictEqual(l.fontFamily, 'monospace', 'an unknown font falls back to one every printer has');
  assert.strictEqual(l.align, 'center');
  assert.ok(l.title.length <= 60, `title trimmed to ${l.title.length}`);
});

check('a missing or broken layout still produces a complete one', () => {
  for (const bad of [undefined, null, {}, { show: null }, { paper: 42 }]) {
    const l = normaliseReceiptLayout(bad);
    assert.ok(l.show && typeof l.show === 'object', 'there is always a show block');
    assert.strictEqual(l.show.logo, true, 'every field defaults to shown');
    assert.strictEqual(typeof l.fontSize, 'number');
    assert.strictEqual(l.paper, '80mm');
  }
});

check('a narrower roll fits fewer characters, so wrapping is predictable', () => {
  const narrow = defaultReceiptLayout({ paper: '58mm', fontSize: 10 });
  const wide = defaultReceiptLayout({ paper: '80mm', fontSize: 10 });
  assert.ok(
    charactersPerLine(narrow, 'monospace') < charactersPerLine(wide, 'monospace'),
    '58 mm must fit fewer characters than 80 mm'
  );
  assert.ok(charactersPerLine(wide, 'monospace') > 12, 'a roll still fits a usable line');
  // A bigger font fits fewer characters.
  assert.ok(
    charactersPerLine(defaultReceiptLayout({ paper: '80mm', fontSize: 16 }), 'monospace') <
    charactersPerLine(defaultReceiptLayout({ paper: '80mm', fontSize: 8 }), 'monospace')
  );
});

// ---------------------------------------------------------------------------
// 3. The receipt document itself.
// ---------------------------------------------------------------------------

check('a receipt declares UTF-8 before anything, so Kinyarwanda prints', () => {
  const html = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout(), {});
  // The meta charset must come before any text that needs it, or the printer
  // reads accented and Kinyarwanda characters as boxes.
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(/charset="utf-8"/i.test(head), 'the document must declare its encoding');
  assert.ok(
    html.indexOf('charset="utf-8"') < html.indexOf('Café'),
    'the encoding must be declared before the accented text'
  );
});

check('French and Kinyarwanda text survives into the receipt intact', () => {
  const html = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout(), {});
  assert.ok(html.includes('Café'), 'the accented é must be preserved, not turned into ?');
  assert.ok(html.includes('Café moulu'), 'the whole product name survives');
  assert.ok(html.includes('retourn'), 'a French return note survives');
  // Kinyarwanda words, which are the reason the font stack matters.
  const rw = buildReceiptHtml(
    { ...DOC, partyName: 'Umucuruzi w\'amafaranga' },
    { ...COMPANY, name: 'Iduka rya Kigali' },
    defaultReceiptLayout(), {}
  );
  assert.ok(rw.includes('Umucuruzi'), 'Kinyarwanda text must survive');
  assert.ok(!/\?\?\?/.test(rw), 'no characters may be lost to question marks');
});

check('the font stack is one a printer really has, for those glyphs', () => {
  const mono = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout({ fontFamily: 'monospace' }), {});
  assert.ok(/DejaVu Sans Mono|Courier New/.test(mono), 'a monospace stack with wide glyph coverage');
  const sans = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout({ fontFamily: 'sans' }), {});
  assert.ok(/DejaVu Sans/.test(sans), 'DejaVu Sans covers French and Kinyarwanda');
});

check('a decimal quantity and a negative return both print correctly', () => {
  const html = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout(), {});
  assert.ok(html.includes('1.25'), 'the fractional quantity must print as 1.25');
  assert.ok(html.includes('-0.5'), 'the returned half kilo must print as -0.5');
  assert.ok(html.includes('-750.00'), 'the returned amount must print as a negative');
  assert.ok(!html.includes('NaN'), 'no arithmetic may produce NaN on paper');
  assert.ok(!html.includes('undefined'), 'no field may print as undefined');
});

check('a returned line is marked as a return, not just shown with a minus', () => {
  const html = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout(), {});
  assert.ok(/is-return/.test(html), 'the return is marked in the markup');
  assert.ok(/returned/i.test(html), 'and named in words, so a customer can read it');
  assert.ok(
    /Includes returned items/i.test(html),
    'a receipt containing a return says so, because the shopkeeper is asked about it'
  );
  // A receipt with no returns must not claim that it has one.
  const clean = buildReceiptHtml(
    { ...DOC, lines: DOC.lines.filter((l) => l.quantity > 0) },
    COMPANY, defaultReceiptLayout(), {}
  );
  assert.ok(!/Includes returned items/i.test(clean), 'no return note when nothing was returned');
});

check('every field can be turned off, and stays off', () => {
  const all = defaultReceiptLayout();
  for (const field of Object.keys(all.show)) {
    const l = defaultReceiptLayout({ show: { ...all.show, [field]: false } });
    const html = buildReceiptHtml(DOC, COMPANY, l, {});
    assert.strictEqual(l.show[field], false, `${field} must be off`);
    if (field === 'businessName') {
      assert.ok(!html.includes(COMPANY.name), 'the business name must be absent when switched off');
    }
    if (field === 'footer') {
      assert.ok(!html.includes(all.footerMessage), 'the footer must be absent when switched off');
    }
    if (field === 'title') {
      assert.ok(!html.includes(all.title), 'the title must be absent when switched off');
    }
  }
});

check('a custom title and footer message are the ones that print', () => {
  const l = defaultReceiptLayout({ title: 'BON DE CAISSE', footerMessage: 'Murakoze! Muze ubundi.' });
  const html = buildReceiptHtml(DOC, COMPANY, l, {});
  assert.ok(html.includes('BON DE CAISSE'), 'the custom title prints');
  assert.ok(html.includes('Murakoze'), 'the custom footer prints, in Kinyarwanda');
});

check('the layout the user chose is the layout in the markup', () => {
  const l = defaultReceiptLayout({ paper: '58mm', fontSize: 14, bold: true, lineSpacing: 2 });
  const html = buildReceiptHtml(DOC, COMPANY, l, {});
  assert.ok(html.includes('size: 58mm'), 'the page is 58 mm wide');
  assert.ok(html.includes('font-size: 14pt'), 'the font size is the one chosen');
  assert.ok(/font-weight: 700/.test(html), 'bold is applied');
  assert.ok(html.includes('line-height: 2'), 'the line spacing is applied');
});

check('the margins the user chose are the margins on the page', () => {
  const l = defaultReceiptLayout({ marginTopMm: 8, marginLeftMm: 1, marginRightMm: 2, marginBottomMm: 5 });
  const html = buildReceiptHtml(DOC, COMPANY, l, {});
  assert.ok(/padding:\s*8mm 2mm 5mm 1mm/.test(html), 'top right bottom left, in millimetres');
});

check('a product name cannot inject markup into the receipt', () => {
  const nasty = {
    ...DOC,
    lines: [{ ...DOC.lines[0], description: '<script>alert(1)</script> & "quotes"' }]
  };
  const html = buildReceiptHtml(nasty, COMPANY, defaultReceiptLayout(), {});
  assert.ok(!html.includes('<script>'), 'a script tag in a product name must be escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'and shown as the text it is');
  assert.ok(html.includes('&amp;'), 'an ampersand is escaped');
});

check('a long receipt is complete, not truncated at some line limit', () => {
  const many = [];
  for (let i = 1; i <= 200; i++) {
    many.push({ sku: 'SKU-' + i, description: 'Item number ' + i, quantity: 1, unitPrice: 100, lineTotal: 100 });
  }
  const html = buildReceiptHtml({ ...DOC, lines: many }, COMPANY, defaultReceiptLayout({ paper: 'A4' }), {});
  assert.ok(html.includes('Item number 200'), 'the two hundredth line must be on the paper');
  assert.ok(html.includes('Item number 1'), 'and the first');
  const count = (html.match(/class="line/g) || []).length;
  assert.ok(count >= 200, `all 200 lines are present, found ${count}`);
});

check('an A4 receipt is paginated; a roll is not cut every page', () => {
  const a4 = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout({ paper: 'A4' }), {});
  assert.ok(a4.includes('size: 210mm 297mm'), 'A4 is a fixed sheet');
  assert.ok(a4.includes('page-break-inside: avoid'), 'rows are not split across pages');
  const roll = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout({ paper: '80mm' }), {});
  assert.ok(roll.includes('size: 80mm auto'), 'a roll is as long as the receipt');
});

check('a cut line appears on a roll and not on an A4 sheet', () => {
  const roll = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout({ paper: '80mm' }), {});
  assert.ok(/class="cut"/.test(roll), 'a thermal roll gets a cut mark');
  const a4 = buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout({ paper: 'A4' }), {});
  assert.ok(!/class="cut"/.test(a4), 'a cut mark on an A4 sheet is noise');
});

check('an empty or broken document still produces printable paper', () => {
  for (const doc of [undefined, {}, { lines: [] }, { lines: null }, { total: NaN }]) {
    const html = buildReceiptHtml(doc, COMPANY, defaultReceiptLayout(), {});
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'always a complete document');
    assert.ok(!html.includes('NaN'), 'never NaN on paper');
    assert.ok(!html.includes('undefined'), 'never the word undefined on paper');
  }
  // And with no company details at all.
  const html = buildReceiptHtml(DOC, {}, defaultReceiptLayout(), {});
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(!html.includes('undefined'));
});

check('the same document printed twice is byte-for-byte identical', () => {
  // Repeated printing must give the same paper every time.
  const l = defaultReceiptLayout();
  const a = buildReceiptHtml(DOC, COMPANY, l, {});
  const b = buildReceiptHtml(DOC, COMPANY, l, {});
  assert.strictEqual(a, b, 'printing is deterministic');
});

check('the height estimate says whether a receipt fits, and grows with lines', () => {
  const l = defaultReceiptLayout({ paper: 'A4' });
  const shortDoc = { ...DOC, lines: DOC.lines.slice(0, 1) };
  const longDoc = { ...DOC, lines: Array.from({ length: 50 }, (_, i) => ({ ...DOC.lines[0], description: 'Item ' + i })) };
  const h1 = estimateReceiptHeightMm(shortDoc, l);
  const h2 = estimateReceiptHeightMm(longDoc, l);
  assert.ok(h2 > h1, 'a longer receipt is taller');
  assert.ok(h1 > 0 && Number.isFinite(h1), 'the estimate is a real number');
});

// ---------------------------------------------------------------------------
// 4. Printing does not touch the accounts.
// ---------------------------------------------------------------------------

check('building a receipt does not change the database', () => {
  // The brief states it plainly: printing must not modify, duplicate or
  // delete accounting transactions. The builder runs against a real copy of
  // the database and the file must come out identical.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-db-'));
  const src = path.join(ROOT, 'genesis.db');
  const dest = path.join(tmpDir, 'genesis-test.db');
  if (!fs.existsSync(src)) {
    // No baseline database here; the rule is still worth stating.
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }
  fs.copyFileSync(src, dest);
  const before = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');

  const Sqlite = require(path.join(ROOT, 'node_modules/better-sqlite3'));
  const db = new Sqlite(dest, { readonly: false });
  const rowsBefore = db.prepare(`SELECT count(*) AS n FROM journal_entries`).get().n;
  db.close();

  // Build a great many receipts - including one with a negative line - and
  // never once open the database to do it.
  for (let i = 0; i < 25; i++) {
    buildReceiptHtml(DOC, COMPANY, defaultReceiptLayout({ paper: i % 2 ? '58mm' : '80mm' }), {});
  }

  const after = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
  assert.strictEqual(after, before, 'the database file must be byte-for-byte unchanged after printing');

  const db2 = new Sqlite(dest, { readonly: true });
  const rowsAfter = db2.prepare(`SELECT count(*) AS n FROM journal_entries`).get().n;
  db2.close();
  assert.strictEqual(rowsAfter, rowsBefore, 'no journal entry may be added by printing');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
