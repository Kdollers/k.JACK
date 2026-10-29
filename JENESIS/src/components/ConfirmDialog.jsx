import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../i18n';
import { useEscapeLayer } from '../context/ShortcutsContext';

/**
 * Small confirmation dialog used when a shortcut (Esc) would discard unsaved
 * work. Escape here confirms the "keep editing" path, so a user who hammers Esc
 * never loses data by accident.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}) {
  const { t } = useI18n();

  useEscapeLayer({
    id: 'confirm-dialog',
    priority: 120,
    active: !!open,
    onEscape: () => { onCancel?.(); return true; }
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" role="alertdialog" aria-label={title}>
        <div className="px-5 pt-5 flex items-start space-x-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-800">{title}</h3>
            <p className="text-xs text-slate-600 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end space-x-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500"
          >
            {confirmLabel || t('common.confirm_title')}
          </button>
        </div>
      </div>
    </div>
  );
}
