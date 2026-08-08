/**
 * Word Chain hints — repeatable, one letter per activation, left to right.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGameClass() {
  const sandbox = {
    console,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: () => {},
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { language: 'en' },
    location: { search: '', href: '' },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: clearTimeout,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const file of ['related-words-chains.js', 'related-words-puzzles.js', 'related-words-app.js']) {
    const code = fs.readFileSync(path.join(__dirname, '../www/js', file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  assert.ok(sandbox.RelatedWordsGame, 'RelatedWordsGame should be exposed');
  return sandbox.RelatedWordsGame;
}

const RelatedWordsGame = loadGameClass();

/** Minimal game state: 3-syllable answer with a matching dock. */
function makeGame(answerSyllables, dockChars) {
  const game = Object.create(RelatedWordsGame.prototype);
  game.puzzle = { answerSyllables };
  game.dock = dockChars.map((char, i) => ({
    id: `t${i}`, char, used: false, slotIndex: null, hintLocked: false,
  }));
  game.slots = answerSyllables.map(() => null);
  game.enabled = true;
  game.gameOver = false;
  game.checking = false;
  game.roundLocked = false;
  game.awaitingExtraGuess = false;
  game.raceMode = false;
  game.showOppPreview = false;
  game._hintBusy = false;
  game.hintUsedThisRound = false;

  // Stub out rendering / effects so the pure placement logic can run.
  game.renderSlots = () => {};
  game.renderDock = () => {};
  game.renderHintDock = () => {};
  game.showFeedback = () => {};
  game.touchRevealActivity = () => {};
  game.checkAnswer = () => { game.checkedAnswer = true; };
  return game;
}

const answer = ['웰', '니', '스'];

// 1. Each activation reveals exactly one more letter, left to right.
{
  const game = makeGame(answer, ['니', '스', '웰', '가', '나', '다', '라', '마', '바']);

  assert.strictEqual(game.nextHintSlotIndex(), 0);
  assert.strictEqual(game.isHintAvailable(), true);

  game.applyNextCharHint();
  assert.strictEqual(game.slots[0].char, '웰', 'first hint fills slot 0');
  assert.strictEqual(game.slots[1], null, 'only one letter per activation');
  assert.strictEqual(game.slots[0].hintLocked, true);

  game.applyNextCharHint();
  assert.strictEqual(game.slots[1].char, '니', 'second hint fills slot 1');
  assert.strictEqual(game.slots[2], null);

  // 2. Repeated hints can complete the answer and trigger a check.
  game.applyNextCharHint();
  assert.strictEqual(game.slots[2].char, '스', 'third hint fills slot 2');
  assert.strictEqual(game.checkedAnswer, true, 'full reveal submits the answer');

  // 3. Nothing left to reveal.
  assert.strictEqual(game.nextHintSlotIndex(), -1);
  assert.strictEqual(game.isHintAvailable(), false);
}

// 4. Slots the player already filled correctly are skipped.
{
  const game = makeGame(answer, ['니', '스', '웰', '가', '나', '다', '라', '마', '바']);
  const correctFirst = game.dock.find((tile) => tile.char === '웰');
  correctFirst.used = true;
  correctFirst.slotIndex = 0;
  game.slots[0] = correctFirst;

  assert.strictEqual(game.nextHintSlotIndex(), 1, 'skips a slot already correct');
  game.applyNextCharHint();
  assert.strictEqual(game.slots[1].char, '니');
}

// 5. A wrong tile in the target slot is returned to the dock.
{
  const game = makeGame(answer, ['니', '스', '웰', '가', '나', '다', '라', '마', '바']);
  const wrong = game.dock.find((tile) => tile.char === '가');
  wrong.used = true;
  wrong.slotIndex = 0;
  game.slots[0] = wrong;

  game.applyNextCharHint();
  assert.strictEqual(game.slots[0].char, '웰');
  assert.strictEqual(wrong.used, false, 'displaced tile returns to the dock');
  assert.strictEqual(wrong.slotIndex, null);
}

// 6. Hints never steal a letter already revealed in an earlier slot.
{
  const game = makeGame(['가', '가'], ['가', '나', '다', '라', '마', '바', '사', '아', '자']);
  game.applyNextCharHint();
  assert.strictEqual(game.slots[0].char, '가');

  // Only one 가 tile exists, so the second slot cannot be filled.
  game.applyNextCharHint();
  assert.strictEqual(game.slots[0].char, '가', 'first revealed letter stays put');
}

// 7. A wrong guess keeps purchased reveals but clears player-placed tiles.
{
  const game = makeGame(answer, ['니', '스', '웰', '가', '나', '다', '라', '마', '바']);
  game.applyNextCharHint();

  const guess = game.dock.find((tile) => tile.char === '가');
  guess.used = true;
  guess.slotIndex = 1;
  game.slots[1] = guess;

  game.resetSlots({ keepHints: true });
  assert.strictEqual(game.slots[0].char, '웰', 'hinted letter survives a wrong guess');
  assert.strictEqual(game.slots[0].hintLocked, true);
  assert.strictEqual(game.slots[1], null, 'player tile is cleared');
  assert.strictEqual(guess.used, false);
  assert.strictEqual(game.hintUsedThisRound, true);

  game.resetSlots();
  assert.strictEqual(game.slots[0], null, 'a full reset clears hints too');
  assert.strictEqual(game.hintUsedThisRound, false);
}

console.log('related-words-hint.test.js: ok');
