/**
 * In-memory TTL cache for Pexels image search (server-side).
 */
'use strict';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 800;

const store = new Map();

function cacheKey(query) {
  return String(query || '').trim().toLowerCase();
}

function get(query) {
  const key = cacheKey(query);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(query, value, ttlMs = DEFAULT_TTL_MS) {
  const key = cacheKey(query);
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
