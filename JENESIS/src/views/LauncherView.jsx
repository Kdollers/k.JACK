import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { useAppMode } from '../context/AppModeContext';
import JenesisLogo from '../components/JenesisLogo';
import ThemeToggle from '../components/ThemeToggle';
import { APP_IDS, APPS } from '../appIdentity';

/**
 * Launcher — shown when JENESIS is started without an application.
 *
 * The installed shortcuts open an application directly
 * (`JENESIS.exe --app=seller`), so this screen is what the portable package and
 * a plain Start-menu entry show. It never guesses: the user picks the
 * application their job needs, and the choice is remembered.
 */
export default function LauncherView() {
  const { t } = useI18n();
  const { setAppId } = useAppMode();
  const [remember, setRemember] = useState(true);

  const open = (id) => {
    if (remember) setAppId(id);
    else setAppId(id);
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-canvas text-ink p-6">
      <div className="w-full max-w-4xl">
        <div className="flex flex-col items-center mb-8 text-center">
          <JenesisLogo tone="brand" size={72} />
          <h1 className="mt-4 text-2xl font-extrabold tracking-wide">JENESIS</h1>
          <p className="mt-2 text-sm text-[rgb(var(--j-ink-muted))] max-w-xl">
            {t('launcher.intro')}
          </p>
          <div className="mt-4">
            <ThemeToggle variant="segmented" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {APP_IDS.map((id) => {
            const app = APPS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => open(id)}
                data-app-card={id}
                className="group text-left bg-surface border border-line rounded-xl p-5 hover:shadow-lg transition focus:outline-none j-ring"
              >
                <JenesisLogo tone={app.tone} size={56} />
                <div className="mt-4 text-base font-bold">{t(app.nameKey)}</div>
                <p className="mt-1 text-xs text-[rgb(var(--j-ink-muted))] min-h-[3rem]">
                  {t(app.purposeKey)}
                </p>
                <div className="mt-4 inline-flex items-center text-xs font-semibold j-text">
                  {t('launcher.open')} →
                </div>
              </button>
            );
          })}
        </div>

        <label className="mt-6 flex items-center justify-center space-x-2 text-xs text-[rgb(var(--j-ink-muted))]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="rounded border-line"
          />
          <span>{t('launcher.remember')}</span>
        </label>

        <p className="mt-8 text-center text-[11px] text-[rgb(var(--j-ink-subtle))]">
          {t('identity.developed_by')}
        </p>
      </div>
    </div>
  );
}
