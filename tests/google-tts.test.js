'use strict';

const assert = require('assert');
const tts = require('../lib/google-tts');

assert.strictEqual(tts.isSpeakableKorean('고양이'), true);
assert.strictEqual(tts.isSpeakableKorean('사과·나무'), true);
assert.strictEqual(tts.isSpeakableKorean('hello'), false);
assert.strictEqual(tts.isSpeakableKorean(''), false);
assert.strictEqual(tts.isSpeakableKorean('a'.repeat(61)), false);

console.log('google-tts tests passed');
