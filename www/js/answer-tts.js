/**
 * Korean answer pronunciation (TTS) for match result popups.
 */
(function (global) {
  'use strict';

  const GESTURE_TTL_MS = 10000;
  const CLICK_DEBOUNCE_MS = 450;
  const REPEAT_GAP_MS = 200;

  let lastGestureAt = 0;
  let lastClickAt = 0;
  let isPlaying = false;
  let activeSession = 0;
  let primed = false;
  let solveAutoplayArmed = false;
  let solveAutoplayUsed = false;

  const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>'
    + '</svg>';

  function t(key, vars) {
    return global.I18n?.t?.(key, vars) ?? '';
  }

  function pronunciationEnabled() {
    return global.UserPreferences?.get?.().pronunciation !== false;
  }

  function showSpeakerButton() {
    return global.UserPreferences?.shouldShowPronunciationButton?.() !== false;
  }

  function speakVolume() {
    const vol = Number(global.UserPreferences?.get?.().volume);
    if (!Number.isFinite(vol)) return 0.85;
    return Math.max(0, Math.min(1, vol));
  }

  function normalizeWord(text) {
    if (!text) return '';
    const raw = String(text).trim();
    if (!raw) return '';
    const parts = raw.split('·').map((w) => w.trim()).filter(Boolean);
    return parts[0] || raw;
  }

  function isMeaningAnchor(el) {
    if (!el) return false;
    return el.classList.contains('results-word-meaning')
      || el.classList.contains('turn-answer-meaning')
      || el.classList.contains('race-results-answer-meaning');
  }

  function isVisibleMeaning(el) {
    if (!el || !el.isConnected) return false;
    if (el.classList.contains('hidden') || el.hidden) return false;
    return !!String(el.textContent || '').trim();
  }

  function primeSpeech() {
    if (!global.speechSynthesis || primed) return;
    primed = true;
    try {
      global.speechSynthesis.resume?.();
      global.speechSynthesis.getVoices();
    } catch (_) { /* ignore */ }
  }

  function noteUserGesture() {
    lastGestureAt = Date.now();
    primeSpeech();
  }

  /** Arm autoplay from the Check click that solved the puzzle (survives flip awaits). */
  function armSolveAutoplay() {
    solveAutoplayArmed = true;
    solveAutoplayUsed = false;
    noteUserGesture();
  }

  function shouldAutoplayOnReveal() {
    if (!pronunciationEnabled() || solveAutoplayUsed) return false;
    if (solveAutoplayArmed) {
      solveAutoplayArmed = false;
      solveAutoplayUsed = true;
      return true;
    }
    if (Date.now() - lastGestureAt < GESTURE_TTL_MS) {
      solveAutoplayUsed = true;
      return true;
    }
    return false;
  }

  function cancelPlayback() {
    activeSession += 1;
    isPlaying = false;
    try {
      global.speechSynthesis?.cancel?.();
    } catch (_) { /* ignore */ }
  }

  function playWord(text, options = {}) {
    const word = normalizeWord(text);
    const repeats = Math.max(1, Number(options.repeats) || 1);
    if (!word || !global.speechSynthesis || !pronunciationEnabled()) {
      return Promise.resolve(false);
    }

    cancelPlayback();
    const session = activeSession;
    isPlaying = true;

    return new Promise((resolve) => {
      let remaining = repeats;

      const speakNext = () => {
        if (session !== activeSession) {
          isPlaying = false;
          resolve(false);
          return;
        }
        if (remaining <= 0) {
          isPlaying = false;
          resolve(true);
          return;
        }
        remaining -= 1;

        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'ko-KR';
        utterance.rate = 0.85;
        utterance.volume = speakVolume();

        const finish = (ok) => {
          if (session !== activeSession) return;
          if (remaining > 0) {
            setTimeout(speakNext, REPEAT_GAP_MS);
            return;
          }
          isPlaying = false;
          resolve(ok);
        };

        utterance.onend = () => finish(true);
        utterance.onerror = () => finish(false);

        try {
          global.speechSynthesis.speak(utterance);
        } catch (_) {
          finish(false);
        }
      };

      speakNext();
    });
  }

  function createSpeakerButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'answer-speak-btn app-pressable';
    btn.innerHTML = SPEAKER_SVG;
    btn.setAttribute('aria-label', t('match.answerSpeak') || 'Hear pronunciation');
    return btn;
  }

  function ensureSpeakerRow(anchorEl) {
    if (!anchorEl) return null;

    let row = anchorEl.closest('.answer-tts-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'answer-tts-row';
      if (isMeaningAnchor(anchorEl)) {
        row.classList.add('answer-tts-row--meaning');
      }
      const parent = anchorEl.parentNode;
      if (!parent) return null;
      parent.insertBefore(row, anchorEl);
      row.appendChild(anchorEl);
    }

    let btn = row.querySelector(':scope > .answer-speak-btn');
    if (!btn && showSpeakerButton()) {
      btn = createSpeakerButton();
      row.appendChild(btn);
    }
    if (btn && !showSpeakerButton()) {
      btn.remove();
      btn = null;
    }

    return { row, btn, anchorEl };
  }

  function bindSpeakerButton(btn, getWord) {
    if (!btn || btn.dataset.answerTtsBound === '1') return;
    btn.dataset.answerTtsBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastClickAt < CLICK_DEBOUNCE_MS) return;
      if (isPlaying) return;
      lastClickAt = now;
      noteUserGesture();
      const word = typeof getWord === 'function' ? getWord() : getWord;
      playWord(word, { repeats: 1 });
    });
  }

  function mountSpeakerAnchor(anchorEl, speakWord) {
    if (!anchorEl || !speakWord) return null;
    const parts = ensureSpeakerRow(anchorEl);
    if (parts?.btn) {
      bindSpeakerButton(parts.btn, () => speakWord);
    }
    return parts;
  }

  function mountMeaningSpeaker(meaningEl, word) {
    const speakWord = normalizeWord(word);
    if (!speakWord || !isVisibleMeaning(meaningEl)) return;
    mountSpeakerAnchor(meaningEl, speakWord);
  }

  function attachPopup({
    word,
    wordEl = null,
    meaningEl = null,
    tilesEl = null,
    autoplayRepeats = 2,
    autoplay = true,
  } = {}) {
    const speakWord = normalizeWord(word);
    if (!speakWord) return;

    if (wordEl) mountSpeakerAnchor(wordEl, speakWord);
    if (tilesEl) mountSpeakerAnchor(tilesEl, speakWord);
    if (meaningEl && isVisibleMeaning(meaningEl)) {
      mountSpeakerAnchor(meaningEl, speakWord);
    }

    const repeats = Number(autoplayRepeats);
    if (autoplay && repeats > 0 && shouldAutoplayOnReveal()) {
      playWord(speakWord, { repeats });
    }
  }

  function setupResultsAnswer(root, word) {
    const answerBlock = root?.querySelector?.('.race-results-answer');
    if (!answerBlock || !word) return;
    attachPopup({
      word,
      tilesEl: answerBlock.querySelector('.race-results-answer-tiles'),
      meaningEl: answerBlock.querySelector('.race-results-answer-meaning'),
      autoplayRepeats: 2,
    });
  }

  /** @deprecated use attachPopup */
  function reveal(wordEl, word, options = {}) {
    attachPopup({
      word,
      wordEl,
      autoplayRepeats: options.autoplayRepeats ?? 2,
      autoplay: options.autoplay !== false,
    });
  }

  function installGestureTracking() {
    if (installGestureTracking.installed) return;
    installGestureTracking.installed = true;
    const mark = () => noteUserGesture();
    document.addEventListener('pointerdown', mark, { passive: true, capture: true });
    document.addEventListener('keydown', mark, { passive: true, capture: true });
  }

  installGestureTracking();

  global.AnswerTTS = {
    noteUserGesture,
    armSolveAutoplay,
    primeSpeech,
    playWord,
    cancel: cancelPlayback,
    attachPopup,
    mountMeaningSpeaker,
    mountSpeakerAnchor,
    reveal,
    setupResultsAnswer,
    normalizeWord,
  };
})(typeof window !== 'undefined' ? window : globalThis);
