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

  function normalizeWord(text) {
    return global.KoreanTTS?.normalizeWord?.(text)
      || (text ? String(text).trim().split('·')[0].trim() : '');
  }

  function isMeaningAnchor(el) {
    if (!el) return false;
    return el.classList.contains('results-word-meaning')
      || el.classList.contains('turn-answer-meaning')
      || el.classList.contains('race-results-answer-meaning');
  }

  function unwrapMeaningSpeakerRows(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.answer-tts-row--meaning').forEach((row) => {
      const meaning = row.querySelector(
        '.turn-answer-meaning, .results-word-meaning, .race-results-answer-meaning',
      );
      const parent = row.parentNode;
      if (!parent) {
        row.remove();
        return;
      }
      if (meaning) parent.insertBefore(meaning, row);
      row.remove();
    });
  }

  function pickSpeakerAnchor({ wordEl = null, tilesEl = null } = {}) {
    if (tilesEl?.isConnected) return tilesEl;
    if (wordEl?.isConnected) return wordEl;
    return null;
  }

  function primeSpeech() {
    if (primed) return;
    primed = true;
    global.KoreanTTS?.prime?.();
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
    global.KoreanTTS?.cancel?.();
  }

  function playWord(text, options = {}) {
    const word = normalizeWord(text);
    const repeats = Math.max(1, Number(options.repeats) || 1);
    if (!word || !pronunciationEnabled() || !global.KoreanTTS?.speak) {
      return Promise.resolve(false);
    }

    cancelPlayback();
    const session = activeSession;
    isPlaying = true;

    return global.KoreanTTS.speak(word, {
      repeats,
      gapMs: REPEAT_GAP_MS,
    }).then((ok) => {
      if (session === activeSession) isPlaying = false;
      return session === activeSession ? ok : false;
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

  function bindSpeakerButton(btn) {
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
      playWord(btn.dataset.speakWord, { repeats: 1 });
    });
  }

  function mountSpeakerAnchor(anchorEl, speakWord) {
    if (!anchorEl || !speakWord) return null;
    const parts = ensureSpeakerRow(anchorEl);
    if (parts?.btn) {
      parts.btn.dataset.speakWord = speakWord;
      bindSpeakerButton(parts.btn);
    }
    return parts;
  }

  function mountMeaningSpeaker() {
    /* Meaning rows no longer get a speaker button — word/tiles anchor only. */
  }

  function attachPopup({
    word,
    wordEl = null,
    tilesEl = null,
    autoplayRepeats = 2,
    autoplay = true,
    root = null,
  } = {}) {
    const speakWord = normalizeWord(word);
    if (!speakWord) return;

    unwrapMeaningSpeakerRows(root || wordEl?.parentElement || tilesEl?.parentElement || document);

    const anchorEl = pickSpeakerAnchor({ wordEl, tilesEl });
    if (anchorEl) mountSpeakerAnchor(anchorEl, speakWord);

    const repeats = Number(autoplayRepeats);
    if (autoplay && repeats > 0 && shouldAutoplayOnReveal()) {
      playWord(speakWord, { repeats });
    }
  }

  function setupResultsAnswer(root, word, options = {}) {
    const answerBlock = root?.querySelector?.('.race-results-answer');
    if (!answerBlock || !word) return;
    attachPopup({
      word,
      tilesEl: answerBlock.querySelector('.race-results-answer-tiles'),
      autoplay: options.autoplay !== false,
      autoplayRepeats: options.autoplayRepeats ?? 2,
      root: answerBlock,
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
