/**
 * Unified Korean word bank — single source for Hangul Builder and Korean Match.
 * Word data lives in learning-words-data.js (imported from data/korean-learning-nouns.xlsx).
 * Regenerate: npm run import-words
 */
(function (global) {
  'use strict';

  function glossaryMeaning(word) {
    return global.MatchWordMeanings?.[String(word || '').trim()] || '';
  }

  /** Hanzi-only glosses from the imported spreadsheet — prefer English glossary instead. */
  function isHanziGloss(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    return /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(s);
  }

  function pickEnglishMeaning(word, rawMeaning) {
    const glossary = glossaryMeaning(word);
    const curated = String(rawMeaning || '').trim();
    if (curated && !isHanziGloss(curated)) return curated;
    if (glossary) return glossary;
    return curated;
  }

  function normalizeEntry(entry) {
    if (typeof entry === 'string') {
      return { word: entry, meaning: glossaryMeaning(entry) };
    }
    if (entry && typeof entry.word === 'string') {
      return {
        ...entry,
        meaning: pickEnglishMeaning(entry.word, entry.meaning),
      };
    }
    return null;
  }

  function dedupeByWord(entries) {
    const out = [];
    const seen = new Set();
    for (const raw of entries) {
      const entry = normalizeEntry(raw);
      if (!entry || seen.has(entry.word)) continue;
      seen.add(entry.word);
      out.push(entry);
    }
    return out;
  }

  function getWordMeaning(word) {
    const key = String(word || '').trim();
    if (!key) return '';
    const entry = LEARNING_WORDS.find((e) => e.word === key);
    return pickEnglishMeaning(key, entry?.meaning);
  }

  const RAW_WORDS = Array.isArray(global.LEARNING_WORDS_RAW)
    ? global.LEARNING_WORDS_RAW
    : [];

  const LEARNING_WORDS = dedupeByWord(RAW_WORDS);

  function getAllWordStrings() {
    return LEARNING_WORDS.map((e) => e.word);
  }

  /** Words sorted for Hangul Builder curriculum (entries with difficulty only). */
  function getBuilderWordList() {
    const level = global.UserPreferences?.getLearningLevel?.() || 'beginner';
    const maxDiff = level === 'advanced' ? 5 : level === 'intermediate' ? 3 : 2;
    return LEARNING_WORDS.filter((w) => w.difficulty != null).slice().sort((a, b) => {
      const aPref = a.difficulty <= maxDiff ? 0 : 1;
      const bPref = b.difficulty <= maxDiff ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return a.word.length - b.word.length;
    });
  }

  /** All words for Korean Match modes (syllable-length pools). */
  function getMatchWordList() {
    return getAllWordStrings();
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
    RAW_WORDS,
    getAllWordStrings,
    getBuilderWordList,
    getMatchWordList,
    findWordEntry,
    getNormalizedWord,
    getWordMeaning,
  };
})(typeof window !== 'undefined' ? window : globalThis);
