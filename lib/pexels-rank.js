/**
 * Pick the Pexels result that best matches the search phrase.
 *
 * Pexels' own top hit is often loosely related (a search for "cello" can return
 * a generic music photo), so candidates are re-scored against their alt text and
 * URL slug, both of which describe the subject.
 */
'use strict';

const terms = require('./image-terms');

const { STOP_WORDS, normalize, tokenize } = terms;

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
 * A photo whose description names something we never show a learner, unless the
 * search term asked for it. Checked before scoring so an unsafe photo can never
 * arrive via the "keep the top hit" fallback either.
 */
function isUnsafePhoto(photo, query) {
  const { combined } = describePhoto(photo);
  return terms.isUnsafeTag(combined, terms.allowedWords(query));
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
  if (isUnsafePhoto(photo, query)) return 0;

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

  // Banners, mockups and texture swatches technically match but read as design
  // assets rather than a picture of the thing.
  if (terms.isClutterTag(combined)) score -= 20;

  return Math.max(0, score);
}

/**
 * @returns {{photo: object|null, score: number, index: number}}
 * Falls back to Pexels' own top hit when nothing matches by description.
 */
function usablePhotos(photos, query) {
  return (Array.isArray(photos) ? photos : [])
    .filter((p) => p && p.src && !isUnsafePhoto(p, query));
}

function pickBestPhoto(photos, query) {
  const list = usablePhotos(photos, query);
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

/** Ranked unique photos for a 2×2 clue grid. */
function pickTopPhotos(photos, query, count = 4) {
  const list = usablePhotos(photos, query);
  const scored = list.map((photo, index) => ({
    photo,
    score: scorePhoto(photo, query),
    index,
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const out = [];
  const seen = new Set();
  for (const item of scored) {
    const id = item.photo.id || item.photo.url || item.index;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= count) break;
  }
  return out;
}

module.exports = {
  STOP_WORDS,
  normalize,
  tokenize,
  describePhoto,
  isUnsafePhoto,
  scorePhoto,
  pickBestPhoto,
  pickTopPhotos,
};
