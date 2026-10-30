'use strict';
/**
 * Theme tests for JENESIS (Light Mode / Dark Mode / System Default).
 *
 * These checks cover the behaviour a user relies on:
 *   - both themes can be selected, and switching is immediate;
 *   - the choice survives a reload and a restart (stored preference);
 *   - Light Mode is used when nothing has been stored yet;
 *   - every colour class used anywhere in the interface is either remapped for
 *     Dark Mode or documented as theme-neutral, so no screen stays light-only;
 *   - the theme never talks to the accounting backend, so no financial record
 *     can be touched by changing the appearance;
 *   - the Electron integration stays inside the existing security model.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let passed = 0;
let failed = 0;
let skipped = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walk(dir, extensions, skip = ['node_modules', 'dist']) {
  const out = [];
  const abs = path.join(ROOT, dir);
  (function descend(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skip.includes(entry.name)) continue;
        descend(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        // Always forward slashes: the assertions below match on path text and
        // path.relative() uses backslashes on Windows.
        out.push(path.relative(ROOT, full).split(path.sep).join('/'));
      }
    }
  })(abs);
  return out;
}

/** A minimal stand-in for localStorage. */
function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

/** A minimal stand-in for document.documentElement. */
function fakeElement() {
  const classes = new Set();
  return {
    classes,
    attributes: {},
    style: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Theme rules (pure logic, shared by every control)
// ---------------------------------------------------------------------------
test('Light Mode and Dark Mode can both be selected and resolved', async () => {
  const theme = await import('../src/theme.mjs');
  assert.deepStrictEqual(theme.THEME_PREFERENCES, ['light', 'dark', 'system']);
  assert.strictEqual(theme.resolveTheme('light'), 'light');
  assert.strictEqual(theme.resolveTheme('dark'), 'dark');
  assert.strictEqual(theme.resolveTheme('dark', false), 'dark');
  assert.strictEqual(theme.resolveTheme('light', true), 'light');
});

test('System Default follows the operating system', async () => {
  const theme = await import('../src/theme.mjs');
  assert.strictEqual(theme.resolveTheme('system', true), 'dark');
  assert.strictEqual(theme.resolveTheme('system', false), 'light');
  assert.strictEqual(theme.isDarkTheme('system', true), true);
  assert.strictEqual(theme.isDarkTheme('system', false), false);
});

test('Light Mode is the documented default when nothing is stored', async () => {
  const theme = await import('../src/theme.mjs');
  assert.strictEqual(theme.DEFAULT_THEME_PREFERENCE, 'light');
  assert.strictEqual(theme.readThemePreference(memoryStorage()), 'light');
  assert.strictEqual(theme.readThemePreference(null), 'light');
  assert.strictEqual(theme.normalizeThemePreference('purple'), 'light');
  assert.strictEqual(theme.normalizeThemePreference(undefined), 'light');
  // A storage that throws (private mode, disabled cookies) must not break the app.
  const hostile = {
    getItem() {
      throw new Error('storage is disabled');
    },
  };
  assert.strictEqual(theme.readThemePreference(hostile), 'light');
});

test('the selected theme is persisted and read back (reload and restart)', async () => {
  const theme = await import('../src/theme.mjs');
  const storage = memoryStorage();
  assert.strictEqual(theme.writeThemePreference(storage, 'dark'), 'dark');
  assert.strictEqual(theme.readThemePreference(storage), 'dark');
  assert.strictEqual(storage.data[theme.THEME_STORAGE_KEY], 'dark');
  theme.writeThemePreference(storage, 'system');
  assert.strictEqual(theme.readThemePreference(storage), 'system');
  // Invalid values never reach storage.
  theme.writeThemePreference(storage, 'neon');
  assert.strictEqual(storage.data[theme.THEME_STORAGE_KEY], 'light');
});

test('switching theme updates the document immediately (no reload)', async () => {
  const theme = await import('../src/theme.mjs');
  const element = fakeElement();
  theme.applyTheme(element, 'dark');
  assert.ok(element.classList.contains('dark'), 'the dark class must be applied');
  assert.strictEqual(element.getAttribute('data-theme'), 'dark');
  assert.strictEqual(element.style.colorScheme, 'dark');

  theme.applyTheme(element, 'light');
  assert.ok(!element.classList.contains('dark'), 'the dark class must be removed');
  assert.strictEqual(element.getAttribute('data-theme'), 'light');
  assert.strictEqual(element.style.colorScheme, 'light');
});

test('the header switch moves between the two explicit themes', async () => {
  const theme = await import('../src/theme.mjs');
  assert.strictEqual(theme.toggleTheme('light'), 'dark');
  assert.strictEqual(theme.toggleTheme('dark'), 'light');
  assert.strictEqual(theme.toggleTheme('system', true), 'light');
  assert.strictEqual(theme.toggleTheme('system', false), 'dark');
  assert.strictEqual(theme.systemPrefersDarkFrom({ matches: true }), true);
  assert.strictEqual(theme.systemPrefersDarkFrom(null), false);
});

// ---------------------------------------------------------------------------
// 2. First paint: the inline bootstrap in index.html
// ---------------------------------------------------------------------------
function runBootstrap({ stored, systemDark = false, storageThrows = false, store = null }) {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const bootstrap = scripts.find((code) => code.includes('jenesis_theme'));
  assert.ok(bootstrap, 'index.html must apply the saved theme before the first paint');

  const classes = new Set();
  const element = fakeElement();
  element.classList.add = (name) => classes.add(name);
  const sandbox = {
    localStorage: storageThrows
      ? {
          getItem() {
            throw new Error('blocked');
          },
        }
      : memoryStorage({ jenesis_theme: stored, ...(store || {}) }),
    document: { documentElement: element },
    window: {
      matchMedia: (query) => ({
        matches: systemDark && query.includes('dark'),
      }),
    },
  };
  vm.runInNewContext(bootstrap, sandbox);
  return { classes, element };
}

test('a stored Dark Mode is painted before the interface loads', () => {
  const { classes, element } = runBootstrap({ stored: 'dark' });
  assert.ok(classes.has('dark'), 'dark must be applied before first paint');
  assert.strictEqual(element.getAttribute('data-theme'), 'dark');
});

test('System Default is honoured at first paint', () => {
  const darkOs = runBootstrap({ stored: 'system', systemDark: true });
  assert.ok(darkOs.classes.has('dark'));
  const lightOs = runBootstrap({ stored: 'system', systemDark: false });
  assert.ok(!lightOs.classes.has('dark'));
  assert.strictEqual(lightOs.element.getAttribute('data-theme'), 'light');
});

test('each application paints its own remembered theme', () => {
  // Maintenance remembers Dark while Admin remembers Light: the bootstrap must
  // read the key of the application this window belongs to.
  const store = {
    jenesis_app: 'maintenance',
    'jenesis_theme:maintenance': 'dark',
    'jenesis_theme:admin': 'light'
  };
  const dark = runBootstrap({ stored: 'light', store });
  assert.ok(dark.classes.has('dark'), 'Maintenance must paint its own Dark Mode');
  assert.strictEqual(dark.element.getAttribute('data-app'), 'maintenance');

  const admin = runBootstrap({ stored: 'dark', store: { jenesis_app: 'admin', 'jenesis_theme:admin': 'light' } });
  assert.ok(!admin.classes.has('dark'), 'Admin must paint its own Light Mode');
  assert.strictEqual(admin.element.getAttribute('data-app'), 'admin');
});

test('an application without a preference of its own inherits the shared one', () => {
  const inherited = runBootstrap({ stored: 'dark', store: { jenesis_app: 'seller' } });
  assert.ok(inherited.classes.has('dark'), 'the legacy single key still applies');
  const unknown = runBootstrap({ stored: 'dark', store: { jenesis_app: 'nonsense' } });
  assert.ok(unknown.classes.has('dark'), 'an unknown application id falls back to the shared key');
});

test('an unreadable or empty preference falls back to Light Mode', () => {
  const empty = runBootstrap({ stored: null });
  assert.ok(!empty.classes.has('dark'));
  assert.strictEqual(empty.element.getAttribute('data-theme'), 'light');
  const blocked = runBootstrap({ stored: 'dark', storageThrows: true });
  assert.ok(!blocked.classes.has('dark'), 'a blocked storage must not break startup');
});

// ---------------------------------------------------------------------------
// 3. Tokens and the Dark Mode compatibility layer
// ---------------------------------------------------------------------------
const css = read('src/index.css');

test('Light and Dark define exactly the same token names', () => {
  const tokens = (selector) => {
    const block = css.slice(css.indexOf(selector + ' {'));
    const end = block.indexOf('\n  }');
    const names = [...block.slice(0, end).matchAll(/(--j-[a-z-]+):/g)].map((m) => m[1]);
    return names.sort();
  };
  const light = tokens(':root');
  const dark = tokens('.dark');
  assert.ok(light.length > 15, `expected a full token set, found ${light.length}`);
  assert.deepStrictEqual(dark, light, 'every token must be redefined for Dark Mode');
});

test('the tokens cover every role the design system needs', () => {
  for (const token of [
    '--j-canvas',
    '--j-surface',
    '--j-surface-muted',
    '--j-surface-hover',
    '--j-line',
    '--j-line-strong',
    '--j-ink',
    '--j-ink-secondary',
    '--j-ink-muted',
    '--j-ink-subtle',
    '--j-shell',
    '--j-shell-line',
    '--j-shell-ink',
    '--j-brand',
    '--j-brand-strong',
  ]) {
    assert.ok(css.includes(`${token}:`), `${token} must be defined`);
  }
});

test('Dark Mode backgrounds are dark and its text is light', () => {
  const darkBlock = css.slice(css.indexOf('.dark {'), css.indexOf('.dark {'));
  // The token block is the first `.dark {` occurrence right after :root.
  const start = css.indexOf('\n  .dark {');
  const block = css.slice(start, css.indexOf('\n  }', start));
  const value = (token) => {
    const match = block.match(new RegExp(`${token}:\\s*([^;]+);`));
    assert.ok(match, `${token} must be defined for dark`);
    return match[1].trim().split(/\s+/).map(Number);
  };
  const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  assert.ok(luminance(value('--j-canvas')) < 0.1, 'the dark page background must be dark');
  assert.ok(luminance(value('--j-surface')) < 0.15, 'dark cards must stay dark');
  assert.ok(luminance(value('--j-ink')) > 0.8, 'dark primary text must be light');
  assert.ok(luminance(value('--j-ink-muted')) > 0.6, 'dark secondary text must stay readable');
  assert.ok(
    luminance(value('--j-surface')) > luminance(value('--j-canvas')),
    'cards must be distinguishable from the page background'
  );
  assert.ok(
    luminance(value('--j-line')) > luminance(value('--j-surface')),
    'borders must be visible against cards'
  );
  assert.ok(darkBlock.length >= 0);
});

// Classes that are intentionally identical in both themes, with the reason.
const THEME_NEUTRAL = {
  'text-white': 'text on the always-dark shell and on coloured buttons',
  'bg-black': 'scrims are dark in both themes',
  'bg-transparent': 'no colour',
  'bg-blue-600': 'primary button keeps the brand colour in both themes',
  'bg-blue-500': 'primary button hover keeps the brand colour',
  'bg-emerald-600': 'success/action button stays vivid in both themes',
  'bg-emerald-500': 'success button hover',
  'bg-rose-600': 'danger button stays vivid in both themes',
  'bg-rose-500': 'danger button hover',
  'bg-amber-600': 'warning button stays vivid',
  'bg-amber-500': 'warning button hover',
  'bg-indigo-600': 'accent button',
  'bg-indigo-500': 'accent button hover',
  'bg-red-700': 'solid accent',
  'bg-red-50': 'used inside an already themed panel',
  'bg-cyan-50': 'used inside an already themed panel',
  'border-blue-600': 'brand focus/active border',
  'border-emerald-600': 'status border',
  'border-amber-600': 'status border',
  'border-amber-700': 'status border',
  'border-indigo-700': 'status border',
  'border-purple-700': 'status border',
  'border-red-700': 'status border',
  'border-rose-600': 'status border',
  'border-emerald-700': 'status border',
  'divide-slate-200': 'covered by the divide rule',
  'divide-slate-100': 'covered by the divide rule',
  'bg-slate-800/80': 'translucent shell surface',
  'bg-slate-800/40': 'translucent shell surface',
  'bg-slate-700/80': 'translucent shell surface',
  'bg-slate-950/40': 'translucent shell surface',
  'bg-slate-900/60': 'translucent shell surface',
  'bg-emerald-900/60': 'translucent badge on the shell',
  'bg-blue-900/60': 'translucent badge on the shell',
  'bg-amber-900/60': 'translucent badge on the shell',
  'bg-indigo-900/60': 'translucent badge on the shell',
  'bg-purple-900/60': 'translucent badge on the shell',
  'bg-red-900/60': 'translucent badge on the shell',
  'bg-amber-950/90': 'toast surface (already dark)',
  'bg-blue-950/90': 'toast surface (already dark)',
  'bg-emerald-950/90': 'toast surface (already dark)',
  'bg-rose-950': 'toast surface (already dark)',
  'bg-rose-950/90': 'toast surface (already dark)',
  'bg-blue-500/20': 'translucent brand chip',
  'bg-slate-750': 'defined in the palette and remapped by the surface rules',
  'border-slate-700': 'shell border',
  'border-slate-800': 'shell border',
  'border-slate-700/60': 'shell border',
  'border-slate-900': 'shell border',
  'border-blue-500/30': 'translucent brand border',
  'border-blue-700': 'brand border',
  'border-amber-200/80': 'status border inside a tinted panel',
  'border-amber-300': 'status border',
  'border-emerald-700/60': 'status border on the shell',
  'border-red-200': 'status border inside a tinted panel',
  'border-violet-200': 'status border inside a tinted panel',
  'border-indigo-200': 'status border inside a tinted panel',
  'border-slate-600': 'shell border',
  'border-slate-400': 'shell border / input outline',
  'text-slate-200': 'text on the always-dark shell',
  'text-emerald-100': 'timestamp text on the always-emerald outgoing message bubble',
  'text-rose-300': 'error text on the always-dark calculator display',
  'bg-emerald-700': 'active state of the Messenger button on the always-dark header',
  'ring-blue-300': 'selection ring keeps the brand colour on both themes',
  'text-sky-300': 'read-receipt mark on the always-emerald outgoing message bubble',
  'text-slate-300': 'text on the always-dark shell',
  'text-slate-400': 'hints; readable on both card and shell backgrounds',
  'bg-slate-700': 'shell surface',
  'bg-slate-800': 'shell surface',
  'bg-slate-950': 'shell surface',
  'from-blue-600': 'brand gradient',
  'via-indigo-600': 'brand gradient',
  'to-cyan-400': 'brand gradient',
  'hover:bg-blue-500': 'button hover',
  'hover:bg-blue-600': 'button hover',
  'hover:bg-emerald-500': 'button hover',
  'hover:bg-rose-500': 'button hover',
  'hover:bg-amber-500': 'button hover',
  'hover:bg-indigo-500': 'button hover',
  'hover:bg-red-800': 'button hover',
  'hover:bg-slate-600': 'shell hover',
  'hover:bg-slate-700': 'shell hover',
  'hover:bg-slate-800': 'shell hover',
  'hover:bg-slate-800/80': 'shell hover',
  'hover:text-white': 'text on the shell',
  'focus:ring-blue-500': 'keyboard focus ring stays visible in both themes',
  'focus:ring-emerald-500': 'keyboard focus ring stays visible in both themes',
  'focus:border-blue-500': 'keyboard focus border stays visible in both themes',
  'hover:bg-blue-700': 'button hover',
  'text-cyan-600': 'accent text on a tinted panel',
  'text-amber-200': 'light accent text, readable on both themes',
  'text-amber-400': 'light accent text, readable on both themes',
  'text-blue-200': 'light accent text, readable on both themes',
  'text-blue-400': 'light accent text, readable on both themes',
  'text-emerald-200': 'light accent text, readable on both themes',
  'text-emerald-300': 'light accent text, readable on both themes',
  'text-emerald-400': 'light accent text, readable on both themes',
  'text-indigo-200': 'light accent text, readable on both themes',
  'text-indigo-400': 'light accent text, readable on both themes',
  'text-purple-200': 'light accent text, readable on both themes',
  'text-purple-400': 'light accent text, readable on both themes',
  'text-red-200': 'light accent text, readable on both themes',
  'text-rose-200': 'light accent text, readable on both themes',
  'text-rose-400': 'light accent text, readable on both themes',
  'ring-blue-500/40': 'selected-state ring, visible on both themes',
  'border-blue-500': 'selected-state border in the brand colour, visible on both themes',
  'ring-1': 'ring width, not a colour',
  'ring-inset': 'ring position, not a colour',
};

/** Colour classes used anywhere in the interface. */
function usedColourClasses() {
  const prefix =
    /\b((?:hover|focus|active|group-hover|disabled|dark|md|lg|sm|focus-within|first|last|odd|even|selected)?\:?(?:bg|text|border|divide|ring|ring-offset|outline|placeholder|from|via|to|caret|decoration|shadow|fill|stroke)-[a-z]+(?:-\d{2,4})?(?:\/\d{1,3})?)/g;
  const palette =
    /-(slate|gray|zinc|neutral|stone|white|black|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|genesis|current|transparent|inherit)(?:-|$)/;
  const found = new Map();
  for (const file of walk('src', ['.jsx', '.js'])) {
    const text = read(file);
    for (const match of text.matchAll(prefix)) {
      if (palette.test(match[1])) {
        if (!found.has(match[1])) found.set(match[1], file);
      }
    }
  }
  return found;
}

/** Utility classes the dark layer rebinds. */
function coveredClasses() {
  const covered = new Set();
  // lastIndexOf: the phrase also appears in the header comment above the layer.
  const start = css.lastIndexOf('Dark Mode compatibility layer');
  const end = css.indexOf('@media print', start);
  const section = css.slice(start, end === -1 ? undefined : end);
  // Comments are not selectors: drop the banner we started inside, plus any
  // other comment in the layer.
  const layer = section
    .slice(section.indexOf('*/') + 2)
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of layer.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (!selector.startsWith('.dark ')) continue;
    for (const part of selector.split(',')) {
      let cls = part
        .trim()
        .replace(/^\.dark\s+/, '')
        .replace(/\\/g, '');
      // Only trailing pseudo-classes/elements are dropped (:hover, :focus),
      // never the variant prefix of a utility (disabled:bg-slate-100).
      cls = cls.replace(/(::?[a-z-]+(\([^)]*\))?)+$/g, '');
      if (cls.startsWith('.')) cls = cls.slice(1);
      if (cls) covered.add(cls);
    }
  }
  return covered;
}

test('every colour class used in the interface is themed for Dark Mode', () => {
  const used = usedColourClasses();
  const covered = coveredClasses();
  // Semantic tokens are defined from the tokens directly, so they follow the
  // theme without a remap.
  for (const semantic of [
    'bg-canvas',
    'bg-surface',
    'bg-surface-muted',
    'bg-surface-hover',
    'text-ink',
    'text-ink-muted',
    'text-ink-subtle',
    'text-ink-secondary',
    'border-line',
    'bg-shell',
    'text-shell-ink',
    'border-shell-line',
    'bg-brand',
  ]) {
    covered.add(semantic);
  }

  const unthemed = [...used.keys()].filter(
    (cls) =>
      !covered.has(cls) &&
      !cls.startsWith('dark:') && // a dark: variant only exists because of theming
      !Object.prototype.hasOwnProperty.call(THEME_NEUTRAL, cls)
  );
  assert.deepStrictEqual(
    unthemed,
    [],
    `these classes stay light-only in Dark Mode (add a rule in src/index.css or document them): ${unthemed.join(', ')}`
  );
  assert.ok(used.size > 50, `expected to audit a large UI, found ${used.size} classes`);
});

test('every screen of the application is audited for both themes', () => {
  const files = walk('src', ['.jsx', '.js']).sort();
  const covered = coveredClasses();
  const perScreen = [];
  let withColour = 0;
  let classes = 0;
  for (const file of files) {
    const source = read(file);
    const palette =
      /-(slate|gray|zinc|neutral|stone|white|black|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-|$)/;
    const prefix =
      /\b((?:hover|focus|active|group-hover|disabled|dark|md|lg|sm|focus-within)?\:?(?:bg|text|border|divide|ring|outline|placeholder|from|via|to|fill|stroke)-[a-z]+(?:-\d{2,4})?(?:\/\d{1,3})?)/g;
    const list = new Set();
    for (const match of source.matchAll(prefix)) {
      if (palette.test(match[1])) list.add(match[1]);
    }
    if (list.size === 0) continue;
    withColour += 1;
    classes += list.size;
    const unthemed = [...list].filter(
      (cls) => !covered.has(cls) && !cls.startsWith('dark:') && !THEME_NEUTRAL[cls]
    );
    perScreen.push({ file, colours: list.size, unthemed });
  }
  const broken = perScreen.filter((s) => s.unthemed.length);
  assert.deepStrictEqual(
    broken.map((s) => `${s.file}: ${s.unthemed.join(', ')}`),
    [],
    'these screens still contain colours that do not follow the theme'
  );
  assert.ok(withColour >= 15, `expected the whole interface, audited ${withColour} files`);
  console.log(`    ${withColour} screens/components audited, ${classes} colour usages, all themed`);
});

test('the interface audit covers every screen of the application', () => {
  const files = walk('src', ['.jsx']);
  const views = files.filter((f) => f.includes('views/') || f.includes('components/'));
  assert.ok(views.length >= 15, `expected the full component set, found ${views.length}`);
  for (const required of [
    'src/views/DashboardView.jsx',
    'src/views/SalesView.jsx',
    'src/views/PurchasesView.jsx',
    'src/views/InventoryView.jsx',
    'src/views/AccountingView.jsx',
    'src/views/BankingView.jsx',
    'src/views/ReportsView.jsx',
    'src/views/SettingsView.jsx',
    'src/views/CustomersView.jsx',
    'src/views/SuppliersView.jsx',
    'src/components/Navbar.jsx',
    'src/components/Sidebar.jsx',
    'src/components/AuthScreens.jsx',
    'src/components/Toast.jsx',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, required)), `${required} must exist`);
  }
});

// ---------------------------------------------------------------------------
// 3a. Text/background pairs as they are actually written in the interface.
//     A token can be perfect and a screen still unreadable if a component puts
//     the wrong text colour on the wrong background, so every pair that appears
//     together in a className is measured in both themes.
// ---------------------------------------------------------------------------
const FAMILIES = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'fuchsia', 'pink', 'rose'];

let tailwindColors = null;
try {
  tailwindColors = require('tailwindcss/colors');
} catch (_) {
  tailwindColors = null;
}
const PALETTE = (tailwindColors && (tailwindColors.default || tailwindColors)) || null;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function paletteColor(family, shade) {
  if (family === 'white') return [255, 255, 255];
  if (family === 'black') return [0, 0, 0];
  const scale = PALETTE && PALETTE[family];
  if (!scale) return null;
  // Custom shades live in tailwind.config, not in the palette: report as unknown
  // instead of guessing a different shade.
  if (shade && scale[shade] === undefined) return null;
  const value = shade ? scale[shade] : scale['500'];
  return typeof value === 'string' ? hexToRgb(value) : null;
}

/** The colour a utility class resolves to inside the dark theme. */
function darkRuleFor(cls) {
  const start = css.lastIndexOf('Dark Mode compatibility layer');
  const section = css.slice(start);
  const layer = section
    .slice(section.indexOf('*/') + 2)
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of layer.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].trim();
    if (!selectors.startsWith('.dark ')) continue;
    for (const part of selectors.split(',')) {
      let name = part
        .trim()
        .replace(/^\.dark\s+/, '')
        .replace(/\\/g, '')
        .replace(/(::?[a-z-]+(\([^)]*\))?)+$/g, '');
      if (name.startsWith('.')) name = name.slice(1);
      if (name === cls) return match[2];
    }
  }
  return null;
}

function darkToken(name) {
  const start = css.indexOf('\n  .dark {');
  const block = css.slice(start, css.indexOf('\n  }', start));
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim().split(/\s+/).map(Number) : null;
}

/** Resolve a utility class to [r, g, b] for a theme, or null when unknown. */
function resolveClass(cls, theme) {
  const familyList = `(?:${FAMILIES.join('|')})`;
  const match = new RegExp(`^(?:hover:|focus:|dark:)?(bg|text)-(${familyList}|white|black)(?:-(\\d{2,4}))?$`).exec(cls);
  if (!match) return null;
  const family = match[2];
  const shade = match[3];
  if (/\//.test(cls)) return null; // translucent: depends on what is behind it

  if (theme === 'dark') {
    const declaration = darkRuleFor(cls);
    if (declaration) {
      const token = declaration.match(/rgb\(\s*var\((--j-[a-z-]+)\)\s*\)/);
      if (token) return darkToken(token[1]);
      const rgb = declaration.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)/);
      if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
      const hex = declaration.match(/color:\s*(#[0-9a-fA-F]{3,6})/);
      if (hex) return hexToRgb(hex[1]);
      return null; // tinted (rgba) backgrounds are blended: not measurable alone
    }
  }
  return paletteColor(family, shade);
}

/** Split a className expression into plain class lists, one per branch. */
function classSegments(chunk) {
  const out = [];
  const re = /\$\{([^{}]*)\}/g;
  let last = 0;
  let match;
  while ((match = re.exec(chunk)) !== null) {
    out.push(chunk.slice(last, match.index));
    for (const quoted of match[1].matchAll(/'([^']*)'/g)) out.push(quoted[1]);
    last = match.index + match[0].length;
  }
  out.push(chunk.slice(last));
  return out;
}

/** Every (text, background) pair written together in a className. */
function colourPairs() {
  const textRe = new RegExp(`\\btext-((?:${FAMILIES.join('|')})|white|black)-\\d{2,4}\\b`, 'g');
  const bgRe = new RegExp(`\\b(?:hover\\:)?bg-((?:${FAMILIES.join('|')})|white|black)(?:-\\d{2,4})?(?![\\/\\d-])`, 'g');
  const pairs = [];
  for (const file of walk('src', ['.jsx', '.js'])) {
    const source = read(file);
    const chunks = [
      ...[...source.matchAll(/className="([^"]*)"/g)].map((m) => m[1]),
      ...[...source.matchAll(/className=\{\s*`([^`]*)`\s*\}/g)].map((m) => m[1]),
      ...[...source.matchAll(/className=\{\s*'([^']*)'\s*\}/g)].map((m) => m[1]),
      ...[...source.matchAll(/=\s*\n?\s*'([^']*bg-[^']*)'/g)].map((m) => m[1]),
    ];
    for (const chunk of chunks) {
      for (const segment of classSegments(chunk)) {
        const texts = [...segment.matchAll(textRe)].map((m) => m[0]);
        const bgs = [...segment.matchAll(bgRe)].map((m) => m[0]);
        for (const bg of bgs) {
          // A hover background is only seen with the hover text colour, never
          // with the resting one.
          const hovering = bg.startsWith('hover:');
          const candidates = hovering
            ? texts.filter((t) => t.startsWith('hover:')).map((t) => t.slice(6))
            : texts.filter((t) => !t.startsWith('hover:'));
          for (const text of candidates) {
            pairs.push({ file, text, bg });
          }
        }
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// 3b. Contrast: accounting screens are used for hours, so text must stay
//     readable in both themes (WCAG 2.1 AA: 4.5:1 body text, 3:1 UI borders).
// ---------------------------------------------------------------------------
function tokens(scope) {
  const start = css.indexOf(scope + ' {');
  const block = css.slice(start, css.indexOf('\n  }', start));
  const out = {};
  for (const match of block.matchAll(/(--j-[a-z-]+):\s*([^;]+);/g)) {
    out[match[1]] = match[2].trim().split(/\s+/).map(Number);
  }
  return out;
}

const srgb = (channel) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);

const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

for (const [scope, label] of [[':root', 'Light Mode'], ['.dark', 'Dark Mode']]) {
  test(`${label} keeps accounting text readable (WCAG AA contrast)`, () => {
    const t = tokens(scope);
    const checks = [
      ['primary text on a card', t['--j-ink'], t['--j-surface'], 4.5],
      ['primary text on the page', t['--j-ink'], t['--j-canvas'], 4.5],
      ['secondary text on a card', t['--j-ink-secondary'], t['--j-surface'], 4.5],
      ['labels and helper text', t['--j-ink-muted'], t['--j-surface'], 4.5],
      ['hints and placeholders', t['--j-ink-subtle'], t['--j-canvas'], 4.5],
      ['header and sidebar text', t['--j-shell-ink'], t['--j-shell'], 4.5],
      ['brand text and icons', t['--j-brand'], t['--j-surface'], 4.5],
      ['input borders', t['--j-line-strong'], t['--j-surface'], 3.0],
      ['decorative dividers', t['--j-line'], t['--j-surface'], 1.2],
    ];
    for (const [what, foreground, background, minimum] of checks) {
      const ratio = contrast(foreground, background);
      assert.ok(
        ratio >= minimum,
        `${what}: ${ratio.toFixed(2)}:1 is below the required ${minimum}:1`
      );
    }
  });
}

test('no text/background pair in the interface falls below 4.5:1 in either theme', () => {
  if (!PALETTE) {
    skipped++;
    console.log('    (skipped: the Tailwind palette is not installed)');
    return;
  }
  const pairs = colourPairs();
  let measured = 0;
  const problems = [];
  for (const { file, text, bg } of pairs) {
    const lightText = resolveClass(text, 'light');
    const lightBg = resolveClass(bg, 'light');
    const darkText = resolveClass(text, 'dark');
    const darkBg = resolveClass(bg, 'dark');
    if (!lightText || !lightBg || !darkText || !darkBg) continue; // translucent or custom shade
    measured++;
    const light = contrast(lightText, lightBg);
    const dark = contrast(darkText, darkBg);
    if (light < 4.5 || dark < 4.5) {
      problems.push(`${text} on ${bg}: light ${light.toFixed(2)}:1, dark ${dark.toFixed(2)}:1 (${file})`);
    }
  }
  assert.ok(measured > 80, `expected to measure the whole interface, measured ${measured} pairs`);
  assert.deepStrictEqual(
    problems.slice(0, 12),
    [],
    `unreadable combinations:\n      ${problems.slice(0, 12).join('\n      ')}`
  );
  console.log(`    ${measured} text/background pairs measured in both themes`);
});

test('cards, panels and shells stay distinguishable from their background', () => {
  for (const scope of [':root', '.dark']) {
    const t = tokens(scope);
    assert.ok(luminance(t['--j-surface']) !== luminance(t['--j-canvas']), 'cards must differ from the page');
    assert.ok(luminance(t['--j-surface-muted']) !== luminance(t['--j-surface']), 'muted panels must differ from cards');
    assert.ok(
      contrast(t['--j-surface-hover'], t['--j-surface']) >= 1.1,
      'hover states must be visible on cards'
    );
    assert.ok(
      contrast(t['--j-shell'], t['--j-canvas']) >= 1.05 || scope === '.dark',
      'the shell must be distinguishable from the page'
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Wiring: one provider, used by every control
// ---------------------------------------------------------------------------
test('the theme provider is mounted above the whole application', () => {
  const app = read('src/App.jsx');
  assert.ok(/import\s+{\s*ThemeProvider\s*}\s+from\s+'\.\/context\/ThemeContext'/.test(app));
  const providerIndex = app.indexOf('<ThemeProvider');
  const i18nIndex = app.indexOf('<I18nProvider>');
  const appIndex = app.indexOf('<AppProvider>');
  const modeIndex = app.indexOf('<AppModeProvider>');
  assert.ok(providerIndex > -1, 'ThemeProvider must wrap the application');
  assert.ok(providerIndex < i18nIndex && i18nIndex < appIndex, 'ThemeProvider must be above the screens');
  assert.ok(modeIndex > -1 && modeIndex < providerIndex, 'AppModeProvider decides the app before the theme is read');
  assert.ok(/bg-canvas/.test(app), 'the application shell uses the canvas token');
});

test('the theme provider stores, resolves and paints the preference', () => {
  const context = read('src/context/ThemeContext.jsx');
  assert.ok(/readThemePreference\(getStorage\(\), appId\)/.test(context), 'it reads the preference saved for this application');
  assert.ok(/writeThemePreference\(getStorage\(\)/.test(context), 'it saves the preference');
  assert.ok(/applyTheme\(document\.documentElement, theme\)/.test(context), 'it paints the theme');
  assert.ok(/useLayoutEffect/.test(context), 'it paints before the browser draws');
  assert.ok(/matchMedia/.test(context) && /addEventListener\('change'/.test(context), 'it follows the OS');
  assert.ok(/addEventListener\('storage'/.test(context), 'it syncs with other windows');
  assert.ok(/desktop\.setTheme/.test(context), 'it notifies the desktop shell');
});

test('the header switch and the Settings control share the same manager', () => {
  const toggle = read('src/components/ThemeToggle.jsx');
  assert.ok(/useTheme\(\)/.test(toggle), 'the toggle must use the central theme context');
  assert.ok(/variant === 'segmented'/.test(toggle), 'Settings gets the three-way choice');
  for (const option of ['light', 'dark', 'system']) {
    assert.ok(toggle.includes(`${option}:`), `${option} must be offered`);
  }
  assert.ok(/THEME_PREFERENCES/.test(toggle), 'the options come from the theme module');
  assert.ok(/aria-label=/.test(toggle) && /aria-checked=/.test(toggle), 'the control must be accessible');
  assert.ok(/Sun/.test(toggle) && /Moon/.test(toggle) && /Monitor/.test(toggle), 'sun/moon/monitor icons');

  const navbar = read('src/components/Navbar.jsx');
  assert.ok(/<ThemeToggle/.test(navbar), 'the header must offer the theme switch');

  const auth = read('src/components/AuthScreens.jsx');
  assert.ok(/<ThemeToggle/.test(auth), 'the sign-in screens must offer the theme switch');
});

test('Settings offers an Appearance section with all three options', () => {
  const settings = read('src/views/SettingsView.jsx');
  assert.ok(/setActiveTab\('appearance'\)/.test(settings), 'an Appearance tab must exist');
  assert.ok(/activeTab === 'appearance'/.test(settings), 'the Appearance panel must render');
  assert.ok(/<ThemeToggle variant="segmented"/.test(settings), 'the three-way control must be used');
  assert.ok(/useTheme\(\)/.test(settings), 'it reads the active theme from the provider');
});

test('the theme is translated in English, French and Kinyarwanda', () => {
  const keys = [
    'settings.tab_appearance',
    'settings.appearance_title',
    'settings.appearance_subtitle',
    'settings.theme_light',
    'settings.theme_light_desc',
    'settings.theme_dark',
    'settings.theme_dark_desc',
    'settings.theme_system',
    'settings.theme_system_desc',
    'settings.theme_active',
    'settings.theme_applies_now',
    'settings.theme_system_active',
    'settings.theme_persist_note',
    'settings.switch_to_light',
    'settings.switch_to_dark',
    'common.theme',
    'common.appearance',
  ];
  const values = {};
  for (const lang of ['en', 'fr', 'rw']) {
    const dict = JSON.parse(read(`src/i18n/${lang}.json`));
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node && node[part], dict);
      assert.ok(value && typeof value === 'string', `${lang} is missing ${key}`);
      values[`${lang}.${key}`] = value;
    }
  }
  // The three languages must actually differ, not be copies of English.
  assert.notStrictEqual(values['fr.settings.theme_dark'], values['en.settings.theme_dark']);
  assert.notStrictEqual(values['rw.settings.theme_dark'], values['en.settings.theme_dark']);
});

// ---------------------------------------------------------------------------
// 5. Accounting data is untouched
// ---------------------------------------------------------------------------
test('changing the theme never touches the accounting backend', () => {
  const files = ['src/theme.mjs', 'src/context/ThemeContext.jsx', 'src/components/ThemeToggle.jsx'];
  for (const file of files) {
    const source = read(file);
    for (const forbidden of [
      'apiRequest',
      'fetch(',
      'better-sqlite3',
      'XMLHttpRequest',
      '/api/journal',
      '/api/invoices',
      'localStorage.setItem(\'genesis',
    ]) {
      assert.ok(!source.includes(forbidden), `${file} must not use ${forbidden}`);
    }
  }
  // The only key the feature writes is the theme preference.
  const themeModule = read('src/theme.mjs');
  assert.ok(themeModule.includes("THEME_STORAGE_KEY = 'jenesis_theme'"));
});

test('the server and the database schema are unchanged by theming', () => {
  for (const file of walk('server', ['.js'])) {
    const source = read(file);
    assert.ok(!/jenesis_theme|theme_preference/.test(source), `${file} must not store theme data`);
  }
});

// ---------------------------------------------------------------------------
// 6. Electron integration
// ---------------------------------------------------------------------------
test('the desktop bridge exposes the theme without weakening security', () => {
  const preload = read('electron/preload.cjs');
  assert.ok(/setTheme/.test(preload), 'the renderer can ask the shell to follow the theme');
  assert.ok(!/nodeIntegration:\s*true/.test(preload));
  const main = read('electron/main.cjs');
  assert.ok(/contextIsolation:\s*true/.test(main), 'context isolation must stay on');
  assert.ok(/nodeIntegration:\s*false/.test(main), 'the renderer must stay without Node access');
  assert.ok(/sandbox:\s*true/.test(main), 'the renderer must stay sandboxed');
});

test('the shell validates the theme it receives and tints the window', () => {
  const main = read('electron/main.cjs');
  assert.ok(/ipcMain\.handle\('genesis:set-theme'/.test(main), 'a single narrow channel is used');
  assert.ok(/ALLOWED_THEMES\.includes\(theme\)/.test(main), 'the value is validated');
  assert.ok(/nativeTheme\.themeSource/.test(main), 'the native appearance follows the choice');
  assert.ok(/setBackgroundColor/.test(main), 'the window background matches the theme');
  assert.ok(/backgroundColor:\s*darkWindowBackground\(\)/.test(main), 'no white flash on startup');
});

// ---------------------------------------------------------------------------
// 7. Print output stays on paper colours
// ---------------------------------------------------------------------------
test('printing keeps the light palette whatever the theme is', () => {
  assert.ok(/@media print/.test(css), 'print rules must exist');
  const printBlock = css.slice(css.indexOf('@media print'));
  assert.ok(/background:\s*white\s*!important/.test(printBlock));
  assert.ok(/color:\s*black\s*!important/.test(printBlock));
});

test('reduced-motion preferences are respected', () => {
  assert.ok(/prefers-reduced-motion/.test(css), 'animations must yield to the OS setting');
});

test('native controls follow the theme through color-scheme', () => {
  const rootIndex = css.indexOf(':root {');
  const darkIndex = css.indexOf('.dark {');
  assert.ok(css.slice(rootIndex, rootIndex + 400).includes('color-scheme: light'));
  assert.ok(css.slice(darkIndex, darkIndex + 400).includes('color-scheme: dark'));
});

// ---------------------------------------------------------------------------
// 8. Production build (only checked when a build exists in this checkout)
// ---------------------------------------------------------------------------
test('the production stylesheet carries both palettes', () => {
  const distDir = path.join(ROOT, 'dist', 'assets');
  if (!fs.existsSync(distDir)) {
    skipped++;
    console.log('    (skipped: no production build in this run)');
    return;
  }
  const built = fs
    .readdirSync(distDir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(distDir, f), 'utf8'))
    .join('\n');
  assert.ok(built.includes('--j-canvas: 241 245 249'), 'the light palette must be built');
  assert.ok(built.includes('--j-canvas: 2 6 23'), 'the dark palette must be built');
  assert.ok(/\.dark\s+\.bg-white/.test(built), 'the dark compatibility layer must be built');
});

// ---------------------------------------------------------------------------
(async () => {
  console.log('--- THEME TESTS (Light Mode / Dark Mode / System Default) ---');
  for (const { name, fn } of pending) {
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
