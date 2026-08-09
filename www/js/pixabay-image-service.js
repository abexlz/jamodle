/**
 * Client helper for Word Chain answer illustrations via /api/image/pixabay.
 *
 * The object's English name is the search term; the answer the player types is
 * the Korean translation (handled by the game). The server returns a 2×2 set:
 * photo, illustration, illustration, vector. The API key stays on the server.
 */
(function (global) {
  'use strict';

  const CACHE_PREFIX = 'jamodeul-pixabay-v2-image-set-';
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

  function looksLikeEnglish(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    // Require mostly Latin letters (reject Hangul-only / mixed junk).
    const letters = s.replace(/[^A-Za-z]/g, '');
    return letters.length >= 2 && letters.length >= s.replace(/\s+/g, '').length * 0.5;
  }

  /** Build a short English noun/phrase for the image search. Never returns Hangul. */
  function toSearchQuery(koreanWord, englishHint) {
    // Curated glossary wins: imported meanings are often hanzi (호흡 → 呼吸).
    const curated = global.WordChainEnglish?.getEnglish?.(koreanWord) || '';
    if (curated) return curated;

    const hint = String(englishHint || '').trim();
    const fromHint = hint
      .split(/[;|/·•]/)[0]
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (fromHint && looksLikeEnglish(fromHint)) {
      const words = fromHint.split(' ').filter(Boolean);
      return words.length <= 4 ? fromHint : words.slice(0, 3).join(' ');
    }

    const local = global.MatchWordMeanings?.[koreanWord]
      || global.LearningWords?.getWordMeaning?.(koreanWord)
      || '';
    if (local && local !== englishHint) {
      return toSearchQuery(koreanWord, local);
    }

    // No English gloss — skip Hangul searches (they are unreliable on Pixabay).
    return '';
  }

  async function searchPhoto(query) {
    const q = String(query || '').trim();
    if (!q || !looksLikeEnglish(q)) return null;

    const cached = readCache(q);
    if (cached) return cached;

    const url = `${getApiBase()}/api/image/pixabay?q=${encodeURIComponent(q)}`;
    let res;
    try {
      res = await fetch(url, { headers: apiFetchHeaders() });
    } catch {
      return null;
    }

    if (res.status === 503) {
      // Missing server key — stay quiet in UI (let the app fall back).
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
    if (!result || result.found === false || (!result.imageUrl && !result.imageSet?.length)) return null;
    return {
      ...result,
      searchQuery: query,
    };
  }

  global.PixabayImageService = {
    provider: 'pixabay',
    looksLikeEnglish,
    toSearchQuery,
    searchPhoto,
    photoForWord,
  };
})(typeof window !== 'undefined' ? window : globalThis);
