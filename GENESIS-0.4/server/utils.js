'use strict';
/**
 * Neutral utilities shared by the accounting engine, stock ledger and the
 * operational modules. Kept dependency-free so any module can require it
 * without creating circular imports.
 */
const crypto = require('crypto');

function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function roundTo(num, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(num) + Number.EPSILON) * factor) / factor;
}

module.exports = { generateId, roundTo };
