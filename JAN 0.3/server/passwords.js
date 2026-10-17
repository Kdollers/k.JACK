'use strict';
/**
 * Password hashing. Kept free of database imports so that both db.js and auth.js can use it.
 *  - Current format: scrypt$N$r$p$salt$key (per-user random salt, timing-safe compare).
 *  - Legacy format: unsalted-looking SHA-256 with a fixed suffix, accepted once and upgraded on login.
 */
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function legacyHash(password) {
  return crypto.createHash('sha256').update(password + 'genesis_salt_2026').digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Returns { ok, legacy }. legacy=true means the stored hash must be upgraded. */
function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return { ok: false, legacy: false };
  if (stored.startsWith('scrypt$')) {
    const [, N, r, p, saltB64, keyB64] = stored.split('$');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p)
    });
    return { ok: expected.length === actual.length && crypto.timingSafeEqual(expected, actual), legacy: false };
  }
  const a = Buffer.from(legacyHash(password));
  const b = Buffer.from(stored);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, legacy: ok };
}

module.exports = { hashPassword, verifyPassword, legacyHash };
