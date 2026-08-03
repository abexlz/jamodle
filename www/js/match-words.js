/**
 * Korean Match word pool — reads from the unified list in learning-words-data.js.
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

  /**
   * Supplemental pools for lengths sparse/missing in the learning noun list.
   * Learning data currently tops out at 5 syllables — 6-letter mode needs these.
   */
  const EXTRA_WORDS_BY_LENGTH = {
    6: [
      '어린이도서관',
      '인스턴트커피',
      '텔레비전방송',
      '아파트관리비',
      '초등학교동창',
      '정보통신기술',
      '사회복지센터',
      '환경보호운동',
      '건강보조식품',
      '신용카드결제',
      '온라인쇼핑몰',
      '휴대전화번호',
      '자동차보험료',
      '건강보험공단',
      '대학교도서관',
      '프라이드치킨',
      '초콜릿케이크',
      '문화체육관광',
      '전자상거래법',
      '슈퍼마켓가게',
      '외국어학원비',
      '우리나라사람',
      '중학교선생님',
      '인터넷쇼핑몰',
    ],
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
    const extras = Object.values(EXTRA_WORDS_BY_LENGTH).flat();
    return dedupe([...(global.LearningWords?.getMatchWordList?.() || []), ...extras]);
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
    const n = normalizeWordLength(length);
    const fromAll = filterByExactLength(ALL_WORDS, n);
    const extras = EXTRA_WORDS_BY_LENGTH[n] || [];
    return dedupe([...fromAll, ...extras]);
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
