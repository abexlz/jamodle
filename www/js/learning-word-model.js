/**
 * Shared LearningWord model helpers.
 * Curated app fields + optional dictionary enrichment.
 */
(function (global) {
  'use strict';

  const DIFFICULTY_LABELS = {
    1: 'beginner',
    2: 'beginner',
    3: 'intermediate',
    4: 'advanced',
    5: 'advanced',
  };

  function difficultyToLabel(level) {
    if (typeof level === 'string') return level;
    return DIFFICULTY_LABELS[level] || 'beginner';
  }

  function labelToDifficulty(label) {
    const map = { beginner: 1, intermediate: 3, advanced: 5 };
    return map[label] || 2;
  }

  /** Build jamo decomposition for a word using HangulCompose */
  function buildJamoDecomposition(word) {
    const HC = global.HangulCompose;
    if (!HC) return [];
    return HC.decomposeWordForMatch(word).map((syl) => ({
      syllable: syl.syllable,
      initial: syl.cho,
      cho: syl.cho,
      medial: syl.jung,
      jung: syl.jung,
      medialComponents: syl.medialComponents,
      jong: syl.jong || null,
      final: syl.jong || '',
      jungH: syl.jungH,
      jungV: syl.jungV,
      jungVSlots: syl.jungVSlots,
    }));
  }

  /**
   * Normalize a curated word entry into the LearningWord shape.
   */
  function normalizeLearningWord(entry) {
    if (!entry || !entry.word) return null;
    return {
      word: entry.word,
      meaning: entry.meaning || '',
      category: entry.category || 'general',
      difficulty: difficultyToLabel(entry.difficulty),
      difficultyLevel: entry.difficulty || labelToDifficulty(entry.difficulty),
      emoji: entry.emoji || null,
      image: entry.image || entry.emoji || null,
      tags: entry.tags || [],
      jamoDecomposition: entry.jamoDecomposition || buildJamoDecomposition(entry.word),
      dictionary: entry.dictionary || null,
      dictionaryException: !!entry.dictionaryException,
    };
  }

  /** Merge API dictionary entry into a learning word */
  function attachDictionary(entry, dictEntry) {
    if (!entry || !dictEntry) return entry;
    return {
      ...entry,
      dictionary: {
        source: dictEntry.source || 'Korean Basic Dictionary',
        entryId: dictEntry.entryId,
        pronunciation: dictEntry.pronunciation || null,
        partOfSpeech: dictEntry.partOfSpeech || null,
        partOfSpeechEn: dictEntry.partOfSpeechEn || null,
        definition: dictEntry.definition || dictEntry.englishWord || '',
        example: dictEntry.example || null,
        sourceUrl: dictEntry.sourceUrl || null,
        wordGrade: dictEntry.wordGrade || null,
        lastFetchedAt: dictEntry.lastFetchedAt || new Date().toISOString(),
      },
    };
  }

  /** Display meaning: prefer curated English, fall back to dictionary */
  function getDisplayMeaning(entry) {
    if (!entry) return '';
    const glossary = global.MatchWordMeanings?.[String(entry.word || '').trim()] || '';
    const curated = String(entry.meaning || '').trim();
    const isHanzi = curated && /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(curated);
    if (curated && !isHanzi) return curated;
    if (glossary) return glossary;
    const dictDef = String(entry.dictionary?.definition || entry.dictionary?.englishWord || '').trim();
    if (dictDef && !/^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(dictDef)) return dictDef;
    return curated || dictDef;
  }

  global.LearningWordModel = {
    DIFFICULTY_LABELS,
    difficultyToLabel,
    labelToDifficulty,
    buildJamoDecomposition,
    normalizeLearningWord,
    attachDictionary,
    getDisplayMeaning,
  };
})(typeof window !== 'undefined' ? window : globalThis);
