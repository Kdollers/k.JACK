/**
 * The test suite must run on the Node version continuous integration uses.
 *
 * It once required `node:sqlite` directly in one file. That module only exists
 * from Node 22.5 onwards, so the whole suite crashed on a Node 20 runner — and
 * because the crash happened before the suite printed a total, the run still
 * looked clean to the check counter. The failure was only visible as an exit
 * code on the one job that bothered to look at it.
 *
 * These checks keep the suite honest about what it assumes of its host.
 */
const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;

function testFiles() {
  return fs
    .readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.js') || name.endsWith('.cjs'))
    .map((name) => path.join(TESTS_DIR, name));
}

const checks = [];
function check(ok, label) {
  checks.push({ ok: !!ok, label });
}

// ---------------------------------------------------------------------------
// 1. Nothing in tests/ depends on a version-specific built-in module directly.
//    Database access goes through tests/open-database.cjs, which picks the
//    driver this machine actually has.
// ---------------------------------------------------------------------------
const VERSION_SPECIFIC = /require\(\s*['"](node:sqlite)['"]\s*\)/;
for (const file of testFiles()) {
  if (path.basename(file) === 'open-database.cjs') continue; // the one allowed place
  const text = fs.readFileSync(file, 'utf8');
  const offender = text.match(VERSION_SPECIFIC);
  check(
    !offender,
    `${path.basename(file)} does not require ${offender ? offender[1] : 'a version-specific module'} directly`
  );
}

// ---------------------------------------------------------------------------
// 2. The shared opener really does work on this machine, with whichever driver
//    is installed. It must not silently return a broken handle.
// ---------------------------------------------------------------------------
let driverLabel = 'none';
let probe;
try {
  probe = require('./open-database.cjs').openReadonly(path.join(__dirname, '..', 'genesis.db'));
  const rows = probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  driverLabel = probe.constructor && probe.constructor.name ? probe.constructor.name : 'unknown';
  check(Array.isArray(rows) && rows.length > 0, `the shared opener reads genesis.db (${rows.length} tables via ${driverLabel})`);
} catch (error) {
  check(false, `the shared opener reads genesis.db (${error.message})`);
} finally {
  if (probe) probe.close();
}

// ---------------------------------------------------------------------------
// 3. Every suite can be named from one place: a test script that is not in
//    `test:all` never runs in CI, no matter how green it looks locally.
// ---------------------------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const all = pkg.scripts && pkg.scripts['test:all'] ? pkg.scripts['test:all'] : '';
const named = new Set([...all.matchAll(/test:([A-Za-z0-9_-]+)/g)].map((m) => m[1]));
const scriptNames = Object.keys(pkg.scripts).filter(
  (name) => name.startsWith('test:') && name !== 'test:all' && name !== 'test:count'
);
// A script that test:all does not run never runs on CI. Anything left out is
// said out loud, with the reason, on every transcript — an undisclosed gap is
// how a suite ends up claiming more than it measured.
const DOCUMENTED_EXCLUSIONS = {
  'test:e2e':
    'drives a real browser with Playwright; neither the browser nor the Python ' +
    'package is installable in CI, so it stays a manual check'
};
const orphans = scriptNames.filter(
  (name) => !named.has(name.slice('test:'.length)) && !DOCUMENTED_EXCLUSIONS[name]
);
// ...and the map must not grow stale: an exclusion for a script that no longer
// exists hides a name change instead of explaining a gap.
const staleExclusions = Object.keys(DOCUMENTED_EXCLUSIONS).filter((name) => !pkg.scripts[name]);
check(staleExclusions.length === 0, `no exclusion is kept for a script that no longer exists`);
check(
  orphans.length === 0,
  orphans.length === 0
    ? `every test script either runs inside test:all or says why it cannot (${scriptNames.length} scripts)`
    : `test:all is missing these scripts: ${orphans.join(', ')}`
);

// ---------------------------------------------------------------------------
// 4. Say plainly what does not run, so the transcript never overclaims.
// ---------------------------------------------------------------------------
for (const [name, reason] of Object.entries(DOCUMENTED_EXCLUSIONS)) {
  console.log(`  - not run automatically: npm run ${name} (${reason})`);
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
const failed = checks.filter((c) => !c.ok).length;
for (const c of checks) console.log(`  ${c.ok ? '\u2713' : '\u2717'} ${c.label}`);
console.log(`  (driver: ${driverLabel})`);
console.log(`--- ${checks.length - failed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
