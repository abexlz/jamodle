'use strict';

const cache = require('../../lib/pexels-cache');
const rateLimit = require('../../lib/rate-limit');
const rank = require('../../lib/pexels-rank');

const PEXELS_SEARCH = 'https://api.pexels.com/v1/search';
/** Enough candidates to re-rank without burning the hourly quota. */
const CANDIDATE_COUNT = 20;

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

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return json(res, 503, {
      error: 'Pexels image service is not configured.',
      code: 'CONFIG',
    });
  }

  const cached = cache.get(query);
  if (cached) {
    return json(res, 200, { ...cached, cached: true });
  }

  const searchPexels = async (term) => {
    const url = new URL(PEXELS_SEARCH);
    url.searchParams.set('query', term);
    url.searchParams.set('per_page', String(CANDIDATE_COUNT));
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('locale', 'en-US');

    const upstream = await fetch(url, {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('[pexels] upstream', upstream.status, detail.slice(0, 200));
      const err = new Error('Pexels search failed.');
      err.status = upstream.status;
      throw err;
    }

    const data = await upstream.json();
    return Array.isArray(data?.photos) ? data.photos : [];
  };

  try {
    let searchTerm = query;
    let best = rank.pickBestPhoto(await searchPexels(searchTerm), searchTerm);

    // A multi-word gloss can be too narrow ("korean wrestling"); retry on the
    // head noun so we still land on a photo that depicts the subject.
    const tokens = rank.tokenize(query);
    if (best.score === 0 && tokens.length > 1) {
      const headNoun = tokens[tokens.length - 1];
      const fallbackBest = rank.pickBestPhoto(await searchPexels(headNoun), headNoun);
      if (fallbackBest.score > 0) {
        searchTerm = headNoun;
        best = fallbackBest;
      }
    }

    const photo = best.photo;
    if (!photo?.src) {
      const empty = {
        ok: true,
        query,
        found: false,
        imageUrl: null,
        photographer: null,
        photographerUrl: null,
        pexelsUrl: null,
        alt: null,
      };
      cache.set(query, empty);
      return json(res, 200, empty);
    }

    const payload = {
      ok: true,
      query,
      searchTerm,
      found: true,
      imageUrl: photo.src.landscape || photo.src.large || photo.src.medium || photo.src.original || null,
      photographer: photo.photographer || null,
      photographerUrl: photo.photographer_url || null,
      pexelsUrl: photo.url || 'https://www.pexels.com',
      alt: photo.alt || null,
      photoId: photo.id || null,
      matchScore: best.score,
      matchRank: best.index,
    };
    cache.set(query, payload);
    return json(res, 200, payload);
  } catch (err) {
    console.error('[pexels] search error', err);
    const status = err?.status === 429 ? 429 : 502;
    return json(res, status, {
      error: status === 429
        ? 'Pexels rate limit reached. Try again later.'
        : 'Pexels search failed.',
      code: 'UPSTREAM',
    });
  }
};
