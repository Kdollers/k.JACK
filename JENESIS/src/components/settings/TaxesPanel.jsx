import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { apiRequest, translateError } from '../../services/api';
import { useEscapeLayer } from '../../context/ShortcutsContext';
import { useRecordMenu } from '../../contextmenu/useRecordMenu';
import { Percent, Plus, Pencil, X, AlertTriangle } from 'lucide-react';

/**
 * Tax rates — created, edited, deactivated, reactivated and deleted here, and
 * nowhere else.
 *
 * This is JENESIS Settings & Access Point, the yellow application, and tax
 * rates are its business. Two rules shape every action on this screen:
 *
 *  1. A rate that has been used is never destroyed. Every invoice and bill line
 *     stores the rate that applied at the time, so the documents are already
 *     safe — and the server refuses the delete with 409 TAX_IN_USE, naming
 *     where the rate was used. This screen then offers deactivation instead,
 *     which is what the user actually wanted.
 *  2. Deactivation changes nothing historical. It only removes the rate from
 *     the list offered for NEW transactions, which is why the list on this
 *     screen has an Active / Inactive / All switch: a retired rate stays
 *     visible here so it can be brought back.
 */

const EMPTY = { code: '', name: '', rate: 18 };

export default function TaxesPanel() {
  const { showToast } = useApp();
  const { t } = useI18n();
  const recordMenu = useRecordMenu();

  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('active');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [ask, setAsk] = useState(null); // { title, message, confirm, run }

  const fetchRates = useCallback(async () => {
    setLoading(true);
    try {
      // ?status=all: this screen has to be able to see retired rates in order
      // to reactivate them. Every OTHER caller of /api/taxes gets the active
      // ones only, which is what keeps a deactivated rate off new invoices.
      setRates(await apiRequest(`/api/taxes?status=${status}`));
    } catch (err) {
      showToast(translateError(t, err), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, status, t]);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  useEscapeLayer({
    id: 'tax-form',
    priority: 150,
    active: showForm,
    onEscape: () => { closeForm(); return true; }
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setShowForm(true);
  };

  const openEdit = (rate) => {
    setEditingId(rate.id);
    setForm({ code: rate.code || '', name: rate.name || '', rate: rate.rate });
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        await apiRequest(`/api/taxes/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        showToast(t('settings.tax_updated_toast'), 'success');
      } else {
        await apiRequest('/api/taxes', { method: 'POST', body: JSON.stringify(form) });
        showToast(t('settings.tax_created_toast'), 'success');
      }
      closeForm();
      fetchRates();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const setActive = async (rate, active) => {
    try {
      await apiRequest(`/api/taxes/${rate.id}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' });
      showToast(active ? t('settings.tax_reactivated_toast') : t('settings.tax_deactivated_toast'), 'success');
      fetchRates();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const remove = async (rate) => {
    try {
      await apiRequest(`/api/taxes/${rate.id}`, { method: 'DELETE' });
      showToast(t('settings.tax_deleted_toast'), 'success');
      fetchRates();
    } catch (err) {
      // The rate is part of the company's history. Deactivation is offered
      // with the server's own explanation, which names where it was used.
      if (err && err.status === 409 && err.code === 'TAX_IN_USE') {
        setAsk({
          title: t('settings.tax_in_use_title'),
          message: err.message,
          confirm: t('settings.tax_deactivate_instead'),
          run: () => { setAsk(null); setActive(rate, false); }
        });
        return;
      }
      showToast(translateError(t, err), 'error');
    }
  };

  const askDeactivate = (rate) => setAsk({
    title: t('settings.tax_confirm_deactivate_title'),
    message: t('settings.tax_confirm_deactivate_body', { code: rate.code }),
    confirm: t('settings.tax_deactivate'),
    run: () => { setAsk(null); setActive(rate, false); }
  });

  const askDelete = (rate) => setAsk({
    title: t('settings.tax_confirm_delete_title'),
    message: t('settings.tax_confirm_delete_body', { code: rate.code }),
    confirm: t('settings.tax_delete'),
    run: () => { setAsk(null); remove(rate); }
  });

  const isActive = (rate) => Number(rate.active) !== 0;

  return (
    <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-line bg-surface-muted flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">{t('settings.tab_taxes')}</h2>
          <p className="text-[11px] text-[rgb(var(--j-ink-muted))]">{t('settings.taxes_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface border border-line rounded-lg text-[11px] font-semibold overflow-hidden">
            {['active', 'inactive', 'all'].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={`px-2.5 py-1.5 ${status === value ? 'j-bg text-white' : 'j-text hover:bg-surface-hover'}`}
              >
                {t(`settings.tax_filter_${value}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="j-bg hover:opacity-90 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 shadow j-ring"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('settings.add_tax_rate')}</span>
          </button>
        </div>
      </div>

      <table className="w-full text-left text-xs">
        <thead className="bg-surface-muted text-[rgb(var(--j-ink-muted))] uppercase text-[10px] font-bold border-b border-line">
          <tr>
            <th className="py-2.5 px-4">{t('common.code')}</th>
            <th className="py-2.5 px-4">{t('common.name')}</th>
            <th className="py-2.5 px-4 text-right">{t('settings.tax_rate_percent')}</th>
            <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
            <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rates.length > 0 ? rates.map((rate) => (
            <tr
              key={rate.id}
              className="border-b border-line/60 hover:bg-surface-hover"
              onContextMenu={(event) => recordMenu.openRecord(event, {
                type: 'taxes',
                record: rate,
                nameField: 'code',
                kindLabel: t('settings.tax_rate'),
                editPermission: 'accounting:write',
                fields: ['code', 'name', 'rate', 'is_inclusive', 'active'],
                onEdit: openEdit
              })}
            >
              <td className="py-3 px-4 font-mono font-bold j-text">{rate.code}</td>
              <td className="py-3 px-4 font-semibold">{rate.name}</td>
              <td className="py-3 px-4 text-right font-mono font-bold">{rate.rate}%</td>
              <td className="py-3 px-4 text-center">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                  isActive(rate) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isActive(rate) ? t('common.active') : t('common.inactive')}
                </span>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(rate)}
                    title={t('contextmenu.edit')}
                    className="px-2 py-1 rounded border border-line hover:bg-surface-hover j-ring"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {isActive(rate) ? (
                    <button
                      type="button"
                      onClick={() => askDeactivate(rate)}
                      className="px-2 py-1 rounded border border-line text-[10px] font-semibold hover:bg-surface-hover j-ring"
                    >
                      {t('settings.tax_deactivate')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActive(rate, true)}
                      className="px-2 py-1 rounded border border-emerald-300 text-emerald-700 text-[10px] font-semibold hover:bg-emerald-50 j-ring"
                    >
                      {t('settings.tax_reactivate')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => askDelete(rate)}
                    title={t('contextmenu.delete')}
                    className="px-2 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 j-ring"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={5} className="py-10 text-center text-[rgb(var(--j-ink-subtle))]">
                {loading ? t('common.loading') : t('settings.tax_none')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="px-4 py-3 border-t border-line text-[10px] text-[rgb(var(--j-ink-subtle))]">
        {t('settings.tax_history_note')}
      </p>

      {/* Create / edit */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Percent className="w-4 h-4 j-text" />
                <span>{editingId ? t('settings.tax_edit_title') : t('settings.add_tax_rate')}</span>
              </h3>
              <button type="button" onClick={closeForm} className="text-[rgb(var(--j-ink-muted))] hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={save} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[rgb(var(--j-ink-muted))] font-semibold mb-1">{t('common.code')} *</label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring font-mono"
                    placeholder={t('settings.tax_code_placeholder')}
                  />
                </div>
                <div>
                  <label className="block text-[rgb(var(--j-ink-muted))] font-semibold mb-1">{t('settings.tax_rate_percent')} *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[rgb(var(--j-ink-muted))] font-semibold mb-1">{t('common.name')} *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring"
                  placeholder={t('settings.tax_desc_placeholder')}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-3 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-surface-hover"
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="px-4 py-1.5 rounded-md text-xs font-semibold text-white j-bg hover:opacity-90 j-ring">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation, and the offer to deactivate instead of delete */}
      {ask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="px-5 pt-5 flex items-start space-x-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-sm">{ask.title}</h3>
                <p className="text-xs text-[rgb(var(--j-ink-muted))] mt-1">{ask.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => setAsk(null)}
                className="px-3 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-surface-hover"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={ask.run}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500"
              >
                {ask.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
