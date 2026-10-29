import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useEscapeLayer } from '../context/ShortcutsContext';
import { X, Calculator, Delete, Minus, GripHorizontal } from 'lucide-react';

/**
 * Built-in calculator (+, −, ×, ÷, decimals, clear). Purely local: it never
 * posts, stores or sends any transaction — it only helps users compute amounts.
 *
 * Keyboard: it registers itself as the key-capturing layer of the shortcut
 * system, so physical keys (digits, keypad, operators, Enter/=, Backspace, Esc)
 * work exactly like the buttons and never leak into the application shortcuts.
 * Modifier combinations (Ctrl+…) and function keys are deliberately NOT
 * captured, so Ctrl+Shift+C still closes the calculator and F1 still opens help.
 *
 * Precision: intermediate results are rounded to 8 decimals (well beyond any
 * currency) and floating-point noise such as 0.1 + 0.2 = 0.30000000000000004 is
 * removed, so the number shown is the number you can type into an amount field.
 */
const MAX_DIGITS = 15;
const PRECISION = 1e8;

function roundResult(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.round(n * PRECISION) / PRECISION;
}

function formatResult(n) {
  const rounded = roundResult(n);
  if (rounded === null) return null;
  const s = String(rounded);
  return s === '-0' ? '0' : s;
}

export default function CalculatorModal({ onClose }) {
  const { t } = useI18n();
  const [display, setDisplay] = useState('0');
  const [accumulator, setAccumulator] = useState(null); // { value, op }
  const [freshEntry, setFreshEntry] = useState(true);
  const [error, setError] = useState('');
  const [minimised, setMinimised] = useState(false);
  const [position, setPosition] = useState(null); // { x, y } once dragged
  const modalRef = useRef(null);
  const dragRef = useRef(null);

  const inputDigit = useCallback((d) => {
    setError('');
    setDisplay((prev) => {
      const base = freshEntry || prev === null ? '' : prev;
      if (freshEntry) setFreshEntry(false);
      if (d === '.') {
        const next = base === '' ? '0.' : base;
        return next.includes('.') ? next : `${next}.`;
      }
      if (base === '0') return d;
      if (base.replace(/[.-]/g, '').length >= MAX_DIGITS) return base;
      return base + d;
    });
  }, [freshEntry]);

  const compute = (a, b, op) => {
    const x = roundResult(Number(a));
    const y = roundResult(Number(b));
    switch (op) {
      case '+': return x + y;
      case '−': return x - y;
      case '×': return x * y;
      case '÷': return y === 0 ? null : x / y;
      default: return y;
    }
  };

  const fail = useCallback((message) => {
    setError(message);
    setDisplay('0');
    setAccumulator(null);
    setFreshEntry(true);
  }, []);

  const applyOperator = useCallback((op) => {
    const current = parseFloat(display);
    if (!Number.isFinite(current) && !accumulator) return;
    if (accumulator && !freshEntry) {
      const result = compute(accumulator.value, current, accumulator.op);
      if (result === null) return fail(t('calculator.divide_by_zero'));
      const text = formatResult(result);
      setDisplay(text);
      setAccumulator({ value: result, op });
    } else {
      setAccumulator({ value: Number.isFinite(current) ? current : (accumulator ? accumulator.value : 0), op });
    }
    setError('');
    setFreshEntry(true);
  }, [display, accumulator, freshEntry, fail, t]);

  const equals = useCallback(() => {
    if (!accumulator) return;
    const current = parseFloat(display);
    const result = compute(accumulator.value, Number.isFinite(current) ? current : 0, accumulator.op);
    if (result === null) return fail(t('calculator.divide_by_zero'));
    setDisplay(formatResult(result));
    setAccumulator(null);
    setError('');
    setFreshEntry(true);
  }, [display, accumulator, fail, t]);

  const clearAll = useCallback(() => {
    setDisplay('0');
    setAccumulator(null);
    setFreshEntry(true);
    setError('');
  }, []);

  const clearEntry = useCallback(() => {
    setDisplay('0');
    setFreshEntry(true);
    setError('');
  }, []);

  const backspace = useCallback(() => {
    setError('');
    setDisplay((prev) => {
      if (freshEntry || prev === null) return '0';
      const next = prev.length > 1 ? prev.slice(0, -1) : '0';
      return next === '-' ? '0' : next;
    });
  }, [freshEntry]);

  const negate = useCallback(() => {
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : `-${prev}`));
  }, []);

  const percent = useCallback(() => {
    const value = parseFloat(display);
    if (Number.isFinite(value)) {
      setDisplay(formatResult(value / 100));
      setFreshEntry(true);
    }
  }, [display]);

  // --- keyboard: captured through the single application listener -----------
  useEscapeLayer({
    id: 'calculator',
    priority: 90,
    captureKeys: true,
    onEscape: () => { onClose(); return true; },
    onKey: (event) => {
      const combo = event.key;
      // Modifier combinations and function keys belong to the application.
      if (event.ctrlKey || event.metaKey || event.altKey || /^F\d{1,2}$/.test(combo)) return false;
      if (event.key >= '0' && event.key <= '9') { inputDigit(event.key); return true; }
      if (event.key === '.' || event.key === ',') { inputDigit('.'); return true; }
      if (event.key === '+') { applyOperator('+'); return true; }
      if (event.key === '-') { applyOperator('−'); return true; }
      if (event.key === '*') { applyOperator('×'); return true; }
      if (event.key === '/') { applyOperator('÷'); return true; }
      if (event.key === '%') { percent(); return true; }
      if (event.key === 'Enter' || event.key === '=') { equals(); return true; }
      if (event.key === 'Backspace') { backspace(); return true; }
      if (event.key === 'Delete') { clearEntry(); return true; }
      if (event.key === 'Escape') { onClose(); return true; }
      if (event.key.toLowerCase() === 'c') { clearAll(); return true; }
      return false;
    }
  });

  useEffect(() => { modalRef.current?.focus(); }, []);

  // --- dragging (the panel stays movable) ----------------------------------
  const startDrag = (event) => {
    const rect = modalRef.current?.getBoundingClientRect();
    dragRef.current = {
      dx: event.clientX - (rect?.left || 0),
      dy: event.clientY - (rect?.top || 0)
    };
    const onMove = (e) => {
      if (!dragRef.current) return;
      const box = modalRef.current?.getBoundingClientRect();
      const maxX = window.innerWidth - (box?.width || 320) - 8;
      const maxY = window.innerHeight - (box?.height || 380) - 8;
      setPosition({
        x: Math.min(Math.max(8, e.clientX - dragRef.current.dx), Math.max(8, maxX)),
        y: Math.min(Math.max(8, e.clientY - dragRef.current.dy), Math.max(8, maxY))
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const Btn = ({ label, onClick, className = '', title }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-11 rounded-lg text-base font-bold transition shadow-sm border ${className}`}
    >
      {label}
    </button>
  );

  const shellStyle = position
    ? { position: 'fixed', left: `${position.x}px`, top: `${position.y}px`, margin: 0 }
    : undefined;

  if (minimised) {
    return (
      <div
        ref={modalRef}
        tabIndex={-1}
        style={shellStyle || { position: 'fixed', right: '1rem', bottom: '1rem' }}
        className="z-50 bg-white rounded-lg shadow-2xl border border-slate-200 w-56 outline-none"
        role="dialog"
        aria-label={t('calculator.title')}
      >
        <div className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between rounded-t-lg cursor-move" onMouseDown={startDrag}>
          <span className="font-bold text-xs flex items-center space-x-2">
            <Calculator className="w-3.5 h-3.5 text-blue-400" />
            <span>{t('calculator.title')}</span>
          </span>
          <div className="flex items-center space-x-1">
            <button onClick={() => setMinimised(false)} className="text-slate-400 hover:text-white p-1 rounded" aria-label={t('calculator.restore')}>
              <GripHorizontal className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded" aria-label={t('common.close')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="px-3 py-2 text-right font-mono text-sm text-slate-700 truncate">{display}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={modalRef}
        tabIndex={-1}
        style={shellStyle}
        className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden outline-none"
        role="dialog"
        aria-label={t('calculator.title')}
      >
        <div
          className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between cursor-move"
          onMouseDown={startDrag}
        >
          <h3 className="font-bold text-sm flex items-center space-x-2">
            <Calculator className="w-4 h-4 text-blue-400" />
            <span>{t('calculator.title')}</span>
          </h3>
          <div className="flex items-center space-x-1">
            <button onClick={() => setMinimised(true)} className="text-slate-400 hover:text-white p-1 rounded transition" aria-label={t('calculator.minimise')} title={t('calculator.minimise')}>
              <Minus className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition" aria-label={t('common.close')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-slate-900 text-white rounded-lg px-3 py-3 text-right">
            <div className="text-[10px] text-slate-400 h-3 font-mono">
              {accumulator ? `${formatResult(accumulator.value)} ${accumulator.op}` : ''}
            </div>
            <div className="text-2xl font-mono font-bold truncate" data-testid="calculator-display">{display}</div>
            <div className="text-[10px] text-rose-300 h-3 font-mono">{error}</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Btn label="C" onClick={clearAll} title={t('calculator.clear')} className="bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100" />
            <Btn label="CE" onClick={clearEntry} title={t('calculator.clear_entry')} className="bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" />
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

            <Btn label="±" onClick={negate} className="bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" />
            <Btn label="0" onClick={() => inputDigit('0')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="." onClick={() => inputDigit('.')} className="bg-white text-slate-800 border-slate-200 hover:bg-slate-50" />
            <Btn label="=" onClick={equals} className="bg-blue-600 text-white border-blue-600 hover:bg-blue-500" />
          </div>

          <p className="text-[10px] text-slate-400 text-center">{t('calculator.hint')}</p>
        </div>
      </div>
    </div>
  );
}
