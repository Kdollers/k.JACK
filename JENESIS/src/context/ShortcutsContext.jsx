import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useApp } from './AppContext';
import { useTheme } from './ThemeContext';
import { useI18n } from '../i18n';
import { useAppMode } from './AppModeContext';
import { apiRequest } from '../services/api';
import {
  SHORTCUTS,
  comboFromEvent,
  isTypingTarget,
  keyCaptureLayer,
  matchesEvent,
  normalizeCombo,
  resolveAction,
  topEscapeLayer
} from '../shortcuts';

/**
 * The single keyboard-shortcut owner of the application.
 *
 * Only ONE keydown listener exists in the whole app (installed here), so no
 * shortcut can be handled twice. Views and dialogs register handlers instead of
 * adding their own listeners:
 *
 *   useEscapeLayer({ priority, onEscape })      → layered Esc handling
 *   useShortcutAction('F3', handler, { when })  → a shortcut for this screen
 *
 * Escape order: the highest-priority layer closes first (dialog → calculator /
 * Messenger → screen), the application itself is never closed.
 */
const ShortcutsContext = createContext(null);

/** The permission a screen needs before a shortcut may open it. */
const VIEW_PERMISSION = {
  dashboard: 'dashboard:read',
  sales: 'sales:read',
  purchases: 'purchases:read',
  inventory: 'inventory:read',
  customers: 'contacts:read',
  suppliers: 'contacts:read',
  banking: 'banking:read',
  accounting: 'accounting:read',
  reports: 'reports:read',
  settings: null,
  maintenance: null,
  help: null
};

export function ShortcutsProvider({ children }) {
  const { activeView, setActiveView, showToast, triggerRefresh, refreshKey, hasPermission } = useApp();
  // Which application this window is: shortcuts never open a screen that does
  // not belong to it (JENESIS Seller has no general ledger).
  const mode = useAppMode();
  const { t, lang, setLang } = useI18n();
  const { preference, setPreference } = useTheme();

  const layersRef = useRef([]);
  const actionsRef = useRef([]);
  const seqRef = useRef(0);

  // Overlays opened by shortcuts (they live here so the keyboard and the
  // toolbar buttons drive exactly the same state).
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [messengerUnread, setMessengerUnread] = useState(0);

  // --- view history (Alt+Left / Alt+Right) ----------------------------------
  const historyRef = useRef([activeView]);
  const indexRef = useRef(0);
  const lastViewRef = useRef(activeView);
  const internalNavRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (internalNavRef.current) {
      internalNavRef.current = false;
      lastViewRef.current = activeView;
      setHistoryVersion((v) => v + 1);
      return;
    }
    if (activeView === lastViewRef.current) return;
    lastViewRef.current = activeView;
    const next = historyRef.current.slice(0, indexRef.current + 1);
    next.push(activeView);
    while (next.length > 30) next.shift();
    historyRef.current = next;
    indexRef.current = next.length - 1;
    setHistoryVersion((v) => v + 1);
  }, [activeView]);

  const goBack = useCallback(() => {
    if (indexRef.current <= 0) return false;
    indexRef.current -= 1;
    internalNavRef.current = true;
    setActiveView(historyRef.current[indexRef.current]);
    return true;
  }, [setActiveView]);

  const goForward = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return false;
    indexRef.current += 1;
    internalNavRef.current = true;
    setActiveView(historyRef.current[indexRef.current]);
    return true;
  }, [setActiveView]);

  const canGoBack = indexRef.current > 0;
  const canGoForward = indexRef.current < historyRef.current.length - 1;

  // --- registry ------------------------------------------------------------
  const registerLayer = useCallback((layer) => {
    const entry = { ...layer, seq: seqRef.current++ };
    layersRef.current = [...layersRef.current, entry];
    return () => {
      layersRef.current = layersRef.current.filter((l) => l !== entry);
    };
  }, []);

  const registerAction = useCallback((action) => {
    const entry = { ...action, seq: seqRef.current++, order: action.order || 0 };
    actionsRef.current = [...actionsRef.current, entry];
    return () => {
      actionsRef.current = actionsRef.current.filter((a) => a !== entry);
    };
  }, []);

  // Badge refresh: silently ignored for roles without messaging permission.
  const refreshMessengerUnread = useCallback(async () => {
    try {
      const res = await apiRequest('/api/messenger/unread');
      setMessengerUnread(res.unread || 0);
    } catch (_) { /* no messaging permission or backend unreachable */ }
  }, []);

  // --- built-in handlers ---------------------------------------------------
  const openHelp = useCallback(() => setActiveView('help'), [setActiveView]);
  const cycleLanguage = useCallback(() => {
    const order = ['en', 'fr', 'rw'];
    const next = order[(order.indexOf(lang) + 1) % order.length];
    setLang(next);
    showToast(t('shortcuts.language_changed'), 'info');
  }, [lang, setLang, showToast, t]);

  const cycleTheme = useCallback(() => {
    // light → dark → system → light …
    const order = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(preference) + 1) % order.length];
    setPreference(next);
  }, [preference, setPreference]);

  // Registered actions change every render; read them through a ref.
  const actionsSnapshot = () => actionsRef.current;
  const layersSnapshot = () => layersRef.current;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (event.isComposing) return;
      const combo = comboFromEvent(event);
      const layers = layersSnapshot();

      // --- helpers ------------------------------------------------------------
      // Submits the form the user is typing in (Save / Confirm). Works on every
      // dialog without each view having to register a handler.
      const submitFocusedForm = () => {
        const active = typeof document === 'undefined' ? null : document.activeElement;
        const form = active && active.closest ? active.closest('form') : null;
        if (!form) return false;
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return true;
      };

      // Puts the cursor into this screen's search field, marked data-j-search.
      const focusSearchBox = () => {
        if (typeof document === 'undefined') return false;
        const field = document.querySelector('[data-j-search]');
        if (!field) return false;
        field.focus();
        if (typeof field.select === 'function') field.select();
        return true;
      };

      // Opens a screen, but only inside the application that owns it and only
      // for a user allowed to see it.
      const gotoView = (viewId, options = {}) => {
        const appName = mode.app ? t(mode.app.nameKey) : 'JENESIS';
        if (mode.appId && !mode.canOpen(viewId)) {
          showToast(t('shortcuts.unavailable_in_app', { app: appName }), 'info');
          return false;
        }
        const required = VIEW_PERMISSION[viewId];
        if (required && !hasPermission(required)) {
          showToast(t('errors.FORBIDDEN'), 'info');
          return false;
        }
        setActiveView(viewId);
        if (options.tab) {
          window.setTimeout(() => window.dispatchEvent(
            new CustomEvent('jenesis:open-tab', { detail: options.tab })
          ), 40);
        }
        if (options.focusSearch) {
          window.setTimeout(() => focusSearchBox(), 80);
        }
        return true;
      };

      // Asks the current screen (or the screen that owns the document type) to
      // open its "new record" form.
      const newDocument = (kind) => {
        const viewId = kind === 'purchase' ? 'purchases' : 'sales';
        if (!gotoView(viewId)) return false;
        window.setTimeout(() => window.dispatchEvent(
          new CustomEvent('jenesis:new-document', { detail: kind })
        ), 60);
        return true;
      };

      // 1. Escape is always handled by the top-most layer, never by the app shell.
      if (combo === 'Escape') {
        const layer = topEscapeLayer(layers);
        if (layer) {
          const handled = layer.onEscape(event);
          if (handled !== false) {
            event.preventDefault();
            event.stopPropagation();
          } else {
            // The layer refused (e.g. unsaved changes): let lower layers run.
            const lower = topEscapeLayer(layers.filter((l) => l !== layer));
            if (lower) {
              lower.onEscape(event);
              event.preventDefault();
              event.stopPropagation();
            }
          }
          return;
        }
        // Nothing open: Escape leaves the current screen (never quits JENESIS).
        if (goBack()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      // 2. A key-capturing layer (calculator) receives the raw key first. When
      //    it does not want the key (modifier combinations and function keys),
      //    the key falls through to the application shortcuts below — that is
      //    how Ctrl+Shift+C still closes the calculator and F1 still opens help.
      const capture = keyCaptureLayer(layers);
      if (capture && capture.onKey(event, combo)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // 3. Screen-specific actions (F2 settle, F3 print, Ctrl+N new…).
      //    Returning false means "not my job" — the key then falls through to
      //    the built-in handlers below instead of being swallowed.
      const action = resolveAction(actionsSnapshot(), combo, event);
      if (action) {
        if (!matchesEvent(combo, event)) return;
        const result = action.handler(event);
        if (result !== false) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      // 4. Built-in application shortcuts: the whole map lives here, so a
      //    shortcut can only be handled once. Screen actions (step 3) always
      //    get the key first and may refuse it.
      const builtin = {
        F1: () => openHelp(),
        F5: () => { triggerRefresh(); showToast(t('shortcuts.refreshed'), 'info'); },

        // Saving and confirming: submit the form the user is working in.
        'Ctrl+S': () => submitFocusedForm(),
        'Ctrl+Enter': () => submitFocusedForm(),
        // Search: put the cursor in this screen's search box.
        'Ctrl+F': () => focusSearchBox(),

        // Navigation between screens (only where the application offers them).
        'Ctrl+Shift+S': () => gotoView('sales'),
        'Ctrl+Shift+R': () => newDocument('sale'),
        'Ctrl+Shift+C': () => gotoView('customers', { focusSearch: true }),
        'Ctrl+Shift+P': () => gotoView('purchases'),
        'Ctrl+Shift+V': () => gotoView('suppliers', { focusSearch: true }),
        'Ctrl+Shift+N': () => newDocument('purchase'),
        'Ctrl+Shift+I': () => gotoView('inventory'),
        'Ctrl+Shift+F': () => gotoView('inventory', { focusSearch: true }),
        'Ctrl+Shift+T': () => gotoView('inventory', { tab: 'transfers' }),
        'Ctrl+Shift+A': () => gotoView('accounting'),
        'Ctrl+Shift+B': () => gotoView('banking'),
        'Ctrl+Shift+L': () => gotoView('accounting', { tab: 'ledger' }),
        'Ctrl+Shift+G': () => gotoView('reports'),

        // Application tools.
        'Ctrl+Shift+K': () => setCalculatorOpen((v) => !v),
        'Ctrl+Shift+M': () => setMessengerOpen((v) => !v),
        'Ctrl+/': () => setReferenceOpen((v) => !v),
        'Alt+T': () => cycleTheme(),
        'Alt+L': () => cycleLanguage(),
        'Alt+ArrowLeft': () => { if (!goBack()) showToast(t('shortcuts.no_history_back'), 'info'); },
        'Alt+ArrowRight': () => { if (!goForward()) showToast(t('shortcuts.no_history_forward'), 'info'); }
      }[combo];
      if (builtin) {
        if (!matchesEvent(combo, event)) return;
        builtin();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // 5. Shortcuts without a destination on this screen: F3/Ctrl+P print and
      //    F2 settle explain themselves instead of doing nothing silently.
      if ((combo === 'F3' || combo === 'Ctrl+P') && !isTypingTarget(event.target)) {
        showToast(t('shortcuts.print_none'), 'info');
        event.preventDefault();
      } else if (combo === 'F2' && !isTypingTarget(event.target)) {
        showToast(t('shortcuts.settle_none'), 'info');
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goBack, openHelp, triggerRefresh, showToast, cycleLanguage, cycleTheme, t,
    hasPermission, mode.appId, mode.canOpen, mode.app, setActiveView, activeView]);

  const value = useMemo(() => ({
    registerLayer,
    registerAction,
    openHelp,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    calculatorOpen,
    openCalculator: () => setCalculatorOpen(true),
    closeCalculator: () => setCalculatorOpen(false),
    toggleCalculator: () => setCalculatorOpen((v) => !v),
    messengerOpen,
    openMessenger: () => setMessengerOpen(true),
    closeMessenger: () => setMessengerOpen(false),
    toggleMessenger: () => setMessengerOpen((v) => !v),
    messengerUnread,
    setMessengerUnread,
    refreshMessengerUnread,
    referenceOpen,
    openReference: () => setReferenceOpen(true),
    closeReference: () => setReferenceOpen(false),
    toggleReference: () => setReferenceOpen((v) => !v),
    catalogue: SHORTCUTS,
    refreshKey
  }), [registerLayer, registerAction, openHelp, goBack, goForward, canGoBack, canGoForward,
    calculatorOpen, messengerOpen, referenceOpen, messengerUnread, refreshMessengerUnread,
    historyVersion, refreshKey]); // historyVersion keeps back/forward fresh after navigation

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
}

export function useShortcuts() {
  const context = useContext(ShortcutsContext);
  if (!context) throw new Error('useShortcuts must be used within a ShortcutsProvider');
  return context;
}

/**
 * Registers an Escape layer. `onEscape` may return false to refuse closing
 * (unsaved changes) — the layer below then gets a chance.
 * `captureKeys: true` also routes every key to `onKey` (the calculator).
 */
export function useEscapeLayer({ priority = 50, onEscape, captureKeys = false, onKey, active = true, id }) {
  const { registerLayer } = useShortcuts();
  const latest = useRef({ onEscape, onKey });
  latest.current = { onEscape, onKey };

  useEffect(() => {
    if (!active) return undefined;
    const layer = {
      id: id || `layer-${priority}`,
      priority,
      captureKeys,
      onEscape: (e) => (latest.current.onEscape ? latest.current.onEscape(e) : true),
      onKey: (e, combo) => (latest.current.onKey ? latest.current.onKey(e, combo) : false)
    };
    return registerLayer(layer);
  }, [registerLayer, active, priority, captureKeys, id]);
}

/**
 * Registers a shortcut for the currently mounted screen.
 * `when()` can disable it (e.g. F2 only when a row is selected).
 */
export function useShortcutAction(combo, handler, { order = 0, when, enabled = true } = {}) {
  const { registerAction } = useShortcuts();
  const latest = useRef({ handler, when });
  latest.current = { handler, when };
  const normalized = normalizeCombo(combo);

  useEffect(() => {
    if (!enabled || !normalized) return undefined;
    return registerAction({
      combo: normalized,
      order,
      handler: (e) => (latest.current.handler ? latest.current.handler(e) : false),
      when: (e) => (latest.current.when ? latest.current.when(e) : true)
    });
  }, [registerAction, normalized, order, enabled]);
}
