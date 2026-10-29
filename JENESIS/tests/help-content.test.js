'use strict';
/**
 * USER GUIDE TESTS (Part F)
 *
 * The guide is a real part of the product, not a footnote. These checks prove:
 *  - English, French and Kinyarwanda have exactly the same structure (no
 *    missing section, step or note in any language);
 *  - every required topic is covered with purpose / where / steps / expected
 *    result / notes;
 *  - the guide agrees with the code: every shortcut it documents exists in the
 *    SHORTCUTS catalogue, and the PAID behaviour it describes is implemented by
 *    the settlement endpoints;
 *  - the guide is reachable (sidebar entry, F1, and the application route).
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

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Loads the ES module src/views/helpContent.js in a sandbox. */
function loadHelpContent() {
  const file = path.join(ROOT, 'src', 'views', 'helpContent.js');
  const source = fs.readFileSync(file, 'utf8');
  const names = [...source.matchAll(/export const (\w+)/g)].map((m) => m[1]);
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(`${source.replace(/export const/g, 'const')}\n;module.exports = { ${names.join(', ')} };`, sandbox, { filename: 'helpContent.js' });
  return sandbox.module.exports;
}

function loadShortcuts() {
  const source = readSrc('src/shortcuts.js');
  const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1]);
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(`${source.replace(/export (function|const)/g, '$1')}\n;module.exports = { ${names.join(', ')} };`, sandbox, { filename: 'shortcuts.js' });
  return sandbox.module.exports;
}

const { HELP, HELP_ORDER, LANGUAGES } = loadHelpContent();
const S = loadShortcuts();

const REQUIRED_SECTIONS = [
  'welcome', 'signin', 'navigation', 'sales', 'purchases', 'inventory',
  'calculator', 'messenger', 'appearance', 'shortcuts', 'accounting',
  'settings', 'backup', 'troubleshooting', 'roles'
];

/** Deep list of the "shape" of one language, used for parity checks. */
function shape(value, trail = '') {
  if (Array.isArray(value)) {
    const out = [`${trail}[]`];
    value.forEach((item, i) => out.push(...shape(item, `${trail}[${i}]`)));
    return out;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).flatMap((k) => shape(value[k], `${trail}.${k}`));
  }
  return [trail];
}

console.log('--- USER GUIDE TESTS (trilingual parity, completeness, agreement with the code) ---');

check('the guide exists in English, French and Kinyarwanda', () => {
  assert.deepStrictEqual([...Object.keys(HELP)].sort(), ['en', 'fr', 'rw']);
  assert.deepStrictEqual([...LANGUAGES], ['en', 'fr', 'rw']);
  for (const lang of LANGUAGES) {
    assert.ok(HELP[lang].guideTitle && HELP[lang].guideIntro, `${lang} has a title and an introduction`);
    assert.ok(HELP[lang].sections && typeof HELP[lang].sections === 'object');
  }
});

check('all three languages have exactly the same structure (no missing key)', () => {
  const base = shape(HELP.en).sort();
  for (const lang of ['fr', 'rw']) {
    assert.deepStrictEqual(shape(HELP[lang]).sort(), base, `${lang} structure differs from English`);
  }
});

check('every required topic is present in every language', () => {
  for (const lang of LANGUAGES) {
    for (const id of REQUIRED_SECTIONS) {
      assert.ok(HELP[lang].sections[id], `section "${id}" missing in ${lang}`);
    }
  }
  assert.deepStrictEqual([...HELP_ORDER], REQUIRED_SECTIONS, 'HELP_ORDER lists every section exactly once');
});

check('every section has purpose, location, steps, expected result and notes', () => {
  for (const lang of LANGUAGES) {
    for (const id of HELP_ORDER) {
      const section = HELP[lang].sections[id];
      assert.ok(section.title && section.title.trim(), `${lang}.${id}.title`);
      assert.ok(section.purpose && section.purpose.trim().length > 20, `${lang}.${id}.purpose too short`);
      assert.ok(section.where && section.where.trim().length > 10, `${lang}.${id}.where too short`);
      assert.ok(Array.isArray(section.steps) && section.steps.length >= 3, `${lang}.${id} needs at least 3 steps`);
      section.steps.forEach((step, i) => assert.ok(String(step).trim().length > 5, `${lang}.${id}.steps[${i}] too short`));
      assert.ok(section.expected && section.expected.trim().length > 20, `${lang}.${id}.expected too short`);
      assert.ok(Array.isArray(section.notes) && section.notes.length >= 1, `${lang}.${id} needs notes`);
      section.notes.forEach((note, i) => assert.ok(String(note).trim().length > 5, `${lang}.${id}.notes[${i}] too short`));
    }
  }
});

check('the translations are genuine, not English copies', () => {
  for (const id of HELP_ORDER) {
    for (const lang of ['fr', 'rw']) {
      assert.notStrictEqual(
        HELP[lang].sections[id].purpose,
        HELP.en.sections[id].purpose,
        `${lang}.${id}.purpose looks like an untranslated copy`
      );
      assert.notStrictEqual(HELP[lang].guideTitle, HELP.en.guideTitle, `${lang} guide title is not translated`);
    }
  }
});

check('the guide is substantial in every language (not a footnote)', () => {
  const size = (lang) => JSON.stringify(HELP[lang]).length;
  const en = size('en');
  assert.ok(en > 12000, `the English guide is only ${en} characters`);
  for (const lang of ['fr', 'rw']) {
    const ratio = size(lang) / en;
    assert.ok(ratio > 0.75 && ratio < 1.45, `${lang} guide length ratio ${ratio.toFixed(2)} is implausible`);
  }
});

check('the sales and purchase sections describe PAID, F2 and F3 truthfully', () => {
  for (const lang of LANGUAGES) {
    const sales = HELP[lang].sections.sales;
    const joined = [sales.purpose, sales.expected, ...sales.steps, ...sales.notes].join(' ');
    assert.ok(/PAID|PAYÉE|PAYÉ|YISHYUWE/i.test(joined), `${lang}: the sales section must explain PAID`);
    assert.ok(/F2/.test(joined), `${lang}: the sales section must document F2`);
    assert.ok(/F3/.test(joined), `${lang}: the sales section must document F3`);
    const purchases = HELP[lang].sections.purchases;
    const pJoined = [purchases.purpose, purchases.expected, ...purchases.steps, ...purchases.notes].join(' ');
    assert.ok(/PAID|PAYÉE|PAYÉ|YISHYUWE/i.test(pJoined), `${lang}: the purchase section must explain PAID`);
  }
  // …and the behaviour it documents really is implemented by the server.
  const api = readSrc('server/routes/api.js');
  assert.ok(/router\.post\('\/sales\/invoices\/:id\/settle'/.test(api), 'the sales settle endpoint must exist');
  assert.ok(/router\.post\('\/purchases\/bills\/:id\/settle'/.test(api), 'the purchase settle endpoint must exist');
  assert.ok(/settle = false/.test(api), 'documents are settled when they are created');
});

// --- shortcut cross-checks -------------------------------------------------
// The guide writes shortcuts the way a user reads them ("Ctrl + N",
// "Alt + Flèche gauche"), so both sides are normalised before comparing.
const ALIASES = {
  'Alt+ArrowLeft': ['Alt+ArrowLeft', 'Alt+Left arrow', 'Alt+Left', 'Alt+Gauche', 'Alt+Ibumoso'],
  'Alt+ArrowRight': ['Alt+ArrowRight', 'Alt+Right arrow', 'Alt+Right', 'Alt+Droite', 'Alt+Iburyo'],
  'Ctrl+Shift+C': ['Ctrl+Maj+C', 'Ctrl+Shift+C'],
  'Ctrl+Shift+T': ['Ctrl+Maj+T', 'Ctrl+Shift+T'],
  'Ctrl+Shift+L': ['Ctrl+Maj+L', 'Ctrl+Shift+L'],
  'Ctrl+/': ['Ctrl+/'],
  Escape: ['Escape', 'Esc', '\u00c9chap', '\u00c9CHAP']
};

const normalizeText = (text) => text
  // Arrow keys are written as words in French and Kinyarwanda.
  .replace(/Fl[eè]che\s+gauche/gi, 'ArrowLeft')
  .replace(/Fl[eè]che\s+droite/gi, 'ArrowRight')
  .replace(/Umwambi\s+w'ibumoso/gi, 'ArrowLeft')
  .replace(/Umwambi\s+w'iburyo/gi, 'ArrowRight')
  .replace(/\s*\+\s*/g, '+');

function canonical(combo) {
  const wanted = S.normalizeCombo(combo);
  for (const [canon, aliases] of Object.entries(ALIASES)) {
    if (canon === wanted) return canon;
    if (aliases.some((a) => S.normalizeCombo(a) === wanted)) return canon;
  }
  return wanted;
}

function combosInText(text) {
  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(/\b(?:F\d{1,2}|Escape|Esc|\u00c9chap|(?:Ctrl|Alt|Maj|Shift)(?:\+(?:Ctrl|Alt|Maj|Shift|[A-Za-z0-9/]+))*\+[A-Za-z0-9/]+)/g)]
    .map((m) => m[0]);
  const withBare = matches.concat([...normalized.matchAll(/\bF\d{1,2}\b|\bEscape\b|\bEsc\b|\b\u00c9chap\b/gi)].map((m) => m[0]));
  return [...new Set(withBare.map((c) => canonical(c)))];
}

check('every shortcut documented in the guide exists in the application catalogue', () => {
  const known = new Set(S.SHORTCUTS.map((s) => S.normalizeCombo(s.combo)));
  for (const lang of LANGUAGES) {
    const text = JSON.stringify(HELP[lang].sections.shortcuts);
    const found = combosInText(text);
    assert.ok(found.length >= 10, `${lang}: expected many documented shortcuts, found ${found.length} (${found.join(', ')})`);
    for (const combo of found) {
      assert.ok(known.has(combo), `${lang}: the guide documents ${combo}, which the application does not implement`);
    }
  }
});

check('the catalogue shortcuts are all explained in the guide', () => {
  for (const item of S.SHORTCUTS) {
    const combo = S.normalizeCombo(item.combo);
    for (const lang of LANGUAGES) {
      const text = normalizeText(JSON.stringify(HELP[lang].sections.shortcuts));
      // Aliases are compared as written (normalizeCombo would rewrite "Maj").
      const aliases = [combo, ...(ALIASES[combo] || [])].map((a) => a.replace(/\s*\+\s*/g, '+'));
      assert.ok(
        aliases.some((a) => text.includes(a)),
        `${lang}: ${combo} (${item.key}) is not described in the guide`
      );
    }
  }
});

check('the guide explains the layered Escape behaviour and that Esc never quits', () => {
  for (const lang of LANGUAGES) {
    const nav = JSON.stringify(HELP[lang].sections.navigation);
    const shortcuts = JSON.stringify(HELP[lang].sections.shortcuts);
    assert.ok(/Escape|\u00c9chap|Esc/.test(nav) || /Escape|\u00c9chap|Esc/.test(shortcuts), `${lang}: Escape must be documented`);
  }
  const en = JSON.stringify(HELP.en.sections) ;
  assert.ok(/never quits/i.test(en), 'the guide must state that Escape never closes the application');
});

check('the guide covers the three roles the team uses (Seller, Administrator, Maintenance)', () => {
  const en = JSON.stringify(HELP.en.sections.roles);
  assert.ok(/Seller/i.test(en), 'Seller guidance missing');
  assert.ok(/Administrator/i.test(en), 'Administrator guidance missing');
  assert.ok(/Maintenance/i.test(en), 'Maintenance guidance missing');
  for (const lang of ['fr', 'rw']) {
    const text = JSON.stringify(HELP[lang].sections.roles);
    assert.ok(text.length > 400, `${lang}: the roles section is too short`);
  }
});

check('the guide is reachable: sidebar entry, F1 and the application route', () => {
  const sidebar = readSrc('src/components/Sidebar.jsx');
  assert.ok(/id: 'help'/.test(sidebar), 'the sidebar must offer the guide');
  assert.ok(/nav\.help/.test(sidebar), 'the sidebar label is translated');
  const app = readSrc('src/App.jsx');
  assert.ok(/activeView === 'help' && <HelpView \/>/.test(app), 'the guide must be a real screen');
  const provider = readSrc('src/context/ShortcutsContext.jsx');
  assert.ok(/F1: \(\) => openHelp\(\)/.test(provider), 'F1 opens the guide');
  assert.ok(/const openHelp = useCallback\(\(\) => setActiveView\('help'\)/.test(provider));
});

check('the guide renders its content and the shortcut tables', () => {
  const view = readSrc('src/views/HelpView.jsx');
  for (const field of ['purposeLabel', 'whereLabel', 'stepsLabel', 'expectedLabel', 'notesLabel']) {
    assert.ok(new RegExp(field).test(view), `the guide view must render ${field}`);
  }
  assert.ok(/HELP\[lang\] \|\| HELP\.en/.test(view), 'the guide follows the interface language');
  assert.ok(/shortcutRows/.test(view) && /calculatorKeys/.test(view), 'the guide shows the shortcut and calculator tables');
  assert.ok(/window\.print\(\)/.test(view), 'the guide can be printed (F3 / Ctrl+P)');
});

check('every interface string used by the guide view is translated', () => {
  const view = readSrc('src/views/HelpView.jsx');
  const keys = [...view.matchAll(/t\('([a-z_]+\.[A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length > 5, 'the guide should use translated labels');
  for (const lang of LANGUAGES) {
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'));
    for (const key of keys) {
      const [section, name] = key.split('.');
      assert.ok(dict[section] && dict[section][name], `${key} missing in ${lang}`);
    }
  }
});

console.log(`--- ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
