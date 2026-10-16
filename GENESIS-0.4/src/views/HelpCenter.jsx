import React, { useState } from 'react';
import { BookOpen, ArrowRight, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { version } from '../../package.json';

// Bundled with the application; no website, connection or external account is
// required. Each paragraph is translated, not generated in the browser.
const TOPICS = [
  { id: 'start', modes: ['seller', 'administrator', 'network', 'general'], steps: 3 },
  { id: 'company', modes: ['administrator', 'general'], steps: 3, target: 'settings', permission: 'company:manage' },
  { id: 'contacts', modes: ['seller', 'administrator', 'general'], steps: 3, target: 'customers', permission: 'customers:read' },
  { id: 'products', modes: ['seller', 'administrator', 'general'], steps: 3, target: 'inventory', permission: 'inventory:read' },
  { id: 'sales', modes: ['seller', 'administrator', 'general'], steps: 4, target: 'sales', permission: 'sales:read' },
  { id: 'purchases', modes: ['administrator', 'general'], steps: 3, target: 'purchases', permission: 'purchases:read' },
  { id: 'banking', modes: ['administrator', 'general'], steps: 3, target: 'banking', permission: 'banking:read' },
  { id: 'accounting', modes: ['administrator', 'general'], steps: 3, target: 'accounting', permission: 'accounting:read' },
  { id: 'reports', modes: ['administrator', 'general'], steps: 3, target: 'reports', permission: 'reports:read' },
  { id: 'backup', modes: ['administrator', 'general'], steps: 4, target: 'settings', permission: 'backup:export' },
  { id: 'network', modes: ['network'], steps: 5, target: 'dashboard', permission: 'network:read' },
  { id: 'safety', modes: ['seller', 'administrator', 'network', 'general'], steps: 3 },
  { id: 'limits', modes: ['seller', 'administrator', 'network', 'general'], steps: 4 }
];

export default function HelpCenter() {
  const { appMode, hasPermission, setActiveView } = useApp();
  const { t } = useI18n();
  const visible = TOPICS.filter((topic) => topic.modes.includes(appMode) &&
    (!topic.permission || hasPermission(topic.permission)));
  const [selected, setSelected] = useState(appMode === 'network' ? 'network' : 'start');
  const topic = visible.find((item) => item.id === selected) || visible[0];

  return <div className="space-y-5" data-testid="offline-help">
    <header className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <BookOpen className="text-blue-600 w-7 h-7" />
        <div>
          <h1 className="font-bold text-xl">{t('help.title')}</h1>
          <p className="text-sm text-slate-600">{t('help.intro')}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">{t('help.offline')}</p>
    </header>
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <nav aria-label={t('help.topics')} className="bg-white border border-slate-200 rounded-xl shadow-sm p-2 w-full lg:w-64 shrink-0">
        {visible.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item.id)}
          aria-current={item.id === topic?.id ? true : undefined}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg ${item.id === topic?.id ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
          {t(`help.${item.id}.title`)}
        </button>)}
      </nav>
      {topic && <article className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex-1 min-w-0">
        <h2 className="text-lg font-bold text-slate-900">{t(`help.${topic.id}.title`)}</h2>
        <p className="text-sm text-slate-600 mt-2">{t(`help.${topic.id}.intro`)}</p>
        <ol className="space-y-4 mt-5 list-decimal list-outside pl-5 text-sm text-slate-700">
          {Array.from({ length: topic.steps }, (_, i) => <li key={i} className="leading-relaxed pl-1">
            {t(`help.${topic.id}.step${i + 1}`)}
          </li>)}
        </ol>
        {topic.target && <button type="button" className="mt-6 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-semibold"
          onClick={() => setActiveView(topic.target)}>
          {t('help.open_module', { module: t(`nav.${topic.target}`) })} <ArrowRight size={16} />
        </button>}
        {topic.id === 'limits' && <div className="mt-6 border-t border-slate-200 pt-4 flex gap-2 text-xs text-slate-600">
          <Info size={16} className="shrink-0" />{t('help.no_guarantees')}
        </div>}
      </article>}
    </div>
    <footer className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 space-y-1">
      <h2 className="font-bold text-slate-900">{t('about.title')}</h2>
      <p>{t('app_name')} · {t('about.version', { version })}</p>
      <p>{t('about.developer')}</p>
      <p>{t('about.partial')}</p>
    </footer>
  </div>;
}
