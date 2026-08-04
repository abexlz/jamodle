/**
 * Unified meaning lookup: curated glossary + learned dictionary cache.
 * English preferred; callers may fall back to hanzi / Korean definitions.
 */
(function (global) {
  'use strict';

  const LS_KEY = 'jamodeul-meaning-glossary-v1';
  const MAX_LEARNED = 2500;

  /**
   * Spreadsheet etymology tags: &독Arbeit, &프cafe, &일ramen, &중…, &이…
   * These are source-language markers, not learner-facing definitions.
   */
  const ETYMOLOGY_GLOSS_RE = /^&\s*[가-힣]{1,4}\s*.+/u;

  function isHanziGloss(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    return /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(s);
  }

  function isEtymologyGloss(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    return ETYMOLOGY_GLOSS_RE.test(s);
  }

  /**
   * Strip a leading &독 / &프-style tag. Returns '' when nothing useful remains
   * (foreign headword alone is not treated as an English gloss).
   */
  function stripEtymologyTag(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    if (!isEtymologyGloss(s)) return s;
    return '';
  }

  /** Prefer strings that look usable as an English / Latin gloss. */
  function looksLikeEnglishGloss(text) {
    const s = String(text || '').trim();
    if (!s || isHanziGloss(s) || isEtymologyGloss(s)) return false;
    return /[A-Za-z]/.test(s);
  }

  /** True when text is safe to show as a meaning (not etymology junk). */
  function isDisplayableMeaning(text) {
    const s = String(text || '').trim();
    if (!s || isEtymologyGloss(s)) return false;
    return true;
  }

  function readLearned() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  function writeLearned(map) {
    try {
      const keys = Object.keys(map);
      if (keys.length > MAX_LEARNED) {
        const trimmed = {};
        keys.slice(keys.length - MAX_LEARNED).forEach((k) => {
          trimmed[k] = map[k];
        });
        map = trimmed;
      }
      localStorage.setItem(LS_KEY, JSON.stringify(map));
    } catch {
      /* ignore quota */
    }
  }

  function getEnglish(word) {
    const q = String(word || '').trim();
    if (!q) return '';
    const curated = global.MatchWordMeanings?.[q];
    if (curated && looksLikeEnglishGloss(curated)) return String(curated).trim();
    const learned = readLearned()[q];
    if (learned && looksLikeEnglishGloss(learned)) return String(learned).trim();
    if (curated && isDisplayableMeaning(curated) && !isHanziGloss(curated)) {
      return String(curated).trim();
    }
    return '';
  }

  function getAnyLocal(word) {
    const q = String(word || '').trim();
    if (!q) return '';
    const english = getEnglish(q);
    if (english) return english;
    const curated = global.MatchWordMeanings?.[q];
    if (curated && isDisplayableMeaning(curated)) return String(curated).trim();
    const learned = readLearned()[q];
    if (learned && isDisplayableMeaning(learned)) return String(learned).trim();
    return '';
  }

  function remember(word, meaning) {
    const q = String(word || '').trim();
    const text = String(meaning || '').trim();
    if (!q || !text || !looksLikeEnglishGloss(text)) return false;
    if (global.MatchWordMeanings?.[q]) return false;
    const map = readLearned();
    if (map[q] === text) return true;
    map[q] = text;
    writeLearned(map);
    return true;
  }

  global.MeaningGlossary = {
    isHanziGloss,
    isEtymologyGloss,
    stripEtymologyTag,
    isDisplayableMeaning,
    looksLikeEnglishGloss,
    getEnglish,
    getAnyLocal,
    remember,
  };
})(typeof window !== 'undefined' ? window : globalThis);
