import React from 'react';
import { useI18n } from '../i18n';
import { Trash2 } from 'lucide-react';

/**
 * The list of the other JENESIS computers, and what can be done with each one.
 *
 * It is deliberately a component of its own, separate from the screen that
 * feeds it: the list is the part that shows real data, so it is the part worth
 * drawing on its own in a test, with computers in every state — answering,
 * switched off, connected, never checked.
 */
export function StatusBadge({ status }) {
  const { t } = useI18n();
  const online = status === 'ONLINE';
  return (
    <span
      data-testid="computer-status"
      data-status={status || 'UNKNOWN'}
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
        online ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {online ? t('maintenance.status') : t(`maintenance.diag_${status || 'UNKNOWN'}`).split('.')[0]}
    </span>
  );
}

export default function NetworkComputers({
  computers = [],
  busy = '',
  canManage = false,
  onTest,
  onConnect,
  onDisconnect,
  onForget
}) {
  const { t } = useI18n();

  if (!computers.length) {
    return (
      <p data-testid="computers-empty" className="text-xs text-[rgb(var(--j-ink-muted))]">
        {t('maintenance.no_computers')}
      </p>
    );
  }

  return (
    <ul data-testid="computers-list" className="divide-y divide-line">
      {computers.map((computer) => (
        <li key={computer.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-xs font-semibold truncate">{computer.name}</span>
              {computer.connected && (
                <span data-testid="computer-connected" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  {t('maintenance.connected')}
                </span>
              )}
              <StatusBadge status={computer.lastStatus} />
            </div>
            <p className="text-[11px] font-mono text-[rgb(var(--j-ink-muted))]">
              {computer.address}:{computer.port}
            </p>
            <p className="text-[11px] text-[rgb(var(--j-ink-subtle))]">
              {t(`maintenance.diag_${computer.lastStatus || 'UNKNOWN'}`)}
              {' · '}
              {t('maintenance.last_seen')}: {computer.lastSeenAt
                ? new Date(computer.lastSeenAt).toLocaleString()
                : t('maintenance.never_seen')}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onTest && onTest(computer.id)}
              disabled={busy === computer.id}
              className="px-2 py-1 rounded border border-line text-[11px] font-semibold hover:bg-surface-hover"
            >
              {t('maintenance.test')}
            </button>
            {canManage && (computer.connected ? (
              <>
                <button
                  type="button"
                  onClick={() => onDisconnect && onDisconnect(computer)}
                  disabled={busy === computer.id}
                  className="px-2 py-1 rounded border border-line text-[11px] font-semibold hover:bg-surface-hover"
                >
                  {t('maintenance.disconnect')}
                </button>
                <button
                  type="button"
                  onClick={() => onConnect && onConnect(computer)}
                  disabled={busy === computer.id}
                  className="px-2 py-1 rounded border border-line text-[11px] font-semibold hover:bg-surface-hover"
                >
                  {t('maintenance.reconnect')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onConnect && onConnect(computer)}
                disabled={busy === computer.id}
                className="px-2 py-1 rounded text-white text-[11px] font-semibold j-bg hover:opacity-90"
              >
                {t('maintenance.connect')}
              </button>
            ))}
            {canManage && (
              <button
                type="button"
                onClick={() => onForget && onForget(computer)}
                disabled={busy === computer.id}
                aria-label={t('maintenance.forget')}
                className="px-2 py-1 rounded border border-line text-[11px] font-semibold hover:bg-surface-hover text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
