/**
 * Related Words 1v1 — flat round scoring (1 point per solved word).
 */
'use strict';

const assert = require('assert');
const path = require('path');
const vm = require('vm');

function loadRoundPoints() {
  const chainsPath = path.join(__dirname, '../www/js/related-words-chains.js');
  const code = require('fs').readFileSync(chainsPath, 'utf8');
  const sandbox = { global: {}, window: {} };
  sandbox.global = sandbox.window;
  vm.runInNewContext(code, sandbox);
  return sandbox.global.RelatedWordsChains.relatedWordsRoundPoints;
}

const roundPoints = loadRoundPoints();

// Battle scoring is a flat 1 point per solved word, regardless of length.
assert.strictEqual(roundPoints('해'), 1);
assert.strictEqual(roundPoints('사과'), 1);
assert.strictEqual(roundPoints('바나나'), 1);
assert.strictEqual(roundPoints('자전거'), 1);
assert.strictEqual(roundPoints('파인애플'), 1);
assert.strictEqual(roundPoints(''), 1);

console.log('related-words-round-points.test.js: ok');
