import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { errorKey, useI18n } from '../i18n';
import { CURRENCY_CHOICES, countryChoices } from '../config/companyOptions.mjs';
import { appModeFromPath } from '../config/appMode.mjs';
import BrandMark from './BrandMark';

const inputClass =
  'w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white';

export function errorText(err, t) {
  return err ? t(errorKey(err), err?.params || {}) : '';
}

function Shell({ title, intro, children }) {
  const { lang, setLang, t } = useI18n();
  const mode = appModeFromPath(window.location.pathname);
  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center space-x-3 mb-6 text-white">
          <BrandMark mode={mode} className="w-12 h-12" />
          <div>
            <div className="text-sm font-bold tracking-wider">{t('app_name')} · {t(`app_modes.${mode}`)}</div>
            <div className="text-xs text-slate-400">{t('auth.app_tagline')}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-xl p-6 space-y-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" /> {title}
            </h1>
            {intro && <p className="text-xs text-slate-500 mt-1">{intro}</p>}
          </div>
          {children}
        </div>
        <div className="mt-4 flex justify-center">
          <select
            aria-label={t('auth.language', 'Language')}
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1"
          >
            <option value="en">{t('languages.en')}</option>
            <option value="fr">{t('languages.fr')}</option>
            <option value="rw">{t('languages.rw')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
      {message}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

/** Desktop only: a native confirmation chooses another database, never an
 * unauthenticated endpoint that could take over the existing ledger. */
function InstallationSwitch() {
  const { t } = useI18n();
  const [alternative, setAlternative] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const info = window.genesisDesktop?.getAppInfo?.();
    info?.then((result) => { if (!cancelled) setAlternative(result.alternativeInstallation || null); })
      .catch(() => { /* No desktop bridge (or the local service is shutting down). */ });
    return () => { cancelled = true; };
  }, []);
  if (!alternative) return null;
  const isNew = alternative.target === 'current' && alternative.newDatabase;
  const message = isNew ? 'new_installation_explanation'
    : alternative.target === 'legacy' ? 'switch_legacy_explanation' : 'switch_current_explanation';
  const label = isNew ? 'start_new_installation'
    : alternative.target === 'legacy' ? 'switch_legacy' : 'switch_current';
  const choose = async () => {
    setBusy(true);
    setError(false);
    try {
      await window.genesisDesktop.chooseInstallation(alternative.target);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-slate-200 pt-3 space-y-2">
      <p className="text-xs text-slate-600">{t(`auth.${message}`)}</p>
      {error && <ErrorBox message={t('auth.installation_switch_error')} />}
      <button type="button" disabled={busy} onClick={choose}
        className="w-full border border-slate-300 rounded py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
        {t(`auth.${label}`)}
      </button>
    </div>
  );
}

export function LoginScreen() {
  const { login, authError, showRecovery, hasAdministrator } = useApp();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  return (
    <Shell title={t('auth.login_title', 'Sign in')} intro={t('auth.login_intro', 'Enter your JENESIS username and password.')}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={errorText(error || authError, t)} />
        {hasAdministrator && <p className="text-xs text-slate-600 bg-slate-50 rounded p-2">{t('auth.existing_admin_notice')}</p>}
        <Field label={t('auth.username', 'Username')}>
          <input className={inputClass} autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field label={t('auth.password', 'Password')}>
          <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-md">
          {busy ? t('auth.signing_in') : t('auth.sign_in')}
        </button>
        <button type="button" onClick={showRecovery} className="w-full text-xs text-blue-700 hover:underline">
          {t('auth.recovery_link')}
        </button>
      </form>
      <InstallationSwitch />
    </Shell>
  );
}

export function SetupScreen() {
  const { completeSetup } = useApp();
  const { t, lang } = useI18n();
  const [form, setForm] = useState({ company_name: '', country_code: '', currency_code: 'USD',
    full_name: '', email: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError({ code: 'PASSWORD_MISMATCH' });
      return;
    }
    setBusy(true);
    try {
      await completeSetup({
        company_name: form.company_name,
        country_code: form.country_code,
        currency_code: form.currency_code,
        full_name: form.full_name,
        email: form.email,
        username: form.username,
        password: form.password,
        confirm_password: form.confirm
      });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={t('auth.setup_title', 'Set up JENESIS')} intro={t('auth.setup_intro', 'Create the company and the first administrator account. This step is available only once.')}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={errorText(error, t)} />
        <Field label={t('auth.company_name', 'Company name')}>
          <input className={inputClass} required value={form.company_name} onChange={set('company_name')} />
        </Field>
        <Field label={t('settings.country')}>
          <select className={inputClass} required value={form.country_code} onChange={set('country_code')}>
            <option value="">{t('settings.choose_country')}</option>
            {countryChoices(lang).map((choice) => (
              <option key={choice.code} value={choice.code}>{choice.label}</option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.currency_code')}>
          <select className={inputClass} value={form.currency_code} onChange={set('currency_code')}>
            {CURRENCY_CHOICES.map((choice) => (
              <option key={choice.code} value={choice.code}>{t(`currencies.${choice.code}`)} ({choice.code})</option>
            ))}
          </select>
        </Field>
        <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded">{t('settings.base_currency_warning')}</p>
        <Field label={t('auth.full_name', 'Administrator full name')}>
          <input className={inputClass} required value={form.full_name} onChange={set('full_name')} />
        </Field>
        <Field label={t('auth.email', 'Email (optional)')}>
          <input className={inputClass} type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label={t('auth.username', 'Username')}>
          <input className={inputClass} required autoComplete="username" value={form.username} onChange={set('username')} />
        </Field>
        <Field label={t('auth.password', 'Password')}>
          <input className={inputClass} type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <p className="text-[11px] text-slate-500">{t('auth.password_hint', 'At least 10 characters. Do not use your username.')}</p>
        <Field label={t('auth.confirm_password', 'Confirm password')}>
          <input className={inputClass} type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </Field>
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-md flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          {busy ? t('auth.creating', 'Creating…') : t('auth.create_admin', 'Create administrator and continue')}
        </button>
      </form>
      <InstallationSwitch />
    </Shell>
  );
}

export function ChangePasswordScreen() {
  const { changePassword, logout, currentUser } = useApp();
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError({ code: 'PASSWORD_MISMATCH' });
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={t('auth.change_password_title', 'Change your password')} intro={t('auth.change_password_intro', 'Your password must be changed before you can use JENESIS.')}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={errorText(error, t)} />
        <p className="text-xs text-slate-600">{currentUser?.full_name} (@{currentUser?.username})</p>
        <Field label={t('auth.current_password', 'Current password')}>
          <input className={inputClass} type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('auth.new_password', 'New password')}>
          <input className={inputClass} type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('auth.confirm_password', 'Confirm password')}>
          <input className={inputClass} type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <p className="text-[11px] text-slate-500">{t('auth.password_hint', 'At least 10 characters. Do not use your username.')}</p>
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-md">
          {t('auth.change_password', 'Change password')}
        </button>
        <button type="button" onClick={logout} className="w-full text-xs text-slate-600 hover:text-slate-900">
          {t('auth.sign_out', 'Sign out')}
        </button>
      </form>
    </Shell>
  );
}

export function RecoveryScreen() {
  const { showLogin } = useApp();
  const { t } = useI18n();
  return (
    <Shell title={t('auth.recovery_title')} intro={t('auth.recovery_intro')}>
      <div className="space-y-3 text-xs leading-relaxed text-slate-700">
        <p>{t('auth.recovery_backup')}</p>
        <p>{t('auth.recovery_steps')}</p>
        <p className="rounded bg-amber-50 p-2 text-amber-900">{t('auth.recovery_warning')}</p>
        <button type="button" onClick={showLogin} className="w-full border border-slate-300 rounded py-2 font-semibold hover:bg-slate-50">
          {t('auth.recovery_sign_in')}
        </button>
      </div>
      <InstallationSwitch />
    </Shell>
  );
}

export function BackendUnavailable({ message }) {
  const { t } = useI18n();
  return (
    <Shell title={t('auth.unavailable_title', 'JENESIS cannot reach its local service')} intro={t('auth.unavailable_intro', 'The accounting service did not respond. Close JENESIS and start it again. If the problem continues, check the log file in your JENESIS data folder.')}>
      <ErrorBox message={errorText(message, t)} />
      <button type="button" onClick={() => window.location.reload()} className="w-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold py-2 rounded-md flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4" /> {t('auth.retry', 'Try again')}
      </button>
    </Shell>
  );
}
