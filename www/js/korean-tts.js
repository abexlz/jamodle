/**
 * Clear Korean pronunciation — server MP3 first, browser voice fallback.
 */
(function (global) {
  'use strict';

  /**
   * Pause between full-word repeats (1st → 2nd reading).
   * Half of the previous AnswerTTS/default gap (200ms). Kept here as the
   * fallback when callers omit gapMs; AnswerTTS always passes this value.
   */
  const REPEAT_GAP_MS = 100;
  /** Web Speech rate was 0.82 — slowed to 80% to match server TTS. */
  const DEFAULT_RATE = 0.82 * 0.8;
  /**
   * Pause between Hangul syllables on the Web Speech fallback.
   * Half of the previous 400ms gap.
   */
  const SYLLABLE_GAP_MS = 200;
  const VOICE_WAIT_MS = 1200;
  const CACHE_MAX = 80;

  let activeSession = 0;
  let activeSource = null;
  let primed = false;
  let voiceReadyPromise = null;
  let selectedVoice = null;
  let selectedVoiceGender = null;

  const audioCache = new Map();
  /** @type {Map<string, ArrayBuffer>} */
  const rawCache = new Map();
  /** @type {Map<string, AudioBuffer>} */
  const bufferCache = new Map();
  const cacheOrder = [];

  function getApiBase() {
    if (global.JAMODEUL_API_BASE) return global.JAMODEUL_API_BASE.replace(/\/$/, '');
    return '';
  }

  function pronunciationEnabled() {
    return global.UserPreferences?.get?.().pronunciation !== false;
  }

  function speakVolume() {
    const vol = Number(global.UserPreferences?.get?.().volume);
    if (!Number.isFinite(vol)) return 0.95;
    return Math.max(0, Math.min(1, vol));
  }

  function preferredVoiceGender() {
    const gender = global.UserPreferences?.get?.().pronunciationVoice;
    return gender === 'male' ? 'male' : 'female';
  }

  function normalizeWord(text) {
    if (!text) return '';
    const raw = String(text).trim();
    if (!raw) return '';
    const parts = raw.split('·').map((w) => w.trim()).filter(Boolean);
    return parts[0] || raw;
  }

  function isKoreanVoice(voice) {
    const lang = String(voice?.lang || '').toLowerCase();
    return lang === 'ko-kr' || lang === 'ko' || lang.startsWith('ko-');
  }

  function scoreKoreanVoice(voice) {
    const name = String(voice?.name || '').toLowerCase();
    const gender = preferredVoiceGender();
    let score = 0;
    if (isKoreanVoice(voice)) score += 40;
    if (voice?.localService) score += 8;
    if (/premium|enhanced|neural|natural|wavenet|google/.test(name)) score += 24;
    const isMale = /injoon|jinho|donghyun|daeseong|kihyo|hyunsu|hyunwoo|\bmale\b/.test(name);
    const isFemale = /yuna|narae|heena|sora|sunhi|mijin|hyeri|yumi|soonbok|heami|jimin|\bfemale\b/.test(name);
    if (gender === 'male') {
      if (isMale) score += 30;
      if (isFemale) score -= 25;
    } else {
      if (isFemale) score += 30;
      if (isMale) score -= 25;
    }
    if (/compact|low|basic/.test(name)) score -= 12;
    if (/english|en-us|en_gb|uk english/.test(name)) score -= 50;
    return score;
  }

  function resetVoiceSelection() {
    selectedVoice = null;
    selectedVoiceGender = null;
    voiceReadyPromise = null;
  }

  function clearAudioCache() {
    for (const url of audioCache.values()) {
      if (url) URL.revokeObjectURL(url);
    }
    audioCache.clear();
    rawCache.clear();
    bufferCache.clear();
    cacheOrder.length = 0;
  }

  function pickKoreanVoice(voices) {
    const list = Array.isArray(voices) ? voices : [];
    const korean = list.filter(isKoreanVoice);
    if (!korean.length) return null;
    return korean.sort((a, b) => scoreKoreanVoice(b) - scoreKoreanVoice(a))[0];
  }

  function waitForVoices() {
    if (!global.speechSynthesis) return Promise.resolve(null);
    const gender = preferredVoiceGender();
    if (selectedVoice && selectedVoiceGender === gender) {
      return Promise.resolve(selectedVoice);
    }

    if (!voiceReadyPromise || selectedVoiceGender !== gender) {
      voiceReadyPromise = new Promise((resolve) => {
        const finish = () => {
          selectedVoice = pickKoreanVoice(global.speechSynthesis.getVoices());
          selectedVoiceGender = gender;
          resolve(selectedVoice);
        };

        const voices = global.speechSynthesis.getVoices();
        if (voices?.length) {
          finish();
          return;
        }

        const onChange = () => {
          global.speechSynthesis.removeEventListener('voiceschanged', onChange);
          finish();
        };
        global.speechSynthesis.addEventListener('voiceschanged', onChange);
        try {
          global.speechSynthesis.getVoices();
        } catch (_) { /* ignore */ }

        setTimeout(() => {
          global.speechSynthesis.removeEventListener('voiceschanged', onChange);
          finish();
        }, VOICE_WAIT_MS);
      });
    }

    return voiceReadyPromise;
  }

  function prime() {
    if (primed) return;
    primed = true;
    try {
      global.speechSynthesis?.resume?.();
      global.speechSynthesis?.getVoices?.();
    } catch (_) { /* ignore */ }
    waitForVoices();
  }

  /**
   * Use the same AudioContext as SoundEffects (place/win tones already audible).
   * A separate TTS context often stays suspended after async fetch on iOS.
   */
  function getPlaybackContext() {
    try {
      global.SoundEffects?.unlock?.();
      return global.SoundEffects?.getSharedContext?.() || null;
    } catch (_) {
      return null;
    }
  }

  async function ensureCtxRunning(ctx) {
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    try {
      await ctx.resume();
    } catch (_) { /* ignore */ }
    return ctx.state === 'running';
  }

  /** Unlock shared Web Audio from a user gesture (tile tap / speaker button). */
  function unlockPlayback() {
    prime();
    const ctx = getPlaybackContext();
    if (ctx) ensureCtxRunning(ctx);
  }

  function rememberCache(key, url) {
    if (audioCache.has(key)) return;
    audioCache.set(key, url);
    cacheOrder.push(key);
    while (cacheOrder.length > CACHE_MAX) {
      const oldKey = cacheOrder.shift();
      const oldUrl = audioCache.get(oldKey);
      audioCache.delete(oldKey);
      rawCache.delete(oldKey);
      bufferCache.delete(oldKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    }
  }

  function cacheKeyFor(text, options = {}) {
    const gender = preferredVoiceGender();
    const pace = options.syllablePace === 'quick' || options.syllablePace === '0.4'
      ? 'quick'
      : options.syllablePace === 'fast'
        ? 'fast'
        : 'normal';
    // v9: buffers must be decoded on the SoundEffects AudioContext.
    return `v9:${gender}:${pace}:${String(text || '').trim()}`;
  }

  async function fetchServerRaw(text, options = {}) {
    const key = cacheKeyFor(text, options);
    if (rawCache.has(key)) return rawCache.get(key);

    const gender = preferredVoiceGender();
    const pace = key.split(':')[2];
    const url = `${getApiBase()}/api/tts/speak?text=${encodeURIComponent(text.trim())}`
      + `&voice=${encodeURIComponent(gender)}`
      + `&pace=${encodeURIComponent(pace)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'audio/mpeg',
        'ngrok-skip-browser-warning': '1',
      },
    });

    if (!res.ok) {
      const err = new Error(`TTS HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    const buffer = await res.arrayBuffer();
    if (!buffer || buffer.byteLength < 128) {
      throw new Error('Empty TTS audio');
    }

    const copy = buffer.slice(0);
    rawCache.set(key, copy);
    const objectUrl = URL.createObjectURL(new Blob([copy], { type: 'audio/mpeg' }));
    rememberCache(key, objectUrl);
    return copy;
  }

  async function fetchServerAudio(text, options = {}) {
    const key = cacheKeyFor(text, options);
    if (audioCache.has(key)) return audioCache.get(key);
    await fetchServerRaw(text, options);
    return audioCache.get(key);
  }

  async function getDecodedBuffer(text, options = {}) {
    const key = cacheKeyFor(text, options);
    if (bufferCache.has(key)) return bufferCache.get(key);

    const raw = await fetchServerRaw(text, options);
    const ctx = getPlaybackContext();
    if (!ctx) return null;
    // decodeAudioData works while suspended; do not require running here.

    const decoded = await new Promise((resolve, reject) => {
      try {
        const ret = ctx.decodeAudioData(raw.slice(0), resolve, reject);
        if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
    bufferCache.set(key, decoded);
    return decoded;
  }

  /** Warm the TTS cache so win playback can start without a network wait. */
  function prefetch(text, options = {}) {
    const word = normalizeWord(text);
    if (!word) return Promise.resolve(null);
    return getDecodedBuffer(word, options).catch(() => null);
  }

  function cancel() {
    activeSession += 1;
    if (activeSource) {
      try { activeSource.stop?.(); } catch (_) { /* ignore */ }
      try { activeSource.disconnect?.(); } catch (_) { /* ignore */ }
      activeSource = null;
    }
    try {
      global.speechSynthesis?.cancel?.();
    } catch (_) { /* ignore */ }
  }

  function clampPlaybackRate(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    return Math.max(0.5, Math.min(2, value));
  }

  function resolveSpeakRate(options = {}) {
    if (Number.isFinite(options.rate)) return options.rate;
    const playbackRate = clampPlaybackRate(options.playbackRate);
    return DEFAULT_RATE * playbackRate;
  }

  /**
   * Play decoded PCM through SoundEffects' AudioContext — same path as UI SFX,
   * so it stays audible with the iPhone ringer switch muted.
   */
  function playViaWebAudio(buffer, volume, playbackRate = 1) {
    if (!buffer) return Promise.resolve(false);
    const gainValue = Math.max(0.85, Math.min(1, Number(volume) || 1));
    const rate = clampPlaybackRate(playbackRate);

    if (typeof global.SoundEffects?.playRawBuffer === 'function') {
      return global.SoundEffects.playRawBuffer(buffer, { gainValue, playbackRate: rate });
    }
    return playViaOwnBufferSource(buffer, gainValue, rate);
  }

  /** Start cached clip immediately (no await) — call from a user gesture. */
  function playIfCached(text, options = {}) {
    const word = normalizeWord(text);
    if (!word) return false;
    const key = cacheKeyFor(word, options);
    const decoded = bufferCache.get(key);
    if (!decoded) return false;
    unlockPlayback();
    playViaWebAudio(decoded, 1, clampPlaybackRate(options.playbackRate));
    return true;
  }

  function playViaOwnBufferSource(buffer, gainValue, playbackRate) {
    return new Promise(async (resolve) => {
      const ctx = getPlaybackContext();
      if (!ctx || !buffer) {
        resolve(false);
        return;
      }
      if (!(await ensureCtxRunning(ctx))) {
        resolve(false);
        return;
      }
      try {
        if (activeSource) {
          try { activeSource.stop?.(); } catch (_) { /* ignore */ }
          activeSource = null;
        }
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = gainValue;
        src.buffer = buffer;
        try { src.playbackRate.value = playbackRate; } catch (_) { /* ignore */ }
        src.connect(gain);
        gain.connect(ctx.destination);
        activeSource = src;
        let settled = false;
        const done = (v) => {
          if (settled) return;
          settled = true;
          if (activeSource === src) activeSource = null;
          resolve(!!v);
        };
        src.onended = () => done(true);
        src.start(0);
        const ms = Math.max(300, ((buffer.duration || 1) / playbackRate + 0.25) * 1000);
        setTimeout(() => done(true), ms);
      } catch (err) {
        console.warn('[KoreanTTS] BufferSource play failed', err);
        resolve(false);
      }
    });
  }

  function speakWithWebSpeech(text, options = {}) {
    if (!global.speechSynthesis) return Promise.resolve(false);

    const rate = resolveSpeakRate(options);
    const volume = Number.isFinite(options.volume) ? options.volume : speakVolume();
    const playbackRate = clampPlaybackRate(options.playbackRate);
    const syllableGapMs = Number.isFinite(options.syllableGapMs)
      ? options.syllableGapMs
      : Math.round(SYLLABLE_GAP_MS / playbackRate);

    const syllables = [...String(text || '').trim()].filter((ch) => {
      const cp = ch.codePointAt(0);
      return (cp >= 0xAC00 && cp <= 0xD7A3)
        || (cp >= 0x1100 && cp <= 0x11FF)
        || (cp >= 0x3130 && cp <= 0x318F);
    });
    const chunks = syllables.length ? syllables : [String(text || '').trim()].filter(Boolean);
    if (!chunks.length) return Promise.resolve(false);

    return waitForVoices().then(async (voice) => {
      for (let i = 0; i < chunks.length; i += 1) {
        const ok = await new Promise((resolve) => {
          const utterance = new SpeechSynthesisUtterance(chunks[i]);
          utterance.lang = 'ko-KR';
          // Emphatic per-syllable delivery (stronger + slightly higher).
          utterance.rate = rate;
          utterance.pitch = 1.15;
          utterance.volume = Math.min(1, volume * 1.15);
          if (voice) utterance.voice = voice;

          const finish = (result) => resolve(result);
          utterance.onend = () => finish(true);
          utterance.onerror = () => finish(false);

          try {
            global.speechSynthesis.resume?.();
            global.speechSynthesis.speak(utterance);
          } catch (_) {
            finish(false);
          }
        });
        if (!ok) return false;
        if (i < chunks.length - 1 && syllableGapMs > 0) {
          await new Promise((r) => setTimeout(r, syllableGapMs));
        }
      }
      return true;
    });
  }

  async function speakOnce(text, options = {}) {
    const preferServer = options.preferServer !== false;
    const playbackRate = clampPlaybackRate(options.playbackRate);
    const audibleVolume = 1;

    unlockPlayback();

    if (preferServer) {
      try {
        const key = cacheKeyFor(text, options);
        let decoded = bufferCache.get(key) || null;
        if (!decoded) decoded = await getDecodedBuffer(text, options);
        if (decoded) {
          const ok = await playViaWebAudio(decoded, audibleVolume, playbackRate);
          if (ok) return true;
          console.warn('[KoreanTTS] Web Audio play returned false');
        } else {
          console.warn('[KoreanTTS] No decoded buffer for', text);
        }
      } catch (err) {
        console.warn('[KoreanTTS] Server voice failed', err);
      }
    }

    // force (win TTS): skip Web Speech — on iOS mute switch it waits silently.
    if (options.force) return false;
    return speakWithWebSpeech(text, { ...options, volume: audibleVolume, playbackRate });
  }

  function passOptionsForIndex(i, options, baseSyllableGap) {
    if (i === 0) {
      return {
        ...options,
        syllablePace: options.syllablePace || 'normal',
        syllableGapMs: baseSyllableGap,
      };
    }
    const repeatPace = options.repeatSyllablePace || 'fast';
    const repeatGap = Number.isFinite(options.repeatSyllableGapMs)
      ? options.repeatSyllableGapMs
      : Math.max(0, baseSyllableGap / 2);
    return {
      ...options,
      syllablePace: repeatPace,
      syllableGapMs: repeatGap,
    };
  }

  async function speak(text, options = {}) {
    const word = normalizeWord(text);
    const repeats = Math.max(1, Number(options.repeats) || 1);
    const gapMs = Number.isFinite(options.gapMs) ? options.gapMs : REPEAT_GAP_MS;
    const baseSyllableGap = Number.isFinite(options.syllableGapMs)
      ? options.syllableGapMs
      : SYLLABLE_GAP_MS;
    const preferServer = options.preferServer !== false;

    if (!word) return false;
    if (!options.force && !pronunciationEnabled()) return false;

    cancel();
    const session = activeSession;
    prime();
    unlockPlayback();

    const warmed = [];
    if (preferServer) {
      for (let i = 1; i < repeats; i += 1) {
        warmed[i] = getDecodedBuffer(
          word,
          passOptionsForIndex(i, options, baseSyllableGap),
        ).catch(() => null);
      }
    }

    for (let i = 0; i < repeats; i += 1) {
      if (session !== activeSession) return false;
      const passOptions = passOptionsForIndex(i, options, baseSyllableGap);
      const ok = await speakOnce(word, passOptions);
      if (!ok) return false;
      if (i < repeats - 1) {
        const waitGap = new Promise((r) => setTimeout(r, gapMs));
        await Promise.all([waitGap, warmed[i + 1] || Promise.resolve()]);
        if (session !== activeSession) return false;
      }
    }

    return true;
  }

  let lastVoiceGender = null;

  function syncVoicePreferenceState() {
    const gender = preferredVoiceGender();
    if (lastVoiceGender && gender !== lastVoiceGender) {
      clearAudioCache();
    }
    lastVoiceGender = gender;
    resetVoiceSelection();
  }

  global.UserPreferences?.onChange?.(() => {
    syncVoicePreferenceState();
  });

  syncVoicePreferenceState();

  // Keep the TTS AudioContext unlocked across taps (same idea as SoundEffects).
  if (typeof document !== 'undefined') {
    const unlock = () => unlockPlayback();
    document.addEventListener('pointerdown', unlock, { passive: true, capture: true });
    document.addEventListener('touchstart', unlock, { passive: true, capture: true });
  }

  global.KoreanTTS = {
    REPEAT_GAP_MS,
    prime,
    unlockPlayback,
    prefetch,
    playIfCached,
    cancel,
    speak,
    speakOnce,
    speakWithWebSpeech,
    normalizeWord,
    waitForVoices,
    SYLLABLE_GAP_MS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
