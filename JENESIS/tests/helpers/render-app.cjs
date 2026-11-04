'use strict';
/**
 * Draws the real interface without a browser.
 *
 * A blank window is the failure JENESIS can least afford: an identifier that
 * was never imported, or a value that is not there yet, throws while React is
 * drawing and the user is left with an empty screen. The production build does
 * not notice either — an unknown bare identifier is simply treated as a
 * global — so the interface is the first place the mistake appears.
 *
 * This helper compiles the real source with esbuild (already installed for the
 * build) and draws it with react-dom/server, replacing only the contexts and
 * the network. What is left is the drawing of the screen itself.
 *
 * What it CANNOT see: anything that only happens after data arrives or after a
 * click — effects do not run in a server render — and anything that needs a
 * real browser. Those stay unverified and are listed as such in the report.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/** An absolute path written into generated source, with forward slashes. */
function srcPath(rel) {
  return JSON.stringify(path.join(ROOT, rel).split(path.sep).join('/'));
}

/** The pieces of a browser the interface touches while it draws. */
function installBrowserStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  const media = () => ({
    matches: false,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });
  globalThis.matchMedia = media;
  globalThis.document = {
    documentElement: { classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} },
    body: { classList: { add() {}, remove() {}, toggle() {} }, style: {} },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, click() {} }),
    activeElement: null
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() {},
    matchMedia: media,
    localStorage: globalThis.localStorage,
    innerWidth: 1280, innerHeight: 800,
    print() {},
    setTimeout, clearTimeout,
    location: { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1', protocol: 'http:' }
  };
}

/**
 * Compiles the real source for Node, with the contexts and the network
 * replaced. `entry` is the generated module's own source; it may import any
 * real file through `srcPath`.
 *
 * The bundle is written under node_modules/.cache so `react` resolves, and
 * node_modules is git-ignored, so nothing is added to the repository.
 */
async function bundle({ name, stubContext, stubApi, entry }) {
  const esbuild = require('esbuild');
  const dir = path.join(ROOT, 'node_modules', '.cache', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'stub-context.jsx'), stubContext);
  fs.writeFileSync(path.join(dir, 'stub-api.js'), stubApi);

  const entryFile = path.join(dir, 'entry.jsx');
  fs.writeFileSync(entryFile, entry);

  const outfile = path.join(dir, 'bundle.cjs');
  await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    outfile,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    logLevel: 'error',
    plugins: [{
      name: 'stub-contexts',
      setup(builder) {
        const map = {
          'context/AppContext': path.join(dir, 'stub-context.jsx'),
          'context/ShortcutsContext': path.join(dir, 'stub-context.jsx'),
          'context/AppModeContext': path.join(dir, 'stub-context.jsx'),
          'services/api': path.join(dir, 'stub-api.js')
        };
        builder.onResolve({ filter: /(context|services)\/(AppContext|ShortcutsContext|AppModeContext|api)$/ }, (args) => {
          const hit = Object.keys(map).find((k) => args.path.endsWith(k));
          return hit ? { path: map[hit] } : null;
        });
      }
    }]
  });
  return require(outfile);
}

/**
 * What React writes into markup for these characters. A screen's own name is
 * compared against the markup, and three of the four applications have an "&"
 * in theirs, which React writes as "&amp;".
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * React warns that useLayoutEffect does nothing in a server render. That is
 * true and harmless here — effects are not what these tests look at — but the
 * warning drowns the results, so it is kept out of the output.
 */
function silenceServerRenderWarnings() {
  const realError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
    realError(...args);
  };
}

module.exports = { ROOT, srcPath, installBrowserStubs, bundle, silenceServerRenderWarnings, escapeHtml };
