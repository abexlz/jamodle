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

  /** Headers for dev-server API calls (ngrok free tier needs the skip-warning header). */
  function apiFetchHeaders() {
    return {
      Accept: 'application/json',
      'ngrok-skip-browser-warning': '1',
    };
  }

  async function readJsonResponse(res) {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const err = new Error('Dictionary proxy returned a non-JSON response.');
      err.code = 'BAD_RESPONSE';
      throw err;
    }
    return res.json().catch(() => ({}));
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

  /** Short English gloss from a dictionary entry (no local word list needed). */
  function isHanziGloss(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    return /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(s);
  }

  function formatEntryMeaning(entry) {
    if (!entry) return '';
    const gloss = String(entry.englishWord || '').trim();
    const definition = String(entry.definition || '').trim();
    if (gloss && !isHanziGloss(gloss)) return gloss;
    if (definition && !isHanziGloss(definition)) return definition;
    return gloss || definition;
  }

  function matchesExactEntry(data, word) {
    const q = String(word || '').trim();
    if (!q || !data) return false;
    if (data.exactMatch === true || data.valid === true || data.hasDictionaryEntry === true) return true;
    if (data.entry?.word === q) return true;
    return (data.candidates || []).some((item) => item && String(item.word || '') === q);
  }

  /**
   * Game validation — exact headword match in the Korean Basic Dictionary.
   * @param {string} word
   * @param {() => boolean} [onServiceFailure] offline / API fallback
   */
  async function isDictionaryWord(word, onServiceFailure) {
    const q = String(word || '').trim();
    if (!q) return false;

    const cached = readCache(q);
    if (cached && matchesExactEntry(cached, q)) {
      return true;
    }

    if (!isOnline()) {
      return typeof onServiceFailure === 'function' ? !!onServiceFailure(q) : false;
    }

    try {
      const result = await validateWord(q);
      if (result?.valid === true || matchesExactEntry(result, q)) {
        if (result.valid && (result.entry || result.candidates?.length)) {
          writeCache(q, {
            found: true,
            exactMatch: true,
            entry: result.entry || null,
            candidates: result.candidates || [],
          });
        }
        return true;
      }
      if (result?.error || result?.offline || result?.code === 'CONFIG') {
        return typeof onServiceFailure === 'function' ? !!onServiceFailure(q) : false;
      }
      return false;
    } catch {
      return typeof onServiceFailure === 'function' ? !!onServiceFailure(q) : false;
    }
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
      const res = await fetch(url, { headers: apiFetchHeaders() });
      const data = await readJsonResponse(res);

      if (!res.ok) {
        return {
          found: false,
          error: data.error || 'Dictionary details are unavailable right now.',
          code: data.code,
        };
      }

      const result = {
        found: !!data.found && (data.exactMatch === true || matchesExactEntry(data, q)),
        exactMatch: data.exactMatch === true || matchesExactEntry(data, q),
        entry: data.entry || null,
        candidates: data.candidates || [],
        source: data.source || SOURCE_NAME,
        sourceHome: data.sourceHome || 'https://krdict.korean.go.kr',
        cached: !!data.cached,
      };

      if (result.found && (result.entry || result.candidates?.length)) writeCache(q, result);
      return result;
    } catch (err) {
      return {
        found: false,
        offline: true,
        error: err?.code === 'BAD_RESPONSE'
          ? 'Dictionary proxy is not reachable. Tunnel ngrok to port 3000 (npm run dev).'
          : 'Dictionary details are unavailable right now.',
      };
    }
  }

  async function validateWord(word, allowException = false) {
    const q = String(word || '').trim();
    if (!q) return { valid: false, error: 'No word provided' };

    if (!isOnline()) {
      const cached = readCache(q);
      const cachedValid = cached && matchesExactEntry(cached, q);
      return {
        valid: cachedValid || allowException,
        hasDictionaryEntry: cachedValid,
        offline: true,
        entry: cached?.entry || null,
      };
    }

    try {
      const url = `${getApiBase()}/api/dictionary/validate?word=${encodeURIComponent(q)}${allowException ? '&exception=1' : ''}`;
      const res = await fetch(url, { headers: apiFetchHeaders() });
      const data = await readJsonResponse(res);

      if (!res.ok) {
        return {
          valid: allowException,
          error: data.error || `Dictionary HTTP ${res.status}`,
          code: data.code,
        };
      }

      if (data.valid || data.hasDictionaryEntry) {
        writeCache(q, {
          found: true,
          exactMatch: true,
          valid: true,
          entry: data.entry || null,
          candidates: data.candidates || [],
        });
      }

      return data;
    } catch (err) {
      return {
        valid: allowException,
        error: err?.code === 'BAD_RESPONSE'
          ? 'Dictionary proxy is not reachable. Tunnel ngrok to port 3000 (npm run dev).'
          : 'Validation unavailable right now.',
        offline: true,
      };
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
    isDictionaryWord,
    matchesExactEntry,
    formatEntryMeaning,
    prefetchWord,
    readCache,
    getApiBase,
  };
})(typeof window !== 'undefined' ? window : globalThis);
