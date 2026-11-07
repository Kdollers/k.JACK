/**
 * clipboard.js — what Copy, Cut and Paste move around.
 *
 * Two things travel between the menu and the screens:
 *
 *  1. TEXT. The operating system clipboard, so a value copied out of JENESIS
 *     can be pasted into a spreadsheet, an email or a chat window.
 *  2. A RECORD. An internal holding place, because "paste this customer" has
 *     no meaning outside JENESIS: pasting opens the new-record form already
 *     filled in from the record that was copied. Nothing is written to the
 *     database by pasting — the user still has to save.
 *
 * The two are deliberately separate. Copying a row writes its text to the
 * system clipboard AND keeps the record here, so both work afterwards.
 */

/** The record held for pasting. Never persisted: closing the window drops it. */
let held = null;

/** Puts a record on the internal clipboard and returns what is held. */
export function holdRecord(type, record, text) {
  held = { type, record: record ? Object.assign({}, record) : null, text: text || '', at: Date.now() };
  return held;
}

/** The record held for pasting, or null when there is none. */
export function heldRecord() {
  return held;
}

/** True when a record of this kind is waiting to be pasted. */
export function hasHeldRecord(type) {
  if (!held || !held.record) return false;
  return type ? held.type === type : true;
}

/** Empties the internal clipboard. */
export function clearHeldRecord() {
  held = null;
}

/**
 * Writes text to the system clipboard.
 *
 * The asynchronous Clipboard API is tried first. It is unavailable on an
 * insecure origin and in a few older builds of the shell, so the older
 * execCommand path is kept as a fallback rather than letting Copy fail
 * silently — a menu entry that does nothing is worse than a menu entry that
 * is missing.
 */
export async function copyText(text) {
  const value = text === undefined || text === null ? '' : String(text);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {
    // Fall through to the legacy path.
  }
  try {
    if (typeof document !== 'undefined' && document.body) {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
      document.body.removeChild(area);
      return ok;
    }
  } catch (_) {
    // Nothing more can be done from here.
  }
  return false;
}

/** Reads text from the system clipboard, or '' when it cannot be read. */
export async function readText() {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
  } catch (_) {
    // Permission was refused, or the API is unavailable.
  }
  return '';
}

/** True when the element under the pointer can hold text that may be changed. */
export function isEditableTarget(target) {
  if (!target || typeof target.tagName !== 'string') return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'input') {
    if (target.disabled || target.readOnly) return false;
    const type = (target.type || 'text').toLowerCase();
    // A checkbox or a button has no text to cut.
    return ['text', 'search', 'url', 'tel', 'password', 'email', 'number', 'date', 'datetime-local', 'month', 'time', 'week'].indexOf(type) !== -1;
  }
  return target.isContentEditable === true;
}

/** True when something is selected on the page. */
export function hasTextSelection() {
  try {
    if (typeof window === 'undefined' || !window.getSelection) return false;
    const selection = window.getSelection();
    return !!(selection && String(selection.toString() || '').length > 0);
  } catch (_) {
    return false;
  }
}

/** The text selected on the page, or ''. */
export function selectedText() {
  try {
    if (typeof window === 'undefined' || !window.getSelection) return '';
    return String(window.getSelection().toString() || '');
  } catch (_) {
    return '';
  }
}
