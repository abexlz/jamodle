'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const answerSrc = fs.readFileSync(path.join(root, 'www/js/answer-tts.js'), 'utf8');
const koreanSrc = fs.readFileSync(path.join(root, 'www/js/korean-tts.js'), 'utf8');

function readConst(src, name) {
  const m = src.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(m, `missing ${name}`);
  return Number(m[1]);
}

const answerGap = readConst(answerSrc, 'REPEAT_GAP_MS');
const koreanGap = readConst(koreanSrc, 'REPEAT_GAP_MS');

// Hangul-dle answer autoplay must use half of the previous 200ms gap.
assert.strictEqual(answerGap, 100, 'AnswerTTS repeat gap must be 100ms (half of 200)');
assert.strictEqual(koreanGap, 100, 'KoreanTTS default repeat gap must be 100ms');

assert.ok(
  /gapMs:\s*REPEAT_GAP_MS/.test(answerSrc),
  'AnswerTTS.playWord must pass gapMs: REPEAT_GAP_MS',
);

assert.ok(
  /warmed\[i\] = fetchServerAudio|warmed\[i \+ 1\]/.test(koreanSrc)
    && /fetchServerAudio\(/.test(koreanSrc)
    && /Promise\.all\(\[waitGap, warmed/.test(koreanSrc),
  'KoreanTTS.speak must prefetch later passes so the gap is not a network fetch',
);

const matchHtml = fs.readFileSync(path.join(root, 'www/match.html'), 'utf8');
assert.ok(
  /korean-tts\.js\?v=20260803c/.test(matchHtml),
  'match.html must cache-bust korean-tts.js so the gap fix ships',
);
assert.ok(
  /answer-tts\.js\?v=20260803c/.test(matchHtml),
  'match.html must cache-bust answer-tts.js so the gap fix ships',
);

console.log('answer-tts-gap tests passed');
