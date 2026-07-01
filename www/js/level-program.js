/**
 * Level Mode — 30-step learning program (rotation, merge, word building).
 */
(function (global) {
  'use strict';

  const TOTAL_LEVELS = 30;

  const MECHANICS = {
    INTRO: 'intro',
    PLACE: 'place',
    ROTATE: 'rotate',
    MERGE: 'merge',
    WORD: 'word',
    REVIEW: 'review',
    CHALLENGE: 'challenge',
  };

  /** Levels 1–5 have bespoke copy in i18n; later levels use mechanic templates. */
  const CUSTOM_COPY_LEVELS = new Set([1, 2, 3, 4, 5]);

  function level(id, mechanic) {
    return { id, mechanic };
  }

  const LEVELS = [
    level(1, MECHANICS.INTRO),
    level(2, MECHANICS.PLACE),
    level(3, MECHANICS.ROTATE),
    level(4, MECHANICS.MERGE),
    level(5, MECHANICS.WORD),
    level(6, MECHANICS.ROTATE),
    level(7, MECHANICS.PLACE),
    level(8, MECHANICS.MERGE),
    level(9, MECHANICS.WORD),
    level(10, MECHANICS.REVIEW),
    level(11, MECHANICS.ROTATE),
    level(12, MECHANICS.MERGE),
    level(13, MECHANICS.WORD),
    level(14, MECHANICS.PLACE),
    level(15, MECHANICS.REVIEW),
    level(16, MECHANICS.ROTATE),
    level(17, MECHANICS.MERGE),
    level(18, MECHANICS.WORD),
    level(19, MECHANICS.CHALLENGE),
    level(20, MECHANICS.REVIEW),
    level(21, MECHANICS.ROTATE),
    level(22, MECHANICS.MERGE),
    level(23, MECHANICS.WORD),
    level(24, MECHANICS.CHALLENGE),
    level(25, MECHANICS.REVIEW),
    level(26, MECHANICS.WORD),
    level(27, MECHANICS.CHALLENGE),
    level(28, MECHANICS.MERGE),
    level(29, MECHANICS.CHALLENGE),
    level(30, MECHANICS.CHALLENGE),
  ];

  function getLevel(id) {
    return LEVELS.find((l) => l.id === parseInt(id, 10)) || null;
  }

  function getAllLevels() {
    return LEVELS.slice();
  }

  function hasCustomCopy(levelId) {
    return CUSTOM_COPY_LEVELS.has(levelId);
  }

  function customCopyKeys(levelId) {
    const pad = String(levelId).padStart(2, '0');
    return {
      titleKey: `levelMode.levels.l${pad}.title`,
      descKey: `levelMode.levels.l${pad}.desc`,
    };
  }

  function getMechanicIcon(mechanic) {
    const map = {
      [MECHANICS.INTRO]: '👋',
      [MECHANICS.PLACE]: '🧩',
      [MECHANICS.ROTATE]: '↻',
      [MECHANICS.MERGE]: '➕',
      [MECHANICS.WORD]: '📝',
      [MECHANICS.REVIEW]: '🔁',
      [MECHANICS.CHALLENGE]: '🏆',
    };
    return map[mechanic] || '•';
  }

  global.LevelProgram = {
    TOTAL_LEVELS,
    MECHANICS,
    LEVELS,
    getLevel,
    getAllLevels,
    hasCustomCopy,
    customCopyKeys,
    getMechanicIcon,
  };
})(typeof window !== 'undefined' ? window : globalThis);
