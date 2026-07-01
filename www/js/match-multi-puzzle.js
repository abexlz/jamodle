/**
 * Korean Match — "find N words" puzzles from a fixed jamo tile set + rotation.
 */
(function (global) {
  'use strict';

  const HC = () => global.HangulCompose;
  const DEFAULT_TARGET = 4;

  /** Jamo rotation orbit (matches HangulCompose.rotateJamo cycles). */
  function getOrbit(char) {
    const rotate = HC()?.rotateJamo;
    if (!rotate) return [char];
    const out = [];
    const seen = new Set();
    let c = char;
    while (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
      const next = rotate(c);
      if (!next || next === c) break;
      c = next;
    }
    return out;
  }

  function buildWordSet() {
    const set = new Set();
    const fromMatch = global.MatchWords?.getWordsForLength?.(1) || [];
    fromMatch.forEach((w) => { if (w?.length === 1) set.add(w); });
    (global.LearningWords?.LEARNING_WORDS || []).forEach((e) => {
      if (e?.word?.length === 1) set.add(e.word);
    });
  ['감', '곰', '남', '문', '막', '밤', '밥', '산', '손', '숲', '물', '불', '봄', '살', '술', '잎', '집', '책', '풀', '꿈']
      .forEach((w) => set.add(w));
    return set;
  }

  let cachedWordSet = null;
  function wordSet() {
    if (!cachedWordSet) cachedWordSet = buildWordSet();
    return cachedWordSet;
  }

  /**
   * Enumerate single-syllable words formable by assigning each tile to cho / jung / jong
   * with independent rotations.
   */
  function enumerateWords(tileDefs, filterSet) {
    const compose = HC()?.composeSyllableFromZones;
    const canPlace = HC()?.canPlaceInZone;
    if (!compose || !canPlace || !tileDefs?.length) return [];

    const orbits = tileDefs.map((t) => getOrbit(t.char));
    const words = new Set();
    const n = tileDefs.length;
    const idx = tileDefs.map((_, i) => i);

    function permute(arr, k, out) {
      if (k === arr.length) {
        out.push(arr.slice());
        return;
      }
      for (let i = k; i < arr.length; i++) {
        [arr[k], arr[i]] = [arr[i], arr[k]];
        permute(arr, k + 1, out);
        [arr[k], arr[i]] = [arr[i], arr[k]];
      }
    }

    const rolePerms = [];
    permute(idx.slice(), 0, rolePerms);

    for (const order of rolePerms) {
      const choOrbit = orbits[order[0]];
      const jungOrbit = orbits[order[1]];
      const jongOrbit = orbits[order[2]];

      for (const cho of choOrbit) {
        if (!canPlace(cho, 'cho')) continue;
        for (const jung of jungOrbit) {
          for (const jong of jongOrbit) {
            if (!canPlace(jong, 'jong')) continue;
            let syllable = compose(cho, jung, [], jong);
            if (!syllable) syllable = compose(cho, null, [jung], jong);
            if (!syllable) continue;
            if (filterSet && !filterSet.has(syllable)) continue;
            words.add(syllable);
          }
        }
      }
    }

    return [...words];
  }

  const PUZZLE_DEFS = [
    {
      id: 'gam-gom-nam-mun',
      tiles: [
        { char: 'ㄱ', zoneType: 'cho' },
        { char: 'ㅏ', zoneType: 'jungH' },
        { char: 'ㅁ', zoneType: 'jong' },
      ],
      targetCount: 4,
      hintTiles: 'ㄱ · ㅏ · ㅁ',
    },
    {
      id: 'sal-bul-bok',
      tiles: [
        { char: 'ㅅ', zoneType: 'cho' },
        { char: 'ㅏ', zoneType: 'jungH' },
        { char: 'ㄹ', zoneType: 'jong' },
      ],
      targetCount: 4,
      hintTiles: 'ㅅ · ㅏ · ㄹ',
    },
    {
      id: 'bul-mul-bom',
      tiles: [
        { char: 'ㅂ', zoneType: 'cho' },
        { char: 'ㅜ', zoneType: 'jungH' },
        { char: 'ㄹ', zoneType: 'jong' },
      ],
      targetCount: 4,
      hintTiles: 'ㅂ · ㅜ · ㄹ',
    },
  ];

  function buildPuzzle(def) {
    const dict = wordSet();
    const validWords = enumerateWords(def.tiles, dict);
    return {
      ...def,
      validWords,
      targetCount: def.targetCount || DEFAULT_TARGET,
    };
  }

  function getPuzzles() {
    return PUZZLE_DEFS
      .map(buildPuzzle)
      .filter((p) => p.validWords.length >= (p.targetCount || DEFAULT_TARGET));
  }

  function pickPuzzle(excludeId) {
    const puzzles = getPuzzles();
    const pool = puzzles.filter((p) => p.id !== excludeId);
    const list = pool.length ? pool : puzzles;
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function buildSyllableTemplate() {
    return {
      index: 0,
      syllable: null,
      cho: null,
      jung: null,
      jong: null,
      vowelSlots: [{ zoneType: 'jungH', subIndex: 0, expected: null }],
      zones: {
        cho: { active: true, expected: null },
        jong: { active: true, expected: null },
      },
    };
  }

  function buildTilesFromPuzzle(puzzle) {
    return puzzle.tiles.map((def, i) => ({
      id: `tile-${i}`,
      char: def.char,
      zoneType: def.zoneType,
      subIndex: 0,
      syllableIndex: 0,
    }));
  }

  global.MatchMultiPuzzle = {
    DEFAULT_TARGET,
    enumerateWords,
    getPuzzles,
    PUZZLE_DEFS,
    pickPuzzle,
    buildSyllableTemplate,
    buildTilesFromPuzzle,
    wordSet,
  };
})(typeof window !== 'undefined' ? window : globalThis);
