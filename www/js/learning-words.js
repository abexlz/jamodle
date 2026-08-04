/**
 * Unified Korean word bank — single source for Korean Match and related modes.
 * Word data lives in learning-words-data.js (imported from data/korean-learning-nouns.xlsx).
 * Regenerate: npm run import-words
 */
(function (global) {
  'use strict';

  function isHanziGloss(text) {
    return global.MeaningGlossary?.isHanziGloss?.(text)
      || /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(String(text || '').trim());
  }

  function glossaryEnglish(word) {
    return global.MeaningGlossary?.getEnglish?.(word)
      || global.MatchWordMeanings?.[String(word || '').trim()]
      || '';
  }

  /**
   * Prefer English glossary, then non-hanzi curated text, then hanzi / raw as last resort.
   * @param {string} word
   * @param {string} [rawMeaning]
   * @param {{ allowHanziFallback?: boolean }} [opts]
   */
  function pickEnglishMeaning(word, rawMeaning, opts = {}) {
    const allowHanziFallback = opts.allowHanziFallback !== false;
    const glossary = glossaryEnglish(word);
    if (glossary) return glossary;

    const curated = String(rawMeaning || '').trim();
    if (curated && !isHanziGloss(curated)) return curated;
    if (allowHanziFallback && curated) return curated;
    return '';
  }

  function normalizeEntry(entry) {
    if (typeof entry === 'string') {
      return { word: entry, meaning: glossaryEnglish(entry) };
    }
    if (entry && typeof entry.word === 'string') {
      const raw = entry.meaning;
      return {
        ...entry,
        // Keep original spreadsheet gloss for hanzi fallback; expose best display meaning.
        rawMeaning: raw,
        meaning: pickEnglishMeaning(entry.word, raw, { allowHanziFallback: true }),
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

  function getWordMeaning(word, opts = {}) {
    const key = String(word || '').trim();
    if (!key) return '';
    const entry = LEARNING_WORDS.find((e) => e.word === key);
    const raw = entry?.rawMeaning ?? entry?.meaning;
    return pickEnglishMeaning(key, raw, opts);
  }

  /** Local gloss including hanzi when no English is available. */
  function getLocalMeaningFallback(word) {
    const key = String(word || '').trim();
    if (!key) return '';
    const english = glossaryEnglish(key);
    if (english) return english;
    const entry = LEARNING_WORDS.find((e) => e.word === key);
    const raw = String(entry?.rawMeaning ?? entry?.meaning ?? '').trim();
    return raw;
  }

  const RAW_WORDS = Array.isArray(global.LEARNING_WORDS_RAW)
    ? global.LEARNING_WORDS_RAW
    : [];

  const LEARNING_WORDS = dedupeByWord(RAW_WORDS);

  function getAllWordStrings() {
    return LEARNING_WORDS.map((e) => e.word);
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
    getMatchWordList,
    findWordEntry,
    getNormalizedWord,
    getWordMeaning,
    getLocalMeaningFallback,
    pickEnglishMeaning,
  };
})(typeof window !== 'undefined' ? window : globalThis);
