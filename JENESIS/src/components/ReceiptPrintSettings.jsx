/**
 * ReceiptPrintSettings.jsx — choosing a printer and shaping the receipt.
 *
 * The brief asks for five things here: pick a printer and print a test page;
 * choose the paper (58 mm, 80 mm, A4 or a custom width); set how the receipt
 * looks (size, font, spacing, margins, logo) and which details appear; see the
 * receipt before it is printed; and have all of it remembered on this computer
 * per application.
 *
 * Everything is shown as it will print, not described, because the point of a
 * preview is that a shopkeeper can see the shop's name is cut off before a
 * customer is waiting.
 *
 * Nothing here reads or changes a transaction. Changing the paper size does
 * not touch a sale; printing does not post one.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import {
  PAPER_SIZES, FONT_FAMILIES, FONT_SIZE_MIN, FONT_SIZE_MAX,
  LINE_SPACING_MIN, LINE_SPACING_MAX, MARGIN_MAX_MM, RECEIPT_FIELDS,
  RECEIPT_FIELD_LABEL_KEYS,
  defaultReceiptLayout, normaliseReceiptLayout, pageWidthMm, pageHeightMm, isRoll
} from '../receipt/receiptLayout.js';
import { buildReceiptHtml, estimateReceiptHeightMm } from '../receipt/buildReceiptHtml.js';
import useReceiptPrinting, { isDesktopPrinting } from '../receipt/useReceiptPrinting.js';
import { Printer, RefreshCw, Save, Eye, AlertTriangle, CheckCircle2, Wifi, Usb } from 'lucide-react';

/** A small labelled control, used throughout this panel. */
function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span> : null}
    </label>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, suffix }) {
  return (
    <span className="flex items-center space-x-1">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {suffix ? <span className="text-[10px] text-slate-400 whitespace-nowrap">{suffix}</span> : null}
    </span>
  );
}

export default function ReceiptPrintSettings({ appId, sampleDocument, company, logoDataUrl }) {
  const { t } = useI18n();
  const [layout, setLayout] = useState(() => defaultReceiptLayout());
  const [saved, setSaved] = useState(null);        // 'saved' | 'error' | null
  const [message, setMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const frameRef = useRef(null);

  const printing = useReceiptPrinting(appId);

  // Load the layout this application saved on this computer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await printing.loadLayout();
      if (!cancelled && stored) setLayout(normaliseReceiptLayout(stored));
    })();
    return () => { cancelled = true; };
  }, [printing.loadLayout]);

  const update = useCallback((patch) => {
    setLayout((prev) => normaliseReceiptLayout({ ...prev, ...patch }));
    setSaved(null);
  }, []);

  const toggleField = useCallback((field, on) => {
    setLayout((prev) => ({
      ...prev,
      show: { ...prev.show, [field]: on }
    }));
    setSaved(null);
  }, []);

  const labels = useMemo(() => ({
    'printing.phone': t('printing.phone'),
    'printing.tax_id': t('printing.tax_id'),
    'printing.number': t('printing.number'),
    'printing.date': t('printing.date'),
    'printing.cashier': t('printing.cashier'),
    'printing.customer': t('printing.customer'),
    'printing.subtotal': t('printing.subtotal'),
    'printing.tax': t('printing.tax'),
    'printing.discount': t('printing.discount'),
    'printing.total': t('printing.total'),
    'printing.paid': t('printing.paid'),
    'printing.change': t('printing.change'),
    'printing.method': t('printing.method'),
    'printing.returned': t('printing.returned'),
    'printing.includes_returns': t('printing.includes_returns')
  }), [t]);

  // The receipt as it will be printed, rebuilt whenever anything changes.
  const html = useMemo(
    () => buildReceiptHtml(sampleDocument, company, layout, { logoDataUrl, labels }),
    [sampleDocument, company, layout, logoDataUrl, labels]
  );

  // Paint the preview from the same HTML the printer will receive, so what is
  // shown is exactly what prints.
  useEffect(() => {
    if (!showPreview || !frameRef.current) return;
    try {
      const doc = frameRef.current.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(html);
      doc.close();
    } catch (_) { /* the preview is best-effort */ }
  }, [showPreview, html]);

  const estimatedMm = estimateReceiptHeightMm(sampleDocument, layout);
  const sheetH = pageHeightMm(layout);
  const overflows = !isRoll(layout) && sheetH > 0 && estimatedMm > sheetH;

  const handleSave = async () => {
    const ok = await printing.saveLayout(layout);
    setSaved(ok ? 'saved' : 'error');
    setMessage(ok ? t('printing.saved') : t('printing.save_failed'));
    setTimeout(() => setSaved(null), 3000);
  };

  const handleTest = async () => {
    const result = await printing.printTest(layout);
    setSaved(result.ok ? 'saved' : 'error');
    setMessage(result.ok ? t('printing.test_sent') : result.error);
    setTimeout(() => { setSaved(null); setMessage(''); }, 4000);
  };

  const handlePrint = async () => {
    const result = await printing.printReceipt(html, layout);
    setSaved(result.ok ? 'saved' : 'error');
    setMessage(result.ok ? t('printing.sent') : result.error);
    setTimeout(() => { setSaved(null); setMessage(''); }, 4000);
  };

  const chosen = layout.printerName;
  const chosenPrinter = printing.printers.find((p) => p.name === chosen);

  return (
    <div className="space-y-5">
      {/* ---------------- Status line ---------------- */}
      {saved ? (
        <div className={`flex items-start space-x-2 px-3 py-2 rounded-lg text-xs ${
          saved === 'saved' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {saved === 'saved'
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>{message}</span>
        </div>
      ) : null}

      {!printing.desktop ? (
        <div className="flex items-start space-x-2 px-3 py-2 rounded-lg text-xs bg-amber-50 text-amber-900 border border-amber-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t('printing.browser_mode_note')}</span>
        </div>
      ) : null}

      {/* ---------------- 1. The printer ---------------- */}
      <section className="border border-slate-200 rounded-xl p-4 bg-white">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2 mb-3">
          <Printer className="w-4 h-4 text-slate-500" />
          <span>{t('printing.section_printer')}</span>
        </h3>

        <div className="flex items-end space-x-2">
          <div className="flex-1">
            <Field label={t('printing.printer')} hint={t('printing.printer_hint')}>
              <select
                value={chosen || ''}
                onChange={(e) => update({ printerName: e.target.value || null })}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{t('printing.printer_default')}</option>
                {printing.printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName}{p.available ? '' : ' — ' + t('printing.unavailable')}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            type="button"
            onClick={printing.refreshPrinters}
            className="px-2 py-1.5 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50"
            title={t('printing.refresh_printers')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Every printer is listed, including the ones that cannot print: a
            printer that has silently vanished is far more confusing than one
            shown greyed out with a reason. */}
        {printing.printers.length ? (
          <ul className="mt-3 space-y-1">
            {printing.printers.map((p) => (
              <li key={p.name} className="flex items-center space-x-2 text-[11px]">
                {p.available
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                <span className={p.available ? 'text-slate-700' : 'text-slate-400 line-through'}>
                  {p.displayName}
                </span>
                {p.isDefault ? <span className="text-slate-400">({t('printing.default')})</span> : null}
                {!p.available && p.statusText ? (
                  <span className="text-amber-600">— {p.statusText}</span>
                ) : null}
                {/* USB and network printers look identical to the spooler, so
                    the name is the only hint; both are simply listed. */}
                {/\\\\|http|:\d+|IP_|WSD/.test(p.name)
                  ? <Wifi className="w-3 h-3 text-slate-400" title={t('printing.network_printer')} />
                  : <Usb className="w-3 h-3 text-slate-400" title={t('printing.local_printer')} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[11px] text-slate-400">{t('printing.no_printers')}</p>
        )}

        {chosenPrinter && !chosenPrinter.available ? (
          <p className="mt-2 text-[11px] text-amber-700">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            {t('printing.printer_unavailable_warning')}
          </p>
        ) : null}

        <div className="mt-3 flex space-x-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={printing.busy}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t('printing.print_test')}
          </button>
        </div>
      </section>

      {/* ---------------- 2. The paper ---------------- */}
      <section className="border border-slate-200 rounded-xl p-4 bg-white">
        <h3 className="text-sm font-bold text-slate-900 mb-3">{t('printing.section_paper')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.values(PAPER_SIZES).map((size) => (
            <button
              key={size.id}
              type="button"
              onClick={() => update({ paper: size.id })}
              className={`px-2 py-2 rounded-lg border text-xs font-semibold transition ${
                layout.paper === size.id
                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t(size.labelKey)}
            </button>
          ))}
        </div>

        {layout.paper === 'custom' ? (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label={t('printing.width_mm')}>
              <NumberInput value={layout.customWidthMm} min={20} max={400}
                onChange={(v) => update({ customWidthMm: v })} suffix="mm" />
            </Field>
            <Field label={t('printing.height_mm')} hint={t('printing.height_mm_hint')}>
              <NumberInput value={layout.customHeightMm} min={0} max={2000}
                onChange={(v) => update({ customHeightMm: v })} suffix="mm" />
            </Field>
          </div>
        ) : null}

        <p className="mt-2 text-[11px] text-slate-400">
          {t('printing.page_size_is')} {pageWidthMm(layout)} mm
          {isRoll(layout) ? ' — ' + t('printing.continuous_roll') : ` × ${pageHeightMm(layout)} mm`}
        </p>
      </section>

      {/* ---------------- 3. How it looks ---------------- */}
      <section className="border border-slate-200 rounded-xl p-4 bg-white">
        <h3 className="text-sm font-bold text-slate-900 mb-3">{t('printing.section_appearance')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label={t('printing.font_size')}>
            <NumberInput value={layout.fontSize} min={FONT_SIZE_MIN} max={FONT_SIZE_MAX}
              onChange={(v) => update({ fontSize: v })} suffix="pt" />
          </Field>
          <Field label={t('printing.font_family')}>
            <select
              value={layout.fontFamily}
              onChange={(e) => update({ fontFamily: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.id} value={f.id}>{t(f.labelKey)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('printing.line_spacing')}>
            <NumberInput value={layout.lineSpacing} min={LINE_SPACING_MIN} max={LINE_SPACING_MAX}
              step={0.05} onChange={(v) => update({ lineSpacing: v })} />
          </Field>
        </div>

        <label className="flex items-center space-x-2 mt-3 text-xs text-slate-700">
          <input type="checkbox" checked={layout.bold}
            onChange={(e) => update({ bold: e.target.checked })}
            className="rounded border-slate-300" />
          <span>{t('printing.bold')}</span>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {[['marginTopMm', 'printing.margin_top'], ['marginRightMm', 'printing.margin_right'],
            ['marginBottomMm', 'printing.margin_bottom'], ['marginLeftMm', 'printing.margin_left']].map(([key, labelKey]) => (
            <Field key={key} label={t(labelKey)}>
              <NumberInput value={layout[key]} min={0} max={MARGIN_MAX_MM}
                onChange={(v) => update({ [key]: v })} suffix="mm" />
            </Field>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label={t('printing.heading_align')}>
            <select value={layout.align} onChange={(e) => update({ align: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="left">{t('common.left')}</option>
              <option value="center">{t('common.center')}</option>
              <option value="right">{t('common.right')}</option>
            </select>
          </Field>
          <Field label={t('printing.logo_align')}>
            <select value={layout.logoAlign} onChange={(e) => update({ logoAlign: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="left">{t('common.left')}</option>
              <option value="center">{t('common.center')}</option>
              <option value="right">{t('common.right')}</option>
            </select>
          </Field>
        </div>
      </section>

      {/* ---------------- 4. What appears ---------------- */}
      <section className="border border-slate-200 rounded-xl p-4 bg-white">
        <h3 className="text-sm font-bold text-slate-900 mb-3">{t('printing.section_content')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('printing.receipt_title')}>
            <input type="text" value={layout.title} maxLength={60}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </Field>
          <Field label={t('printing.footer_message')}>
            <input type="text" value={layout.footerMessage} maxLength={200}
              onChange={(e) => update({ footerMessage: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </Field>
        </div>

        <Field label={t('printing.copies')}>
          <NumberInput value={layout.copies} min={1} max={10}
            onChange={(v) => update({ copies: v })} />
        </Field>

        <p className="text-[11px] font-semibold text-slate-600 mt-4 mb-2">{t('printing.fields_shown')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
          {RECEIPT_FIELDS.map((field) => (
            <label key={field} className="flex items-center space-x-2 text-xs text-slate-700">
              <input type="checkbox" checked={!!layout.show[field]}
                onChange={(e) => toggleField(field, e.target.checked)}
                className="rounded border-slate-300" />
              <span>{t(RECEIPT_FIELD_LABEL_KEYS[field])}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ---------------- 5. Preview and save ---------------- */}
      <section className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900">{t('printing.section_preview')}</h3>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showPreview ? t('printing.hide_preview') : t('printing.show_preview')}</span>
          </button>
        </div>

        {showPreview ? (
          <div>
            {/* The preview is the print document itself, at true size, so the
                alignment and the type sizes are the ones the printer gets. */}
            <div className="flex justify-center bg-slate-100 rounded-lg p-4 overflow-auto max-h-[520px]">
              <div style={{ width: pageWidthMm(layout) + 'mm' }} className="shadow-lg">
                <iframe
                  ref={frameRef}
                  title="receipt-preview"
                  style={{
                    width: pageWidthMm(layout) + 'mm',
                    height: Math.max(80, isRoll(layout) ? estimatedMm : pageHeightMm(layout)) + 'mm',
                    border: 0,
                    background: '#fff'
                  }}
                />
              </div>
            </div>

            <div className="mt-2 flex items-start space-x-2 text-[11px]">
              {overflows ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-amber-700">
                    {t('printing.too_long')} {estimatedMm} mm {t('printing.on_a_sheet_of')} {pageHeightMm(layout)} mm.
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-emerald-700">
                    {t('printing.fits')} {estimatedMm} mm.
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="mt-2 text-xs text-slate-500 hover:text-slate-800"
            >
              {t('printing.back_to_settings')}
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">{t('printing.preview_hint')}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 flex items-center space-x-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t('printing.save_layout')}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing.busy}
            className="px-4 py-2 text-xs font-semibold rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t('printing.print_now')}</span>
          </button>
        </div>

        <p className="mt-2 text-[11px] text-slate-400">{t('printing.saved_per_app')}</p>
      </section>
    </div>
  );
}
