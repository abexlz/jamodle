/**
 * Pixabay 2×2 image-set proxy — request shaping, single-object filtering,
 * slot ordering, fallback, and configuration errors.
 */
'use strict';

const assert = require('assert');
const handler = require('../api/image/pixabay');
const cache = require('../lib/pexels-cache');
const realFetch = global.fetch;

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); },
    setHeader(k, v) { this.headers[k] = v; },
    end(body) { this.body = body ? JSON.parse(body) : null; },
  };
}

async function run(query, { key = 'test-key', fetchImpl } = {}) {
  cache.clear();
  const previousKey = process.env.PIXABAY_API_KEY;
  if (key === null) delete process.env.PIXABAY_API_KEY;
  else process.env.PIXABAY_API_KEY = key;
  const calls = [];
  global.fetch = async (url, ...rest) => {
    calls.push(String(url));
    return fetchImpl(url, ...rest);
  };
  const res = mockRes();
  try {
    await handler({ method: 'GET', headers: {}, socket: {}, query: { q: query } }, res);
  } finally {
    global.fetch = realFetch;
    if (previousKey === undefined) delete process.env.PIXABAY_API_KEY;
    else process.env.PIXABAY_API_KEY = previousKey;
  }
  return { res, calls };
}

function hit(id, tags) {
  return {
    id,
    tags,
    largeImageURL: `https://images.example/${id}-large.jpg`,
    webformatURL: `https://images.example/${id}.jpg`,
    pageURL: `https://pixabay.example/${id}`,
    user: `artist-${id}`,
  };
}

(async () => {
  // Missing key must not call the upstream API.
  {
    const { res, calls } = await run('apple', { key: null, fetchImpl: async () => null });
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.code, 'CONFIG');
    assert.strictEqual(calls.length, 0);
  }

  // Fetches each required category and returns the slots in UI order.
  {
    const { res, calls } = await run('apple', {
      fetchImpl: async (url) => {
        const type = new URL(String(url)).searchParams.get('image_type');
        const hits = {
          photo: [hit(1, 'apple, fruit')],
          illustration: [hit(2, 'apple, isolated'), hit(3, 'apple, white background')],
          vector: [hit(4, 'apple, fruit, isolated')],
        }[type];
        return { ok: true, status: 200, json: async () => ({ hits }), text: async () => '' };
      },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(calls.map((url) => new URL(url).searchParams.get('image_type')), ['photo', 'illustration', 'vector']);
    assert.strictEqual(res.body.imageSet.length, 4);
    assert.deepStrictEqual(res.body.imageSet.map((image) => image.requestedType), ['photo', 'illustration', 'illustration', 'vector']);
    assert.deepStrictEqual(res.body.imageSet.map((image) => image.type), ['photo', 'illustration', 'illustration', 'vector']);
    assert.strictEqual(res.body.imageSet[0].url, 'https://images.example/1-large.jpg');
  }

  // Excluded/compound-tag images are removed, and another category fills slots.
  {
    const { res } = await run('house', {
      fetchImpl: async (url) => {
        const type = new URL(String(url)).searchParams.get('image_type');
        const hits = {
          photo: [hit(10, 'house, table')],
          illustration: [],
          vector: [hit(11, 'house, home'), hit(12, 'house, isolated')],
        }[type];
        return { ok: true, status: 200, json: async () => ({ hits }), text: async () => '' };
      },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.imageSet.length, 4);
    assert.ok(res.body.imageSet.every((image) => image.type === 'vector'));
    assert.ok(res.body.imageSet.every((image) => image.id !== 10));
  }

  console.log('pixabay-image.test.js: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
