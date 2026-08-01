/**
 * Korean pronunciation audio synthesis (server-side).
 * Uses Microsoft Edge neural voices via WebSocket for clear female/male speech.
 *
 * Note: msedge-tts wraps input in an outer <prosody> element. Nested SSML tags
 * (break / emphasis / inner prosody) inside that input cause Edge to abort
 * synthesis, so syllable pacing must use plain-text separators instead.
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

/**
 * Emphatic delivery: slower rate, raised pitch, louder volume so each
 * syllable lands more strongly (without nested SSML emphasis tags).
 */
const PROSODY = {
  female: { rate: SPEAK_RATE, pitch: '+10Hz', volume: 120 },
  male: { rate: SPEAK_RATE, pitch: '+6Hz', volume: 120 },
};

/**
 * Plain-text separators between Hangul syllables.
 * Normal uses a comma pause; fast is half that (space only).
 * (SSML <break> cannot be used — see file header.)
 */
const SYLLABLE_SEPARATOR = ', ';
const SYLLABLE_SEPARATOR_FAST = ' ';

function normalizeGender(gender) {
  return gender === 'male' ? 'male' : 'female';
}

function normalizeSyllablePace(pace) {
  return pace === 'fast' ? 'fast' : 'normal';
}

function syllableSeparatorForPace(pace) {
  return normalizeSyllablePace(pace) === 'fast'
    ? SYLLABLE_SEPARATOR_FAST
    : SYLLABLE_SEPARATOR;
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

function extractSpeakableChars(text) {
  return [...String(text || '').trim()].filter((ch) => (
    isHangulSyllableChar(ch)
    || (ch.codePointAt(0) >= 0x1100 && ch.codePointAt(0) <= 0x11FF)
    || (ch.codePointAt(0) >= 0x3130 && ch.codePointAt(0) <= 0x318F)
  ));
}

/**
 * Build plain speakable text with emphatic syllable separation.
 * Kept as buildSyllableSsml for API compatibility with tests/callers.
 * @param {string} text
 * @param {{ pace?: 'normal'|'fast' }} [options]
 */
function buildSyllableSsml(text, options = {}) {
  const syllables = extractSpeakableChars(text);
  if (!syllables.length) return String(text || '').trim();
  return syllables.join(syllableSeparatorForPace(options.pace));
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function synthesizeWithEdgeVoice(text, voiceName, prosody, pace) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voiceName, OUTPUT_FORMAT_QUALITY);
    // Plain text only — never nest SSML tags inside msedge-tts's outer prosody.
    const spoken = buildSyllableSsml(text, { pace });
    const { audioStream } = tts.toStream(spoken, prosody);
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

async function synthesizeWithEdge(text, gender, pace) {
  const key = normalizeGender(gender);
  const voices = EDGE_VOICES[key];
  const prosody = PROSODY[key];
  let lastErr = null;
  for (const voiceName of voices) {
    try {
      return await synthesizeWithEdgeVoice(text, voiceName, prosody, pace);
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

  return synthesizeWithEdge(
    trimmed,
    normalizeGender(options.gender),
    normalizeSyllablePace(options.pace || options.syllablePace)
  );
}

module.exports = {
  MAX_TEXT_LEN,
  EDGE_VOICES,
  PROSODY,
  SPEAK_RATE,
  SYLLABLE_SEPARATOR,
  SYLLABLE_SEPARATOR_FAST,
  normalizeGender,
  normalizeSyllablePace,
  isSpeakableKorean,
  isHangulSyllableChar,
  buildSyllableSsml,
  synthesize,
};
