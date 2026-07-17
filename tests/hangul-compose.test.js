/**
 * Unit tests for Hangul decomposition and composition.
 * Run: node tests/hangul-compose.test.js
 */
'use strict';

const path = require('path');
const vm = require('vm');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(
  require('fs').readFileSync(path.join(__dirname, '../www/js/hangul-compose.js'), 'utf8'),
  sandbox
);

const HC = sandbox.globalThis.HangulCompose;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error('FAIL:', message);
  }
}

function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDeepEqual(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Basic decomposition ──

const yang = HC.decomposeHangulSyllable('양');
assertEqual(yang.cho, 'ㅇ', '양 cho');
assertEqual(yang.jung, 'ㅑ', '양 jung');
assertEqual(yang.jong, 'ㅇ', '양 jong');

const hak = HC.decomposeHangulSyllable('학');
assertEqual(hak.cho, 'ㅎ', '학 cho');
assertEqual(hak.jung, 'ㅏ', '학 jung');
assertEqual(hak.jong, 'ㄱ', '학 jong');

const gwa = HC.decomposeHangulSyllable('과');
assertEqual(gwa.cho, 'ㄱ', '과 cho');
assertEqual(gwa.jung, 'ㅘ', '과 jung');
assertEqual(gwa.jong, '', '과 jong');

// ── Compound vowel rules ──

const compoundPairs = [
  [['ㅏ', 'ㅣ'], 'ㅐ'],
  [['ㅑ', 'ㅣ'], 'ㅒ'],
  [['ㅓ', 'ㅣ'], 'ㅔ'],
  [['ㅕ', 'ㅣ'], 'ㅖ'],
  [['ㅗ', 'ㅏ'], 'ㅘ'],
  [['ㅗ', 'ㅐ'], 'ㅙ'],
  [['ㅗ', 'ㅣ'], 'ㅚ'],
  [['ㅜ', 'ㅓ'], 'ㅝ'],
  [['ㅜ', 'ㅔ'], 'ㅞ'],
  [['ㅜ', 'ㅣ'], 'ㅟ'],
  [['ㅡ', 'ㅣ'], 'ㅢ'],
];

compoundPairs.forEach(([parts, result]) => {
  assertEqual(HC.tryComposeMedial(parts), result, `${parts.join('+')} = ${result}`);
  assert(HC.isValidMedialCombination(parts), `valid: ${parts.join('+')}`);
});

// Expanded multi-step paths
assertEqual(HC.tryComposeMedial(['ㅗ', 'ㅏ', 'ㅣ']), 'ㅙ', 'ㅗ+ㅏ+ㅣ = ㅙ');
assertEqual(HC.tryComposeMedial(['ㅜ', 'ㅓ', 'ㅣ']), 'ㅞ', 'ㅜ+ㅓ+ㅣ = ㅞ');

// Invalid combinations
const invalid = [
  ['ㅏ', 'ㅓ'],
  ['ㅗ', 'ㅜ'],
  ['ㅜ', 'ㅏ'],
  ['ㅡ', 'ㅏ'],
  ['ㅣ', 'ㅗ'],
];
invalid.forEach((parts) => {
  assertEqual(HC.tryComposeMedial(parts), null, `invalid: ${parts.join('+')}`);
  assert(!HC.isValidMedialCombination(parts), `not valid: ${parts.join('+')}`);
});

// ── getMedialComponents ──

assertDeepEqual(HC.getMedialComponents('ㅙ'), ['ㅗ', 'ㅏ', 'ㅣ'], 'getMedialComponents ㅙ');
assertDeepEqual(HC.getMedialComponents('ㅞ'), ['ㅜ', 'ㅓ', 'ㅣ'], 'getMedialComponents ㅞ');
assertDeepEqual(HC.getMedialComponents('ㅐ'), ['ㅏ', 'ㅣ'], 'getMedialComponents ㅐ');
assertDeepEqual(HC.getMedialComponents('ㅘ'), ['ㅗ', 'ㅏ'], 'getMedialComponents ㅘ');
assertDeepEqual(HC.getMedialComponents('ㅏ'), ['ㅏ'], 'getMedialComponents ㅏ');

// ── Complete syllables ──

assertEqual(HC.composeHangulSyllable('ㅁ', 'ㅐ'), '매', '매 = ㅁ + ㅐ');
assertEqual(HC.composeHangulSyllable('ㄱ', 'ㅘ'), '과', '과 = ㄱ + ㅘ');
assertEqual(HC.composeHangulSyllable('ㅇ', 'ㅙ'), '왜', '왜 = ㅇ + ㅙ');
assertEqual(HC.composeHangulSyllable('ㅇ', 'ㅞ'), '웨', '웨 = ㅇ + ㅞ');
assertEqual(HC.composeHangulSyllable('ㅇ', 'ㅢ'), '의', '의 = ㅇ + ㅢ');

assertEqual(
  HC.composeSyllableFromComponents('ㅇ', ['ㅗ', 'ㅏ', 'ㅣ']),
  '왜',
  'compose from components 왜'
);
assertEqual(
  HC.composeSyllableFromComponents('ㄱ', ['ㅗ', 'ㅏ']),
  '과',
  'compose from components 과'
);
assertEqual(
  HC.composeSyllableFromComponents('ㅁ', ['ㅏ', 'ㅣ']),
  '매',
  'compose from components 매'
);

// ── Word decomposition with medialComponents ──

const wae = HC.decomposeSyllableForMatch('왜');
assertEqual(wae.medial, 'ㅙ', '왜 medial');
assertDeepEqual(wae.medialComponents, ['ㅗ', 'ㅏ', 'ㅣ'], '왜 medialComponents');
assertEqual(wae.vowelSlots.length, 3, '왜 jungH + 2 jungV slots');
assertEqual(wae.vowelSlots.find((s) => s.zoneType === 'jungH')?.expected, 'ㅗ', '왜 jungH expects ㅗ');
assertEqual(wae.vowelSlots.filter((s) => s.zoneType === 'jungV')[0]?.expected, 'ㅏ', '왜 jungV0 expects ㅏ');
assertEqual(wae.vowelSlots.filter((s) => s.zoneType === 'jungV')[1]?.expected, 'ㅣ', '왜 jungV1 expects ㅣ');

const mae = HC.decomposeSyllableForMatch('매');
assertDeepEqual(mae.medialComponents, ['ㅏ', 'ㅣ'], '매 medialComponents');
assertEqual(mae.vowelSlots.length, 1, '매 single merged jungV slot');
assertEqual(mae.vowelSlots[0].expected, 'ㅐ', '매 slot expects ㅐ');

assertEqual(HC.tryComposeVerticalMedial('ㅏ', 'ㅣ'), 'ㅐ', 'vertical merge ㅏ+ㅣ');
assertEqual(HC.tryComposeVerticalMedial('ㅓ', 'ㅣ'), 'ㅔ', 'vertical merge ㅓ+ㅣ');
assertEqual(HC.tryComposeVerticalMedial('ㅣ', 'ㅓ'), 'ㅐ', 'vertical merge ㅣ+ㅓ');
assertEqual(HC.tryComposeVerticalMedial('ㅣ', 'ㅏ'), null, 'vertical merge ㅣ+ㅏ rejected');
assertEqual(HC.tryComposeVerticalMedial('ㅑ', 'ㅣ'), 'ㅒ', 'vertical merge ㅑ+ㅣ');
assertEqual(HC.tryComposeVerticalMedial('ㅕ', 'ㅣ'), 'ㅖ', 'vertical merge ㅕ+ㅣ');
assertEqual(HC.tryComposeVerticalMedial('ㅣ', 'ㅕ'), 'ㅒ', 'vertical merge ㅣ+ㅕ');
assertEqual(HC.tryComposeVerticalMedial('ㅣ', 'ㅑ'), null, 'vertical merge ㅣ+ㅑ rejected');
assertEqual(HC.tryComposeVerticalMedial('ㅗ', 'ㅏ'), null, 'horizontal+vertical rejected in dock');
assertDeepEqual(HC.getMergePairComponents('ㅐ'), ['ㅏ', 'ㅣ'], 'unmerge ㅐ default pair');
assertDeepEqual(HC.getMergePairComponents('ㅔ'), ['ㅓ', 'ㅣ'], 'unmerge ㅔ');
assertDeepEqual(HC.getMergePairComponents('ㅒ'), ['ㅑ', 'ㅣ'], 'unmerge ㅒ default pair');
assertDeepEqual(HC.getMergePairComponents('ㅖ'), ['ㅕ', 'ㅣ'], 'unmerge ㅖ');

// ── Builder tiles provide component jamo, not pre-composed compounds ──

const waeTiles = HC.buildBuilderTilesFromWord('왜');
const waeChars = waeTiles.tiles.map((t) => t.char).sort().join('');
assert(waeChars.includes('ㅗ') && waeChars.includes('ㅏ') && waeChars.includes('ㅣ'), '왜 tiles are ㅗ ㅏ ㅣ');
assert(!waeTiles.tiles.some((t) => t.char === 'ㅙ'), '왜 has no pre-composed ㅙ tile');
assert(!waeTiles.tiles.some((t) => t.char === 'ㅐ'), '왜 has no pre-composed ㅐ tile');

const maeTiles = HC.buildBuilderTilesFromWord('매');
assert(maeTiles.tiles.some((t) => t.char === 'ㅏ'), '매 has ㅏ tile');
assert(maeTiles.tiles.some((t) => t.char === 'ㅣ'), '매 has ㅣ tile');
assert(!maeTiles.tiles.some((t) => t.char === 'ㅐ'), '매 has no pre-composed ㅐ tile');

// ── Existing simple vowel / 받침 behaviour ──

const goyangi = HC.decomposeWordForBuilder('고양이');
assertEqual(goyangi.length, 3, '고양이 syllable count');
assertEqual(goyangi[0].jung, 'ㅗ', '고 jung');
assertEqual(goyangi[1].jung, 'ㅑ', '양 jung');
assertEqual(goyangi[1].jong, 'ㅇ', '양 jong');

assertEqual(HC.composeHangulSyllable('ㄱ', 'ㅗ'), '고', 'compose 고');
assertEqual(HC.composeHangulSyllable('ㅇ', 'ㅑ', 'ㅇ'), '양', 'compose 양');
assertEqual(HC.composeHangulSyllable('ㅎ', 'ㅏ', 'ㄱ'), '학', 'compose 학');

const mul = HC.decomposeSyllableForMatch('물');
assertEqual(mul.zones.cho.expected, 'ㅁ', '물 cho');
assertEqual(mul.zones.jungH.expected, 'ㅜ', '물 jungH');
assertEqual(mul.zones.jungV.expected, null, '물 jungV empty');
assertEqual(mul.zones.jong.expected, 'ㄹ', '물 jong');

const mulTiles = HC.buildBuilderTilesFromWord('물');
assertEqual(mulTiles.tiles.length, 3, '물 tile count');

const gwaMatch = HC.decomposeSyllableForMatch('과');
assertEqual(gwaMatch.vowelSlots.find((s) => s.zoneType === 'jungH')?.expected, 'ㅗ', '과 jungH expects ㅗ');
assertEqual(gwaMatch.vowelSlots.find((s) => s.zoneType === 'jungV')?.expected, 'ㅏ', '과 jungV expects ㅏ');
assertEqual(HC.composeSyllableFromZones('ㄱ', 'ㅗ', ['ㅏ'], ''), '과', 'compose 과 from jungH+jungV');

// ── Placement zone rules ──

assert(HC.canPlaceInZone('ㅗ', 'jungH'), 'ㅗ in jungH');
assert(!HC.canPlaceInZone('ㅗ', 'jungV'), 'ㅗ not in jungV');
assert(HC.canPlaceInZone('ㅏ', 'jungV'), 'ㅏ in jungV');
assert(!HC.canPlaceInZone('ㅏ', 'jungH'), 'ㅏ not in jungH');
assert(!HC.canPlaceInZone('ㅐ', 'jungV'), 'composed ㅐ not placeable as tile');
assert(!HC.canPlaceInZone('ㅐ', 'jungH'), 'ㅐ not in jungH');

const placementTile = { char: 'ㅏ', zoneType: 'jungV', subIndex: 0, syllableIndex: 0 };
assert(HC.isValidTilePlacement(placementTile, {
  zoneType: 'jungV', subIndex: 0, syllableIndex: 0, expected: 'ㅏ',
}), 'valid ㅏ → jungV');
assert(!HC.isValidTilePlacement(placementTile, {
  zoneType: 'jungH', subIndex: 0, syllableIndex: 0, expected: 'ㅗ',
}), 'reject ㅏ → jungH');

const choTile = { char: 'ㄱ', zoneType: 'cho', subIndex: 0, syllableIndex: 0 };
assert(!HC.isValidTilePlacement(choTile, {
  zoneType: 'cho', subIndex: 0, syllableIndex: 1, expected: 'ㄴ',
}), 'reject ㄱ cho in other syllable (builder)');
assert(HC.isValidMatchPlacement(choTile, {
  zoneType: 'cho', subIndex: 0, syllableIndex: 0, expected: 'ㄱ',
}), 'match: allow ㄱ cho in same syllable cho zone');
assert(HC.isValidMatchPlacement(choTile, {
  zoneType: 'cho', subIndex: 0, syllableIndex: 1, expected: 'ㄴ',
}), 'match: allow ㄱ cho in any cho zone');
assert(HC.isValidMatchPlacement(choTile, {
  zoneType: 'cho', subIndex: 0, syllableIndex: 1, expected: null,
}), 'match: allow ㄱ cho in decoy cho zone on another syllable');
assert(HC.isValidMatchPlacement(choTile, {
  zoneType: 'jong', subIndex: 0, syllableIndex: 1, expected: null,
}), 'match: allow ㄱ cho tile in jong zone');
const jongTile = { char: 'ㄱ', zoneType: 'jong', subIndex: 0, syllableIndex: 0 };
assert(HC.isValidMatchPlacement(jongTile, {
  zoneType: 'jong', subIndex: 0, syllableIndex: 1, expected: null,
}), 'match: allow ㄱ jong in decoy jong on another syllable');
assert(HC.isValidMatchPlacement(jongTile, {
  zoneType: 'cho', subIndex: 0, syllableIndex: 1, expected: 'ㄴ',
}), 'match: allow ㄱ jong tile in cho zone');
const ppTile = { char: 'ㅃ', zoneType: 'cho', subIndex: 0, syllableIndex: 0 };
assert(HC.isValidMatchPlacement(ppTile, {
  zoneType: 'cho', subIndex: 0, syllableIndex: 0, expected: 'ㅂ',
}), 'match: allow ㅃ in cho zone');
assert(!HC.isValidMatchPlacement(ppTile, {
  zoneType: 'jong', subIndex: 0, syllableIndex: 0, expected: null,
}), 'match: reject ㅃ in jong zone');
assert(HC.isValidMatchPlacement(placementTile, {
  zoneType: 'jungV', subIndex: 0, syllableIndex: 0, expected: null,
}), 'match: allow vowel in decoy jungV zone');
assert(!HC.isValidMatchPlacement(
  { char: 'ㅏ', zoneType: 'jungV', subIndex: 0, syllableIndex: 0 },
  { zoneType: 'jungH', subIndex: 0, syllableIndex: 0, expected: null },
), 'match: reject vertical vowel in jungH zone');
assert(HC.isValidMatchPlacement(
  { char: 'ㅡ', zoneType: 'jungH', subIndex: 0, syllableIndex: 0 },
  { zoneType: 'jungH', subIndex: 0, syllableIndex: 1, expected: 'ㅜ' },
), 'match: horizontal vowel in any jungH slot');
assert(HC.isValidMatchPlacement(
  { char: 'ㅏ', zoneType: 'jungV', subIndex: 0, syllableIndex: 0 },
  { zoneType: 'jungV', subIndex: 1, syllableIndex: 0, expected: 'ㅣ' },
), 'match: vertical vowel in any jungV sub-slot');
assert(HC.isValidMatchPlacement(
  { char: 'ㅖ', zoneType: 'jungV', subIndex: 0, syllableIndex: 0, isMerged: true },
  { zoneType: 'jungV', subIndex: 0, syllableIndex: 0, expected: 'ㅕ' },
), 'match: merged vowel in jungV slot');
assert(HC.isValidMatchPlacement(
  { char: 'ㅖ', zoneType: 'jungV', subIndex: 0, syllableIndex: 0, isMerged: true },
  { zoneType: 'jungV', subIndex: 0, syllableIndex: 1, expected: 'ㅕ' },
), 'match: merged vowel in jungV slot on another syllable');
assert(!HC.isValidMatchPlacement(
  { char: 'ㅖ', zoneType: 'jungV', subIndex: 0, syllableIndex: 0, isMerged: true },
  { zoneType: 'jungH', subIndex: 0, syllableIndex: 0, expected: null },
), 'match: merged vowel not in jungH');

assert(HC.isCorrectTilePlacement(
  { char: 'ㅏ', zoneType: 'jungV', subIndex: 0, syllableIndex: 0 },
  { zoneType: 'jungV', subIndex: 0, syllableIndex: 0, expected: 'ㅏ' },
), 'correct ㅏ → jungV');
assert(!HC.isCorrectTilePlacement(
  { char: 'ㅣ', zoneType: 'jungV', subIndex: 1, syllableIndex: 0 },
  { zoneType: 'jungV', subIndex: 0, syllableIndex: 0, expected: 'ㅏ' },
), 'reject ㅣ when slot expects ㅏ');
assert(!HC.isActiveZone({ expected: null }), 'inactive null expected');
assert(!HC.isActiveZone({ expected: '' }), 'inactive empty expected');

// ── Vowel composition preview ──

assertEqual(
  HC.formatVowelCompositionPreview(['ㅏ', 'ㅣ']),
  'ㅏ + ㅣ → ㅐ',
  'preview ㅐ'
);
assertEqual(
  HC.formatVowelCompositionPreview(['ㅗ', 'ㅏ', 'ㅣ']),
  'ㅗ + ㅏ + ㅣ → ㅙ',
  'preview ㅙ'
);

// ── Korean Match vowel slot rotation (cycle-based) ──

assertEqual(HC.rotateJamo('ㄱ'), 'ㄴ', 'ㄱ → ㄴ (bank consonant)');

assertEqual(HC.rotateJamoInMergeSlot('ㅏ')?.char, 'ㅓ', 'merge slot ㅏ → ㅓ');
assertEqual(HC.rotateJamoInMergeSlot('ㅕ')?.char, 'ㅑ', 'merge slot ㅕ → ㅑ');
assertEqual(HC.rotateJamoInMergeSlot('ㅗ'), null, 'merge slot rejects ㅗ');
assertEqual(HC.rotateJamo('ㅏ'), 'ㅗ', 'bank ㅏ still cycles to ㅗ');

const slotOpts = (otherOccupied) => ({ inVowelSlot: true, otherSlotOccupied: otherOccupied });

// ㅏ/ㅓ cycle — vertical start, empty other slot
assertEqual(
  HC.rotateJamoForZone('ㅓ', 'jungV', slotOpts(false))?.char,
  'ㅏ',
  'ㅓ → ㅏ vertical pair'
);
assertEqual(
  HC.rotateJamoForZone('ㅓ', 'jungV', slotOpts(false))?.zoneType,
  'jungV',
  'ㅓ → ㅏ stays vertical'
);
assertEqual(
  HC.rotateJamoForZone('ㅏ', 'jungV', slotOpts(false))?.char,
  'ㅗ',
  'ㅏ crosses to horizontal ㅗ when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅏ', 'jungV', slotOpts(false))?.zoneType,
  'jungH',
  'ㅏ crosses to jungH when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅏ', 'jungV', slotOpts(true))?.char,
  'ㅓ',
  'ㅏ pair-swaps when horizontal occupied'
);
assertEqual(
  HC.rotateJamoForZone('ㅏ', 'jungV', slotOpts(true))?.zoneType,
  'jungV',
  'ㅏ stays vertical when horizontal occupied'
);
assertEqual(
  HC.rotateJamoForZone('ㅗ', 'jungH', slotOpts(false))?.char,
  'ㅜ',
  'horizontal ㅗ → ㅜ pair'
);
assertEqual(
  HC.rotateJamoForZone('ㅜ', 'jungH', slotOpts(false))?.char,
  'ㅓ',
  'ㅜ crosses to vertical ㅓ when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅜ', 'jungH', slotOpts(false))?.zoneType,
  'jungV',
  'ㅜ crosses to jungV when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅜ', 'jungH', slotOpts(true))?.char,
  'ㅗ',
  'ㅜ pair-swaps when vertical occupied'
);

// ㅑ/ㅕ cycle — vertical start
assertEqual(
  HC.rotateJamoForZone('ㅕ', 'jungV', slotOpts(false))?.char,
  'ㅑ',
  'ㅕ → ㅑ vertical pair'
);
assertEqual(
  HC.rotateJamoForZone('ㅑ', 'jungV', slotOpts(false))?.char,
  'ㅛ',
  'ㅑ crosses to horizontal ㅛ when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅛ', 'jungH', slotOpts(false))?.char,
  'ㅠ',
  'horizontal ㅛ → ㅠ pair'
);
assertEqual(
  HC.rotateJamoForZone('ㅠ', 'jungH', slotOpts(false))?.char,
  'ㅕ',
  'ㅠ crosses to vertical ㅕ when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅛ', 'jungH', slotOpts(true))?.char,
  'ㅠ',
  'horizontal ㅛ → ㅠ when vertical occupied'
);

// ㅣ / ㅡ — unchanged cross-only behavior
assertEqual(
  HC.rotateJamoForZone('ㅣ', 'jungV', slotOpts(false))?.char,
  'ㅡ',
  'vertical ㅣ crosses to horizontal ㅡ when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅣ', 'jungV', slotOpts(false))?.zoneType,
  'jungH',
  'vertical ㅣ crosses to jungH when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅣ', 'jungV', slotOpts(true)),
  null,
  'vertical ㅣ does not rotate when horizontal occupied'
);
assertEqual(
  HC.rotateJamoForZone('ㅡ', 'jungH', slotOpts(false))?.char,
  'ㅣ',
  'horizontal ㅡ crosses to vertical ㅣ when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅡ', 'jungH', slotOpts(false))?.zoneType,
  'jungV',
  'horizontal ㅡ crosses to jungV when empty'
);
assertEqual(
  HC.rotateJamoForZone('ㅡ', 'jungH', slotOpts(true)),
  null,
  'horizontal ㅡ does not rotate when vertical occupied'
);

// Full ㅏ/ㅓ cycle with empty slots
(function assertAeCycle() {
  let char = 'ㅓ';
  let zone = 'jungV';
  const steps = [
    ['ㅏ', 'jungV'],
    ['ㅗ', 'jungH'],
    ['ㅜ', 'jungH'],
    ['ㅓ', 'jungV'],
  ];
  steps.forEach(([expChar, expZone], i) => {
    const next = HC.rotateJamoForZone(char, zone, slotOpts(false));
    assert(next, `ae cycle step ${i + 1} returns result`);
    assertEqual(next.char, expChar, `ae cycle step ${i + 1} char`);
    assertEqual(next.zoneType, expZone, `ae cycle step ${i + 1} zone`);
    char = next.char;
    zone = next.zoneType;
  });
})();

assertEqual(HC.zoneTypeForRotatedJamo('ㅓ', 'jungH'), 'jungV', 'ㅓ maps to jungV zone type');
assertEqual(HC.orientJamoToTarget('ㅗ', 'ㅏ'), 'ㅏ', 'orient hint still uses legacy cycle');
assertEqual(HC.orientJamoToTarget('ㅓ', 'ㅏ'), 'ㅏ', 'orient merge pair fallback reaches ㅏ');
assertEqual(
  HC.orientTileJamo('ㅓ', 'jungV', 'ㅏ', { inMergeSlot: true })?.char,
  'ㅏ',
  'orient tile uses merge slot pair for ㅓ → ㅏ'
);
assertEqual(
  HC.orientTileJamo('ㅜ', 'jungH', 'ㅏ', {})?.char,
  'ㅏ',
  'orient tile reaches vertical target from horizontal vowel'
);
assertEqual(
  HC.orientTileJamo('ㅜ', 'jungH', 'ㅏ', {})?.zoneType,
  'jungV',
  'orient tile updates zone type for vertical target'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
