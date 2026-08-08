/**
 * Pexels result re-ranking — the chosen photo must depict the searched word.
 */
'use strict';

const assert = require('assert');
const rank = require('../lib/pexels-rank');

const photo = (id, alt, url) => ({ id, alt, url, src: { landscape: `img-${id}` } });

// 1. Subject in the alt text beats Pexels' own top hit.
{
  const photos = [
    photo(1, 'Woman playing music in a studio', 'https://www.pexels.com/photo/woman-playing-music-1/'),
    photo(2, 'Cello resting against a wooden wall', 'https://www.pexels.com/photo/cello-resting-wall-2/'),
  ];
  const best = rank.pickBestPhoto(photos, 'cello');
  assert.strictEqual(best.photo.id, 2, 'picks the photo whose alt names the subject');
  assert.ok(best.score > 0);
}

// 2. The URL slug counts when alt text is missing.
{
  const photos = [
    photo(1, '', 'https://www.pexels.com/photo/blurred-city-lights-1/'),
    photo(2, '', 'https://www.pexels.com/photo/red-double-decker-bus-2/'),
  ];
  assert.strictEqual(rank.pickBestPhoto(photos, 'bus').photo.id, 2);
}

// 3. Plural and singular forms match each other.
{
  const photos = [
    photo(1, 'Empty kitchen counter', 'https://www.pexels.com/photo/empty-counter-1/'),
    photo(2, 'Fresh grapes on a plate', 'https://www.pexels.com/photo/fresh-grapes-plate-2/'),
  ];
  assert.strictEqual(rank.pickBestPhoto(photos, 'grape').photo.id, 2);

  const photosSingular = [
    photo(3, 'A cookie on a table', 'https://www.pexels.com/photo/cookie-table-3/'),
  ];
  assert.ok(rank.scorePhoto(photosSingular[0], 'cookies') > 0);
}

// 4. The whole phrase outranks a single shared word.
{
  const photos = [
    photo(1, 'Pink blossom in spring', 'https://www.pexels.com/photo/pink-blossom-spring-1/'),
    photo(2, 'Cherry blossom branches over a river', 'https://www.pexels.com/photo/cherry-blossom-branches-2/'),
  ];
  assert.strictEqual(rank.pickBestPhoto(photos, 'cherry blossom').photo.id, 2);
}

// 5. The head noun matters more than a modifier.
{
  const photos = [
    photo(1, 'Korean street food market', 'https://www.pexels.com/photo/korean-street-food-1/'),
    photo(2, 'Two athletes wrestling on sand', 'https://www.pexels.com/photo/athletes-wrestling-sand-2/'),
  ];
  assert.strictEqual(
    rank.pickBestPhoto(photos, 'korean wrestling').photo.id,
    2,
    'wrestling (head noun) beats korean (modifier)',
  );
}

// 6. Stop words never carry a match on their own.
{
  const p = photo(1, 'A table in the room', 'https://www.pexels.com/photo/a-table-in-the-room-1/');
  assert.strictEqual(rank.scorePhoto(p, 'of the'), 0);
}

// 7. With no description match, fall back to Pexels' ordering rather than nothing.
{
  const photos = [
    photo(1, 'Abstract texture', 'https://www.pexels.com/photo/abstract-texture-1/'),
    photo(2, 'Blue gradient', 'https://www.pexels.com/photo/blue-gradient-2/'),
  ];
  const best = rank.pickBestPhoto(photos, 'mindfulness');
  assert.strictEqual(best.photo.id, 1, 'keeps the top hit when nothing scores');
  assert.strictEqual(best.score, 0);
}

// 8. Empty input is handled.
{
  assert.strictEqual(rank.pickBestPhoto([], 'cello').photo, null);
  assert.strictEqual(rank.pickBestPhoto(null, 'cello').photo, null);
  assert.strictEqual(rank.scorePhoto(photo(1, '', ''), ''), 0);
}

console.log('pexels-rank.test.js: ok');
