import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from '../i18n';
import { X, Calculator, Delete } from 'lucide-react';

/**
 * Built-in calculator (+, −, ×, ÷, decimals, clear). Purely local: it never
 * posts, stores or sends any transaction — it only helps users compute amounts.
 */
export default function CalculatorModal({ onClose }) {
  const { t } = useI18n();
  const [display, setDisplay] = useState('0');
  const [accumulator, setAccumulator] = useState(null); // { value, op }
  const [freshEntry, setFreshEntry] = useState(true);
  const modalRef = useRef(null);

  const inputDigit = useCallback((d) => {
    setDisplay((prev) => {
      if (freshEntry) {
        setFreshEntry(false);
        return d === '.' ? '0.' : d;
      }
      if (d === '.' && prev.includes('.')) return prev;
      if (prev === '0' && d !== '.') return d;
      if (prev.replace(/[.-]/g, '').length >= 15) return prev;
      return prev + d;
    });
  }, [freshEntry]);

  const compute = (a, b, op) => {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? null : a / b;
      default: return b;
    }
  };

  const formatResult = (n) => {
    if (n === null || !Number.isFinite(n)) return 'Error';
    // Trim to at most 10 decimals, drop trailing zeros, keep the plain number.
    const s = String(Math.round(n * 1e10) / 1e10);
    return s === '-0' ? '0' : s;
  };

  const applyOperator = useCallback((op) => {
    const current = parseFloat(display);
    if (accumulator && !freshEntry) {
      const result = compute(accumulator.value, current, accumulator.op);
      if (result === null) {
        setDisplay('Error');
        setAccumulator(null);
        setFreshEntry(true);
        return;
      }
      setDisplay(formatResult(result));
      setAccumulator({ value: result, op });
    } else {
      setAccumulator({ value: Number.isFinite(current) ? current : 0, op });
    }
    setFreshEntry(true);
  }, [display, accumulator, freshEntry]);

  const equals = useCallback(() => {
    if (!accumulator) return;
    const current = parseFloat(display);
    const result = compute(accumulator.value, Number.isFinite(current) ? current : 0, accumulator.op);
    if (result === null) {
      setDisplay('Error');
    } else {
      setDisplay(formatResult(result));
    }
    setAccumulator(null);
    setFreshEntry(true);
  }, [display, accumulator]);

  const clearAll = useCallback(() => {
    setDisplay('0');
    setAccumulator(null);
    setFreshEntry(true);
  }, []);

  const backspace = useCallback(() => {
    setDisplay((prev) => {
      if (freshEntry || prev === 'Error') return '0';
      return prev.length > 1 ? prev.slice(0, -1) : '0';
    });
  }, [freshEntry]);

  const negate = useCallback(() => {
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : `-${prev}`));
  }, []);

  // Keyboard support while the modal is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= '0' && e.key <= '9') { inputDigit(e.key); return; }
      if (e.key === '.' || e.key === ',') { inputDigit('.'); return; }
      if (e.key === '+') { applyOperator('+'); return; }
      if (e.key === '-') { applyOperator('−'); return; }
      if (e.key === '*') { applyOperator('×'); return; }
      if (e.key === '/') { e.preventDefault(); applyOperator('÷'); return; }
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); return; }
      if (e.key === 'Backspace') { backspace(); return; }
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key.toLowerCase() === 'c') { clearAll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputDigit, applyOperator, equals, backspace, clearAll, onClose]);

  useEffect(() => { modalRef.current?.focus(); }, []);

  const Btn = ({ label, onClick, className = '', title }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-12 rounded-lg text-base font-bold transition shadow-sm border ${className}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={modalRef} tabIndex={-1} className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden outline-none" role="dialog" aria-label={t('calculator.title')}>
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center space-x-2">
            <Calculator className="w-4 h-4 text-blue-400" />
            <span>{t('calculator.title')}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition" aria-label={t('common.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-slate-900 text-white rounded-lg px-3 py-3 text-right">
            <div className="text-[10px] text-slate-400 h-3 font-mono">
              {accumulator ? `${formatResult(accumulator.value)} ${accumulator.op}` : ''}
            </div>
            <div className="text-2xl font-mono font-bold truncate" data-testid="calculator-display">{display}</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Btn label="C" onClick={clearAll} title={t('calculator.clear')} className="bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100" />
            <Btn label="±" onClick={negate} className="bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" />
            <Btn label={<Delete className="w-4 h-4 mx-auto" />} onClick={backspace} title="Backspace" className="bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" />
            <Btn label="÷" onClick={() => applyOperator('÷')} className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" />

            <Btn label="7" onClick={() => inputDigit('7')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="8" onClick={() => inputDigit('8')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="9" onClick={() => inputDigit('9')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="×" onClick={() => applyOperator('×')} className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" />

            <Btn label="4" onClick={() => inputDigit('4')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="5" onClick={() => inputDigit('5')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="6" onClick={() => inputDigit('6')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="−" onClick={() => applyOperator('−')} className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" />

            <Btn label="1" onClick={() => inputDigit('1')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="2" onClick={() => inputDigit('2')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="3" onClick={() => inputDigit('3')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="+" onClick={() => applyOperator('+')} className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" />

            <Btn label="0" onClick={() => inputDigit('0')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50 col-span-2" />
            <Btn label="." onClick={() => inputDigit('.')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="=" onClick={equals} className="bg-blue-600 text-white border-blue-600 hover:bg-blue-500" />
          </div>

          <p className="text-[10px] text-slate-400 text-center">{t('calculator.hint')}</p>
        </div>
      </div>
    </div>
  );
}
