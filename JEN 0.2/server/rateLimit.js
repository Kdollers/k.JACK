'use strict';
/**
 * Fixed-window request limiter (in memory, no dependencies).
 *
 * GENESIS runs as a single local process bound to loopback, so an in-memory store is
 * sufficient. Limits protect sign-in, password change, first-run setup and backup
 * restore from brute-force and accidental repeated submissions. Every rejected request
 * receives HTTP 429 with a Retry-After header.
 */

const MAX_KEYS = 20000;

function createLimiter({ name, windowMs, max, keyFn }) {
  const buckets = new Map();

  function prune(now) {
    if (buckets.size < MAX_KEYS) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  /** Records one attempt for `key` and reports whether it is allowed. */
  function hit(key, now = Date.now()) {
    prune(now);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const allowed = bucket.count <= max;
    return { allowed, remaining: Math.max(0, max - bucket.count), retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  function middleware(req, res, next) {
    const key = keyFn(req);
    if (key === null || key === undefined) return next();
    const result = hit(`${name}:${key}`);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      return res.status(429).json({
        error: 'Too many requests. Please wait before trying again.',
        code: 'RATE_LIMITED',
        retryAfterSeconds: result.retryAfterSec
      });
    }
    return next();
  }

  return { middleware, hit, _buckets: buckets };
}

/** Client address as seen by the socket (never a client-supplied header). */
function clientIp(req) {
  return req.socket?.remoteAddress || 'unknown';
}

const MINUTE = 60 * 1000;

module.exports = { createLimiter, clientIp, MINUTE };
