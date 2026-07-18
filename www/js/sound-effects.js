/**
 * UI sound effects — Web Audio synthesis + decoded MP3 samples for battle results.
 * Respects UserPreferences.soundEffects and .volume.
 */
(function (global) {
  'use strict';

  let ctx = null;
  const sampleBuffers = new Map();
  const sampleLoading = new Map();

  const SAMPLE_DEFS = {
    battleVictory: {
      src: 'assets/sounds/korean-victory-bell.mp3',
      fallback: 'win',
    },
    battleDefeat: {
      src: 'assets/sounds/the-last-jingle.mp3',
      fallback: 'lose',
    },
    battleDraw: {
      src: 'assets/sounds/battle-draw.mp3',
      fallback: 'win',
    },
  };

  function prefs() {
    return global.UserPreferences?.get?.() || {};
  }

  function enabled() {
    return prefs().soundEffects !== false;
  }

  function masterGain() {
    const v = prefs().volume;
    return typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 0.85;
  }

  function resolveAssetUrl(relativePath) {
    const base = global.JAMODEUL_ASSET_BASE;
    if (base) {
      return `${String(base).replace(/\/$/, '')}/${relativePath.replace(/^\//, '')}`;
    }
    try {
      return new URL(relativePath, global.location.href).href;
    } catch {
      return relativePath;
    }
  }

  function getCtx() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  }

  async function loadSample(key) {
    const def = SAMPLE_DEFS[key];
    if (!def) return null;
    if (sampleBuffers.has(key)) return sampleBuffers.get(key);

    const pending = sampleLoading.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const c = getCtx();
      if (!c) return null;
      try {
        const res = await fetch(resolveAssetUrl(def.src));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const audioBuf = await c.decodeAudioData(data.slice(0));
        sampleBuffers.set(key, audioBuf);
        return audioBuf;
      } catch (err) {
        console.warn('[SoundEffects] failed to load sample', key, err);
        return null;
      } finally {
        sampleLoading.delete(key);
      }
    })();

    sampleLoading.set(key, promise);
    return promise;
  }

  function preloadSamples() {
    if (!enabled()) return;
    Object.keys(SAMPLE_DEFS).forEach((key) => {
      loadSample(key).catch(() => {});
    });
  }

  function playSampleBuffer(c, buffer) {
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buffer;
    gain.gain.value = masterGain();
    src.connect(gain);
    gain.connect(c.destination);
    src.start(0);
  }

  function playSample(key) {
    const def = SAMPLE_DEFS[key];
    if (!def || !enabled()) return;
    unlock();

    const c = getCtx();
    if (!c) {
      SoundEffects[def.fallback]?.();
      return;
    }

    const start = (buffer) => {
      if (!buffer) {
        SoundEffects[def.fallback]?.();
        return;
      }
      const run = () => {
        try {
          playSampleBuffer(c, buffer);
        } catch (err) {
          console.warn('[SoundEffects] sample playback failed', key, err);
          SoundEffects[def.fallback]?.();
        }
      };
      if (c.state === 'suspended') {
        c.resume().then(run).catch(() => SoundEffects[def.fallback]?.());
        return;
      }
      run();
    };

    if (sampleBuffers.has(key)) {
      start(sampleBuffers.get(key));
      return;
    }

    loadSample(key).then(start).catch(() => SoundEffects[def.fallback]?.());
  }

  function unlock() {
    const c = getCtx();
    if (c?.state === 'suspended') {
      c.resume().catch(() => {});
    }
    preloadSamples();
  }

  function playTone({ freq, freqEnd, type = 'sine', duration = 0.08, peak = 0.11, delay = 0 }) {
    if (!enabled()) return;
    const c = getCtx();
    if (!c) return;
    unlock();

    const t0 = c.currentTime + delay;
    const amp = peak * masterGain();
    if (amp <= 0.0001) return;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 40), t0 + duration);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(amp, 0.0001), t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function playSequence(notes) {
    notes.forEach((note, i) => {
      playTone({ ...note, delay: (note.delay || 0) + i * (note.gap ?? 0.09) });
    });
  }

  const SoundEffects = {
    unlock,
    preloadSamples,

    tap() {
      playTone({ freq: 520, duration: 0.035, peak: 0.07, type: 'triangle' });
    },

    nav() {
      playTone({ freq: 440, duration: 0.03, peak: 0.06, type: 'sine' });
    },

    select() {
      playTone({ freq: 480, freqEnd: 640, duration: 0.04, peak: 0.065, type: 'sine' });
    },

    tick() {
      playTone({ freq: 620, duration: 0.03, peak: 0.05, type: 'sine' });
    },

    rotate() {
      playTone({ freq: 280, freqEnd: 620, duration: 0.11, peak: 0.08, type: 'triangle' });
    },

    mergeSlot() {
      playTone({ freq: 400, freqEnd: 520, duration: 0.045, peak: 0.07, type: 'triangle' });
    },

    merge() {
      playSequence([
        { freq: 440, duration: 0.07, peak: 0.09 },
        { freq: 587, duration: 0.08, peak: 0.1, gap: 0.055 },
        { freq: 740, duration: 0.12, peak: 0.09, gap: 0.055 },
      ]);
    },

    place() {
      playTone({ freq: 360, freqEnd: 520, duration: 0.055, peak: 0.09, type: 'sine' });
    },

    flip(kind) {
      if (kind === 'correct') SoundEffects.correct();
      else if (kind === 'present') SoundEffects.present();
      else if (kind === 'absent') SoundEffects.absent();
      else playTone({ freq: 440, duration: 0.045, peak: 0.06, type: 'triangle' });
    },

    correct() {
      playTone({ freq: 659, duration: 0.09, peak: 0.1 });
      playTone({ freq: 880, duration: 0.11, peak: 0.09, delay: 0.055 });
    },

    present() {
      playTone({ freq: 554, duration: 0.1, peak: 0.08, type: 'triangle' });
    },

    absent() {
      playTone({ freq: 240, duration: 0.11, peak: 0.06, type: 'sine' });
    },

    wrong() {
      playTone({ freq: 200, duration: 0.1, peak: 0.08, type: 'triangle' });
      playTone({ freq: 140, duration: 0.14, peak: 0.07, type: 'sine', delay: 0.07 });
    },

    invalid() {
      playTone({ freq: 160, duration: 0.07, peak: 0.09, type: 'sawtooth' });
      playTone({ freq: 120, duration: 0.1, peak: 0.07, type: 'sawtooth', delay: 0.065 });
    },

    win() {
      playSequence([
        { freq: 523, duration: 0.12, peak: 0.11 },
        { freq: 659, duration: 0.12, peak: 0.11 },
        { freq: 784, duration: 0.12, peak: 0.11 },
        { freq: 1047, duration: 0.2, peak: 0.12 },
      ]);
    },

    /** 1v1 battle win — Korean victory bell */
    battleVictory() {
      playSample('battleVictory');
    },

    /** 1v1 battle loss */
    battleDefeat() {
      playSample('battleDefeat');
    },

    /** 1v1 battle draw */
    battleDraw() {
      playSample('battleDraw');
    },

    stun() {
      playTone({ freq: 110, duration: 0.2, peak: 0.12, type: 'sawtooth' });
      playTone({ freq: 80, duration: 0.35, peak: 0.1, type: 'square', delay: 0.08 });
    },

    roundAdvance() {
      playTone({ freq: 520, freqEnd: 680, duration: 0.08, peak: 0.07, type: 'sine' });
    },

    dockFlip() {
      playSequence([
        { freq: 320, duration: 0.04, peak: 0.05, type: 'triangle' },
        { freq: 400, duration: 0.05, peak: 0.055, gap: 0.03 },
        { freq: 480, duration: 0.06, peak: 0.06, gap: 0.03 },
      ]);
    },

    countdownTick(step) {
      const freqs = { 3: 392, 2: 494, 1: 622 };
      const freq = freqs[step] || 520;
      playTone({ freq, duration: 0.07, peak: 0.11, type: 'sine' });
    },

    countdownGo() {
      playSequence([
        { freq: 523, duration: 0.07, peak: 0.12, type: 'sine' },
        { freq: 659, duration: 0.08, peak: 0.13, gap: 0.045 },
        { freq: 988, duration: 0.14, peak: 0.14, gap: 0.05 },
      ]);
    },

    lose() {
      playTone({ freq: 392, duration: 0.18, peak: 0.09 });
      playTone({ freq: 262, duration: 0.28, peak: 0.08, delay: 0.16 });
    },
  };

  global.addEventListener('pointerdown', unlock, { passive: true });
  global.addEventListener('keydown', unlock, { passive: true });
  global.addEventListener('touchstart', unlock, { passive: true });

  global.SoundEffects = SoundEffects;
})(typeof window !== 'undefined' ? window : globalThis);
