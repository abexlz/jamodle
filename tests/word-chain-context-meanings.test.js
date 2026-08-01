'use strict';

const assert = require('assert');
const {
  pickCuratedSense,
  pickBestCandidate,
  resolve,
} = require('../www/js/word-chain-context-meanings.js');

function theaterContext() {
  return {
    chainId: 'rw-actor-joy',
    chainLabel: '연극 · 연극',
    chainWords: ['연극', '오페라', '발레', '연기', '대본', '무대', '배우'],
    neighborMeanings: ['play', 'opera', 'ballet', 'script', 'stage', 'actor'],
  };
}

function campContext() {
  return {
    chainId: 'rw-camp-morning',
    chainLabel: '텐트 · 캠핑',
    chainWords: ['장작', '불씨', '연기', '잿불', '구이', '모닥불'],
    neighborMeanings: ['firewood', 'ember', 'ash', 'grill', 'campfire'],
  };
}

assert.strictEqual(
  pickCuratedSense('연기', theaterContext()),
  'acting',
  '연기 in theater chain → acting'
);

assert.strictEqual(
  pickCuratedSense('연기', campContext()),
  'smoke',
  '연기 in camping chain → smoke'
);

assert.strictEqual(
  pickCuratedSense('눈', {
    chainWords: ['머리', '얼굴', '눈', '코', '입'],
    chainLabel: '몸 · 건강',
  }),
  'eye',
  '눈 in body chain → eye'
);

assert.strictEqual(
  pickCuratedSense('눈', {
    chainWords: ['눈', '얼음', '눈사람', '스키', '썰매'],
    chainLabel: '눈 · 겨울',
  }),
  'snow',
  '눈 in winter chain → snow'
);

assert.strictEqual(
  resolve('연기', theaterContext(), [
    { meaning: 'delay' },
    { meaning: 'smoke' },
    { meaning: 'acting' },
  ]),
  'acting',
  'curated sense wins over arbitrary dictionary order'
);

assert.strictEqual(
  pickBestCandidate(
    [
      { meaning: 'delay', definition: 'to postpone a schedule' },
      { meaning: 'acting', definition: 'performance on stage by an actor' },
    ],
    theaterContext()
  ),
  'acting',
  'dictionary candidates ranked by theater context'
);

console.log('word-chain-context-meanings.test.js: ok');
