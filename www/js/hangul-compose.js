/**
 * Hangul syllable composition logic for Korean Match.
 * Separated from UI — handles jamo tables, decomposition, compound vowels, and composition.
 */
(function (global) {
  'use strict';

  /** Initial consonants (초성) — 19 jamo */
  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  /** Medial vowels (중성) — includes pre-composed compound vowels */
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];

  /** Final consonants (종성) — index 0 = none */
  const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  /**
   * Valid pairwise compound-vowel construction rules.
   * Only these merges are allowed — no archaic or ad-hoc combinations.
   */
  const COMPOUND_VOWEL_RULES = {
    'ㅏ+ㅣ': 'ㅐ',
    'ㅑ+ㅣ': 'ㅒ',
    'ㅓ+ㅣ': 'ㅔ',
    'ㅕ+ㅣ': 'ㅖ',
    'ㅗ+ㅏ': 'ㅘ',
    'ㅗ+ㅐ': 'ㅙ',
    'ㅗ+ㅣ': 'ㅚ',
    'ㅜ+ㅓ': 'ㅝ',
    'ㅜ+ㅔ': 'ㅞ',
    'ㅜ+ㅣ': 'ㅟ',
    'ㅡ+ㅣ': 'ㅢ',
  };

  /**
   * Preferred component paths for each medial vowel (basic jamo only).
   * Uses expanded beginner paths for ㅙ and ㅞ.
   */
  const MEDIAL_COMPONENTS_MAP = {
    'ㅏ': ['ㅏ'],
    'ㅐ': ['ㅏ', 'ㅣ'],
    'ㅑ': ['ㅑ'],
    'ㅒ': ['ㅑ', 'ㅣ'],
    'ㅓ': ['ㅓ'],
    'ㅔ': ['ㅓ', 'ㅣ'],
    'ㅕ': ['ㅕ'],
    'ㅖ': ['ㅕ', 'ㅣ'],
    'ㅗ': ['ㅗ'],
    'ㅘ': ['ㅗ', 'ㅏ'],
    'ㅙ': ['ㅗ', 'ㅏ', 'ㅣ'],
    'ㅚ': ['ㅗ', 'ㅣ'],
    'ㅛ': ['ㅛ'],
    'ㅜ': ['ㅜ'],
    'ㅝ': ['ㅜ', 'ㅓ'],
    'ㅞ': ['ㅜ', 'ㅓ', 'ㅣ'],
    'ㅟ': ['ㅜ', 'ㅣ'],
    'ㅠ': ['ㅠ'],
    'ㅡ': ['ㅡ'],
    'ㅢ': ['ㅡ', 'ㅣ'],
    'ㅣ': ['ㅣ'],
  };

  /**
   * Legacy compound vowel map (horizontal + vertical pair).
   * Kept for vowels.html and backward-compatible composeJung.
   */
  const COMPOUND_VOWELS = {
    'ㅘ': { h: 'ㅗ', v: 'ㅏ' },
    'ㅙ': { h: 'ㅗ', v: 'ㅐ' },
    'ㅚ': { h: 'ㅗ', v: 'ㅣ' },
    'ㅝ': { h: 'ㅜ', v: 'ㅓ' },
    'ㅞ': { h: 'ㅜ', v: 'ㅔ' },
    'ㅟ': { h: 'ㅜ', v: 'ㅣ' },
    'ㅢ': { h: 'ㅡ', v: 'ㅣ' },
  };

  /** Vowels that occupy only the horizontal (stack) zone */
  const HORIZONTAL_VOWELS = new Set(['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ']);

  /** Vowels that occupy only the vertical (side) zone */
  const VERTICAL_VOWELS = new Set(['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅣ']);

  /** Basic jamo allowed in each vowel drop zone */
  const PLACEABLE_HORIZONTAL_VOWELS = new Set(['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ']);
  const PLACEABLE_VERTICAL_VOWELS = new Set(['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅣ']);

  const ZONE = { CHO: 'cho', JUNG_H: 'jungH', JUNG_V: 'jungV', JONG: 'jong' };

  /** Vertical + vertical merges for the vowel merge dock only (left slot + right slot). */
  const VERTICAL_MERGE_RULES = {
    'ㅏ+ㅣ': 'ㅐ',
    'ㅓ+ㅣ': 'ㅔ',
    'ㅣ+ㅓ': 'ㅐ',
    'ㅑ+ㅣ': 'ㅒ',
    'ㅕ+ㅣ': 'ㅖ',
    'ㅣ+ㅕ': 'ㅒ',
  };

  const VERTICAL_MERGE_MEDIALS = new Set(['ㅐ', 'ㅒ', 'ㅔ', 'ㅖ']);

  /** Build drop-zone slots from basic medial components */
  function buildVowelSlots(medialComponents, medial) {
    if (medial && isVerticalMergeMedial(medial)) {
      return [{ zoneType: ZONE.JUNG_V, subIndex: 0, expected: medial }];
    }
    const slots = [];
    (medialComponents || []).forEach((char) => {
      if (HORIZONTAL_VOWELS.has(char)) {
        slots.push({ zoneType: ZONE.JUNG_H, subIndex: 0, expected: char });
      } else if (VERTICAL_VOWELS.has(char)) {
        const subIndex = slots.filter((s) => s.zoneType === ZONE.JUNG_V).length;
        slots.push({ zoneType: ZONE.JUNG_V, subIndex, expected: char });
      }
    });
    return slots;
  }

  function isComposedMedial(char) {
    return getMedialComponents(char).length > 1;
  }

  function isHangulSyllable(ch) {
    const cp = ch.codePointAt(0);
    return cp >= 0xAC00 && cp <= 0xD7A3;
  }

  /** Unicode syllable → { cho, jung, jong } */
  function decompose(syllable) {
    const code = syllable.codePointAt(0) - 0xAC00;
    const choIdx = Math.floor(code / (21 * 28));
    const jungIdx = Math.floor((code % (21 * 28)) / 28);
    const jongIdx = code % 28;
    return { cho: CHO[choIdx], jung: JUNG[jungIdx], jong: JONG[jongIdx] };
  }

  /** Alias for shared API — syllable → { cho, jung, jong } */
  function decomposeHangulSyllable(syllable) {
    return decompose(syllable);
  }

  /** Basic jamo components needed to build a medial vowel */
  function getMedialComponents(medial) {
    if (MEDIAL_COMPONENTS_MAP[medial]) return MEDIAL_COMPONENTS_MAP[medial].slice();
    if (JUNG.includes(medial)) return [medial];
    return [];
  }

  /** Try merging adjacent components using COMPOUND_VOWEL_RULES until stable */
  function tryComposeMedial(components) {
    if (!Array.isArray(components) || components.length === 0) return null;
    if (components.length === 1) {
      return JUNG.includes(components[0]) ? components[0] : null;
    }

    function reduce(parts) {
      if (parts.length === 1) {
        return JUNG.includes(parts[0]) ? parts[0] : null;
      }
      for (let i = 0; i < parts.length - 1; i++) {
        const key = `${parts[i]}+${parts[i + 1]}`;
        const merged = COMPOUND_VOWEL_RULES[key];
        if (merged) {
          const next = parts.slice(0, i).concat([merged], parts.slice(i + 2));
          const result = reduce(next);
          if (result) return result;
        }
      }
      return null;
    }

    return reduce(components.slice());
  }

  function isValidMedialCombination(components) {
    return tryComposeMedial(components) !== null;
  }

  function isVerticalMergeMedial(medial) {
    return VERTICAL_MERGE_MEDIALS.has(medial);
  }

  /** Merge two vertical vowels in the dock — left slot + right slot only (order matters). */
  function tryComposeVerticalMedial(first, second) {
    if (!first || !second) return null;
    if (!PLACEABLE_VERTICAL_VOWELS.has(first) || !PLACEABLE_VERTICAL_VOWELS.has(second)) {
      return null;
    }
    return VERTICAL_MERGE_RULES[`${first}+${second}`] || null;
  }

  /** Basic jamo pair for un-merging dock compounds */
  function getMergePairComponents(medial) {
    if (!isVerticalMergeMedial(medial)) return null;
    for (const [key, val] of Object.entries(VERTICAL_MERGE_RULES)) {
      if (val === medial) return key.split('+');
    }
    return null;
  }

  /**
   * Split a medial vowel into horizontal / vertical jamo for drop zones.
   * Simple vowels use one zone; compound vowels may use multiple vertical sub-slots.
   */
  function decomposeVowel(jung) {
    const components = getMedialComponents(jung);
    const h = components.find((c) => HORIZONTAL_VOWELS.has(c)) || null;
    const verticals = components.filter((c) => VERTICAL_VOWELS.has(c));
    return {
      h,
      v: verticals.length === 1 ? verticals[0] : null,
      vSlots: verticals,
      components,
    };
  }

  function buildZonesFromVowelSlots(vowelSlots, cho, jong) {
    const jungH = vowelSlots.find((s) => s.zoneType === ZONE.JUNG_H)?.expected || null;
    const jungVSlots = vowelSlots
      .filter((s) => s.zoneType === ZONE.JUNG_V)
      .map((s) => s.expected);

    return {
      cho: { active: true, expected: cho },
      jungH: { active: !!jungH, expected: jungH },
      jungV: {
        active: jungVSlots.length > 0,
        expected: jungVSlots.length === 1 ? jungVSlots[0] : null,
        subSlots: jungVSlots.map((expected, subIndex) => ({ subIndex, expected })),
      },
      jong: { active: true, expected: jong || null },
    };
  }

  /**
   * Full syllable breakdown for Korean Match / Hangul Builder slots.
   * Each syllable exposes which zones are active and their expected jamo.
   */
  function decomposeSyllableForMatch(syllable) {
    const { cho, jung, jong } = decompose(syllable);
    const medialComponents = getMedialComponents(jung);
    const vowelSlots = buildVowelSlots(medialComponents, jung);
    const parts = decomposeVowel(jung);

    return {
      syllable,
      cho,
      jung,
      medial: jung,
      medialComponents,
      jungH: parts.h,
      jungV: parts.vSlots.length === 1 ? parts.vSlots[0] : (parts.vSlots.length ? parts.vSlots : null),
      jungVSlots: parts.vSlots,
      jong: jong || null,
      vowelSlots,
      zones: buildZonesFromVowelSlots(vowelSlots, cho, jong),
    };
  }

  /** Decompose an entire word into per-syllable slot data */
  function decomposeWordForMatch(word) {
    return [...word].filter(isHangulSyllable).map((ch, index) => ({
      index,
      ...decomposeSyllableForMatch(ch),
    }));
  }

  /**
   * Hangul Builder slot model: 초성 + 중성 + optional 받침 per syllable.
   */
  function decomposeSyllableForBuilder(syllable) {
    const data = decomposeSyllableForMatch(syllable);
    const slots = [{ part: 'cho', char: data.cho }];
    data.vowelSlots.forEach((vs) => {
      slots.push({ part: vs.zoneType, subIndex: vs.subIndex, char: vs.expected });
    });
    if (data.jong) slots.push({ part: 'jong', char: data.jong });
    return {
      syllable: data.syllable,
      cho: data.cho,
      jung: data.jung,
      medial: data.medial,
      medialComponents: data.medialComponents,
      jong: data.jong,
      slots,
    };
  }

  function decomposeWordForBuilder(word) {
    return [...word].filter(isHangulSyllable).map(decomposeSyllableForBuilder);
  }

  /** Build draggable tile list for Hangul Builder — same zones as Korean Match */
  function buildBuilderTilesFromWord(word) {
    const syllables = decomposeWordForMatch(word);
    return { syllables, tiles: buildTilesFromWord(syllables) };
  }

  /** Assemble syllable from 초성, 중성, optional 받침 */
  function composeHangulSyllable(initial, medial, finalConsonant) {
    if (!initial || !medial) return null;
    const choIdx = CHO.indexOf(initial);
    const jungIdx = JUNG.indexOf(medial);
    const jongChar = finalConsonant || '';
    const jongIdx = JONG.indexOf(jongChar);
    if (choIdx < 0 || jungIdx < 0 || jongIdx < 0) return null;
    return String.fromCodePoint(0xAC00 + choIdx * 21 * 28 + jungIdx * 28 + jongIdx);
  }

  /** Compose syllable from placed medial component jamo */
  function composeSyllableFromComponents(cho, medialComponents, jong) {
    const filtered = (medialComponents || []).filter(Boolean);
    const medial = tryComposeMedial(filtered);
    if (!medial) return null;
    return composeHangulSyllable(cho, medial, jong);
  }

  /** Compose syllable from zone contents (horizontal + vertical sub-slots) */
  function composeSyllableFromZones(cho, jungH, jungVSlots, jong) {
    const components = [];
    if (jungH) components.push(jungH);
    if (jungVSlots && jungVSlots.length) components.push(...jungVSlots.filter(Boolean));
    return composeSyllableFromComponents(cho, components, jong);
  }

  /**
   * Combine horizontal + vertical jamo back into a medial vowel.
   * Returns the simple vowel if only one component is present.
   */
  function composeJung(jungH, jungV) {
    if (jungH && jungV) {
      const fromRules = tryComposeMedial([jungH, jungV]);
      if (fromRules) return fromRules;
      for (const [compound, parts] of Object.entries(COMPOUND_VOWELS)) {
        if (parts.h === jungH && parts.v === jungV) return compound;
      }
      return null;
    }
    return jungH || jungV || null;
  }

  /** Assemble a complete Hangul syllable from zone contents (live preview) */
  function composeSyllable(cho, jungH, jungV, jong) {
    if (Array.isArray(jungV)) {
      return composeSyllableFromZones(cho, jungH, jungV, jong);
    }
    const components = [];
    if (jungH) components.push(jungH);
    if (jungV) components.push(jungV);
    if (components.length > 1) {
      return composeSyllableFromComponents(cho, components, jong);
    }
    const jung = composeJung(jungH, jungV);
    if (!cho || !jung) return null;
    return composeHangulSyllable(cho, jung, jong);
  }

  /** Readable preview while building compound vowels, e.g. "ㅏ + ㅣ → ㅐ" */
  function formatVowelCompositionPreview(components) {
    const filtered = (components || []).filter(Boolean);
    if (filtered.length <= 1) return null;
    const composed = tryComposeMedial(filtered);
    if (!composed) return null;
    return `${filtered.join(' + ')} → ${composed}`;
  }

  /** Whether a jamo may be dropped in a given zone type (by character shape) */
  function canPlaceInZone(char, zoneType) {
    if (zoneType === ZONE.CHO) return CHO.includes(char);
    if (zoneType === ZONE.JONG) return JONG.includes(char) && char !== '';
    if (zoneType === ZONE.JUNG_H) return PLACEABLE_HORIZONTAL_VOWELS.has(char);
    if (zoneType === ZONE.JUNG_V) {
      return PLACEABLE_VERTICAL_VOWELS.has(char);
    }
    return false;
  }

  /** Whether a zone/slot is part of the target word (has an expected jamo) */
  function isActiveZone(zone) {
    return zone != null && zone.expected != null && zone.expected !== '';
  }

  /** Prefer matching a tile's intended zone (handles ㄱ as 초성 vs 받침) */
  function canPlaceTileInZone(tile, zoneType, subIndex) {
    if (!tile || !zoneType) return false;
    const tileSub = Number(tile.subIndex ?? 0);
    const zoneSub = Number(subIndex ?? 0);
    if (tileSub !== zoneSub) return false;
    if (!canPlaceInZone(tile.char, zoneType)) return false;

    if (zoneType === ZONE.CHO || zoneType === ZONE.JONG) {
      return tile.zoneType === zoneType;
    }

    if (zoneType === ZONE.JUNG_H || zoneType === ZONE.JUNG_V) {
      return tile.zoneType === ZONE.JUNG_H || tile.zoneType === ZONE.JUNG_V;
    }
    return false;
  }

  /** Whether tile char satisfies what the zone expects (merged compounds, etc.) */
  function tileMatchesZoneExpected(tile, zone) {
    if (!tile || !zone) return false;
    return tile.char === zone.expected;
  }

  /** Whether a tile may be placed in a zone/slot */
  function isValidTilePlacement(tile, zone) {
    if (!tile || !zone || !isActiveZone(zone)) return false;
    if (Number(tile.syllableIndex) !== Number(zone.syllableIndex)) return false;
    if (Number(tile.subIndex ?? 0) !== Number(zone.subIndex ?? 0)) return false;
    return canPlaceTileInZone(tile, zone.zoneType, zone.subIndex);
  }

  /** Korean Match consonant tile (초성 or 받침 label — either may fill cho/jong slots) */
  function isConsonantTile(tile) {
    return tile && (tile.zoneType === ZONE.CHO || tile.zoneType === ZONE.JONG);
  }

  /**
   * Korean Match — place by zone role (cho/jungH/jungV/jong), not by answer slot.
   * Decoy slots accept any tile of matching role.
   * Vowels may fill any slot of the same orientation (H vs V) anywhere on the board.
   * Consonants may fill any cho/jong slot; invalid 받침 blocked by canPlaceInZone.
   */
  function isValidMatchPlacement(tile, zone) {
    if (!tile || !zone) return false;

    if (zone.zoneType === ZONE.CHO || zone.zoneType === ZONE.JONG) {
      if (!isConsonantTile(tile)) return false;
      return canPlaceInZone(tile.char, zone.zoneType);
    }

    if (tile.zoneType !== ZONE.JUNG_H && tile.zoneType !== ZONE.JUNG_V) return false;

    if (tile.isMerged) {
      return zone.zoneType === ZONE.JUNG_V && isVerticalMergeMedial(tile.char);
    }

    if (!canPlaceInZone(tile.char, zone.zoneType)) return false;

    return zone.zoneType === ZONE.JUNG_H || zone.zoneType === ZONE.JUNG_V;
  }

  /** Stricter check for Hangul Builder — tile must match the expected jamo */
  function isCorrectTilePlacement(tile, zone) {
    if (!isValidTilePlacement(tile, zone)) return false;
    return tileMatchesZoneExpected(tile, zone);
  }

  /** Build draggable tile list from word decomposition */
  function buildTilesFromWord(syllables) {
    const tiles = [];
    let id = 0;
    syllables.forEach((syl) => {
      if (syl.zones.cho.expected) {
        tiles.push({
          id: `tile-${id++}`,
          char: syl.zones.cho.expected,
          zoneType: ZONE.CHO,
          subIndex: 0,
          syllableIndex: syl.index,
        });
      }
      if (isVerticalMergeMedial(syl.jung)) {
        getMedialComponents(syl.jung).forEach((char) => {
          if (!PLACEABLE_VERTICAL_VOWELS.has(char)) return;
          tiles.push({
            id: `tile-${id++}`,
            char,
            zoneType: ZONE.JUNG_V,
            subIndex: 0,
            syllableIndex: syl.index,
            isBasic: true,
          });
        });
      } else {
        (syl.vowelSlots || []).forEach((vs) => {
          tiles.push({
            id: `tile-${id++}`,
            char: vs.expected,
            zoneType: vs.zoneType,
            subIndex: vs.subIndex,
            syllableIndex: syl.index,
          });
        });
      }
      if (syl.zones.jong.expected) {
        tiles.push({
          id: `tile-${id++}`,
          char: syl.zones.jong.expected,
          zoneType: ZONE.JONG,
          subIndex: 0,
          syllableIndex: syl.index,
        });
      }
    });
    return tiles;
  }

  /** Flat list of all active drop slots for a syllable (for UI rendering) */
  function getSyllableSlotDefs(syllableData) {
    const defs = [];
    if (syllableData.zones.cho.expected) {
      defs.push({
        slotKey: 'cho',
        zoneType: ZONE.CHO,
        subIndex: 0,
        expected: syllableData.zones.cho.expected,
      });
    }
    (syllableData.vowelSlots || []).forEach((vs) => {
      defs.push({
        slotKey: vs.zoneType === ZONE.JUNG_V ? `jungV-${vs.subIndex}` : 'jungH',
        zoneType: vs.zoneType,
        subIndex: vs.subIndex,
        expected: vs.expected,
      });
    });
    if (syllableData.zones.jong.expected) {
      defs.push({
        slotKey: 'jong',
        zoneType: ZONE.JONG,
        subIndex: 0,
        expected: syllableData.zones.jong.expected,
      });
    }
    return defs;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Korean Match letter swap — ㄱ↔ㄴ (bank / non-slot) */
  const JAMO_SWAPS = { 'ㄱ': 'ㄴ', 'ㄴ': 'ㄱ', 'ㅡ': 'ㅣ', 'ㅣ': 'ㅡ' };
  const H_VOWEL_CYCLE = ['ㅗ', 'ㅓ', 'ㅜ', 'ㅏ'];
  const V_VOWEL_CYCLE = ['ㅕ', 'ㅠ', 'ㅑ', 'ㅛ'];

  /** In-slot vowel pair swaps */
  const VERTICAL_SLOT_PAIR = { 'ㅏ': 'ㅓ', 'ㅓ': 'ㅏ', 'ㅑ': 'ㅕ', 'ㅕ': 'ㅑ' };
  const HORIZONTAL_SLOT_PAIR = { 'ㅗ': 'ㅜ', 'ㅜ': 'ㅗ', 'ㅛ': 'ㅠ', 'ㅠ': 'ㅛ' };

  /** Merge dock — ㅏ↔ㅓ, ㅑ↔ㅕ (rotatable siblings for valid merges, not cross-family) */
  const MERGE_SLOT_VOWEL_PAIR = { 'ㅏ': 'ㅓ', 'ㅓ': 'ㅏ', 'ㅑ': 'ㅕ', 'ㅕ': 'ㅑ' };

  /** Cross-slot vowel mapping (vertical → horizontal) */
  const VERTICAL_TO_HORIZONTAL = {
    'ㅏ': 'ㅗ', 'ㅓ': 'ㅜ', 'ㅑ': 'ㅛ', 'ㅕ': 'ㅠ', 'ㅣ': 'ㅡ',
  };

  /** Cross-slot vowel mapping (horizontal → vertical) */
  const HORIZONTAL_TO_VERTICAL = {
    'ㅗ': 'ㅏ', 'ㅜ': 'ㅓ', 'ㅛ': 'ㅑ', 'ㅠ': 'ㅕ', 'ㅡ': 'ㅣ',
  };

  /** Vertical-slot entry chars: next step is in-slot pair swap */
  const VOWEL_CYCLE_V_PAIR_FIRST = new Set(['ㅓ', 'ㅕ']);
  /** Vertical-slot chars after pair: next step crosses to horizontal when empty */
  const VOWEL_CYCLE_V_CROSS_NEXT = new Set(['ㅏ', 'ㅑ']);
  /** Horizontal-slot entry chars: next step is in-slot pair swap */
  const VOWEL_CYCLE_H_PAIR_FIRST = new Set(['ㅗ', 'ㅛ']);
  /** Horizontal-slot chars after pair: next step crosses to vertical when empty */
  const VOWEL_CYCLE_H_CROSS_NEXT = new Set(['ㅜ', 'ㅠ']);

  function rotateVowelInVerticalSlot(char, otherSlotOccupied) {
    if (VOWEL_CYCLE_V_PAIR_FIRST.has(char)) {
      return { char: VERTICAL_SLOT_PAIR[char], zoneType: ZONE.JUNG_V };
    }
    if (VOWEL_CYCLE_V_CROSS_NEXT.has(char)) {
      if (!otherSlotOccupied && VERTICAL_TO_HORIZONTAL[char]) {
        return { char: VERTICAL_TO_HORIZONTAL[char], zoneType: ZONE.JUNG_H };
      }
      if (VERTICAL_SLOT_PAIR[char]) {
        return { char: VERTICAL_SLOT_PAIR[char], zoneType: ZONE.JUNG_V };
      }
      return null;
    }
    if (char === 'ㅣ' && !otherSlotOccupied) {
      return { char: 'ㅡ', zoneType: ZONE.JUNG_H };
    }
    return null;
  }

  function rotateVowelInHorizontalSlot(char, otherSlotOccupied) {
    if (VOWEL_CYCLE_H_PAIR_FIRST.has(char)) {
      return { char: HORIZONTAL_SLOT_PAIR[char], zoneType: ZONE.JUNG_H };
    }
    if (VOWEL_CYCLE_H_CROSS_NEXT.has(char)) {
      if (!otherSlotOccupied && HORIZONTAL_TO_VERTICAL[char]) {
        return { char: HORIZONTAL_TO_VERTICAL[char], zoneType: ZONE.JUNG_V };
      }
      if (HORIZONTAL_SLOT_PAIR[char]) {
        return { char: HORIZONTAL_SLOT_PAIR[char], zoneType: ZONE.JUNG_H };
      }
      return null;
    }
    if (char === 'ㅡ' && !otherSlotOccupied) {
      return { char: 'ㅣ', zoneType: ZONE.JUNG_V };
    }
    return null;
  }

  function nextInCycle(cycle, char) {
    const idx = cycle.indexOf(char);
    if (idx < 0) return null;
    return cycle[(idx + 1) % cycle.length];
  }

  /** Advance one step in a Korean Match swap cycle, or null if unsupported */
  function rotateJamo(char) {
    if (JAMO_SWAPS[char]) return JAMO_SWAPS[char];
    const hNext = nextInCycle(H_VOWEL_CYCLE, char);
    if (hNext) return hNext;
    const vNext = nextInCycle(V_VOWEL_CYCLE, char);
    if (vNext) return vNext;
    return null;
  }

  function canRotateJamo(char) {
    return rotateJamo(char) !== null;
  }

  /** Merge machine slots — vertical pair swap only (ㅏ↔ㅓ, ㅑ↔ㅕ). */
  function rotateJamoInMergeSlot(char) {
    const next = MERGE_SLOT_VOWEL_PAIR[char];
    if (!next) return null;
    return { char: next, zoneType: ZONE.JUNG_V };
  }

  function canRotateJamoInMergeSlot(char) {
    return !!MERGE_SLOT_VOWEL_PAIR[char];
  }

  /** Placement orientation for rotatable vowel jamo */
  function vowelPlacementOrientation(char) {
    if (PLACEABLE_HORIZONTAL_VOWELS.has(char)) return 'h';
    if (PLACEABLE_VERTICAL_VOWELS.has(char)) return 'v';
    return null;
  }

  /** Keep 초성/받침 role for ㄱ/ㄴ; update vowel zone when cycle crosses H/V */
  function zoneTypeForRotatedJamo(char, currentZoneType) {
    if (currentZoneType === ZONE.CHO || currentZoneType === ZONE.JONG) return currentZoneType;
    if (HORIZONTAL_VOWELS.has(char)) return ZONE.JUNG_H;
    if (VERTICAL_VOWELS.has(char)) return ZONE.JUNG_V;
    return currentZoneType;
  }

  /**
   * Vowel rotation inside a syllable block slot.
   * Four-family cycles: pair swap → cross (if empty) → pair → cross → repeat.
   * ㅣ/ㅡ still cross only when the other slot is empty.
   */
  function rotateJamoForZone(char, currentZoneType, { otherSlotOccupied = false, inVowelSlot = false } = {}) {
    if (!inVowelSlot || (currentZoneType !== ZONE.JUNG_H && currentZoneType !== ZONE.JUNG_V)) {
      const next = rotateJamo(char);
      if (!next) return null;
      return {
        char: next,
        zoneType: zoneTypeForRotatedJamo(next, currentZoneType),
      };
    }

    if (currentZoneType === ZONE.JUNG_V) {
      return rotateVowelInVerticalSlot(char, otherSlotOccupied);
    }

    return rotateVowelInHorizontalSlot(char, otherSlotOccupied);
  }

  function canRotateJamoForZone(char, currentZoneType, options = {}) {
    return rotateJamoForZone(char, currentZoneType, options) !== null;
  }

  /** Rotate repeatedly until `char` becomes `target`, or null if unreachable */
  function orientJamoToTarget(char, target) {
    if (!char || !target || char === target) return char === target ? char : null;
    let current = char;
    for (let i = 0; i < 8; i++) {
      const next = rotateJamo(current);
      if (!next) break;
      current = next;
      if (current === target) return current;
    }
    current = char;
    for (let i = 0; i < 4; i++) {
      const next = MERGE_SLOT_VOWEL_PAIR[current];
      if (!next) break;
      current = next;
      if (current === target) return current;
    }
    return null;
  }

  /**
   * Orient a tile toward its answer jamo, including merge-dock pair swaps and
   * vowel-slot cross rotations when the bank cycle alone cannot reach the target.
   */
  function orientTileJamo(char, zoneType, target, options = {}) {
    if (!char || !target) return null;
    if (char === target) {
      return { char: target, zoneType: zoneTypeForRotatedJamo(target, zoneType) };
    }

    const bankResult = orientJamoToTarget(char, target);
    if (bankResult) {
      return { char: bankResult, zoneType: zoneTypeForRotatedJamo(bankResult, zoneType) };
    }

    if (options.inMergeSlot || MERGE_SLOT_VOWEL_PAIR[char] || MERGE_SLOT_VOWEL_PAIR[target]) {
      let current = char;
      for (let i = 0; i < 4; i++) {
        const next = MERGE_SLOT_VOWEL_PAIR[current];
        if (!next) break;
        current = next;
        if (current === target) {
          return { char: current, zoneType: ZONE.JUNG_V };
        }
      }
    }

    const trySlotOrient = (otherSlotOccupied) => {
      let current = char;
      let zt = zoneType;
      for (let i = 0; i < 8; i++) {
        const next = rotateJamoForZone(current, zt, {
          inVowelSlot: true,
          otherSlotOccupied,
        });
        if (!next) break;
        current = next.char;
        zt = next.zoneType;
        if (current === target) {
          return { char: current, zoneType: zt };
        }
      }
      return null;
    };

    if (options.inVowelSlot) {
      const slotted = trySlotOrient(options.otherSlotOccupied === true);
      if (slotted) return slotted;
    }

    if (vowelPlacementOrientation(char) || vowelPlacementOrientation(target)) {
      const open = trySlotOrient(false);
      if (open) return open;
    }

    return null;
  }

  /**
   * Apply random rotation steps to a rotatable jamo.
   * @param {string} char
   * @param {boolean} ensureChange — if true, result differs from start when possible
   */
  function randomRotateJamo(char, ensureChange) {
    if (!canRotateJamo(char)) return char;
    const start = char;
    let current = char;
    const steps = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < steps; i++) {
      const next = rotateJamo(current);
      if (!next) break;
      current = next;
    }
    if (ensureChange && current === start) {
      const next = rotateJamo(current);
      if (next) current = next;
    }
    return current;
  }

  global.HangulCompose = {
    CHO,
    JUNG,
    JONG,
    ZONE,
    COMPOUND_VOWELS,
    COMPOUND_VOWEL_RULES,
    MEDIAL_COMPONENTS_MAP,
    PLACEABLE_HORIZONTAL_VOWELS,
    PLACEABLE_VERTICAL_VOWELS,
    HORIZONTAL_VOWELS,
    VERTICAL_VOWELS,
    isHangulSyllable,
    decompose,
    decomposeHangulSyllable,
    getMedialComponents,
    tryComposeMedial,
    tryComposeVerticalMedial,
    isVerticalMergeMedial,
    VERTICAL_MERGE_RULES,
    getMergePairComponents,
    isValidMedialCombination,
    isComposedMedial,
    buildVowelSlots,
    decomposeVowel,
    decomposeSyllableForMatch,
    decomposeSyllableForBuilder,
    decomposeWordForMatch,
    decomposeWordForBuilder,
    buildBuilderTilesFromWord,
    composeJung,
    composeSyllable,
    composeSyllableFromComponents,
    composeSyllableFromZones,
    composeHangulSyllable,
    formatVowelCompositionPreview,
    canPlaceInZone,
    canPlaceTileInZone,
    isActiveZone,
    tileMatchesZoneExpected,
    isValidTilePlacement,
    isValidMatchPlacement,
    isCorrectTilePlacement,
    buildTilesFromWord,
    getSyllableSlotDefs,
    shuffle,
    rotateJamo,
    rotateJamoForZone,
    rotateJamoInMergeSlot,
    canRotateJamo,
    canRotateJamoForZone,
    canRotateJamoInMergeSlot,
    vowelPlacementOrientation,
    zoneTypeForRotatedJamo,
    orientJamoToTarget,
    orientTileJamo,
    randomRotateJamo,
  };
})(typeof window !== 'undefined' ? window : globalThis);
