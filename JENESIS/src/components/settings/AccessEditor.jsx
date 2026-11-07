import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { useApp } from '../../context/AppContext';
import { apiRequest, translateError } from '../../services/api';
import { useEscapeLayer } from '../../context/ShortcutsContext';
import { ShieldCheck, X, RotateCcw } from 'lucide-react';

/**
 * The Access Point itself.
 *
 * Two decisions about one person:
 *
 *  WHICH APPLICATIONS they may open. Four switches. Turning one off takes
 *  effect on their very next request — the service asks the same question of
 *  every call that names an application, so a window pointed at an application
 *  closed to them is refused even if they never restart it.
 *
 *  WHICH PERMISSIONS they hold beyond their role. A tick adds one their role
 *  did not have; a cross removes one it did. Neither is written into the role
 *  itself, so changing a role later does not quietly undo what was decided
 *  here, and clearing both lists returns the person to exactly their role.
 *
 * The catalogue of applications, roles and permissions is read from the
 * service, not kept in this file. A list kept only in the interface would
 * drift from the one the service enforces, and then a box could be ticked
 * that means nothing at all.
 */

export default function AccessEditor({ user, onClose, onSaved }) {
  const { t } = useI18n();
  const { showToast } = useApp();

  const [catalogue, setCatalogue] = useState({ apps: [], roles: [], permissions: [] });
  const [access, setAccess] = useState(null);
  const [grants, setGrants] = useState([]);
  const [revokes, setRevokes] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEscapeLayer({ id: 'access-editor', priority: 160, onEscape: () => { onClose(); return true; } });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, current] = await Promise.all([
          apiRequest('/api/auth/access-catalogue'),
          apiRequest(`/api/auth/users/${user.id}/access`)
        ]);
        if (cancelled) return;
        setCatalogue(cat);
        setAccess(current.apps || {});
        setGrants((current.overrides && current.overrides.grants) || []);
        setRevokes((current.overrides && current.overrides.revokes) || []);
        setRolePermissions(current.permissions || []);
      } catch (err) {
        if (!cancelled) showToast(translateError(t, err), 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [user.id, showToast, t]);

  const toggleApp = (appId) => setAccess((prev) => ({ ...(prev || {}), [appId]: !(prev && prev[appId] !== false) }));

  /**
   * Grant, revoke, or clear back to the role.
   *
   * A permission their role already carries cannot be granted — there is
   * nothing to add — and is shown as such, rather than ticking a box that
   * changes nothing and pretending it did.
   */
  const cycle = (permission) => {
    if (grants.includes(permission)) setGrants(grants.filter((p) => p !== permission));
    else if (revokes.includes(permission)) setRevokes(revokes.filter((p) => p !== permission));
    else if (rolePermissions.includes(permission)) setRevokes([...revokes, permission]);
    else setGrants([...grants, permission]);
  };

  const stateOf = (permission) => {
    if (grants.includes(permission)) return 'grant';
    if (revokes.includes(permission)) return 'revoke';
    return rolePermissions.includes(permission) ? 'role' : 'none';
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await apiRequest(`/api/auth/users/${user.id}/access`, {
        method: 'PUT',
        body: JSON.stringify({ apps: access, grants, revokes, clearOverrides: true })
      });
      showToast(t('settings.access_saved_toast', {
        username: user.username,
        sessions: result && result.revokedSessions ? result.revokedSessions : 0
      }), 'success');
      onSaved();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetToRole = () => { setGrants([]); setRevokes([]); };

  const STATE_STYLE = {
    role: 'border-line bg-surface text-[rgb(var(--j-ink-muted))]',
    grant: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    revoke: 'border-rose-300 bg-rose-50 text-rose-700',
    none: 'border-line bg-surface text-[rgb(var(--j-ink-subtle))]'
  };
  const STATE_MARK = { role: 'Role', grant: '+', revoke: '−', none: '' };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 j-text" />
            <span>{t('settings.manage_access')} — {user.username}</span>
          </h3>
          <button type="button" onClick={onClose} className="text-[rgb(var(--j-ink-muted))] hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto text-xs">
          {/* Which applications */}
          <section>
            <h4 className="font-bold text-xs mb-2">{t('settings.access_applications')}</h4>
            <p className="text-[10px] text-[rgb(var(--j-ink-subtle))] mb-2">{t('settings.access_applications_hint')}</p>
            <div className="grid grid-cols-2 gap-2">
              {(catalogue.apps || []).map((appId) => {
                const allowed = access ? access[appId] !== false : true;
                return (
                  <button
                    key={appId}
                    type="button"
                    onClick={() => toggleApp(appId)}
                    className={`px-3 py-2 rounded-lg border text-left font-semibold transition ${
                      allowed ? 'j-bg-soft j-text border-[rgb(var(--j-accent))/0.4]' : 'border-line text-[rgb(var(--j-ink-subtle))]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{t(`identity.${appId}_name`)}</span>
                      <span className="text-[10px] font-bold uppercase">
                        {allowed ? t('common.active') : t('common.inactive')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Which permissions */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-xs">{t('settings.access_permissions')}</h4>
              <button
                type="button"
                onClick={resetToRole}
                className="px-2 py-1 rounded border border-line text-[10px] font-semibold hover:bg-surface-hover inline-flex items-center space-x-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('settings.access_reset')}</span>
              </button>
            </div>
            <p className="text-[10px] text-[rgb(var(--j-ink-subtle))] mb-2">{t('settings.access_permissions_hint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {(catalogue.permissions || []).map((permission) => {
                const state = stateOf(permission);
                return (
                  <button
                    key={permission}
                    type="button"
                    onClick={() => cycle(permission)}
                    className={`px-2.5 py-1.5 rounded-md border text-left font-mono text-[10px] transition ${STATE_STYLE[state]}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="truncate">{permission}</span>
                      <span className="ml-2 font-sans font-bold">{STATE_MARK[state]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-surface-hover"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-xs font-semibold text-white j-bg hover:opacity-90 disabled:opacity-50 j-ring"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
