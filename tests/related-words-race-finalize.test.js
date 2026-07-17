/**
 * Related Words race — chain completion and score-based winner.
 */
'use strict';

const assert = require('assert');

const RELATED_WORDS_RACE_TARGET = 25;

function getRelatedWordsLinkCount(data, getLinkCount) {
  const chainId = data?.chainId;
  if (chainId) {
    const fromChain = getLinkCount(chainId);
    if (Number.isFinite(fromChain) && fromChain > 0) return fromChain;
  }
  const raceTarget = Number(data?.raceTarget);
  if (Number.isFinite(raceTarget) && raceTarget > 0) return raceTarget;
  return RELATED_WORDS_RACE_TARGET;
}

function isRelatedWordsChainComplete(data, getLinkCount) {
  const shared = data.sharedState || { linkIndex: 0 };
  const linkIndex = Number(shared.linkIndex) || 0;
  return linkIndex >= getRelatedWordsLinkCount(data, getLinkCount);
}

function computeRelatedWordsWinner(data) {
  const p1 = data.player1Progress || {};
  const p2 = data.player2Progress || {};
  const p1Score = p1.guessCount || 0;
  const p2Score = p2.guessCount || 0;
  if (p1Score > p2Score) return data.player1Uid;
  if (p2Score > p1Score) return data.player2Uid;
  return null;
}

function relatedWordsMatchOverAt(nextLinkIndex, data, getLinkCount) {
  return nextLinkIndex >= getRelatedWordsLinkCount(data, getLinkCount);
}

const getLinkCount = () => 15;
const baseMatch = {
  chainId: 'food-animals',
  raceTarget: 15,
  player1Uid: 'p1',
  player2Uid: 'p2',
  sharedState: { linkIndex: 0, roundId: 0 },
  player1Progress: { guessCount: 0 },
  player2Progress: { guessCount: 0 },
};

assert.strictEqual(relatedWordsMatchOverAt(14, baseMatch, getLinkCount), false);
assert.strictEqual(relatedWordsMatchOverAt(15, baseMatch, getLinkCount), true);

const finished = {
  ...baseMatch,
  sharedState: { linkIndex: 15, roundId: 20 },
  player1Progress: { guessCount: 8 },
  player2Progress: { guessCount: 5 },
};
assert.strictEqual(isRelatedWordsChainComplete(finished, getLinkCount), true);
assert.strictEqual(computeRelatedWordsWinner(finished), 'p1');

const tie = {
  ...finished,
  player1Progress: { guessCount: 6 },
  player2Progress: { guessCount: 6 },
};
assert.strictEqual(computeRelatedWordsWinner(tie), null);

const p2Wins = {
  ...finished,
  player1Progress: { guessCount: 3 },
  player2Progress: { guessCount: 9 },
};
assert.strictEqual(computeRelatedWordsWinner(p2Wins), 'p2');

console.log('related-words-race-finalize.test.js: all passed');
