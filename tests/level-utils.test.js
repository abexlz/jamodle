/**
 * Unit tests for level XP calculations.
 * Run: node tests/level-utils.test.js
 */
'use strict';

const path = require('path');
const vm = require('vm');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(
  require('fs').readFileSync(path.join(__dirname, '../www/js/level-utils.js'), 'utf8'),
  sandbox
);

const LU = sandbox.globalThis.LevelUtils;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) passed += 1;
  else { failed += 1; console.error('FAIL:', message); }
}

function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}

assertEqual(LU.xpRequiredForLevel(1), 100, 'L1→2 needs 100');
assertEqual(LU.xpRequiredForLevel(2), 150, 'L2→3 needs 150');
assertEqual(LU.xpRequiredForLevel(3), 200, 'L3→4 needs 200');
assertEqual(LU.totalXpForLevel(1), 0, 'Level 1 total 0');
assertEqual(LU.totalXpForLevel(2), 100, 'Level 2 total 100');
assertEqual(LU.totalXpForLevel(3), 250, 'Level 3 total 250');
assertEqual(LU.totalXpForLevel(4), 450, 'Level 4 total 450');

const at100 = LU.getLevelFromTotalXp(100);
assertEqual(at100.level, 2, '100 XP = level 2');
assertEqual(at100.xpInLevel, 0, '100 XP in-level 0');

const at320 = LU.getLevelFromTotalXp(320);
assertEqual(at320.level, 3, '320 XP = level 3');
assertEqual(at320.xpInLevel, 70, '320 XP in-level 70');

assertEqual(LU.getLevelTitleId(1), 'hangul-starter', 'title L1');
assertEqual(LU.getLevelTitleId(10), 'word-explorer', 'title L10');
assertEqual(LU.getLevelTitleId(21), 'hangul-hero', 'title L21');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
