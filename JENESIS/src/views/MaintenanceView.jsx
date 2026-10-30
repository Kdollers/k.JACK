import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest, getServerUrl, setServerUrl } from '../services/api';
import {
  Activity,
  Database,
  HardDriveDownload,
  Network,
  RefreshCw,
  ShieldCheck,
  ScrollText,
  AlertTriangle,
  CheckCircle2,
  Plug,
  Server
} from 'lucide-react';

/**
 * MaintenanceView — the home of the JENESIS Maintenance application.
 *
 * Everything here does real work against the running service:
 *   - the state of the service and the database file,
 *   - whether other computers may reach this service (Messenger and shared
 *     company data across the network),
 *   - which service this computer uses,
 *   - verified database copies, integrity checks and the service log.
 *
 * Nothing on this screen deletes or rewrites business data.
 */
export default function MaintenanceView() {
  const { showToast, refreshKey } = useApp();
  const { t } = useI18n();

  const [info, setInfo] = useState(null);
  const [network, setNetwork] = useState(null);
  const [logs, setLogs] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [busy, setBusy] = useState('');
  const [serverAddress, setServerAddress] = useState(() => getServerUrl());
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const [systemInfo, networkInfo] = await Promise.all([
        apiRequest('/api/system/info'),
        apiRequest('/api/system/network')
      ]);
      setInfo(systemInfo);
      setNetwork(networkInfo);
    } catch (err) {
      showToast(err.message || String(err), 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const guard = (promise, label) => {
    setBusy(label);
    return promise
      .catch((err) => showToast(err.message || String(err), 'error'))
      .finally(() => setBusy(''));
  };

  const toggleLan = (allow) => guard(
    apiRequest('/api/system/network', {
      method: 'POST',
      body: JSON.stringify({ allowLan: allow })
    }).then(async (res) => {
      setNetwork(res);
      // The service binds its address when it starts, so it has to restart for
      // the change to take effect. The desktop shell does that for the user.
      const restarted = await restartService();
      showToast(
        restarted
          ? (allow ? t('maintenance.lan_on_restarted') : t('maintenance.lan_off_restarted'))
          : t('maintenance.restart_needed'),
        restarted ? 'success' : 'info'
      );
      if (restarted) load();
    }),
    'network'
  );

  const testAddress = () => guard(
    (async () => {
      const url = String(serverAddress || '').trim().replace(/\/+$/, '');
      if (!url) return setTestResult({ ok: false, message: t('maintenance.address_placeholder') });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${url}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        const body = await res.json().catch(() => null);
        const ok = res.ok && body && body.appId === 'genesis-accounting';
        setTestResult({ ok, message: ok ? t('maintenance.test_ok') : t('maintenance.test_bad') });
        return undefined;
      } catch (err) {
        clearTimeout(timer);
        setTestResult({ ok: false, message: `${t('maintenance.test_failed')} (${err.message})` });
        return undefined;
      }
    })(),
    'test'
  );

  const applyAddress = () => {
    const url = String(serverAddress || '').trim().replace(/\/+$/, '');
    setServerUrl(url);
    showToast(
      url ? t('maintenance.using_remote', { url }) : t('maintenance.using_local'),
      'success'
    );
  };

  const createBackup = () => guard(
    apiRequest('/api/system/backup', { method: 'POST' }).then((res) => {
      showToast(t('maintenance.backup_done', { file: res.file }), 'success');
      load();
    }),
    'backup'
  );

  const runIntegrity = () => guard(
    apiRequest('/api/system/integrity', { method: 'POST' }).then(setIntegrity),
    'integrity'
  );

  const loadLogs = () => guard(
    apiRequest('/api/system/logs?lines=80').then(setLogs),
    'logs'
  );

  const bytes = (n) => (n == null ? '—' : `${(n / 1024 / 1024).toFixed(1)} MB`);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold flex items-center space-x-2">
          <Activity className="w-5 h-5 j-text" />
          <span>{t('maintenance.title')}</span>
        </h1>
        <p className="text-xs text-[rgb(var(--j-ink-muted))] mt-1">{t('maintenance.intro')}</p>
      </header>

      {/* Service and database ------------------------------------------------ */}
      <section className="bg-surface border border-line rounded-xl p-5">
        <h2 className="text-sm font-bold flex items-center space-x-2 mb-3">
          <Server className="w-4 h-4 j-text" />
          <span>{t('maintenance.service')}</span>
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <Row label={t('maintenance.version')} value={info?.version || '—'} />
          <Row label={t('maintenance.started')} value={info?.startedAt ? new Date(info.startedAt).toLocaleString() : '—'} />
          <Row label={t('maintenance.database')} value={info?.database?.path || '—'} mono />
          <Row label={t('maintenance.database_size')} value={bytes(info?.database?.size)} />
          <Row label={t('maintenance.data_folder')} value={info?.dataDirectory || '—'} mono />
          <Row label={t('maintenance.backups_kept')} value={info ? String(info.backupCount) : '—'} />
        </dl>
      </section>

      {/* Network ------------------------------------------------------------- */}
      <section className="bg-surface border border-line rounded-xl p-5">
        <h2 className="text-sm font-bold flex items-center space-x-2 mb-3">
          <Network className="w-4 h-4 j-text" />
          <span>{t('maintenance.network')}</span>
        </h2>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="text-xs text-[rgb(var(--j-ink-muted))] max-w-xl">
            <p>{t('maintenance.allow_lan_hint')}</p>
            {network?.addresses?.length > 0 && (
              <p className="mt-2">
                <span className="font-semibold">{t('maintenance.this_computer')}:</span>{' '}
                {network.addresses.map((a) => (
                  <code key={a} className="font-mono j-text">{a}</code>
                )).reduce((prev, cur, i) => (i === 0 ? [cur] : [...prev, ', ', cur]), [])}
              </p>
            )}
          </div>
          <div className="shrink-0">
            {network?.allowLan ? (
              <button
                type="button"
                onClick={() => toggleLan(false)}
                disabled={busy === 'network'}
                className="px-3 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-surface-hover"
              >
                {t('maintenance.disable_lan')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toggleLan(true)}
                disabled={busy === 'network'}
                className="px-3 py-1.5 rounded-md text-white text-xs font-semibold j-bg hover:opacity-90"
              >
                {t('maintenance.enable_lan')}
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-xs font-bold flex items-center space-x-2 mb-2">
            <Plug className="w-4 h-4 j-text" />
            <span>{t('maintenance.connect_another')}</span>
          </h3>
          <p className="text-xs text-[rgb(var(--j-ink-muted))] mb-2">{t('maintenance.connect_hint')}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={serverAddress}
              onChange={(e) => { setServerAddress(e.target.value); setTestResult(null); }}
              placeholder={t('maintenance.address_placeholder')}
              className="flex-1 px-3 py-1.5 border border-line rounded-md bg-surface text-xs font-mono focus:outline-none focus:ring-1 j-ring"
            />
            <button
              type="button"
              onClick={testAddress}
              disabled={busy === 'test'}
              className="px-3 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-surface-hover"
            >
              {t('maintenance.test')}
            </button>
            <button
              type="button"
              onClick={applyAddress}
              className="px-3 py-1.5 rounded-md text-white text-xs font-semibold j-bg hover:opacity-90"
            >
              {t('maintenance.apply')}
            </button>
          </div>
          {testResult && (
            <p className={`mt-2 text-xs flex items-center space-x-1 ${testResult.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
              {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              <span>{testResult.message}</span>
            </p>
          )}
        </div>
      </section>

      {/* Backups, checks and logs -------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="text-sm font-bold flex items-center space-x-2 mb-3">
            <HardDriveDownload className="w-4 h-4 j-text" />
            <span>{t('maintenance.backups')}</span>
          </h2>
          <p className="text-xs text-[rgb(var(--j-ink-muted))] mb-3">{t('maintenance.backups_hint')}</p>
          <button
            type="button"
            onClick={createBackup}
            disabled={busy === 'backup'}
            className="w-full px-3 py-1.5 rounded-md text-white text-xs font-semibold j-bg hover:opacity-90"
          >
            {t('maintenance.create_backup')}
          </button>
          {info?.backups?.length > 0 && (
            <ul className="mt-3 space-y-1 text-[11px] text-[rgb(var(--j-ink-muted))] max-h-40 overflow-y-auto">
              {info.backups.slice(0, 8).map((b) => (
                <li key={b.name} className="font-mono truncate">{b.name} · {bytes(b.size)}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="text-sm font-bold flex items-center space-x-2 mb-3">
            <ShieldCheck className="w-4 h-4 j-text" />
            <span>{t('maintenance.checks')}</span>
          </h2>
          <button
            type="button"
            onClick={runIntegrity}
            disabled={busy === 'integrity'}
            className="w-full px-3 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-surface-hover flex items-center justify-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('maintenance.run_check')}</span>
          </button>
          {integrity && (
            <div className="mt-3 text-xs space-y-1">
              <p className={integrity.ok ? 'text-emerald-600' : 'text-amber-600'}>
                {integrity.ok ? t('maintenance.check_ok') : t('maintenance.check_problem')}
              </p>
              <p className="font-mono text-[11px] text-[rgb(var(--j-ink-muted))] break-words">{integrity.integrity}</p>
              <p className="text-[11px] text-[rgb(var(--j-ink-muted))]">
                {t('maintenance.foreign_keys')}: {integrity.foreignKeyViolations} ·{' '}
                {t('maintenance.posted_entries')}: {integrity.postedEntries}
              </p>
            </div>
          )}
        </section>

        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="text-sm font-bold flex items-center space-x-2 mb-3">
            <ScrollText className="w-4 h-4 j-text" />
            <span>{t('maintenance.logs')}</span>
          </h2>
          <button
            type="button"
            onClick={loadLogs}
            disabled={busy === 'logs'}
            className="w-full px-3 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-surface-hover"
          >
            {t('maintenance.read_logs')}
          </button>
          {logs?.files?.length > 0 && (
            <div className="mt-3 space-y-3 max-h-56 overflow-y-auto">
              {logs.files.map((file) => (
                <div key={file.name}>
                  <div className="text-[11px] font-semibold flex items-center space-x-1">
                    <Database className="w-3 h-3 j-text" />
                    <span>{file.name}</span>
                  </div>
                  <pre className="mt-1 text-[10px] font-mono text-[rgb(var(--j-ink-muted))] whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-surface-muted p-2 rounded">
                    {file.lines.join('\n')}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-[rgb(var(--j-ink-subtle))]">{label}</dt>
      <dd className={`font-semibold break-all ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</dd>
    </div>
  );
}

/**
 * Asks the desktop shell to restart the local service (the network switch needs
 * a fresh bind). Returns false when JENESIS is running in a browser, where the
 * user restarts the application instead.
 */
async function restartService() {
  try {
    const bridge = window.genesisDesktop || window.jenesisDesktop;
    if (bridge && typeof bridge.restartBackend === 'function') {
      const ok = await bridge.restartBackend();
      return Boolean(ok);
    }
  } catch (_) { /* not running as a desktop application */ }
  return false;
}
