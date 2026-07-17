/**
 * Related Words dock — no alternate chain words spellable from tile pool.
 * Run: node tests/related-words-dock.test.js
 */
'use strict';

const path = require('path');
const vm = require('vm');
const fs = require('fs');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../www/js/related-words-chains.js'), 'utf8'),
  sandbox
);

const RW = sandbox.globalThis.RelatedWordsChains;

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

function syllableCounts(syllables) {
  const counts = {};
  syllables.forEach((s) => {
    counts[s] = (counts[s] || 0) + 1;
  });
  return counts;
}

function canSpell(word, dockChars) {
  const need = syllableCounts([...word]);
  const have = syllableCounts(dockChars);
  return Object.keys(need).every((s) => (have[s] || 0) >= need[s]);
}

function alternateChainWordsSpellable(link, chain) {
  const answer = link.answer;
  const answerLen = [...answer].length;
  const dockChars = link.dockTiles.map((t) => t.char);
  const alternates = [];
  chain.words.forEach((word) => {
    if (word === answer) return;
    if ([...word].length !== answerLen) return;
    if (canSpell(word, dockChars)) alternates.push(word);
  });
  return alternates;
}

// Hand-built case: distractors must not complete another chain word.
const testLink = RW.getLink('rw-bus-market', 0);
if (testLink) {
  const chain = RW.getChain('rw-bus-market');
  const alts = alternateChainWordsSpellable(testLink, chain);
  assert(alts.length === 0, `rw-bus-market link 0 should have no spellable alternates, got: ${alts.join(', ')}`);
}

RW.getAllChains().forEach((chain) => {
  const linkCount = RW.getLinkCount(chain.id);
  for (let i = 0; i < linkCount; i++) {
    const link = RW.getLink(chain.id, i);
    if (!link) continue;
    const alts = alternateChainWordsSpellable(link, chain);
    assert(
      alts.length === 0,
      `${chain.id} link ${i} (${link.clue}→${link.answer}): spellable alternates: ${alts.join(', ')}`
    );
    assert(link.dockTiles.length === RW.DOCK_SIZE, `${chain.id} link ${i}: dock size ${link.dockTiles.length}`);
    const need = syllableCounts([...link.answer]);
    const have = syllableCounts(link.dockTiles.map((t) => t.char));
    Object.keys(need).forEach((s) => {
      assert((have[s] || 0) >= need[s], `${chain.id} link ${i}: missing syllable ${s} for answer`);
    });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
