/**
 * useReceiptPrinting.js — the interface's side of receipt printing.
 *
 * The web interface cannot reach a printer by itself: it runs in a sandbox.
 * When JENESIS is running as a desktop application the work is done through
 * the small, explicit bridge on window.genesisDesktop, and when it is not —
 * a browser on a networked computer, say — it falls back to the browser's own
 * print dialog so printing still works, just without the printer list.
 *
 * The hook never changes a transaction. It renders a document and hands it
 * over. Printing twice gives two pieces of paper, not two sales.
 *
 * Layouts are remembered PER COMPUTER and PER APPLICATION. The application id
 * is part of every request, so a Seller who sets a 58 mm roll on the till can
 * never have it replaced by an Admin saving an 80 mm layout in the back
 * office, even though both are saved on the same machine.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** The bridge the preload script exposes; absent in a plain browser. */
function bridge() {
  try {
    return typeof window !== 'undefined' && window.genesisDesktop && window.genesisDesktop.isDesktop
      ? window.genesisDesktop
      : null;
  } catch (_) {
    return null;
  }
}

export function isDesktopPrinting() {
  return !!bridge();
}

/**
 * @param {string} appId  'seller' | 'maintenance' | 'admin' | 'settings'
 */
export default function useReceiptPrinting(appId) {
  const [printers, setPrinters] = useState([]);
  const [printersError, setPrintersError] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refreshPrinters = useCallback(async () => {
    const b = bridge();
    if (!b || !b.listPrinters) {
      // No bridge: the browser's own dialog will be used instead.
      if (mounted.current) { setPrinters([]); setPrintersError(null); setReady(true); }
      return { printers: [], error: null };
    }
    try {
      const result = await b.listPrinters();
      const list = (result && result.printers) || [];
      if (mounted.current) {
        setPrinters(list);
        setPrintersError((result && result.error) || null);
        setReady(true);
      }
      return result;
    } catch (err) {
      if (mounted.current) {
        setPrinters([]);
        setPrintersError(err && err.message ? err.message : String(err));
        setReady(true);
      }
      return { printers: [], error: String(err) };
    }
  }, []);

  useEffect(() => { refreshPrinters(); }, [refreshPrinters]);

  /** The saved layout for this application on this computer, or null. */
  const loadLayout = useCallback(async () => {
    const b = bridge();
    if (!b || !b.loadReceiptLayout) return null;
    try {
      return await b.loadReceiptLayout(appId);
    } catch (_) {
      return null;
    }
  }, [appId]);

  const saveLayout = useCallback(async (layout) => {
    const b = bridge();
    if (!b || !b.saveReceiptLayout) return false;
    try {
      return await b.saveReceiptLayout(appId, layout);
    } catch (_) {
      return false;
    }
  }, [appId]);

  /**
   * Prints a finished receipt.
   * Returns { ok: true } or { ok: false, error } — never throws, because a
   * failed print must be reported to the user, not crash the till.
   */
  const printReceipt = useCallback(async (html, layout) => {
    const b = bridge();
    setBusy(true);
    try {
      if (b && b.printReceipt) {
        const result = await b.printReceipt({
          html,
          printerName: layout && layout.printerName ? layout.printerName : null,
          silent: true,
          copies: (layout && layout.copies) || 1
        });
        if (result && result.success) return { ok: true };
        return { ok: false, error: (result && result.error) || 'The printer did not accept the receipt.' };
      }
      // No bridge: fall back to the browser's print dialog so a receipt can
      // still be produced from any computer on the network.
      return await printViaBrowser(html);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  /** Prints a test receipt, so a printer can be checked before it is needed. */
  const printTest = useCallback(async (layout) => {
    const b = bridge();
    setBusy(true);
    try {
      if (b && b.printTestReceipt) {
        const result = await b.printTestReceipt({
          printerName: layout && layout.printerName ? layout.printerName : null,
          layout: layout || null
        });
        if (result && result.success) return { ok: true };
        return { ok: false, error: (result && result.error) || 'The test page was not printed.' };
      }
      return { ok: false, error: 'A test page needs the JENESIS desktop application.' };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  return {
    ready,
    busy,
    printers,
    printersError,
    desktop: !!bridge(),
    refreshPrinters,
    loadLayout,
    saveLayout,
    printReceipt,
    printTest
  };
}

/**
 * Prints through the browser's own dialog, in a hidden frame so the document
 * on screen is not disturbed. This is the fallback for a computer that is
 * using JENESIS over the network rather than as an installed application.
 */
function printViaBrowser(html) {
  return new Promise((resolve) => {
    let frame = null;
    try {
      frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      document.body.appendChild(frame);

      frame.onload = () => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          resolve({ ok: true, via: 'browser' });
        } catch (err) {
          resolve({ ok: false, error: err && err.message ? err.message : String(err) });
        } finally {
          // Leave the frame a moment: removing it too early cancels the dialog.
          setTimeout(() => { try { frame.remove(); } catch (_) {} }, 1000);
        }
      };
      frame.srcdoc = html;
    } catch (err) {
      try { if (frame) frame.remove(); } catch (_) {}
      resolve({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  });
}
