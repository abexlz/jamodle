/**
 * Word Chain 1v1 race chains must not include 4-syllable answers.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadChains() {
  const chainsPath = path.join(__dirname, '../www/js/related-words-chains.js');
  const code = fs.readFileSync(chainsPath, 'utf8');
  const sandbox = { global: {}, window: {} };
  sandbox.global = sandbox.window;
  vm.runInNewContext(code, sandbox);
  return sandbox.global.RelatedWordsChains;
}

const RC = loadChains();

assert.ok(typeof RC.isRaceExcludedWord === 'function');
assert.strictEqual(RC.isRaceExcludedWord('파인애플'), true);
assert.strictEqual(RC.isRaceExcludedWord('바나나'), false);
assert.strictEqual(RC.isRaceExcludedWord('사과'), false);

const raceChains = RC.getAllRaceChains();
assert.ok(raceChains.length > 0, 'expected race chains');

for (const chain of raceChains) {
  for (const word of chain.words) {
    assert.notStrictEqual(
      [...word].length,
      4,
      `race chain ${chain.id} still has 4-syllable word: ${word}`,
    );
  }
}

const food = RC.getChain('food-animals');
const foodRace = RC.getRaceChain('food-animals');
assert.ok(food.words.includes('파인애플'), 'solo keeps 파인애플');
assert.ok(!foodRace.words.includes('파인애플'), 'race drops 파인애플');

const link = RC.getRaceLink(foodRace.id, 0);
assert.ok(link?.answer);
assert.notStrictEqual([...link.answer].length, 4);

console.log('related-words-race-no-4-syllable.test.js: ok');
