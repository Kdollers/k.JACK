/**
 * buildReceiptHtml.js — turns a document and a layout into the HTML that is
 * sent to the printer.
 *
 * This file holds no React and touches no DOM, so it is unit-tested in Node
 * (tests/receipt-layout.test.js). It is a pure function: the same document,
 * company and layout always produce the same markup.
 *
 * It is READ ONLY. It reads a document to describe it on paper and changes
 * nothing: no row is inserted, updated or deleted, and no balance moves.
 * Printing a receipt twice produces two pieces of paper, not two transactions.
 *
 * Three things this has to survive, which are the ones that break naive
 * receipt code:
 *
 *   - DECIMAL quantities. Half a kilo is 0.5, not 1. A quantity is printed
 *     with the decimals it carries and no more, so 2.00 is written 2 and
 *     1.25 is written 1.25.
 *   - NEGATIVE lines. A returned item is a minus quantity and a minus amount.
 *     It is printed with a minus sign and marked as a return, so a customer
 *     reading the receipt can see goods went back, not that they were sold a
 *     negative number of things.
 *   - FRENCH and KINYARWANDA. Receipts carry accented and Kinyarwanda text
 *     (café, umucuruzi, amafaranga). The document is declared UTF-8 and the
 *     font stack is chosen for fonts that actually contain those glyphs,
 *     because a missing glyph prints as a box on a thermal printer.
 */

import { pageWidthMm, pageHeightMm, isRoll, charactersPerLine } from './receiptLayout.js';

/** Escapes text so a product name can never inject markup into the receipt. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Writes a quantity with the decimals it actually carries.
 * 2 -> "2", 1.25 -> "1.25", 0.5 -> "0.5", -0.5 -> "-0.5", -1 -> "-1".
 * Trailing zeros are dropped so a whole number does not print as "2.0000",
 * which on a narrow roll is the difference between fitting and wrapping.
 */
export function formatQuantity(value, decimals = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const rounded = Number(n.toFixed(decimals));
  // Avoid a negative zero, which reads as "-0" on paper.
  return String(rounded === 0 ? 0 : rounded);
}

/** True when a line is a return or a correction rather than a sale. */
export function isReturnLine(line = {}) {
  return Number(line.quantity) < 0 || Number(line.lineTotal || line.total) < 0;
}

const FONT_STACKS = {
  monospace: '"Courier New", Courier, "DejaVu Sans Mono", "Liberation Mono", monospace',
  sans: '"DejaVu Sans", Arial, Helvetica, "Liberation Sans", sans-serif',
  serif: '"DejaVu Serif", "Times New Roman", Times, "Liberation Serif", serif'
};

/**
 * Builds the receipt.
 *
 * @param {object} doc      { number, date, partyName, lines[], subtotal,
 *                            taxTotal, total, amountPaid, change, cashier,
 *                            paymentMethod, currency, taxBreakdown[] }
 * @param {object} company  { name, address, phone, email, taxId }
 * @param {object} layout   a normalised receipt layout
 * @param {object} options  { logoDataUrl, labels }
 * @returns {string} a complete HTML document
 */
export function buildReceiptHtml(doc = {}, company = {}, layout, options = {}) {
  const l = layout;
  const labels = options.labels || {};
  const t = (key, fallback) => labels[key] || fallback;

  const width = pageWidthMm(l);
  const height = pageHeightMm(l);
  const roll = isRoll(l);
  const cols = charactersPerLine(l, l.fontFamily);
  const stack = FONT_STACKS[l.fontFamily] || FONT_STACKS.monospace;

  const show = l.show || {};

  const currency = doc.currency || company.currencyCode || '';
  const money = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0.00';
    // A negative amount keeps its minus: a refund reads as a refund.
    const text = Math.abs(n).toFixed(2);
    return (n < 0 ? '-' : '') + text + (currency ? ' ' + escapeHtml(currency) : '');
  };

  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  const returns = lines.filter(isReturnLine);
  const hasReturns = returns.length > 0;

  const page = [
    `@page { size: ${width}mm ${height ? height + 'mm' : 'auto'}; margin: 0; }`,
    `html, body { margin: 0; padding: 0; }`,
    `body {`,
    `  font-family: ${stack};`,
    `  font-size: ${l.fontSize}pt;`,
    `  font-weight: ${l.bold ? '700' : '400'};`,
    `  line-height: ${l.lineSpacing};`,
    `  color: #000;`,
    `  background: #fff;`,
    `  width: ${width}mm;`,
    // The content box is the page minus the margins the user chose.
    `  box-sizing: border-box;`,
    `  padding: ${l.marginTopMm}mm ${l.marginRightMm}mm ${l.marginBottomMm}mm ${l.marginLeftMm}mm;`,
    `}`,
    // On a roll the receipt grows downwards and is cut where it ends; on a cut
    // sheet a long receipt has to be allowed to run onto a second page.
    roll
      ? `.sheet { page-break-inside: auto; }`
      : `.sheet { min-height: ${height}mm; } .page-break { page-break-before: always; }`,
    `.center { text-align: center; }`,
    `.left { text-align: left; }`,
    `.right { text-align: right; }`,
    `.heading { text-align: ${l.align}; }`,
    `.logo { display: block; max-width: 60%; max-height: 25mm; margin: 0 ${l.logoAlign === 'center' ? 'auto' : (l.logoAlign === 'right' ? '0 0 auto' : '0 auto 0 0')}; }`,
    `.business { font-weight: 700; font-size: ${(l.fontSize * 1.3).toFixed(1)}pt; }`,
    `.meta { font-size: ${Math.max(6, l.fontSize - 1).toFixed(1)}pt; }`,
    `.rule { border-top: 1px dashed #000; margin: 2mm 0; }`,
    `.line { display: flex; justify-content: space-between; gap: 2mm; }`,
    `.qty { white-space: nowrap; }`,
    `.desc { flex: 1 1 auto; overflow-wrap: anywhere; }`,
    `.amount { white-space: nowrap; text-align: right; }`,
    // A returned line is marked, so it cannot be read as a sale of -1 thing.
    `.is-return { font-style: italic; }`,
    `.totals { margin-top: 2mm; }`,
    `.total-row { display: flex; justify-content: space-between; }`,
    `.grand { font-weight: 700; font-size: ${(l.fontSize * 1.15).toFixed(1)}pt; }`,
    `.footer { margin-top: 3mm; text-align: center; }`,
    `.cut { margin: 3mm 0 0; text-align: center; font-size: ${Math.max(6, l.fontSize - 2).toFixed(1)}pt; }`,
    // Keep a long item table from being split mid-row on a cut sheet.
    `tr, .line { page-break-inside: avoid; }`
  ].join('\n');

  const parts = [];

  // ---- Heading: who sold it -------------------------------------------
  const heading = [];
  if (show.logo && options.logoDataUrl) {
    heading.push(`<img class="logo" src="${escapeHtml(options.logoDataUrl)}" alt="" />`);
  }
  if (show.businessName && (company.name || company.legalName)) {
    heading.push(`<div class="business">${escapeHtml(company.name || company.legalName)}</div>`);
  }
  const metaBits = [];
  if (show.address && company.address) metaBits.push(escapeHtml(company.address));
  if (show.phone && company.phone) metaBits.push(`${t('printing.phone', 'Tel')}: ${escapeHtml(company.phone)}`);
  if (show.email && company.email) metaBits.push(escapeHtml(company.email));
  if (show.taxId && company.taxId) metaBits.push(`${t('printing.tax_id', 'TIN')}: ${escapeHtml(company.taxId)}`);
  if (metaBits.length) {
    heading.push(`<div class="meta">${metaBits.join('<br />')}</div>`);
  }
  if (heading.length) parts.push(`<div class="heading">${heading.join('\n')}</div>`);

  // ---- Title and the identity of the document --------------------------
  if (show.title && l.title) {
    parts.push(`<div class="rule"></div><div class="heading business">${escapeHtml(l.title)}</div>`);
  }

  const docBits = [];
  if (show.documentNumber && doc.number) {
    docBits.push(`<div class="line"><span>${t('printing.number', 'No')}</span><span>${escapeHtml(doc.number)}</span></div>`);
  }
  if (show.date && doc.date) {
    docBits.push(`<div class="line"><span>${t('printing.date', 'Date')}</span><span>${escapeHtml(doc.date)}</span></div>`);
  }
  if (show.cashier && doc.cashier) {
    docBits.push(`<div class="line"><span>${t('printing.cashier', 'Cashier')}</span><span>${escapeHtml(doc.cashier)}</span></div>`);
  }
  if (show.customer && doc.partyName) {
    docBits.push(`<div class="line"><span>${t('printing.customer', 'Customer')}</span><span>${escapeHtml(doc.partyName)}</span></div>`);
  }
  if (docBits.length) {
    parts.push(`<div class="rule"></div><div>${docBits.join('\n')}</div><div class="rule"></div>`);
  }

  // ---- The items -------------------------------------------------------
  if (lines.length) {
    const rows = lines.map((line) => {
      const qty = formatQuantity(line.quantity);
      const unit = line.unit ? escapeHtml(line.unit) : '';
      const desc = escapeHtml(line.description || line.productName || '');
      // itemDetails off means a short till receipt: description only, no SKU
      // and no unit price, which is what a small roll has room for.
      const detail = show.itemDetails && line.sku ? `<div class="meta">${escapeHtml(line.sku)}</div>` : '';
      const unitPrice = show.itemDetails && Number(line.unitPrice) != null && line.description !== undefined
        ? `<div class="meta">${formatQuantity(line.quantity)} ${unit} × ${money(line.unitPrice)}</div>`
        : '';
      const amount = money(line.lineTotal != null ? line.lineTotal : line.total);
      const ret = isReturnLine(line);
      return [
        `<div class="line${ret ? ' is-return' : ''}">`,
        `  <span class="qty">${escapeHtml(qty)}${unit ? ' ' + unit : ''}</span>`,
        `  <span class="desc">${desc}${detail}${unitPrice}${ret ? `<span class="meta"> — ${escapeHtml(t('printing.returned', 'returned'))}</span>` : ''}</span>`,
        `  <span class="amount">${amount}</span>`,
        `</div>`
      ].join('\n');
    });
    parts.push(`<div class="items">${rows.join('\n')}</div>`);
  }

  // ---- The totals ------------------------------------------------------
  if (show.totals) {
    const rowsOut = [];
    const sub = Number(doc.subtotal);
    if (Number.isFinite(sub)) {
      rowsOut.push(`<div class="total-row"><span>${t('printing.subtotal', 'Subtotal')}</span><span>${money(sub)}</span></div>`);
    }
    if (show.taxBreakdown && Array.isArray(doc.taxBreakdown) && doc.taxBreakdown.length) {
      for (const band of doc.taxBreakdown) {
        rowsOut.push(
          `<div class="total-row"><span>${escapeHtml(band.label || t('printing.tax', 'Tax'))}</span><span>${money(band.amount)}</span></div>`
        );
      }
    } else if (show.taxBreakdown) {
      const tax = Number(doc.taxTotal);
      if (Number.isFinite(tax) && tax !== 0) {
        rowsOut.push(`<div class="total-row"><span>${t('printing.tax', 'Tax')}</span><span>${money(tax)}</span></div>`);
      }
    }
    if (Number(doc.discountTotal)) {
      rowsOut.push(`<div class="total-row"><span>${t('printing.discount', 'Discount')}</span><span>${money(doc.discountTotal)}</span></div>`);
    }
    rowsOut.push(`<div class="total-row grand"><span>${t('printing.total', 'TOTAL')}</span><span>${money(doc.total)}</span></div>`);

    if (show.paymentMethod) {
      if (doc.amountPaid != null && Number(doc.amountPaid) !== 0) {
        rowsOut.push(`<div class="total-row"><span>${t('printing.paid', 'Paid')}</span><span>${money(doc.amountPaid)}</span></div>`);
      }
      if (doc.change != null && Number(doc.change) !== 0) {
        rowsOut.push(`<div class="total-row"><span>${t('printing.change', 'Change')}</span><span>${money(doc.change)}</span></div>`);
      }
      if (doc.paymentMethod) {
        rowsOut.push(`<div class="total-row"><span>${t('printing.method', 'Method')}</span><span>${escapeHtml(doc.paymentMethod)}</span></div>`);
      }
    }
    if (rowsOut.length) {
      parts.push(`<div class="rule"></div><div class="totals">${rowsOut.join('\n')}</div>`);
    }
  }

  // A receipt that includes a return says so in words, because a shopkeeper
  // handing it over is asked about it.
  if (hasReturns) {
    parts.push(
      `<div class="rule"></div><div class="meta center">${escapeHtml(t('printing.includes_returns', 'Includes returned items'))}</div>`
    );
  }

  // ---- Footer ----------------------------------------------------------
  if (show.footer && l.footerMessage) {
    parts.push(`<div class="rule"></div><div class="footer">${escapeHtml(l.footerMessage)}</div>`);
  }
  if (show.cutLine && roll) {
    parts.push(`<div class="cut">- - - - - - - - - - - - - - -</div>`);
  }

  return [
    `<!DOCTYPE html>`,
    // Declared before anything else: Kinyarwanda and French text is read as
    // UTF-8 or it arrives at the printer as boxes and question marks.
    `<html><head><meta charset="utf-8" />`,
    // The document title names the document and is never printed, so it
    // carries the document number rather than a word needing translation.
    `<title>${escapeHtml(doc.number || doc.reference || '')}</title>`,
    `<style>${page}</style></head>`,
    `<body><div class="sheet">${parts.join('\n')}</div></body></html>`
  ].join('\n');
}

/**
 * Estimates how tall the receipt will be, which is what the preview uses to
 * say whether it fits the paper. An estimate is enough: it decides whether to
 * show a warning, not how the receipt is laid out.
 */
export function estimateReceiptHeightMm(doc = {}, layout) {
  const l = layout;
  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  const lineMm = ((l.fontSize * l.lineSpacing) * 25.4) / 72;
  let mm = l.marginTopMm + l.marginBottomMm;
  mm += lineMm * 4;                                   // heading
  mm += l.show.title ? lineMm * 2 : 0;
  mm += lineMm * 3;                                   // number, date, customer
  // A line with a unit-price sub-line occupies two rows.
  mm += lines.length * lineMm * (l.show.itemDetails ? 2 : 1);
  mm += l.show.totals ? lineMm * 5 : 0;
  mm += l.show.footer ? lineMm * 2 : 0;
  return Math.round(mm * 10) / 10;
}
