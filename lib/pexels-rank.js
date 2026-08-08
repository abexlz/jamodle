/**
 * Pick the Pexels result that best matches the search phrase.
 *
 * Pexels' own top hit is often loosely related (a search for "cello" can return
 * a generic music photo), so candidates are re-scored against their alt text and
 * URL slug, both of which describe the subject.
 */
'use strict';

/** Words that carry no subject meaning when matching a photo description. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
]);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-\s]+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalize(text).split(' ').filter((word) => word && !STOP_WORDS.has(word));
}

/** Match singular/plural without pulling in a stemming dependency. */
function tokenMatches(token, candidateTokens) {
  if (candidateTokens.has(token)) return true;
  if (candidateTokens.has(`${token}s`)) return true;
  if (token.endsWith('s') && candidateTokens.has(token.slice(0, -1))) return true;
  if (token.endsWith('es') && candidateTokens.has(token.slice(0, -2))) return true;
  return false;
}

/** Descriptive text Pexels gives us: alt plus the slug inside the photo URL. */
function describePhoto(photo) {
  const alt = normalize(photo?.alt);
  const slug = normalize(
    String(photo?.url || '')
      .replace(/^https?:\/\/[^/]+\/photo\//, '')
      .replace(/-?\d+\/?$/, ''),
  );
  return { alt, slug, combined: `${alt} ${slug}`.trim() };
}

/**
 * Score one candidate against the query.
 * Higher is better; 0 means nothing in the description matched.
 */
function scorePhoto(photo, query) {
  const queryNorm = normalize(query);
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;

  const { alt, combined } = describePhoto(photo);
  if (!combined) return 0;

  const candidateTokens = new Set(combined.split(' ').filter(Boolean));
  let score = 0;

  // Whole phrase present — the strongest signal.
  if (queryNorm && combined.includes(queryNorm)) score += 25;

  // The head noun (last token) is what the photo should actually depict.
  const head = queryTokens[queryTokens.length - 1];
  if (tokenMatches(head, candidateTokens)) score += 12;

  for (const token of queryTokens) {
    if (tokenMatches(token, candidateTokens)) score += 5;
  }

  // Subject usually leads the alt text ("cello on a wooden floor").
  const altLead = new Set(alt.split(' ').slice(0, 4).filter(Boolean));
  if (tokenMatches(head, altLead)) score += 6;

  return score;
}

/**
 * @returns {{photo: object|null, score: number, index: number}}
 * Falls back to Pexels' own top hit when nothing matches by description.
 */
function pickBestPhoto(photos, query) {
  const list = Array.isArray(photos) ? photos.filter((p) => p && p.src) : [];
  if (!list.length) return { photo: null, score: 0, index: -1 };

  let best = null;
  let bestScore = 0;
  let bestIndex = -1;

  list.forEach((photo, index) => {
    const score = scorePhoto(photo, query);
    // Ties keep Pexels' ordering, which already encodes relevance.
    if (score > bestScore) {
      best = photo;
      bestScore = score;
      bestIndex = index;
    }
  });

  if (!best) return { photo: list[0], score: 0, index: 0 };
  return { photo: best, score: bestScore, index: bestIndex };
}

module.exports = {
  STOP_WORDS,
  normalize,
  tokenize,
  describePhoto,
  scorePhoto,
  pickBestPhoto,
};
