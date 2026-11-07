/**
 * contextmenu/items.js — decides what a right-click offers.
 *
 * Right-clicking in JENESIS used to do nothing at all. This module is the
 * brain of the menu that now appears: it is deliberately free of React, of the
 * DOM and of the network, so the rule "this user, on this record, may do this"
 * can be tested directly in Node (tests/context-menu.test.js).
 *
 * The rules it holds:
 *
 *  1. An action appears only when it is RELEVANT to what was clicked. A record
 *     that is already active offers Deactivate, not Activate; a text field
 *     offers Cut, which a read-only row never does.
 *  2. An action appears only when the user MAY perform it. The caller passes
 *     what the signed-in user holds, and the server enforces the same thing
 *     independently — the menu is a convenience, never the defence.
 *  3. A record that carries accounting history is PROTECTED: Delete is never
 *     offered for it. Deactivation is offered instead, with the reason.
 *  4. Destructive actions are marked `danger` so the interface can ask first.
 *
 * Nothing here deletes anything. The items carry a `run`, and the caller
 * decides what that does.
 */

/**
 * The eight actions the requirement names. An item's `id` is always one of
 * these, so the interface can attach its own icon and keyboard hint to a
 * stable identifier rather than to translated text.
 */
export const CONTEXT_ACTIONS = [
  'copy',
  'cut',
  'paste',
  'edit',
  'delete',
  'deactivate',
  'activate',
  'selectAll'
];

/**
 * Records that must never be destroyed.
 *
 * An invoice, a bill, a payment or a journal entry is an accounting record:
 * the law and every auditor expect it to still be there in five years. JENESIS
 * therefore never offers Delete for them — only Deactivate, which leaves the
 * history exactly as it was.
 */
export const PROTECTED_RECORD_TYPES = [
  'sales_invoices',
  'invoices',
  'quotes',
  'credit_notes',
  'bills',
  'purchase_orders',
  'goods_receipts',
  'payments',
  'journal_entries',
  'transactions',
  'transfers',
  'stock_movements',
  'cash_sessions',
  'counts'
];

/** True when this kind of record carries accounting history and must be kept. */
export function isProtectedType(type) {
  return PROTECTED_RECORD_TYPES.indexOf(type) !== -1;
}

/** The order actions appear in, so every menu reads the same way. */
const ORDER = [
  'copy',
  'copyValue',
  'cut',
  'paste',
  'selectAll',
  'edit',
  'activate',
  'deactivate',
  'delete'
];

/** Sorts a finished item list into the order above. */
function inOrder(items) {
  return items.slice().sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}

/**
 * One menu item.
 *
 *  id       — a stable identifier (see CONTEXT_ACTIONS, plus 'copyValue')
 *  label    — the text the user reads, already translated by the caller
 *  run      — what choosing it does; always present, never throws
 *  danger   — destructive: the interface asks before running it
 *  disabled — shown but greyed out, with `note` saying why
 *  note     — one line of explanation under the label
 *  shortcut — the keyboard equivalent, for display only
 */
function item(id, label, run, extra) {
  return Object.assign({ id, label, run: typeof run === 'function' ? run : function () {} }, extra || {});
}

/**
 * Builds the menu shown over a RECORD — a customer, a product, an invoice, a
 * user, a computer on the network.
 *
 * options
 *  can            { edit, delete, deactivate, copy, paste, selectAll }
 *  isActive       false for a retired record (offers Activate instead)
 *  isProtected    true for a record that must never be destroyed
 *  protectionNote why Delete is not available (translated by the caller)
 *  labels         { copy, cut, paste, edit, delete, deactivate, activate,
 *                   selectAll, copyValue }
 *  handlers       { onCopy, onCut, onPaste, onEdit, onDelete, onDeactivate,
 *                   onActivate, onSelectAll, onCopyValue }
 *  hasClipboard   true when there is something to paste
 *  valueLabel     the text of the exact cell that was clicked, for "copy value"
 */
export function buildRecordMenu(options) {
  const o = options || {};
  const can = o.can || {};
  const labels = o.labels || {};
  const handlers = o.handlers || {};
  const isActive = o.isActive !== false;
  const isProtected = o.isProtected === true || isProtectedType(o.type);
  const items = [];

  if (can.copy) {
    items.push(item('copy', labels.copy || 'Copy', handlers.onCopy, { shortcut: 'Ctrl+C' }));
  }

  // Copy the single value under the pointer. On a wide table the cell is often
  // what the user wanted, and selecting it with the mouse is fiddly.
  if (can.copy && o.valueLabel && handlers.onCopyValue) {
    items.push(item('copyValue', labels.copyValue || 'Copy this value', handlers.onCopyValue));
  }

  if (can.cut && handlers.onCut) {
    items.push(item('cut', labels.cut || 'Cut', handlers.onCut, { shortcut: 'Ctrl+X' }));
  }

  if (can.paste && o.hasClipboard && handlers.onPaste) {
    items.push(item('paste', labels.paste || 'Paste', handlers.onPaste, { shortcut: 'Ctrl+V' }));
  }

  if (can.selectAll && handlers.onSelectAll) {
    items.push(item('selectAll', labels.selectAll || 'Select all', handlers.onSelectAll, { shortcut: 'Ctrl+A' }));
  }

  if (can.edit && handlers.onEdit) {
    items.push(item('edit', labels.edit || 'Edit', handlers.onEdit));
  }

  // Retired records come back; live ones are retired. Never both.
  if (can.deactivate && handlers.onActivate && !isActive) {
    items.push(item('activate', labels.activate || 'Activate', handlers.onActivate));
  }
  if (can.deactivate && handlers.onDeactivate && isActive) {
    items.push(item('deactivate', labels.deactivate || 'Deactivate', handlers.onDeactivate));
  }

  if (can.delete) {
    if (isProtected) {
      // Shown, refused and explained, rather than silently missing: a user who
      // wonders why they cannot delete an invoice is told the reason.
      items.push(item('delete', labels.delete || 'Delete', function () {}, {
        disabled: true,
        danger: true,
        note: o.protectionNote || 'Accounting records are kept. Deactivate it instead.'
      }));
    } else if (handlers.onDelete) {
      items.push(item('delete', labels.delete || 'Delete', handlers.onDelete, { danger: true }));
    }
  }

  return inOrder(items);
}

/**
 * Builds the menu shown over TEXT — an input, a textarea, or any selection the
 * user has made with the mouse.
 *
 * Cut and Paste only make sense where the text can be changed, so a read-only
 * field gets Copy and Select All and nothing else.
 */
export function buildTextMenu(options) {
  const o = options || {};
  const can = o.can || {};
  const labels = o.labels || {};
  const handlers = o.handlers || {};
  const items = [];

  if (can.copy) {
    items.push(item('copy', labels.copy || 'Copy', handlers.onCopy, { shortcut: 'Ctrl+C' }));
  }
  if (can.cut) {
    items.push(item('cut', labels.cut || 'Cut', handlers.onCut, { shortcut: 'Ctrl+X' }));
  }
  if (can.paste && o.hasClipboard !== false) {
    items.push(item('paste', labels.paste || 'Paste', handlers.onPaste, { shortcut: 'Ctrl+V' }));
  }
  if (can.selectAll) {
    items.push(item('selectAll', labels.selectAll || 'Select all', handlers.onSelectAll, { shortcut: 'Ctrl+A' }));
  }

  return inOrder(items);
}

/**
 * Builds the menu shown over a LIST that has no single record under the
 * pointer — the blank space below the last row, for instance.
 */
export function buildListMenu(options) {
  const o = options || {};
  const can = o.can || {};
  const labels = o.labels || {};
  const handlers = o.handlers || {};
  const items = [];

  if (can.selectAll && handlers.onSelectAll) {
    items.push(item('selectAll', labels.selectAll || 'Select all', handlers.onSelectAll, { shortcut: 'Ctrl+A' }));
  }
  if (can.paste && o.hasClipboard && handlers.onPaste) {
    items.push(item('paste', labels.paste || 'Paste', handlers.onPaste, { shortcut: 'Ctrl+V' }));
  }
  if (can.copy && handlers.onCopy) {
    items.push(item('copy', labels.copy || 'Copy all', handlers.onCopy, { shortcut: 'Ctrl+C' }));
  }

  return inOrder(items);
}

/**
 * A record written as text, for the clipboard.
 *
 * One line per field, "Name: value", which pastes into a spreadsheet, an email
 * or a chat window and still reads. Amounts are passed in already formatted,
 * because only the caller knows the company's currency.
 */
export function recordToText(record, fields) {
  if (!record) return '';
  const names = fields && fields.length
    ? fields
    : Object.keys(record).filter((k) => typeof record[k] !== 'object' || record[k] === null);
  const lines = [];
  for (const name of names) {
    const value = record[name];
    if (value === undefined || value === null || value === '') continue;
    lines.push(`${name}: ${value}`);
  }
  return lines.join('\n');
}

/** Several records written as a table, tab-separated so a spreadsheet takes it. */
export function recordsToText(records, fields) {
  if (!Array.isArray(records) || records.length === 0) return '';
  const list = records.filter(Boolean);
  const names = fields && fields.length
    ? fields
    : Object.keys(list[0]).filter((k) => typeof list[0][k] !== 'object' || list[0][k] === null);
  const rows = [names.join('\t')];
  for (const record of list) {
    rows.push(names.map((name) => {
      const value = record ? record[name] : undefined;
      return value === undefined || value === null ? '' : String(value);
    }).join('\t'));
  }
  return rows.join('\n');
}

/**
 * Where a menu may be placed. The menu is never drawn off-screen: a click in
 * the bottom-right corner opens it upwards and to the left instead.
 */
export function placeMenu(x, y, width, height, viewport) {
  const view = viewport || { width: 1280, height: 800 };
  const margin = 8;
  const w = width || 220;
  const h = height || 240;
  let left = x;
  let top = y;
  if (left + w + margin > view.width) left = Math.max(margin, x - w);
  if (top + h + margin > view.height) top = Math.max(margin, y - h);
  return { left: Math.max(margin, left), top: Math.max(margin, top) };
}
