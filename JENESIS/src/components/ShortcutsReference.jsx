import React, { useMemo, useState } from 'react';
import { X, Keyboard } from 'lucide-react';
import { useI18n } from '../i18n';
import { useShortcuts, useEscapeLayer } from '../context/ShortcutsContext';
import { SHORTCUTS, formatCombo, normalizeCombo, searchShortcuts } from '../shortcuts';

/**
 * Searchable keyboard-shortcut reference (Ctrl+/ or the Help screen).
 * Every entry comes from the single SHORTCUTS catalogue, so what the user
 * reads is exactly what the application listens for.
 */
export default function ShortcutsReference() {
  const { t } = useI18n();
  const { closeReference } = useShortcuts();
  const [query, setQuery] = useState('');

  // Escape closes this dialog first (highest priority layer).
  useEscapeLayer({ id: 'shortcuts-reference', priority: 100, onEscape: () => { closeReference(); return true; } });

  const entries = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const item of SHORTCUTS) {
      const combo = normalizeCombo(item.combo);
      const dedupeKey = `${combo}|${item.key}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      list.push({ ...item, combo, label: t(`shortcuts.${item.key}`) });
    }
    return list;
  }, [t]);

  const groups = [
    { id: 'document', label: t('shortcuts.group_document') },
    { id: 'navigation', label: t('shortcuts.group_navigation') },
    { id: 'app', label: t('shortcuts.group_app') }
  ];

  const results = searchShortcuts(entries, query);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-start justify-center p-4 pt-16"
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeReference(); }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden"
        role="dialog"
        aria-label={t('shortcuts.title')}
      >
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center space-x-2">
            <Keyboard className="w-4 h-4 text-blue-400" />
            <span>{t('shortcuts.title')}</span>
          </h3>
          <button onClick={closeReference} className="text-slate-400 hover:text-white p-1 rounded transition" aria-label={t('common.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('shortcuts.search')}
            aria-label={t('shortcuts.search')}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <div className="max-h-[52vh] overflow-y-auto divide-y divide-slate-100">
            {groups.map((group) => {
              const items = results.filter((r) => r.group === group.id);
              if (!items.length) return null;
              return (
                <div key={group.id} className="py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 pb-1">
                    {group.label}
                  </div>
                  <ul>
                    {items.map((item) => (
                      <li key={`${item.combo}-${item.id}`} className="flex items-center justify-between px-1 py-1.5 hover:bg-slate-50 rounded">
                        <span className="text-xs text-slate-700 pr-4">{item.label}</span>
                        <kbd className="shrink-0 px-2 py-0.5 rounded border border-slate-300 bg-slate-50 text-[10px] font-mono font-semibold text-slate-700">
                          {formatCombo(item.combo)}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {results.length === 0 && (
              <p className="text-xs text-slate-400 py-6 text-center">{t('shortcuts.none_found')}</p>
            )}
          </div>

          <p className="text-[10px] text-slate-400 text-center">{t('shortcuts.hint')}</p>
        </div>
      </div>
    </div>
  );
}
