/**
 * receiptLayout.js — the paper, the spacing and what goes on the receipt.
 *
 * This file holds no React and touches no DOM, so the rules are unit-tested
 * in Node (tests/receipt-layout.test.js). It describes a receipt; it does not
 * print one, and it never reads or writes a transaction.
 *
 * A receipt is described by a LAYOUT, and a layout belongs to the computer it
 * was set on and to the application it was set in. Two things follow:
 *
 *   - A thermal printer on the till and an A4 printer in the back office are
 *     different machines. Their layouts are saved separately and neither
 *     overwrites the other.
 *   - The same is true of the applications. A Seller who sets a 58 mm roll
 *     must not find that an Admin saving an 80 mm layout has changed the
 *     till's receipt. Layouts are keyed by application, so Seller and Admin
 *     keep their own.
 */

/** The paper sizes JENESIS knows about. */
export const PAPER_SIZES = {
  '58mm': { id: '58mm', widthMm: 58, roll: true, labelKey: 'printing.paper_58' },
  '80mm': { id: '80mm', widthMm: 80, roll: true, labelKey: 'printing.paper_80' },
  A4: { id: 'A4', widthMm: 210, heightMm: 297, roll: false, labelKey: 'printing.paper_a4' },
  custom: { id: 'custom', widthMm: 80, roll: true, labelKey: 'printing.paper_custom' }
};

/** Fonts a thermal printer can be relied on to have. */
export const FONT_FAMILIES = [
  { id: 'monospace', stack: '"Courier New", Courier, "DejaVu Sans Mono", monospace', labelKey: 'printing.font_monospace' },
  { id: 'sans', stack: '"DejaVu Sans", Arial, Helvetica, sans-serif', labelKey: 'printing.font_sans' },
  { id: 'serif', stack: '"DejaVu Serif", "Times New Roman", Times, serif', labelKey: 'printing.font_serif' }
];

export const FONT_SIZE_MIN = 7;
export const FONT_SIZE_MAX = 18;
export const LINE_SPACING_MIN = 1;
export const LINE_SPACING_MAX = 2.5;
export const MARGIN_MIN_MM = 0;
export const MARGIN_MAX_MM = 40;

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * The translation key for each switch's label.
 *
 * These are written out one by one rather than built as 'printing.field_' +
 * name, because the translation audit reads the source: a key it cannot see
 * is a key it cannot prove exists in all three languages.
 */
export const RECEIPT_FIELD_LABEL_KEYS = {
  logo: 'printing.field_logo',
  businessName: 'printing.field_businessName',
  address: 'printing.field_address',
  phone: 'printing.field_phone',
  email: 'printing.field_email',
  taxId: 'printing.field_taxId',
  title: 'printing.field_title',
  documentNumber: 'printing.field_documentNumber',
  date: 'printing.field_date',
  cashier: 'printing.field_cashier',
  customer: 'printing.field_customer',
  itemDetails: 'printing.field_itemDetails',
  taxBreakdown: 'printing.field_taxBreakdown',
  totals: 'printing.field_totals',
  paymentMethod: 'printing.field_paymentMethod',
  footer: 'printing.field_footer',
  cutLine: 'printing.field_cutLine'
};

/** Every switch that decides whether a piece of the receipt appears. */
export const RECEIPT_FIELDS = [
  'logo',
  'businessName',
  'address',
  'phone',
  'email',
  'taxId',
  'title',
  'documentNumber',
  'date',
  'cashier',
  'customer',
  'itemDetails',
  'taxBreakdown',
  'totals',
  'paymentMethod',
  'footer',
  'cutLine'
];

/**
 * A complete, safe layout. Every field is present and inside its limits, so
 * nothing downstream has to guard against a half-written configuration.
 */
export function defaultReceiptLayout(overrides) {
  const show = {};
  for (const field of RECEIPT_FIELDS) show[field] = true;
  // A cut line is a thermal-printer instruction; it is noise on an A4 sheet.
  show.cutLine = true;

  const base = {
    paper: '80mm',
    customWidthMm: 80,
    customHeightMm: 0,              // 0 means a continuous roll
    printerName: null,              // null means the computer's default printer
    fontSize: 10,
    fontFamily: 'monospace',
    bold: false,
    lineSpacing: 1.35,
    marginTopMm: 3,
    marginRightMm: 3,
    marginBottomMm: 3,
    marginLeftMm: 3,
    align: 'center',                // how the heading block sits
    logoAlign: 'center',
    title: 'SALES RECEIPT',
    footerMessage: 'Thank you for your business!',
    copies: 1,
    show
  };

  return normaliseReceiptLayout({ ...base, ...overrides, show: { ...show, ...((overrides && overrides.show) || {}) } });
}

/**
 * Brings any saved layout back within its limits. A configuration file is
 * edited by hand and copied between machines, so it is treated as untrusted:
 * a field that is missing falls back to the default, and one that is out of
 * range is pulled back in rather than being allowed to produce a receipt
 * nothing can print.
 */
export function normaliseReceiptLayout(input) {
  // A saved layout is copied between machines and edited by hand, and a
  // caller may pass nothing at all. Treat it as untrusted: missing falls back
  // to the default, and out-of-range is pulled back rather than allowed to
  // produce a receipt nothing can print.
  const raw = input && typeof input === 'object' ? input : {};
  const paper = PAPER_SIZES[raw.paper] ? raw.paper : '80mm';

  const show = {};
  const incoming = raw.show && typeof raw.show === 'object' ? raw.show : {};
  for (const field of RECEIPT_FIELDS) show[field] = bool(incoming[field], true);

  // An unknown font falls back to monospace, which every thermal printer has.
  const fontFamily = FONT_FAMILIES.some((f) => f.id === raw.fontFamily) ? raw.fontFamily : 'monospace';

  return {
    paper,
    customWidthMm: clamp(raw.customWidthMm, 20, 400, 80),
    customHeightMm: clamp(raw.customHeightMm, 0, 2000, 0),
    printerName: typeof raw.printerName === 'string' && raw.printerName ? raw.printerName : null,
    fontSize: clamp(raw.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, 10),
    fontFamily,
    bold: bool(raw.bold, false),
    lineSpacing: clamp(raw.lineSpacing, LINE_SPACING_MIN, LINE_SPACING_MAX, 1.35),
    marginTopMm: clamp(raw.marginTopMm, MARGIN_MIN_MM, MARGIN_MAX_MM, 3),
    marginRightMm: clamp(raw.marginRightMm, MARGIN_MIN_MM, MARGIN_MAX_MM, 3),
    marginBottomMm: clamp(raw.marginBottomMm, MARGIN_MIN_MM, MARGIN_MAX_MM, 3),
    marginLeftMm: clamp(raw.marginLeftMm, MARGIN_MIN_MM, MARGIN_MAX_MM, 3),
    align: ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'center',
    logoAlign: ['left', 'center', 'right'].includes(raw.logoAlign) ? raw.logoAlign : 'center',
    title: typeof raw.title === 'string' ? raw.title.slice(0, 60) : 'SALES RECEIPT',
    footerMessage: typeof raw.footerMessage === 'string' ? raw.footerMessage.slice(0, 200) : '',
    copies: Math.round(clamp(raw.copies, 1, 10, 1)),
    show
  };
}

/** How wide the printed page is, in millimetres, given the layout. */
export function pageWidthMm(layout) {
  if (layout.paper === 'custom') return layout.customWidthMm;
  return PAPER_SIZES[layout.paper].widthMm;
}

/** How tall the page is. A roll has no fixed height, which is 0 here. */
export function pageHeightMm(layout) {
  if (layout.paper === 'custom') return layout.customHeightMm;
  const size = PAPER_SIZES[layout.paper];
  return size.roll ? 0 : (size.heightMm || 0);
}

/** True when the paper is a continuous roll rather than a cut sheet. */
export function isRoll(layout) {
  return pageHeightMm(layout) === 0;
}

/**
 * How many characters fit across the line, which is what decides whether a
 * long product name is wrapped or truncated. Monospace advances by 0.6 of the
 * font size, which is the usual rule for a fixed-pitch font.
 */
export function charactersPerLine(layout, fontFamily) {
  const width = pageWidthMm(layout) - layout.marginLeftMm - layout.marginRightMm;
  const usableMm = Math.max(10, width);
  const fontSizePt = layout.fontSize;
  const advance = fontFamily === 'monospace' ? 0.6 : 0.5;
  const charWidthMm = (fontSizePt * advance * 25.4) / 72;
  return Math.max(12, Math.floor(usableMm / charWidthMm));
}

/**
 * Lays the settings out as groups, so the screen and the printer agree on
 * what belongs in which section.
 */
export const RECEIPT_SETTING_GROUPS = [
  { id: 'printer', fields: ['printerName'] },
  { id: 'paper', fields: ['paper', 'customWidthMm', 'customHeightMm'] },
  { id: 'appearance', fields: ['fontSize', 'fontFamily', 'bold', 'lineSpacing'] },
  { id: 'margins', fields: ['marginTopMm', 'marginRightMm', 'marginBottomMm', 'marginLeftMm'] },
  { id: 'content', fields: ['title', 'footerMessage'] },
  { id: 'fields', fields: RECEIPT_FIELDS },
  { id: 'copies', fields: ['copies'] }
];
