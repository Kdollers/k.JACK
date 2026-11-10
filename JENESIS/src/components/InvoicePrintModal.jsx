import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAppMode } from '../context/AppModeContext';
import { useEscapeLayer } from '../context/ShortcutsContext';
import { useI18n } from '../i18n';
import { Printer, X, Download, Receipt } from 'lucide-react';
import JenesisLogo from './JenesisLogo';
import { buildReceiptHtml } from '../receipt/buildReceiptHtml.js';
import { defaultReceiptLayout, normaliseReceiptLayout } from '../receipt/receiptLayout.js';
import useReceiptPrinting from '../receipt/useReceiptPrinting.js';

export default function InvoicePrintModal({ invoice, onClose, type = 'INVOICE' }) {
  const { currentCompany, formatCurrency, formatDate, currentUser } = useApp();
  const { t } = useI18n();
  // Printed documents carry the mark of the application that issued them:
  // red in JENESIS Seller, blue in JENESIS Accounting & Business.
  const { app } = useAppMode();
  const markTone = app?.tone || 'brand';

  // Escape closes the print preview (the same document F3 prints).
  useEscapeLayer({ id: 'print-modal', priority: 100, onEscape: () => { onClose(); return true; } });

  if (!invoice) return null;

  const isSale = type === 'INVOICE';
  const docTitle = isSale ? t('sales.print_invoice') : t('purchases.print_bill');
  const numberLabel = isSale ? t('sales.invoice_number') : t('purchases.bill_number');
  const docNumber = isSale ? invoice.invoice_number : invoice.bill_number;
  const partyName = isSale ? invoice.customer_name : invoice.supplier_name;
  const partyAddress = isSale ? invoice.customer_address : invoice.supplier_address;
  const partyPhone = isSale ? invoice.customer_phone : invoice.supplier_phone;
  const partyEmail = isSale ? invoice.customer_email : invoice.supplier_email;
  const partyTaxId = isSale ? invoice.customer_tax_id : invoice.supplier_tax_id;

  const handlePrint = () => {
    window.print();
  };

  // Printing a till receipt uses this application's saved receipt layout on
  // this computer. It is READ ONLY: the document already exists and nothing
  // about it changes. Printing twice gives two pieces of paper, never two
  // sales.
  const printing = useReceiptPrinting(app?.id || 'seller');
  const [receiptNote, setReceiptNote] = useState(null);

  const handlePrintReceipt = async () => {
    setReceiptNote(null);
    const stored = await printing.loadLayout();
    const layout = normaliseReceiptLayout(stored || defaultReceiptLayout());

    const doc = {
      number: docNumber,
      date: invoice.date,
      cashier: currentUser?.full_name || '',
      partyName: partyName,
      paymentMethod: invoice.payment_method || '',
      currency: currentCompany?.currency_code || '',
      subtotal: invoice.subtotal,
      taxTotal: invoice.tax_total,
      discountTotal: invoice.discount_total,
      total: invoice.total,
      amountPaid: invoice.amount_paid,
      change: 0,
      lines: (invoice.lines || []).map((l) => ({
        sku: l.product_sku,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unit_price,
        lineTotal: l.line_total
      }))
    };

    const html = buildReceiptHtml(doc, {
      name: currentCompany?.name,
      address: currentCompany?.address,
      phone: currentCompany?.phone,
      email: currentCompany?.email,
      taxId: currentCompany?.tax_id
    }, layout, {
      labels: {
        'printing.phone': t('common.tel'),
        'printing.tax_id': t('print.tin_tax_id'),
        'printing.number': numberLabel,
        'printing.date': t('common.date'),
        'printing.cashier': t('printing.field_cashier'),
        'printing.customer': isSale ? t('sales.bill_to') : t('printing.field_customer'),
        'printing.subtotal': t('common.subtotal'),
        'printing.tax': t('common.tax'),
        'printing.discount': t('common.discount'),
        'printing.total': t('common.total'),
        'printing.paid': t('printing.field_paymentMethod'),
        'printing.change': t('printing.change'),
        'printing.method': t('printing.method'),
        'printing.returned': t('printing.returned'),
        'printing.includes_returns': t('printing.includes_returns')
      }
    });

    const result = await printing.printReceipt(html, layout);
    setReceiptNote(result.ok ? { ok: true, text: t('printing.sent') } : { ok: false, text: result.error });
    setTimeout(() => setReceiptNote(null), 4000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden print:m-0 print:p-0 print:shadow-none print:w-full">
        {/* Modal Controls (Hidden in Print) */}
        <div className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between print:hidden">
          <div className="font-semibold text-sm flex items-center space-x-2">
            <span>{docTitle}</span>
            <span className="text-blue-400 font-mono">#{docNumber}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrintReceipt}
              disabled={printing.busy}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center space-x-1.5 transition disabled:opacity-50"
              title={t('printing.print_now')}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>{t('print.print_receipt')}</span>
            </button>
            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center space-x-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('common.print')}</span>
            </button>
            {/* The result of a receipt print. Plain accent text on the
                toolbar's own dark bar, so it reads in both themes. */}
            {receiptNote ? (
              <span className={`text-[10px] font-semibold px-2 py-1 rounded ${
                receiptNote.ok ? 'text-emerald-300' : 'text-rose-200'
              }`}>
                {receiptNote.text}
              </span>
            ) : null}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Page */}
        <div className="p-8 sm:p-12 text-slate-800 bg-white min-h-[600px] flex flex-col justify-between" id="printable-area">
          <div>
            {/* Header: Company & Doc Title */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <JenesisLogo tone={markTone} size={30} />
                  <div className="leading-tight">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                      {currentCompany?.name || 'JENESIS'}
                    </h1>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      JENESIS
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                  {currentCompany?.address || 'Kigali, Rwanda'}
                  <br />
                  {currentCompany?.phone && `${t('common.tel')} ${currentCompany.phone}`}
                  {currentCompany?.email && ` • ${t('common.email')}: ${currentCompany.email}`}
                  <br />
                  {currentCompany?.tax_id && (
                    <span className="font-semibold text-slate-700">{t('print.tin_tax_id')} {currentCompany.tax_id}</span>
                  )}
                </p>
              </div>

              <div className="text-right">
                <h2 className="text-2xl font-black text-blue-700 uppercase tracking-wider">
                  {isSale ? 'TAX INVOICE' : 'PURCHASE BILL'}
                </h2>
                <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                  <div>
                    <span className="font-bold text-slate-800">{numberLabel}: </span>
                    <span className="font-mono text-slate-900 font-semibold">{docNumber}</span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">{t('common.date')}: </span>
                    <span className="font-semibold text-slate-800">{formatDate(invoice.date)}</span>
                  </div>
                  {invoice.due_date && (
                    <div>
                      <span className="font-medium text-slate-500">{t('common.due_date')}: </span>
                      <span className="font-semibold text-slate-800">{formatDate(invoice.due_date)}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-slate-500">{t('common.status')}: </span>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-300">
                      {invoice.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bill To Info */}
            <div className="grid grid-cols-2 gap-8 mb-8 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-1">
                  {isSale ? t('sales.bill_to') : 'Vendor / Supplier'}
                </div>
                <div className="text-sm font-bold text-slate-900">{partyName}</div>
                {partyAddress && <div className="text-slate-600 mt-0.5">{partyAddress}</div>}
                {partyPhone && <div className="text-slate-600">{t('common.tel')} {partyPhone}</div>}
                {partyEmail && <div className="text-slate-600">{t('common.email')}: {partyEmail}</div>}
                {partyTaxId && (
                  <div className="font-semibold text-slate-700 mt-1">{t('print.tax_id_tin')} {partyTaxId}</div>
                )}
              </div>

              <div className="text-right flex flex-col justify-end">
                <div className="text-slate-500 text-[11px] mb-1">{t('common.outstanding_due')}:</div>
                <div className="text-xl font-extrabold text-blue-700">
                  {formatCurrency(invoice.balance_due || invoice.total)}
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">{t('common.description')}</th>
                    <th className="py-2.5 px-3 text-right">{t('common.quantity')}</th>
                    <th className="py-2.5 px-3 text-right">{isSale ? t('common.unit_price') : t('common.unit_cost')}</th>
                    {isSale && <th className="py-2.5 px-3 text-right">{t('common.discount')}</th>}
                    <th className="py-2.5 px-3 text-right">{t('common.tax')}</th>
                    <th className="py-2.5 px-3 text-right">{t('common.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoice.lines &&
                    invoice.lines.map((line, idx) => (
                      <tr key={line.id || idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          <div>{line.description}</div>
                          {line.product_sku && (
                            <div className="text-[10px] text-slate-400 font-mono">{t('inventory.sku')}: {line.product_sku}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-800">{line.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {formatCurrency(line.unit_price || line.unit_cost)}
                        </td>
                        {isSale && (
                          <td className="py-2.5 px-3 text-right text-slate-500">
                            {line.discount_percent ? `${line.discount_percent}%` : '-'}
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-right text-slate-600 font-mono">
                          {formatCurrency(line.tax_amount)} ({line.tax_rate}%)
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                          {formatCurrency(line.line_total)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="flex justify-end mb-8">
              <div className="w-72 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600 py-1">
                  <span>{t('common.subtotal')}:</span>
                  <span className="font-semibold text-slate-800 font-mono">{formatCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.discount_total > 0 && (
                  <div className="flex justify-between text-slate-600 py-1">
                    <span>{t('common.discount')}:</span>
                    <span className="font-semibold text-rose-600 font-mono">
                      -{formatCurrency(invoice.discount_total)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 py-1">
                  <span>{t('common.tax')}:</span>
                  <span className="font-semibold text-slate-800 font-mono">{formatCurrency(invoice.tax_total)}</span>
                </div>
                <div className="border-t-2 border-slate-800 pt-2 flex justify-between text-base font-extrabold text-slate-900">
                  <span>{t('common.total')}:</span>
                  <span className="text-blue-700 font-mono">{formatCurrency(invoice.total)}</span>
                </div>
                <div className="flex justify-between text-slate-600 py-1 border-t border-slate-200">
                  <span>{t('common.amount_paid')}:</span>
                  <span className="font-semibold text-emerald-600 font-mono">
                    {formatCurrency(invoice.amount_paid || 0)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 py-1 bg-slate-100 px-2 rounded">
                  <span>{t('common.balance_due')}:</span>
                  <span className="text-rose-600 font-mono">{formatCurrency(invoice.balance_due || 0)}</span>
                </div>
              </div>
            </div>

            {/* Notes & Terms */}
            {invoice.notes && (
              <div className="border-t border-slate-200 pt-4 text-xs text-slate-600 mb-6">
                <div className="font-bold text-slate-700 mb-0.5">{t('common.notes')}:</div>
                <p className="whitespace-pre-line">{invoice.notes}</p>
              </div>
            )}
          </div>

          {/* Footer Declaration */}
          <div className="border-t border-slate-200 pt-6 text-[11px] text-slate-500 flex justify-between items-end">
            <div>
              <p className="font-medium text-slate-600">{t('print.payment_instructions')}</p>
              <p>
                {currentCompany?.phone || currentCompany?.email
                  ? [currentCompany.phone, currentCompany.email].filter(Boolean).join(' • ')
                  : t('print.no_bank_details')}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{t('print.thank_you')}</p>
            </div>
            <div className="text-right">
              <div className="border-b border-slate-400 w-44 mb-1"></div>
              <p className="font-semibold text-slate-700">{t('print.authorized_signature')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
