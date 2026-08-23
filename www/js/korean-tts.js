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
  let activeAudio = null;
  let sharedAudio = null;
  let activeSource = null;
  let primed = false;
  let playbackUnlocked = false;
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

  const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  function ensureSharedAudio() {
    if (!sharedAudio) {
      sharedAudio = new Audio();
      sharedAudio.setAttribute('playsinline', 'true');
      sharedAudio.setAttribute('webkit-playsinline', 'true');
      sharedAudio.preload = 'auto';
    }
    return sharedAudio;
  }

  /**
   * Unlock Web Audio (same path as SFX) plus a persistent HTMLAudioElement.
   * iPhone silent switch often mutes HTMLAudio while Web Audio still plays.
   */
  function unlockPlayback() {
    prime();
    try {
      global.SoundEffects?.unlock?.();
      const ctx = global.SoundEffects?.getSharedContext?.();
      if (ctx?.state === 'suspended') ctx.resume?.().catch?.(() => {});
    } catch (_) { /* ignore */ }
    const audio = ensureSharedAudio();
    try {
      if (!audio.src) audio.src = SILENT_WAV;
      audio.volume = 0.01;
      const playPromise = audio.play();
      playbackUnlocked = true;
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => {
          try {
            if (audio.src === SILENT_WAV || String(audio.src || '').startsWith('data:')) {
              audio.pause();
              audio.currentTime = 0;
            }
          } catch (_) { /* ignore */ }
        }).catch(() => {
          playbackUnlocked = false;
        });
      }
    } catch (_) {
      playbackUnlocked = false;
    }
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
    return `v8:${gender}:${pace}:${String(text || '').trim()}`;
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
    const ctx = global.SoundEffects?.getSharedContext?.();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (_) { /* ignore */ }
    }
    const decoded = await ctx.decodeAudioData(raw.slice(0));
    bufferCache.set(key, decoded);
    return decoded;
  }

  /** Warm the TTS cache so win playback can start without a network wait. */
  function prefetch(text, options = {}) {
    const word = normalizeWord(text);
    if (!word) return Promise.resolve(null);
    return getDecodedBuffer(word, options).catch(() => fetchServerAudio(word, options).catch(() => null));
  }

  function cancel() {
    activeSession += 1;
    if (activeSource) {
      try { activeSource.stop?.(); } catch (_) { /* ignore */ }
      try { activeSource.disconnect?.(); } catch (_) { /* ignore */ }
      activeSource = null;
    }
    const audio = sharedAudio || activeAudio;
    if (audio) {
      try {
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplay = null;
      } catch (_) { /* ignore */ }
    }
    activeAudio = null;
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

  function playViaWebAudio(buffer, volume, playbackRate = 1) {
    return new Promise(async (resolve) => {
      const ctx = global.SoundEffects?.getSharedContext?.();
      if (!ctx || !buffer) {
        resolve(false);
        return;
      }
      try {
        if (ctx.state === 'suspended') await ctx.resume();
      } catch (_) {
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
        const amp = Math.max(0.45, Math.min(1, volume || 0.85));
        src.buffer = buffer;
        try {
          src.playbackRate.value = clampPlaybackRate(playbackRate);
        } catch (_) { /* ignore */ }
        gain.gain.value = amp;
        src.connect(gain);
        gain.connect(ctx.destination);
        activeSource = src;
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          if (activeSource === src) activeSource = null;
          resolve(!!ok);
        };
        src.onended = () => done(true);
        src.start(0);
        const dur = Math.max(0.2, (buffer.duration || 1) / clampPlaybackRate(playbackRate));
        setTimeout(() => done(true), (dur + 0.15) * 1000);
      } catch (_) {
        resolve(false);
      }
    });
  }

  function playAudioUrl(url, volume, playbackRate = 1) {
    return new Promise((resolve) => {
      const audio = ensureSharedAudio();
      let settled = false;
      let started = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplay = null;
        if (activeAudio === audio) activeAudio = null;
        resolve(!!ok);
      };

      try {
        audio.pause();
      } catch (_) { /* ignore */ }

      activeAudio = audio;
      audio.volume = Math.max(0.45, Math.min(1, volume || 0.85));
      try {
        audio.playbackRate = clampPlaybackRate(playbackRate);
      } catch (_) { /* ignore */ }

      const startPlay = () => {
        if (settled || started) return;
        started = true;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => done(false));
        }
      };

      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.src = url;
      if (audio.readyState >= 2) {
        startPlay();
      } else {
        audio.oncanplay = () => {
          audio.oncanplay = null;
          startPlay();
        };
        try {
          audio.load();
        } catch (_) { /* ignore */ }
        setTimeout(() => startPlay(), 600);
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
    const volume = Number.isFinite(options.volume) ? options.volume : speakVolume();
    const preferServer = options.preferServer !== false;
    const playbackRate = clampPlaybackRate(options.playbackRate);
    const audibleVolume = Math.max(0.45, volume || 0.85);

    if (preferServer) {
      try {
        // Prefer Web Audio (same pipeline as SFX) so iPhone silent switch
        // does not mute the win pronunciation while still waiting full duration.
        const decoded = await getDecodedBuffer(text, options);
        if (decoded) {
          const ok = await playViaWebAudio(decoded, audibleVolume, playbackRate);
          if (ok) return true;
        }
        const audioUrl = await fetchServerAudio(text, options);
        const okHtml = await playAudioUrl(audioUrl, audibleVolume, playbackRate);
        if (okHtml) return true;
      } catch (_) {
        /* fall through to browser voice */
      }
    }

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
    // Second+ pass: half the syllable pause for a snappier re-read,
    // unless the caller sets an explicit repeat cadence.
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
    // Do not call unlockPlayback() here — starting a silent clip then swapping
    // src races with play() on iOS. Unlock only from real user gestures.

    // Start fetching pass 2+ immediately alongside pass 1 playback, so the
    // audible gap between readings is only gapMs — not a second network round-trip.
    const warmed = [];
    if (preferServer) {
      for (let i = 1; i < repeats; i += 1) {
        warmed[i] = fetchServerAudio(
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

  global.KoreanTTS = {
    REPEAT_GAP_MS,
    prime,
    unlockPlayback,
    prefetch,
    cancel,
    speak,
    speakOnce,
    speakWithWebSpeech,
    normalizeWord,
    waitForVoices,
    SYLLABLE_GAP_MS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
