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
/**
 * A handful of candidates so we can prefer a hit whose tags match the search
 * term. Kept small (was 100) so Pixabay's JSON payload stays light and parses
 * fast — the 2×2 grid only needs four images.
 */
const CANDIDATE_COUNT = 30;
/** Cache namespace so Pixabay and Pexels entries never collide in-process. */
const CACHE_NS = 'pixabay:image-set-v3:';
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
 * Prefer Pixabay's public CDN (`cdn.pixabay.com/photo/..._640.jpg`). Those
 * URLs load in <img> tags without a same-origin proxy. Routing every cell
 * through `/api/image/proxy` was collapsing the 2×2 grid: Vercel payloads,
 * shared rate limits, and Pixabay blocking the proxy User-Agent all made
 * every image `onerror`, after which the client hid the whole section.
 *
 * `pixabay.com/get/...` hashes still go through the proxy as a fallback.
 */
function proxied(url) {
  if (!url) return null;
  return `/api/image/proxy?url=${encodeURIComponent(url)}`;
}

function isPixabayCdn(url) {
  try {
    const host = new URL(String(url)).hostname;
    return host === 'cdn.pixabay.com' || host === 'i.pixabay.com' || host.endsWith('.pixabay.com');
  } catch {
    return false;
  }
}

/** Upgrade a 150px preview CDN URL to the 640px webformat size. */
function cdnDisplayUrl(hit) {
  const preview = String(hit?.previewURL || '');
  if (isPixabayCdn(preview)) {
    return preview.replace(/_\d+(\.[a-zA-Z0-9]+)$/i, '_640$1');
  }
  const web = String(hit?.webformatURL || '');
  if (isPixabayCdn(web)) return web;
  const large = String(hit?.largeImageURL || '');
  if (isPixabayCdn(large)) return large;
  return null;
}

function publicUrl(raw) {
  if (!raw) return null;
  return isPixabayCdn(raw) ? raw : proxied(raw);
}

function toImage(hit, type) {
  const cdn = cdnDisplayUrl(hit);
  const large = hit.largeImageURL || hit.webformatURL;
  const web = hit.webformatURL || hit.previewURL || null;
  return {
    type,
    url: cdn || publicUrl(large),
    previewUrl: cdn || publicUrl(web),
    id: hit.id,
    tags: hit.tags || '',
    creditName: hit.user || null,
    creditUrl: hit.pageURL || null,
  };
}

function mergeUniqueHits(primary, extra) {
  const seen = new Set();
  const out = [];
  for (const hit of [...(primary || []), ...(extra || [])]) {
    if (!hit?.id || seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit);
  }
  return out;
}

function uniqueImageCount(imageSet) {
  return new Set((imageSet || []).map((image) => image?.id).filter(Boolean)).size;
}

/**
 * Build a 2×2 set of distinct Pixabay hits. Never reuse the same id/url —
 * a repeated cell is worse than leaving a slot empty.
 */
function selectImageSet(byType) {
  const usedIds = new Set();
  const leftovers = () => ['photo', 'illustration', 'vector']
    .flatMap((type) => (byType[type] || []).map((hit) => ({ hit, type })))
    .filter(({ hit }) => hit && !usedIds.has(hit.id));
  const takeNext = (list, type) => {
    const hit = (list || []).find((item) => item && !usedIds.has(item.id));
    if (!hit) return null;
    usedIds.add(hit.id);
    return { ...toImage(hit, type), requestedType: type };
  };

  const slots = [];
  for (const requestedType of IMAGE_SLOTS) {
    const picked = takeNext(byType[requestedType], requestedType);
    if (picked) {
      slots.push(picked);
      continue;
    }
    const extra = leftovers()[0];
    if (!extra) continue;
    usedIds.add(extra.hit.id);
    slots.push({ ...toImage(extra.hit, extra.type), requestedType });
  }
  for (const { hit, type } of leftovers()) {
    if (slots.length >= 4) break;
    usedIds.add(hit.id);
    slots.push({ ...toImage(hit, type), requestedType: type });
  }
  return slots.slice(0, 4);
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

  const searchPixabay = async (term, imageType, page = 1) => {
    const url = new URL(PIXABAY_SEARCH);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', term);
    url.searchParams.set('image_type', imageType);
    url.searchParams.set('per_page', String(CANDIDATE_COUNT));
    url.searchParams.set('page', String(Math.max(1, page)));
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
    const rankHits = (hits) => mergeUniqueHits(filterAndRank(hits), looseRank(hits));

    const findImageSet = async (term) => {
      // Fetch all three image types concurrently. These used to run serially
      // with a 500 ms gap between them, which added ~1 s of latency per word on
      // a cache miss; three parallel requests are well within Pixabay's limit.
      const types = ['photo', 'illustration', 'vector'];
      const hitsByType = await Promise.all(types.map((type) => searchPixabay(term, type)));
      const byType = {};
      types.forEach((type, i) => {
        byType[type] = rankHits(hitsByType[i]);
      });
      let imageSet = selectImageSet(byType);
      if (uniqueImageCount(imageSet) < 4) {
        const extraHits = await Promise.all(types.map((type) => searchPixabay(term, type, 2)));
        types.forEach((type, i) => {
          byType[type] = mergeUniqueHits(byType[type], rankHits(extraHits[i]));
        });
        imageSet = selectImageSet(byType);
      }
      return { byType, imageSet };
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
