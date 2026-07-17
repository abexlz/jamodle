/**
 * Shared hint token balance — same pool as Wordle (jamodeul-tokens).
 */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'jamodeul-tokens';
  const DEFAULT_TOKENS = 5;

  function load() {
    if (global.AppStorage) {
      const n = parseInt(global.AppStorage.getString(TOKEN_KEY, String(DEFAULT_TOKENS)), 10);
      return Number.isFinite(n) ? Math.max(0, n) : DEFAULT_TOKENS;
    }
    try {
      const v = localStorage.getItem(TOKEN_KEY);
      return v !== null ? Math.max(0, parseInt(v, 10) || 0) : DEFAULT_TOKENS;
    } catch {
      return DEFAULT_TOKENS;
    }
  }

  function save(count) {
    const n = Math.max(0, parseInt(count, 10) || 0);
    if (global.AppStorage) {
      global.AppStorage.setString(TOKEN_KEY, String(n));
    } else {
      try { localStorage.setItem(TOKEN_KEY, String(n)); } catch {}
    }
    return n;
  }

  function set(count) {
    return save(count);
  }

  function grant(amount) {
    return save(load() + Math.max(0, parseInt(amount, 10) || 0));
  }

  function hasDevUnlimited() {
    return global.DevBuild?.hasDevAccess?.() === true;
  }

  function get() {
    if (hasDevUnlimited()) return 9999;
    return load();
  }

  /** @returns {boolean} whether tokens were spent */
  function spend(amount) {
    if (hasDevUnlimited()) return true;
    const cost = Math.max(0, parseInt(amount, 10) || 0);
    const current = load();
    if (current < cost) return false;
    save(current - cost);
    return true;
  }

  global.HintTokens = {
    TOKEN_KEY,
    DEFAULT_TOKENS,
    load,
    save,
    set,
    grant,
    get,
    spend,
    hasDevUnlimited,
  };
})(typeof window !== 'undefined' ? window : globalThis);
