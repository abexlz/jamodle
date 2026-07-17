/**
 * 끝말잇기 — 국립국어원 한국어기초사전 validation via DictionaryService proxy.
 * The browser never calls krdict.korean.go.kr directly (CORS); the server holds the API key.
 * Exact written-form match only — no 두음법칙 in v2.
 * @see https://krdict.korean.go.kr/eng/openApi/openApiInfo
 */
(function (global) {
  'use strict';

  /**
   * @returns {Promise<{valid:boolean, networkError?:boolean, reason?:string}>}
   */
  async function validateWord(word) {
    const trimmed = String(word || '').trim();
    if (!trimmed) {
      return { valid: false, reason: 'empty' };
    }

    const DS = global.DictionaryService;
    if (!DS?.isDictionaryWord) {
      return { valid: false, networkError: true };
    }

    try {
      const valid = await DS.isDictionaryWord(trimmed);
      return { valid };
    } catch {
      return { valid: false, networkError: true };
    }
  }

  global.WordChainKrdict = {
    validateWord,
  };
})(typeof window !== 'undefined' ? window : globalThis);
