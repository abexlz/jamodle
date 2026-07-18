/**
 * Related Words 1v1 race — same chain, first to 25 words wins.
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  const RC = () => global.RaceCountdown;
  const COUNTDOWN_SEC = 3;
  const countdownTotalMs = () => RC()?.countdownTotalMs?.(COUNTDOWN_SEC) ?? (COUNTDOWN_SEC + 1) * 1000;

  function rwLeftStorageKey(matchId, uid) {
    return `jamodeul-rw-race-left-${matchId}-${uid}`;
  }

  function rt(key, vars) {
    return global.I18n?.t('relatedWordsRace.' + key, vars) ?? '';
  }

  function ct(key) {
    return global.I18n?.t('common.' + key) ?? '';
  }

  function chainLabel(data) {
    const chain = global.RelatedWordsChains?.getChain?.(data?.chainId);
    if (!chain) return rt('modeLabel');
    return global.RelatedWordsChains?.chainLabel?.(chain)
      || (chain.titleKey && global.I18n?.t(chain.titleKey))
      || rt('modeLabel');
  }

  function formatTime(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
    return rt('timeSec', { s });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  class RelatedWordsRaceApp {
    constructor(rootEl) {
      this.root = rootEl;
      this.matchId = new URLSearchParams(global.location.search).get('id');
      this.myUid = null;
      this.matchUnsub = null;
      this.countdownTimer = null;
      this.game = null;
      this.matchData = null;
      this.phase = 'loading';
      this.countdownDone = false;
      this.gameStarted = false;
      this.isP1 = false;
      this._localeOff = null;
      this._resultsRendered = false;
      this._activeSeenAtMs = null;
      this._leftMatch = false;
      this._sharedRoundId = 0;
      this._prevOppScore = 0;
      this._prevMyScore = 0;
      this._scoreFlyHold = { my: false, opp: false };
      this._pendingScores = { my: null, opp: null };
      this._lastOppFlyRoundId = -1;
      this._prevOppWrong = 0;
      this._rejoinResetting = false;
      this._rejoinHandled = false;
      this._matchEpoch = null;
    }

    async init() {
      this._localeOff = global.I18n?.onChange?.(() => this.onLocaleChange());

      if (!this.matchId) {
        this.renderError(rt('noMatchId'));
        return;
      }

      await global.FirebaseSocial?.whenAuthReady?.();
      this.myUid = global.FirebaseSocial?.getCurrentUid?.();
      if (!this.myUid) {
        this.renderError(rt('loginRequired'));
        return;
      }
      this.clearRaceLeftIfReload();
      global.FirebaseSocial?.syncLocalPublicProfile?.().catch(() => {});

      document.title = rt('pageTitle');
      this.renderShell();
      this.renderMain(`
        <div class="race-panel">
          <p class="race-panel-title">${escapeHtml(rt('loading'))}</p>
        </div>
      `);
      this.matchUnsub = RS().subscribeMatch(
        this.matchId,
        (data) => this.onMatchUpdate(data),
        (err) => {
          console.error('[RelatedWordsRaceApp]', err);
          const detail = err?.code === 'permission-denied'
            ? rt('permissionDenied')
            : rt('loadFailed');
          this.renderError(detail);
        }
      );
    }

    destroy() {
      global.RaceRematchUI?.teardown?.();
      const data = this.matchData;
      if (!this._leftMatch && this.matchId && this.myUid && data
        && (data.status === 'active' || data.status === 'ready')) {
        this.markRaceLeft();
      }
      if (this._localeOff) {
        this._localeOff();
        this._localeOff = null;
      }
      if (this.matchUnsub) {
        this.matchUnsub();
        this.matchUnsub = null;
      }
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      if (this._countdownFallbackTimer) {
        clearTimeout(this._countdownFallbackTimer);
        this._countdownFallbackTimer = null;
      }
      if (this.game) {
        this.game.destroy();
        this.game = null;
      }
    }

    onLocaleChange() {
      document.title = rt('pageTitle');
      if (this.matchData?.status === 'done') this._resultsRendered = false;
      if (this.matchData) {
        this.onMatchUpdate(this.matchData);
      } else if (this.els?.main) {
        const back = this.root.querySelector('.race-back');
        if (back) back.textContent = rt('backProfile');
        const h1 = this.root.querySelector('.race-header h1');
        if (h1) h1.textContent = rt('title');
      }
    }

    renderShell() {
      this.root.innerHTML = `
        <header class="race-header">
          <a class="race-back" href="index.html">${escapeHtml(rt('backProfile'))}</a>
          <h1>${escapeHtml(rt('title'))}</h1>
          <a class="race-settings-link" href="settings.html" aria-label="${escapeHtml(global.I18n?.t('nav.settings') || 'Settings')}">⚙️</a>
        </header>
        <div id="race-battle-hud" class="rw-race-battle-hud hidden" aria-live="polite">
          <div class="rw-race-battle-mid">
            <div class="rw-race-battle-cluster">
              <div class="rw-race-profile-stack">
                <div id="race-opp-card" class="rw-race-battle-card"></div>
              </div>
              <div id="race-opp-score-stack" class="rw-race-score-stack">
                <div class="rw-race-score-flame" aria-hidden="true"></div>
                <div class="rw-race-score-box">
                  <span id="race-opp-word-count-num" class="rw-race-score-num">0</span>
                </div>
              </div>
            </div>
            <div class="rw-race-battle-cluster">
              <div id="race-my-score-stack" class="rw-race-score-stack">
                <div class="rw-race-score-flame" aria-hidden="true"></div>
                <div class="rw-race-score-box">
                  <span id="race-my-word-count-num" class="rw-race-score-num">0</span>
                </div>
              </div>
              <div id="race-my-card" class="rw-race-battle-card"></div>
            </div>
          </div>
          <div class="rw-race-battle-bottom">
            <p id="race-opp-name" class="rw-race-battle-name"></p>
            <div class="rw-race-battle-center-meta">
              <div id="race-series-score" class="race-series-score hidden" aria-hidden="true">
                <span id="race-series-opp-wins" class="race-series-wins race-series-wins--opp">0</span>
                <span class="race-series-sep" aria-hidden="true">:</span>
                <span id="race-series-my-wins" class="race-series-wins race-series-wins--you">0</span>
              </div>
              <span id="rw-race-chain-title" class="rw-race-chain-title"></span>
              <span id="rw-race-chain-progress" class="rw-race-chain-progress"></span>
            </div>
            <p id="race-my-name" class="rw-race-battle-name rw-race-battle-name--you"></p>
          </div>
        </div>
        <div id="race-main" class="race-main"></div>
        <div id="race-countdown" class="race-countdown hidden" aria-live="assertive"></div>
      `;
      this.els = {
        battleHud: this.root.querySelector('#race-battle-hud'),
        oppCard: this.root.querySelector('#race-opp-card'),
        oppName: this.root.querySelector('#race-opp-name'),
        oppScoreStack: this.root.querySelector('#race-opp-score-stack'),
        oppWordCountNum: this.root.querySelector('#race-opp-word-count-num'),
        myCard: this.root.querySelector('#race-my-card'),
        myName: this.root.querySelector('#race-my-name'),
        myScoreStack: this.root.querySelector('#race-my-score-stack'),
        myWordCountNum: this.root.querySelector('#race-my-word-count-num'),
        main: this.root.querySelector('#race-main'),
        countdown: this.root.querySelector('#race-countdown'),
        seriesScore: this.root.querySelector('#race-series-score'),
        seriesOppWins: this.root.querySelector('#race-series-opp-wins'),
        seriesMyWins: this.root.querySelector('#race-series-my-wins'),
      };
      this.els.myWordCountNum = global.RwScoreOdometer?.mount(this.els.myWordCountNum) || this.els.myWordCountNum;
      this.els.oppWordCountNum = global.RwScoreOdometer?.mount(this.els.oppWordCountNum) || this.els.oppWordCountNum;
      this.wireLeaveHandlers();
    }

    wireLeaveHandlers() {
      this.root.querySelector('.race-back')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.leaveMatchAndGo(e.currentTarget.getAttribute('href') || 'index.html');
      });
    }

    leaveMatch() {
      if (this._leftMatch) return;
      const data = this.matchData;
      if (!this.matchId || !this.myUid || !data) return;
      if (data.status === 'done' || data.status === 'declined' || data.status === 'abandoned') return;
      this._leftMatch = true;
      if (data.status === 'active' || data.status === 'ready') {
        this.markRaceLeft();
        return;
      }
      RS().abandonMatch(this.matchId, this.myUid).catch(() => {});
    }

    markRaceLeft() {
      try {
        localStorage.setItem(rwLeftStorageKey(this.matchId, this.myUid), String(Date.now()));
      } catch { /* storage blocked */ }
    }

    clearRaceLeftIfReload() {
      try {
        const nav = global.performance?.getEntriesByType?.('navigation')?.[0];
        if (nav?.type === 'reload') {
          localStorage.removeItem(rwLeftStorageKey(this.matchId, this.myUid));
        }
      } catch { /* storage blocked */ }
    }

    wasRaceLeft() {
      try {
        return !!localStorage.getItem(rwLeftStorageKey(this.matchId, this.myUid));
      } catch {
        return false;
      }
    }

    getMatchEpoch(data) {
      const resetAt = data?.matchResetAt;
      let resetPart = '';
      if (resetAt?.toMillis) resetPart = String(resetAt.toMillis());
      else if (resetAt?.seconds != null) resetPart = String(resetAt.seconds);
      return `${data?.chainId || ''}:${resetPart}`;
    }

    syncMatchEpoch(data) {
      const epoch = this.getMatchEpoch(data);
      if (this._matchEpoch == null) {
        this._matchEpoch = epoch;
        return false;
      }
      if (epoch === this._matchEpoch) return false;
      this._matchEpoch = epoch;

      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      if (this._countdownFallbackTimer) {
        clearTimeout(this._countdownFallbackTimer);
        this._countdownFallbackTimer = null;
      }
      if (this.game) {
        this.game.destroy();
        this.game = null;
      }
      this.gameStarted = false;
      this.countdownDone = false;
      this._sharedRoundId = 0;
      this._activeSeenAtMs = null;
      this._prevOppScore = 0;
      this._prevMyScore = 0;
      this._prevOppWrong = 0;
      return true;
    }

    async leaveMatchAndGo(href) {
      global.RaceRematchUI?.teardown?.();
      if (!this._leftMatch) {
        this._leftMatch = true;
        const data = this.matchData;
        if (this.matchId && this.myUid && data
          && (data.status === 'active' || data.status === 'ready')) {
          this.markRaceLeft();
        } else if (this.matchId && this.myUid) {
          await RS().abandonMatch(this.matchId, this.myUid).catch(() => {});
        }
      }
      global.location.href = href;
    }

    async maybeResetAfterRejoin(data) {
      if (this._rejoinHandled || this._rejoinResetting || !data || !this.myUid) return false;
      if (data.status !== 'active' && data.status !== 'ready') return false;

      if (!this.wasRaceLeft()) return false;

      this._rejoinHandled = true;
      this._rejoinResetting = true;
      try {
        localStorage.removeItem(rwLeftStorageKey(this.matchId, this.myUid));
      } catch { /* storage blocked */ }

      if (this.game) {
        this.game.destroy();
        this.game = null;
      }
      this.gameStarted = false;
      this.countdownDone = false;
      this._sharedRoundId = 0;
      this._activeSeenAtMs = null;
      this._prevOppScore = 0;
      this._prevMyScore = 0;
      this._prevOppWrong = 0;
      this._resultsRendered = false;

      await RS().resetRelatedWordsMatch(this.matchId, this.myUid).catch(() => {});
      this._rejoinResetting = false;
      return true;
    }

    mountRematchUi() {
      global.RaceRematchUI?.mount?.({
        root: this.els.main,
        matchId: this.matchId,
        myUid: this.myUid,
        getMatchData: () => this.matchData,
        t: rt,
        getMatchPageUrl: (id) => RS().getMatchPageUrl(id, { gameType: RS().GAME_TYPES.relatedWords }),
        createRematch: (oppUid, _data, rematchFrom) => RS().createRematchMatch(oppUid, {
          gameType: RS().GAME_TYPES.relatedWords,
        }, rematchFrom),
      });
    }

    renderError(msg) {
      this.root.innerHTML = `
        <div class="race-panel">
          <p class="race-panel-msg">${escapeHtml(msg)}</p>
          <a class="race-btn" href="index.html">${escapeHtml(rt('backToProfile'))}</a>
        </div>
      `;
    }

    async onMatchUpdate(data) {
      if (!data) {
        this.phase = 'cancelled';
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-msg">${escapeHtml(rt('matchCancelled'))}</p>
            <a class="race-btn" href="index.html">${escapeHtml(rt('backToProfile'))}</a>
          </div>
        `);
        return;
      }

      if (!RS().isRelatedWords(data)) {
        global.location.replace(RS().getMatchPageUrl(data.id, data));
        return;
      }

      this.matchData = data;
      const isP1 = RS().amPlayer1(data, this.myUid);
      this.isP1 = isP1;
      const isParticipant = data.player1Uid === this.myUid || data.player2Uid === this.myUid;
      if (!isParticipant) {
        this.renderError(rt('notParticipant'));
        return;
      }

      if (await this.maybeResetAfterRejoin(data)) {
        return;
      }

      this.syncMatchEpoch(data);

      this.renderBattleHud(data);
      if (data.status === 'active' || data.status === 'done') {
        this.syncSharedRound(data);
        this.syncOpponentLive(data);
      }

      if (data.status === 'pending') {
        this.phase = 'pending';
        this.handlePending(data, isP1);
        return;
      }

      if (data.status === 'declined') {
        this.phase = 'declined';
        this.handleDeclined(data);
        return;
      }

      if (data.status === 'abandoned') {
        this.phase = 'abandoned';
        this.handleAbandoned(data);
        return;
      }

      if (data.status === 'ready') {
        this.phase = 'ready';
        RS().tryActivateMatch(this.matchId, data);
        this.handleReady(data, isP1);
        return;
      }

      if (data.status === 'active') {
        this.phase = 'active';
        RS().tryFinalizeMatch(this.matchId, data);
        this.handleActive(data, isP1);
        return;
      }

      if (data.status === 'done') {
        this.phase = 'done';
        if (this._resultsRendered) {
          global.RaceRematchUI?.sync?.();
          return;
        }
        this.handleDone(data, isP1);
      }
    }

    streakFireMin() {
      return RS().RELATED_WORDS_STREAK_FIRE_MIN || 4;
    }

    renderHudLives(el, usedCount, prevUsed = usedCount) {
      if (!el) return;
      if (this.game?.renderVsPanelLives) {
        this.game.renderVsPanelLives(el, usedCount, prevUsed);
        return;
      }
      const used = Math.max(0, Math.min(3, Number(usedCount) || 0));
      const prev = Math.max(0, Math.min(3, Number(prevUsed) || 0));
      const parts = [];
      for (let i = 0; i < 3; i++) {
        let cls = 'rw-race-hud-life';
        if (i < used) cls += ' used';
        if (used < prev && i === used) cls += ' rw-race-hud-life--drop';
        parts.push(`<span class="${cls}" aria-hidden="true">✕</span>`);
      }
      el.innerHTML = parts.join('');
    }

    updateEnemyHudLives(wrongCount, stunnedUntil) {
      if (!this.game) return;
      this.game.setOpponentLiveState({
        wrongCount,
        stunnedUntil,
      });
    }

    updateScoreStack(stackEl, numElKey, score, streak, prevScore, { skipBump = false } = {}) {
      if (!stackEl || !numElKey) return;
      const fireMin = this.streakFireMin();
      const safeStreak = Math.max(0, Number(streak) || 0);
      const scale = safeStreak >= 2
        ? 1 + Math.min(safeStreak - 1, 8) * 0.045
        : 1;

      let numEl = global.RwScoreOdometer?.ensure?.(this.els[numElKey]) || this.els[numElKey];
      numEl = global.RwScoreOdometer?.set(numEl, score, prevScore, {
        animate: score !== prevScore,
      }) || numEl;
      this.els[numElKey] = numEl;
      numEl.style.setProperty('--rw-streak-scale', String(scale));
      stackEl.classList.toggle('is-burning', safeStreak >= fireMin);
      stackEl.dataset.streak = String(safeStreak);

      if (!skipBump && score > prevScore) {
        stackEl.classList.remove('rw-score-bump');
        void stackEl.offsetWidth;
        stackEl.classList.add('rw-score-bump');
        window.setTimeout(() => stackEl.classList.remove('rw-score-bump'), 420);
      }
    }

    prepareScoreFly(side) {
      const key = side === 'opp' || side === 'enemy' ? 'opp' : 'my';
      this._scoreFlyHold[key] = true;
    }

    completeScoreFly(side, newScore, streak) {
      const key = side === 'opp' || side === 'enemy' ? 'opp' : 'my';
      this._scoreFlyHold[key] = false;
      this._pendingScores[key] = null;
      const prev = key === 'my' ? this._prevMyScore : this._prevOppScore;
      const stackKey = key === 'my' ? 'myScoreStack' : 'oppScoreStack';
      const numKey = key === 'my' ? 'myWordCountNum' : 'oppWordCountNum';
      this.updateScoreStack(
        this.els[stackKey],
        numKey,
        newScore,
        streak,
        prev,
        { skipBump: true },
      );
      if (key === 'my') this._prevMyScore = newScore;
      else this._prevOppScore = newScore;
    }

    getScoreFlyTargets() {
      return {
        my: { stack: this.els.myScoreStack, num: this.els.myWordCountNum },
        opp: { stack: this.els.oppScoreStack, num: this.els.oppWordCountNum },
      };
    }

    renderBattleHud(data) {
      const showHud = data.status === 'active';
      if (!showHud) {
        this.els.battleHud?.classList.add('hidden');
        document.body.classList.remove('rw-race-active');
        return;
      }

      const opp = RS().getOpponent(data, this.myUid);
      if (!opp) return;

      const isP1 = RS().amPlayer1(data, this.myUid);
      const myProgress = isP1 ? (data.player1Progress || {}) : (data.player2Progress || {});
      const oppProgress = isP1 ? (data.player2Progress || {}) : (data.player1Progress || {});
      const myName = isP1 ? data.player1Name : data.player2Name;
      const myCount = myProgress.guessCount || 0;
      const oppCount = oppProgress.guessCount || 0;
      const myStreak = myProgress.winStreak || 0;
      const oppStreak = oppProgress.winStreak || 0;

      this.els.battleHud?.classList.remove('hidden');
      document.body.classList.add('rw-race-active');

      if (this.els.oppName) {
        this.els.oppName.textContent = opp.name || rt('opponent');
      }
      if (this.els.myName) {
        this.els.myName.textContent = myName || rt('me');
      }

      const chainTitleEl = this.root.querySelector('#rw-race-chain-title');
      const chainProgressEl = this.root.querySelector('#rw-race-chain-progress');
      if (chainTitleEl) chainTitleEl.textContent = chainLabel(data);
      if (chainProgressEl) {
        const shared = data.sharedState || RS().defaultRelatedWordsSharedState();
        const linkCount = RS().getRelatedWordsLinkCount?.(data)
          || global.RelatedWordsChains?.getPuzzleCount?.(data.chainId)
          || 0;
        const current = Math.min(Number(shared.linkIndex) || 0, linkCount || Number(shared.linkIndex) || 0);
        const target = data.raceTarget || RS().RELATED_WORDS_RACE_TARGET || 25;
        chainProgressEl.textContent = rt('wordsProgress', { current, target });
      }

      const shared = data.sharedState || RS().defaultRelatedWordsSharedState();
      const roundId = Number(shared.roundId) || 0;
      const oppScored = oppCount > this._prevOppScore;
      const oppJustWon = shared.lastWinnerUid && shared.lastWinnerUid !== this.myUid;
      if (oppScored && oppJustWon && roundId > this._lastOppFlyRoundId && !this._scoreFlyHold.opp) {
        this._scoreFlyHold.opp = true;
        this._pendingScores.opp = { score: oppCount, streak: oppStreak };
      }

      if (this._scoreFlyHold.opp) {
        this.updateScoreStack(
          this.els.oppScoreStack,
          'oppWordCountNum',
          this._prevOppScore,
          oppStreak,
          this._prevOppScore,
          { skipBump: true },
        );
      } else {
        this.updateScoreStack(
          this.els.oppScoreStack,
          'oppWordCountNum',
          oppCount,
          oppStreak,
          this._prevOppScore,
        );
        this._prevOppScore = oppCount;
      }

      if (this._scoreFlyHold.my) {
        this.updateScoreStack(
          this.els.myScoreStack,
          'myWordCountNum',
          this._prevMyScore,
          myStreak,
          this._prevMyScore,
          { skipBump: true },
        );
      } else {
        this.updateScoreStack(
          this.els.myScoreStack,
          'myWordCountNum',
          myCount,
          myStreak,
          this._prevMyScore,
        );
        this._prevMyScore = myCount;
      }

      this.els.myCard?.classList.toggle('rw-race-battle-card--leading', myCount > oppCount);
      this.els.oppCard?.classList.toggle('rw-race-battle-card--leading', oppCount > myCount);

      this.loadBattleCard(this.els.oppCard, opp.uid, 'opp');
      this.loadBattleCard(this.els.myCard, this.myUid, 'my');

      void global.RaceBattleHudUI?.updateSeriesScore?.(
        this.els,
        this.matchId,
        this.myUid,
        opp.uid,
        data,
      );

      const oppLive = isP1 ? data.player2RwLive : data.player1RwLive;
      this.updateEnemyHudLives(oppLive?.wrongCount || 0, oppLive?.stunnedUntil || 0);

      if (this.game && opp.progress?.won === true && !this.game.checkedComplete) {
        this.game.setEnabled(false);
      }
    }

    syncSharedRound(data) {
      if (!this.game || !RS().isRelatedWords(data)) return;

      const isP1 = RS().amPlayer1(data, this.myUid);
      const myScore = isP1
        ? (data.player1Progress?.guessCount || 0)
        : (data.player2Progress?.guessCount || 0);
      this.game.setRaceScore(myScore);

      if (data.status !== 'active') return;

      if (RS().isRelatedWordsChainComplete(data)) {
        RS().tryFinalizeMatch(this.matchId, data);
        if (this.game && !this.game.checkedComplete) {
          this.game.gameOver = true;
          this.game.checkedComplete = true;
          this.game.setEnabled(false);
        }
        return;
      }

      const shared = data.sharedState || RS().defaultRelatedWordsSharedState();
      const linkIndex = Number(shared.linkIndex) || 0;
      const roundId = Number(shared.roundId) || 0;

      if (roundId <= this._sharedRoundId) return;
      this._sharedRoundId = roundId;

      const lastWinner = shared.lastWinnerUid;
      const iWon = lastWinner === this.myUid;
      const skipped = !lastWinner;

      this.game.setRoundContext({ roundId });
      this.game.syncToLink(linkIndex, {
        animateIn: iWon,
        opponentWon: !!lastWinner && !iWon,
        skipped,
        skipScoreFly: iWon,
      });
    }

    syncOpponentLive(data) {
      if (!this.game || !RS().isRelatedWords(data) || data.status !== 'active') return;

      const isP1 = RS().amPlayer1(data, this.myUid);
      const oppLive = isP1 ? data.player2RwLive : data.player1RwLive;
      const shared = data.sharedState || RS().defaultRelatedWordsSharedState();
      const roundId = Number(shared.roundId) || 0;
      this.game.setRoundContext({ roundId });
      this.game.setOpponentSlots(oppLive, roundId);
    }

    loadBattleCard(cardEl, uid, who) {
      if (!cardEl) return;

      if (who === 'my') {
        const local = global.MatchEmotes?.buildLocalPlayerSummary?.();
        if (local) {
          global.MatchEmotes?.renderOpponentBattleCard?.(cardEl, local);
          if (this.els.myName && local.name) this.els.myName.textContent = local.name;
        }
      }

      if (!uid || cardEl.dataset.loadedUid === uid) return;
      cardEl.dataset.loadedUid = uid;
      global.MatchEmotes?.fetchOpponentSummary?.(uid).then((summary) => {
        if (!summary || !cardEl) return;
        global.MatchEmotes.renderOpponentBattleCard(cardEl, summary);
        const nameEl = who === 'opp' ? this.els.oppName : this.els.myName;
        if (nameEl && summary.name) nameEl.textContent = summary.name;
      });
    }

    renderMain(html) {
      if (this.els.main) this.els.main.innerHTML = html;
    }

    handleDeclined(data) {
      const decliner = data.declinedByUid === data.player1Uid ? data.player1Name : data.player2Name;
      this.renderMain(`
        <div class="race-panel">
          <p class="race-panel-msg">${escapeHtml(rt('battleDeclined', { name: decliner || rt('opponent') }))}</p>
          <a class="race-btn" href="index.html">${escapeHtml(rt('backToProfile'))}</a>
        </div>
      `);
    }

    handleAbandoned(data) {
      this.game?.setEnabled(false);
      const abandoner = data.abandonedByUid === data.player1Uid ? data.player1Name : data.player2Name;
      this.renderMain(`
        <div class="race-panel">
          <p class="race-panel-msg">${escapeHtml(rt('opponentAbandoned', { name: abandoner || rt('opponent') }))}</p>
          <a class="race-btn" href="index.html">${escapeHtml(rt('backToProfile'))}</a>
        </div>
      `);
    }

    handlePending(data, isP1) {
      const mode = chainLabel(data);
      if (isP1) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-title">${escapeHtml(rt('waitingFor', { name: data.player2Name }))}</p>
            <p class="race-panel-sub">${escapeHtml(rt('challengeSent', { mode }))}</p>
          </div>
        `);
      } else {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-title">${escapeHtml(rt('challengedYou', { name: data.player1Name }))}</p>
            <p class="race-panel-sub">${escapeHtml(rt('matchRace', { mode }))}</p>
            <div class="race-panel-actions">
              <button type="button" class="race-btn race-btn--primary" id="race-accept">${escapeHtml(ct('accept'))}</button>
              <button type="button" class="race-btn" id="race-decline">${escapeHtml(ct('decline'))}</button>
            </div>
          </div>
        `);
        this.root.querySelector('#race-accept')?.addEventListener('click', () => {
          RS().acceptMatch(this.matchId).catch(() => alert(rt('acceptFailed')));
        });
        this.root.querySelector('#race-decline')?.addEventListener('click', () => {
          RS().declineMatch(this.matchId).then(() => {
            global.location.href = 'index.html';
          }).catch(() => alert(rt('declineFailed')));
        });
      }
    }

    handleReady(data, isP1) {
      if (data.player1Ready && data.player2Ready) {
        RS().tryActivateMatch(this.matchId, data);
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p>
          </div>
        `);
        return;
      }

      const opp = RS().getOpponent(data, this.myUid);
      const myReady = isP1 ? data.player1Ready : data.player2Ready;
      const theirReady = isP1 ? data.player2Ready : data.player1Ready;
      const oppName = opp?.name || rt('opponent');
      const mode = chainLabel(data);

      this.renderMain(`
        <div class="race-panel race-waiting">
          <p class="race-panel-title">${escapeHtml(rt('waitingRoom'))}</p>
          <p class="race-panel-sub">${escapeHtml(rt('versus', { opp: oppName, mode }))}</p>
          <div class="race-ready-status">
            <div class="race-ready-row${myReady ? ' ready' : ''}">
              <span>${escapeHtml(rt('me'))}</span>
              <span>${myReady ? escapeHtml(rt('readyDone')) : escapeHtml(rt('readying'))}</span>
            </div>
            <div class="race-ready-row${theirReady ? ' ready' : ''}">
              <span>${escapeHtml(oppName)}</span>
              <span>${theirReady ? escapeHtml(rt('readyDone')) : escapeHtml(rt('oppReadying'))}</span>
            </div>
          </div>
          ${myReady ? '' : `<button type="button" class="race-btn race-btn--primary" id="race-ready-btn">${escapeHtml(rt('ready'))}</button>`}
        </div>
      `);

      this.root.querySelector('#race-ready-btn')?.addEventListener('click', () => {
        RS().setPlayerReady(this.matchId, isP1).catch(() => alert(rt('readySaveFailed')));
      });
    }

    handleActive(data, isP1) {
      const hasStartedPlaying = (data.player1Progress?.guessCount || 0) > 0
        || (data.player2Progress?.guessCount || 0) > 0
        || data.player1Progress?.finished
        || data.player2Progress?.finished;
      if (!this._activeSeenAtMs) this._activeSeenAtMs = Date.now();
      const raceStartMs = RC().resolveRaceStartMs(this, data, {
        countdownSec: COUNTDOWN_SEC,
        getStartedAtMs: (d) => RS().startedAtMs(d),
      });

      if (!this.gameStarted && !hasStartedPlaying && Date.now() < raceStartMs) {
        this.renderMain(`
          <div class="race-panel race-countdown-panel">
            <p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p>
          </div>
        `);
        this.showCountdown(raceStartMs, () => this.startGame(data, isP1));
        return;
      }

      if (!this.gameStarted) {
        this.startGame(data, isP1);
      } else if (this.game) {
        this.renderBattleHud(data);
      }
    }

    showCountdown(raceStartMs, onDone) {
      RC()?.runCountdown?.(this, {
        el: this.els.countdown,
        raceStartMs,
        countdownSec: COUNTDOWN_SEC,
        onDone,
        goLabel: rt('go'),
      });
    }

    startGame(data, isP1) {
      if (this.gameStarted) return;
      if (!data?.chainId) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-msg">${escapeHtml(rt('loadFailed'))}</p>
          </div>
        `);
        return;
      }
      this.gameStarted = true;
      this.els.countdown?.classList.add('hidden');

      const shared = data.sharedState || RS().defaultRelatedWordsSharedState();
      this._sharedRoundId = Number(shared.roundId) || 0;

      this.renderMain('<div id="rw-race-game" class="rw-race-game"></div>');
      const gameRoot = this.root.querySelector('#rw-race-game');
      const raceTarget = data.raceTarget || RS().RELATED_WORDS_RACE_TARGET || 25;

      this.game = new global.RelatedWordsGame(gameRoot, {
        versus: true,
        raceControlled: true,
        sharedRace: true,
        chainId: data.chainId,
        raceTarget,
        initialLinkIndex: Number(shared.linkIndex) || 0,
        onRoundWin: async (payload) => {
          const result = await RS().submitRelatedWordsRound(this.matchId, this.myUid, payload);
          if (result.applied) {
            if (typeof result.myScore === 'number' && this.matchData) {
              const isP1 = RS().amPlayer1(this.matchData, this.myUid);
              const progKey = isP1 ? 'player1Progress' : 'player2Progress';
              const prog = this.matchData[progKey] || RS().defaultProgress();
              this._pendingScores.my = {
                score: result.myScore,
                streak: (prog.winStreak || 0) + 1,
              };
              this.matchData = {
                ...this.matchData,
                [progKey]: {
                  ...prog,
                  guessCount: result.myScore,
                  winStreak: (prog.winStreak || 0) + 1,
                },
              };
              this._pendingScores.my.streak = this.matchData[progKey].winStreak;
            }
            return result;
          }

          const data = this.matchData;
          if (!data || !RS().isRelatedWordsChainComplete(data)) return result;

          if (data.status !== 'done') {
            await RS().tryFinalizeMatch(this.matchId, data);
          }
          const isP1 = RS().amPlayer1(data, this.myUid);
          const myScore = isP1
            ? (data.player1Progress?.guessCount || 0)
            : (data.player2Progress?.guessCount || 0);
          return { applied: true, matchOver: true, myScore };
        },
        onRevealSkip: (payload) => RS().pressRelatedWordsReveal(this.matchId, this.myUid, payload),
        onSlotsChange: (state) => RS().updateRelatedWordsLive(this.matchId, isP1, state),
        onLiveHudUpdate: () => {},
        getScoreFlyTargets: () => this.getScoreFlyTargets(),
        onScoreFlyPrepare: ({ side }) => this.prepareScoreFly(side),
        onScoreFlyComplete: ({ side }) => {
          const key = side === 'opp' || side === 'enemy' ? 'opp' : 'my';
          const pending = this._pendingScores[key];
          if (!pending) {
            this._scoreFlyHold[key] = false;
            return;
          }
          if (key === 'opp') this._lastOppFlyRoundId = Number(this.matchData?.sharedState?.roundId) || this._lastOppFlyRoundId;
          this.completeScoreFly(side, pending.score, pending.streak);
        },
      });
      this.game.mount();
      this.game.setRoundContext({ roundId: this._sharedRoundId });
      this.game.raceStartTime = Date.now();
      const myScore = isP1
        ? (data.player1Progress?.guessCount || 0)
        : (data.player2Progress?.guessCount || 0);
      this.game.setRaceScore(myScore);
      this.game.setSharedWordsDone(Number(shared.linkIndex) || 0);
      this.game.setEnabled(true);
      this.syncOpponentLive(data);
      this.renderBattleHud(data);
    }

    handleDone(data, isP1) {
      if (this._resultsRendered) return;
      this._resultsRendered = true;

      this.els.battleHud?.classList.add('hidden');
      document.body.classList.remove('rw-race-active');

      if (this.game) {
        this.game.setEnabled(false);
      }
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      if (this._countdownFallbackTimer) {
        clearTimeout(this._countdownFallbackTimer);
        this._countdownFallbackTimer = null;
      }

      const p1 = data.player1Progress || RS().defaultProgress();
      const p2 = data.player2Progress || RS().defaultProgress();
      const startMs = RS().startedAtMs(data);

      function elapsedFor(progress) {
        if (progress.elapsedMs != null) return progress.elapsedMs;
        if (progress.finishedAt && startMs) {
          return Math.max(0, progress.finishedAt.toMillis() - startMs);
        }
        return null;
      }

      let resultLine;
      if (data.winnerUid === this.myUid) {
        resultLine = rt('win');
      } else if (data.winnerUid) {
        resultLine = rt('loss');
      } else {
        resultLine = rt('draw');
      }

      const opp = RS().getOpponent(data, this.myUid);
      const myProgress = isP1 ? p1 : p2;
      const oppProgress = isP1 ? p2 : p1;
      const RUI = global.RaceResultsUI;
      const resultKind = data.winnerUid === this.myUid ? 'win' : data.winnerUid ? 'loss' : 'draw';

      this.renderMain(RUI.renderResultsPanel({
        resultLine,
        resultKind,
        winnerUid: data.winnerUid,
        battleXpMode: data.winnerUid === this.myUid ? 'relatedWords' : '',
        battleMatchId: this.matchId,
        players: [
          {
            uid: this.myUid,
            name: rt('me'),
            statHtml: `${myProgress.guessCount} ${escapeHtml(rt('points'))} · ${escapeHtml(formatTime(elapsedFor(myProgress)))}`,
          },
          {
            uid: opp?.uid,
            name: opp?.name || rt('opponent'),
            statHtml: `${oppProgress.guessCount} ${escapeHtml(rt('points'))} · ${escapeHtml(formatTime(elapsedFor(oppProgress)))}`,
          },
        ],
        rematchLabel: rt('rematch'),
        profileLabel: rt('profileLink'),
        profileHref: 'index.html',
      }));

      RUI.afterResultsMount(this.els.main);
      this.mountRematchUi();
    }
  }

  global.RelatedWordsRaceApp = RelatedWordsRaceApp;

  global.addEventListener('pagehide', () => {
    if (global.__relatedWordsRaceAppInstance) global.__relatedWordsRaceAppInstance.destroy();
  });
})(typeof window !== 'undefined' ? window : globalThis);
