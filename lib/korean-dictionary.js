/**
 * Korean Basic Dictionary (한국어기초사전) Open API client.
 * https://krdict.korean.go.kr/eng/openApi/openApiInfo
 */
'use strict';

const { XMLParser } = require('fast-xml-parser');

const SEARCH_URL = 'https://krdict.korean.go.kr/api/search';
const VIEW_URL = 'https://krdict.korean.go.kr/api/view';
const SOURCE_NAME = 'Korean Basic Dictionary';
const SOURCE_HOME = 'https://krdict.korean.go.kr';

const POS_LABELS = {
  '명사': 'noun',
  '동사': 'verb',
  '형용사': 'adjective',
  '부사': 'adverb',
  '대명사': 'pronoun',
  '수사': 'numeral',
  '감탄사': 'interjection',
  '관형사': 'determiner',
  '조사': 'particle',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  isArray: (name) => ['item', 'sense', 'translation', 'example_info', 'example'].includes(name),
});

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function pickEnglishTranslation(translations) {
  for (const t of asArray(translations)) {
    const lang = t.trans_lang || t['#text'];
    if (t.trans_lang === '영어' || String(lang).includes('영어')) {
      return {
        word: t.trans_word || '',
        definition: t.trans_dfn || '',
      };
    }
  }
  const first = asArray(translations)[0];
  if (!first) return { word: '', definition: '' };
  return { word: first.trans_word || '', definition: first.trans_dfn || '' };
}

function normalizeSearchItem(item) {
  if (!item) return null;
  const senses = asArray(item.sense);
  const primarySense = senses.sort((a, b) => (a.sense_order || 1) - (b.sense_order || 1))[0];
  const en = pickEnglishTranslation(primarySense?.translation);

  return {
    source: SOURCE_NAME,
    entryId: String(item.target_code || ''),
    word: item.word || '',
    supNo: item.sup_no != null ? String(item.sup_no) : '0',
    pronunciation: item.pronunciation || null,
    partOfSpeech: item.pos || null,
    partOfSpeechEn: POS_LABELS[item.pos] || item.pos || null,
    wordGrade: item.word_grade || null,
    definition: en.definition || primarySense?.definition || '',
    englishWord: en.word || '',
    example: null,
    sourceUrl: item.link || `${SOURCE_HOME}/dicSearch/SearchView?ParaWordNo=${item.target_code || ''}`,
    rawDefinitionKo: primarySense?.definition || '',
    senseCount: senses.length,
  };
}

function normalizeViewItem(item) {
  const base = normalizeSearchItem(item);
  if (!base) return null;

  const examples = [];
  for (const sense of asArray(item.sense)) {
    for (const ex of asArray(sense.example_info)) {
      const text = ex.example || ex;
      if (typeof text === 'string' && text.trim()) examples.push(text.trim());
    }
  }
  if (!examples.length && item.example) {
    examples.push(String(item.example).trim());
  }
  base.example = examples[0] || null;
  base.examples = examples;
  return base;
}

function parseApiResponse(xmlText) {
  const doc = parser.parse(xmlText);

  const errCode = doc?.error?.error_code || doc?.error_code;
  const errMsg = doc?.error?.message || doc?.message;
  if (errCode) {
    const err = new Error(String(errMsg || 'Dictionary API error'));
    err.code = String(errCode);
    throw err;
  }

  const channel = doc?.channel;
  if (!channel) {
    throw new Error('Unexpected dictionary response');
  }

  const total = parseInt(channel.total, 10) || 0;
  const items = asArray(channel.item).map(normalizeSearchItem).filter(Boolean);
  return { total, items, channel };
}

function parseViewResponse(xmlText) {
  const doc = parser.parse(xmlText);
  const channel = doc?.channel;
  if (!channel) {
    const errCode = doc?.error?.error_code || doc?.error_code;
    const errMsg = doc?.error?.message || doc?.message || 'Dictionary API error';
    if (errCode) {
      const err = new Error(String(errMsg));
      err.code = String(errCode);
      throw err;
    }
    throw new Error('Unexpected dictionary view response');
  }
  const item = normalizeViewItem(channel.item);
  return item;
}

function pickBestMatch(items, query) {
  if (!items.length) return null;
  const q = query.trim();
  const exact = items.find((i) => i.word === q);
  if (exact) return exact;
  const starts = items.find((i) => i.word.startsWith(q));
  if (starts) return starts;
  return items[0];
}

/** True when the query appears as its own headword in API results. */
function hasExactDictionaryMatch(items, query) {
  const q = String(query || '').trim();
  if (!q) return false;
  return asArray(items).some((item) => item && item.word === q);
}

function pickExactEntry(items, query) {
  const q = String(query || '').trim();
  return asArray(items).find((item) => item && item.word === q) || null;
}

function mergeSearchEntry(best, detailed, query) {
  const trimmed = String(query || '').trim();
  return {
    ...best,
    ...detailed,
    word: best?.word || detailed?.word || trimmed,
    entryId: best?.entryId || detailed?.entryId || '',
    lastFetchedAt: new Date().toISOString(),
  };
}

async function fetchXml(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Dictionary HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return text;
}

function buildSearchUrl(apiKey, query, options = {}) {
  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    num: String(options.num || 10),
    start: String(options.start || 1),
    translated: 'y',
    trans_lang: '1',
    part: options.part || 'word',
    method: options.method || 'exact',
  });
  if (options.method === 'include') params.set('method', 'include');
  return `${SEARCH_URL}?${params.toString()}`;
}

function buildViewUrl(apiKey, targetCode) {
  const params = new URLSearchParams({
    key: apiKey,
    method: 'target_code',
    q: String(targetCode),
    translated: 'y',
    trans_lang: '1',
  });
  return `${VIEW_URL}?${params.toString()}`;
}

/**
 * Search the Korean Basic Dictionary for a learner-friendly entry.
 */
async function searchWord(apiKey, query, options = {}) {
  if (!apiKey) {
    const err = new Error('Dictionary API key is not configured');
    err.code = 'CONFIG';
    throw err;
  }
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    const err = new Error('Search word is required');
    err.code = '100';
    throw err;
  }

  let xml = await fetchXml(buildSearchUrl(apiKey, trimmed, options));
  let { total, items } = parseApiResponse(xml);

  if (!items.length && options.method !== 'include') {
    xml = await fetchXml(buildSearchUrl(apiKey, trimmed, { ...options, method: 'include' }));
    ({ total, items } = parseApiResponse(xml));
  }

  const best = pickBestMatch(items, trimmed);
  const exactMatch = hasExactDictionaryMatch(items, trimmed);
  if (!best) {
    return {
      found: false,
      exactMatch: false,
      query: trimmed,
      total: 0,
      entry: null,
      candidates: [],
    };
  }

  if (options.includeExample !== false && best.entryId) {
    try {
      const viewXml = await fetchXml(buildViewUrl(apiKey, best.entryId));
      const detailed = parseViewResponse(viewXml);
      if (detailed) {
        return {
          found: true,
          exactMatch,
          query: trimmed,
          total,
          entry: mergeSearchEntry(best, detailed, trimmed),
          candidates: items,
        };
      }
    } catch {
      /* view fetch is optional enrichment */
    }
  }

  return {
    found: true,
    exactMatch,
    query: trimmed,
    total,
    entry: { ...best, lastFetchedAt: new Date().toISOString() },
    candidates: items,
  };
}

/**
 * Validate whether a word exists in the official dictionary (exact headword match).
 */
async function validateWord(apiKey, word, options = {}) {
  const trimmed = String(word || '').trim();
  const result = await searchWord(apiKey, trimmed, {
    ...options,
    includeExample: false,
    num: options.num || 20,
  });
  const valid = hasExactDictionaryMatch(result.candidates, trimmed);
  const exactEntry = pickExactEntry(result.candidates, trimmed)
    || (result.entry?.word === trimmed ? result.entry : null);
  return {
    valid,
    word: trimmed,
    entry: exactEntry || result.entry,
    candidates: result.candidates,
    exceptionAllowed: !!options.allowException,
  };
}

module.exports = {
  SOURCE_NAME,
  SOURCE_HOME,
  searchWord,
  validateWord,
  parseApiResponse,
  parseViewResponse,
  pickBestMatch,
  pickExactEntry,
  hasExactDictionaryMatch,
  normalizeSearchItem,
};
