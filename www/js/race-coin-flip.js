/**
 * Coin flip overlay before each Jamo 1v1 round.
 * Uses a Korean 500-won coin: front (crane) = player 1, back (500) = player 2.
 * CSS class names still use blue/red for the two faces.
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
    const isPlayer1 = starterUid === matchData?.player1Uid;
    const winnerSide = isPlayer1 ? 'blue' : 'red';
    const title = global.I18n?.t?.('matchTurn.coinFlipTitle') || 'Coin flip';
    const startsLabel = iGoFirst
      ? (global.I18n?.t?.('matchTurn.coinFlipYouStart') || 'You go first!')
      : (global.I18n?.t?.('matchTurn.coinFlipStarts', { name: name || '?' })
        || `${name || 'Opponent'} goes first`);
    const p1Name = matchData?.player1Name || 'P1';
    const p2Name = matchData?.player2Name || 'P2';

    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="race-coin-flip-inner">
        <p class="race-coin-flip-title">${escapeHtml(title)}</p>
        <div class="race-coin-flip-legend" aria-hidden="true">
          <span class="race-coin-flip-legend-item race-coin-flip-legend-item--blue">${escapeHtml(p1Name)}</span>
          <span class="race-coin-flip-legend-item race-coin-flip-legend-item--red">${escapeHtml(p2Name)}</span>
        </div>
        <div class="race-coin-flip-coin race-coin-flip-coin--land-${winnerSide}" aria-hidden="true">
          <div class="race-coin-flip-coin-inner">
            <div class="race-coin-face race-coin-face--blue"></div>
            <div class="race-coin-face race-coin-face--red"></div>
          </div>
        </div>
        <p class="race-coin-flip-result hidden" aria-live="polite"></p>
      </div>
    `;

    const coinEl = el.querySelector('.race-coin-flip-coin');
    const resultEl = el.querySelector('.race-coin-flip-result');
    // Force reflow so the spin animation always restarts.
    void coinEl?.offsetWidth;
    coinEl?.classList.add('race-coin-flip-coin--spin');

    global.SoundEffects?.flip?.('coin');

    state._coinFlipTimer = setTimeout(() => {
      coinEl?.classList.remove('race-coin-flip-coin--spin');
      coinEl?.classList.add('race-coin-flip-coin--settled');
      if (resultEl) {
        resultEl.textContent = startsLabel;
        resultEl.classList.remove('hidden');
        resultEl.classList.add(`race-coin-flip-result--${winnerSide}`);
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
