'use strict';

const dict = require('../../lib/korean-dictionary');
const rateLimit = require('../../lib/rate-limit');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function json(res, status, body) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
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
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
      return res.end();
    }
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const limit = rateLimit.check(ip);
  if (!limit.allowed) {
    return json(res, 429, { error: 'Rate limit exceeded.' });
  }

  const word = (req.query?.word || '').trim();
  const allowException = req.query?.exception === '1' || req.query?.exception === 'true';

  if (!word) {
    return json(res, 400, { error: 'Missing required query parameter: word' });
  }

  const apiKey = process.env.KOREAN_DICTIONARY_API_KEY;
  if (!apiKey) {
    return json(res, 503, { error: 'Dictionary service is not configured.', code: 'CONFIG' });
  }

  try {
    const result = await dict.validateWord(apiKey, word, { allowException });
    return json(res, 200, {
      valid: result.valid || allowException,
      word,
      hasDictionaryEntry: result.valid,
      exceptionAllowed: allowException,
      entry: result.entry,
      candidates: result.candidates?.slice(0, 5) || [],
      flag: !result.valid && !allowException ? 'NO_DICTIONARY_MATCH' : null,
    });
  } catch (err) {
    return json(res, 502, {
      error: 'Validation unavailable right now.',
      code: err.code || 'UNKNOWN',
    });
  }
};
