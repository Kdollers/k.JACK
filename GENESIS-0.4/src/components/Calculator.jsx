import React, { useState } from 'react';
import { Calculator as CalculatorIcon, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { calculate } from '../utils/calculator.mjs';
import { useApp } from '../context/AppContext';

const BUTTONS = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '(', ')', 'C', '⌫', '=', '+'];
export default function Calculator() {
  const { appMode } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState('');
  const [error, setError] = useState(false);
  // Fail closed even if a parent accidentally mounts it in the network app.
  if (appMode === 'network') return null;
  const accent = appMode === 'seller' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
  const press = (key) => {
    setError(false);
    if (key === 'C') return setExpression('');
    if (key === '⌫') return setExpression((prev) => prev.slice(0, -1));
    if (key === '=') {
      try { setExpression(String(calculate(expression))); }
      catch { setError(true); }
      return;
    }
    setExpression((prev) => (prev.length < 80 ? prev + key : prev));
  };
  return <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
    {open && <section aria-label={t('calculator.title')}
      className="w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between text-sm font-bold text-slate-900">
        <span>{t('calculator.title')}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')}><X size={16} /></button>
      </div>
      <input aria-label={t('calculator.expression')} value={expression} onChange={(e) => {
        if (/^[0-9.\s()+\-*/]{0,80}$/.test(e.target.value)) { setExpression(e.target.value); setError(false); }
      }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); press('='); } }}
        className="w-full rounded border border-slate-300 text-right font-mono text-lg px-2 py-2" />
      {error && <p role="alert" className="text-xs text-red-700">{t('calculator.invalid')}</p>}
      <div className="grid grid-cols-4 gap-1">
        {BUTTONS.map((key) => <button type="button" key={key} onClick={() => press(key)}
          className={`rounded p-2 text-sm font-bold ${key === '=' ? accent + ' text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}>
          {key}
        </button>)}
      </div>
      <p className="text-[10px] text-slate-500">{t('calculator.no_posting')}</p>
    </section>}
    <button type="button" onClick={() => setOpen((v) => !v)}
      aria-label={t('calculator.title')} className={`${accent} p-3 rounded-full text-white shadow-lg`}>
      <CalculatorIcon size={22} />
    </button>
  </div>;
}
