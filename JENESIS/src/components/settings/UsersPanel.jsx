import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { apiRequest, translateError } from '../../services/api';
import { useEscapeLayer } from '../../context/ShortcutsContext';
import { useRecordMenu } from '../../contextmenu/useRecordMenu';
import RecordLifecycleControls, { RecordStatusFilter } from '../RecordLifecycle';
import AccessEditor from './AccessEditor';
import { Users, Plus, Pencil, KeyRound, Trash2, X, ShieldCheck, AlertTriangle } from 'lucide-react';

/**
 * User accounts — the Access Point.
 *
 * JENESIS Settings & Access Point is where an account is created, renamed,
 * given a password, given a role, closed, reopened, and (only when it has
 * never been used) removed for good.
 *
 * Two things are enforced by the service rather than by this screen, and the
 * screen is written to show the service's answer rather than to guess it:
 *
 *  - An account that appears in the audit trail, or that has signed in, cannot
 *    be deleted. It is part of the company's history. The server answers 409
 *    USER_HAS_HISTORY and this screen offers deactivation, which stops access
 *    at once and keeps the record readable.
 *  - Nobody may remove their own administrator rights, disable their own
 *    account, or leave the company with no active administrator.
 *
 * Which of the four applications an account may open, and which permissions it
 * holds beyond its role, are edited in the Access Editor beside this list.
 */

const EMPTY_USER = { username: '', full_name: '', email: '', role: 'accountant', password: '' };

export default function UsersPanel() {
  const { showToast, triggerRefresh, currentUser } = useApp();
  const { t } = useI18n();
  const recordMenu = useRecordMenu();

  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('active');
  const [roles, setRoles] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);

  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const [accessTarget, setAccessTarget] = useState(null);
  const [ask, setAsk] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      setUsers(await apiRequest(`/api/auth/users?status=${status}`));
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  }, [showToast, status, t]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    apiRequest('/api/auth/access-catalogue')
      .then((catalogue) => { if (catalogue && catalogue.roles) setRoles(catalogue.roles); })
      .catch(() => setRoles([]));
  }, []);

  useEscapeLayer({
    id: 'user-form',
    priority: 150,
    active: showForm,
    onEscape: () => { closeForm(); return true; }
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_USER);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_USER);
    setShowForm(true);
  };

  const openEdit = (user) => {
    setEditingId(user.id);
    setForm({
      username: user.username || '',
      full_name: user.full_name || '',
      email: user.email || '',
      role: user.role || 'accountant',
      password: ''
    });
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        // An empty password field means "leave the password alone": changing it
        // is the separate Reset password action, which is confirmed on its own.
        const body = { ...form };
        if (!body.password) delete body.password;
        await apiRequest(`/api/auth/users/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
        showToast(t('settings.user_updated_toast'), 'success');
      } else {
        await apiRequest('/api/auth/users', { method: 'POST', body: JSON.stringify(form) });
        showToast(t('settings.user_created_toast', { username: form.username }), 'success');
      }
      closeForm();
      fetchUsers();
      triggerRefresh();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    try {
      const result = await apiRequest(`/api/auth/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword })
      });
      showToast(t('settings.password_reset_toast', {
        username: resetTarget.username,
        sessions: result && result.revokedSessions ? result.revokedSessions : 0
      }), 'success');
      setResetTarget(null);
      setNewPassword('');
      fetchUsers();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const remove = async (user) => {
    try {
      await apiRequest(`/api/auth/users/${user.id}`, { method: 'DELETE' });
      showToast(t('settings.user_deleted_toast', { username: user.username }), 'success');
      fetchUsers();
      triggerRefresh();
    } catch (err) {
      if (err && err.status === 409 && err.code === 'USER_HAS_HISTORY') {
        setAsk({
          title: t('settings.user_in_use_title'),
          message: err.message,
          confirm: t('records.deactivate_instead'),
          run: () => { setAsk(null); deactivateInstead(user); }
        });
        return;
      }
      showToast(translateError(t, err), 'error');
    }
  };

  const deactivateInstead = async (user) => {
    try {
      await apiRequest(`/api/records/users/${user.id}/deactivate`, { method: 'POST' });
      showToast(t('records.deactivated_toast', { kind: t('records.kind_user'), name: user.username }), 'success');
      fetchUsers();
      triggerRefresh();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const isSelf = (user) => !!currentUser && user.id === currentUser.id;

  return (
    <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-line bg-surface-muted flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">{t('settings.tab_users')}</h2>
          <p className="text-[11px] text-[rgb(var(--j-ink-muted))]">{t('settings.users_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <RecordStatusFilter value={status} onChange={setStatus} />
          <button
            type="button"
            onClick={openCreate}
            className="j-bg hover:opacity-90 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 shadow j-ring"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('settings.add_user')}</span>
          </button>
        </div>
      </div>

      <table className="w-full text-left text-xs">
        <thead className="bg-surface-muted text-[rgb(var(--j-ink-muted))] uppercase text-[10px] font-bold border-b border-line">
          <tr>
            <th className="py-2.5 px-4">{t('auth.full_name')}</th>
            <th className="py-2.5 px-4">{t('auth.username')}</th>
            <th className="py-2.5 px-4">{t('settings.role')}</th>
            <th className="py-2.5 px-4">{t('common.email')}</th>
            <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
            <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {users.length > 0 ? users.map((u) => (
            <tr
              key={u.id}
              className="border-b border-line/60 hover:bg-surface-hover"
              onContextMenu={(event) => recordMenu.openRecord(event, {
                type: 'users',
                record: u,
                nameField: 'username',
                kindLabel: t('records.kind_user'),
                editPermission: 'users:manage',
                fields: ['username', 'full_name', 'email', 'role', 'active'],
                onEdit: openEdit
              })}
            >
              <td className="py-3 px-4 font-semibold">{u.full_name}</td>
              <td className="py-3 px-4 font-mono text-[rgb(var(--j-ink-muted))]">@{u.username}</td>
              <td className="py-3 px-4">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-hover border border-line">
                  {u.role}
                </span>
              </td>
              <td className="py-3 px-4 text-[rgb(var(--j-ink-muted))]">{u.email || '—'}</td>
              <td className="py-3 px-4 text-center">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                  u.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {u.active ? t('common.active') : t('common.inactive')}
                </span>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    title={t('contextmenu.edit')}
                    className="px-2 py-1 rounded border border-line hover:bg-surface-hover j-ring"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResetTarget(u); setNewPassword(''); }}
                    title={t('settings.reset_password')}
                    className="px-2 py-1 rounded border border-line hover:bg-surface-hover j-ring"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessTarget(u)}
                    title={t('settings.manage_access')}
                    className="px-2 py-1 rounded border border-line hover:bg-surface-hover j-ring"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </button>
                  <RecordLifecycleControls
                    type="users"
                    record={u}
                    nameField="username"
                    onChanged={fetchUsers}
                  />
                  <button
                    type="button"
                    onClick={() => remove(u)}
                    disabled={isSelf(u)}
                    title={isSelf(u) ? t('settings.cannot_delete_self') : t('contextmenu.delete')}
                    className="px-2 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed j-ring"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={6} className="py-10 text-center text-[rgb(var(--j-ink-subtle))]">
                {t('settings.no_users')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Create / edit an account */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Users className="w-4 h-4 j-text" />
                <span>{editingId ? t('settings.user_edit_title') : t('settings.add_new_user')}</span>
              </h3>
              <button type="button" onClick={closeForm} className="text-[rgb(var(--j-ink-muted))] hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={save} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-[rgb(var(--j-ink-muted))] font-semibold mb-1">{t('auth.full_name')} *</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[rgb(var(--j-ink-muted))] font-semibold mb-1">{t('auth.username')} *</label>
                  <input
                    type="text"
                    required
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[rgb(var(--j-ink-muted))] font-semibold mb-1">{t('settings.role')} *</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring"
                  >
                    {(roles.length ? roles : [form.role]).map((role) => (
                      <option key={role} value={role}>{t(`settings.role_${role}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[rgb(var(--j-ink-muted))] font-semibold mb-1">{t('common.email')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring"
                />
              </div>
              <div>
                <label className="block text-[rgb(var(--j-ink-muted))] font-semibold mb-1">
                  {editingId ? t('settings.password_leave_blank') : `${t('auth.password')} *`}
                </label>
                <input
                  type="password"
                  required={!editingId}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring"
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

      {/* Reset a forgotten password */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <KeyRound className="w-4 h-4 j-text" />
                <span>{t('settings.reset_password_title')}</span>
              </h3>
              <button type="button" onClick={() => setResetTarget(null)} className="text-[rgb(var(--j-ink-muted))] hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={resetPassword} className="p-5 space-y-3 text-xs">
              <p className="text-[rgb(var(--j-ink-muted))]">
                {t('settings.reset_password_body', { username: resetTarget.username })}
              </p>
              <input
                type="password"
                required
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md border border-line bg-surface focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-3 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-surface-hover"
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="px-4 py-1.5 rounded-md text-xs font-semibold text-white j-bg hover:opacity-90 j-ring">
                  {t('settings.reset_password')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Which applications and permissions */}
      {accessTarget && (
        <AccessEditor
          user={accessTarget}
          onClose={() => setAccessTarget(null)}
          onSaved={() => { setAccessTarget(null); fetchUsers(); triggerRefresh(); }}
        />
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
