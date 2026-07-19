/**
 * Fetch clear Korean speech audio from Google Translate TTS.
 * Used server-side only (avoids CORS and inconsistent browser voices).
 */
'use strict';

const TTS_URL = 'https://translate.google.com/translate_tts';
const MAX_TEXT_LEN = 60;

function isSpeakableKorean(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LEN) return false;
  return /^[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F·\s]+$/.test(trimmed);
}

async function synthesize(text) {
  const trimmed = String(text || '').trim();
  if (!isSpeakableKorean(trimmed)) {
    const err = new Error('Text is not valid Korean for TTS');
    err.code = 'INVALID_TEXT';
    throw err;
  }

  const params = new URLSearchParams({
    ie: 'UTF-8',
    client: 'gtx',
    tl: 'ko',
    q: trimmed,
  });

  const res = await fetch(`${TTS_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JamodeulTTS/1.0)',
    },
  });

  if (!res.ok) {
    const err = new Error(`TTS upstream HTTP ${res.status}`);
    err.code = 'UPSTREAM';
    throw err;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 128) {
    const err = new Error('TTS upstream returned empty audio');
    err.code = 'EMPTY';
    throw err;
  }

  return buf;
}

module.exports = {
  MAX_TEXT_LEN,
  isSpeakableKorean,
  synthesize,
};
