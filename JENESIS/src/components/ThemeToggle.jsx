import React from 'react';
import { Moon, Monitor, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { THEME_PREFERENCES } from '../theme.mjs';

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * One control, two presentations, one source of truth (useTheme):
 *  - "button"    : the compact switch in the application header, which flips
 *                  between Light and Dark.
 *  - "segmented" : the three-way choice on the Settings screen.
 */
export default function ThemeToggle({ variant = 'button', className = '' }) {
  const { preference, theme, systemPrefersDark, setPreference, toggleTheme } = useTheme();
  const { t } = useI18n();

  const labels = {
    light: t('settings.theme_light', 'Light Mode'),
    dark: t('settings.theme_dark', 'Dark Mode'),
    system: t('settings.theme_system', 'System Default'),
  };

  const descriptions = {
    light: t('settings.theme_light_desc', 'Bright workspace with dark text'),
    dark: t('settings.theme_dark_desc', 'Dark workspace for low light and long sessions'),
    system: t('settings.theme_system_desc', 'Follow the appearance setting of this computer'),
  };

  if (variant === 'segmented') {
    return (
      <div
        className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${className}`}
        role="radiogroup"
        aria-label={t('settings.appearance_title', 'Appearance')}
      >
        {THEME_PREFERENCES.map((option) => {
          const Icon = ICONS[option];
          const active = preference === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={labels[option]}
              onClick={() => setPreference(option)}
              className={`flex items-start space-x-3 p-4 rounded-xl border text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                active
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-500/40'
                  : 'border-line bg-surface hover:bg-surface-hover'
              }`}
            >
              <Icon
                className={`w-5 h-5 mt-0.5 shrink-0 ${
                  active ? 'text-blue-600 dark:text-blue-300' : 'text-ink-muted'
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span
                  className={`block text-xs font-semibold ${
                    active ? 'text-blue-700 dark:text-blue-200' : 'text-ink'
                  }`}
                >
                  {labels[option]}
                </span>
                <span className="block text-[11px] text-ink-muted mt-0.5 leading-snug">
                  {descriptions[option]}
                </span>
                {active && (
                  <span className="inline-flex items-center mt-2 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    {t('settings.theme_active', 'Active')}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const Icon = ICONS[preference] || (theme === 'dark' ? Moon : Sun);
  const nextLabel = theme === 'dark' ? labels.light : labels.dark;
  const title =
    preference === 'system'
      ? `${labels.system} — ${systemPrefersDark ? labels.dark : labels.light}`
      : labels[preference];

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`${t('settings.appearance_title', 'Appearance')}: ${title}`}
      aria-label={`${t('settings.appearance_title', 'Appearance')}: ${title}. ${
        theme === 'dark' ? t('settings.switch_to_light', 'Switch to Light Mode') : t('settings.switch_to_dark', 'Switch to Dark Mode')
      }`}
      className={`flex items-center justify-center w-8 h-8 rounded border border-slate-700 text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      <span className="sr-only">{nextLabel}</span>
    </button>
  );
}
