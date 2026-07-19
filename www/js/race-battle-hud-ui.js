/**
 * Shared 1v1 battle HUD — opponent left / you right (Related Words race layout).
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  const seriesCache = new Map();

  function shellMarkup(options = {}) {
    const { showScores = false, emoteSlot = false } = options;
    const hudExtra = showScores ? '' : ' rw-race-battle-hud--no-scores';

    const oppScore = showScores ? `
      <div id="race-opp-score-stack" class="rw-race-score-stack">
        <div class="rw-race-score-flame" aria-hidden="true"></div>
        <div class="rw-race-score-box">
          <span id="race-opp-word-count-num" class="rw-race-score-num">0</span>
        </div>
      </div>` : '';

    const myScore = showScores ? `
      <div id="race-my-score-stack" class="rw-race-score-stack">
        <div class="rw-race-score-flame" aria-hidden="true"></div>
        <div class="rw-race-score-box">
          <span id="race-my-word-count-num" class="rw-race-score-num">0</span>
        </div>
      </div>` : '';

    const emote = emoteSlot
      ? '<div id="race-opp-emote" class="race-opp-emote hidden" aria-live="polite"></div>'
      : '';

    return `
      <div id="race-battle-hud" class="rw-race-battle-hud${hudExtra} hidden" aria-live="polite">
        <div class="rw-race-battle-mid">
          <div class="rw-race-battle-cluster">
            <div class="rw-race-profile-stack">
              <div id="race-opp-card" class="rw-race-battle-card"></div>
              <p id="race-opp-name" class="rw-race-battle-name"></p>
            </div>
            ${oppScore}
          </div>
          <div class="rw-race-battle-cluster">
            ${myScore}
            <div class="rw-race-profile-stack">
              <div id="race-my-card" class="rw-race-battle-card"></div>
              <p id="race-my-name" class="rw-race-battle-name rw-race-battle-name--you"></p>
            </div>
          </div>
        </div>
        <div class="rw-race-battle-bottom">
          <div class="rw-race-battle-center-meta">
            <div id="race-series-score" class="race-series-score hidden" aria-hidden="true">
              <span id="race-series-opp-wins" class="race-series-wins race-series-wins--opp">0</span>
              <span class="race-series-sep" aria-hidden="true">:</span>
              <span id="race-series-my-wins" class="race-series-wins race-series-wins--you">0</span>
            </div>
            <span id="race-hud-center-title" class="rw-race-chain-title"></span>
            <span id="race-hud-center-sub" class="rw-race-chain-progress"></span>
          </div>
        </div>
      </div>
      ${emote}
    `;
  }

  function bindEls(root, options = {}) {
    const { showScores = false } = options;
    const els = {
      battleHud: root.querySelector('#race-battle-hud'),
      oppCard: root.querySelector('#race-opp-card'),
      oppName: root.querySelector('#race-opp-name'),
      myCard: root.querySelector('#race-my-card'),
      myName: root.querySelector('#race-my-name'),
      seriesScore: root.querySelector('#race-series-score'),
      seriesOppWins: root.querySelector('#race-series-opp-wins'),
      seriesMyWins: root.querySelector('#race-series-my-wins'),
      centerTitle: root.querySelector('#race-hud-center-title'),
      centerSub: root.querySelector('#race-hud-center-sub'),
      oppEmote: root.querySelector('#race-opp-emote'),
    };
    if (showScores) {
      els.oppScoreStack = root.querySelector('#race-opp-score-stack');
      els.oppWordCountNum = root.querySelector('#race-opp-word-count-num');
      els.myScoreStack = root.querySelector('#race-my-score-stack');
      els.myWordCountNum = root.querySelector('#race-my-word-count-num');
    }
    return els;
  }

  function loadBattleCard(cardEl, uid, who, nameEl) {
    if (!cardEl) return;

    if (who === 'my') {
      const local = global.MatchEmotes?.buildLocalPlayerSummary?.();
      if (local) {
        global.MatchEmotes?.renderOpponentBattleCard?.(cardEl, local);
        if (nameEl && local.name) nameEl.textContent = local.name;
      }
    }

    if (!uid || cardEl.dataset.loadedUid === uid) return;
    cardEl.dataset.loadedUid = uid;
    global.MatchEmotes?.fetchOpponentSummary?.(uid).then((summary) => {
      if (!summary || !cardEl) return;
      global.MatchEmotes.renderOpponentBattleCard(cardEl, summary);
      if (nameEl && summary.name) nameEl.textContent = summary.name;
    });
  }

  function hideSeriesScore(els) {
    if (!els?.seriesScore) return;
    els.seriesScore.classList.add('hidden');
    els.seriesScore.setAttribute('aria-hidden', 'true');
  }

  async function updateSeriesScore(els, matchId, myUid, oppUid, matchData) {
    if (!els?.seriesScore || !matchData?.rematchFrom || !matchId || !myUid || !oppUid) {
      hideSeriesScore(els);
      return;
    }

    const cacheKey = `${matchId}:${myUid}`;
    if (!seriesCache.has(cacheKey)) {
      seriesCache.set(cacheKey, RS().getRematchSeriesScore(matchId, myUid, oppUid));
    }

    const score = await seriesCache.get(cacheKey);
    if (!score?.isRematch) {
      hideSeriesScore(els);
      return;
    }

    if (els.seriesOppWins) els.seriesOppWins.textContent = String(score.oppWins);
    if (els.seriesMyWins) els.seriesMyWins.textContent = String(score.myWins);
    els.seriesScore.classList.remove('hidden');
    els.seriesScore.setAttribute('aria-hidden', 'false');
    const label = global.I18n?.t?.('race.seriesScore', { my: score.myWins, opp: score.oppWins })
      || `Series ${score.oppWins} to ${score.myWins}`;
    els.seriesScore.setAttribute('aria-label', label);
  }

  function updateBattleHud(data, { els, myUid, matchId, onOpp } = {}) {
    if (!els?.battleHud || data?.status !== 'active') {
      els?.battleHud?.classList.add('hidden');
      document.body.classList.remove('rw-race-active');
      return null;
    }

    const opp = RS().getOpponent(data, myUid);
    if (!opp) return null;

    const isP1 = RS().amPlayer1(data, myUid);
    const myName = isP1 ? data.player1Name : data.player2Name;

    els.battleHud.classList.remove('hidden');
    document.body.classList.add('rw-race-active');

    if (els.oppName) els.oppName.textContent = opp.name || '';
    if (els.myName) els.myName.textContent = myName || '';

    loadBattleCard(els.oppCard, opp.uid, 'opp', els.oppName);
    loadBattleCard(els.myCard, myUid, 'my', els.myName);

    void updateSeriesScore(els, matchId, myUid, opp.uid, data);
    onOpp?.(opp);

    return opp;
  }

  function clearSeriesCache(matchId) {
    if (!matchId) return;
    [...seriesCache.keys()].forEach((key) => {
      if (key.startsWith(`${matchId}:`)) seriesCache.delete(key);
    });
  }

  global.RaceBattleHudUI = {
    shellMarkup,
    bindEls,
    loadBattleCard,
    updateBattleHud,
    updateSeriesScore,
    clearSeriesCache,
  };
})(typeof window !== 'undefined' ? window : globalThis);
