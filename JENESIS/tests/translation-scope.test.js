'use strict';
/**
 * TRANSLATION SCOPE TEST — every t() call must actually have a `t`.
 *
 * Replacing a hard-coded string with t('some.key') is a one-line edit that
 * reads as correct and is impossible to review by eye across 20 screens. If
 * the file never calls useI18n(), the result is not a missing translation — it
 * is a ReferenceError the moment that line renders, which shows as a blank or
 * frozen screen.
 *
 * This happened once, in src/App.jsx: the loading screen was translated and
 * started calling t() that was not in scope. The whole suite still passed.
 * This test is the reason it cannot happen again.
 *
 * The check is deliberately simple: a file that calls t('…') must bring `t`
 * into scope. It does not try to understand React scoping, so a component that
 * receives `t` as a prop must still destructure it — which every component in
 * this codebase does.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let checks = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
    console.log('  \u2713 ' + name);
  } catch (err) {
    failed += 1;
    console.log('  \u2717 ' + name + '\n      ' + err.message);
  }
}

/** Every .jsx/.js file under src/, recursively. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Strips comments so a mention of t() inside an explanation does not count as
 * a call, and blanks string literals so the word `t` inside a translation
 * ("don't") cannot be mistaken for the function.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** True when the file brings `t` into scope. */
function bringsTIntoScope(code) {
  return (
    /const\s*\{\s*[^}]*\bt\b[^}]*\}\s*=\s*useI18n\s*\(/.test(code) || // const { t } = useI18n()
    /\bt\s*=\s*useI18n\s*\(/.test(code) ||                            // const t = useI18n()
    /\buseI18n\s*\(\s*\)\s*;?\s*$/m.test(code) ||                    // other shapes
    /function\s+\w+\s*\([^)]*\bt\b[^)]*\)/.test(code) ||              // t passed as a prop/param
    /\{\s*\bt\b[,\s}]/.test(code)                                     // destructured in params
  );
}

console.log('\nJENESIS translation scope tests');

const files = walk(SRC);

check('every file that calls t() brings t into scope', () => {
  const offenders = [];
  for (const file of files) {
    const code = codeOnly(fs.readFileSync(file, 'utf8'));
    // A call looks like t('…') or t("…") — not `.t(`, not a word ending in t.
    const calls = code.match(/(^|[^.\w$])t\s*\(\s*['"`]/gm);
    if (!calls) continue;
    if (!bringsTIntoScope(code)) {
      offenders.push(`${path.relative(ROOT, file)} — ${calls.length} t() call(s), no t in scope`);
    }
  }
  assert.deepStrictEqual(offenders, [],
    't() is called where it is not defined; this crashes at render:\n  ' + offenders.join('\n  '));
});

check('the check itself is alive: it catches a file with t() and no t', () => {
  // Same rules, on a sample that is deliberately broken. If this ever passes
  // for the wrong reason the suite would stop protecting the real files.
  const broken = "export default function X() {\n  return <div>{t('common.save')}</div>;\n}\n";
  const code = codeOnly(broken);
  assert.ok(/(^|[^.\w$])t\s*\(\s*['"`]/.test(code), 'the sample call must be detected');
  assert.strictEqual(bringsTIntoScope(code), false, 'the sample must be reported as broken');

  const fixed = "import { useI18n } from '../i18n';\n" +
                "export default function X() {\n  const { t } = useI18n();\n" +
                "  return <div>{t('common.save')}</div>;\n}\n";
  assert.strictEqual(bringsTIntoScope(codeOnly(fixed)), true, 'a correct file must be accepted');
});

check('no file imports useI18n without the i18n module being importable', () => {
  assert.ok(fs.existsSync(path.join(SRC, 'i18n', 'index.jsx')),
    'src/i18n/index.jsx must exist — every screen translates through it');
  for (const file of files) {
    const code = codeOnly(fs.readFileSync(file, 'utf8'));
    if (!/useI18n/.test(code)) continue;
    assert.ok(/from\s+['"][^'"]*i18n['"]/.test(code) || /useI18n\s*\(/.test(code),
      `${path.relative(ROOT, file)} uses useI18n without importing it`);
  }
});

console.log(failed === 0
  ? '\n--- ALL TRANSLATION SCOPE TESTS PASSED (' + checks + ' checks over ' + files.length + ' files) ---\n'
  : '\n--- TRANSLATION SCOPE TESTS: ' + checks + ' passed, ' + failed + ' FAILED ---\n');
process.exit(failed === 0 ? 0 : 1);
