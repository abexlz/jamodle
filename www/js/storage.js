/**
 * Safe localStorage access — recovers from invalid JSON automatically.
 */
(function (global) {
  'use strict';

  const DATA_VERSION = 1;

  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Jamodeul] Corrupted data for "${key}", using fallback.`, err);
      try {
        localStorage.removeItem(key);
      } catch {}
      return fallback;
    }
  }

  function getString(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? raw : fallback;
    } catch {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[Jamodeul] Failed to save "${key}".`, err);
      return false;
    }
  }

  function setString(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (err) {
      console.warn(`[Jamodeul] Failed to save "${key}".`, err);
      return false;
    }
  }

  function remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function getPrefixed(prefix) {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
    } catch {}
    return keys;
  }

  global.AppStorage = {
    DATA_VERSION,
    get,
    getString,
    set,
    setString,
    remove,
    getPrefixed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
