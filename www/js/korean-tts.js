/**
 * Clear Korean pronunciation — server MP3 first, browser voice fallback.
 */
(function (global) {
  'use strict';

  const REPEAT_GAP_MS = 220;
  const VOICE_WAIT_MS = 1200;
  const CACHE_MAX = 80;

  let activeSession = 0;
  let activeAudio = null;
  let primed = false;
  let voiceReadyPromise = null;
  let selectedVoice = null;
  let selectedVoiceGender = null;

  const audioCache = new Map();
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
    if (!Number.isFinite(vol)) return 0.9;
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

  function rememberCache(key, url) {
    if (audioCache.has(key)) return;
    audioCache.set(key, url);
    cacheOrder.push(key);
    while (cacheOrder.length > CACHE_MAX) {
      const oldKey = cacheOrder.shift();
      const oldUrl = audioCache.get(oldKey);
      audioCache.delete(oldKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    }
  }

  async function fetchServerAudio(text) {
    const gender = preferredVoiceGender();
    const key = `${gender}:${text.trim()}`;
    if (audioCache.has(key)) return audioCache.get(key);

    const url = `${getApiBase()}/api/tts/speak?text=${encodeURIComponent(text.trim())}`
      + `&voice=${encodeURIComponent(gender)}`;
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

    const blob = await res.blob();
    if (!blob || blob.size < 128) {
      throw new Error('Empty TTS audio');
    }

    const objectUrl = URL.createObjectURL(blob);
    rememberCache(key, objectUrl);
    return objectUrl;
  }

  function cancel() {
    activeSession += 1;
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch (_) { /* ignore */ }
      activeAudio = null;
    }
    try {
      global.speechSynthesis?.cancel?.();
    } catch (_) { /* ignore */ }
  }

  function playAudioUrl(url, volume) {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      activeAudio = audio;
      audio.preload = 'auto';
      audio.volume = volume;

      const done = (ok) => {
        if (activeAudio === audio) activeAudio = null;
        resolve(ok);
      };

      audio.onended = () => done(true);
      audio.onerror = () => done(false);

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => done(false));
      }
    });
  }

  function speakWithWebSpeech(text, options = {}) {
    if (!global.speechSynthesis) return Promise.resolve(false);

    const rate = Number.isFinite(options.rate) ? options.rate : 0.78;
    const volume = Number.isFinite(options.volume) ? options.volume : speakVolume();

    return waitForVoices().then((voice) => new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.volume = volume;
      if (voice) utterance.voice = voice;

      const finish = (ok) => resolve(ok);
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);

      try {
        global.speechSynthesis.resume?.();
        global.speechSynthesis.speak(utterance);
      } catch (_) {
        finish(false);
      }
    }));
  }

  async function speakOnce(text, options = {}) {
    const volume = Number.isFinite(options.volume) ? options.volume : speakVolume();
    const preferServer = options.preferServer !== false;

    if (preferServer) {
      try {
        const audioUrl = await fetchServerAudio(text);
        const ok = await playAudioUrl(audioUrl, volume);
        if (ok) return true;
      } catch (_) {
        /* fall through to browser voice */
      }
    }

    return speakWithWebSpeech(text, { ...options, volume });
  }

  async function speak(text, options = {}) {
    const word = normalizeWord(text);
    const repeats = Math.max(1, Number(options.repeats) || 1);
    const gapMs = Number.isFinite(options.gapMs) ? options.gapMs : REPEAT_GAP_MS;

    if (!word || !pronunciationEnabled()) return false;

    cancel();
    const session = activeSession;
    prime();

    for (let i = 0; i < repeats; i += 1) {
      if (session !== activeSession) return false;
      const ok = await speakOnce(word, options);
      if (!ok) return false;
      if (i < repeats - 1) {
        await new Promise((r) => setTimeout(r, gapMs));
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
    prime,
    cancel,
    speak,
    speakOnce,
    speakWithWebSpeech,
    normalizeWord,
    waitForVoices,
  };
})(typeof window !== 'undefined' ? window : globalThis);
