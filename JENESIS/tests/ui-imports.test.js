'use strict';
/**
 * UI IMPORT AND COMPONENT TESTS.
 *
 * A missing import is invisible to a compiler here: an unknown bare identifier
 * is treated as a global, the production build succeeds, and the interface
 * throws "ReferenceError: <Name> is not defined" on the user's screen the
 * moment that component is drawn. That is exactly how JENESIS Admin failed
 * with `MessageSquare` (the Messenger button in the header) — the whole
 * interface went down, in all three applications, because every one of them
 * draws the same header.
 *
 * These checks look for that class of defect across the entire interface:
 *   1. every component drawn in JSX is imported, declared or a known global;
 *   2. every icon imported from lucide-react really exists in the package;
 *   3. every relative import resolves, and the file exports what is imported;
 *   4. the icon sets of the three applications stay in step (Seller,
 *      Maintenance and Admin are checked with the same rules).
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

/**
 * Removes comments, replacing every character with a space so that line and
 * column numbers stay correct. Without this a comment inside an import list
 * (or a commented-out element) is mistaken for code by the name extractors.
 */
function stripComments(code) {
  let out = '';
  let i = 0;
  let mode = null; // null | 'line' | 'block' | 'string'
  let quote = null;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (mode === 'line') {
      if (ch === '\n') { out += ch; i += 1; mode = null; } else { out += ch === '\n' ? ch : ' '; i += 1; }
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') { out += '  '; i += 2; mode = null; } else { out += ch === '\n' ? ch : ' '; i += 1; }
      continue;
    }
    if (mode === 'string') {
      out += ch;
      if (ch === '\\') { out += next || ''; i += 2; continue; }
      if (ch === quote) mode = null;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') { out += '  '; i += 2; mode = 'line'; continue; }
    if (ch === '/' && next === '*') { out += '  '; i += 2; mode = 'block'; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { out += ch; quote = ch; mode = 'string'; i += 1; continue; }
    out += ch;
    i += 1;
  }
  return out;
}

/** Source of a file with its comments blanked out. */
function readClean(rel) {
  return stripComments(read(rel));
}

function sourceFiles(dir = 'src', out = []) {
  const abs = path.join(ROOT, dir);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'build', 'coverage'].includes(entry.name)) sourceFiles(path.join(dir, entry.name), out);
    } else if (/\.(jsx?|mjs)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name).split(path.sep).join('/'));
    }
  }
  return out;
}

/** Names a JSX element may use without being imported in the file. */
const KNOWN_GLOBALS = new Set([
  'React',
  'Fragment',
  'Suspense',
  'StrictMode',
  'Profiler',
  'Portal'
]);

/** Every name this file brings into scope (imports, declarations, parameters). */
function declaredNames(code) {
  const names = new Set();

  for (const match of code.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = match[1];
    const braced = [...clause.matchAll(/\{([\s\S]*?)\}/g)];
    for (const group of braced) {
      for (const raw of group[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/).pop().trim();
        if (name && !name.startsWith('*')) names.add(name);
      }
    }
    const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (namespace) names.add(namespace[1]);
    const withoutBraces = clause.replace(/\{[\s\S]*?\}/g, ' ');
    for (const raw of withoutBraces.split(',')) {
      const name = raw.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }

  for (const match of code.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) names.add(match[1]);

  // Destructuring: const { a, b } = ... and const [a, b] = ...
  for (const match of code.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().split(/\s*:\s*/).pop().trim().split(/\s*=\s*/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  // Parameters: function f(a, b), (a, b) =>, a =>
  for (const match of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().split(/\s*=\s*/)[0].replace(/[{}[\]]/g, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  for (const match of code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) names.add(match[1]);
  for (const match of code.matchAll(/\bfunction\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().replace(/[{}[\]]/g, '').split(/\s*=\s*/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/** Every component name drawn in JSX in this file, with its line number. */
function jsxComponentNames(code) {
  const out = [];
  const push = (name, index) => {
    const base = name.split('.')[0];
    if (!/^[A-Z]/.test(base)) return; // <div>, <span> — HTML tags
    const line = code.slice(0, index).split('\n').length;
    out.push({ name: base, line });
  };
  for (const match of code.matchAll(/<\/?\s*([A-Za-z][\w.]*)/g)) push(match[1], match.index);
  return out;
}

const files = sourceFiles();

check('every component drawn in the interface is imported or declared', () => {
  const missing = [];
  for (const file of files) {
    const code = readClean(file);
    const declared = declaredNames(code);
    for (const used of jsxComponentNames(code)) {
      if (declared.has(used.name) || KNOWN_GLOBALS.has(used.name)) continue;
      missing.push(`${file}:${used.line} draws <${used.name} /> without importing it`);
    }
  }
  assert.deepStrictEqual(missing, [], `undefined components would crash the interface:\n      ${missing.join('\n      ')}`);
});

check('the Messenger icon in the header is imported where it is drawn', () => {
  // The defect this suite was written for: JENESIS Admin (and Seller and
  // Maintenance) died with "ReferenceError: MessageSquare is not defined".
  const navbar = read('src/components/Navbar.jsx');
  assert.ok(/<MessageSquare\b/.test(navbar), 'the header must still draw the Messenger icon');
  assert.ok(
    /import\s*\{[\s\S]*?MessageSquare[\s\S]*?\}\s*from\s*'lucide-react'/.test(navbar),
    'Navbar.jsx must import MessageSquare from lucide-react'
  );
});

/**
 * The names lucide-react exports. The package is ESM-only here, so the list is
 * read out of its entry point (`export { default as X }`) rather than required.
 */
function lucideExports() {
  const entries = [
    'node_modules/lucide-react/dist/esm/lucide-react.js',
    'node_modules/lucide-react/dist/lucide-react.d.ts'
  ];
  const names = new Set();
  for (const entry of entries) {
    const file = path.join(ROOT, entry);
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf8');
    for (const match of code.matchAll(/as\s+([A-Za-z_$][\w$]*)\s*(?=[,}\s])/g)) names.add(match[1]);
    for (const match of code.matchAll(/declare\s+const\s+([A-Za-z_$][\w$]*)\s*:/g)) names.add(match[1]);
  }
  return names;
}

check('every icon imported from lucide-react exists in the installed package', () => {
  const exported = lucideExports();
  assert.ok(exported.size > 100, `lucide-react exports could not be read (found ${exported.size})`);
  const missing = [];
  let icons = 0;
  for (const file of files) {
    const code = readClean(file);
    for (const match of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g)) {
      for (const raw of match[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        icons += 1;
        if (!exported.has(name)) missing.push(`${file}: ${name}`);
      }
    }
  }
  assert.ok(icons > 20, `expected the interface to use a set of icons, found ${icons}`);
  assert.deepStrictEqual(missing, [], `these icons are not exported by lucide-react:\n      ${missing.join('\n      ')}`);
});

check('every relative import resolves to a real file', () => {
  const missing = [];
  for (const file of files) {
    const code = readClean(file);
    for (const match of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(path.join(ROOT, file)), match[1]);
      const candidates = [target, `${target}.js`, `${target}.jsx`, path.join(target, 'index.js'), path.join(target, 'index.jsx')];
      if (!candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())) {
        missing.push(`${file} imports ${match[1]}`);
      }
    }
  }
  assert.deepStrictEqual(missing, [], `unresolved imports:\n      ${missing.join('\n      ')}`);
});

check('every named import is really exported by the module it comes from', () => {
  const missing = [];
  for (const file of files) {
    const code = readClean(file);
    for (const match of code.matchAll(/import\s+([^'"]+?)\s+from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(path.join(ROOT, file)), match[2]);
      const candidates = [target, `${target}.js`, `${target}.jsx`, path.join(target, 'index.js'), path.join(target, 'index.jsx')];
      const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!resolved || !/\.(jsx?|mjs)$/.test(resolved)) continue; // css, json, images
      const targetCode = stripComments(fs.readFileSync(resolved, 'utf8'));
      const named = [...match[1].matchAll(/\{([\s\S]*?)\}/g)]
        .flatMap((group) => group[1].split(','))
        .map((raw) => raw.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      for (const name of named) {
        const exported =
          new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`).test(targetCode) ||
          new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(targetCode);
        if (!exported) missing.push(`${file} imports { ${name} } from ${match[2]}`);
      }
      const clause = match[1].replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(clause) && !/export\s+default/.test(targetCode)) {
        missing.push(`${file} imports the default export of ${match[2]}, which has none`);
      }
    }
  }
  assert.deepStrictEqual(missing, [], `imports that cannot work:\n      ${missing.join('\n      ')}`);
});

check('the three applications are covered by the same rules', () => {
  // The three applications are one interface with three identities, so a
  // missing import harms all of them at once. The shared shell and each
  // application's own screens are all scanned above; this records which files
  // carry the identity of each application so the coverage is visible.
  const shell = ['src/components/Navbar.jsx', 'src/components/Sidebar.jsx', 'src/components/AppOverlays.jsx', 'src/App.jsx'];
  for (const file of shell) assert.ok(files.includes(file), `${file} must exist and be scanned`);
  for (const file of files) {
    const code = readClean(file);
    const declared = declaredNames(code);
    for (const used of jsxComponentNames(code)) {
      assert.ok(
        declared.has(used.name) || KNOWN_GLOBALS.has(used.name),
        `${file}:${used.line} draws <${used.name} /> without importing it`
      );
    }
  }
});

check('an undefined component is reported by this checker (self-test)', () => {
  // Guards the guard: if the extractor stops noticing missing imports, this
  // fails instead of the interface.
  const probe = "import React from 'react';\nexport default function P() {\n  return <NotImportedAnywhere />;\n}\n";
  const declared = declaredNames(probe);
  const used = jsxComponentNames(probe);
  assert.strictEqual(used.length, 1, 'the probe must contain exactly one component name');
  assert.strictEqual(used[0].name, 'NotImportedAnywhere');
  assert.ok(!declared.has(used[0].name), 'the probe component must be undeclared');
});

console.log(`--- ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
