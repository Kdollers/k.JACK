import { useCallback } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../context/AppContext';
import { useContextMenu } from '../context/ContextMenuContext';
import { apiRequest } from '../services/api';
import { buildRecordMenu, buildTextMenu, buildListMenu, recordToText, recordsToText } from './items';
import {
  copyText,
  readText,
  holdRecord,
  hasHeldRecord,
  heldRecord,
  isEditableTarget,
  hasTextSelection,
  selectedText
} from './clipboard';

/**
 * The right-click menu, wired to the records it is opened on.
 *
 * A screen calls `openRecord(event, {...})` from a row's onContextMenu and
 * gets a menu whose Edit opens that screen's own editor, whose Deactivate and
 * Delete go through the very same server rules as the row buttons, and whose
 * Copy puts the record on the clipboard as text.
 *
 * The lifecycle actions are implemented ONCE here rather than per screen, so
 * the guarantees that matter hold everywhere:
 *
 *  - Deactivate and Delete appear only for a user holding records:deactivate /
 *    records:delete, and the server refuses them just the same;
 *  - Delete always asks first, and the question names the record;
 *  - a record carrying accounting history is never deleted — the server
 *    answers 409 and the menu offers deactivation with the reason;
 *  - Cut, Copy and Paste inside a text field drive the field itself.
 */

/** The five kinds of record the lifecycle endpoints retire. */
export const LIFECYCLE_TYPES = ['customers', 'suppliers', 'products', 'warehouses', 'users'];

/** Runs a native editing command on whatever the user clicked in. */
function nativeEdit(command) {
  try {
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      return document.execCommand(command);
    }
  } catch (_) {
    // The command is simply unavailable.
  }
  return false;
}

/** Pastes text at the caret, keeping React's own state in step. */
function insertText(text) {
  try {
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      if (document.execCommand('insertText', false, text)) return true;
    }
  } catch (_) {
    // Fall through to a direct write.
  }
  try {
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (active && typeof active.value === 'string') {
      const start = active.selectionStart === null ? active.value.length : active.selectionStart;
      const end = active.selectionEnd === null ? active.value.length : active.selectionEnd;
      const next = active.value.slice(0, start) + text + active.value.slice(end);
      // The native setter keeps React's internal value in step, which assigning
      // to .value directly does not.
      const setter = Object.getOwnPropertyDescriptor(active.constructor.prototype, 'value');
      if (setter && setter.set) setter.set.call(active, next);
      else active.value = next;
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  } catch (_) {
    // Nothing more can be done from here.
  }
  return false;
}

export function useRecordMenu() {
  const { t } = useI18n();
  const { hasPermission, showToast, triggerRefresh } = useApp();
  const { open, confirmAction } = useContextMenu();

  /** The labels, translated once, so no screen has to translate them again. */
  const labels = {
    copy: t('contextmenu.copy'),
    copyValue: t('contextmenu.copy_value'),
    cut: t('contextmenu.cut'),
    paste: t('contextmenu.paste'),
    edit: t('contextmenu.edit'),
    delete: t('contextmenu.delete'),
    deactivate: t('contextmenu.deactivate'),
    activate: t('contextmenu.activate'),
    selectAll: t('contextmenu.select_all')
  };

  /**
   * Deactivate / reactivate / delete through the lifecycle endpoints. The
   * server decides whether the record may be destroyed; this only reports what
   * it says.
   */
  const lifecycle = useCallback((type, record, name, action) => {
    const isDelete = action === 'DELETE';
    const run = async () => {
      try {
        if (isDelete) {
          await apiRequest(`/api/records/${type}/${record.id}`, { method: 'DELETE' });
        } else {
          const path = action === 'ACTIVATE' ? 'reactivate' : 'deactivate';
          const result = await apiRequest(`/api/records/${type}/${record.id}/${path}`, { method: 'POST' });
          if (result && result.revokedSessions > 0) {
            showToast(t('records.user_sessions_ended', { count: result.revokedSessions }), 'success');
          }
        }
        if (isDelete) showToast(t('records.deleted_toast', { kind: name.kind, name: name.value }), 'success');
        else if (action === 'ACTIVATE') showToast(t('records.reactivated_toast', { kind: name.kind, name: name.value }), 'success');
        else showToast(t('records.deactivated_toast', { kind: name.kind, name: name.value }), 'success');
        triggerRefresh();
      } catch (err) {
        // A record with history is never deleted: offer deactivation instead,
        // using the explanation the server sent.
        if (isDelete && err && err.status === 409 && err.code === 'HAS_HISTORY') {
          showToast(err.message, 'error');
          confirmAction({
            title: t('records.archive_instead_title'),
            message: err.message,
            confirmLabel: t('records.deactivate_instead'),
            onConfirm: () => lifecycle(type, record, name, 'DEACTIVATE')
          });
          return;
        }
        showToast(err && err.message ? err.message : String(err), 'error');
      }
    };

    if (isDelete) {
      confirmAction({
        title: t('records.confirm_delete_title', { kind: name.kind }),
        message: t('records.confirm_delete_body', { kind: name.kind, name: name.value }),
        confirmLabel: t('contextmenu.delete'),
        onConfirm: run
      });
      return;
    }
    if (action === 'DEACTIVATE') {
      confirmAction({
        title: t('records.confirm_deactivate_title', { kind: name.kind }),
        message: t('records.confirm_deactivate_body', { kind: name.kind, name: name.value }),
        confirmLabel: t('contextmenu.deactivate'),
        onConfirm: run
      });
      return;
    }
    run();
  }, [confirmAction, showToast, t, triggerRefresh]);

  /**
   * Opens the menu over one record.
   *
   * options
   *  type         'customers' | 'products' | ... — decides the lifecycle rule
   *  record       the row
   *  nameField    which field names the record ('name', 'username', ...)
   *  kindLabel    what kind of thing it is, already translated
   *  fields       which fields Copy writes out (defaults to all)
   *  onEdit       opens this screen's editor for the record
   *  onSelectAll  selects every row on the screen
   *  onPaste      called with the record held on the internal clipboard
   *  value        the exact cell that was clicked, for "copy this value"
   *  extra        additional items appended to the menu
   */
  const openRecord = useCallback((event, options) => {
    const o = options || {};
    const record = o.record || {};
    const type = o.type || '';
    const nameField = o.nameField || 'name';
    const nameValue = String(record[nameField] ?? '');
    const kind = o.kindLabel || t('contextmenu.record');
    const supported = LIFECYCLE_TYPES.indexOf(type) !== -1;

    const canEdit = o.canEdit === undefined ? hasPermission(o.editPermission || 'contacts:write') : o.canEdit;
    const canDeactivate = supported && hasPermission('records:deactivate');
    const canDelete = supported && hasPermission('records:delete');
    const isActive = o.isActive === undefined ? Number(record.active) !== 0 : o.isActive;

    const handlers = {
      onCopy: async () => {
        const text = recordToText(record, o.fields);
        const ok = await copyText(text);
        if (o.type) holdRecord(type, record, text);
        showToast(ok || text === '' ? t('contextmenu.copied_toast') : t('contextmenu.copy_failed_toast'), ok ? 'success' : 'info');
      },
      onEdit: o.onEdit ? () => o.onEdit(record) : undefined,
      onSelectAll: o.onSelectAll,
      onDeactivate: canDeactivate ? () => lifecycle(type, record, { kind, value: nameValue }, 'DEACTIVATE') : undefined,
      onActivate: canDeactivate ? () => lifecycle(type, record, { kind, value: nameValue }, 'ACTIVATE') : undefined,
      onDelete: canDelete ? () => lifecycle(type, record, { kind, value: nameValue }, 'DELETE') : undefined
    };

    if (o.value !== undefined && o.value !== null && String(o.value) !== '') {
      handlers.onCopyValue = async () => {
        const ok = await copyText(String(o.value));
        showToast(ok ? t('contextmenu.copied_toast') : t('contextmenu.copy_failed_toast'), ok ? 'success' : 'info');
      };
    }

    if (o.onPaste && hasHeldRecord(type)) {
      handlers.onPaste = () => {
        const held = heldRecord();
        o.onPaste(held ? held.record : null);
      };
    }

    const items = buildRecordMenu({
      type,
      can: {
        copy: true,
        cut: false,
        paste: !!handlers.onPaste,
        selectAll: !!handlers.onSelectAll,
        edit: !!canEdit,
        delete: true,
        deactivate: canDeactivate
      },
      isActive,
      isProtected: !supported || o.isProtected === true,
      protectionNote: o.protectionNote || t('contextmenu.protected_note'),
      labels,
      handlers,
      hasClipboard: !!handlers.onPaste
    });

    open(event, (o.extra || []).concat(items));
  }, [hasPermission, labels, lifecycle, open, showToast, t]);

  /**
   * Opens the menu over text — an input, a textarea, or a selection made with
   * the mouse. Cut and Paste appear only where the text can be changed.
   */
  const openText = useCallback((event, options) => {
    const o = options || {};
    const target = event && event.target ? event.target : null;
    const editable = o.editable === undefined ? isEditableTarget(target) : o.editable;
    const selection = o.selection === undefined ? hasTextSelection() : o.selection;

    const focusTarget = () => {
      if (target && typeof target.focus === 'function') target.focus();
    };

    const handlers = {
      onCopy: async () => {
        const text = o.text !== undefined ? String(o.text) : selectedText();
        if (text) {
          const ok = await copyText(text);
          if (!ok) nativeEdit('copy');
          return;
        }
        nativeEdit('copy');
      },
      onCut: () => nativeEdit('cut'),
      onPaste: async () => {
        focusTarget();
        const text = await readText();
        if (text === '' || !insertText(text)) nativeEdit('paste');
      },
      onSelectAll: () => {
        focusTarget();
        if (target && typeof target.select === 'function' && editable) target.select();
        else nativeEdit('selectAll');
      }
    };

    const items = buildTextMenu({
      can: {
        copy: editable ? true : !!selection,
        cut: editable,
        paste: editable,
        // Always offered: "select all relevant information" is one of the
        // eight actions the menu must provide, and it is meaningful over a
        // document as well as over a field.
        selectAll: true
      },
      labels,
      handlers,
      hasClipboard: true
    });

    open(event, (o.extra || []).concat(items));
  }, [labels, open]);

  /**
   * Opens the menu over a list with no record under the pointer — the empty
   * space under the last row, for instance.
   */
  const openList = useCallback((event, options) => {
    const o = options || {};
    const handlers = {
      onSelectAll: o.onSelectAll,
      onCopy: o.records && o.records.length
        ? async () => {
            const ok = await copyText(recordsToText(o.records, o.fields));
            showToast(ok ? t('contextmenu.copied_toast') : t('contextmenu.copy_failed_toast'), ok ? 'success' : 'info');
          }
        : undefined,
      onPaste: o.onPaste && hasHeldRecord(o.type)
        ? () => {
            const held = heldRecord();
            o.onPaste(held ? held.record : null);
          }
        : undefined
    };

    const items = buildListMenu({
      can: {
        selectAll: !!handlers.onSelectAll,
        copy: !!handlers.onCopy,
        paste: !!handlers.onPaste
      },
      labels,
      handlers,
      hasClipboard: !!handlers.onPaste
    });

    open(event, (o.extra || []).concat(items));
  }, [labels, open, showToast, t]);

  return { openRecord, openText, openList, labels };
}

export default useRecordMenu;
