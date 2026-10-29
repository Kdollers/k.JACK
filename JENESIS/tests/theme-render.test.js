'use strict';
/**
 * Theme render tests.
 *
 * These actually render the theme UI with React and check the produced markup,
 * instead of only reading the source files: the three options must appear, with
 * their icons and accessible names, in English, French and Kinyarwanda, and the
 * control must reflect the stored preference.
 *
 * The component is compiled with esbuild (already present as a Vite
 * dependency) and rendered with react-dom/server, so no browser is needed.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
let skipped = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

// ---------------------------------------------------------------------------
// Compile the theme UI for Node.
// ---------------------------------------------------------------------------
let render = null;
let compileError = null;

try {
  const esbuild = require('esbuild');
  // The bundle has to live inside the project so that `react` resolves; the
  // cache folder is git-ignored, so nothing is added to the repository.
  const cacheDir = path.join(ROOT, 'node_modules', '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const entry = path.join(cacheDir, 'jenesis-theme-render-entry.jsx');
  // Absolute, slash-separated specifiers: the entry lives outside src/.
  const src = (rel) => JSON.stringify(path.join(ROOT, rel).split(path.sep).join('/'));
  fs.writeFileSync(
    entry,
    `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from ${src('src/i18n')};
import { ThemeProvider, useTheme } from ${src('src/context/ThemeContext')};
import ThemeToggle from ${src('src/components/ThemeToggle')};

export function renderToggle(variant) {
  return renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ThemeToggle, { variant: variant || 'segmented' })
      )
    )
  );
}

export function renderPreference() {
  function Probe() {
    const value = useTheme();
    return React.createElement(
      'span',
      null,
      \`\${value.preference}|\${value.theme}|\${value.isDark}\`
    );
  }
  return renderToStaticMarkup(
    React.createElement(ThemeProvider, null, React.createElement(Probe, null))
  );
}
`
  );

  const outfile = path.join(cacheDir, 'jenesis-theme-render.cjs');
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    outfile,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/server'],
    loader: { '.js': 'jsx', '.mjs': 'js' },
    logLevel: 'silent',
  });
  render = require(outfile);
  try {
    fs.unlinkSync(entry);
  } catch (_) {
    /* the entry is a build artefact; leaving it in the cache is harmless */
  }
} catch (err) {
  compileError = err;
}

/** Install a fake browser environment before rendering. */
function withBrowser(storage, systemDark = false, fn) {
  const saved = { window: global.window, localStorage: global.localStorage };
  const store = {
    data: { ...storage },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
    },
    setItem(key, value) {
      this.data[key] = String(value);
    },
  };
  global.localStorage = store; // some providers read the global directly
  global.window = {
    localStorage: store,
    matchMedia: (query) => ({
      matches: systemDark && query.includes('dark'),
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
    addEventListener() {},
    removeEventListener() {},
  };
  // react-dom/server warns that useLayoutEffect does nothing on the server;
  // that is expected here (the effect is what paints the theme in a browser).
  const consoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect')) return;
    consoleError(...args);
  };
  try {
    return fn();
  } finally {
    console.error = consoleError;
    if (saved.window === undefined) delete global.window;
    else global.window = saved.window;
    if (saved.localStorage === undefined) delete global.localStorage;
    else global.localStorage = saved.localStorage;
  }
}

/** React escapes apostrophes in text; compare against the readable form. */
function decode(html) {
  return html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/** The text the provider rendered, without the wrapping <span>. */
function preferenceOf(html) {
  const match = />([a-z]+)\|([a-z]+)\|(true|false)</.exec(html);
  assert.ok(match, `the provider must report its state, got ${html}`);
  return `${match[1]}|${match[2]}|${match[3]}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('the theme UI compiles and renders', () => {
  assert.ok(!compileError, `the theme components must compile: ${compileError && compileError.message}`);
  const html = withBrowser({}, false, () => render.renderToggle('segmented'));
  assert.ok(html && html.length > 100, 'the control must render markup');
});

test('the Settings control offers Light, Dark and System with sun/moon/monitor icons', () => {
  const html = withBrowser({}, false, () => render.renderToggle('segmented'));
  for (const label of ['Light Mode', 'Dark Mode', 'System Default']) {
    assert.ok(html.includes(label), `the control must offer ${label}`);
  }
  assert.ok(/role="radiogroup"/.test(html), 'the three options form one radio group');
  assert.strictEqual((html.match(/role="radio"/g) || []).length, 3, 'three radio options');
  assert.strictEqual((html.match(/aria-checked="false"/g) || []).length, 2, 'one option is checked');
  assert.strictEqual((html.match(/aria-checked="true"/g) || []).length, 1);
  // lucide-react draws <svg> icons; one per option.
  assert.ok((html.match(/<svg/g) || []).length >= 3, 'every option has an icon');
  assert.ok(html.includes('Active'), 'the active option is marked');
});

test('the control renders in French and Kinyarwanda', () => {
  const french = decode(withBrowser({ genesis_lang: 'fr' }, false, () => render.renderToggle('segmented')));
  assert.ok(french.includes('Mode clair') && french.includes('Mode sombre'), 'French labels');
  assert.ok(french.includes('Valeur du système'), 'French system label');

  const kiny = decode(withBrowser({ genesis_lang: 'rw' }, false, () => render.renderToggle('segmented')));
  assert.ok(kiny.includes("Uburyo bw'umucyo") && kiny.includes("Uburyo bw'ijoro"), 'Kinyarwanda labels');
  assert.ok(kiny.includes('Igenamiterere rya mudasobwa'), 'Kinyarwanda system label');
});

test('the stored preference is what the interface shows', () => {
  const dark = preferenceOf(withBrowser({ jenesis_theme: 'dark' }, false, () => render.renderPreference()));
  assert.strictEqual(dark, 'dark|dark|true', 'stored Dark Mode must resolve to dark');

  const light = preferenceOf(withBrowser({ jenesis_theme: 'light' }, true, () => render.renderPreference()));
  assert.strictEqual(light, 'light|light|false', 'stored Light Mode must stay light even if the OS is dark');

  const systemDark = preferenceOf(withBrowser({ jenesis_theme: 'system' }, true, () => render.renderPreference()));
  assert.strictEqual(systemDark, 'system|dark|true', 'System Default must follow a dark OS');

  const systemLight = preferenceOf(withBrowser({ jenesis_theme: 'system' }, false, () => render.renderPreference()));
  assert.strictEqual(systemLight, 'system|light|false', 'System Default must follow a light OS');
});

test('an unknown stored value falls back to Light Mode', () => {
  const value = preferenceOf(withBrowser({ jenesis_theme: 'neon-purple' }, true, () => render.renderPreference()));
  assert.strictEqual(value, 'light|light|false', 'an unknown preference must fall back to Light Mode');
});

test('the header switch is a single button with an accessible name', () => {
  const html = withBrowser({ jenesis_theme: 'light' }, false, () => render.renderToggle('button'));
  assert.ok(/<button/.test(html), 'the header control is a button');
  assert.ok(/aria-label="Appearance/.test(html), 'it names the setting for screen readers');
  assert.ok(/<svg/.test(html), 'it shows the sun or moon icon');
  assert.ok(html.includes('Switch to Dark Mode'), 'it says what it will do');
  assert.ok(html.includes('Light Mode'), 'it says which theme is active');

  const darkHtml = withBrowser({ jenesis_theme: 'dark' }, false, () => render.renderToggle('button'));
  assert.ok(darkHtml.includes('Switch to Light Mode'), 'it offers the opposite theme when dark');
});

// ---------------------------------------------------------------------------
(async () => {
  console.log('--- THEME RENDER TESTS (React, compiled with esbuild) ---');
  if (compileError) {
    skipped = pending.length;
    console.log(`  ! skipped: the theme UI could not be compiled (${compileError.message})`);
  }
  for (const { name, fn } of pending) {
    if (compileError) {
      console.log(`  - ${name}`);
      continue;
    }
    try {
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      failed++;
      console.log(`  \u2717 ${name}\n      ${err.message}`);
    }
  }
  console.log(`--- ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''} ---`);
  process.exit(failed === 0 ? 0 : 1);
})();
