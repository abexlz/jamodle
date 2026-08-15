/**
 * Same-origin image proxy for Pixabay assets.
 *
 * The Word Chain clue grid loads images from `pixabay.com/get/...`. Some
 * browsers block those third-party requests (ad/privacy extensions, corporate
 * content filters), which makes the 2×2 grid collapse. Routing images through
 * our own origin keeps them first-party so they always render.
 *
 * Only Pixabay hosts are allowed, so this can't be used as an open proxy.
 */
'use strict';

const rateLimit = require('../../lib/rate-limit');

const ALLOWED_HOSTS = new Set([
  'pixabay.com',
  'cdn.pixabay.com',
  'i.pixabay.com',
  'pixabay.b-cdn.net',
]);

const ALLOWED_CONTENT_TYPES = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml|avif)/i;

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function fail(res, status, message) {
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  };
  if (typeof res.writeHead === 'function') {
    res.writeHead(status, headers);
    return res.end(message);
  }
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.statusCode = status;
  return res.end(message);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (typeof res.writeHead === 'function') {
      res.writeHead(204, headers);
      return res.end();
    }
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET') {
    return fail(res, 405, 'Method not allowed');
  }

  const ip = getClientIp(req);
  const limit = rateLimit.check(ip);
  if (!limit.allowed) {
    return fail(res, 429, 'Too many image requests.');
  }

  const raw = req.query?.url || req.query?.u || '';
  if (!raw) {
    return fail(res, 400, 'Missing required query parameter: url');
  }

  let target;
  try {
    target = new URL(String(raw));
  } catch {
    return fail(res, 400, 'Invalid url');
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return fail(res, 403, 'Host not allowed');
  }

  try {
    const upstream = await fetch(target.href, {
      headers: {
        // Present as a normal browser request to Pixabay's CDN.
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; JamodleImageProxy/1.0)',
      },
    });

    if (!upstream.ok) {
      return fail(res, 502, `Upstream ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!ALLOWED_CONTENT_TYPES.test(contentType)) {
      return fail(res, 415, 'Unsupported content type');
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const headers = {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      // Pixabay asset URLs are content-addressed, so cache aggressively.
      'Cache-Control': 'public, max-age=604800, immutable',
      'Access-Control-Allow-Origin': '*',
    };
    if (typeof res.writeHead === 'function') {
      res.writeHead(200, headers);
      return res.end(buffer);
    }
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.statusCode = 200;
    return res.end(buffer);
  } catch (err) {
    console.error('[image-proxy] fetch error', err);
    return fail(res, 502, 'Image fetch failed');
  }
};
