/**
 * Pick the four Pixabay images that make the clearest picture clue for a word.
 *
 * Pixabay's own ordering is popularity-driven, so a search for "chocolate"
 * happily returns chocolate ice cream and chocolate-themed banners. Two rules
 * do most of the work here:
 *
 *   1. Relevance gate — a hit only qualifies when one of its tags is *about*
 *      the search term, judged by the head (last) word of the tag. "dark
 *      chocolate" passes; "chocolate ice cream" does not.
 *   2. Type coherence — the whole 2×2 grid is served from a single media type,
 *      so four images read as one deliberate set instead of a photo/vector
 *      mishmash. The type is chosen per word by how strong its candidates are,
 *      which lets drawn art win for everyday objects while photos still win for
 *      culturally specific nouns that no one has drawn.
 */
'use strict';

const terms = require('./image-terms');

/** Media types Pixabay can return, in tie-break preference order. */
const TYPES = ['vector', 'illustration', 'photo'];

/** Relevance tiers. Only EXACT and HEAD clear the strict gate. */
const EXACT_TAG = 60;
const HEAD_TAG = 34;
const LOOSE_TAG = 6;

/**
 * Nudge toward drawn art: at small clue sizes a clean illustration is easier to
 * read than a photo. Small enough that a clearly better photo set still wins.
 */
const TYPE_BONUS = { vector: 5, illustration: 4, photo: 0 };

/**
 * Pixabay repeats tags (often in several languages) inside one `tags` string,
 * and lists them roughly in order of importance — the first tag is the picture's
 * main subject. Dedupe while keeping that order.
 */
function splitTags(tags) {
  const seen = new Set();
  return String(tags || '')
    .toLowerCase()
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

/** How strongly one tag claims the picture is of the query. */
function tagRelevance(tag, queryPhrase, head) {
  const tagPhrase = terms.normalize(tag);
  if (!tagPhrase) return 0;
  if (tagPhrase === queryPhrase) return EXACT_TAG;
  if (terms.sameWord(terms.headWord(tagPhrase), head)) return HEAD_TAG;
  if (terms.words(tagPhrase).some((word) => terms.sameWord(word, head))) return LOOSE_TAG;
  return 0;
}

/**
 * How well the hit's tags say "this picture is of <query>".
 *
 * Tag order carries the answer to the question the naive version got wrong: a
 * birthday cake tagged `cake, happy birthday, chocolate` mentions chocolate but
 * is a picture of cake. Matches are discounted by how far down the list they
 * appear, and a hit whose very first tag is something else is marked down again.
 */
function relevanceOf(tags, query) {
  const queryPhrase = terms.normalize(query);
  const queryTokens = terms.tokenize(query);
  if (!queryPhrase || !queryTokens.length) return 0;
  const head = queryTokens[queryTokens.length - 1];

  let best = 0;
  tags.forEach((tag, index) => {
    const base = tagRelevance(tag, queryPhrase, head);
    if (!base) return;
    best = Math.max(best, base - Math.min(24, index * 5));
  });
  if (best <= 0) return 0;

  // Is the picture's headline subject the word we asked for?
  if (!tagRelevance(tags[0], queryPhrase, head)) best -= 18;

  return Math.max(0, best + modifierCoverage(tags, queryTokens));
}

/** Credit a hit for also mentioning the query's modifiers ("school" in "school uniform"). */
function modifierCoverage(tags, queryTokens) {
  if (queryTokens.length < 2) return 0;
  const tagWords = new Set(tags.flatMap((tag) => terms.words(tag)));
  const modifiers = queryTokens.slice(0, -1);
  const hits = modifiers.filter((token) => [...tagWords].some((word) => terms.sameWord(word, token)));
  return Math.min(15, hits.length * 5);
}

/** Signals about picture quality that are independent of the subject. */
function qualityOf(hit, tags, index, allowed) {
  let score = 0;

  const preferred = tags.filter((tag) => terms.isPreferredTag(tag)).length;
  score += Math.min(18, preferred * 9);

  const clutter = tags.filter((tag) => terms.isClutterTag(tag)).length;
  score -= clutter * 30;

  const distractors = tags.filter((tag) => terms.isDistractorTag(tag, allowed)).length;
  score -= Math.min(24, distractors * 12);

  // Downloads are a decent proxy for "people found this usable".
  const downloads = Number(hit?.downloads) || 0;
  score += Math.min(12, Math.log10(1 + downloads) * 3);

  // Pixabay's own ordering still carries information; let it break ties.
  score += Math.max(0, 8 - index * 0.4);

  // Extreme panoramas and tall strips are unreadable in a square grid cell.
  const width = Number(hit?.imageWidth) || 0;
  const height = Number(hit?.imageHeight) || 0;
  if (width > 0 && height > 0) {
    const ratio = width / height;
    if (ratio > 2.2 || ratio < 0.5) score -= 25;
    else if (ratio >= 0.8 && ratio <= 1.35) score += 5;
  }

  // A very long tag list usually means a busy, multi-subject scene.
  if (tags.length > 8) score -= Math.min(8, tags.length - 8);

  return score;
}

/**
 * @returns {{score: number, relevance: number, unsafe: boolean, tags: string[]}}
 */
function scoreHit(hit, query, index = 0) {
  const tags = splitTags(hit?.tags);
  const allowed = terms.allowedWords(query);
  const unsafe = tags.some((tag) => terms.isUnsafeTag(tag, allowed));
  if (unsafe) return { score: 0, relevance: 0, unsafe: true, tags };

  const relevance = relevanceOf(tags, query);
  if (!relevance) return { score: 0, relevance: 0, unsafe: false, tags };
  return { score: relevance + qualityOf(hit, tags, index, allowed), relevance, unsafe: false, tags };
}

function hasImage(hit) {
  return !!(hit && (hit.largeImageURL || hit.webformatURL || hit.previewURL));
}

/**
 * Score and sort one type's hits.
 * @param {object[]} hits
 * @param {string} query
 * @param {{strict?: boolean}} [opts] strict (default) keeps only head-position
 *   matches; loose also allows a passing mention of the subject.
 */
function rankHits(hits, query, { strict = true } = {}) {
  const minRelevance = strict ? HEAD_TAG : LOOSE_TAG;
  return (Array.isArray(hits) ? hits : [])
    .filter(hasImage)
    .map((hit, index) => ({ hit, index, ...scoreHit(hit, query, index) }))
    .filter((item) => !item.unsafe && item.relevance >= minRelevance)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

/**
 * Take `count` items, spreading across uploaders first so the grid does not
 * show four crops of the same artist's single asset.
 */
function takeDiverse(items, count, usedIds = new Set()) {
  const picked = [];
  const seenUsers = new Set();
  const pass = (respectUser) => {
    for (const item of items) {
      if (picked.length >= count) return;
      const id = item.hit?.id;
      if (!id || usedIds.has(id)) continue;
      const user = String(item.hit?.user || '').toLowerCase();
      if (respectUser && user && seenUsers.has(user)) continue;
      usedIds.add(id);
      if (user) seenUsers.add(user);
      picked.push(item);
    }
  };
  pass(true);
  pass(false);
  return picked;
}

/**
 * Combined strength of a type's best `count` candidates. Missing candidates
 * count as zero, so a type that can fill the whole grid beats a type with two
 * great images and nothing else.
 */
function typeStrength(items, type, count) {
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const item = items[i];
    if (!item) continue;
    total += item.score + (TYPE_BONUS[type] || 0);
  }
  return total;
}

/**
 * Choose the media type and the images for one clue.
 *
 * @param {Record<string, object[]>} hitsByType raw Pixabay hits per media type
 * @param {string} query English search term
 * @param {number} count grid size (4)
 * @returns {{type: string|null, items: {hit: object, type: string, score: number, relevance: number}[]}}
 */
function pickImageSet(hitsByType, query, count = 4) {
  const rankFor = (strict) => {
    const byType = {};
    for (const type of TYPES) byType[type] = rankHits(hitsByType?.[type], query, { strict });
    return byType;
  };

  for (const strict of [true, false]) {
    const byType = rankFor(strict);
    let bestType = null;
    let bestStrength = 0;
    for (const type of TYPES) {
      const strength = typeStrength(byType[type], type, count);
      if (strength > bestStrength) {
        bestStrength = strength;
        bestType = type;
      }
    }
    if (!bestType) continue;

    const usedIds = new Set();
    const items = takeDiverse(byType[bestType], count, usedIds)
      .map((item) => ({ ...item, type: bestType }));

    // Rather than leave a hole in the grid, top up from the other types.
    if (items.length < count) {
      const rest = TYPES
        .filter((type) => type !== bestType)
        .flatMap((type) => byType[type].map((item) => ({ ...item, type })))
        .sort((a, b) => b.score - a.score);
      items.push(...takeDiverse(rest, count - items.length, usedIds));
    }

    if (items.length) return { type: bestType, items: items.slice(0, count) };
  }

  return { type: null, items: [] };
}

module.exports = {
  TYPES,
  EXACT_TAG,
  HEAD_TAG,
  LOOSE_TAG,
  splitTags,
  relevanceOf,
  scoreHit,
  rankHits,
  pickImageSet,
};
