#!/usr/bin/env node
/**
 * Eyeball the image-clue ranker against the live Pixabay API.
 *
 * Prints, for a sample of the image-mode word pool, which media type was chosen
 * and the tags of every picked image — enough to spot an off-subject clue
 * without opening the game.
 *
 * Usage:
 *   node scripts/audit-image-clues.js              # 25 random pool words
 *   node scripts/audit-image-clues.js --limit 60
 *   node scripts/audit-image-clues.js chocolate apple "school uniform"
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const handler = require('../api/image/pixabay');

const ROOT = path.resolve(__dirname, '..');

function loadPool() {
  const src = fs.readFileSync(path.join(ROOT, 'www/js/hangul-dle-image-words.js'), 'utf8');
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window.RelatedWordsChains = undefined;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.HangulDleImageWords?.POOL || {};
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    writeHead(status) { this.statusCode = status; },
    setHeader() {},
    end(body) { this.body = body ? JSON.parse(body) : null; },
  };
}

async function lookup(term) {
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, socket: {}, query: { q: term } }, res);
  return res;
}

async function main() {
  const argv = process.argv.slice(2);
  let limit = 25;
  const explicit = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit') limit = Number(argv[++i]) || limit;
    else explicit.push(argv[i]);
  }

  const pool = loadPool();
  const entries = explicit.length
    ? explicit.map((term) => [term, term])
    : Object.entries(pool).sort(() => Math.random() - 0.5).slice(0, limit);

  let short = 0;
  for (const [index, [korean, english]] of entries.entries()) {
    // Each word costs up to six upstream calls; pace them so a long audit does
    // not trip Pixabay's rate limit. The game itself never bursts like this.
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    const res = await lookup(english);
    const body = res.body || {};
    if (res.statusCode !== 200 || !body.found) {
      console.log(`${korean.padEnd(8)} ${english.padEnd(22)} — NO IMAGES (${res.statusCode})`);
      short += 1;
      continue;
    }
    const set = body.imageSet || [];
    if (set.length < 4) short += 1;
    const label = `${korean.padEnd(8)} ${english.padEnd(22)} ${String(body.imageType).padEnd(13)} ${set.length}/4`;
    console.log(label);
    set.forEach((image) => console.log(`    ${String(image.score).padStart(4)}  ${image.tags}`));
  }
  console.log(`\n${entries.length - short}/${entries.length} words filled the full 2×2 grid.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
