#!/usr/bin/env node
/**
 * Validate curated learning words against the Korean Basic Dictionary.
 * Usage: npm run validate-words
 */
'use strict';

const path = require('path');
const fs = require('fs');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {}

const dict = require('../lib/korean-dictionary');

const wordsFile = path.join(__dirname, '../www/js/learning-words.js');
const src = fs.readFileSync(wordsFile, 'utf8');
const match = src.match(/const LEARNING_WORDS = \[([\s\S]*?)\];/);
if (!match) {
  console.error('Could not parse LEARNING_WORDS from learning-words.js');
  process.exit(1);
}

const wordRe = /word:\s*'([^']+)'/g;
const words = [];
let m;
while ((m = wordRe.exec(match[1]))) words.push(m[1]);

async function main() {
  const apiKey = process.env.KOREAN_DICTIONARY_API_KEY;
  if (!apiKey) {
    console.error('Set KOREAN_DICTIONARY_API_KEY in .env to run validation.');
    process.exit(1);
  }

  console.log(`Validating ${words.length} curated words…\n`);
  let ok = 0;
  let fail = 0;

  for (const word of words) {
    try {
      const result = await dict.searchWord(apiKey, word);
      if (result.found) {
        console.log(`✓ ${word} → ${result.entry.definition?.slice(0, 60) || result.entry.englishWord}`);
        ok += 1;
      } else {
        console.log(`✗ ${word} — NO_DICTIONARY_MATCH (consider dictionaryException flag)`);
        fail += 1;
      }
      await new Promise((r) => setTimeout(r, 120));
    } catch (err) {
      console.log(`✗ ${word} — ${err.message}`);
      fail += 1;
    }
  }

  console.log(`\nDone: ${ok} valid, ${fail} flagged`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
