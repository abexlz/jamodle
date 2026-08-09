/**
 * Pixabay four-image-set proxy for Word Chain answer illustrations.
 *
 * The object's English name is the search term (e.g. "apple"); the game answer
 * stays the Korean translation. A photo, two illustrations, and a vector are
 * selected server-side so every clue renders as a consistent 2×2 set.
 */
'use strict';

const cache = require('../../lib/pexels-cache');
const rateLimit = require('../../lib/rate-limit');

const PIXABAY_SEARCH = 'https://pixabay.com/api/';
/** A few candidates so we can prefer a hit whose tags match the search term. */
const CANDIDATE_COUNT = 100;
/** Cache namespace so Pixabay and Pexels entries never collide in-process. */
const CACHE_NS = 'pixabay:image-set:';
const IMAGE_SLOTS = ['photo', 'illustration', 'illustration', 'vector'];
const EXCLUDED_TAGS = new Set([
  'table', 'background', 'group', 'people', 'person', 'holding', 'hand', 'hands',
  'crowd', 'woman', 'man', 'child', 'children', 'restaurant', 'room', 'kitchen',
  'landscape', 'collage', 'collection', 'set',
  // Never surface tobacco/smoking imagery (e.g. a cigarette pack slipping into a
  // "lunch box" search). This keeps every word's clue kid-appropriate.
  'cigarette', 'cigarettes', 'cigar', 'cigars', 'smoking', 'smoke', 'tobacco',
  'nicotine', 'ashtray', 'lighter', 'vape', 'vaping', 'e-cigarette',
]);
const PREFERRED_TAGS = new Set(['isolated', 'white background', 'white']);

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function json(res, status, body, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=3600' : 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  };
  if (typeof res.writeHead === 'function') {
    res.writeHead(status, headers);
    res.end(JSON.stringify(body));
    return;
  }
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function sanitizeQuery(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with one retry for transient failures (network error / 5xx).
 * 429 is surfaced immediately so we respect Pixabay's rate limit.
 */
async function fetchWithRetry(url, { retries = 1, backoffMs = 300 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (resp.status === 429) {
        const err = new Error('Pixabay rate limit reached.');
        err.status = 429;
        throw err;
      }
      if (resp.status >= 500) {
        const err = new Error(`Pixabay upstream ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (err.status === 429 || attempt === retries) throw err;
      await delay(backoffMs * (attempt + 1));
    }
  }
  throw lastErr;
}

function splitTags(tags) {
  return String(tags || '').toLowerCase().split(',').map((tag) => tag.trim()).filter(Boolean);
}

/** Keep simple single-object results, ranking isolated / white-background hits first. */
function filterAndRank(hits) {
  return (Array.isArray(hits) ? hits : [])
    .filter((hit) => hit && (hit.largeImageURL || hit.webformatURL))
    .map((hit) => {
      const tags = splitTags(hit.tags);
      return {
        hit,
        tags,
        excluded: tags.some((tag) => EXCLUDED_TAGS.has(tag)),
        preferred: tags.filter((tag) => PREFERRED_TAGS.has(tag)).length,
      };
    })
    .filter(({ tags, excluded }) => tags.length > 0 && tags.length <= 3 && !excluded)
    .sort((a, b) => b.preferred - a.preferred || a.tags.length - b.tags.length || a.hit.id - b.hit.id)
    .map(({ hit }) => hit);
}

/**
 * Looser fallback ranking. Used when the strict single-object filter removes
 * every candidate, so the 2×2 grid still gets filled with Pixabay results
 * rather than collapsing to an empty space.
 */
function looseRank(hits) {
  return (Array.isArray(hits) ? hits : [])
    .filter((hit) => hit && (hit.largeImageURL || hit.webformatURL))
    .map((hit) => {
      const tags = splitTags(hit.tags);
      return {
        hit,
        excluded: tags.some((tag) => EXCLUDED_TAGS.has(tag)),
        preferred: tags.filter((tag) => PREFERRED_TAGS.has(tag)).length,
      };
    })
    // Still honor the excluded-tag blocklist; only relax the strict tag-count
    // limit so more words end up with usable imagery.
    .filter(({ excluded }) => !excluded)
    .sort((a, b) => b.preferred - a.preferred || a.hit.id - b.hit.id)
    .map(({ hit }) => hit);
}

/**
 * Serve every image through our own origin. Some browsers (ad/privacy
 * blockers, corporate content filters) block direct `pixabay.com/get/...`
 * requests, which collapses the grid. Same-origin URLs sidestep that.
 */
function proxied(url) {
  if (!url) return null;
  return `/api/image/proxy?url=${encodeURIComponent(url)}`;
}

function toImage(hit, type) {
  return {
    type,
    url: proxied(hit.largeImageURL || hit.webformatURL),
    previewUrl: proxied(hit.webformatURL || hit.previewURL || null),
    id: hit.id,
    tags: hit.tags || '',
    creditName: hit.user || null,
    creditUrl: hit.pageURL || null,
  };
}

function selectImageSet(byType) {
  const usedIds = new Set();
  const all = ['photo', 'illustration', 'vector']
    .flatMap((type) => byType[type].map((hit) => ({ hit, type })));
  return IMAGE_SLOTS.map((requestedType) => {
    const preferred = byType[requestedType].find((hit) => !usedIds.has(hit.id));
    const fallback = all.find(({ hit }) => !usedIds.has(hit.id))
      || (byType[requestedType][0] && { hit: byType[requestedType][0], type: requestedType })
      || all[0];
    if (!fallback && !preferred) return null;
    const selected = preferred ? { hit: preferred, type: requestedType } : fallback;
    usedIds.add(selected.hit.id);
    return { ...toImage(selected.hit, selected.type), requestedType };
  }).filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (typeof res.writeHead === 'function') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const limit = rateLimit.check(ip);
  if (!limit.allowed) {
    return json(res, 429, {
      error: 'Too many image requests. Please try again shortly.',
      retryAfterSec: limit.retryAfterSec,
    }, { 'Retry-After': String(limit.retryAfterSec) });
  }

  const query = sanitizeQuery(req.query?.q || req.query?.query || '');
  if (!query) {
    return json(res, 400, { error: 'Missing required query parameter: q' });
  }

  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    return json(res, 503, {
      error: 'Pixabay image service is not configured.',
      code: 'CONFIG',
    });
  }

  const cached = cache.get(CACHE_NS + query);
  if (cached) {
    return json(res, 200, { ...cached, cached: true });
  }

  const searchPixabay = async (term, imageType) => {
    const url = new URL(PIXABAY_SEARCH);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', term);
    url.searchParams.set('image_type', imageType);
    url.searchParams.set('per_page', String(CANDIDATE_COUNT));
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('order', 'popular');

    const upstream = await fetchWithRetry(url);
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('[pixabay] upstream', upstream.status, detail.slice(0, 200));
      const err = new Error('Pixabay search failed.');
      err.status = upstream.status;
      throw err;
    }
    const data = await upstream.json();
    return Array.isArray(data?.hits) ? data.hits : [];
  };

  try {
    const findImageSet = async (term) => {
      const byType = {};
      for (const type of ['photo', 'illustration', 'vector']) {
        const hits = await searchPixabay(term, type);
        // Prefer strict single-object matches, but fall back to any Pixabay
        // result so a valid search never leaves the grid empty.
        const strict = filterAndRank(hits);
        byType[type] = strict.length ? strict : looseRank(hits);
        // Avoid bursting three upstream API calls at once.
        if (type !== 'vector') await delay(500);
      }
      return { byType, imageSet: selectImageSet(byType) };
    };

    let searchTerm = query;
    let result = await findImageSet(searchTerm);
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!result.imageSet.length && tokens.length > 1) {
      searchTerm = tokens[tokens.length - 1];
      result = await findImageSet(searchTerm);
    }

    if (!result.imageSet.length) {
      const empty = {
        ok: true,
        provider: 'pixabay',
        query,
        searchTerm,
        found: false,
        imageUrl: null,
      };
      cache.set(CACHE_NS + query, empty);
      return json(res, 200, empty);
    }

    const firstImage = result.imageSet[0];
    const payload = {
      ok: true,
      provider: 'pixabay',
      query,
      searchTerm,
      found: true,
      imageSet: result.imageSet,
      // Compatibility for clients expecting one image.
      imageUrl: firstImage.url,
      previewUrl: firstImage.previewUrl,
      creditName: firstImage.creditName,
      creditUrl: firstImage.creditUrl,
      sourceName: 'Pixabay',
      sourceUrl: 'https://pixabay.com',
      tags: firstImage.tags,
      imageId: firstImage.id,
    };
    cache.set(CACHE_NS + query, payload);
    return json(res, 200, payload);
  } catch (err) {
    console.error('[pixabay] search error', err);
    const status = err?.status === 429 ? 429 : 502;
    return json(res, status, {
      error: status === 429
        ? 'Pixabay rate limit reached. Try again later.'
        : 'Pixabay search failed.',
      code: 'UPSTREAM',
    });
  }
};
