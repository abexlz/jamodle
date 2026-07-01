/**
 * In-memory TTL cache for dictionary API responses (server-side).
 */
'use strict';

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 500;

const store = new Map();

function cacheKey(word) {
  return String(word || '').trim();
}

function get(word) {
  const key = cacheKey(word);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(word, value, ttlMs = DEFAULT_TTL_MS) {
  const key = cacheKey(word);
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function clear() {
  store.clear();
}

module.exports = { get, set, clear, DEFAULT_TTL_MS };
