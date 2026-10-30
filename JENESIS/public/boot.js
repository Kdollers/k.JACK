/* eslint-disable */
/**
 * boot.js — the JENESIS start-up guard (runs before the application bundle).
 *
 * Why this file exists
 * --------------------
 * A packaged desktop application has one failure mode that no accounting test
 * can see: the window opens, nothing is drawn, and the user is left with an
 * empty WHITE screen. It happens when the built interface cannot be loaded or
 * executed — a missing file, a blocked file, or an error thrown before React
 * mounts. The previous build could fail exactly that way.
 *
 * This script is deliberately separate from the application bundle:
 *   - it is a plain classic script, so it runs even if the module bundle does
 *     not (module scripts fail silently on a network error);
 *   - it is a file of its own, so the strict Content-Security-Policy
 *     (`script-src 'self'`) allows it — an inline script in index.html would be
 *     blocked by that policy and could not run at all;
 *   - it cannot be tree-shaken or bundled away.
 *
 * What it does
 * ------------
 *   1. paints the saved Light/Dark theme before the first frame;
 *   2. keeps a visible "Starting JENESIS…" card on screen until React takes
 *      over, so an empty screen is never the first thing a user sees;
 *   3. catches a file that fails to load (the white-screen cause), a script
 *      error and an unhandled rejection, and shows what happened;
 *   4. after 30 seconds without the interface mounting, reports the stall;
 *   5. reports every failure to the desktop log through the preload bridge, so
 *      %APPDATA%\JENESIS\logs\desktop.log always explains a failed start.
 *
 * It never reads business data, never writes to the database and never
 * contacts the network.
 */
(function (global, rootGlobal) {
  'use strict';

  var APP_IDS = ['seller', 'maintenance', 'admin'];
  var THEMES = ['light', 'dark', 'system'];
  var MOUNT_TIMEOUT_MS = 30000;

  /**
   * The page as this script can safely use it.
   *
   * In a browser the global object IS the window. In a test harness the
   * document may sit on the sandbox while matchMedia sits on a `window`
   * property, so both are consulted: whatever the page lacks, the guard keeps
   * working instead of throwing and taking the start-up down with it.
   */
  function hostFor(global, rootGlobal) {
    // Candidate "window" objects, in order: the global this script was given,
    // its own `window` property, the real global object and its `window`.
    var candidates = [global, global && global.window, rootGlobal, rootGlobal && rootGlobal.window];
    var primary = null;
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] && candidates[i].document) {
        primary = candidates[i];
        break;
      }
    }
    // Everything else the page may offer (matchMedia, location, the desktop
    // bridge) is read from whichever candidate has it.
    var others = candidates.filter(function (candidate) {
      return candidate && candidate !== primary;
    });

    function pick(name) {
      if (primary && primary[name] !== undefined) return primary[name];
      for (var j = 0; j < others.length; j += 1) {
        if (others[j][name] !== undefined) return others[j][name];
      }
      return undefined;
    }
    function bound(name) {
      var target = primary && typeof primary[name] === 'function' ? primary : null;
      if (!target) {
        for (var j = 0; j < others.length; j += 1) {
          if (others[j] && typeof others[j][name] === 'function') {
            target = others[j];
            break;
          }
        }
      }
      if (!target) return null;
      return target[name].bind(target);
    }
    return {
      document: pick('document') || null,
      localStorage: pick('localStorage') || null,
      matchMedia: pick('matchMedia') || null,
      location: pick('location') || null,
      navigator: pick('navigator') || null,
      genesisDesktop: pick('genesisDesktop') || pick('jenesisDesktop') || null,
      addEventListener: bound('addEventListener'),
      setTimeout: bound('setTimeout'),
      reload: function () {
        var loc = pick('location');
        if (loc && typeof loc.reload === 'function') loc.reload();
      }
    };
  }

  function storageGet(host, key) {
    try {
      return host.localStorage ? host.localStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function isAppId(value) {
    return APP_IDS.indexOf(value) !== -1;
  }

  /** Which application this window is: preload bridge, then ?app=, then memory. */
  function resolveAppId(host) {
    if (!host) return '';
    if (host.genesisDesktop && isAppId(host.genesisDesktop.app)) return host.genesisDesktop.app;
    try {
      if (host.location && host.location.search) {
        var match = /[?&]app=([a-z]+)/.exec(host.location.search);
        if (match && isAppId(match[1])) return match[1];
      }
    } catch (_) { /* no query string */ }
    var stored = storageGet(host, 'jenesis_app');
    return isAppId(stored) ? stored : '';
  }

  /**
   * Applies the saved theme before the first paint.
   * Mirrors src/theme.mjs; tests/theme.test.js runs this exact script.
   */
  function applyJenesisTheme(host) {
    var doc = host && host.document;
    if (!doc || !doc.documentElement) return '';
    var appId = resolveAppId(host);

    var pref = appId ? storageGet(host, 'jenesis_theme:' + appId) : null;
    if (THEMES.indexOf(pref) === -1) pref = storageGet(host, 'jenesis_theme');
    if (THEMES.indexOf(pref) === -1) pref = 'light';

    var systemDark = false;
    if (pref === 'system' && host.matchMedia) {
      try {
        systemDark = !!host.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch (_) {
        systemDark = false;
      }
    }
    var dark = pref === 'dark' || (pref === 'system' && systemDark);

    var root = doc.documentElement;
    if (dark && root.classList && root.classList.add) root.classList.add('dark');
    if (root.setAttribute) {
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
      if (appId) root.setAttribute('data-app', appId);
    }
    if (root.style) root.style.colorScheme = dark ? 'dark' : 'light';
    if (appId && doc.querySelector) {
      var icon = doc.querySelector('link[rel="icon"]');
      if (icon && icon.setAttribute) icon.setAttribute('href', '/favicon-' + appId + '.png');
    }
    return appId;
  }

  // -------------------------------------------------------------------------
  // The visible start-up card and the failure screen.
  // -------------------------------------------------------------------------
  function bootNode(doc) {
    try {
      return doc.getElementById('jenesis-boot');
    } catch (_) {
      return null;
    }
  }

  function setMessage(doc, text) {
    try {
      var node = doc.getElementById('jenesis-boot-message');
      if (node) node.textContent = text;
    } catch (_) { /* nothing to update */ }
  }

  function isReady(doc) {
    try {
      return doc.documentElement.getAttribute('data-jenesis-ready') === '1';
    } catch (_) {
      return false;
    }
  }

  function report(host, stage, detail) {
    try {
      if (host.genesisDesktop && typeof host.genesisDesktop.reportStartup === 'function') {
        host.genesisDesktop.reportStartup(stage, String(detail).slice(0, 400));
      }
    } catch (_) { /* reporting must never break the page */ }
  }

  /** Replaces the start-up card with a readable failure screen. */
  function showFailure(host, title, detail, hint) {
    var doc = host.document;
    var node = bootNode(doc);
    if (!node || typeof doc.createElement !== 'function') return;
    try {
      if (node.getAttribute('data-jenesis-boot') === 'error') return; // the first error wins
      node.setAttribute('data-jenesis-boot', 'error');
      node.innerHTML = '';
      node.style.cssText =
        'min-height:100vh;display:flex;align-items:center;justify-content:center;' +
        'font-family:Segoe UI,system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px';

      var card = doc.createElement('div');
      card.style.cssText = 'max-width:640px';

      var heading = doc.createElement('div');
      heading.style.cssText = 'font-size:18px;font-weight:700;letter-spacing:.06em;color:#fff';
      heading.textContent = 'JENESIS could not start';

      var sub = doc.createElement('div');
      sub.style.cssText = 'margin-top:10px;font-size:14px;color:#fca5a5';
      sub.textContent = String(title || 'Unexpected start-up failure');

      var body = doc.createElement('div');
      body.style.cssText =
        'margin-top:14px;font-size:12px;line-height:1.6;color:#cbd5e1;' +
        'font-family:Consolas,Menlo,monospace;white-space:pre-wrap;word-break:break-word';
      body.textContent = String(detail || '').slice(0, 1200);

      var help = doc.createElement('div');
      help.style.cssText = 'margin-top:14px;font-size:12px;line-height:1.6;color:#94a3b8';
      help.textContent =
        String(hint || '') +
        ' Details are written to %APPDATA%\\JENESIS\\logs\\desktop.log. ' +
        'Your business data has not been changed.';

      var actions = doc.createElement('div');
      actions.style.cssText = 'margin-top:18px;display:flex;gap:10px';

      var reload = doc.createElement('button');
      reload.type = 'button';
      reload.textContent = 'Try again';
      reload.style.cssText =
        'background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer';
      reload.addEventListener('click', function () {
        host.reload();
      });

      var copy = doc.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy details';
      copy.style.cssText =
        'background:transparent;color:#cbd5e1;border:1px solid #475569;border-radius:6px;' +
        'padding:8px 16px;font-size:13px;cursor:pointer';
      copy.addEventListener('click', function () {
        var text = String(title || '') + '\n' + String(detail || '');
        try {
          if (host.navigator && host.navigator.clipboard && host.navigator.clipboard.writeText) {
            host.navigator.clipboard.writeText(text);
            copy.textContent = 'Copied';
          }
        } catch (_) { /* clipboard unavailable */ }
      });

      actions.appendChild(reload);
      actions.appendChild(copy);
      card.appendChild(heading);
      card.appendChild(sub);
      card.appendChild(body);
      card.appendChild(help);
      card.appendChild(actions);
      node.appendChild(card);
    } catch (_) { /* the failure screen must never throw */ }
  }

  // -------------------------------------------------------------------------
  // Diagnostics: a file that does not load, a script error, a stalled start.
  // -------------------------------------------------------------------------
  function installGuards(host) {
    var doc = host.document;
    if (!doc || typeof host.addEventListener !== 'function') return;

    // A missing or blocked file — the white-screen cause. The browser fires an
    // error event on the element itself, which only a capturing listener sees.
    host.addEventListener(
      'error',
      function (event) {
        var target = event && event.target;
        if (target && target !== doc && (target.src || target.href)) {
          var url = target.src || target.href;
          report(host, 'asset-error', url);
          showFailure(
            host,
            'A JENESIS file could not be loaded.',
            url,
            'The application files did not load, so the interface cannot be drawn. ' +
              'Reinstalling JENESIS repairs a damaged installation.'
          );
          return;
        }
        var message = (event && event.message) || 'Unknown script error';
        report(host, 'script-error', message);
        showFailure(host, 'JENESIS stopped while starting.', message, '');
      },
      true
    );

    host.addEventListener('unhandledrejection', function (event) {
      var reason = event && event.reason;
      var detail = reason && reason.message ? reason.message : String(reason);
      report(host, 'unhandled-rejection', detail);
      showFailure(host, 'JENESIS stopped while starting.', detail, '');
    });

    if (typeof host.setTimeout === 'function') {
      host.setTimeout(function () {
        if (isReady(doc)) return;
        var message = 'The interface did not start within ' + MOUNT_TIMEOUT_MS / 1000 + ' seconds.';
        report(host, 'boot-timeout', message);
        showFailure(
          host,
          'JENESIS did not finish starting.',
          message,
          'Close this window and start JENESIS again. If it keeps happening, reinstall JENESIS.'
        );
      }, MOUNT_TIMEOUT_MS);
    }
  }

  function boot() {
    var host = hostFor(global, rootGlobal);
    if (!host.document) return;
    var appId = '';
    try {
      appId = applyJenesisTheme(host);
    } catch (_) { /* appearance is optional */ }
    try {
      if (appId && !isReady(host.document)) {
        setMessage(host.document, 'Starting JENESIS ' + appId.charAt(0).toUpperCase() + appId.slice(1) + '\u2026');
      }
    } catch (_) { /* the message is optional */ }
    try {
      installGuards(host);
    } catch (_) { /* diagnostics must never break the page */ }
  }

  // Exposed for tests/theme.test.js and tests/production-boot.test.js.
  var api = {
    APP_IDS: APP_IDS,
    MOUNT_TIMEOUT_MS: MOUNT_TIMEOUT_MS,
    hostFor: hostFor,
    resolveAppId: resolveAppId,
    applyJenesisTheme: applyJenesisTheme,
    showFailure: showFailure
  };
  try {
    global.JENESIS_BOOT = api;
  } catch (_) { /* a read-only global must not stop us */ }
  try {
    if (rootGlobal && rootGlobal !== global) rootGlobal.JENESIS_BOOT = api;
  } catch (_) { /* ignore */ }

  try {
    boot();
  } catch (_) { /* the start-up guard must never stop the application */ }
})(typeof window !== 'undefined' ? window : this, typeof globalThis !== 'undefined' ? globalThis : this);
