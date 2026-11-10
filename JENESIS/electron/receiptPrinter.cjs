'use strict';
/**
 * receiptPrinter.cjs — the main-process side of receipt printing.
 *
 * The renderer cannot reach a printer: it runs in a sandbox with no access to
 * the operating system's print spooler. So the renderer hands this module the
 * finished receipt, and this module talks to Windows.
 *
 * Three jobs:
 *
 *   1. LIST the printers this computer actually has, including USB and network
 *      printers, and say which one is unavailable so the user is not left
 *      choosing a printer that cannot print.
 *   2. PRINT a receipt to a chosen printer, silently or with the system
 *      dialog.
 *   3. REMEMBER each application's layout on this computer, without one
 *      application overwriting another's.
 *
 * Printing is READ ONLY. It renders an HTML document and hands it to the
 * spooler. No database is opened here, no row is written, and no balance
 * moves: printing a receipt a second time produces a second piece of paper,
 * never a second transaction.
 */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, webContents } = require('electron');

/** Where this computer keeps its receipt layouts. */
function prefsPath() {
  return path.join(app.getPath('userData'), 'receipt-layouts.json');
}

/**
 * Reads the whole preferences file. A corrupt or absent file is not an error:
 * it means nobody has saved a layout yet, so every application just uses its
 * default. Printing must never be blocked by a preferences file.
 */
function readAllPrefs() {
  try {
    const raw = fs.readFileSync(prefsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeAllPrefs(all) {
  try {
    // Write to a temporary file and rename, so an interrupted write cannot
    // leave a half-written file where the layouts used to be.
    const target = prefsPath();
    const tmp = target + '.tmp';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf8');
    fs.renameSync(tmp, target);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * The layout for one application on this computer.
 *
 * Applications are kept apart by key: 'seller', 'admin', 'maintenance',
 * 'settings'. A Seller setting a 58 mm roll on the till and an Admin setting
 * an 80 mm layout in the back office are two different records, and neither
 * can change the other.
 */
function loadLayout(appId) {
  const all = readAllPrefs();
  return all[appId] || null;
}

function saveLayout(appId, layout) {
  const all = readAllPrefs();
  all[appId] = layout;
  return writeAllPrefs(all);
}

/**
 * Lists the printers on this computer.
 *
 * Every printer is reported, including ones that are offline, out of paper or
 * otherwise unavailable, because the user needs to SEE the printer to know it
 * is unavailable rather than wondering why it has vanished from the list.
 */
async function listPrinters() {
  try {
    // A window is needed to reach the printer list; any window will do.
    const contents =
      (BrowserWindow.getAllWindows()[0] && BrowserWindow.getAllWindows()[0].webContents) ||
      webContents.getAllWebContents()[0];
    if (!contents) return { printers: [], error: 'NO_WINDOW' };

    const printers = await contents.getPrintersAsync();
    return {
      printers: printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description || '',
        status: p.status || 0,
        isDefault: !!p.isDefault,
        // A printer is unavailable when the spooler says it is not idle or
        // not ready. Showing it greyed out with a reason is more use than
        // hiding it, which makes the printer look deleted.
        available: p.status === 0,
        statusText: describePrinterStatus(p.status || 0)
      })),
      error: null
    };
  } catch (err) {
    return { printers: [], error: err && err.message ? err.message : String(err) };
  }
}

/** Translates the spooler's status bits into a reason a person can read. */
function describePrinterStatus(status) {
  if (status === 0) return '';
  const reasons = [];
  if (status & 0x00000001) reasons.push('paused');
  if (status & 0x00000002) reasons.push('error');
  if (status & 0x00000004) reasons.push('pending deletion');
  if (status & 0x00000008) reasons.push('paper jam');
  if (status & 0x00000010) reasons.push('out of paper');
  if (status & 0x00000020) reasons.push('manual feed');
  if (status & 0x00000040) reasons.push('paper problem');
  if (status & 0x00000080) reasons.push('offline');
  if (status & 0x00000100) reasons.push('input/output active');
  if (status & 0x00000200) reasons.push('busy');
  if (status & 0x00000400) reasons.push('printing');
  if (status & 0x00000800) reasons.push('output bin full');
  if (status & 0x00001000) reasons.push('not available');
  if (status & 0x00002000) reasons.push('waiting');
  if (status & 0x00004000) reasons.push('processing');
  if (status & 0x00008000) reasons.push('initialising');
  if (status & 0x00010000) reasons.push('warming up');
  if (status & 0x00020000) reasons.push('toner low');
  if (status & 0x00040000) reasons.push('no toner');
  if (status & 0x00080000) reasons.push('page punt');
  if (status & 0x00100000) reasons.push('user intervention required');
  if (status & 0x00200000) reasons.push('out of memory');
  if (status & 0x00400000) reasons.push('door open');
  if (status & 0x00800000) reasons.push('server unknown');
  if (status & 0x01000000) reasons.push('power save');
  return reasons.length ? reasons.join(', ') : 'unavailable';
}

/**
 * Prints a receipt.
 *
 * The receipt is rendered in a hidden window and sent straight to the chosen
 * printer. The window is destroyed afterwards, whether or not the print
 * succeeded, so repeated printing does not accumulate windows.
 *
 * @param {object} options
 * @param {string} options.html         the finished receipt document
 * @param {string} [options.printerName] which printer; omitted means default
 * @param {boolean} [options.silent]    print without showing a dialog
 * @param {number} [options.copies]
 * @param {object} [options.margins]    { marginType } Electron margin mode
 * @param {string} [options.pageSize]   'A4', 'A5', or { width, height } microns
 */
function printReceipt(options = {}) {
  const { html, printerName, silent = true, copies = 1, pageSize = null, landscape = false } = options;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { if (win && !win.isDestroyed()) win.destroy(); } catch (_) {}
      resolve(result);
    };

    let win;
    try {
      win = new BrowserWindow({
        show: false,
        width: 400,
        height: 600,
        // The receipt is our own markup; it needs no node integration and must
        // not be able to reach the system.
        webPreferences: { offscreen: false, sandbox: true, contextIsolation: true }
      });
    } catch (err) {
      return finish({ success: false, error: err && err.message ? err.message : String(err) });
    }

    win.webContents.on('did-fail-load', (_e, code, desc) => {
      finish({ success: false, error: `The receipt could not be rendered (${code}: ${desc})` });
    });

    // Load the finished document, then print it once it has painted.
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    win.webContents.once('did-finish-load', () => {
      const printOptions = { silent, copies: Math.max(1, copies || 1), landscape };
      if (printerName) printOptions.deviceName = printerName;
      if (pageSize) printOptions.pageSize = pageSize;

      try {
        win.webContents.print(printOptions, (success, reason) => {
          finish(success ? { success: true } : { success: false, error: reason || 'The printer refused the job.' });
        });
      } catch (err) {
        finish({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });
  });
}

/**
 * Prints a test receipt, so the user can confirm a printer works and is
 * aligned before a customer is waiting. It says plainly that it is a test.
 */
function printTestReceipt(printerName, layout) {
  const when = new Date().toLocaleString();
  const html = [
    '<!DOCTYPE html><html><head><meta charset="utf-8" /><style>',
    `@page { size: ${(layout && layout.paper === 'A4') ? '210mm 297mm' : ((layout && layout.customWidthMm) || 80) + 'mm auto'}; margin: 0; }`,
    'body { font-family: "Courier New", Courier, monospace; font-size: 10pt;',
    '       width: 100%; box-sizing: border-box; padding: 3mm; margin: 0; color: #000; background: #fff; }',
    '.center { text-align: center; } .rule { border-top: 1px dashed #000; margin: 2mm 0; }',
    '</style></head><body>',
    '<div class="center"><strong>TEST RECEIPT</strong></div>',
    '<div class="rule"></div>',
    '<div class="center">JENESIS</div>',
    '<div class="center">Printer test — not a sale</div>',
    '<div class="rule"></div>',
    `<div>Date: ${when}</div>`,
    printerName ? `<div>Printer: ${String(printerName).replace(/[<>&]/g, '')}</div>` : '<div>Printer: default</div>',
    '<div class="rule"></div>',
    '<div>0 1 2 3 4 5 6 7 8 9</div>',
    '<div>1.25 kg &nbsp; 10.75</div>',
    '<div>-0.50 kg &nbsp; -5.00 (return)</div>',
    '<div class="rule"></div>',
    '<div class="center">café · umucuruzi · amafaranga</div>',
    '<div class="center">If you can read this line, the printer works.</div>',
    '</body></html>'
  ].join('\n');

  return printReceipt({ html, printerName, silent: true, copies: 1 });
}

module.exports = {
  prefsPath,
  readAllPrefs,
  writeAllPrefs,
  loadLayout,
  saveLayout,
  listPrinters,
  printReceipt,
  printTestReceipt,
  describePrinterStatus
};
