/**
 * Shared vocabulary helpers for ranking stock-image results against a search
 * term. Used by both the Pixabay and Pexels rankers so the two providers agree
 * on what "this picture is about the word" means.
 *
 * The central idea is that English compound nouns are head-final: the last word
 * carries the meaning. "dark chocolate" is chocolate; "chocolate ice cream" is
 * ice cream. Matching on the head position instead of on any shared token is
 * what keeps a clue grid on-subject.
 */
'use strict';

/** Words that carry no subject meaning when matching a description. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
]);

/** Tags that promise a clean, single-subject picture — ideal as a clue. */
const PREFERRED_TOKENS = new Set([
  'isolated', 'transparent', 'cutout', 'png', 'clipart', 'closeup',
]);
const PREFERRED_PHRASES = new Set([
  'white background', 'isolated on white', 'transparent background',
  'clip art', 'cut out', 'close up', 'studio shot', 'single object',
]);

/**
 * Tokens that signal a designed asset rather than a picture of the thing:
 * banners, templates, texture swatches, anything with lettering. These make
 * terrible clues even when the subject is technically correct.
 */
const CLUTTER_TOKENS = new Set([
  'collage', 'banner', 'template', 'wallpaper', 'frame', 'border', 'text',
  'watermark', 'logo', 'mockup', 'pattern', 'seamless', 'backdrop', 'brochure',
  'flyer', 'poster', 'infographic', 'typography', 'font', 'lettering',
  'presentation', 'thumbnail', 'screenshot', 'advertisement', 'sale',
  'discount', 'grunge', 'swatch', 'palette', 'montage', 'wordcloud',
  // Generated art drifts off-subject and often looks uncanny next to real
  // stock imagery; it made "school uniform" return anime and a cat in a blazer.
  'generated', 'generative', 'midjourney', 'anime', 'caricature',
]);
const CLUTTER_PHRASES = new Set([
  'copy space', 'text space', 'greeting card', 'business card', 'social media',
  'ai generated', 'ai art', 'generated image', 'digital art',
]);

/**
 * Things that share the frame and pull attention away from the subject: people,
 * hands, busy scenes, grouped collections. Not disqualifying — a bowl of soup on
 * a table is still soup — just a reason to prefer a cleaner shot. Skipped when
 * the search term is itself one of these (거실 "living room", 가족 "family").
 */
const DISTRACTOR_TOKENS = new Set([
  'people', 'person', 'crowd', 'group', 'woman', 'man', 'men', 'women', 'child',
  'children', 'kid', 'kids', 'baby', 'hand', 'hands', 'holding', 'finger',
  'table', 'room', 'kitchen', 'restaurant', 'office', 'street', 'landscape',
  'collection', 'collage', 'variety', 'assortment', 'many', 'various',
]);

/**
 * Subjects that must never reach a learner-facing clue. Applied *unless the
 * player's own search term asks for it* — the word pool legitimately contains
 * 술 (alcohol), 칼 (knife) and 연기 (smoke), and blocking those outright would
 * leave their rounds with no picture at all.
 */
const UNSAFE_TOKENS = new Set([
  // Tobacco / vaping
  'cigarette', 'cigarettes', 'cigar', 'cigars', 'smoking', 'tobacco',
  'nicotine', 'ashtray', 'vape', 'vaping', 'hookah', 'shisha',
  // Alcohol
  'alcohol', 'alcoholic', 'beer', 'wine', 'whiskey', 'whisky', 'vodka',
  'liquor', 'cocktail', 'champagne', 'tequila', 'brewery', 'drunk',
  // Drugs
  'drug', 'drugs', 'cannabis', 'marijuana', 'cocaine', 'heroin', 'syringe',
  'narcotic', 'overdose',
  // Weapons and violence
  'gun', 'guns', 'pistol', 'rifle', 'shotgun', 'weapon', 'weapons', 'ammunition',
  'bullet', 'grenade', 'war', 'blood', 'bloody', 'gore', 'corpse', 'murder',
  'violence', 'terrorism', 'wound', 'injury',
  // Adult
  'sexy', 'sexual', 'nude', 'nudity', 'erotic', 'lingerie', 'porn', 'fetish',
  'bikini', 'seductive',
  // Gambling
  'casino', 'gambling', 'poker', 'roulette', 'betting',
]);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-\s]+/g, ' ')
    .trim();
}

/** Split normalized text into meaningful words. */
function words(text) {
  return normalize(text).split(' ').filter(Boolean);
}

/** Meaningful words only — stop words never carry a match on their own. */
function tokenize(text) {
  return words(text).filter((word) => !STOP_WORDS.has(word));
}

/** Cheap singularization; good enough to align "grape"/"grapes", "box"/"boxes". */
function singular(word) {
  const w = String(word || '');
  if (w.length > 3 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && /(?:ch|sh|s|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Two words refer to the same thing, ignoring plural form. */
function sameWord(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return singular(a) === singular(b);
}

/** The word a phrase is actually about: its last meaningful token. */
function headWord(text) {
  const tokens = tokenize(text);
  return tokens.length ? tokens[tokens.length - 1] : '';
}

function isPreferredTag(tag) {
  const phrase = normalize(tag);
  if (!phrase) return false;
  if (PREFERRED_PHRASES.has(phrase)) return true;
  return words(phrase).some((word) => PREFERRED_TOKENS.has(word));
}

function isClutterTag(tag) {
  const phrase = normalize(tag);
  if (!phrase) return false;
  if (isPreferredTag(phrase)) return false; // "white background" is a good sign
  if (CLUTTER_PHRASES.has(phrase)) return true;
  return words(phrase).some((word) => CLUTTER_TOKENS.has(word));
}

/** Words the search term explicitly asks for, so filters can allow them. */
function allowedWords(query) {
  return new Set(words(query));
}

/** True when a word appears in the search term (ignoring plural form). */
function isAsked(word, allowed) {
  const allow = allowed instanceof Set ? allowed : new Set();
  if (allow.has(word)) return true;
  return [...allow].some((asked) => sameWord(asked, word));
}

/** Competing subjects in the frame that the search term did not ask for. */
function isDistractorTag(tag, allowed) {
  return words(tag).some((word) => DISTRACTOR_TOKENS.has(word) && !isAsked(word, allowed));
}

/**
 * Unsafe unless the searcher asked for it.
 * @param {string} tag one tag or description fragment
 * @param {Set<string>} allowed normalized words from the search term
 */
function isUnsafeTag(tag, allowed) {
  return words(tag).some((word) => UNSAFE_TOKENS.has(word) && !isAsked(word, allowed));
}

module.exports = {
  STOP_WORDS,
  PREFERRED_TOKENS,
  PREFERRED_PHRASES,
  CLUTTER_TOKENS,
  CLUTTER_PHRASES,
  DISTRACTOR_TOKENS,
  UNSAFE_TOKENS,
  normalize,
  words,
  tokenize,
  singular,
  sameWord,
  headWord,
  isPreferredTag,
  isClutterTag,
  isDistractorTag,
  isUnsafeTag,
  isAsked,
  allowedWords,
};
