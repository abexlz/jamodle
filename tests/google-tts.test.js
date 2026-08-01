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
assert.strictEqual(tts.SYLLABLE_SEPARATOR, ', ');
assert.strictEqual(tts.SYLLABLE_SEPARATOR_FAST, ' ');
assert.strictEqual(tts.normalizeSyllablePace('fast'), 'fast');
assert.strictEqual(tts.normalizeSyllablePace('normal'), 'normal');
assert.strictEqual(tts.normalizeSyllablePace('other'), 'normal');
assert.strictEqual(tts.buildSyllableSsml('고양이'), '고, 양, 이');
assert.strictEqual(tts.buildSyllableSsml('고양이', { pace: 'fast' }), '고 양 이');
assert.ok(!tts.buildSyllableSsml('고양이').includes('<'));
assert.strictEqual(tts.PROSODY.female.rate, tts.SPEAK_RATE);
assert.strictEqual(tts.PROSODY.male.rate, tts.SPEAK_RATE);
assert.ok(tts.PROSODY.female.volume >= 100);
assert.ok(tts.PROSODY.male.volume >= 100);

console.log('google-tts tests passed');
