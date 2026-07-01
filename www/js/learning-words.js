/**
 * Shared beginner Korean word bank for Hangul Builder and Korean Match.
 * Each entry: word, emoji, English meaning, category, difficulty (1–5).
 *
 * Difficulty progression:
 * 1 — single open syllable (CV)
 * 2 — multi-syllable, open
 * 3 — syllables with 받침
 * 4 — compound vowels (복모음)
 * 5 — double consonants / harder 받침
 */
(function (global) {
  'use strict';

  const LEARNING_WORDS = [
    /* ── Difficulty 1: simple open syllables ── */
    { word: '개', emoji: '🐕', meaning: 'Dog', category: 'animals', difficulty: 1 },
    { word: '곰', emoji: '🐻', meaning: 'Bear', category: 'animals', difficulty: 1 },
    { word: '말', emoji: '🐴', meaning: 'Horse', category: 'animals', difficulty: 1 },
    { word: '소', emoji: '🐄', meaning: 'Cow', category: 'animals', difficulty: 1 },
    { word: '물', emoji: '💧', meaning: 'Water', category: 'everyday', difficulty: 1 },
    { word: '문', emoji: '🚪', meaning: 'Door', category: 'everyday', difficulty: 1 },
    { word: '밥', emoji: '🍚', meaning: 'Rice / meal', category: 'food', difficulty: 1 },
    { word: '빵', emoji: '🍞', meaning: 'Bread', category: 'food', difficulty: 1 },
    { word: '책', emoji: '📚', meaning: 'Book', category: 'school', difficulty: 1 },
    { word: '해', emoji: '☀️', meaning: 'Sun', category: 'everyday', difficulty: 1 },
    { word: '달', emoji: '🌙', meaning: 'Moon', category: 'everyday', difficulty: 1 },
    { word: '꽃', emoji: '🌸', meaning: 'Flower', category: 'everyday', difficulty: 1 },

    /* ── Difficulty 2: multi-syllable, open ── */
    { word: '고양이', emoji: '🐱', meaning: 'Cat', category: 'animals', difficulty: 2 },
    { word: '강아지', emoji: '🐶', meaning: 'Puppy / dog', category: 'animals', difficulty: 2 },
    { word: '토끼', emoji: '🐰', meaning: 'Rabbit', category: 'animals', difficulty: 2 },
    { word: '사자', emoji: '🦁', meaning: 'Lion', category: 'animals', difficulty: 2 },
    { word: '물고기', emoji: '🐟', meaning: 'Fish', category: 'animals', difficulty: 2 },
    { word: '바나나', emoji: '🍌', meaning: 'Banana', category: 'food', difficulty: 2 },
    { word: '우유', emoji: '🥛', meaning: 'Milk', category: 'food', difficulty: 2 },
    { word: '포도', emoji: '🍇', meaning: 'Grapes', category: 'food', difficulty: 2 },
    { word: '딸기', emoji: '🍓', meaning: 'Strawberry', category: 'food', difficulty: 2 },
    { word: '수박', emoji: '🍉', meaning: 'Watermelon', category: 'food', difficulty: 2 },
    { word: '계란', emoji: '🥚', meaning: 'Egg', category: 'food', difficulty: 2 },
    { word: '엄마', emoji: '👩', meaning: 'Mom', category: 'family', difficulty: 2 },
    { word: '아빠', emoji: '👨', meaning: 'Dad', category: 'family', difficulty: 2 },
    { word: '언니', emoji: '👧', meaning: 'Older sister (to a girl)', category: 'family', difficulty: 2 },
    { word: '오빠', emoji: '👦', meaning: 'Older brother (to a girl)', category: 'family', difficulty: 2 },
    { word: '가족', emoji: '👨‍👩‍👧', meaning: 'Family', category: 'family', difficulty: 2 },
    { word: '연필', emoji: '✏️', meaning: 'Pencil', category: 'school', difficulty: 2 },
    { word: '공책', emoji: '📓', meaning: 'Notebook', category: 'school', difficulty: 2 },
    { word: '가방', emoji: '🎒', meaning: 'Bag', category: 'school', difficulty: 2 },
    { word: '의자', emoji: '🪑', meaning: 'Chair', category: 'school', difficulty: 2 },
    { word: '교실', emoji: '🏫', meaning: 'Classroom', category: 'school', difficulty: 2 },
    { word: '신발', emoji: '👟', meaning: 'Shoes', category: 'everyday', difficulty: 2 },
    { word: '모자', emoji: '🧢', meaning: 'Hat', category: 'everyday', difficulty: 2 },
    { word: '우산', emoji: '☂️', meaning: 'Umbrella', category: 'everyday', difficulty: 2 },
    { word: '시계', emoji: '⌚', meaning: 'Clock / watch', category: 'everyday', difficulty: 2 },
    { word: '자동차', emoji: '🚗', meaning: 'Car', category: 'everyday', difficulty: 2 },

    /* ── Difficulty 3: 받침 ── */
    { word: '사과', emoji: '🍎', meaning: 'Apple', category: 'food', difficulty: 3 },
    { word: '김치', emoji: '🥬', meaning: 'Kimchi', category: 'food', difficulty: 3 },
    { word: '학교', emoji: '🏫', meaning: 'School', category: 'school', difficulty: 3 },
    { word: '창문', emoji: '🪟', meaning: 'Window', category: 'everyday', difficulty: 3 },

    /* ── Difficulty 4: compound vowels (복모음) ── */
    { word: '빨강', emoji: '🔴', meaning: 'Red', category: 'colours', difficulty: 4 },
    { word: '파랑', emoji: '🔵', meaning: 'Blue', category: 'colours', difficulty: 4 },
    { word: '노랑', emoji: '🟡', meaning: 'Yellow', category: 'colours', difficulty: 4 },
    { word: '검정', emoji: '⚫', meaning: 'Black', category: 'colours', difficulty: 4 },
    { word: '하양', emoji: '⚪', meaning: 'White', category: 'colours', difficulty: 4 },

    /* ── Difficulty 5: harder patterns ── */
    { word: '친구', emoji: '🤝', meaning: 'Friend', category: 'everyday', difficulty: 5 },
    { word: '공원', emoji: '🌳', meaning: 'Park', category: 'everyday', difficulty: 5 },
    { word: '병원', emoji: '🏥', meaning: 'Hospital', category: 'everyday', difficulty: 5 },
    { word: '커피', emoji: '☕', meaning: 'Coffee', category: 'food', difficulty: 5 },
  ];

  /** Words sorted for Hangul Builder curriculum (easiest first). */
  function getBuilderWordList() {
    const level = global.UserPreferences?.getLearningLevel?.() || 'beginner';
    const maxDiff = level === 'advanced' ? 5 : level === 'intermediate' ? 3 : 2;
    return LEARNING_WORDS.slice().sort((a, b) => {
      const aPref = a.difficulty <= maxDiff ? 0 : 1;
      const bPref = b.difficulty <= maxDiff ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return a.word.length - b.word.length;
    });
  }

  /** Words suitable for Korean Match — see match-words.js for full pool and modes. */
  function getMatchWordList() {
    if (global.MatchWords?.ALL_WORDS?.length) {
      return global.MatchWords.ALL_WORDS;
    }
    const fromLearning = LEARNING_WORDS
      .filter((w) => w.word.length >= 1 && w.word.length <= 3)
      .map((w) => w.word);

    const extraMatch = [
      '과자', '과일', '회사', '의사', '외국', '최고', '귀신', '퇴근', '좌우',
      '거북이', '호랑이', '다람쥐', '코끼리', '원숭이', '너구리', '무지개', '눈사람', '보름달',
      '비빔밥', '떡볶이', '불고기', '김치전', '된장국', '삼겹살', '김밥', '피자',
      '자전거', '컴퓨터', '도서관', '수영장', '편의점', '놀이터', '미술관', '박물관',
      '친구', '하늘', '바다', '커피', '동물', '여름', '겨울', '행복', '영화',
      '공원', '병원', '우체국', '지하철', '운동화', '냉장고',
    ];

    return [...fromLearning, ...extraMatch].filter((w, i, a) => a.indexOf(w) === i);
  }

  function findWordEntry(word) {
    return LEARNING_WORDS.find((e) => e.word === word) || null;
  }

  function getNormalizedWord(word) {
    const entry = findWordEntry(word);
    if (!entry || !global.LearningWordModel) return entry;
    return global.LearningWordModel.normalizeLearningWord(entry);
  }

  global.LearningWords = {
    LEARNING_WORDS,
    getBuilderWordList,
    getMatchWordList,
    findWordEntry,
    getNormalizedWord,
  };
})(typeof window !== 'undefined' ? window : globalThis);
