/**
 * Korean pronunciation audio synthesis (server-side).
 * Uses Microsoft Edge neural voices for female/male; Google fallback is male-only.
 */
'use strict';

const EDGE_TTS_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
  + '?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';
const MAX_TEXT_LEN = 60;
const EDGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

const EDGE_VOICES = {
  female: ['ko-KR-SunHiNeural', 'ko-KR-SoonBokNeural', 'ko-KR-JiMinNeural'],
  male: ['ko-KR-InJoonNeural', 'ko-KR-HyunsuNeural'],
};

function normalizeGender(gender) {
  return gender === 'male' ? 'male' : 'female';
}

function isSpeakableKorean(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LEN) return false;
  return /^[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F·\s]+$/.test(trimmed);
}

function escapeSsml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildEdgeSsml(text, voiceName) {
  const escaped = escapeSsml(text);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ko-KR'>`
    + `<voice name='${voiceName}'><prosody rate='+0%'>${escaped}</prosody></voice></speak>`;
}

async function synthesizeWithEdgeVoice(text, voiceName) {
  const res = await fetch(EDGE_TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': EDGE_USER_AGENT,
      Accept: '*/*',
      Origin: 'https://www.bing.com',
      Referer: 'https://www.bing.com/',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: buildEdgeSsml(text, voiceName),
  });

  if (!res.ok) {
    const err = new Error(`Edge TTS HTTP ${res.status}`);
    err.code = 'EDGE_UPSTREAM';
    throw err;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 128) {
    const err = new Error('Edge TTS returned empty audio');
    err.code = 'EMPTY';
    throw err;
  }

  return buf;
}

async function synthesizeWithEdge(text, gender) {
  const voices = EDGE_VOICES[normalizeGender(gender)];
  let lastErr = null;
  for (const voiceName of voices) {
    try {
      return await synthesizeWithEdgeVoice(text, voiceName);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Edge TTS failed');
}

async function synthesizeWithGoogle(text) {
  const params = new URLSearchParams({
    ie: 'UTF-8',
    client: 'gtx',
    tl: 'ko',
    q: text,
  });

  const res = await fetch(`${GOOGLE_TTS_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JamodeulTTS/1.0)',
    },
  });

  if (!res.ok) {
    const err = new Error(`Google TTS HTTP ${res.status}`);
    err.code = 'GOOGLE_UPSTREAM';
    throw err;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 128) {
    const err = new Error('Google TTS returned empty audio');
    err.code = 'EMPTY';
    throw err;
  }

  return buf;
}

async function synthesize(text, options = {}) {
  const trimmed = String(text || '').trim();
  if (!isSpeakableKorean(trimmed)) {
    const err = new Error('Text is not valid Korean for TTS');
    err.code = 'INVALID_TEXT';
    throw err;
  }

  const gender = normalizeGender(options.gender);

  try {
    return await synthesizeWithEdge(trimmed, gender);
  } catch (edgeErr) {
    // Google Translate Korean is male-only — never use it for female requests.
    if (gender === 'male') {
      try {
        return await synthesizeWithGoogle(trimmed);
      } catch (_) {
        /* fall through */
      }
    }
    throw edgeErr;
  }
}

module.exports = {
  MAX_TEXT_LEN,
  EDGE_VOICES,
  normalizeGender,
  isSpeakableKorean,
  synthesize,
};
