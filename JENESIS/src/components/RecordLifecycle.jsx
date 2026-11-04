import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import { useEscapeLayer } from '../context/ShortcutsContext';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';

/**
 * Record lifecycle — deactivate, reactivate and delete.
 *
 * JENESIS 0.5.4 modification 3. One control, used by Customers, Suppliers,
 * Products, Stores and Users, so the rules live in exactly one place:
 *
 *  - the buttons only appear for a user holding records:deactivate /
 *    records:delete. The server enforces the same rule, so hiding them here is
 *    a convenience and not the defence.
 *  - delete always asks first, and the confirmation names the record.
 *  - if the record carries accounting history the server refuses with 409 and
 *    this component offers deactivation instead, explaining why. History is
 *    never destroyed.
 */

/** Asks the user to confirm, then resolves true/false. */
function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger, onConfirm, onCancel, extra }) {
  const { t } = useI18n();
  // Escape cancels the dialog, consistent with every other modal in the app.
  useEscapeLayer({ id: 'record-confirm', priority: 200, onEscape: () => { onCancel(); return true; } });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3.5">
          <h3 className="font-bold text-sm">{title}</h3>
        </div>
        <div className="p-5 text-xs text-slate-600 space-y-3">
          <p>{body}</p>
          {extra}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${
              danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The three-dot row control. `type` is one of customers, suppliers, products,
 * warehouses or users; `record` is the row, which must carry `id`, `active`
 * and the name field named by `nameField`.
 */
export default function RecordLifecycleControls({
  type,
  record,
  nameField = 'name',
  onChanged,
  className = ''
}) {
  const { t } = useI18n();
  const { hasPermission, showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // { mode, title, body, confirm, run }

  const canDeactivate = hasPermission('records:deactivate');
  const canDelete = hasPermission('records:delete');
  if (!canDeactivate && !canDelete) return null;

  const kind = t(`records.kind_${type === 'warehouses' ? 'store' : type.replace(/s$/, '')}`);
  const name = String(record?.[nameField] ?? '');
  const isActive = Number(record?.active) !== 0;

  const finish = async (result, action) => {
    setDialog(null);
    setBusy(false);
    if (result.revokedSessions > 0) {
      showToast(t('records.user_sessions_ended', { count: result.revokedSessions }), 'success');
    }
    if (action === 'DELETE') showToast(t('records.deleted_toast', { kind, name }), 'success');
    if (action === 'DEACTIVATE') showToast(t('records.deactivated_toast', { kind, name }), 'success');
    if (action === 'REACTIVATE') showToast(t('records.reactivated_toast', { kind, name }), 'success');
    if (onChanged) onChanged();
  };

  const run = async (method, path, action) => {
    setBusy(true);
    try {
      const result = await apiRequest(path, { method });
      await finish(result, action);
    } catch (err) {
      setBusy(false);
      setDialog(null);
      // A record with history is never deleted: offer deactivation instead,
      // using the explanation the server sent.
      if (err && err.status === 409 && err.code === 'HAS_HISTORY') {
        setDialog({
          mode: 'archive',
          title: t('records.archive_instead_title'),
          body: err.message,
          confirm: t('records.deactivate_instead'),
          danger: false,
          run: () => setActiveRecord(false)
        });
        return;
      }
      showToast(err?.message || String(err), 'error');
    }
  };

  const setActiveRecord = (active) => {
    const action = active ? 'REACTIVATE' : 'DEACTIVATE';
    if (active) return run('POST', `/api/records/${type}/${record.id}/reactivate`, action);
    return run('POST', `/api/records/${type}/${record.id}/deactivate`, action);
  };

  const askDeactivate = () => {
    setDialog({
      mode: 'deactivate',
      title: t('records.confirm_deactivate_title', { kind }),
      body: t('records.confirm_deactivate_body', { name }),
      confirm: t('records.deactivate'),
      run: () => setActiveRecord(false)
    });
  };

  const askReactivate = () => {
    setDialog({
      mode: 'reactivate',
      title: t('records.confirm_reactivate_title', { kind }),
      body: t('records.confirm_reactivate_body', { name }),
      confirm: t('records.reactivate'),
      run: () => setActiveRecord(true)
    });
  };

  // The confirmation names the record, as the brief requires: the user is
  // never asked to delete "this row" without being told which one it is.
  const askDelete = () => {
    setDialog({
      mode: 'delete',
      title: t('records.confirm_delete_title', { kind }),
      body: t('records.confirm_delete_body', { name }),
      confirm: t('records.delete'),
      danger: true,
      run: () => run('DELETE', `/api/records/${type}/${record.id}`, 'DELETE')
    });
  };

  return (
    <>
      <div className={`inline-flex items-center gap-1 ${className}`}>
        {isActive ? (
          canDeactivate && (
            <button
              type="button"
              disabled={busy}
              onClick={askDeactivate}
              title={t('records.deactivate')}
              aria-label={t('records.deactivate')}
              className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition disabled:opacity-40"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )
        ) : (
          canDeactivate && (
            <button
              type="button"
              disabled={busy}
              onClick={askReactivate}
              title={t('records.reactivate')}
              aria-label={t('records.reactivate')}
              className="p-1 rounded text-amber-600 hover:text-emerald-600 hover:bg-emerald-50 transition disabled:opacity-40"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
            </button>
          )
        )}
        {canDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={askDelete}
            title={t('records.delete')}
            aria-label={t('records.delete')}
            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirm}
          danger={dialog.danger}
          onCancel={() => setDialog(null)}
          onConfirm={dialog.run}
        />
      )}
    </>
  );
}

/**
 * The Active / Inactive / All filter. Returned as a standalone component so
 * each screen can place it in its own toolbar.
 */
export function RecordStatusFilter({ value, onChange }) {
  const { t } = useI18n();
  const options = [
    { value: 'active', label: t('records.filter_active') },
    { value: 'inactive', label: t('records.filter_inactive') },
    { value: 'all', label: t('records.filter_all') }
  ];
  return (
    <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden" role="group" aria-label={t('records.filter_label')}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`px-2.5 py-1 text-[11px] font-semibold transition ${
            value === opt.value
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Small "Inactive" badge for a row. */
export function InactiveBadge() {
  const { t } = useI18n();
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
      {t('records.inactive_badge')}
    </span>
  );
}
