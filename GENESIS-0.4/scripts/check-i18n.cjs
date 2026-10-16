'use strict';
/** Static translation audit. Run with `node scripts/check-i18n.cjs` to fail CI
 * on missing/empty/duplicate keys, untranslated JSX or notification literals.
 * `--report` prints a detailed inventory for fixing an older checkout.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const root = path.join(__dirname, '..');
const locales = ['en', 'fr', 'rw'];
const issues = [];
const dictionaries = {};
const keys = {};
const called = new Set();
const ALLOWED_MARKS = new Set(['G', 'GENESIS', 'ERP', 'RESTORE', 'USD', 'VAT', 'ID']);

function issue(file, line, kind, value) { issues.push({ file, line, kind, value: String(value).slice(0, 150) }); }
function walk(node, visit, parent = null, edge = '') {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node, parent, edge);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'comments', 'leadingComments', 'trailingComments', 'extra', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((n) => walk(n, visit, node, key));
    else if (value && typeof value === 'object') walk(value, visit, node, key);
  }
}
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const pathName = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, pathName, out);
    else out[pathName] = value;
  }
  return out;
}
function findDuplicates(node, file, parentKey = '') {
  if (!node || node.type !== 'ObjectExpression') return;
  const seen = new Set();
  for (const p of node.properties) {
    const key = p.key?.value || p.key?.name;
    if (seen.has(key)) issue(file, p.loc.start.line, 'duplicate key', `${parentKey}${key}`);
    seen.add(key);
    findDuplicates(p.value, file, `${parentKey}${key}.`);
  }
}
for (const lang of locales) {
  const file = `src/i18n/${lang}.json`;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  dictionaries[lang] = JSON.parse(text);
  keys[lang] = flatten(dictionaries[lang]);
  findDuplicates(parser.parseExpression(`(${text})`), file);
  for (const [key, value] of Object.entries(keys[lang])) {
    if (typeof value !== 'string' || !value.trim()) issue(file, 1, 'empty value', key);
  }
}
const allKeys = new Set(locales.flatMap((l) => Object.keys(keys[l])));
for (const key of allKeys) {
  const enValue = keys.en[key];
  const placeholders = (value) => [...new Set((String(value).match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || []))].sort().join(',');
  for (const lang of locales) {
    if (!(key in keys[lang])) issue(`src/i18n/${lang}.json`, 1, 'missing key', key);
    else if (lang !== 'en' && placeholders(keys[lang][key]) !== placeholders(enValue)) {
      issue(`src/i18n/${lang}.json`, 1, 'placeholder mismatch', key);
    }
  }
}
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(p) : /\.[jt]sx?$/.test(entry.name) ? [p] : [];
  });
}
function displayText(text) {
  const v = text.replace(/\s+/g, ' ').trim();
  return /[\p{L}]{2,}/u.test(v) && !ALLOWED_MARKS.has(v) ? v : null;
}
for (const filepath of sourceFiles(path.join(root, 'src'))) {
  const file = path.relative(root, filepath);
  const src = fs.readFileSync(filepath, 'utf8');
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  walk(ast, (node, parent) => {
    if (node.type === 'CallExpression' && ['t', 'plural'].includes(node.callee?.name)) {
      const arg = node.arguments[0];
      if (arg?.type === 'StringLiteral') {
        const names = node.callee.name === 'plural' ? [`${arg.value}.one`, `${arg.value}.other`] : [arg.value];
        for (const name of names) {
          called.add(name);
          for (const lang of locales) if (!(name in keys[lang])) issue(file, node.loc.start.line, 'unknown translation key', name);
        }
      }
    }
    if (node.type === 'JSXText') {
      const text = displayText(node.value);
      if (text) issue(file, node.loc.start.line, 'JSX text', text);
    }
    if (node.type === 'JSXAttribute' && ['placeholder', 'title', 'alt', 'aria-label', 'aria-description'].includes(node.name.name) && node.value?.type === 'StringLiteral') {
      const text = displayText(node.value.value);
      if (text) issue(file, node.loc.start.line, 'JSX attribute', `${node.name.name}=${text}`);
    }
    if (node.type === 'CallExpression' && ['showToast', 'setError', 'setAuthError', 'alert', 'confirm', 'prompt'].includes(node.callee?.name)) {
      const arg = node.arguments[0];
      if (arg && ['StringLiteral', 'TemplateLiteral'].includes(arg.type)) {
        issue(file, node.loc.start.line, 'notification literal', src.slice(arg.start, arg.end));
      }
    }
    if (node.type === 'JSXExpressionContainer' && node.expression?.type === 'ConditionalExpression' &&
        !(parent?.type === 'JSXAttribute' && parent.name?.name === 'className')) {
      for (const branch of ['consequent', 'alternate']) {
        const part = node.expression[branch];
        if (part.type === 'StringLiteral' && displayText(part.value)) issue(file, part.loc.start.line, 'conditional text', part.value);
      }
    }
  });
}
for (const key of allKeys) {
  if (!called.has(key) && !key.startsWith('errors.')) {
    // A dynamic t(`settings.role_${role}`) or other template may use this key.
    // Unused entries are informational, not a failure.
  }
}
if (process.argv.includes('--report')) {
  console.log(`Translation audit: ${allKeys.size} keys, ${issues.length} findings`);
  for (const i of issues) console.log(`${i.file}:${i.line} [${i.kind}] ${i.value}`);
} else {
  for (const i of issues.slice(0, 60)) console.error(`${i.file}:${i.line} [${i.kind}] ${i.value}`);
  console.log(`i18n audit: ${allKeys.size} keys, ${issues.length} findings${issues.length > 60 ? ' (run --report for all)' : ''}`);
}
process.exitCode = issues.length ? 1 : 0;
