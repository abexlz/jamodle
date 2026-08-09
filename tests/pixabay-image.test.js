/**
 * Pixabay vector-image proxy — request shaping, field mapping, and error handling.
 * Upstream fetch is mocked so no network or API key is needed.
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
  const prevKey = process.env.PIXABAY_API_KEY;
  if (key === null) delete process.env.PIXABAY_API_KEY;
  else process.env.PIXABAY_API_KEY = key;

  const calls = [];
  const impl = fetchImpl || (async () => ({ ok: true, status: 200, json: async () => ({ hits: [] }), text: async () => '' }));
  global.fetch = async (url, ...rest) => {
    calls.push(String(url));
    return impl(url, ...rest);
  };

  const res = mockRes();
  try {
    await handler({ method: 'GET', headers: {}, socket: {}, query: { q: query } }, res);
  } finally {
    global.fetch = realFetch;
    if (prevKey === undefined) delete process.env.PIXABAY_API_KEY;
    else process.env.PIXABAY_API_KEY = prevKey;
  }
  return { res, calls };
}

const hitsFor = (over = {}) => ({
  hits: [{
    id: 42,
    tags: 'apple, fruit, red',
    webformatURL: 'https://pixabay.com/get/apple_640.png',
    largeImageURL: 'https://pixabay.com/get/apple_1280.png',
    pageURL: 'https://pixabay.com/vectors/apple-42/',
    user: 'Jane',
    ...over,
  }],
});

(async () => {
  // 1. Missing key → 503 CONFIG, no upstream call.
  {
    const { res, calls } = await run('apple', { key: null });
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.code, 'CONFIG');
    assert.strictEqual(calls.length, 0);
  }

  // 2. Requests vectors only and maps largeImageURL + Pixabay credit fields.
  {
    const { res, calls } = await run('apple', {
      fetchImpl: async (url) => {
        assert.ok(String(url).includes('image_type=vector'), 'must request vectors');
        assert.ok(String(url).includes('q=apple'));
        return { ok: true, status: 200, json: async () => hitsFor(), text: async () => '' };
      },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.found, true);
    assert.strictEqual(res.body.provider, 'pixabay');
    assert.strictEqual(res.body.imageUrl, 'https://pixabay.com/get/apple_1280.png');
    assert.strictEqual(res.body.creditName, 'Jane');
    assert.strictEqual(res.body.creditUrl, 'https://pixabay.com/vectors/apple-42/');
    assert.strictEqual(res.body.sourceName, 'Pixabay');
    assert.strictEqual(calls.length, 1);
  }

  // 3. Falls back to webformatURL when largeImageURL is absent.
  {
    const { res } = await run('apple', {
      fetchImpl: async () => ({
        ok: true, status: 200, text: async () => '',
        json: async () => hitsFor({ largeImageURL: undefined }),
      }),
    });
    assert.strictEqual(res.body.imageUrl, 'https://pixabay.com/get/apple_640.png');
  }

  // 4. Prefers the hit whose tags contain the search term over the first hit.
  {
    const { res } = await run('cat', {
      fetchImpl: async () => ({
        ok: true, status: 200, text: async () => '',
        json: async () => ({ hits: [
          { id: 1, tags: 'dog, pet', largeImageURL: 'dog.png', pageURL: 'p1', user: 'A' },
          { id: 2, tags: 'cat, kitten', largeImageURL: 'cat.png', pageURL: 'p2', user: 'B' },
        ] }),
      }),
    });
    assert.strictEqual(res.body.imageId, 2, 'tag match wins');
    assert.strictEqual(res.body.imageUrl, 'cat.png');
  }

  // 5. Multi-word gloss with no hits retries on the head noun.
  {
    let call = 0;
    const { res, calls } = await run('korean wrestling', {
      fetchImpl: async (url) => {
        call += 1;
        const hits = call === 1 ? [] : [{ id: 9, tags: 'wrestling, sport', largeImageURL: 'w.png', pageURL: 'p', user: 'C' }];
        assert.ok(String(url).includes(call === 1 ? 'wrestling' : 'wrestling'));
        return { ok: true, status: 200, text: async () => '', json: async () => ({ hits }) };
      },
    });
    assert.strictEqual(res.body.found, true);
    assert.strictEqual(res.body.searchTerm, 'wrestling');
    assert.strictEqual(calls.length, 2);
  }

  // 6. Empty result set → found:false, still 200.
  {
    const { res } = await run('zxqwv', {
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({ hits: [] }) }),
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.found, false);
    assert.strictEqual(res.body.imageUrl, null);
  }

  // 7. Retries once on a 5xx, then succeeds.
  {
    let call = 0;
    const { res, calls } = await run('book', {
      fetchImpl: async () => {
        call += 1;
        if (call === 1) return { ok: false, status: 502, text: async () => 'bad gateway', json: async () => ({}) };
        return { ok: true, status: 200, text: async () => '', json: async () => hitsFor({ tags: 'book' }) };
      },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.found, true);
    assert.strictEqual(calls.length, 2, 'one retry after 5xx');
  }

  // 8. 429 is surfaced immediately without retrying.
  {
    let call = 0;
    const { res } = await run('car', {
      fetchImpl: async () => {
        call += 1;
        return { ok: false, status: 429, text: async () => 'slow down', json: async () => ({}) };
      },
    });
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.body.code, 'UPSTREAM');
    assert.strictEqual(call, 1, 'no retry on 429');
  }

  console.log('pixabay-image.test.js: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
