/**
 * @file src/lib/http/rateLimit.js
 * @description Fixed-window in-memory rate limiter for abuse-prone endpoints (signup, uploads, candidate portal).
 *
 * NOTE: State is per server instance. On multi-instance/serverless deployments, replace with a shared
 * store (e.g., Redis / Upstash) behind the same `assertRateLimit` interface.
 */

import { RateLimitError } from '../errors.js';

const MAX_TRACKED_KEYS = 5000;

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();

/**
 * Removes expired buckets once the map grows large.
 *
 * @description Bounds memory usage of the limiter.
 * @param {number} now - Current epoch milliseconds.
 * @returns {void} Nothing.
 * @throws {Error} Never throws.
 */
function pruneExpired(now) {
  if (buckets.size < MAX_TRACKED_KEYS) {
    return;
  }
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) {
      buckets.delete(key);
    }
  }
}

/**
 * Enforces a fixed-window request limit for a key.
 *
 * @description Increments the counter for `key` and throws once `limit` requests occur within `windowMs`.
 * @param {string} key - Limiter key (e.g., `portal:<ip>`). Never put raw PII or raw tokens in keys.
 * @param {{ limit: number, windowMs: number }} options - Limit configuration.
 * @returns {{ remaining: number }} Remaining requests in the current window.
 * @throws {RateLimitError} RATE_LIMITED (429) when the limit is exceeded.
 */
export function assertRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    pruneExpired(now);
    return { remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    throw new RateLimitError('Too many requests. Please try again later.', {
      retry_after_seconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    });
  }

  entry.count += 1;
  return { remaining: limit - entry.count };
}
