'use strict';
// Shared server-side validation for company, contact and product writes.
// Never convert bad monetary inputs to zero or echo SQLite exceptions to users.
class ValidationError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
function requiredText(value, code, max = 120) {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(code);
  const text = value.trim();
  if (text.length > max) throw new ValidationError('FIELD_TOO_LONG');
  return text;
}
function optionalText(value, max = 300) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) throw new ValidationError('FIELD_INVALID');
  return value.trim() || null;
}
function nonnegative(value, code = 'AMOUNT_INVALID', { fallback = 0, decimals = 2, maximum = 1e10 } = {}) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' && typeof value !== 'string') throw new ValidationError(code);
  if (String(value).trim() === '') throw new ValidationError(code);
  const number = Number(value);
  const scaled = number * 10 ** decimals;
  if (!Number.isFinite(number) || number < 0 || number > maximum ||
      !Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled - Math.round(scaled)) > 1e-5) {
    throw new ValidationError(code);
  }
  return number;
}
function activeFlag(value, previous = 1) {
  if (value === undefined) return previous;
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  throw new ValidationError('ACTIVE_INVALID');
}
function entityCode(value, code, max = 40) {
  const text = requiredText(value, code, max).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(text)) throw new ValidationError(code);
  return text;
}
function validateEmail(value) {
  const email = optionalText(value, 150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('EMAIL_INVALID');
  return email;
}
function nextEntityCode(db, table, companyId, prefix) {
  // Called inside an IMMEDIATE transaction so two writers cannot pick the same
  // number. Never use count+1: manually numbered or deleted rows leave gaps.
  const rows = db.prepare(`SELECT code FROM ${table} WHERE company_id = ? AND code LIKE ?`)
    .all(companyId, `${prefix}-%`);
  let high = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  for (const { code } of rows) {
    const match = pattern.exec(code);
    if (match) high = Math.max(high, Number(match[1]));
  }
  return `${prefix}-${String(high + 1).padStart(3, '0')}`;
}
function searchPattern(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 120) throw new ValidationError('SEARCH_INVALID');
  return `%${value.replace(/[!%_]/g, '!$&')}%`;
}
function sendWriteError(res, error) {
  if (error instanceof ValidationError) return res.status(error.status).json({ code: error.code });
  if (error.code?.startsWith('SQLITE_CONSTRAINT_UNIQUE') || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return res.status(409).json({ code: 'DUPLICATE_RECORD' });
  }
  if (error.code?.startsWith('SQLITE_CONSTRAINT_FOREIGNKEY')) return res.status(400).json({ code: 'INVALID_REFERENCE' });
  if (error.code === 'SQLITE_BUSY') return res.status(503).json({ code: 'SERVICE_BUSY' });
  console.error('Write failed:', error.code || error.name);
  return res.status(500).json({ code: 'GENERIC' });
}
module.exports = { ValidationError, requiredText, optionalText, nonnegative, activeFlag,
  entityCode, validateEmail, nextEntityCode, searchPattern, sendWriteError };
