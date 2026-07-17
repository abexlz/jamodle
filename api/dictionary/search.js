'use strict';

const dict = require('../../lib/korean-dictionary');
const cache = require('../../lib/dictionary-cache');
const rateLimit = require('../../lib/rate-limit');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function json(res, status, body, extraHeaders = {}) {
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
    return json(res, 405, { error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const limit = rateLimit.check(ip);

  if (!limit.allowed) {
    return json(res, 429, {
      error: 'Too many dictionary requests. Please try again shortly.',
      retryAfterSec: limit.retryAfterSec,
    }, { 'Retry-After': String(limit.retryAfterSec) });
  }

  const word = (req.query?.word || req.query?.q || '').trim();
  if (!word) {
    return json(res, 400, { error: 'Missing required query parameter: word' });
  }

  const apiKey = process.env.KOREAN_DICTIONARY_API_KEY;
  if (!apiKey) {
    return json(res, 503, {
      error: 'Dictionary service is not configured.',
      code: 'CONFIG',
    });
  }

  const cached = cache.get(word);
  if (cached) {
    return json(res, 200, { ...cached, cached: true });
  }

  try {
    const result = await dict.searchWord(apiKey, word);
    const exactMatch = dict.hasExactDictionaryMatch(result.candidates, word);
    const payload = {
      found: result.found,
      exactMatch,
      query: result.query,
      total: result.total,
      entry: result.entry,
      candidates: result.candidates?.slice(0, 10) || [],
      source: dict.SOURCE_NAME,
      sourceHome: dict.SOURCE_HOME,
      cached: false,
    };
    if (exactMatch) cache.set(word, payload);
    return json(res, 200, payload);
  } catch (err) {
    const code = err.code || 'UNKNOWN';
    if (code === '020' || code === '021') {
      return json(res, 503, { error: 'Dictionary API key is invalid.', code });
    }
    if (code === '010') {
      return json(res, 429, { error: 'Dictionary daily limit exceeded.', code });
    }
    return json(res, 502, {
      error: 'Dictionary details are unavailable right now.',
      code,
      message: err.message,
    });
  }
};
