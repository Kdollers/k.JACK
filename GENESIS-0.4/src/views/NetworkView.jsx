import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest, downloadAuthenticated } from '../services/api';
import { Activity, DatabaseBackup, Download, RefreshCw, ShieldCheck } from 'lucide-react';

export default function NetworkView() {
  const { hasPermission, showToast, formatDateTime, logout } = useApp();
  const { t } = useI18n();
  const [health, setHealth] = useState(null);
  const [working, setWorking] = useState(false);
  const [restore, setRestore] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const refresh = async () => {
    try { setHealth(await apiRequest('/api/network/health')); }
    catch (err) { showToast(err, 'error'); }
  };
  useEffect(() => { refresh(); }, []);
  const snapshot = async () => {
    setWorking(true);
    try {
      const result = await apiRequest('/api/network/snapshot', { method: 'POST' });
      showToast({ key: 'network.snapshot_done', params: { name: result.name } }, 'success');
      refresh();
    } catch (err) { showToast(err, 'error'); }
    finally { setWorking(false); }
  };
  const exportBackup = async () => {
    try { await downloadAuthenticated('/api/backup/export', 'jenesis-company-backup.json'); }
    catch (err) { showToast(err, 'error'); }
  };
  const submitRestore = async () => {
    if (!restore || confirmation !== 'RESTORE' || !password) return;
    setWorking(true);
    try {
      await apiRequest('/api/backup/import', { method: 'POST',
        body: JSON.stringify({ backup: restore, password, confirm: confirmation }) });
      setRestore(null); setPassword(''); setConfirmation('');
      showToast({ key: 'settings.restore_done' }, 'success');
      await logout();
    } catch (err) { showToast(err, 'error'); }
    finally { setWorking(false); }
  };
  return <div className="space-y-5 max-w-4xl">
    <div className="border-b border-green-200 pb-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('network.title')}</h1>
      <p className="text-sm text-slate-600 mt-1">{t('network.subtitle')}</p>
    </div>
    <div className="bg-white rounded-xl border border-green-100 p-5 space-y-3">
      <h2 className="font-bold text-green-800 flex items-center gap-2"><Activity size={18} />{t('network.health_title')}</h2>
      <p className="text-sm">{t('network.service_status')}: <strong>{health?.status === 'healthy' ? t('network.healthy') : t('network.unknown')}</strong></p>
      <p className="text-sm">{t('network.database_check')}: <strong>{health?.database === 'ok' ? t('network.check_ok') : t('network.unknown')}</strong></p>
      <p className="text-sm">{t('network.foreign_keys')}: <strong>{health ? (health.foreign_keys ? t('common.active') : t('common.inactive')) : t('network.unknown')}</strong></p>
      <p className="text-sm">{t('about.version', { version: health?.version || '—' })}</p>
      {health?.timestamp && <p className="text-xs text-slate-500">{formatDateTime(health.timestamp)}</p>}
      <button type="button" onClick={refresh} className="bg-green-700 text-white rounded-md px-4 py-2 text-sm flex items-center gap-2">
        <RefreshCw size={16} />{t('network.refresh')}
      </button>
    </div>
    <div className="bg-white rounded-xl border border-green-100 p-5 space-y-3">
      <h2 className="font-bold text-green-800 flex items-center gap-2"><DatabaseBackup size={18} />{t('network.safety_copies')}</h2>
      <p className="text-xs text-slate-600">{t('network.snapshot_help')}</p>
      {hasPermission('network:manage') && <button type="button" onClick={snapshot} disabled={working}
        className="bg-green-700 disabled:opacity-50 text-white rounded-md px-4 py-2 text-sm">
        {t('network.create_snapshot')}
      </button>}
      {hasPermission('backup:export') && <button type="button" onClick={exportBackup}
        className="ml-2 bg-slate-800 text-white rounded-md px-4 py-2 text-sm inline-flex items-center gap-2">
        <Download size={16} />{t('settings.download_backup')}
      </button>}
    </div>
    {hasPermission('backup:restore') && <div className="bg-white rounded-xl border border-amber-200 p-5 space-y-3">
      <h2 className="font-bold text-amber-800 flex items-center gap-2"><ShieldCheck size={18} />{t('settings.restore_backup')}</h2>
      <p className="text-xs text-amber-900">{t('settings.restore_warning')}</p>
      <label className="block text-sm">{t('settings.restore_choose_file')}
        <input className="block mt-2 text-xs" type="file" accept=".json" onChange={async (e) => {
          try { setRestore(JSON.parse(await e.target.files[0].text())); }
          catch { setRestore(null); showToast({ key: 'settings.restore_invalid_file' }, 'error'); }
        }} />
      </label>
      {restore && <div className="space-y-3">
        <p className="text-xs text-red-800">{t('settings.restore_signout_notice')}</p>
        <label className="block text-sm">{t('settings.restore_password_label')}
          <input className="block w-full border rounded px-2 py-1" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm">{t('settings.restore_type_confirm')}
          <input className="block w-full border rounded px-2 py-1" value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        <button type="button" disabled={working || !password || confirmation !== 'RESTORE'} onClick={submitRestore}
          className="bg-red-700 disabled:opacity-50 text-white rounded-md px-4 py-2 text-sm">
          {t('settings.restore_confirm_button')}
        </button>
      </div>}
    </div>}
    <p className="text-xs text-slate-500">{t('network.lan_unavailable')}</p>
  </div>;
}
