/**
 * One small message between two screens of JENESIS Seller.
 *
 * The dashboard's "New Sale" button opens the Sales screen with its invoice
 * form already started, rather than copying that form onto the dashboard. The
 * form, the posting and the journal entry stay in exactly one place — the same
 * one the accountant reconciles against.
 *
 * An intent is consumed once by the screen that acts on it, so it cannot fire
 * twice and it does not survive a reload.
 */

let newSaleRequested = false;

/** The Seller dashboard asks the Sales screen to start a new sale. */
export function requestNewSale() {
  newSaleRequested = true;
}

/** True once, when a new sale was asked for. */
export function consumeNewSaleRequest() {
  const was = newSaleRequested;
  newSaleRequested = false;
  return was;
}
