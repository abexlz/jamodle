/**
 * Turn-based Korean Match — instant turn switch, reveal modes, turn results grid.
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  const RC = () => global.RaceCountdown;
  const COUNTDOWN_SEC = 3;
  const countdownTotalMs = () => RC()?.countdownTotalMs?.(COUNTDOWN_SEC) ?? (COUNTDOWN_SEC + 1) * 1000;
  // Grace (server-anchored) after a turn expires before the *waiting* player is
  // allowed to force-advance it. Normal turns are advanced by the active player;
  // this only rescues a frozen/disconnected active player.
  const TURN_EXPIRE_GRACE_MS = 4000;
  const DEBUG_TURN = (() => {
    try {
      const qs = new URLSearchParams(global.location?.search || '');
      return qs.has('debugTurn') || global.localStorage?.getItem('jamodeul-debug-turn') === '1';
    } catch (_) {
      return false;
    }
  })();

  function debugTurn(event, meta) {
    if (!DEBUG_TURN) return;
    try {
      console.log('[TurnDebug][MatchTurnApp]', event, meta || {});
    } catch (_) {}
  }

  function rt(key, vars) {
    const t = global.I18n?.t;
    if (!t) return '';
    const turn = t('matchTurn.' + key, vars);
    if (turn) return turn;
    const matchRace = t('matchRace.' + key, vars);
    if (matchRace) return matchRace;
    return t('race.' + key, vars) || '';
  }

  function ct(key) {
    return global.I18n?.t('common.' + key) ?? '';
  }

  function wordLengthLabel(data) {
    const n = RS().getMatchWordLength?.(data) ?? 4;
    return global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
  }

  function turnModeLabel(mode) {
    const n = global.MatchWords?.normalizeWordLength?.(mode) ?? 4;
    return global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  class MatchTurnApp {
    constructor(rootEl) {
      this.root = rootEl;
      this.matchId = new URLSearchParams(global.location.search).get('id');
      this.myUid = null;
      this.matchUnsub = null;
      this.countdownTimer = null;
      this.turnTimer = null;
      this.game = null;
      this.matchData = null;
      this.countdownDone = false;
      this.gameStarted = false;
      this.isP1 = false;
      this.preparedTurnNumber = null;
      this.pendingTurnSubmit = false;
      this._lastTurnKey = null;
      this._localeOff = null;
      this._prevTurnBoundaryKey = null;
      this._turnSwapTimer = null;
      this._lastUrgencySec = null;
      this._resultsRendered = false;
      this._activeSeenAtMs = null;
      this._turnLocalKey = null;
      this._turnLocalStartMs = null;
      this._observedAnyTurn = false;
      this._timeoutAttemptTurnKey = null;
      this._timeoutAttemptAt = 0;
      this._forceAttemptTurnKey = null;
      this._forceAttemptAt = 0;
      this._autoWritesBlocked = false;
      this._quotaPaused = false;
      this._leftMatch = false;
      this._playedRevealKey = null;
      this._emotes = null;
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
      global.FirebaseSocial?.syncLocalPublicProfile?.().catch(() => {});

      document.title = rt('pageTitle');
      this.renderShell();
      this.renderMain(`<div class="race-panel"><p class="race-panel-title">${escapeHtml(rt('loading'))}</p></div>`);

      this.matchUnsub = RS().subscribeMatch(
        this.matchId,
        (data) => this.onMatchUpdate(data),
        (err) => {
          if (RS().isQuotaError?.(err)) {
            RS().haltOnQuotaError?.(err, 'subscribeMatch');
            this.pauseDueToQuota();
            return;
          }
          console.error('[MatchTurnApp]', err);
          this.renderError(err?.code === 'permission-denied' ? rt('permissionDenied') : rt('loadFailed'));
        }
      );

      if (RS().isQuotaHalted?.()) this.pauseDueToQuota();
    }

    pauseDueToQuota() {
      if (this._quotaPaused) return;
      this._quotaPaused = true;
      this._autoWritesBlocked = true;
      this.stopTurnLiveWatch();
      this.matchUnsub?.();
      this.matchUnsub = null;
      if (this.turnTimer) {
        clearInterval(this.turnTimer);
        this.turnTimer = null;
      }
      this.renderMain(`
        <div class="race-panel">
          <p class="race-panel-title">${escapeHtml(rt('loadFailed'))}</p>
          <p class="race-panel-sub">Firestore quota reached. Close extra tabs, wait a few minutes, then reload.</p>
          <button type="button" class="race-btn race-btn--primary" id="race-quota-reload">${escapeHtml(ct('retry') || 'Retry')}</button>
        </div>
      `);
      this.root.querySelector('#race-quota-reload')?.addEventListener('click', () => {
        global.location.reload();
      });
    }

    destroy() {
      global.RaceRematchUI?.teardown?.();
      this.stopTurnLiveWatch();
      this.leaveMatch();
      this._localeOff?.();
      this.matchUnsub?.();
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      if (this._countdownFallbackTimer) {
        clearTimeout(this._countdownFallbackTimer);
        this._countdownFallbackTimer = null;
      }
      if (this.turnTimer) clearInterval(this.turnTimer);
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      global.KoreanMatchDrag?.end?.();
      this._emotes?.destroy();
      this._emotes = null;
      global.MatchEmotes?.unsubscribeAllEmotes?.();
      this.game?.destroy();
    }

    onLocaleChange() {
      document.title = rt('pageTitle');
      if (this.matchData?.status === 'done') this._resultsRendered = false;
      if (this.matchData) this.onMatchUpdate(this.matchData);
    }

    renderShell() {
      this.root.innerHTML = `
        <header class="race-header">
          <a class="race-back" href="index.html">${escapeHtml(rt('backHome'))}</a>
          <h1>${escapeHtml(rt('title'))}</h1>
          <a class="race-settings-link" href="settings.html" aria-label="${escapeHtml(global.I18n?.t('nav.settings') || 'Settings')}">⚙️</a>
        </header>
        <div id="race-opp-hud" class="race-opp-hud hidden" aria-live="polite">
          <div class="race-opp-card-col">
            <div id="race-opp-card" class="race-opp-battle-card" aria-hidden="true"></div>
            <p id="race-opp-name" class="race-opp-name-hud"></p>
          </div>
          <div id="race-opp-emote" class="race-opp-emote hidden" aria-live="polite"></div>
        </div>
        <div id="race-turn-urgency" class="race-turn-urgency hidden" aria-hidden="true"></div>
        <div id="race-turn-swap" class="race-turn-swap hidden" aria-live="assertive"></div>
        <div id="race-main" class="race-main"></div>
        <div id="race-countdown" class="race-countdown hidden" aria-live="assertive"></div>
      `;
      this.els = {
        oppHud: this.root.querySelector('#race-opp-hud'),
        oppCard: this.root.querySelector('#race-opp-card'),
        oppName: this.root.querySelector('#race-opp-name'),
        oppEmote: this.root.querySelector('#race-opp-emote'),
        turnBar: null,
        turnUrgency: this.root.querySelector('#race-turn-urgency'),
        turnSwap: this.root.querySelector('#race-turn-swap'),
        main: this.root.querySelector('#race-main'),
        countdown: this.root.querySelector('#race-countdown'),
      };
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
      RS().abandonMatch(this.matchId, this.myUid).catch(() => {});
    }

    async leaveMatchAndGo(href) {
      global.RaceRematchUI?.teardown?.();
      if (!this._leftMatch) {
        this._leftMatch = true;
        if (this.matchId && this.myUid) {
          await RS().abandonMatch(this.matchId, this.myUid).catch(() => {});
        }
      }
      global.location.href = href;
    }

    mountRematchUi() {
      global.RaceRematchUI?.mount?.({
        root: this.els.main,
        matchId: this.matchId,
        myUid: this.myUid,
        getMatchData: () => this.matchData,
        t: rt,
        getMatchPageUrl: (id) => RS().getMatchPageUrl(id, {
          gameType: RS().GAME_TYPES.koreanMatch,
          playMode: RS().PLAY_MODES.turn,
        }),
        createRematch: (oppUid, data, rematchFrom) => RS().createRematchMatch(oppUid, {
          gameType: RS().GAME_TYPES.koreanMatch,
          wordLength: RS().getMatchWordLength(data),
          playMode: RS().PLAY_MODES.turn,
          excludeTarget: data.target,
        }, rematchFrom),
      });
    }

    renderError(msg) {
      this.root.innerHTML = `
        <div class="race-panel">
          <p class="race-panel-msg">${escapeHtml(msg)}</p>
          <a class="race-btn" href="index.html">${escapeHtml(rt('backHome'))}</a>
        </div>
      `;
    }

    renderMain(html) {
      if (this.els?.main) this.els.main.innerHTML = html;
    }

    turnModeLabel(data) {
      return wordLengthLabel(data);
    }

    onMatchUpdate(data) {
      if (this._quotaPaused) return;
      if (!data) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-msg">${escapeHtml(rt('matchCancelled'))}</p>
            <a class="race-btn" href="index.html">${escapeHtml(rt('backHome'))}</a>
          </div>
        `);
        return;
      }

      if (!RS().isTurnBased(data) || !RS().isKoreanMatch(data)) {
        global.location.replace(RS().getMatchPageUrl(data.id, data));
        return;
      }

      this.matchData = data;
      this.isP1 = RS().amPlayer1(data, this.myUid);
      const turnKey = `${data.currentTurnUid || ''}:${data.turnNumber || 0}`;
      if (this._lastTurnKey && this._lastTurnKey !== turnKey) {
        this.pendingTurnSubmit = false;
        this._timeoutAttemptTurnKey = null;
        this._timeoutAttemptAt = 0;
        this._forceAttemptTurnKey = null;
        this._forceAttemptAt = 0;
      }
      this._lastTurnKey = turnKey;
      if (data.player1Uid !== this.myUid && data.player2Uid !== this.myUid) {
        this.renderError(rt('notParticipant'));
        return;
      }

      if (data.status === 'pending') return this.handlePending(data, this.isP1);
      if (data.status === 'declined') return this.handleDeclined(data);
      if (data.status === 'abandoned') return this.handleAbandoned(data);
      if (data.status === 'ready') {
        RS().tryActivateMatch(this.matchId, data);
        return this.handleReady(data, this.isP1);
      }
      if (data.status === 'active') {
        if (data.sharedState?.over || data.winnerUid) {
          RS().tryFinalizeMatch?.(this.matchId, data);
          return this.handleDone({
            ...data,
            status: 'done',
            winnerUid: data.winnerUid || data.sharedState?.winnerUid || null,
          });
        }
        return this.handleActive(data);
      }
      if (data.status === 'done') {
        if (this._resultsRendered) {
          global.RaceRematchUI?.sync?.();
          return;
        }
        return this.handleDone(data);
      }
    }

    handleDeclined(data) {
      const decliner = data.declinedByUid === data.player1Uid ? data.player1Name : data.player2Name;
      this.renderMain(`
        <div class="race-panel">
          <p class="race-panel-msg">${escapeHtml(rt('battleDeclined', { name: decliner || rt('opponent') }))}</p>
          <a class="race-btn" href="index.html">${escapeHtml(rt('backHome'))}</a>
        </div>
      `);
    }

    handleAbandoned(data) {
      if (this.turnTimer) clearInterval(this.turnTimer);
      this.game?.setMyTurn(false);
      const abandoner = data.abandonedByUid === data.player1Uid ? data.player1Name : data.player2Name;
      this.renderMain(`
        <div class="race-panel">
          <p class="race-panel-msg">${escapeHtml(rt('opponentAbandoned', { name: abandoner || rt('opponent') }))}</p>
          <a class="race-btn" href="index.html">${escapeHtml(rt('backHome'))}</a>
        </div>
      `);
    }

    handlePending(data, isP1) {
      const mode = this.turnModeLabel(data);
      const seconds = Math.round((data.turnDurationMs || RS().turnDurationForLength(RS().getMatchWordLength(data))) / 1000);
      if (isP1) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-title">${escapeHtml(rt('waitingFor', { name: data.player2Name }))}</p>
            <p class="race-panel-sub">${escapeHtml(rt('turnInviteSent', { mode, seconds }))}</p>
          </div>
        `);
      } else {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-title">${escapeHtml(rt('challengedYou', { name: data.player1Name }))}</p>
            <p class="race-panel-sub">${escapeHtml(rt('turnInvite', { mode, seconds }))}</p>
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
          RS().declineMatch(this.matchId).then(() => { global.location.href = 'index.html'; })
            .catch(() => alert(rt('declineFailed')));
        });
      }
    }

    handleReady(data, isP1) {
      if (data.player1Ready && data.player2Ready) {
        this.renderMain(`<div class="race-panel"><p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p></div>`);
        return;
      }
      const opp = RS().getOpponent(data, this.myUid);
      const myReady = isP1 ? data.player1Ready : data.player2Ready;
      const theirReady = isP1 ? data.player2Ready : data.player1Ready;
      this.renderMain(`
        <div class="race-panel race-waiting">
          <p class="race-panel-title">${escapeHtml(rt('waitingRoom'))}</p>
          <p class="race-panel-sub">${escapeHtml(rt('turnVersus', { opp: opp?.name || rt('opponent'), mode: this.turnModeLabel(data) }))}</p>
          <div class="race-ready-status">
            <div class="race-ready-row${myReady ? ' ready' : ''}"><span>${escapeHtml(rt('me'))}</span><span>${myReady ? escapeHtml(rt('readyDone')) : escapeHtml(rt('readying'))}</span></div>
            <div class="race-ready-row${theirReady ? ' ready' : ''}"><span>${escapeHtml(opp?.name || rt('opponent'))}</span><span>${theirReady ? escapeHtml(rt('readyDone')) : escapeHtml(rt('oppReadying'))}</span></div>
          </div>
          ${myReady ? '' : `<button type="button" class="race-btn race-btn--primary" id="race-ready-btn">${escapeHtml(rt('ready'))}</button>`}
        </div>
      `);
      this.root.querySelector('#race-ready-btn')?.addEventListener('click', () => {
        RS().setPlayerReady(this.matchId, isP1).catch(() => alert(rt('readySaveFailed')));
      });
    }

    handleActive(data) {
      const firstTurnStart = (data.turnNumber || 1) === 1
        && (data.sharedState?.guessCount || 0) === 0
        && (data.turnHistory?.length || 0) === 0;

      if (!this._activeSeenAtMs) this._activeSeenAtMs = Date.now();
      const raceStartMs = RC().resolveRaceStartMs(this, data, {
        countdownSec: COUNTDOWN_SEC,
        getStartedAtMs: (d) => RS().startedAtMs(d),
      });
      if (!this.gameStarted && firstTurnStart && Date.now() < raceStartMs) {
        this.renderMain(`<div class="race-panel race-countdown-panel"><p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p></div>`);
        this.showCountdown(raceStartMs, () => this.startGame(data, true));
        return;
      }
      if (!this.gameStarted) this.startGame(data, firstTurnStart);
      this.syncTurnState(data);
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

    startGame(data, anchorTimerNow = false) {
      if (this.gameStarted) return;
      if (!data?.target) {
        this.renderMain(`<div class="race-panel"><p class="race-panel-msg">${escapeHtml(rt('loadFailed'))}</p></div>`);
        return;
      }
      this.gameStarted = true;
      this.els.countdown?.classList.add('hidden');
      this.renderMain(`
        <section class="race-turn-mine" aria-label="${escapeHtml(rt('mineSection'))}">
          <div id="match-app" class="match-race-game"></div>
        </section>
      `);
      const wordLength = RS().getMatchWordLength(data);
      this.game = new global.KoreanMatchGame(this.root.querySelector('#match-app'), {
        versus: true,
        turnBased: true,
        raceControlled: true,
        wordLength,
        mode: wordLength,
        fixedWord: data.target,
        sharedSeed: this.matchId,
        onTurnSubmit: async (payload) => {
          const ok = await RS().submitTurn(this.matchId, this.myUid, payload);
          if (!ok) throw new Error('turn-not-applied');
        },
        onTurnLiveChange: (state) => {
          const live = this.matchData;
          if (!live || live.currentTurnUid !== this.myUid || live.status !== 'active') return;
          if (RS().isQuotaHalted?.()) return;
          const checking = state?.action?.kind === 'checking';
          if (!checking && !RS().usesTurnLiveRtdb?.() && RS().inWriteCooldown?.()) return;
          debugTurn('onTurnLiveChange', {
            matchId: this.matchId,
            turnNumber: live.turnNumber || 0,
            placements: state?.placements?.length || 0,
            mergeResult: state?.merge?.result || null,
            checking,
          });
          RS().updateTurnLive(this.matchId, this.myUid, live.turnNumber, state, { immediate: checking });
        },
      });
      this.game.mount();
      requestAnimationFrame(() => {
        this.game?.syncDockTileSize?.();
        requestAnimationFrame(() => this.game?.syncDockTileSize?.());
      });
      this.ensureTurnBar();
      this.mountTurnBarToDock();
      // First turn: both clients ran the same local countdown, so the turn
      // clock starts at GO — not at the earlier server activation timestamp.
      // Mid-match loads keep the server-estimated elapsed time instead.
      if (anchorTimerNow) this.anchorTurnTimerNow(data);
      this.syncTurnState(data);
      this.renderOpponentHud(data);
      this.setupEmotes(data);
    }

    renderOpponentHud(data) {
      const opp = RS().getOpponent(data, this.myUid);
      if (!opp || !this.els.oppHud) return;
      this.els.oppHud.classList.remove('hidden');
      if (this.els.oppName) this.els.oppName.textContent = opp.name || rt('opponent');
      global.MatchEmotes?.fetchOpponentSummary?.(opp.uid).then((summary) => {
        if (!summary || !this.els.oppCard) return;
        global.MatchEmotes.renderOpponentBattleCard(this.els.oppCard, summary);
        if (this.els.oppName && summary.name) this.els.oppName.textContent = summary.name;
      });
    }

    setupEmotes(data) {
      const ME = global.MatchEmotes;
      const opp = RS().getOpponent(data, this.myUid);
      if (!ME || !opp?.uid || !this.game?.els?.emoteMount) return;
      this._emotes?.destroy();
      this._emotes = new ME.MatchEmotesController({
        matchId: this.matchId,
        myUid: this.myUid,
        oppUid: opp.uid,
        mountEl: this.game.els.emoteMount,
        displayEl: this.els.oppEmote,
        selfDisplayEl: this.game.els.emoteSelf,
      });
      this._emotes.mount();
    }

    currentTurnKey(data) {
      return `${data?.currentTurnUid || ''}:${data?.turnNumber || 0}:${data?.turnPhase || ''}`;
    }

    /**
     * Anchor each turn's timer to the local wall clock at the moment this
     * client observes the turn boundary. Both clients see the boundary within
     * network latency of each other, so their timers agree — unlike raw
     * server-timestamp math, which drifts by whatever the device clock skew is.
     * Only the very first snapshot after a page load falls back to the
     * server-estimated elapsed time.
     */
    updateTurnLocalStart(data) {
      const key = this.currentTurnKey(data);
      if (this._turnLocalKey === key) return;
      this._turnLocalKey = key;
      const duration = RS().turnDurationMs?.(data) || 0;
      const sawBoundary = this._observedAnyTurn === true;
      this._observedAnyTurn = true;
      if (!sawBoundary && duration > 0) {
        const serverRemaining = RS().turnRemainingMs?.(data);
        const elapsed = Number.isFinite(serverRemaining)
          ? Math.min(Math.max(duration - serverRemaining, 0), duration)
          : 0;
        this._turnLocalStartMs = Date.now() - elapsed;
        return;
      }
      this._turnLocalStartMs = Date.now();
    }

    /** Re-anchor the current turn to start now (used when GO fires). */
    anchorTurnTimerNow(data) {
      this._turnLocalKey = this.currentTurnKey(data);
      this._turnLocalStartMs = Date.now();
      this._observedAnyTurn = true;
    }

    getTurnElapsedMs(data) {
      if (!data) return 0;
      this.updateTurnLocalStart(data);
      if (!this._turnLocalStartMs) return 0;
      return Date.now() - this._turnLocalStartMs;
    }

    getTurnRemainingMs(data) {
      if (!data) return 0;
      const duration = RS().turnDurationMs?.(data) || 0;
      if (!duration) return 0;
      return Math.max(0, duration - this.getTurnElapsedMs(data));
    }

    ensureTurnBar() {
      if (this.els.turnBar) return;
      const bar = document.createElement('div');
      bar.id = 'race-turn-bar';
      bar.className = 'race-turn-bar hidden';
      bar.setAttribute('aria-live', 'polite');
      this.els.turnBar = bar;
    }

    mountTurnBarToDock() {
      const mount = this.root.querySelector('#race-turn-bar-mount');
      if (!mount || !this.els.turnBar) return;
      if (this.els.turnBar.parentElement !== mount) {
        mount.appendChild(this.els.turnBar);
      }
    }

    renderTurnBar(data, mode) {
      this.ensureTurnBar();
      const bar = this.els.turnBar;
      if (!bar) return;
      const opp = RS().getOpponent(data, this.myUid);
      let label = rt('yourTurn');
      let pct = 100;
      let myTurnStyle = false;
      let timerHtml = '';

      const duration = RS().turnDurationMs?.(data) || 1;
      const localPct = Math.round((this.getTurnRemainingMs(data) / duration) * 100);
      if (mode === 'rush') {
        label = rt('rushPhase');
        pct = 100;
        myTurnStyle = true;
      } else if (mode === 'waiting') {
        label = rt('oppTurn', { name: opp?.name || rt('opponent') });
        pct = localPct;
      } else if (mode === 'mine') {
        label = rt('yourTurn');
        pct = localPct;
        myTurnStyle = true;
      }

      if (mode !== 'rush' && data.currentTurnUid) {
        const sec = Math.ceil(this.getTurnRemainingMs(data) / 1000);
        timerHtml = `<span class="race-turn-timer" aria-label="${escapeHtml(rt('timeLeft', { s: sec }))}">${sec}</span>`;
      }

      bar.classList.remove('hidden');
      bar.classList.toggle('is-my-turn', myTurnStyle);
      this.mountTurnBarToDock();
      bar.innerHTML = `
        <div class="race-turn-bar-top">
          <span class="race-turn-label">${escapeHtml(label)}</span>
          <span class="race-turn-bar-meta">
            ${timerHtml}
            <span class="race-turn-round">${escapeHtml(rt('turnNumber', { n: data.turnNumber || 1 }))}</span>
          </span>
        </div>
        <div class="race-turn-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="race-turn-progress-fill" style="width:${pct}%"></div>
        </div>
      `;
      this.game?.syncDockTileSize?.();
      requestAnimationFrame(() => this.game?.syncDockTileSize?.());
    }

    updateTurnUrgencyOverlay(data) {
      const el = this.els.turnUrgency;
      if (!el || !this.gameStarted || data.status !== 'active') {
        this.hideTurnUrgencyOverlay();
        return;
      }
      if (RS().isRushPhase(data) || !data.currentTurnUid) {
        this.hideTurnUrgencyOverlay();
        return;
      }
      if (data.currentTurnUid !== this.myUid) {
        this.hideTurnUrgencyOverlay();
        return;
      }

      const remainingMs = this.getTurnRemainingMs(data);
      const sec = Math.ceil(remainingMs / 1000);
      if (remainingMs <= 0 || sec > 5) {
        this.hideTurnUrgencyOverlay();
        return;
      }

      if (this._lastUrgencySec === sec) return;
      this._lastUrgencySec = sec;
      el.textContent = String(sec);
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
      void el.offsetWidth;
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    }

    hideTurnUrgencyOverlay() {
      this._lastUrgencySec = null;
      const el = this.els.turnUrgency;
      if (!el) return;
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
      el.textContent = '';
    }

    maybeShowTurnSwapOverlay(data) {
      if (!this.gameStarted || RS().isRushPhase(data)) return;
      const key = `${data.currentTurnUid || ''}:${data.turnNumber || 0}`;
      if (this._prevTurnBoundaryKey == null) {
        this._prevTurnBoundaryKey = key;
        return;
      }
      if (this._prevTurnBoundaryKey === key) return;
      this._prevTurnBoundaryKey = key;
      this.showTurnSwapOverlay();
    }

    showTurnSwapOverlay() {
      const el = this.els.turnSwap;
      if (!el) return;
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      el.textContent = rt('turnSwap');
      el.classList.remove('hidden');
      void el.offsetWidth;
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      this._turnSwapTimer = setTimeout(() => {
        el.classList.add('hidden');
        this._turnSwapTimer = null;
      }, 700);
    }

    showOppSubmission(reveal) {
      if (!this.game || !reveal || reveal.byUid === this.myUid) {
        this.game?.hideOpponentSubmission();
        return;
      }
      this.game.showOpponentSubmission(reveal, {
        name: reveal.byName || rt('opponent'),
      });
    }

    hideOppSubmission() {
      this.game?.hideOpponentSubmission();
    }

    async maybePlayOpponentReveal(data) {
      const reveal = data?.lastTurnReveal;
      if (!this.game || !reveal || reveal.byUid === this.myUid) return;
      const key = `${reveal.byUid}:${reveal.turnNumber ?? ''}`;
      if (!key || key === this._playedRevealKey) return;
      if (key === this.game._watchRevealPlayedKey) {
        this._playedRevealKey = key;
        return;
      }

      const sharedLocked = data.sharedState?.locked || [];
      const revealCorrectKeys = new Set(
        (reveal.placements || [])
          .filter((p) => p.correct)
          .map((p) => `${p.syl}:${p.zone}:${p.subIndex ?? 0}`)
      );
      const lockedBeforeReveal = sharedLocked.filter(
        (lock) => !revealCorrectKeys.has(`${lock.syl}:${lock.zone}:${lock.subIndex ?? 0}`)
      );

      const wasWatching = this.game.watchMode;
      const hasBoardPlacements = this.game.hasWatchBoardPlacements?.();
      if (!wasWatching || !hasBoardPlacements) {
        this.game.prepareForNewTurn(lockedBeforeReveal, data.turnHistory, this.myUid);
        this.game.setWatchMode(true);
        this.game.renderTurnGuessOnZones(this.game.blocks, reveal, { neutral: true });
      }

      this._playedRevealKey = key;
      await this.game.playWatchTurnReveal(reveal, {
        name: reveal.byName || rt('opponent'),
      });

      if (!wasWatching) {
        this.game.setWatchMode(false);
      }
    }

    /** Reset + autofill once per upcoming turn while opponent plays. */
    enterPrepBoard(data) {
      const prepFor = (data.turnNumber || 1) + 1;
      if (this.preparedTurnNumber !== prepFor) {
        this.game.resetTurnBoard();
        this.game.applyAutofillFromHistory?.(data.turnHistory, this.myUid);
        this.preparedTurnNumber = prepFor;
      }
      this.game.syncSharedState(data.sharedState || RS().defaultSharedState());
      this.game.setBoardHidden(false);
      this.game.setPreparationMode(true);
      this.els.main?.classList.remove('race-main--hidden');
    }

    /** Show opponent's live board while they play their turn. */
    watchOpponentTurn(data) {
      const watchKey = `watch-${data.turnNumber || 1}`;
      if (this.preparedTurnNumber !== watchKey) {
        this.game.prepareForNewTurn?.(data.sharedState?.locked || []);
        this.preparedTurnNumber = watchKey;
      }
      this.game.syncSharedState(data.sharedState || RS().defaultSharedState());
      this.game.setWatchMode(true);
      this.game.setBoardHidden(false);
      if (!RS().usesTurnLiveRtdb?.()) {
        const live = data.turnLive;
        if (
          live?.byUid === data.currentTurnUid
          && live?.turnNumber === data.turnNumber
        ) {
          this.game.applyTurnLiveState(live);
        } else if (data.lastTurnReveal?.byUid === data.currentTurnUid) {
          this.game.applyTurnLiveState({
            placements: data.lastTurnReveal.placements || [],
            merge: { slots: [null, null], result: null },
          });
        }
      } else if (data.lastTurnReveal?.byUid === data.currentTurnUid) {
        this.game.applyTurnLiveState({
          placements: data.lastTurnReveal.placements || [],
          merge: { slots: [null, null], result: null },
        });
      }
      this.syncTurnLiveWatch(data);
      this.els.main?.classList.remove('race-main--hidden');
    }

    stopTurnLiveWatch() {
      global.TurnLiveRtdb?.unsubscribeAll?.();
      this._rtdbLiveUnsub = null;
      this._rtdbWatchKey = null;
    }

    syncTurnLiveWatch(data) {
      const TL = global.TurnLiveRtdb;
      if (!TL?.isEnabled?.() || !this.matchId || !this.game) return;

      const rush = RS().isRushPhase(data);
      const myTurn = !rush && data.currentTurnUid === this.myUid;
      const oppUid = data.currentTurnUid;
      const watchKey = `${oppUid}:${data.turnNumber || 0}`;

      if (myTurn || rush || !oppUid || data.status !== 'active') {
        this.stopTurnLiveWatch();
        return;
      }
      if (this._rtdbWatchKey === watchKey) return;

      this.stopTurnLiveWatch();
      this._rtdbWatchKey = watchKey;
      this._rtdbLiveUnsub = TL.subscribeOpponentLive(
        this.matchId,
        oppUid,
        (live) => {
          if (!live || !this.game) return;
          if (live.turnNumber !== (this.matchData?.turnNumber || 0)) return;
          if (live.byUid !== oppUid) return;
          this.game.applyTurnLiveState(live);
        }
      );
    }

    async syncTurnState(data) {
      if (!data || !this.game) return;

      this.maybeShowTurnSwapOverlay(data);

      const rush = RS().isRushPhase(data);
      const myTurn = !rush && data.currentTurnUid === this.myUid;

      if (rush) {
        this.stopTurnLiveWatch();
        this.renderTurnBar(data, 'rush');
        this.hideOppSubmission();
        if (this.preparedTurnNumber !== 'rush') {
          this.game.resetTurnBoard();
          this.preparedTurnNumber = 'rush';
        }
        this.game.setRushMode(true);
        this.game.setBoardHidden(false);
        this.els.main?.classList.remove('race-main--hidden');
        this.startTurnTimer(data);
        return;
      }

      this.game.setRushMode(false);
      this.game.setInspectMode(false);
      if (myTurn) {
        await this.maybePlayOpponentReveal(data);
        await this.game.waitForWatchReveal?.();
        this.renderTurnBar(data, 'mine');
        this.hideOppSubmission();
        this.stopTurnLiveWatch();
        if (this.preparedTurnNumber !== data.turnNumber) {
          this.game.prepareForNewTurn?.(
            data.sharedState?.locked || [],
            data.turnHistory,
            this.myUid
          );
          this.preparedTurnNumber = data.turnNumber;
        }
        this.game.syncSharedState(data.sharedState || RS().defaultSharedState());
        this.game.setBoardHidden(false);
        this.game.setMyTurn(true);
        this.els.main?.classList.remove('race-main--hidden');
      } else {
        this.renderTurnBar(data, 'waiting');
        this.hideOppSubmission();
        this.watchOpponentTurn(data);
      }

      this.syncTurnLiveWatch(data);
      this.startTurnTimer(data);
      this.updateTurnUrgencyOverlay(data);
    }

    syncTurnBarOnly(data) {
      if (!data) return;
      if (RS().isRushPhase(data)) this.renderTurnBar(data, 'rush');
      else if (data.currentTurnUid === this.myUid) this.renderTurnBar(data, 'mine');
      else this.renderTurnBar(data, 'waiting');
      this.updateTurnUrgencyOverlay(data);
    }

    startTurnTimer(data) {
      if (this.turnTimer) clearInterval(this.turnTimer);
      if (data.status !== 'active') return;
      const tick = async () => {
        if (!this.matchData || this.matchData.status !== 'active') {
          clearInterval(this.turnTimer);
          return;
        }
        const live = this.matchData;
        const rush = RS().isRushPhase(live);
        const myTurn = !rush && live.currentTurnUid === this.myUid;
        const turnKey = `${live.currentTurnUid || ''}:${live.turnNumber || 0}`;
        const now = Date.now();
        const tabHidden = global.document?.hidden === true;
        const writeCoolingDown = RS().inWriteCooldown?.() === true;
        const quotaHalted = RS().isQuotaHalted?.() === true;

        if (quotaHalted) {
          this.pauseDueToQuota();
          return;
        }

        this.syncTurnBarOnly(this.matchData);
        if (this.matchData && !this.pendingTurnSubmit) {
          this.applyLiveTurnSync(this.matchData);
        }

        // Own-turn expiry is user-critical: run before tab/cooldown guards and
        // call the same checkAnswer() path as the Check button.
        if (
          myTurn
          && this.getTurnRemainingMs(live) <= 0
          && !this.pendingTurnSubmit
          && this.game
          && !this.game.checking
          && !this.game.turnSubmitting
          && !this.game.checkedComplete
        ) {
          this.pendingTurnSubmit = true;
          debugTurn('timeout:expire-own-turn', {
            matchId: this.matchId,
            turnKey,
            turnNumber: live.turnNumber || 0,
            remainingLocalMs: this.getTurnRemainingMs(live),
            hasPlacement: this.game.hasAnyPlacement?.() === true,
          });
          try {
            await this.game.expireMyTurn?.();
          } catch (err) {
            if (RS().isQuotaError?.(err)) this._autoWritesBlocked = true;
            debugTurn('timeout:expire-own-turn:error', {
              matchId: this.matchId,
              turnKey,
              code: err?.code || null,
              message: err?.message || String(err),
            });
            console.warn('[MatchTurnApp] auto turn submit', err);
          } finally {
            this.pendingTurnSubmit = false;
          }
        }

        // Background auto-writes only (never block own-turn expiry above).
        if (writeCoolingDown || quotaHalted || this._autoWritesBlocked || tabHidden) {
          return;
        }

        if (
          !rush
          && !myTurn
          && live.currentTurnUid
          && this.getTurnElapsedMs(live) >= (RS().turnDurationMs?.(live) || 0) + TURN_EXPIRE_GRACE_MS
        ) {
          if (
            this._forceAttemptTurnKey !== turnKey
            || now - this._forceAttemptAt >= 2500
          ) {
            this._forceAttemptTurnKey = turnKey;
            this._forceAttemptAt = now;
            debugTurn('timeout:force-advance-opponent-turn', {
              matchId: this.matchId,
              turnKey,
              turnNumber: live.turnNumber || 0,
              currentTurnUid: live.currentTurnUid || null,
              remainingServerMs: RS().turnRemainingMs(live),
            });
            try {
              const applied = await RS().completeTurnWindow(this.matchId, live, 0, { localExpired: true });
              if (!applied && RS().isQuotaHalted?.()) this._autoWritesBlocked = true;
            } catch (err) {
              if (RS().isQuotaError?.(err)) this._autoWritesBlocked = true;
              debugTurn('timeout:force-advance-opponent-turn:error', {
                matchId: this.matchId,
                turnKey,
                code: err?.code || null,
                message: err?.message || String(err),
              });
              console.warn('[MatchTurnApp] force turn advance', err);
            }
          }
        }
      };
      tick();
      this.turnTimer = setInterval(tick, 250);
    }

    applyLiveTurnSync(data) {
      if (!data || !this.game || data.status !== 'active') return;
      if (RS().isRushPhase(data)) return;
      const myTurn = data.currentTurnUid === this.myUid;
      if (myTurn) {
        this.syncTurnBarOnly(data);
        this.updateTurnUrgencyOverlay(data);
        return;
      }
      if (RS().usesTurnLiveRtdb?.()) {
        this.syncTurnBarOnly(data);
        this.updateTurnUrgencyOverlay(data);
        return;
      }
      const live = data.turnLive;
      if (
        live?.byUid === data.currentTurnUid
        && live?.turnNumber === data.turnNumber
      ) {
        this.game.applyTurnLiveState(live);
      }
      this.syncTurnBarOnly(data);
      this.updateTurnUrgencyOverlay(data);
    }

    async handleDone(data) {
      if (this._resultsRendered) return;
      await this.maybePlayOpponentReveal(data);
      if (this._resultsRendered) return;
      this._resultsRendered = true;

      this.stopTurnLiveWatch();
      this.game?.setMyTurn(false);
      if (this.turnTimer) clearInterval(this.turnTimer);
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      this.hideTurnUrgencyOverlay();
      this.els.turnSwap?.classList.add('hidden');
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      if (this._countdownFallbackTimer) {
        clearTimeout(this._countdownFallbackTimer);
        this._countdownFallbackTimer = null;
      }
      this.hideOppSubmission();
      this.els.turnBar?.classList.add('hidden');
      this.els.oppHud?.classList.add('hidden');
      this._emotes?.destroy();

      const shared = data.sharedState || {};
      const opp = RS().getOpponent(data, this.myUid);
      const RUI = global.RaceResultsUI;
      let resultLine = rt('draw');
      if (data.winnerUid === this.myUid) resultLine = rt('win');
      else if (data.winnerUid) resultLine = rt('loss');
      const winnerProgress = data.winnerUid === data.player1Uid
        ? (data.player1Progress || RS().defaultProgress())
        : data.winnerUid === data.player2Uid
          ? (data.player2Progress || RS().defaultProgress())
          : null;
      const displayWord = shared.solvedWord || winnerProgress?.solvedWord || data.target;

      this.renderMain(RUI.renderResultsPanel({
        resultLine,
        resultKind: data.winnerUid === this.myUid ? 'win' : data.winnerUid ? 'loss' : 'draw',
        winnerUid: data.winnerUid,
        battleXpMode: data.winnerUid === this.myUid ? 'koreanMatch' : '',
        battleMatchId: this.matchId,
        battleQuestMode: 'turn',
        battleFriend: true,
        players: [
          { uid: this.myUid, name: rt('me'), statHtml: `${shared.guessCount || 0} ${escapeHtml(rt('turns'))}` },
          { uid: opp?.uid, name: opp?.name || rt('opponent'), statHtml: `${shared.guessCount || 0} ${escapeHtml(rt('turns'))}` },
        ],
        answerTilesHtml: RUI.buildMatchWinTiles(displayWord),
        answerLabel: rt('answerLabel'),
        rematchLabel: rt('rematch'),
        profileLabel: rt('profileLink'),
        profileHref: 'index.html',
      }));

      RUI.afterResultsMount(this.els.main);
      void RUI.fillAnswerMeaning(this.els.main, displayWord);
      this.mountRematchUi();
    }
  }

  global.MatchTurnApp = MatchTurnApp;
  global.addEventListener('pagehide', () => {
    if (global.__matchTurnAppInstance) global.__matchTurnAppInstance.destroy();
  });
})(typeof window !== 'undefined' ? window : globalThis);
