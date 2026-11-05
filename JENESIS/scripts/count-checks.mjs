#!/usr/bin/env node
/**
 * Counts the checks reported by a `npm run test:all` transcript.
 *
 * Every suite is free to report its result in its own words — most print
 * `--- N passed, M failed ---`, the accounting suite prints one `✓` per check
 * and no total, two others print `--- ALL ... PASSED (N checks) ---`. This
 * script reads the transcript, splits it per npm script (npm echoes
 * `> package test:xxx` before each one) and adds up what each suite reported.
 *
 * Nothing is hard-coded: if a suite reports a new total, the number printed
 * here changes with it, which is what lets the release notes quote a measured
 * figure instead of a remembered one.
 *
 * Usage:  npm run test:all 2>&1 | node scripts/count-checks.mjs
 *         node scripts/count-checks.mjs path/to/transcript.log
 */
import { readFileSync } from 'node:fs';

function readInput(argv) {
  const file = argv[2];
  if (file && file !== '-') return readFileSync(file, 'utf8');
  try {
    return readFileSync(0, 'utf8'); // stdin, when the transcript is piped in
  } catch {
    return '';
  }
}

/**
 * The totals a suite printed, or null when it only printed per-check lines.
 * Suites that run more than one scenario print one line per scenario, so every
 * match is added up rather than only the last one.
 */
function reportedTotal(text) {
  const plain = [...text.matchAll(/(\d+)\s+passed,\s*(\d+)\s+failed/g)];
  if (plain.length) {
    return plain.reduce(
      (acc, m) => ({ passed: acc.passed + Number(m[1]), failed: acc.failed + Number(m[2]) }),
      { passed: 0, failed: 0 }
    );
  }

  const parenthesised = [...text.matchAll(/---\s*ALL[^(-]*\((\d+)\s+checks?/g)];
  if (parenthesised.length) {
    return parenthesised.reduce((acc, m) => ({ passed: acc.passed + Number(m[1]), failed: acc.failed }), {
      passed: 0,
      failed: 0
    });
  }

  return null; // per-check lines only
}

function countMarks(text) {
  const passed = (text.match(/^\s*✓/gm) || []).length;
  const failed = (text.match(/^\s*[✗×]/gm) || []).length;
  return { passed, failed };
}

/**
 * Whether a suite died rather than finished.
 *
 * This is the case the counter used to get wrong. It adds up what each suite
 * *printed*, so a suite that crashed before printing a total contributed
 * nothing: the total stayed clean and the run looked green. An exit code is
 * still an exit code, but the number quoted in a release must not be one that
 * a crash can hide inside.
 */
function crashSignature(text) {
  const signatures = [
    [/Error \[[A-Z_]+\]/, 'an error object'],
    [/^\s*throw /m, 'an uncaught throw'],
    [/Cannot find module ['"]/, 'a missing module'],
    [/^\s*at .+:\d+:\d+/m, 'a stack trace'],
    [/npm ERR!/, 'npm reporting a failure'],
    [/AssertionError/, 'a failed assertion'],
    [/is not a function/, 'a TypeError'],
    [/Exit handler never called/i, 'a hang']
  ];
  for (const [pattern, label] of signatures) if (pattern.test(text)) return label;
  return null;
}

const transcript = readInput(process.argv);
if (!transcript.trim()) {
  console.error('count-checks: no transcript on stdin or in the given file');
  process.exit(2);
}

// npm prints "> package test:name" (plus the command line) before each suite.
const parts = transcript.split(/^> .*?(?:^|\s)test(?::[A-Za-z0-9_-]+)?\s*$/m);
const segments = parts.slice(1); // the text before the first marker is the banner

let passed = 0;
let failed = 0;
let suites = 0;
let uncounted = 0;
let crashed = 0;

for (const segment of segments) {
  const total = reportedTotal(segment);
  if (total) {
    passed += total.passed;
    failed += total.failed;
    suites += 1;
    continue;
  }
  const marks = countMarks(segment);
  if (marks.passed === 0) {
    // Nothing countable, which is either a suite that prints its result in a
    // shape this script does not know, or a suite that died. The difference
    // decides whether the run is green, so it is not left to guesswork.
    const why = crashSignature(segment);
    if (why) {
      crashed += 1;
      failed += 1;
      suites += 1;
      console.error(`count-checks: a suite produced no results and shows ${why}; counting it as failed`);
      continue;
    }
    uncounted += 1; // genuinely no results, and nothing that looks like a crash
    continue;
  }
  passed += marks.passed;
  failed += marks.failed;
  suites += 1;
}

if (suites === 0) {
  console.error('count-checks: no suite output found in the transcript');
  process.exit(2);
}

console.log(
  `--- ${passed} checks passed, ${failed} failed --- ` +
  `(${suites} suites, ${uncounted} without output, ${crashed} crashed)`
);
process.exit(failed > 0 || crashed > 0 ? 1 : 0);
