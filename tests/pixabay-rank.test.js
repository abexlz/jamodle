/**
 * Pixabay clue ranking — head-final relevance, safety, clutter rejection,
 * and single-media-type set selection.
 */
'use strict';

const assert = require('assert');
const rank = require('../lib/pixabay-rank');

const hit = (id, tags, extra = {}) => ({
  id,
  tags,
  user: extra.user || `artist-${id}`,
  downloads: extra.downloads ?? 100,
  imageWidth: extra.imageWidth ?? 1280,
  imageHeight: extra.imageHeight ?? 960,
  webformatURL: `https://images.example/${id}.jpg`,
  largeImageURL: `https://images.example/${id}-large.jpg`,
});

// 1. A compound where the query is only a modifier is not about the query.
{
  assert.ok(rank.relevanceOf(['chocolate', 'dessert'], 'chocolate') >= rank.EXACT_TAG);
  assert.ok(rank.relevanceOf(['dark chocolate', 'sweet'], 'chocolate') >= rank.HEAD_TAG);
  assert.ok(
    rank.relevanceOf(['chocolate ice cream', 'dessert'], 'chocolate') < rank.HEAD_TAG,
    'chocolate ice cream is ice cream, not chocolate',
  );
}

// 2. Plurals line up with the singular gloss.
{
  assert.ok(rank.relevanceOf(['grapes'], 'grape') >= rank.HEAD_TAG);
  assert.ok(rank.relevanceOf(['noodle', 'food'], 'cold noodles') >= rank.HEAD_TAG);
}

// 3. Matching the modifier as well as the head scores higher.
{
  const both = rank.relevanceOf(['school uniform'], 'school uniform');
  const headOnly = rank.relevanceOf(['work uniform'], 'school uniform');
  assert.ok(both > headOnly, 'the full phrase outranks a head-only match');
}

// 4. Unrelated subjects are rejected outright.
{
  const scored = rank.scoreHit(hit(1, 'sunset, beach, sky'), 'apple');
  assert.strictEqual(scored.relevance, 0);
  assert.strictEqual(scored.score, 0);
}

// 5. Unsafe subjects are dropped unless the word itself asks for them.
{
  assert.strictEqual(rank.scoreHit(hit(2, 'lunch box, cigarette'), 'lunch box').unsafe, true);
  assert.strictEqual(rank.scoreHit(hit(3, 'knife, kitchen'), 'knife').unsafe, false);
  assert.strictEqual(rank.scoreHit(hit(4, 'alcohol, bottle'), 'alcohol').unsafe, false);
}

// 6. Design assets lose to a plain picture of the same subject.
{
  const plain = rank.scoreHit(hit(5, 'apple, isolated'), 'apple');
  const banner = rank.scoreHit(hit(6, 'apple, banner, template'), 'apple');
  assert.ok(plain.score > banner.score, 'a banner is a worse clue than the object');
}

// 7. Panoramic crops are penalized; near-square renders best in a grid cell.
{
  const square = rank.scoreHit(hit(7, 'cat', { imageWidth: 1000, imageHeight: 1000 }), 'cat');
  const pano = rank.scoreHit(hit(8, 'cat', { imageWidth: 3000, imageHeight: 900 }), 'cat');
  assert.ok(square.score > pano.score);
}

// 8. The whole grid comes from one media type.
{
  const picked = rank.pickImageSet({
    photo: [hit(10, 'apple, fruit'), hit(11, 'apple, red')],
    illustration: [hit(20, 'apple'), hit(21, 'apple, isolated'), hit(22, 'apple, fruit'), hit(23, 'apple, red')],
    vector: [hit(30, 'apple, icon')],
  }, 'apple', 4);
  assert.strictEqual(picked.items.length, 4);
  assert.strictEqual(picked.type, 'illustration');
  assert.ok(picked.items.every((item) => item.type === 'illustration'));
}

// 9. Photos still win when they are the only type that covers the word —
//    exactly the case for culturally specific nouns.
{
  const picked = rank.pickImageSet({
    photo: [hit(40, 'gimbap'), hit(41, 'gimbap, food'), hit(42, 'gimbap, korean'), hit(43, 'gimbap, rice')],
    illustration: [hit(50, 'sushi, food')],
    vector: [],
  }, 'gimbap', 4);
  assert.strictEqual(picked.type, 'photo');
  assert.strictEqual(picked.items.length, 4);
}

// 10. Prefer spreading across uploaders over four assets from one artist.
{
  const picked = rank.pickImageSet({
    photo: [],
    illustration: [
      hit(60, 'apple, isolated', { user: 'same' }),
      hit(61, 'apple, isolated', { user: 'same' }),
      hit(62, 'apple', { user: 'other' }),
      hit(63, 'apple', { user: 'third' }),
    ],
    vector: [],
  }, 'apple', 4);
  assert.deepStrictEqual(
    picked.items.slice(0, 3).map((item) => item.hit.user),
    ['same', 'other', 'third'],
  );
}

// 11. Nothing relevant anywhere yields an empty set rather than a wrong clue.
{
  const picked = rank.pickImageSet({
    photo: [hit(70, 'sunset, sky')],
    illustration: [hit(71, 'abstract, gradient')],
    vector: [],
  }, 'elephant', 4);
  assert.strictEqual(picked.items.length, 0);
  assert.strictEqual(picked.type, null);
}

// 12. Loose matches rescue a word that has no head-position tag at all.
{
  const picked = rank.pickImageSet({
    photo: [hit(80, 'chocolate ice cream, dessert')],
    illustration: [],
    vector: [],
  }, 'chocolate', 4);
  assert.strictEqual(picked.items.length, 1, 'better a related picture than none');
}

console.log('pixabay-rank.test.js: ok');
