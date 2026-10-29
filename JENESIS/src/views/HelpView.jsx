import React, { useMemo, useState } from 'react';
import { BookOpen, Printer, Search, Keyboard } from 'lucide-react';
import { useI18n } from '../i18n';
import { useShortcuts, useShortcutAction } from '../context/ShortcutsContext';
import { SHORTCUTS, formatCombo, normalizeCombo } from '../shortcuts';
import { HELP, HELP_ORDER } from './helpContent';

/**
 * "How to use JENESIS" — the user guide (F1).
 *
 * Content lives in ./helpContent.js: one identical structure for English,
 * French and Kinyarwanda, so no language can fall behind. The guide also
 * renders the live shortcut catalogue, so what the user reads is exactly what
 * the application listens for.
 */
export default function HelpView() {
  const { t, lang } = useI18n();
  const { openReference } = useShortcuts();
  const [query, setQuery] = useState('');

  const content = HELP[lang] || HELP.en;

  // Ctrl+P / F3 prints the guide — the shortcut has a real destination here.
  useShortcutAction('F3', () => { window.print(); return true; }, { order: 1 });
  useShortcutAction('Ctrl+P', () => { window.print(); return true; }, { order: 1 });

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HELP_ORDER.map((id) => ({ id, ...content.sections[id] })).filter((section) => {
      if (!q) return true;
      const haystack = [
        section.title,
        section.purpose,
        section.where,
        section.expected,
        ...(section.steps || []),
        ...(section.notes || [])
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [content, query]);

  const shortcutRows = useMemo(() => {
    const seen = new Set();
    const rows = [];
    for (const item of SHORTCUTS) {
      const combo = normalizeCombo(item.combo);
      if (seen.has(combo)) continue;
      seen.add(combo);
      rows.push({ combo, label: t(`shortcuts.${item.key}`) });
    }
    return rows;
  }, [t]);

  const calculatorKeys = [
    { keys: '0 – 9', label: t('help.calc_digits') },
    { keys: '. ,', label: t('help.calc_decimal') },
    { keys: '+  −  *  /', label: t('help.calc_operators') },
    { keys: 'Enter  =', label: t('help.calc_equals') },
    { keys: 'Backspace', label: t('help.calc_backspace') },
    { keys: 'Delete', label: t('help.calc_clear_entry') },
    { keys: 'C', label: t('help.calc_clear') },
    { keys: '%', label: t('help.calc_percent') },
    { keys: 'Escape', label: t('shortcuts.escape') }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span>{content.guideTitle}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">{content.guideIntro}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={openReference}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>{t('shortcuts.title')}</span>
            <kbd className="ml-1 px-1 rounded border border-slate-300 bg-slate-50 text-[10px] font-mono">Ctrl + /</kbd>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{content.printGuide}</span>
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={content.searchPlaceholder}
          aria-label={content.searchPlaceholder}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">{content.noResults}</p>
      )}

      <div className="space-y-4">
        {sections.map((section) => (
          <section key={section.id} className="bg-white border border-slate-200 rounded-lg p-5 print:break-inside-avoid">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">{section.title}</h2>

            <dl className="mt-3 space-y-3 text-xs">
              <div>
                <dt className="font-bold text-slate-600 uppercase tracking-wide text-[10px]">{content.purposeLabel}</dt>
                <dd className="text-slate-700 mt-0.5">{section.purpose}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-600 uppercase tracking-wide text-[10px]">{content.whereLabel}</dt>
                <dd className="text-slate-700 mt-0.5">{section.where}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-600 uppercase tracking-wide text-[10px]">{content.stepsLabel}</dt>
                <dd className="mt-0.5">
                  <ol className="list-decimal list-inside space-y-1 text-slate-700">
                    {section.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-600 uppercase tracking-wide text-[10px]">{content.expectedLabel}</dt>
                <dd className="text-slate-700 mt-0.5">{section.expected}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-600 uppercase tracking-wide text-[10px]">{content.notesLabel}</dt>
                <dd className="mt-0.5">
                  <ul className="list-disc list-inside space-y-1 text-slate-600">
                    {section.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>

            {section.id === 'shortcuts' && (
              <div className="mt-4 space-y-4">
                <div className="overflow-hidden border border-slate-200 rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold">
                      <tr>
                        <th className="py-2 px-3 text-left w-40">{content.shortcutKey}</th>
                        <th className="py-2 px-3 text-left">{content.shortcutAction}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shortcutRows.map((row) => (
                        <tr key={row.combo}>
                          <td className="py-2 px-3">
                            <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-[10px] font-mono font-semibold text-slate-700">
                              {formatCombo(row.combo)}
                            </kbd>
                          </td>
                          <td className="py-2 px-3 text-slate-700">{row.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-700 mb-2">{t('help.calculator_keys')}</h3>
                  <div className="overflow-hidden border border-slate-200 rounded-md">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-100">
                        {calculatorKeys.map((row) => (
                          <tr key={row.keys}>
                            <td className="py-1.5 px-3 w-40">
                              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-[10px] font-mono font-semibold text-slate-700">
                                {row.keys}
                              </kbd>
                            </td>
                            <td className="py-1.5 px-3 text-slate-700">{row.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>

      <p className="text-[10px] text-slate-400 text-center pb-4">
        {t('help.footer_note')}
      </p>
    </div>
  );
}
