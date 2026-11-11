'use strict';
/**
 * FOUR APPLICATIONS — DRAWING TESTS.
 *
 * Modification 4 turns JENESIS into four sub-applications. The requirement is
 * not that four sets of files exist: it is that a user opening any one of them
 * gets that application, in its own colour, with its own name, and with only
 * the screens it is allowed to have.
 *
 * The failure this is written against is the blank window. A missing import or
 * an absent value throws while React draws, the production build does not
 * notice, and the user is left with an empty screen. So each application is
 * drawn here with React itself and the markup is read back.
 *
 * What these CANNOT see: effects do not run in a server render, so anything
 * that only happens once data arrives is not covered, and nothing here opens a
 * Windows shortcut. The installer's four shortcuts are asserted separately
 * from build/installer.nsh.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { srcPath, installBrowserStubs, bundle, silenceServerRenderWarnings, escapeHtml } = require('./helpers/render-app.cjs');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
  }
}

/** The circumstances of one drawing. Read by the bundle through a global. */
const STATE = { appId: 'admin', isLauncher: false, activeView: 'dashboard', lang: 'en' };
globalThis.__JENESIS_APPS__ = STATE;

// An administrator: holds everything, so no permission gate can stand in for
// the screen we are trying to look at.
const ALL_PERMISSIONS = [
  'dashboard:read', 'sales:read', 'sales:write', 'purchases:read', 'purchases:write',
  'inventory:read', 'inventory:write', 'inventory:adjust', 'inventory:approve',
  'contacts:read', 'contacts:write', 'banking:read', 'banking:write',
  'accounting:read', 'accounting:write', 'reports:read', 'audit:read',
  'settings:manage', 'settings:access', 'stores:manage', 'users:manage',
  'company:manage', 'records:deactivate', 'records:delete', 'maintenance:read'
];

const STUB_CONTEXT = `
import React from 'react';

const company = {
  id: 'comp-apps-1', code: 'APP', name: 'Four Apps Company Ltd',
  currency_code: 'XAF', currency_symbol: 'XFA', currency_decimals: 2,
  fiscal_year_start: '01-01', fiscal_year_end: '12-31',
  inventory_valuation_method: 'WEIGHTED_AVERAGE', default_language: 'en'
};

const user = { id: 'usr-apps-1', username: 'admin', full_name: 'Apps Admin', role: 'admin' };

export function AppProvider({ children }) { return children; }

export { APPS, APP_IDS, appTitle } from ${srcPath('src/appIdentity.js')};
import { APPS } from ${srcPath('src/appIdentity.js')};

export function useApp() {
  const state = globalThis.__JENESIS_APPS__;
  return {
    currentCompany: company,
    companies: [company],
    user, currentUser: user,
    switchCompany: () => {},
    logout: () => {},
    permissions: ${JSON.stringify(ALL_PERMISSIONS)},
    hasPermission: (perm) => ${JSON.stringify(ALL_PERMISSIONS)}.includes(perm),
    loading: false,
    authState: 'ready',
    activeView: state.activeView,
    setActiveView: () => {},
    showToast: () => {},
    refreshKey: 0,
    triggerRefresh: () => {},
    formatCurrency: (n) => String(n),
    formatDate: (d) => String(d || ''),
    formatNumber: (n) => String(n)
  };
}

export function useEscapeLayer() { return undefined; }
export function useShortcutAction() { return undefined; }
export function useShortcuts() {
  return {
    registerLayer: () => () => {},
    registerAction: () => () => {},
    openHelp: () => {}, triggerRefresh: () => {},
    goBack: () => false, goForward: () => false,
    canGoBack: false, canGoForward: false,
    calculatorOpen: false, openCalculator: () => {}, closeCalculator: () => {}, toggleCalculator: () => {},
    messengerOpen: false, openMessenger: () => {}, closeMessenger: () => {}, toggleMessenger: () => {},
    messengerUnread: 0, setMessengerUnread: () => {}, refreshMessengerUnread: () => {},
    referenceOpen: false, openReference: () => {}, closeReference: () => {}, toggleReference: () => {},
    catalogue: [], refreshKey: 0
  };
}
export function ShortcutsProvider({ children }) { return children; }
export function AppModeProvider({ children }) { return children; }
export function useAppMode() {
  const state = globalThis.__JENESIS_APPS__;
  const app = APPS[state.appId];
  return {
    appId: state.appId,
    app,
    isLauncher: state.isLauncher,
    canOpen: (view) => (app ? app.views.includes(view) : false),
    landingView: app ? app.defaultView : 'dashboard'
  };
}
`;

const STUB_API = `
export function apiRequest() { return Promise.resolve([]); }
export function getSessionToken() { return 'stub-session-token'; }
export function translateError(t, err) { return String((err && err.message) || err); }
export function interpolateVars(text) { return String(text); }
export function setApiBase() {}
export function getServerUrl() { return 'http://127.0.0.1:3000'; }
export function setServerUrl() {}
export function downloadAuthenticated() { return Promise.resolve(); }
`;

console.log('--- FOUR APPLICATIONS DRAWING TESTS (real React render, no browser) ---');

installBrowserStubs();
silenceServerRenderWarnings();

/**
 * Screens that must never appear inside Network & Maintenance: it is a network
 * tool, not a second accounting program.
 */
const BUSINESS_SCREENS = [
  'accounting', 'sales', 'purchases', 'customers', 'suppliers', 'inventory', 'reports'
];

async function main() {
  let mod = null;
  let buildError = null;
  try {
    mod = await bundle({
      name: 'jenesis-four-apps-render',
      stubContext: STUB_CONTEXT,
      stubApi: STUB_API,
      entry: [
        "import React from 'react';",
        "import { renderToStaticMarkup } from 'react-dom/server';",
        `import App from ${srcPath('src/App.jsx')};`,
        `export { APPS, APP_IDS, appTitle } from ${srcPath('src/appIdentity.js')};`,
        'export function draw() { return renderToStaticMarkup(React.createElement(App)); }'
      ].join('\n')
    });
  } catch (err) {
    buildError = err;
  }

  check('all four applications can be compiled for Node', () => {
    assert.ok(!buildError, `they could not be compiled: ${buildError && buildError.message}`);
    assert.ok(mod && typeof mod.draw === 'function', 'the compiled shell must be usable');
  });

  if (!mod) return;

  const { draw, APPS, APP_IDS, appTitle } = mod;

  function render({ appId, activeView, lang = 'en', isLauncher = false }) {
    STATE.appId = appId;
    STATE.activeView = activeView;
    STATE.lang = lang;
    STATE.isLauncher = isLauncher;
    globalThis.localStorage.setItem('genesis_lang', lang);
    return draw();
  }

  check('there are exactly four applications', () => {
    assert.deepStrictEqual(APP_IDS.slice().sort(), ['admin', 'maintenance', 'seller', 'settings']);
  });

  for (const appId of APP_IDS) {
    const app = APPS[appId];

    check(`JENESIS ${appId} draws its own screens instead of a blank window`, () => {
      const html = render({ appId, activeView: app.defaultView });
      assert.ok(html.length > 500, `${appId} drew only ${html.length} characters — a blank screen`);
      assert.ok(!/>undefined<|NaN/.test(html), `${appId} must not print "undefined" or "NaN"`);
      assert.ok(/JENESIS/i.test(html), `${appId} must carry the JENESIS name`);
    });

    check(`JENESIS ${appId} is named and coloured as itself`, () => {
      const html = render({ appId, activeView: app.defaultView });
      assert.ok(
        html.includes(escapeHtml(appTitle(appId))),
        `${appId} must show its own name "${appTitle(appId)}"`
      );
      // The mark is drawn in the application's own tone, which is what keeps
      // the four windows tellable apart at a glance.
      assert.ok(
        html.includes(`data-jenesis-mark="${app.tone}"`),
        `${appId} must draw the JENESIS mark in its own tone (${app.tone})`
      );
    });

    check(`JENESIS ${appId} stays translated in French and Kinyarwanda`, () => {
      for (const lang of ['fr', 'rw']) {
        const html = render({ appId, activeView: app.defaultView, lang });
        assert.ok(html.length > 500, `${appId} in ${lang} drew only ${html.length} characters`);
        assert.ok(!/>undefined<|NaN/.test(html), `${appId} in ${lang} must not print "undefined" or "NaN"`);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Every screen, not just the one each application opens on.
  //
  // The checks above look at one view per application. A screen nobody renders
  // can be broken in a language nobody tried — a Kinyarwanda string that never
  // arrives, a number formatted into "NaN", a screen that throws — and nothing
  // above would see it. So every view of every application is drawn in all
  // three languages.
  // -------------------------------------------------------------------------

  for (const appId of APP_IDS) {
    const app = APPS[appId];
    const views = app.views || [];

    check(`every JENESIS ${appId} screen draws, in English, French and Kinyarwanda`, () => {
      assert.ok(views.length > 0, `${appId} declares no screens to draw`);
      const broken = [];
      for (const view of views) {
        for (const lang of ['en', 'fr', 'rw']) {
          let html = '';
          try {
            html = render({ appId, activeView: view, lang });
          } catch (err) {
            broken.push(`${view}/${lang} threw: ${err && err.message ? err.message : err}`);
            continue;
          }
          if (html.length < 200) {
            broken.push(`${view}/${lang} drew only ${html.length} characters`);
          } else if (/>undefined<|NaN/.test(html)) {
            broken.push(`${view}/${lang} printed "undefined" or "NaN"`);
          }
        }
      }
      assert.deepStrictEqual(broken, [],
        `${views.length} screen(s) x 3 languages, these failed:\n      ` +
        broken.slice(0, 10).join('\n      '));
    });
  }

  check('the four applications between them draw every screen they offer', () => {
    const total = APP_IDS.reduce((n, id) => n + (APPS[id].views || []).length, 0);
    // A count rather than a fixed list, so adding a screen later does not
    // silently shrink what is checked.
    assert.ok(total >= 10, `the four applications offer ${total} screens between them`);
    console.log(`      (${total} screens drawn, three languages each)`);
  });

  check('Network & Maintenance offers no accounting, sales, purchase or stock screen', () => {
    const html = render({ appId: 'maintenance', activeView: 'maintenance' });
    // Its own menu must be exactly what the identity says it is.
    assert.deepStrictEqual(
      APPS.maintenance.views.slice().sort(),
      ['help', 'maintenance'],
      'Network & Maintenance may only open its own screen and Help'
    );
    for (const screen of BUSINESS_SCREENS) {
      assert.ok(
        !APPS.maintenance.views.includes(screen),
        `Network & Maintenance must not offer the ${screen} screen`
      );
    }
    assert.ok(html.length > 500, 'Network & Maintenance must still draw its own screen');
  });

  check('the launcher offers all four applications, each with its own mark', () => {
    const html = render({ appId: 'launcher', activeView: 'dashboard', isLauncher: true });
    for (const appId of APP_IDS) {
      assert.ok(
        html.includes(`data-jenesis-mark="${APPS[appId].tone}"`),
        `the launcher must show the ${appId} application in its own colour`
      );
    }
    assert.ok(html.length > 800, `the launcher drew only ${html.length} characters`);
    assert.ok(!/>undefined<|NaN/.test(html), 'the launcher must not print "undefined" or "NaN"');
  });

  // -------------------------------------------------------------------------
  // Untranslated English, caught the way a user meets it: on the screen.
  //
  // The parity test proves the three dictionaries agree with each other. It
  // cannot prove a screen actually used the dictionary. A component can
  // hard-code a string, or ask for a key that is spelled differently, and the
  // i18n layer falls back to English rather than showing nothing — so the
  // French screen silently starts speaking English and no key count moves.
  //
  // So each screen is drawn in French and Kinyarwanda and searched for the
  // English wording of any string that DOES have a translation. If the English
  // phrase is on the page, the translation was not used.
  // -------------------------------------------------------------------------

  const DICT = {};
  for (const lang of ['en', 'fr', 'rw']) {
    DICT[lang] = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', `${lang}.json`), 'utf8')
    );
  }

  function flatten(dict, prefix = '') {
    const out = {};
    for (const [key, value] of Object.entries(dict)) {
      const name = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object') Object.assign(out, flatten(value, name));
      else out[name] = value;
    }
    return out;
  }

  const EN = flatten(DICT.en);

  /** The words as a reader sees them: no tags, no HTML entities. */
  function visibleText(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ');
  }

  /**
   * English wordings that genuinely have a different wording in `other`.
   *
   * Short entries are excluded on purpose: a two-word English phrase can turn
   * up inside a legitimate translation, and reporting that would train people
   * to ignore this check. Templated entries are excluded because what reaches
   * the screen is the filled-in result, never the `{placeholder}` form.
   */
  function translatedAway(other) {
    const out = [];
    for (const key of Object.keys(EN)) {
      const english = EN[key];
      if (typeof english !== 'string') continue;
      if (english.length < 12) continue;
      if (!/\s/.test(english)) continue;
      if (/[{}<>]/.test(english)) continue;
      const translated = other[key];
      if (typeof translated !== 'string' || translated === english) continue;
      // A translation that keeps the English in brackets — Kinyarwanda does
      // this for terms with no settled wording of their own, so a reader who
      // knows the English term is not left guessing — is a deliberate gloss,
      // not a missing translation. Judging it as a leak would be wrong, and
      // would also make this check noisy enough to be ignored.
      if (translated.includes(english)) continue;
      out.push([key, english]);
    }
    return out;
  }

  const PHRASES = { fr: translatedAway(flatten(DICT.fr)), rw: translatedAway(flatten(DICT.rw)) };

  for (const lang of ['fr', 'rw']) {
    const languageName = lang === 'fr' ? 'French' : 'Kinyarwanda';

    check(`no screen shows untranslated English in ${languageName}`, () => {
      const leaks = [];
      let screensChecked = 0;
      for (const appId of APP_IDS) {
        for (const view of APPS[appId].views || []) {
          const text = visibleText(render({ appId, activeView: view, lang }));
          screensChecked += 1;
          for (const [key, english] of PHRASES[lang]) {
            if (text.includes(english)) {
              leaks.push(`${appId}/${view}: shows the English "${english}" (key ${key})`);
            }
          }
        }
      }
      assert.ok(screensChecked >= 20, `only ${screensChecked} screens were checked`);
      assert.deepStrictEqual(
        leaks, [],
        `English found on ${leaks.length} place(s) in ${languageName}:\n      ` +
        leaks.slice(0, 10).join('\n      ')
      );
    });
  }

  // -------------------------------------------------------------------------
  // Icons. Every screen is drawn with its sidebar and toolbar, and the icons in
  // them are inline SVG. A screen that draws without a single icon is a screen
  // whose icons failed to resolve — which looks like a layout that has
  // inexplicably lost its buttons.
  // -------------------------------------------------------------------------

  check('every screen draws its icons (no screen is missing all of them)', () => {
    const bald = [];
    for (const appId of APP_IDS) {
      for (const view of APPS[appId].views || []) {
        for (const lang of ['en', 'fr', 'rw']) {
          const html = render({ appId, activeView: view, lang });
          const icons = (html.match(/<svg/g) || []).length;
          if (icons === 0) bald.push(`${appId}/${view}/${lang}`);
        }
      }
    }
    assert.deepStrictEqual(bald, [], `these drew no icon at all: ${bald.slice(0, 10).join(', ')}`);
  });

  check('the JENESIS mark is drawn on every screen, in the application colour', () => {
    const wrong = [];
    for (const appId of APP_IDS) {
      for (const view of APPS[appId].views || []) {
        const html = render({ appId, activeView: view, lang: 'en' });
        if (!html.includes(`data-jenesis-mark="${APPS[appId].tone}"`)) {
          wrong.push(`${appId}/${view}`);
        }
      }
    }
    assert.deepStrictEqual(wrong, [], `no JENESIS mark in the right tone on: ${wrong.join(', ')}`);
  });

  check('the four applications are four different colours', () => {
    const colours = APP_IDS.map((id) => APPS[id].colour);
    assert.strictEqual(new Set(colours).size, 4, `the four colours must differ (got ${colours.join(', ')})`);
    const tones = APP_IDS.map((id) => APPS[id].tone);
    assert.strictEqual(new Set(tones).size, 4, `the four marks must differ (got ${tones.join(', ')})`);
  });
}

main().then(() => {
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
