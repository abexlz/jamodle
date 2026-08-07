'use strict';

const cache = require('../../lib/pexels-cache');
const rateLimit = require('../../lib/rate-limit');

const PEXELS_SEARCH = 'https://api.pexels.com/v1/search';

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

  try {
    const url = new URL(PEXELS_SEARCH);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '1');
    url.searchParams.set('orientation', 'landscape');

    const upstream = await fetch(url, {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('[pexels] upstream', upstream.status, detail.slice(0, 200));
      return json(res, upstream.status === 429 ? 429 : 502, {
        error: upstream.status === 429
          ? 'Pexels rate limit reached. Try again later.'
          : 'Pexels search failed.',
        code: 'UPSTREAM',
      });
    }

    const data = await upstream.json();
    const photo = Array.isArray(data?.photos) ? data.photos[0] : null;
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
      found: true,
      imageUrl: photo.src.landscape || photo.src.large || photo.src.medium || photo.src.original || null,
      photographer: photo.photographer || null,
      photographerUrl: photo.photographer_url || null,
      pexelsUrl: photo.url || 'https://www.pexels.com',
      alt: photo.alt || null,
      photoId: photo.id || null,
    };
    cache.set(query, payload);
    return json(res, 200, payload);
  } catch (err) {
    console.error('[pexels] search error', err);
    return json(res, 502, {
      error: 'Pexels search failed.',
      code: 'UPSTREAM',
    });
  }
};
