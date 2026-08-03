/**
 * Interactive first-login tutorial — guided Korean Match lessons.
 */
(function (global) {
  'use strict';

  const STEPS = [
    {
      id: 'place-so',
      type: 'guided-place',
      word: '소',
      wordLength: 1,
      titleKey: 'tutorial.steps.placeSo.title',
      bodyKey: 'tutorial.steps.placeSo.body',
      placements: [
        { char: 'ㅅ', zoneType: 'cho', syllableIndex: 0 },
        { char: 'ㅗ', zoneType: 'jungH', syllableIndex: 0 },
      ],
    },
    {
      id: 'place-gam',
      type: 'guided-place',
      word: '산',
      wordLength: 1,
      titleKey: 'tutorial.steps.placeGam.title',
      bodyKey: 'tutorial.steps.placeGam.body',
      placements: [
        { char: 'ㅅ', zoneType: 'cho', syllableIndex: 0 },
        { char: 'ㅏ', zoneType: 'jungV', syllableIndex: 0 },
        { char: 'ㄴ', zoneType: 'jong', syllableIndex: 0 },
      ],
    },
    {
      id: 'rotate-vowel',
      type: 'guided-rotate',
      word: '코',
      wordLength: 1,
      titleKey: 'tutorial.steps.rotateVowel.title',
      bodyKey: 'tutorial.steps.rotateVowel.body',
      prePlaced: [{ char: 'ㅋ', zoneType: 'cho', syllableIndex: 0, locked: true }],
      bankTiles: [{ char: 'ㅏ', zoneType: 'jungH', syllableIndex: 0 }],
      rotateTarget: { from: 'ㅏ', to: 'ㅗ' },
      afterRotatePlacement: { char: 'ㅗ', zoneType: 'jungH', syllableIndex: 0 },
    },
    {
      id: 'rotate-consonant',
      type: 'guided-rotate',
      word: '나',
      wordLength: 1,
      titleKey: 'tutorial.steps.rotateConsonant.title',
      bodyKey: 'tutorial.steps.rotateConsonant.body',
      bankTiles: [
        { char: 'ㄱ', zoneType: 'cho', syllableIndex: 0 },
        { char: 'ㅏ', zoneType: 'jungV', syllableIndex: 0 },
      ],
      rotateTarget: { from: 'ㄱ', to: 'ㄴ' },
      placements: [
        { char: 'ㄴ', zoneType: 'cho', syllableIndex: 0 },
        { char: 'ㅏ', zoneType: 'jungV', syllableIndex: 0 },
      ],
    },
    {
      id: 'merge-vowels',
      type: 'guided-merge',
      word: '개',
      wordLength: 1,
      titleKey: 'tutorial.steps.merge.title',
      bodyKey: 'tutorial.steps.merge.body',
      hideRotation: false,
      prePlaced: [{ char: 'ㄱ', zoneType: 'cho', syllableIndex: 0, locked: true }],
      bankTiles: [
        { char: 'ㅏ', zoneType: 'jungV', syllableIndex: 0 },
        { char: 'ㅣ', zoneType: 'jungV', syllableIndex: 0 },
      ],
      mergeTargets: [
        { result: 'ㅐ', slots: ['ㅏ', 'ㅣ'] },
      ],
      afterMergePlacement: { char: 'ㅐ', zoneType: 'jungV', syllableIndex: 0 },
    },
    {
      id: 'compound-vowel',
      type: 'guided-place',
      word: '과',
      wordLength: 1,
      titleKey: 'tutorial.steps.compoundVowel.title',
      bodyKey: 'tutorial.steps.compoundVowel.body',
      placements: [
        { char: 'ㄱ', zoneType: 'cho', syllableIndex: 0 },
        { char: 'ㅗ', zoneType: 'jungH', syllableIndex: 0 },
        { char: 'ㅏ', zoneType: 'jungV', syllableIndex: 0 },
      ],
    },
    {
      id: 'solve-hwasal',
      type: 'free-solve',
      word: '화살',
      wordLength: 2,
      titleKey: 'tutorial.steps.solveHwasal.title',
      bodyKey: 'tutorial.steps.solveHwasal.body',
      bankTiles: [
        { char: 'ㅎ', zoneType: 'cho', syllableIndex: 0 },
        { char: 'ㅜ', zoneType: 'jungH', syllableIndex: 0 },
        { char: 'ㅏ', zoneType: 'jungV', syllableIndex: 0 },
        { char: 'ㅅ', zoneType: 'cho', syllableIndex: 1 },
        { char: 'ㅏ', zoneType: 'jungV', syllableIndex: 1 },
        { char: 'ㄹ', zoneType: 'jong', syllableIndex: 1 },
      ],
    },
  ];

  const TOTAL_STEPS = STEPS.length;

  function getStep(index) {
    const i = Math.max(0, Math.min(STEPS.length - 1, parseInt(index, 10) || 0));
    return STEPS[i] ? { ...STEPS[i], index: i } : null;
  }

  function getStepById(id) {
    const i = STEPS.findIndex((s) => s.id === id);
    return i >= 0 ? { ...STEPS[i], index: i } : null;
  }

  function getAllSteps() {
    return STEPS.map((s, index) => ({ ...s, index }));
  }

  global.TutorialProgram = {
    STEPS,
    TOTAL_STEPS,
    getStep,
    getStepById,
    getAllSteps,
  };
})(typeof window !== 'undefined' ? window : globalThis);
