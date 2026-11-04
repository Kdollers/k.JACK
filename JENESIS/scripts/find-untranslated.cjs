'use strict';
/**
 * find-untranslated.cjs — reports user-facing English that never reaches t().
 *
 * Modification 1 of JENESIS 0.5.4 asks for a complete translation audit. A
 * reviewer cannot hold 12 screens in their head, so this script lists every
 * literal a user could read that is written directly in the source:
 *
 *   1. JSX text between two tags            <p>Total Liquidity</p>
 *   2. literal attribute values              title="Print"
 *   3. messages handed to the user           showToast('Saved')
 *   4. labels built in data                  { label: 'Active' }
 *   5. a label glued to an expression        <p>Total: {amount}</p>
 *   6. questions put to the user             prompt('Reason?')
 *
 * It is a finder, not a judge: it prints what it finds and never edits. A
 * proper noun ("JENESIS", "Ctrl+Shift+K", a currency code) can legitimately
 * stay as it is, so the list is meant to be read.
 *
 * Usage: node scripts/find-untranslated.cjs [--json] [--src <dir>]
 */
const fs = require('fs');
const path = require('path');

const ALLOWLIST = path.join(__dirname, 'untranslated-allowlist.json');
const ROOT = path.join(__dirname, '..');
// --src lets the test suite point the scanner at a scratch directory to
// prove its rules still fire. The real audit always runs on src/.
const SRC = (() => {
  const i = process.argv.indexOf('--src');
  return i !== -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'src');
})();

/** Strings that are not English prose a user reads. */
const NOT_PROSE = /^[\s\d.,:;!?()%+\-*/=<>[\]{}'"'`|_&$#@~^\\]*$/;
/** Proper nouns, codes and keyboard keys that must never be translated. */
const KEEP_AS_IS = new Set([
  'JENESIS', 'JENESIS Seller', 'JENESIS Network & Maintenance',
  'JENESIS Accounting & Business', 'JENESIS Settings & Access Point',
  'KAYIGANWA JACQUES', 'OK', 'PDF', 'CSV',
  'JSON', 'SQL', 'URL', 'API', 'ID', 'PIN', 'Wi-Fi', 'LAN', 'IP', 'SMTP'
]);
const KEY_LIKE = /^(Ctrl|Alt|Shift|Meta)\+|^F\d{1,2}$|^\d{4}-\d{2}-\d{2}$/;
const CAMEL_OR_KEY = /^[a-z][A-Za-z0-9]*([A-Z][A-Za-z0-9]*)+$/; // camelCase identifiers

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Blanks comments and keeps line numbers intact. */
function stripComments(code) {
  let out = '';
  let i = 0;
  let mode = null;
  let quote = null;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (mode === 'line') {
      if (ch === '\n') { out += ch; mode = null; } else out += ' ';
      i += 1; continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') { out += '  '; i += 2; mode = null; } else { out += ch === '\n' ? ch : ' '; i += 1; }
      continue;
    }
    if (mode === 'string') {
      out += ch;
      if (ch === '\\') { out += next || ''; i += 2; continue; }
      if (ch === quote) mode = null;
      i += 1; continue;
    }
    if (ch === '/' && next === '/') { out += '  '; i += 2; mode = 'line'; continue; }
    if (ch === '/' && next === '*') { out += '  '; i += 2; mode = 'block'; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { out += ch; quote = ch; mode = 'string'; i += 1; continue; }
    out += ch;
    i += 1;
  }
  return out;
}

/** Cuts the string literals out of a line so attribute regexes cannot see them. */
function maskStrings(line) {
  let out = '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      out += ' ';
      if (ch === '\\') { i += 1; out += ' '; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue; }
    out += ch;
  }
  return out;
}

const findings = [];
const allowlisted = [];
let allowlist = { language_endonyms: { texts: [] }, iso_codes_and_symbols: { patterns: [] } };
try {
  const parsed = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
  // Every section is copied explicitly: a section that is silently dropped
  // here would stop being allowlisted and reappear as a false finding.
  allowlist = {
    language_endonyms: parsed.language_endonyms || { texts: [] },
    iso_codes_and_symbols: parsed.iso_codes_and_symbols || { patterns: [] },
    keyboard_and_calculator_keys: parsed.keyboard_and_calculator_keys || { texts: [] }
  };
} catch {
  // No allowlist file: every finding counts. That is the safe default.
}
const ISO_PATTERNS = allowlist.iso_codes_and_symbols.patterns.map((p) => new RegExp(p));
const ENDONYMS = new Set(allowlist.language_endonyms.texts);
const KEYS = new Set((allowlist.keyboard_and_calculator_keys || {}).texts || []);

/** True when the text is on the documented "must stay as it is" list. */
function isAllowlisted(text) {
  const value = String(text).trim();
  return ENDONYMS.has(value) || KEYS.has(value) || ISO_PATTERNS.some((re) => re.test(value));
}


function add(kind, file, line, text, context) {
  findings.push({ kind, file: path.relative(ROOT, file).split(path.sep).join('/'), line, text, context });
}

function looksLikeProse(text) {
  const value = String(text).trim();
  if (!value) return false;
  if (isAllowlisted(value)) { allowlisted.push(value); return false; }
  if (NOT_PROSE.test(value)) return false;
  if (KEEP_AS_IS.has(value)) return false;
  if (KEY_LIKE.test(value)) return false;
  if (CAMEL_OR_KEY.test(value)) return false;
  if (!/[A-Za-z]{2}/.test(value)) return false;
  // A single lowercase word is usually CSS, a role or a technical token.
  if (/^[a-z-]+$/.test(value) && !value.includes(' ')) return false;
  return true;
}

for (const file of walk(SRC)) {
  const raw = fs.readFileSync(file, 'utf8');
  const clean = stripComments(raw);
  const lines = clean.split('\n');

  lines.forEach((line, index) => {
    const lineNo = index + 1;

    // 1. JSX text nodes:  > some words <
    for (const m of line.matchAll(/>\s*([^<>{}]+?)\s*<(?=[/\w])/g)) {
      const text = m[1].trim();
      if (looksLikeProse(text)) add('jsx-text', file, lineNo, text, line.trim().slice(0, 110));
    }

    // 2. Literal attribute values on user-facing attributes.
    for (const m of line.matchAll(/\b(title|placeholder|aria-label|alt|label|header|caption)\s*=\s*(["'])([^"']*)\2/g)) {
      const text = m[3].trim();
      if (looksLikeProse(text)) add(`attr:${m[1]}`, file, lineNo, text, line.trim().slice(0, 110));
    }

    // 3. Messages handed to the user.
    for (const m of line.matchAll(/\b(showToast)\s*\(\s*(["'`])([^"'`]*)\2/g)) {
      const text = m[3].trim();
      if (looksLikeProse(text)) add(`call:${m[1]}`, file, lineNo, text, line.trim().slice(0, 110));
    }

    // 5. A label glued to an expression:  >Total: {amount}<  — the text before
    //    the braces is user-facing just as much as a plain text node is.
    //    The lookbehind skips `=>` (arrow functions) and anything containing a
    //    bracket is a handler such as onChange={(e) => setForm({...})}, which
    //    is code, not prose.
    for (const m of line.matchAll(/(?<![=])\s*>\s*([A-Za-z][^<>{}]*?)\s*\{/g)) {
      const text = m[1].trim();
      if (/[()]|=>/.test(text)) continue;
      if (looksLikeProse(text)) add('jsx-mixed', file, lineNo, text, line.trim().slice(0, 110));
    }

    // 6. Questions put to the user.
    for (const m of line.matchAll(/\b(?:window\.)?(prompt|confirm|alert)\s*\(\s*(["'`])([^"'`]*)\2/g)) {
      const text = m[3].trim();
      if (looksLikeProse(text)) add(`call:${m[1]}`, file, lineNo, text, line.trim().slice(0, 110));
    }

    // 4. Labels built inside data (menus, option lists, table columns).
    if (/\blabel\s*:\s*["']/.test(maskStrings(line))) {
      for (const m of line.matchAll(/\blabel\s*:\s*(["'])([^"']*)\1/g)) {
        const text = m[2].trim();
        if (looksLikeProse(text)) add('data-label', file, lineNo, text, line.trim().slice(0, 110));
      }
    }
  });
}

const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ findings, byKind, allowlisted: [...new Set(allowlisted)] }, null, 2));
} else {
  console.log('--- UNTRANSLATED USER-FACING TEXT (candidates) ---');
  console.log(`total: ${findings.length}   (allowlisted, intentionally untranslated: ${new Set(allowlisted).size})\n`);
  for (const [kind, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(18)} ${n}`);
  }
  console.log('');
  const byFile = {};
  for (const f of findings) byFile[f.file] = (byFile[f.file] || 0) + 1;
  for (const [file, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${file}`);
  }
}
