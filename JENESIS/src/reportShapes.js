/**
 * reportShapes.js — which report an answer belongs to.
 *
 * Opening "Profit & Loss" used to draw the screen with the figures of the
 * report that was open before it (the trial balance), because the answer of
 * the previous report was still in state while the new one was loading. The
 * Profit & Loss screen then read `revenueRows`, which a trial balance does not
 * have, and the whole interface stopped.
 *
 * Two rules keep that from ever happening again, and both are testable here
 * without a browser:
 *
 *   payloadBelongsTo(data, id) — a report is only drawn with an answer that
 *   says it is that report (or, for an answer without the marker, that has the
 *   shape the report needs);
 *
 *   rowsOf(data, key) — a list is never read directly: a payload that is not
 *   the one expected yields an empty list, never `undefined.map(...)`.
 */

/** The five reports the Reports screen offers. */
export const REPORT_IDS = ['trial_balance', 'pnl', 'balance_sheet', 'cash_flow', 'tax'];

/** The shape each report must have when the answer carries no marker. */
function hasShape(data, reportId) {
  if (!data || typeof data !== 'object') return false;
  switch (reportId) {
    case 'trial_balance':
      return Array.isArray(data.rows);
    case 'pnl':
      return Array.isArray(data.revenueRows) && Array.isArray(data.cogsRows);
    case 'balance_sheet':
      return !!data.assets && Array.isArray(data.assets.current);
    case 'cash_flow':
      return typeof data.netIncome === 'number';
    case 'tax':
      return typeof data.outputTax === 'number';
    default:
      return false;
  }
}

/** True only when `data` may be drawn as `reportId`. */
export function payloadBelongsTo(data, reportId) {
  if (!data || typeof data !== 'object') return false;
  if (data.report !== undefined) return data.report === reportId;
  return hasShape(data, reportId);
}

/** A list of a report, or an empty list when the payload is not that report. */
export function rowsOf(data, reportId, key) {
  if (!payloadBelongsTo(data, reportId)) return [];
  return Array.isArray(data[key]) ? data[key] : [];
}

/** A number of a report, or 0 when the payload is not that report. */
export function amountOf(data, reportId, key, fallback = 0) {
  if (!payloadBelongsTo(data, reportId)) return fallback;
  const value = Number(data[key]);
  return Number.isFinite(value) ? value : fallback;
}
