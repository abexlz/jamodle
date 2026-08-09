#!/usr/bin/env node
/**
 * Collect reviewable Pixabay image candidates for learning-word nouns.
 *
 * Usage:
 *   node scripts/collect-pixabay-candidates.js
 *   node scripts/collect-pixabay-candidates.js --max-difficulty 3 --limit 25
 *   node scripts/collect-pixabay-candidates.js --include-abstract
 *
 * Input/output defaults:
 *   data/pixabay/translation.json    Korean word -> English Pixabay keyword
 *   data/pixabay/candidates.json     Resumable collected candidates
 *   data/pixabay/untranslated.json   Words with no translation mapping
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const ROOT = path.resolve(__dirname, '..');
const WORD_DATA_PATH = path.join(ROOT, 'www/js/learning-words-data.js');
const DEFAULT_DIR = path.join(ROOT, 'data/pixabay');
const REQUEST_DELAY_MS = 500;
const TOP_CANDIDATES = 5;
const SEARCH_CANDIDATES = 100;
const IMAGE_SLOTS = ['photo', 'illustration', 'illustration', 'vector'];
const EXCLUDED_TAGS = new Set([
  'table', 'background', 'group', 'people', 'person', 'holding', 'hand', 'hands',
  'crowd', 'woman', 'man', 'child', 'children', 'restaurant', 'room', 'kitchen',
  'landscape', 'collage', 'collection', 'set',
]);
const PREFERRED_TAGS = new Set(['isolated', 'white background', 'white']);

// These are nouns but do not have a reliably depictable object image. Keep this
// conservative: add any domain-specific exclusions to excluded.json instead.
const DEFAULT_ABSTRACT_WORDS = new Set([
  '경우', '관계', '관리', '결과', '과정', '국적', '기억', '기회', '기준', '내용',
  '능력', '대상', '대화', '문제', '문화', '방법', '사람', '사회', '사실', '생각',
  '상태', '성격', '세계', '시간', '시대', '실력', '의미', '이유', '인간', '자신',
  '장소', '정도', '정보', '제도', '존재', '지역', '지식', '질문', '책임', '경험',
  '현실', '행동', '행복', '효과',
]);

function parseArgs(argv) {
  const options = {
    maxDifficulty: 2,
    limit: Infinity,
    includeAbstract: false,
    outputDir: DEFAULT_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--max-difficulty') options.maxDifficulty = Number(argv[++i]);
    else if (arg === '--limit') options.limit = Number(argv[++i]);
    else if (arg === '--include-abstract') options.includeAbstract = true;
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/collect-pixabay-candidates.js [--max-difficulty 2] [--limit 25] [--include-abstract] [--output-dir path]');
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isInteger(options.maxDifficulty) || options.maxDifficulty < 1) {
    throw new Error('--max-difficulty must be a positive integer.');
  }
  if (!(Number.isInteger(options.limit) && options.limit > 0) && options.limit !== Infinity) {
    throw new Error('--limit must be a positive integer.');
  }
  return options;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  const text = fs.readFileSync(filePath, 'utf8').trim();
  return text ? JSON.parse(text) : fallback;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function loadLearningWords() {
  const source = fs.readFileSync(WORD_DATA_PATH, 'utf8');
  const sandbox = { globalThis: {} };
  vm.runInNewContext(source, sandbox, { filename: WORD_DATA_PATH });
  const words = sandbox.globalThis.LEARNING_WORDS_RAW;
  if (!Array.isArray(words)) throw new Error('LEARNING_WORDS_RAW could not be loaded.');
  return words.map(({ word, category, difficulty, meaning, grade }) => ({
    word,
    category,
    difficulty,
    meaning: meaning || '',
    grade: grade || '',
  }));
}

function normalizeTranslation(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value.keyword === 'string') return value.keyword.trim();
  return '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchPixabay(apiKey, keyword, imageType, requestState) {
  const waitMs = Math.max(0, REQUEST_DELAY_MS - (Date.now() - requestState.lastRequestAt));
  if (waitMs) await delay(waitMs);
  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', keyword);
  url.searchParams.set('image_type', imageType);
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('per_page', String(SEARCH_CANDIDATES));

  const response = await fetch(url);
  requestState.lastRequestAt = Date.now();
  if (!response.ok) {
    throw new Error(`Pixabay ${imageType} request failed (${response.status}) for "${keyword}".`);
  }
  const body = await response.json();
  return Array.isArray(body.hits) ? body.hits : [];
}

function splitTags(tags) {
  return String(tags || '').toLowerCase().split(',').map((tag) => tag.trim()).filter(Boolean);
}

function filterAndRank(hits) {
  return hits
    .map((hit) => {
      const tags = splitTags(hit.tags);
      const hasExcludedTag = tags.some((tag) => EXCLUDED_TAGS.has(tag));
      const preferredCount = tags.filter((tag) => PREFERRED_TAGS.has(tag)).length;
      return { hit, tags, hasExcludedTag, preferredCount };
    })
    .filter(({ tags, hasExcludedTag }) => tags.length > 0 && tags.length <= 3 && !hasExcludedTag)
    .sort((a, b) => (
      b.preferredCount - a.preferredCount
      || a.tags.length - b.tags.length
      || Number(a.hit.id) - Number(b.hit.id)
    ))
    .map(({ hit }) => hit);
}

function compactCandidates(hits, type) {
  return hits.slice(0, TOP_CANDIDATES).map((hit) => ({
    id: hit.id,
    tags: hit.tags || '',
    previewURL: hit.previewURL || '',
    webformatURL: hit.webformatURL || '',
    type,
  }));
}

function selectImageSet(byType) {
  const usedIds = new Set();
  const allCandidates = ['photo', 'illustration', 'vector']
    .flatMap((type) => byType[type].map((candidate) => ({ ...candidate, type })));

  return IMAGE_SLOTS.map((requestedType) => {
    const preferred = byType[requestedType].find((candidate) => !usedIds.has(candidate.id));
    const fallback = allCandidates.find((candidate) => !usedIds.has(candidate.id))
      || byType[requestedType][0]
      || allCandidates[0];
    const chosen = preferred || fallback;
    if (!chosen) return null;
    usedIds.add(chosen.id);
    return {
      type: chosen.type,
      requestedType,
      url: chosen.webformatURL || chosen.previewURL,
      id: chosen.id,
      tags: chosen.tags,
    };
  }).filter(Boolean);
}

function hasCompleteImageSet(entry) {
  return Array.isArray(entry?.imageSet) && entry.imageSet.length === IMAGE_SLOTS.length;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey || apiKey === 'your_pixabay_api_key_here') {
    throw new Error('PIXABAY_API_KEY is missing. Add it to .env before running this script.');
  }

  const translationPath = path.join(options.outputDir, 'translation.json');
  const candidatesPath = path.join(options.outputDir, 'candidates.json');
  const untranslatedPath = path.join(options.outputDir, 'untranslated.json');
  const excludedPath = path.join(options.outputDir, 'excluded.json');
  const translations = readJson(translationPath, {});
  const candidates = readJson(candidatesPath, {});
  const untranslated = readJson(untranslatedPath, {});
  const excluded = new Set(readJson(excludedPath, []));

  const targetWords = loadLearningWords().filter((entry) => (
    entry.category === 'noun'
    && Number(entry.difficulty) <= options.maxDifficulty
    && (options.includeAbstract || !DEFAULT_ABSTRACT_WORDS.has(entry.word))
    && !excluded.has(entry.word)
  ));

  let requested = 0;
  let skippedExisting = 0;
  let skippedUntranslated = 0;
  const requestState = { lastRequestAt: 0 };
  for (const entry of targetWords) {
    if (requested >= options.limit) break;
    if (hasCompleteImageSet(candidates[entry.word])) {
      skippedExisting += 1;
      continue;
    }

    const keyword = normalizeTranslation(translations[entry.word]);
    if (!keyword) {
      untranslated[entry.word] = {
        word: entry.word,
        category: entry.category,
        difficulty: entry.difficulty,
        meaning: entry.meaning,
        grade: entry.grade,
      };
      skippedUntranslated += 1;
      continue;
    }

    const byType = {};
    for (const type of ['photo', 'illustration', 'vector']) {
      const hits = await searchPixabay(apiKey, keyword, type, requestState);
      byType[type] = compactCandidates(filterAndRank(hits), type);
    }
    const imageSet = selectImageSet(byType);

    candidates[entry.word] = {
      translatedKeyword: keyword,
      // Retain per-type choices for review and put the final 2×2 slot order
      // directly in imageSet: photo, illustration, illustration, vector.
      candidatesByType: byType,
      imageSet,
    };
    writeJson(candidatesPath, candidates); // checkpoint every request for safe resume
    requested += 1;
    console.log(`[${requested}] ${entry.word} → ${keyword}: photo ${byType.photo.length}, illustration ${byType.illustration.length}, vector ${byType.vector.length}; grid ${imageSet.length}/4`);
  }

  writeJson(untranslatedPath, untranslated);
  console.log(`Done. Requests: ${requested}; existing skipped: ${skippedExisting}; untranslated skipped: ${skippedUntranslated}.`);
  console.log(`Candidates: ${path.relative(ROOT, candidatesPath)}`);
  console.log(`Translations needed: ${path.relative(ROOT, untranslatedPath)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Collection failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { filterAndRank, selectImageSet, splitTags };
