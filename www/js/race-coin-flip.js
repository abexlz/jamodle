/**
 * Coin flip overlay before each Jamo 1v1 round.
 */
(function (global) {
  'use strict';

  const FLIP_MS = 1800;
  const REVEAL_MS = 1400;

  function starterName(data, starterUid) {
    if (!data || !starterUid) return '';
    if (starterUid === data.player1Uid) return data.player1Name || '';
    if (starterUid === data.player2Uid) return data.player2Name || '';
    return '';
  }

  function clearCoinFlipTimers(state) {
    if (state._coinFlipTimer) {
      clearTimeout(state._coinFlipTimer);
      state._coinFlipTimer = null;
    }
  }

  /**
   * Show a short coin flip, then reveal who goes first.
   * Re-entrant per roundKey.
   */
  function runCoinFlip(state, {
    el,
    roundKey,
    starterUid,
    matchData,
    myUid,
    onDone,
  }) {
    if (!el) {
      onDone?.();
      return;
    }
    if (state._coinFlipDoneKey === roundKey) {
      onDone?.();
      return;
    }

    clearCoinFlipTimers(state);
    const name = starterName(matchData, starterUid);
    const iGoFirst = starterUid === myUid;
    const title = global.I18n?.t?.('matchTurn.coinFlipTitle') || 'Coin flip';
    const startsLabel = iGoFirst
      ? (global.I18n?.t?.('matchTurn.coinFlipYouStart') || 'You go first!')
      : (global.I18n?.t?.('matchTurn.coinFlipStarts', { name: name || '?' })
        || `${name || 'Opponent'} goes first`);

    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="race-coin-flip-inner">
        <p class="race-coin-flip-title">${escapeHtml(title)}</p>
        <div class="race-coin-flip-coin" aria-hidden="true">🪙</div>
        <p class="race-coin-flip-result hidden" aria-live="polite"></p>
      </div>
    `;

    const coinEl = el.querySelector('.race-coin-flip-coin');
    const resultEl = el.querySelector('.race-coin-flip-result');
    coinEl?.classList.add('race-coin-flip-coin--spin');

    global.SoundEffects?.flip?.('coin');

    state._coinFlipTimer = setTimeout(() => {
      coinEl?.classList.remove('race-coin-flip-coin--spin');
      if (resultEl) {
        resultEl.textContent = startsLabel;
        resultEl.classList.remove('hidden');
      }
      state._coinFlipTimer = setTimeout(() => {
        state._coinFlipDoneKey = roundKey;
        el.classList.add('hidden');
        el.innerHTML = '';
        state._coinFlipTimer = null;
        onDone?.();
      }, REVEAL_MS);
    }, FLIP_MS);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.RaceCoinFlip = {
    runCoinFlip,
    clearCoinFlipTimers,
  };
})(typeof window !== 'undefined' ? window : globalThis);
