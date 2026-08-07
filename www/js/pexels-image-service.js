/**
 * Client helper for Word Chain answer photos via /api/image/pexels.
 * Never calls Pexels directly — API key stays on the server.
 */
(function (global) {
  'use strict';

  const CACHE_PREFIX = 'jamodeul-pexels-';
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const memory = new Map();

  function getApiBase() {
    if (global.JAMODEUL_API_BASE) return String(global.JAMODEUL_API_BASE).replace(/\/$/, '');
    return '';
  }

  function apiFetchHeaders() {
    return {
      Accept: 'application/json',
      'ngrok-skip-browser-warning': '1',
    };
  }

  function cacheKey(query) {
    return CACHE_PREFIX + String(query || '').trim().toLowerCase();
  }

  function readCache(query) {
    const key = cacheKey(query);
    if (memory.has(key)) return memory.get(key);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() > Number(parsed.expiresAt || 0)) {
        localStorage.removeItem(key);
        return null;
      }
      memory.set(key, parsed.value);
      return parsed.value;
    } catch {
      return null;
    }
  }

  function writeCache(query, value) {
    const key = cacheKey(query);
    memory.set(key, value);
    try {
      localStorage.setItem(key, JSON.stringify({
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      }));
    } catch {
      /* quota / private mode */
    }
  }

  /** Prefer a short English noun/phrase for Pexels search. */
  function toSearchQuery(koreanWord, englishHint) {
    const hint = String(englishHint || '').trim();
    const fromHint = hint
      .split(/[;|/·•]/)[0]
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (fromHint) {
      const words = fromHint.split(' ').filter(Boolean);
      // Keep short queries; long dictionary glosses search poorly.
      if (words.length <= 4) return fromHint;
      return words.slice(0, 3).join(' ');
    }

    const local = global.MatchWordMeanings?.[koreanWord]
      || global.LearningWords?.getWordMeaning?.(koreanWord)
      || '';
    if (local) return toSearchQuery(koreanWord, local);

    // Last resort: Hangul (usually weak on Pexels).
    return String(koreanWord || '').trim();
  }

  async function searchPhoto(query) {
    const q = String(query || '').trim();
    if (!q) return null;

    const cached = readCache(q);
    if (cached) return cached;

    const url = `${getApiBase()}/api/image/pexels?q=${encodeURIComponent(q)}`;
    let res;
    try {
      res = await fetch(url, { headers: apiFetchHeaders() });
    } catch {
      return null;
    }

    if (res.status === 503) {
      // Missing server key — stay quiet in UI.
      return { ok: false, code: 'CONFIG', found: false };
    }
    if (!res.ok) return null;

    let data;
    try {
      data = await res.json();
    } catch {
      return null;
    }

    writeCache(q, data);
    return data;
  }

  async function photoForWord(koreanWord, englishHint) {
    const query = toSearchQuery(koreanWord, englishHint);
    if (!query) return null;
    const result = await searchPhoto(query);
    if (!result || result.found === false || !result.imageUrl) return null;
    return {
      ...result,
      searchQuery: query,
    };
  }

  global.PexelsImageService = {
    toSearchQuery,
    searchPhoto,
    photoForWord,
  };
})(typeof window !== 'undefined' ? window : globalThis);
