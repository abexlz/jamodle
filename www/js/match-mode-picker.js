/**
 * Korean Match length picker — shown before practice mode starts.
 */
(function (global) {
  'use strict';

  const MW = () => global.MatchWords;

  /** Minimum coins required to unlock longer word lengths (balance gate, not a spend). */
  const LENGTH_COIN_REQUIREMENTS = {
    5: 1000,
    6: 2000,
  };

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? key;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPlayerCoins() {
    const summaryCoins = parseInt(global.ProfileService?.getProfileSummary?.()?.coins, 10);
    if (Number.isFinite(summaryCoins)) return Math.max(0, summaryCoins);
    const profileCoins = parseInt(global.ProfileService?.loadProfile?.()?.coins, 10);
    return Math.max(0, profileCoins || 0);
  }

  function coinRequirementForLength(length) {
    const n = Number(length);
    return LENGTH_COIN_REQUIREMENTS[n] || 0;
  }

  function canSelectLength(length) {
    const required = coinRequirementForLength(length);
    if (!required) return true;
    return getPlayerCoins() >= required;
  }

  function dismissCoinNotice() {
    document.getElementById('match-mode-coin-notice')?.remove();
  }

  function showCoinRequirementNotice(required) {
    dismissCoinNotice();

    const title = t('match.modePicker.needCoinsTitle');
    const body = t('match.modePicker.needCoinsBody', { count: required });
    const okLabel = t('match.modePicker.needCoinsOk');

    const overlay = document.createElement('div');
    overlay.id = 'match-mode-coin-notice';
    overlay.className = 'match-mode-coin-notice';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'match-mode-coin-notice-title');
    overlay.innerHTML = `
      <div class="match-mode-coin-notice-card">
        <h3 id="match-mode-coin-notice-title">${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
        <button type="button" class="match-mode-coin-notice-ok" id="match-mode-coin-notice-ok">${escapeHtml(okLabel)}</button>
      </div>
    `;

    const close = () => dismissCoinNotice();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#match-mode-coin-notice-ok')?.addEventListener('click', close);
    document.body.appendChild(overlay);
    overlay.querySelector('#match-mode-coin-notice-ok')?.focus?.();
  }

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
      dismissCoinNotice();
      hideOverlay(overlay);
      buttons.forEach((btn) => btn.removeEventListener('click', onPick));
      overlay.removeEventListener('click', onOverlayClick);
      onSelect(length);
    };

    const tryPickLength = (rawLength) => {
      const length = MW()?.normalizeWordLength?.(rawLength) || 4;
      const required = coinRequirementForLength(length);
      if (required && !canSelectLength(length)) {
        showCoinRequirementNotice(required);
        return;
      }
      finish(length);
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
      tryPickLength(btn.dataset.wordLength);
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
      tryPickLength(btn.dataset.wordLength);
    };

    const buttons = overlay.querySelectorAll('[data-word-length], [data-game-mode="multi"]');
    buttons.forEach((btn) => btn.addEventListener('click', onPick));

    overlay.addEventListener('click', onOverlayClick);

    const cancel = overlay.querySelector('#match-mode-cancel');
    cancel?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissCoinNotice();
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
      if (fromUrl !== 'multi' && !canSelectLength(fromUrl)) {
        // Drop locked length from the URL and show the picker instead.
        const params = new URLSearchParams(window.location.search);
        params.delete('length');
        params.delete('mode');
        const qs = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
        show(onReady);
        const required = coinRequirementForLength(fromUrl);
        if (required) showCoinRequirementNotice(required);
        return;
      }
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
    coinRequirementForLength,
    canSelectLength,
  };
})(typeof window !== 'undefined' ? window : globalThis);
