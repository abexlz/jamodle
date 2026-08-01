/**
 * Korean pronunciation audio synthesis (server-side).
 * Uses Microsoft Edge neural voices via WebSocket for clear female/male speech.
 */
'use strict';

const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const MAX_TEXT_LEN = 60;
const OUTPUT_FORMAT_QUALITY = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

const EDGE_VOICES = {
  female: ['ko-KR-SunHiNeural'],
  male: ['ko-KR-InJoonNeural', 'ko-KR-HyunsuMultilingualNeural'],
};

/** Was 0.9 — slowed to 80% for clearer learner pacing. */
const SPEAK_RATE = 0.9 * 0.8;

/** Slightly louder delivery tuned for short vocabulary words. */
const PROSODY = {
  female: { rate: SPEAK_RATE, pitch: '+2Hz', volume: 100 },
  male: { rate: SPEAK_RATE, pitch: '+0Hz', volume: 100 },
};

/**
 * Pause between Hangul syllables in SSML.
 * Doubled from the prior 200ms learner gap for clearer separation.
 */
const SYLLABLE_BREAK_MS = 200 * 2;

function normalizeGender(gender) {
  return gender === 'male' ? 'male' : 'female';
}

function isHangulSyllableChar(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0xAC00 && cp <= 0xD7A3;
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

function extractSpeakableChars(text) {
  return [...String(text || '').trim()].filter((ch) => (
    isHangulSyllableChar(ch)
    || (ch.codePointAt(0) >= 0x1100 && ch.codePointAt(0) <= 0x11FF)
    || (ch.codePointAt(0) >= 0x3130 && ch.codePointAt(0) <= 0x318F)
  ));
}

/**
 * Build SSML body: each syllable is emphasized, with a pause between them.
 */
function buildSyllableSsml(text) {
  const syllables = extractSpeakableChars(text);
  if (!syllables.length) return escapeSsml(String(text || '').trim());
  return syllables
    .map((ch) => (
      // Strong emphasis + slightly raised pitch/volume so each syllable lands clearly.
      `<emphasis level="strong">`
      + `<prosody pitch="+8%" volume="+20%">${escapeSsml(ch)}</prosody>`
      + `</emphasis>`
    ))
    .join(`<break time="${SYLLABLE_BREAK_MS}ms"/>`);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function synthesizeWithEdgeVoice(text, voiceName, prosody) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voiceName, OUTPUT_FORMAT_QUALITY);
    const ssmlBody = buildSyllableSsml(text);
    const { audioStream } = tts.toStream(ssmlBody, prosody);
    const buf = await streamToBuffer(audioStream);
    if (buf.length < 128) {
      const err = new Error('Edge TTS returned empty audio');
      err.code = 'EMPTY';
      throw err;
    }
    return buf;
  } finally {
    try {
      tts.close();
    } catch (_) { /* ignore */ }
  }
}

async function synthesizeWithEdge(text, gender) {
  const key = normalizeGender(gender);
  const voices = EDGE_VOICES[key];
  const prosody = PROSODY[key];
  let lastErr = null;
  for (const voiceName of voices) {
    try {
      return await synthesizeWithEdgeVoice(text, voiceName, prosody);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Edge TTS failed');
}

async function synthesize(text, options = {}) {
  const trimmed = String(text || '').trim();
  if (!isSpeakableKorean(trimmed)) {
    const err = new Error('Text is not valid Korean for TTS');
    err.code = 'INVALID_TEXT';
    throw err;
  }

  return synthesizeWithEdge(trimmed, normalizeGender(options.gender));
}

module.exports = {
  MAX_TEXT_LEN,
  EDGE_VOICES,
  PROSODY,
  SPEAK_RATE,
  SYLLABLE_BREAK_MS,
  normalizeGender,
  isSpeakableKorean,
  isHangulSyllableChar,
  buildSyllableSsml,
  synthesize,
};
