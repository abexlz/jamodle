/**
 * Korean Match word pool — reads from the unified list in learning-words.js.
 */
(function (global) {
  'use strict';

  const HC = global.HangulCompose;

  const LETTER_LENGTHS = [1, 2, 3, 4, 5, 6];

  const LEGACY_LENGTH = {
    easy: 2,
    normal: 4,
    medium: 4,
    hard: 6,
    hardcore: 6,
  };

  function isValidWord(word) {
    if (!word || typeof word !== 'string') return false;
    if (!HC?.isHangulSyllable) return /^[\uAC00-\uD7A3]+$/.test(word);
    return [...word].every(HC.isHangulSyllable);
  }

  function dedupe(words) {
    return words.filter((w, i, a) => isValidWord(w) && a.indexOf(w) === i);
  }

  function buildAllWords() {
    return dedupe(global.LearningWords?.getMatchWordList?.() || []);
  }

  const ALL_WORDS = buildAllWords();

  function normalizeWordLength(value) {
    if (typeof value === 'number' && LETTER_LENGTHS.includes(value)) return value;
    const parsed = parseInt(value, 10);
    if (LETTER_LENGTHS.includes(parsed)) return parsed;
    if (value && LEGACY_LENGTH[value]) return LEGACY_LENGTH[value];
    return 4;
  }

  function getConfigForLength(length) {
    const n = normalizeWordLength(length);
    return {
      min: n,
      max: n,
      shuffleRotations: true,
    };
  }

  function filterByExactLength(words, length) {
    const n = normalizeWordLength(length);
    return dedupe(words.filter((w) => w.length === n));
  }

  function getWordsForLength(length) {
    return filterByExactLength(ALL_WORDS, length);
  }

  /** @deprecated use normalizeWordLength */
  function normalizeTurnMode(mode) {
    return normalizeWordLength(mode);
  }

  /** @deprecated use getConfigForLength */
  function getTurnModeConfig(mode) {
    return getConfigForLength(mode);
  }

  /** @deprecated use getWordsForLength */
  function getWordsForTurnMode(mode) {
    return getWordsForLength(mode);
  }

  /** @deprecated use normalizeWordLength */
  function normalizeMode(mode) {
    return normalizeWordLength(mode);
  }

  /** @deprecated use getConfigForLength */
  function getModeConfig(mode) {
    return getConfigForLength(mode);
  }

  /** @deprecated use getWordsForLength */
  function getWordsForMode(mode) {
    return getWordsForLength(mode);
  }

  function letterCountLabel(length) {
    const n = normalizeWordLength(length);
    return global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
  }

  /** Legacy export — 4-letter pool. */
  function getLegacyMatchWords() {
    return getWordsForLength(4);
  }

  global.MatchWords = {
    ALL_WORDS,
    LETTER_LENGTHS,
    normalizeWordLength,
    getConfigForLength,
    getWordsForLength,
    letterCountLabel,
    normalizeMode,
    normalizeTurnMode,
    getModeConfig,
    getTurnModeConfig,
    getWordsForMode,
    getWordsForTurnMode,
    isValidWord,
  };

  Object.defineProperty(global, 'MATCH_WORDS', {
    configurable: true,
    enumerable: true,
    get: getLegacyMatchWords,
  });
})(typeof window !== 'undefined' ? window : globalThis);
