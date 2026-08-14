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

  /** Short gloss from a dictionary entry — English first, then usable fallback text. */
  function isHanziGloss(text) {
    return global.MeaningGlossary?.isHanziGloss?.(text)
      || /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(String(text || '').trim());
  }

  function looksLikeEnglishGloss(text) {
    if (global.MeaningGlossary?.looksLikeEnglishGloss) {
      return global.MeaningGlossary.looksLikeEnglishGloss(text);
    }
    const s = String(text || '').trim();
    if (!s || isHanziGloss(s) || /^&\s*[가-힣]/.test(s)) return false;
    return /[A-Za-z]/.test(s);
  }

  function formatEntryMeaning(entry, { allowFallback = true } = {}) {
    if (!entry) return '';
    const gloss = String(entry.englishWord || entry.transWord || '').trim();
    const definition = String(entry.definition || entry.transDefinition || '').trim();
    const ko = String(entry.rawDefinitionKo || entry.definitionKo || '').trim();
    const usable = (text) => text && looksLikeEnglishGloss(text)
      && !(global.MeaningGlossary?.isEtymologyGloss?.(text));

    if (usable(gloss)) return gloss;
    if (usable(definition)) return definition;
    if (gloss && !isHanziGloss(gloss) && !global.MeaningGlossary?.isEtymologyGloss?.(gloss)) {
      return gloss;
    }
    if (definition && !isHanziGloss(definition)
      && !global.MeaningGlossary?.isEtymologyGloss?.(definition)) {
      return definition;
    }
    if (!allowFallback) return '';
    if (ko && !global.MeaningGlossary?.isEtymologyGloss?.(ko)) return ko;
    return '';
  }

  function meaningFromLookupResult(result, word, opts = {}) {
    const q = String(word || '').trim();
    const direct = formatEntryMeaning(result?.entry, opts);
    if (direct) return direct;

    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    for (const item of candidates) {
      if (!item || String(item.word || '') !== q) continue;
      const exact = formatEntryMeaning(item, opts);
      if (exact) return exact;
    }
    for (const item of candidates) {
      const any = formatEntryMeaning(item, opts);
      if (any) return any;
    }
    return '';
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchSearchOnce(q) {
    const url = `${getApiBase()}/api/dictionary/search?word=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: apiFetchHeaders() });
    const data = await readJsonResponse(res);
    if (!res.ok) {
      const err = new Error(data.error || 'Dictionary details are unavailable right now.');
      err.code = data.code || `HTTP_${res.status}`;
      err.retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
    return {
      found: !!data.found && (data.exactMatch === true || matchesExactEntry(data, q)),
      exactMatch: data.exactMatch === true || matchesExactEntry(data, q),
      entry: data.entry || null,
      candidates: data.candidates || [],
      source: data.source || SOURCE_NAME,
      sourceHome: data.sourceHome || 'https://krdict.korean.go.kr',
      cached: !!data.cached,
    };
  }

  /**
   * Best available gloss for a headword — English preferred, then Korean / hanzi fallback.
   * Retries once on transient API failures and remembers successful English glosses locally.
   */
  async function resolveEnglishMeaning(word, prefetchedEntry = null) {
    const q = String(word || '').trim();
    if (!q) return '';

    const localEnglish = global.MeaningGlossary?.getEnglish?.(q) || '';
    if (localEnglish) return localEnglish;

    if (prefetchedEntry) {
      const direct = formatEntryMeaning(prefetchedEntry, { allowFallback: false });
      if (direct) {
        global.MeaningGlossary?.remember?.(q, direct);
        return direct;
      }
    }

    const cached = readCache(q);
    if (cached) {
      const fromCache = meaningFromLookupResult(cached, q, { allowFallback: false });
      if (fromCache) {
        global.MeaningGlossary?.remember?.(q, fromCache);
        return fromCache;
      }
    }

    if (isOnline()) {
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (attempt > 0) await sleep(350);
          const forceRefresh = !!(cached && !meaningFromLookupResult(cached, q, { allowFallback: false }));
          const result = forceRefresh
            ? await fetchSearchOnce(q)
            : await lookupWord(q, { forceRefresh: attempt > 0 || forceRefresh });
          if (result?.error && result.retryable && attempt === 0) {
            lastErr = result;
            continue;
          }
          if (forceRefresh && result.found && (result.entry || result.candidates?.length)) {
            writeCache(q, result);
          }
          const live = meaningFromLookupResult(result, q, { allowFallback: false });
          if (live) {
            global.MeaningGlossary?.remember?.(q, live);
            return live;
          }
          const soft = meaningFromLookupResult(result, q, { allowFallback: true });
          if (soft) return soft;
          break;
        } catch (err) {
          lastErr = err;
          if (!err?.retryable && attempt === 0) {
            // still try second pass for unknown network errors
          }
        }
      }
      void lastErr;
    }

    if (prefetchedEntry) {
      const softPrefetch = formatEntryMeaning(prefetchedEntry, { allowFallback: true });
      if (softPrefetch) return softPrefetch;
    }
    if (cached) {
      const softCache = meaningFromLookupResult(cached, q, { allowFallback: true });
      if (softCache) return softCache;
    }

    const translated = await translateKoToEn(q);
    if (translated) {
      global.MeaningGlossary?.remember?.(q, translated);
      return translated;
    }

    return '';
  }

  function isJunkTranslation(text, sourceWord) {
    const s = String(text || '').trim();
    const q = String(sourceWord || '').trim();
    if (!s) return true;
    if (/please select two distinct languages/i.test(s)) return true;
    if (/invalid/i.test(s) && s.length < 40) return true;
    if (s === q) return true;
    return false;
  }

  async function translateKoToEn(word) {
    const q = String(word || '').trim();
    if (!q || !isOnline()) return '';
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=ko|en`;
      const res = await fetch(url);
      if (!res.ok) return '';
      const data = await res.json();
      const text = String(data?.responseData?.translatedText || '').trim();
      if (isJunkTranslation(text, q) || !looksLikeEnglishGloss(text)) return '';
      return text;
    } catch {
      return '';
    }
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
  async function lookupWord(word, options = {}) {
    const q = String(word || '').trim();
    if (!q) return { found: false, error: 'No word provided' };

    const cached = readCache(q);
    if (cached && !options.forceRefresh) {
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
      let res;
      let data;
      try {
        res = await fetch(url, { headers: apiFetchHeaders() });
        data = await readJsonResponse(res);
      } catch (firstErr) {
        // One retry for network / non-JSON proxy blips.
        await new Promise((r) => setTimeout(r, 350));
        res = await fetch(url, { headers: apiFetchHeaders() });
        data = await readJsonResponse(res);
      }

      if (!res.ok) {
        return {
          found: false,
          error: data.error || 'Dictionary details are unavailable right now.',
          code: data.code,
          retryable: res.status === 429 || res.status >= 500,
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
        retryable: true,
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
    resolveEnglishMeaning,
    prefetchWord,
    readCache,
    getApiBase,
  };
})(typeof window !== 'undefined' ? window : globalThis);
