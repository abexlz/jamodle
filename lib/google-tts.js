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

/** Slightly slower, louder delivery tuned for short vocabulary words. */
const PROSODY = {
  female: { rate: 0.9, pitch: '+2Hz', volume: 100 },
  male: { rate: 0.9, pitch: '+0Hz', volume: 100 },
};

function normalizeGender(gender) {
  return gender === 'male' ? 'male' : 'female';
}

function isSpeakableKorean(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LEN) return false;
  return /^[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F·\s]+$/.test(trimmed);
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
    const { audioStream } = tts.toStream(text, prosody);
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
  normalizeGender,
  isSpeakableKorean,
  synthesize,
};
