'use strict';
/**
 * messenger.js — JENESIS Messenger (internal, authorised-user chat).
 *
 * Design rules:
 *  - Conversations are only possible between users of the SAME company. Every
 *    query is scoped by the company bound to the session, so no message can
 *    cross a company boundary even if an id is guessed.
 *  - The sender is ALWAYS the session user; a client-supplied sender id is
 *    ignored (same rule as every other module).
 *  - Messages persist in the `messages` table (migration v5) and are pushed to
 *    live listeners (SSE) — delivery is never duplicated: each message has one
 *    id and clients de-duplicate by id.
 *  - Message text is never written to logs or audit descriptions; the audit
 *    trail records the event and the participants only.
 *  - No new OS/Node surface: the feature runs entirely through the existing
 *    local HTTP API that Electron already uses.
 */
const { getDb } = require('./db');
const { generateId, logAudit } = require('./accountingEngine');

const MAX_BODY_LENGTH = 2000;

/** In-process pub/sub of new messages (per company + recipient). */
const listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function publish(companyId, message) {
  for (const fn of Array.from(listeners)) {
    try {
      fn(companyId, message);
    } catch (_) { /* a broken listener must never break delivery */ }
  }
}

/** Users of the same company that the current user may talk to. */
function listUsers(companyId, meId) {
  return getDb().prepare(`
    SELECT id, username, full_name, role, active
    FROM users
    WHERE company_id = ? AND id != ? AND active = 1
    ORDER BY full_name ASC, username ASC
  `).all(companyId, meId);
}

/**
 * One row per conversation partner with the last message and the unread count
 * of messages received from that partner.
 */
function listConversations(companyId, meId) {
  const db = getDb();
  const peers = listUsers(companyId, meId);
  const last = db.prepare(`
    SELECT m.*,
           s.full_name AS sender_name,
           r.full_name AS recipient_name
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.recipient_id
    WHERE m.company_id = ?
      AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  `);
  const unread = db.prepare(`
    SELECT COUNT(*) AS n FROM messages
    WHERE company_id = ? AND sender_id = ? AND recipient_id = ? AND read_at IS NULL
  `);
  return peers.map((peer) => {
    const lastMessage = last.get(companyId, meId, peer.id, peer.id, meId) || null;
    return {
      peer,
      lastMessage: lastMessage ? publicMessage(lastMessage, meId) : null,
      unread: unread.get(companyId, peer.id, meId).n
    };
  }).sort((a, b) => {
    const at = (c) => (c.lastMessage ? c.lastMessage.createdAt : '');
    return at(b).localeCompare(at(a));
  });
}

function publicMessage(row, meId) {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    senderName: row.sender_name || null,
    recipientName: row.recipient_name || null,
    body: row.body,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    mine: row.sender_id === meId,
    status: row.read_at ? 'READ' : (row.delivered_at ? 'DELIVERED' : 'SENT')
  };
}

/** The thread between the session user and one colleague (oldest → newest). */
function listMessages(companyId, meId, peerId, { markDelivered = true } = {}) {
  const db = getDb();
  const peer = db.prepare(`SELECT id FROM users WHERE id = ? AND company_id = ?`).get(peerId, companyId);
  if (!peer) throw new Error('That user is not available for messaging in this company.');

  // Anything addressed to me and not yet delivered is now delivered (the
  // client is connected and has just fetched it).
  if (markDelivered) {
    db.prepare(`
      UPDATE messages SET delivered_at = COALESCE(delivered_at, datetime('now'))
      WHERE company_id = ? AND sender_id = ? AND recipient_id = ? AND delivered_at IS NULL
    `).run(companyId, peerId, meId);
  }

  const rows = db.prepare(`
    SELECT m.*,
           s.full_name AS sender_name,
           r.full_name AS recipient_name
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.recipient_id
    WHERE m.company_id = ?
      AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
    ORDER BY m.created_at ASC, m.id ASC
  `).all(companyId, meId, peerId, peerId, meId);
  return rows.map((r) => publicMessage(r, meId));
}

/** Marks every message received from one colleague as read. */
function markConversationRead(companyId, meId, peerId) {
  const db = getDb();
  const peer = db.prepare(`SELECT id FROM users WHERE id = ? AND company_id = ?`).get(peerId, companyId);
  if (!peer) throw new Error('That user is not available for messaging in this company.');
  const res = db.prepare(`
    UPDATE messages
    SET read_at = datetime('now'), delivered_at = COALESCE(delivered_at, datetime('now'))
    WHERE company_id = ? AND sender_id = ? AND recipient_id = ? AND read_at IS NULL
  `).run(companyId, peerId, meId);
  return { markedRead: res.changes };
}

/** Total unread messages for the badge. */
function unreadCount(companyId, meId) {
  return getDb().prepare(`
    SELECT COUNT(*) AS n FROM messages
    WHERE company_id = ? AND recipient_id = ? AND read_at IS NULL
  `).get(companyId, meId).n;
}

/**
 * Sends one message. `user` is the session user (never taken from the body).
 * Returns the stored message; listeners are notified afterwards so a failed
 * notification can never roll back a persisted message.
 */
function sendMessage(companyId, meId, user, { recipientId, body }) {
  const text = String(body == null ? '' : body).trim();
  if (!recipientId) throw new Error('Choose the colleague you want to message.');
  if (!text) throw new Error('The message is empty.');
  if (text.length > MAX_BODY_LENGTH) {
    throw new Error(`A message cannot be longer than ${MAX_BODY_LENGTH} characters.`);
  }

  const db = getDb();
  const recipient = db.prepare(`SELECT id, username, full_name FROM users WHERE id = ? AND company_id = ? AND active = 1`)
    .get(recipientId, companyId);
  if (!recipient) throw new Error('That user is not available for messaging in this company.');
  if (recipient.id === meId) throw new Error('Start a conversation with a colleague, not with yourself.');

  const id = generateId('msg');
  db.prepare(`
    INSERT INTO messages (id, company_id, sender_id, recipient_id, body, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, companyId, meId, recipient.id, text);

  const row = db.prepare(`
    SELECT m.*, s.full_name AS sender_name, r.full_name AS recipient_name
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.recipient_id
    WHERE m.id = ?
  `).get(id);

  // Audit the event, never the content.
  logAudit(companyId, meId, user?.full_name, 'MESSENGER', 'SEND', id,
    `Message sent to ${recipient.full_name || recipient.username}`);

  const message = publicMessage(row, meId);
  publish(companyId, message);
  return message;
}

module.exports = {
  MAX_BODY_LENGTH,
  listUsers,
  listConversations,
  listMessages,
  markConversationRead,
  unreadCount,
  sendMessage,
  subscribe,
  publicMessage
};
