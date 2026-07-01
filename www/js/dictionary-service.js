/**
 * Client-side dictionary lookup service.
 * Calls internal /api/dictionary/search — never the external API directly.
 * Caches results in localStorage for offline reuse.
 */
(function (global) {
  'use strict';

  const CACHE_PREFIX = 'jamodeul-dict-cache-';
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const SOURCE_NAME = 'Korean Basic Dictionary';

  function getApiBase() {
    if (global.JAMODEUL_API_BASE) return global.JAMODEUL_API_BASE.replace(/\/$/, '');
    return '';
  }

  function cacheKey(word) {
    return CACHE_PREFIX + word.trim();
  }

  function readCache(word) {
    try {
      const raw = localStorage.getItem(cacheKey(word));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - (data.cachedAt || 0) > CACHE_TTL_MS) {
        localStorage.removeItem(cacheKey(word));
        return null;
      }
      return data.payload;
    } catch {
      return null;
    }
  }

  function writeCache(word, payload) {
    try {
      localStorage.setItem(cacheKey(word), JSON.stringify({
        cachedAt: Date.now(),
        payload,
      }));
    } catch {
      /* storage full — ignore */
    }
  }

  function isOnline() {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  /**
   * @returns {Promise<{found:boolean, entry?:object, error?:string, offline?:boolean, cached?:boolean}>}
   */
  async function lookupWord(word) {
    const q = String(word || '').trim();
    if (!q) return { found: false, error: 'No word provided' };

    const cached = readCache(q);
    if (cached) {
      return { ...cached, cached: true, offline: !isOnline() };
    }

    if (!isOnline()) {
      return {
        found: false,
        offline: true,
        error: 'Dictionary details are unavailable right now.',
      };
    }

    try {
      const url = `${getApiBase()}/api/dictionary/search?word=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          found: false,
          error: data.error || 'Dictionary details are unavailable right now.',
          code: data.code,
        };
      }

      const result = {
        found: !!data.found,
        entry: data.entry || null,
        candidates: data.candidates || [],
        source: data.source || SOURCE_NAME,
        sourceHome: data.sourceHome || 'https://krdict.korean.go.kr',
        cached: !!data.cached,
      };

      if (result.found && result.entry) writeCache(q, result);
      return result;
    } catch {
      return {
        found: false,
        error: 'Dictionary details are unavailable right now.',
      };
    }
  }

  async function validateWord(word, allowException = false) {
    const q = String(word || '').trim();
    if (!q) return { valid: false, error: 'No word provided' };

    if (!isOnline()) {
      const cached = readCache(q);
      return {
        valid: !!cached?.found || allowException,
        hasDictionaryEntry: !!cached?.found,
        offline: true,
        entry: cached?.entry || null,
      };
    }

    try {
      const url = `${getApiBase()}/api/dictionary/validate?word=${encodeURIComponent(q)}${allowException ? '&exception=1' : ''}`;
      const res = await fetch(url);
      return await res.json();
    } catch {
      return { valid: allowException, error: 'Validation unavailable right now.' };
    }
  }

  /** Prefetch dictionary data in background (non-blocking) */
  function prefetchWord(word) {
    lookupWord(word).catch(() => {});
  }

  global.DictionaryService = {
    SOURCE_NAME,
    lookupWord,
    validateWord,
    prefetchWord,
    readCache,
    getApiBase,
  };
})(typeof window !== 'undefined' ? window : globalThis);
