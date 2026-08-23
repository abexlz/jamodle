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

assert.strictEqual(tts.SPEAK_RATE, 0.92);
assert.strictEqual(tts.SYLLABLE_SEPARATOR, '');
assert.strictEqual(tts.SYLLABLE_SEPARATOR_FAST, ' ');
assert.strictEqual(tts.SYLLABLE_SEPARATOR_QUICK, '');
assert.strictEqual(tts.normalizeSyllablePace('fast'), 'fast');
assert.strictEqual(tts.normalizeSyllablePace('quick'), 'quick');
assert.strictEqual(tts.normalizeSyllablePace('0.4'), 'quick');
assert.strictEqual(tts.normalizeSyllablePace('normal'), 'normal');
assert.strictEqual(tts.normalizeSyllablePace('other'), 'normal');
assert.strictEqual(tts.buildSyllableSsml('고양이'), '고양이');
assert.strictEqual(tts.buildSyllableSsml('고양이', { pace: 'fast' }), '고 양 이');
assert.strictEqual(tts.buildSyllableSsml('고양이', { pace: 'quick' }), '고양이');
assert.ok(!tts.buildSyllableSsml('고양이').includes('<'));
assert.strictEqual(tts.PROSODY.female.rate, tts.SPEAK_RATE);
assert.strictEqual(tts.PROSODY.male.rate, tts.SPEAK_RATE);
assert.strictEqual(tts.PROSODY.female.pitch, '+0Hz');
assert.strictEqual(tts.PROSODY.male.pitch, '+0Hz');
assert.strictEqual(tts.PROSODY.female.volume, 100);
assert.strictEqual(tts.PROSODY.male.volume, 100);

console.log('google-tts tests passed');
