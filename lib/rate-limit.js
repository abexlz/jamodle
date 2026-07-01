/**
 * Simple in-memory rate limiter (per IP, server-side).
 */
'use strict';

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;

const buckets = new Map();

function check(ip) {
  const key = ip || 'unknown';
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: MAX_REQUESTS - bucket.count };
}

module.exports = { check, WINDOW_MS, MAX_REQUESTS };
