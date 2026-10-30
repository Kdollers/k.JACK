/**
 * shortcuts.js — pure keyboard-shortcut helpers (no React, no DOM globals at
 * import time). Kept separate from the React provider so the rules can be
 * unit-tested in Node (see tests/shortcuts.test.js).
 *
 * Rules implemented here:
 *  - combos are normalised to a canonical string: "Ctrl+N", "Alt+ArrowLeft",
 *    "Ctrl+Shift+C", "F2", "Escape";
 *  - typing (input/textarea/select/contenteditable) never receives plain-key
 *    shortcuts; only function keys, Escape and modifier combinations get
 *    through, and plain "Ctrl+letter" combos are suspended while typing so
 *    they cannot steal text editing;
 *  - escape layers are ordered by priority, so the top-most dialog always
 *    closes first and the application itself is never closed.
 */

/** True when the event target is a text-entry field. */
export function isTypingTarget(el) {
  if (!el || typeof el !== 'object') return false;
  if (el.isContentEditable === true) return true;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = String(el.type || 'text').toLowerCase();
    // Checkboxes, radios and buttons are not text entry: shortcuts may run.
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return false;
}

const NAMED_KEYS = {
  Escape: 'Escape',
  Esc: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ' ': 'Space',
  Spacebar: 'Space'
};

/**
 * Canonical key name for an event. Letters/digits come from `code` so that
 * Shift+1 is "Shift+1" (not "Shift+!") and the layout cannot change a combo.
 */
export function keyFromEvent(e) {
  const key = e.key;
  if (NAMED_KEYS[key]) return NAMED_KEYS[key];
  if (/^F\d{1,2}$/.test(key)) return key;
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  if (typeof key === 'string' && key.length === 1) return key.toUpperCase();
  return key;
}

/** "Ctrl+Shift+C" / "Alt+ArrowLeft" / "F2" / "Escape" */
export function comboFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(keyFromEvent(e));
  return parts.join('+');
}

/** Normalises a declared combo such as "ctrl+n" → "Ctrl+N". */
export function normalizeCombo(combo) {
  if (!combo) return '';
  const raw = String(combo).split('+').map((p) => p.trim()).filter(Boolean);
  const mods = [];
  let key = '';
  for (const part of raw) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') mods.push('Ctrl');
    else if (lower === 'meta' || lower === 'cmd' || lower === 'super') mods.push('Meta');
    else if (lower === 'alt' || lower === 'option') mods.push('Alt');
    else if (lower === 'shift') mods.push('Shift');
    else key = part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
  }
  // Canonical modifier order, key last.
  const ordered = ['Ctrl', 'Meta', 'Alt', 'Shift'].filter((m) => mods.includes(m));
  return [...ordered, key].join('+');
}

export function combosEqual(a, b) {
  return normalizeCombo(a) === normalizeCombo(b);
}

/** Does this combo use at least one modifier? */
export function hasModifier(combo) {
  const c = normalizeCombo(combo);
  return c.includes('+');
}

/**
 * May this combo be handled while the user is typing in a field?
 * Function keys, Escape, Alt+… and Shift-including combinations are safe;
 * plain Ctrl+letter and bare keys are not.
 */
export function allowedWhileTyping(combo) {
  const c = normalizeCombo(combo);
  if (c === 'Escape') return true;
  if (/^F\d{1,2}$/.test(c)) return true;
  if (!c.includes('+')) return false;
  if (c.startsWith('Alt+')) return true;
  if (c.includes('Shift')) return true;
  return false;
}

/** Decide whether a keydown event should trigger `combo`. */
export function matchesEvent(combo, e) {
  if (!combosEqual(comboFromEvent(e), combo)) return false;
  if (isTypingTarget(e.target) && !allowedWhileTyping(combo)) return false;
  return true;
}

/**
 * Picks the escape layer that must react to Escape: the highest priority wins,
 * and for equal priorities the most recently registered one (top-most dialog).
 */
export function topEscapeLayer(layers) {
  return (layers || [])
    .filter((l) => typeof l.onEscape === 'function')
    .sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq))
    .pop() || null;
}

/** The layer that captures raw keys (e.g. the open calculator), if any. */
export function keyCaptureLayer(layers) {
  return (layers || [])
    .filter((l) => l.captureKeys && typeof l.onKey === 'function')
    .sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq))
    .pop() || null;
}

/** Picks the action to run for a combo: highest order wins. */
export function resolveAction(actions, combo, e) {
  const candidates = (actions || []).filter((a) => combosEqual(a.combo, combo));
  if (candidates.length === 0) return null;
  const usable = candidates.filter((a) => (typeof a.when === 'function' ? a.when(e) !== false : true));
  const pool = usable.length ? usable : candidates;
  return pool.sort((a, b) => (b.order || 0) - (a.order || 0))[0] || null;
}

/** Human-readable form of a combo, used by the reference screen and the guide. */
export function formatCombo(combo) {
  return normalizeCombo(combo).replace(/\+/g, ' + ');
}

/**
 * The shortcut catalogue. `key` is the i18n key (shortcuts.<key>) so the
 * reference screen and the user guide stay translated. `builtin: true` marks
 * shortcuts handled by the application shell itself.
 */
export const SHORTCUTS = [
  // --- Function keys -------------------------------------------------------
  { id: 'help', combo: 'F1', group: 'app', key: 'help', builtin: true },
  { id: 'settle', combo: 'F2', group: 'document', key: 'settle', builtin: true },
  { id: 'print', combo: 'F3', group: 'document', key: 'print', builtin: true },
  { id: 'refresh', combo: 'F5', group: 'app', key: 'refresh', builtin: true },
  { id: 'escape', combo: 'Escape', group: 'navigation', key: 'escape', builtin: true },

  // --- Editing -------------------------------------------------------------
  { id: 'save', combo: 'Ctrl+S', group: 'document', key: 'save', builtin: true },
  { id: 'new', combo: 'Ctrl+N', group: 'document', key: 'new', builtin: true },
  { id: 'edit', combo: 'Ctrl+E', group: 'document', key: 'edit', builtin: true },
  { id: 'search', combo: 'Ctrl+F', group: 'app', key: 'search', builtin: true },
  { id: 'printCtrl', combo: 'Ctrl+P', group: 'document', key: 'print', builtin: true },
  { id: 'duplicate', combo: 'Ctrl+D', group: 'document', key: 'duplicate', builtin: true },
  { id: 'submit', combo: 'Ctrl+Enter', group: 'document', key: 'submit', builtin: true },

  // --- Navigation ----------------------------------------------------------
  { id: 'back', combo: 'Alt+ArrowLeft', group: 'navigation', key: 'back', builtin: true },
  { id: 'forward', combo: 'Alt+ArrowRight', group: 'navigation', key: 'forward', builtin: true },
  { id: 'openSales', combo: 'Ctrl+Shift+S', group: 'navigation', key: 'open_sales', builtin: true },
  { id: 'newReceipt', combo: 'Ctrl+Shift+R', group: 'document', key: 'new_receipt', builtin: true },
  { id: 'searchCustomers', combo: 'Ctrl+Shift+C', group: 'navigation', key: 'search_customers', builtin: true },
  { id: 'openPurchases', combo: 'Ctrl+Shift+P', group: 'navigation', key: 'open_purchases', builtin: true },
  { id: 'searchSuppliers', combo: 'Ctrl+Shift+V', group: 'navigation', key: 'search_suppliers', builtin: true },
  { id: 'newPurchase', combo: 'Ctrl+Shift+N', group: 'document', key: 'new_purchase', builtin: true },
  { id: 'openInventory', combo: 'Ctrl+Shift+I', group: 'navigation', key: 'open_inventory', builtin: true },
  { id: 'searchProducts', combo: 'Ctrl+Shift+F', group: 'navigation', key: 'search_products', builtin: true },
  { id: 'stockTransfers', combo: 'Ctrl+Shift+T', group: 'navigation', key: 'stock_transfers', builtin: true },
  { id: 'openAccounting', combo: 'Ctrl+Shift+A', group: 'navigation', key: 'open_accounting', builtin: true },
  { id: 'openBanking', combo: 'Ctrl+Shift+B', group: 'navigation', key: 'open_banking', builtin: true },
  { id: 'openLedger', combo: 'Ctrl+Shift+L', group: 'navigation', key: 'open_ledger', builtin: true },
  { id: 'openReports', combo: 'Ctrl+Shift+G', group: 'navigation', key: 'open_reports', builtin: true },

  // --- Application ---------------------------------------------------------
  { id: 'calculator', combo: 'Ctrl+Shift+K', group: 'app', key: 'calculator', builtin: true },
  { id: 'messenger', combo: 'Ctrl+Shift+M', group: 'app', key: 'messenger', builtin: true },
  { id: 'reference', combo: 'Ctrl+/', group: 'app', key: 'reference', builtin: true },
  // Theme and language keep Alt combinations: every Ctrl+Shift+letter above
  // belongs to a screen or a document action.
  { id: 'theme', combo: 'Alt+T', group: 'app', key: 'theme', builtin: true },
  { id: 'language', combo: 'Alt+L', group: 'app', key: 'language', builtin: true }
];

/** Case/blank-insensitive search over the reference list. */
export function searchShortcuts(entries, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return entries;
  const terms = q.split(/\s+/);
  return entries.filter((entry) => {
    const haystack = `${entry.combo} ${entry.label} ${entry.group} ${entry.id}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
