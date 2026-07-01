/**
 * Korean Match word pool — merged bank with syllable-length filtering.
 */
(function (global) {
  'use strict';

  const HC = global.HangulCompose;
  const BANK = global.MatchWordBank?.MATCH_WORD_BANK || [];

  const LETTER_LENGTHS = [1, 2, 3, 4, 5, 6];

  const FALLBACK_WORDS = [
    '책', '곰', '개', '물', '밥', '빵', '문', '말', '소', '해', '달', '꽃',
    '고양이', '바나나', '컴퓨터', '대학교', '축구공', '비행기', '자동차', '도서관',
    '냉장고', '세탁기', '운동장', '지하철', '초콜릿', '햄버거', '김치찌개', '된장찌개',
    '불고기', '삼겹살', '아이스크림', '핸드폰', '스마트폰', '노트북', '키보드', '마우스',
    '선생님', '교수님', '학생', '회사원', '경찰관', '소방관', '간호사', '의사',
    '아파트', '백화점', '슈퍼마켓', '공원', '놀이터', '운동선수', '음악가', '작가',
    '대한민국', '서울', '부산', '제주도', '한국어', '영어', '일본어', '중국어',
    '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
    '봄날', '여름밤', '가을날', '겨울밤', '아침', '점심', '저녁',
    '오렌지', '딸기', '수박', '포도', '강아지', '고양이', '토끼', '거북이',
    '호랑이', '사자', '코끼리', '기린', '펭귄', '돌고래', '고래', '상어',
    '자전거', '오토바이', '택시', '버스', '기차', '배', '배구', '야구',
    '농구', '테니스', '수영', '등산', '마라톤', '축구', '야구',
    '사과', '바다', '학교', '친구', '연필', '나무', '구름', '바람', '노래', '음악',
  ].filter((w, i, a) => a.indexOf(w) === i);

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
    const fromLearning = global.LearningWords?.getMatchWordList?.() || [];
    return dedupe([...fromLearning, ...BANK, ...FALLBACK_WORDS]);
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
      shuffleRotations: n >= 4,
    };
  }

  function filterByExactLength(words, length) {
    const n = normalizeWordLength(length);
    return dedupe(words.filter((w) => w.length === n));
  }

  function getWordsForLength(length) {
    const n = normalizeWordLength(length);
    const fromAll = filterByExactLength(ALL_WORDS, n);
    if (fromAll.length >= 12) return fromAll;
    const fromFallback = filterByExactLength(FALLBACK_WORDS, n);
    if (fromFallback.length) return fromFallback;
    return fromAll;
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
