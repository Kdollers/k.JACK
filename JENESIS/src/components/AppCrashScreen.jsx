import React from 'react';
import { useI18n } from '../i18n';

/**
 * AppCrashScreen — the last line of defence between a bug and an empty screen.
 *
 * Before this existed, an error thrown while React was rendering left an empty
 * document: the packaged application showed a blank white window with no
 * explanation. Now the user sees what happened, can copy the details and can
 * retry; the same error is written to %APPDATA%\JENESIS\logs\desktop.log
 * through the preload bridge so it can be diagnosed afterwards.
 *
 * It is mounted inside the language provider, so the screen is translated like
 * every other part of the interface.
 */

/** Removes anything that looks like a token, password or business value. */
function safeDetails(error) {
  if (!error) return '';
  const raw = `${error.name ? error.name + ': ' : ''}${error.message || String(error)}`;
  return raw
    .replace(/(password|token|authorization|bearer)\s*[:=]?\s*\S+/gi, '$1: *****')
    .slice(0, 800);
}

export function CrashScreen({ error, onRetry }) {
  const { t } = useI18n();
  const details = safeDetails(error);
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(`${t('crash.title')}\n${details}`);
        setCopied(true);
      }
    } catch (_) { /* clipboard unavailable */ }
  };

  const reportToLog = () => {
    try {
      const bridge = window.genesisDesktop || window.jenesisDesktop;
      if (bridge && typeof bridge.reportStartup === 'function') {
        bridge.reportStartup('render-error', details);
      }
    } catch (_) { /* reporting must never throw */ }
  };
  React.useEffect(reportToLog, [details]);

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-900 text-slate-200 p-8">
      <div className="max-w-2xl">
        <div className="text-xs font-bold tracking-[0.2em] text-slate-400">JENESIS</div>
        <h1 className="mt-2 text-xl font-bold text-white">{t('crash.title')}</h1>
        <p className="mt-2 text-sm text-rose-300">{t('crash.subtitle')}</p>
        {details ? (
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
            {details}
          </pre>
        ) : null}
        <p className="mt-4 text-xs leading-relaxed text-slate-400">{t('crash.hint')}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => (onRetry ? onRetry() : window.location.reload())}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            {t('crash.retry')}
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200"
          >
            {copied ? t('crash.copied') : t('crash.copy')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Catches any error thrown while rendering the interface and shows CrashScreen
 * instead of leaving an empty document behind.
 */
export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      const bridge = window.genesisDesktop || window.jenesisDesktop;
      if (bridge && typeof bridge.reportStartup === 'function') {
        bridge.reportStartup('render-error', safeDetails(error));
      }
    } catch (_) { /* reporting must never throw */ }
    if (typeof console !== 'undefined' && console.error) {
      console.error('JENESIS interface error', error, info && info.componentStack);
    }
  }

  retry() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return <CrashScreen error={this.state.error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
