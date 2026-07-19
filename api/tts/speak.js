'use strict';

const tts = require('../../lib/google-tts');
const rateLimit = require('../../lib/rate-limit');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function sendAudio(res, status, body, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  };
  if (typeof res.writeHead === 'function') {
    res.writeHead(status, headers);
    res.end(body);
    return;
  }
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.statusCode = status;
  res.end(body);
}

function sendJson(res, status, body, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
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
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const limit = rateLimit.check(ip);
  if (!limit.allowed) {
    return sendJson(res, 429, {
      error: 'Too many pronunciation requests. Please try again shortly.',
      retryAfterSec: limit.retryAfterSec,
    }, { 'Retry-After': String(limit.retryAfterSec) });
  }

  const text = (req.query?.text || req.query?.q || '').trim();
  const gender = tts.normalizeGender(req.query?.voice || req.query?.gender);
  if (!text) {
    return sendJson(res, 400, { error: 'Missing required query parameter: text' });
  }

  if (!tts.isSpeakableKorean(text)) {
    return sendJson(res, 400, {
      error: 'Text must be Korean and at most 60 characters.',
      code: 'INVALID_TEXT',
    });
  }

  try {
    const audio = await tts.synthesize(text, { gender });
    return sendAudio(res, 200, audio);
  } catch (err) {
    const code = err.code || 'UNKNOWN';
    if (code === 'INVALID_TEXT') {
      return sendJson(res, 400, { error: err.message, code });
    }
    return sendJson(res, 502, {
      error: 'Pronunciation audio is unavailable right now.',
      code,
      message: err.message,
    });
  }
};
