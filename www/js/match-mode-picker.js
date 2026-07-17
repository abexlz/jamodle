/**
 * Korean Match length picker — shown before practice mode starts.
 */
(function (global) {
  'use strict';

  const MW = () => global.MatchWords;

  function parseLengthFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('game') === 'multi') return 'multi';
    if (params.get('length') === 'multi' || params.get('mode') === 'multi') return 'multi';
    const fromLength = params.get('length');
    if (fromLength) return MW()?.normalizeWordLength?.(fromLength);
    const legacy = params.get('mode');
    if (legacy) return MW()?.normalizeWordLength?.(legacy);
    return null;
  }

  function isMultiFindMode(selection) {
    return selection === 'multi';
  }

  function isDailyMode() {
    return global.MatchDaily?.isDailyModeFromUrl?.() ?? false;
  }

  function hideOverlay(overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function show(onSelect) {
    const overlay = document.getElementById('match-mode-overlay');
    if (!overlay) {
      onSelect(MW()?.normalizeWordLength?.(4) || 4);
      return;
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    let settled = false;

    const finish = (length) => {
      if (settled) return;
      settled = true;
      hideOverlay(overlay);
      buttons.forEach((btn) => btn.removeEventListener('click', onPick));
      overlay.removeEventListener('click', onOverlayClick);
      onSelect(length);
    };

    const onPick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      if (btn.disabled) return;
      if (btn.dataset.gameMode === 'multi') {
        finish('multi');
        return;
      }
      const length = MW()?.normalizeWordLength?.(btn.dataset.wordLength) || 4;
      finish(length);
    };

    const onOverlayClick = (e) => {
      const multiBtn = e.target.closest('[data-game-mode="multi"]');
      if (multiBtn && !multiBtn.disabled) {
        e.preventDefault();
        finish('multi');
        return;
      }
      const btn = e.target.closest('[data-word-length]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      const length = MW()?.normalizeWordLength?.(btn.dataset.wordLength) || 4;
      finish(length);
    };

    const buttons = overlay.querySelectorAll('[data-word-length], [data-game-mode="multi"]');
    buttons.forEach((btn) => btn.addEventListener('click', onPick));

    overlay.addEventListener('click', onOverlayClick);

    const cancel = overlay.querySelector('#match-mode-cancel');
    cancel?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'index.html';
    }, { once: true });

    global.I18n?.applyToDocument?.(overlay);
  }

  function dailyWordLength() {
    return global.MatchDaily?.DAILY_WORD_LENGTH ?? 2;
  }

  function resolveMode(onReady) {
    if (isDailyMode()) {
      onReady(MW()?.normalizeWordLength?.(dailyWordLength()) || dailyWordLength());
      return;
    }
    const fromUrl = parseLengthFromUrl();
    if (fromUrl) {
      onReady(fromUrl);
      return;
    }
    show(onReady);
  }

  global.MatchModePicker = {
    show,
    resolveMode,
    parseLengthFromUrl,
    parseModeFromUrl: parseLengthFromUrl,
    isMultiFindMode,
  };
})(typeof window !== 'undefined' ? window : globalThis);
