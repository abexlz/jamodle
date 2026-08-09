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

async function searchPixabay(apiKey, keyword, imageType) {
  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', keyword);
  url.searchParams.set('image_type', imageType);
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('per_page', String(TOP_CANDIDATES));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Pixabay ${imageType} request failed (${response.status}) for "${keyword}".`);
  }
  const body = await response.json();
  return Array.isArray(body.hits) ? body.hits : [];
}

function compactCandidates(hits) {
  return hits.slice(0, TOP_CANDIDATES).map((hit) => ({
    id: hit.id,
    tags: hit.tags || '',
    previewURL: hit.previewURL || '',
    webformatURL: hit.webformatURL || '',
  }));
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
  for (const entry of targetWords) {
    if (requested >= options.limit) break;
    if (candidates[entry.word]) {
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

    let hits = await searchPixabay(apiKey, keyword, 'vector');
    if (!hits.length) {
      await delay(REQUEST_DELAY_MS);
      hits = await searchPixabay(apiKey, keyword, 'photo');
    }

    candidates[entry.word] = {
      translatedKeyword: keyword,
      candidates: compactCandidates(hits),
    };
    writeJson(candidatesPath, candidates); // checkpoint every request for safe resume
    requested += 1;
    console.log(`[${requested}] ${entry.word} → ${keyword}: ${hits.length} ${hits.length === 1 ? 'candidate' : 'candidates'}`);
    await delay(REQUEST_DELAY_MS);
  }

  writeJson(untranslatedPath, untranslated);
  console.log(`Done. Requests: ${requested}; existing skipped: ${skippedExisting}; untranslated skipped: ${skippedUntranslated}.`);
  console.log(`Candidates: ${path.relative(ROOT, candidatesPath)}`);
  console.log(`Translations needed: ${path.relative(ROOT, untranslatedPath)}`);
}

main().catch((error) => {
  console.error(`Collection failed: ${error.message}`);
  process.exitCode = 1;
});
