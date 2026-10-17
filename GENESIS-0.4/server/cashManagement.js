'use strict';
/**
 * Physical cash counting and reconciliation (cash registers / tills).
 *
 * A cash session is opened on a CASH-type bank account with a denomination-based
 * opening count, and closed with a closing count. The system compares expected
 * cash (opening + receipts − payouts during the session) with the counted cash
 * and records any discrepancy with a mandatory explanation. An authorized
 * approver (who must not be the person that closed the session) approves the
 * reconciliation.
 *
 * IMPORTANT: cash discrepancies NEVER adjust the accounting records
 * automatically. The general ledger keeps the book balance; the variance is
 * documented here and must be handled through an explicit, audited journal
 * entry or stock/cash adjustment by an authorized accountant.
 */
const { getDb } = require('./db');
const { generateId, roundTo } = require('./utils');
const { nextSequenceNumber, logAudit } = require('./accountingEngine');

function sumCountLines(lines) {
  let total = 0;
  for (const l of lines) {
    const unitValue = Number(l.unitValue != null ? l.unitValue : l.unit_value);
    const quantity = Number(l.quantity);
    if (!(unitValue > 0)) throw new Error('Every denomination needs a positive unit value.');
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error('Denomination quantities must be whole numbers of zero or more.');
    total = roundTo(total + unitValue * quantity, 2);
  }
  return total;
}

function insertCountLines(db, sessionId, phase, lines) {
  const insert = db.prepare(`
    INSERT INTO cash_count_lines (id, session_id, count_phase, denomination, unit_value, quantity, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const l of lines) {
    const unitValue = roundTo(Number(l.unitValue != null ? l.unitValue : l.unit_value), 4);
    const quantity = Number(l.quantity);
    insert.run(generateId('ccl'), sessionId, phase, String(l.denomination || unitValue), unitValue, quantity, roundTo(unitValue * quantity, 2));
  }
}

/** Cash expected in the till: opening + receipts − payouts within the window. */
function computeExpectedCash(db, session) {
  // SQLite datetimes are 'YYYY-MM-DD HH:MM:SS' (space, no 'T') — normalise both.
  const datePart = (v) => String(v || '').replace('T', ' ').slice(0, 10);
  const fromDate = datePart(session.opened_at);
  const toDate = session.closed_at ? datePart(session.closed_at) : new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT payment_type, bank_account_id, to_bank_account_id, amount FROM payments
    WHERE company_id = ? AND status = 'POSTED' AND date >= ? AND date <= ?
      AND (bank_account_id = ? OR to_bank_account_id = ?)
  `).all(session.company_id, fromDate, toDate, session.bank_account_id, session.bank_account_id);

  let flow = 0;
  for (const p of rows) {
    const amount = roundTo(p.amount, 2);
    if (p.bank_account_id === session.bank_account_id) {
      if (p.payment_type === 'CUSTOMER_RECEIPT' || p.payment_type === 'DIRECT_INCOME') flow += amount;
      else if (p.payment_type === 'SUPPLIER_PAYMENT' || p.payment_type === 'DIRECT_EXPENSE' || p.payment_type === 'CUSTOMER_REFUND') flow -= amount;
      else if (p.payment_type === 'TRANSFER') flow -= amount; // out of this till
    }
    if (p.payment_type === 'TRANSFER' && p.to_bank_account_id === session.bank_account_id) flow += amount;
  }
  return roundTo(session.opening_amount + flow, 2);
}

function openCashSession(companyId, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const { bankAccountId, countLines = [] } = data;
    const bank = db.prepare(`SELECT * FROM bank_accounts WHERE id = ? AND company_id = ?`).get(bankAccountId, companyId);
    if (!bank) throw new Error('Cash account not found.');
    if (bank.account_type !== 'CASH') throw new Error('Cash sessions can only be opened on CASH-type accounts.');
    if (!bank.active) throw new Error('This cash account is inactive.');
    const open = db.prepare(`SELECT id FROM cash_sessions WHERE company_id = ? AND bank_account_id = ? AND status = 'OPEN'`).get(companyId, bankAccountId);
    if (open) throw new Error('A cash session is already open for this account. Close it first.');
    if (!Array.isArray(countLines) || countLines.length === 0) throw new Error('An opening denomination count is required.');

    const opening = sumCountLines(countLines);
    const sessionNumber = nextSequenceNumber(companyId, 'CASH_SESSION', 'CSH');
    const sessionId = generateId('csh');
    db.prepare(`
      INSERT INTO cash_sessions (id, company_id, session_number, bank_account_id, opened_by, opened_at, opening_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?, 'OPEN', datetime('now'))
    `).run(sessionId, companyId, sessionNumber, bankAccountId, user?.id || 'system', opening);
    insertCountLines(db, sessionId, 'OPENING', countLines);

    logAudit(companyId, user?.id, user?.full_name, 'BANKING', 'OPEN', sessionId,
      `Opened cash session ${sessionNumber} on ${bank.bank_name} with $${opening}`);
    return { sessionId, sessionNumber, status: 'OPEN', openingAmount: opening };
  });
  return tx();
}

function closeCashSession(companyId, sessionId, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const session = db.prepare(`SELECT * FROM cash_sessions WHERE id = ? AND company_id = ?`).get(sessionId, companyId);
    if (!session) throw new Error('Cash session not found.');
    if (session.status !== 'OPEN') throw new Error(`Only open cash sessions can be closed (current status: ${session.status}).`);
    const { countLines = [], explanation = '' } = data;
    if (!Array.isArray(countLines) || countLines.length === 0) throw new Error('A closing denomination count is required.');

    const counted = sumCountLines(countLines);
    const closedAt = new Date().toISOString();
    const expected = computeExpectedCash(db, { ...session, closed_at: closedAt });
    const variance = roundTo(counted - expected, 2);
    if (Math.abs(variance) > 0.005 && !String(explanation).trim()) {
      throw new Error('A discrepancy explanation is required when counted cash differs from expected cash.');
    }

    insertCountLines(db, sessionId, 'CLOSING', countLines);
    db.prepare(`
      UPDATE cash_sessions
      SET status = 'CLOSED', closed_by = ?, closed_at = ?, expected_amount = ?, counted_amount = ?, variance_amount = ?, explanation = ?
      WHERE id = ?
    `).run(user?.id || 'system', closedAt, expected, counted, variance, String(explanation).trim() || null, sessionId);

    logAudit(companyId, user?.id, user?.full_name, 'BANKING', 'CLOSE', sessionId,
      `Closed cash session ${session.session_number}: expected $${expected}, counted $${counted}, variance $${variance}`);
    // No journal entry is created: discrepancies never adjust the books automatically.
    return { sessionId, sessionNumber: session.session_number, status: 'CLOSED', expectedAmount: expected, countedAmount: counted, varianceAmount: variance };
  });
  return tx();
}

function approveCashSession(companyId, sessionId, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const session = db.prepare(`SELECT * FROM cash_sessions WHERE id = ? AND company_id = ?`).get(sessionId, companyId);
    if (!session) throw new Error('Cash session not found.');
    if (session.status !== 'CLOSED') throw new Error(`Only closed cash sessions can be approved (current status: ${session.status}).`);
    if (user?.id && user.id === session.closed_by) {
      throw new Error('You cannot approve a cash reconciliation that you closed. An independent approver is required.');
    }
    db.prepare(`UPDATE cash_sessions SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now') WHERE id = ?`)
      .run(user?.id || 'system', sessionId);
    logAudit(companyId, user?.id, user?.full_name, 'BANKING', 'APPROVE', sessionId,
      `Approved cash session ${session.session_number} (variance $${session.variance_amount})`);
    return { sessionId, sessionNumber: session.session_number, status: 'APPROVED' };
  });
  return tx();
}

function listCashSessions(companyId) {
  return getDb().prepare(`
    SELECT cs.*, b.bank_name, b.account_number,
      u1.full_name AS opened_by_name, u2.full_name AS closed_by_name, u3.full_name AS approved_by_name
    FROM cash_sessions cs
    JOIN bank_accounts b ON b.id = cs.bank_account_id
    LEFT JOIN users u1 ON u1.id = cs.opened_by
    LEFT JOIN users u2 ON u2.id = cs.closed_by
    LEFT JOIN users u3 ON u3.id = cs.approved_by
    WHERE cs.company_id = ?
    ORDER BY cs.created_at DESC
  `).all(companyId);
}

function getCashSession(companyId, sessionId) {
  const db = getDb();
  const session = db.prepare(`
    SELECT cs.*, b.bank_name FROM cash_sessions cs
    JOIN bank_accounts b ON b.id = cs.bank_account_id
    WHERE cs.id = ? AND cs.company_id = ?
  `).get(sessionId, companyId);
  if (!session) return null;
  const lines = db.prepare(`SELECT * FROM cash_count_lines WHERE session_id = ? ORDER BY count_phase, unit_value DESC`).all(sessionId);
  const expected = session.status === 'OPEN' ? computeExpectedCash(db, session) : session.expected_amount;
  return { ...session, lines, expected_now: expected };
}

module.exports = { openCashSession, closeCashSession, approveCashSession, listCashSessions, getCashSession, computeExpectedCash };
