/**
 * Pixabay vector-image proxy for Word Chain answer illustrations.
 *
 * The object's English name is the search term (e.g. "apple"); the game answer
 * stays the Korean translation. Only vector images are requested so the board
 * shows clean illustrations rather than photos. The API key stays server-side.
 */
'use strict';

const cache = require('../../lib/pexels-cache');
const rateLimit = require('../../lib/rate-limit');

const PIXABAY_SEARCH = 'https://pixabay.com/api/';
/** A few candidates so we can prefer a hit whose tags match the search term. */
const CANDIDATE_COUNT = 20;
/** Cache namespace so Pixabay and Pexels entries never collide in-process. */
const CACHE_NS = 'pixabay:vector:';

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

/** Prefer a hit whose comma-separated tags contain the search term. */
function pickBestHit(hits, term) {
  const list = Array.isArray(hits) ? hits.filter((h) => h && (h.largeImageURL || h.webformatURL)) : [];
  if (!list.length) return null;

  const needle = String(term || '').trim().toLowerCase();
  if (needle) {
    const exact = list.find((h) => String(h.tags || '')
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .includes(needle));
    if (exact) return exact;

    const partial = list.find((h) => String(h.tags || '').toLowerCase().includes(needle));
    if (partial) return partial;
  }
  // Pixabay orders by popularity — a decent default when tags don't match.
  return list[0];
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

  const searchPixabay = async (term) => {
    const url = new URL(PIXABAY_SEARCH);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', term);
    url.searchParams.set('image_type', 'vector');
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
    // Multi-word gloss can be too specific; retry on the head noun if empty.
    let searchTerm = query;
    let hit = pickBestHit(await searchPixabay(searchTerm), searchTerm);

    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!hit && tokens.length > 1) {
      const headNoun = tokens[tokens.length - 1];
      const fallbackHit = pickBestHit(await searchPixabay(headNoun), headNoun);
      if (fallbackHit) {
        searchTerm = headNoun;
        hit = fallbackHit;
      }
    }

    if (!hit) {
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

    const payload = {
      ok: true,
      provider: 'pixabay',
      query,
      searchTerm,
      found: true,
      // Point 3: prefer largeImageURL, fall back to webformatURL.
      imageUrl: hit.largeImageURL || hit.webformatURL || null,
      previewUrl: hit.webformatURL || hit.previewURL || null,
      creditName: hit.user || null,
      creditUrl: hit.pageURL || null,
      sourceName: 'Pixabay',
      sourceUrl: 'https://pixabay.com',
      tags: hit.tags || null,
      imageId: hit.id || null,
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
