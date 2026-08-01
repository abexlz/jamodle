'use strict';

const assert = require('assert');
const tts = require('../lib/google-tts');

assert.strictEqual(tts.isSpeakableKorean('고양이'), true);
assert.strictEqual(tts.isSpeakableKorean('사과·나무'), true);
assert.strictEqual(tts.isSpeakableKorean('hello'), false);
assert.strictEqual(tts.isSpeakableKorean(''), false);
assert.strictEqual(tts.isSpeakableKorean('a'.repeat(61)), false);

assert.strictEqual(tts.normalizeGender('female'), 'female');
assert.strictEqual(tts.normalizeGender('male'), 'male');
assert.strictEqual(tts.normalizeGender('other'), 'female');
assert.strictEqual(tts.normalizeGender(), 'female');

assert.strictEqual(tts.SPEAK_RATE, 0.9 * 0.8);
assert.strictEqual(tts.SYLLABLE_BREAK_MS, 400);
assert.strictEqual(
  tts.buildSyllableSsml('고양이'),
  '<emphasis level="strong"><prosody pitch="+8%" volume="+20%">고</prosody></emphasis>'
  + '<break time="400ms"/>'
  + '<emphasis level="strong"><prosody pitch="+8%" volume="+20%">양</prosody></emphasis>'
  + '<break time="400ms"/>'
  + '<emphasis level="strong"><prosody pitch="+8%" volume="+20%">이</prosody></emphasis>'
);
assert.strictEqual(tts.PROSODY.female.rate, tts.SPEAK_RATE);
assert.strictEqual(tts.PROSODY.male.rate, tts.SPEAK_RATE);

console.log('google-tts tests passed');
