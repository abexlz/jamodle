/**
 * 끝말잇기 — 국립국어원 한국어기초사전 validation via DictionaryService proxy.
 * The browser never calls krdict.korean.go.kr directly (CORS); the server holds the API key.
 * Exact written-form match only — no 두음법칙 in v2.
 * @see https://krdict.korean.go.kr/eng/openApi/openApiInfo
 */
(function (global) {
  'use strict';

  /** Exact written-form match — no 두음법칙 (v2). */
  function hasExactEntry(result, word) {
    if (!result?.found) return false;
    if (result.entry?.word === word) return true;
    return (result.candidates || []).some((item) => item && String(item.word || '') === word);
  }

  function isServiceFailure(result) {
    if (!result) return true;
    return !!(result.error && !result.found);
  }

  async function validateViaProxy(word) {
    const DS = global.DictionaryService;
    if (!DS?.lookupWord) {
      return { valid: false, networkError: true };
    }

    const result = await DS.lookupWord(word);
    if (isServiceFailure(result)) {
      return { valid: false, networkError: true };
    }

    return { valid: hasExactEntry(result, word) };
  }

  /**
   * @returns {Promise<{valid:boolean, networkError?:boolean, reason?:string}>}
   */
  async function validateWord(word) {
    const trimmed = String(word || '').trim();
    if (!trimmed) {
      return { valid: false, reason: 'empty' };
    }

    try {
      return await validateViaProxy(trimmed);
    } catch {
      return { valid: false, networkError: true };
    }
  }

  global.WordChainKrdict = {
    validateWord,
    hasExactEntry,
  };
})(typeof window !== 'undefined' ? window : globalThis);
