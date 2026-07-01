/**
 * Turn-based Korean Match — instant turn switch, reveal modes, turn results grid.
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  const RC = () => global.RaceCountdown;
  const COUNTDOWN_SEC = 3;
  const TURN_EXPIRE_GRACE_MS = 3000;
  const countdownTotalMs = () => RC()?.countdownTotalMs?.(COUNTDOWN_SEC) ?? (COUNTDOWN_SEC + 1) * 1000;

  function rt(key, vars) {
    const t = global.I18n?.t;
    if (!t) return '';
    const turn = t('matchTurn.' + key, vars);
    if (turn) return turn;
    const race = t('matchRace.' + key, vars);
    if (race) return race;
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
      this.browseHistoryIdx = null;
      this._browseFollowLatest = true;
      this._localeOff = null;
      this._prevTurnBoundaryKey = null;
      this._turnSwapTimer = null;
      this._lastUrgencySec = null;
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

      document.title = rt('pageTitle');
      this.renderShell();
      this.renderMain(`<div class="race-panel"><p class="race-panel-title">${escapeHtml(rt('loading'))}</p></div>`);

      this.matchUnsub = RS().subscribeMatch(
        this.matchId,
        (data) => this.onMatchUpdate(data),
        (err) => {
          console.error('[MatchTurnApp]', err);
          this.renderError(err?.code === 'permission-denied' ? rt('permissionDenied') : rt('loadFailed'));
        }
      );
    }

    destroy() {
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
      this.game?.destroy();
    }

    onLocaleChange() {
      document.title = rt('pageTitle');
      if (this.matchData) this.onMatchUpdate(this.matchData);
    }

    renderShell() {
      this.root.innerHTML = `
        <header class="race-header">
          <a class="race-back" href="index.html">${escapeHtml(rt('backHome'))}</a>
          <h1>${escapeHtml(rt('title'))}</h1>
          <a class="race-settings-link" href="settings.html" aria-label="${escapeHtml(global.I18n?.t('nav.settings') || 'Settings')}">⚙️</a>
        </header>
        <div id="race-turn-urgency" class="race-turn-urgency hidden" aria-hidden="true"></div>
        <div id="race-turn-swap" class="race-turn-swap hidden" aria-live="assertive"></div>
        <div id="race-turn-previous" class="race-turn-previous race-turn-previous--arrows" aria-live="polite"></div>
        <div id="race-main" class="race-main"></div>
        <div id="race-countdown" class="race-countdown hidden" aria-live="assertive"></div>
      `;
      this.els = {
        turnBar: null,
        turnUrgency: this.root.querySelector('#race-turn-urgency'),
        turnSwap: this.root.querySelector('#race-turn-swap'),
        turnPrevious: this.root.querySelector('#race-turn-previous'),
        main: this.root.querySelector('#race-main'),
        countdown: this.root.querySelector('#race-countdown'),
      };
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
      }
      this._lastTurnKey = turnKey;
      if (data.player1Uid !== this.myUid && data.player2Uid !== this.myUid) {
        this.renderError(rt('notParticipant'));
        return;
      }

      if (data.status === 'pending') return this.handlePending(data, this.isP1);
      if (data.status === 'ready') {
        RS().tryActivateMatch(this.matchId, data);
        return this.handleReady(data, this.isP1);
      }
      if (data.status === 'active') {
        return this.handleActive(data);
      }
      if (data.status === 'done') return this.handleDone(data, this.isP1);
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
        RS().tryActivateMatch(this.matchId, data);
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
      const startMs = RS().startedAtMs(data);
      if (!startMs) {
        this.renderMain(`<div class="race-panel"><p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p></div>`);
        return;
      }
      const raceStartMs = startMs + countdownTotalMs();
      if (Date.now() < raceStartMs) {
        this.renderMain(`<div class="race-panel race-countdown-panel"><p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p></div>`);
        this.showCountdown(raceStartMs, () => this.startGame(data));
        return;
      }
      if (!this.gameStarted) this.startGame(data);
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

    startGame(data) {
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
        onTurnSubmit: async (payload) => {
          await RS().submitTurn(this.matchId, this.myUid, payload);
        },
      });
      this.game.mount();
      this.ensureTurnBar();
      this.mountTurnBarToDock();
      this.syncTurnState(data);
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

      if (mode === 'rush') {
        label = rt('rushPhase');
        pct = 100;
        myTurnStyle = true;
      } else if (mode === 'waiting') {
        label = rt('oppTurn', { name: opp?.name || rt('opponent') });
      } else if (mode === 'mine') {
        label = rt('yourTurn');
        pct = Math.round((1 - RS().turnElapsedRatio(data)) * 100);
        myTurnStyle = true;
      }

      if (mode !== 'rush' && data.currentTurnUid) {
        const sec = Math.ceil(RS().turnRemainingMs(data) / 1000);
        timerHtml = `<span class="race-turn-timer">${escapeHtml(rt('timeLeft', { s: sec }))}</span>`;
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

      const remainingMs = RS().turnRemainingMs(data);
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

    renderPreviousPanel(data) {
      const el = this.els.turnPrevious;
      if (!el || !this.gameStarted) return;
      this.renderPreviousPanelArrows(data);
    }

    renderPreviousPanelArrows(data) {
      const el = this.els.turnPrevious;
      const history = data.turnHistory || [];

      if (this._browseFollowLatest) {
        this.browseHistoryIdx = history.length ? history.length - 1 : null;
      } else if (this.browseHistoryIdx != null && history.length) {
        this.browseHistoryIdx = Math.max(0, Math.min(this.browseHistoryIdx, history.length - 1));
      }

      const idx = this.browseHistoryIdx;
      const entry = idx != null && history[idx] ? history[idx] : null;

      const sig = [
        'arrows',
        idx,
        this._browseFollowLatest,
        history.length,
        entry?.turnNumber,
        entry?.byUid,
        entry?.correctCount,
        entry?.totalPlaced,
        (entry?.placements || []).map((p) => `${p.syl}${p.zone}${p.char}${p.correct ? 1 : 0}`).join(''),
        data.target,
      ].join('|');

      if (sig === this._previousPanelSig && el.childElementCount) return;
      this._previousPanelSig = sig;

      el.classList.remove('hidden');

      const boardHtml = this.game?.getReplayBoardHtml?.(entry)
        || `<div class="race-turn-previous-empty">${escapeHtml(rt('noTurnsYet'))}</div>`;

      let meta = rt('noTurnsYet');
      if (entry) {
        const who = entry.byUid === this.myUid ? rt('me') : (entry.byName || rt('opponent'));
        const stat = rt('historyStat', {
          correct: entry.correctCount ?? 0,
          total: entry.totalPlaced ?? 0,
        });
        meta = rt('historyViewTurn', {
          n: entry.turnNumber || idx + 1,
          name: who,
        }) + ` · ${stat}`;
      }

      const canPrev = idx != null && idx > 0;
      const canNext = idx != null && idx < history.length - 1;

      el.innerHTML = `
        <div class="race-turn-previous-row">
          <button type="button" class="race-turn-previous-nav-btn" id="race-prev-turn"
            ${canPrev ? '' : 'disabled'} aria-label="${escapeHtml(rt('historyPrev'))}">‹</button>
          <div class="race-turn-previous-board${entry ? '' : ' race-turn-previous-board--empty'}" role="img"
            aria-label="${escapeHtml(entry ? meta : rt('noTurnsYet'))}">${boardHtml}</div>
          <button type="button" class="race-turn-previous-nav-btn" id="race-next-turn"
            ${canNext ? '' : 'disabled'} aria-label="${escapeHtml(rt('historyNext'))}">›</button>
        </div>
        <p class="race-turn-previous-meta">${escapeHtml(meta)}</p>
      `;

      el.querySelector('#race-prev-turn')?.addEventListener('click', () => {
        if (this.browseHistoryIdx == null || this.browseHistoryIdx <= 0) return;
        this._browseFollowLatest = false;
        this.browseHistoryIdx -= 1;
        this.renderPreviousPanel(data);
      });
      el.querySelector('#race-next-turn')?.addEventListener('click', () => {
        if (this.browseHistoryIdx == null || this.browseHistoryIdx >= history.length - 1) return;
        this.browseHistoryIdx += 1;
        if (this.browseHistoryIdx >= history.length - 1) {
          this._browseFollowLatest = true;
        }
        this.renderPreviousPanel(data);
      });
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

    syncTurnState(data) {
      if (!data || !this.game) return;

      this.maybeShowTurnSwapOverlay(data);

      const rush = RS().isRushPhase(data);
      const myTurn = !rush && data.currentTurnUid === this.myUid;
      const lastReveal = data.lastTurnReveal;
      const iSubmittedLast = lastReveal?.byUid === this.myUid && !myTurn && !rush;

      this.renderPreviousPanel(data);

      if (rush) {
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

      if (iSubmittedLast) {
        this.renderTurnBar(data, 'waiting');
        this.hideOppSubmission();
        this.enterPrepBoard(data);
        this.startTurnTimer(data);
        return;
      }

      if (myTurn) {
        this.renderTurnBar(data, 'mine');
        this.hideOppSubmission();
        if (this.preparedTurnNumber !== data.turnNumber) {
          this.game.resetTurnBoard();
          this.game.applyAutofillFromHistory?.(data.turnHistory, this.myUid);
          this.preparedTurnNumber = data.turnNumber;
        }
        this.game.syncSharedState(data.sharedState || RS().defaultSharedState());
        this.game.setBoardHidden(false);
        this.game.setMyTurn(true);
        this.els.main?.classList.remove('race-main--hidden');
      } else {
        this.renderTurnBar(data, 'waiting');
        this.hideOppSubmission();
        this.enterPrepBoard(data);
      }

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
      this.turnTimer = setInterval(async () => {
        if (!this.matchData || this.matchData.status !== 'active') {
          clearInterval(this.turnTimer);
          return;
        }
        const live = this.matchData;
        const rush = RS().isRushPhase(live);
        const myTurn = !rush && live.currentTurnUid === this.myUid;

        if (
          myTurn
          && RS().turnRemainingMs(live) <= 0
          && !this.pendingTurnSubmit
        ) {
          this.pendingTurnSubmit = true;
          try {
            const submitted = await this.game?.submitTurnOnTimeout?.();
            if (!submitted) {
              await RS().completeTurnWindow(this.matchId, this.matchData);
            }
          } catch (err) {
            console.warn('[MatchTurnApp] auto turn submit', err);
            await RS().completeTurnWindow(this.matchId, this.matchData);
          } finally {
            this.pendingTurnSubmit = false;
          }
        } else if (
          !myTurn
          && live.currentTurnUid
          && RS().turnRemainingMs(live) <= -TURN_EXPIRE_GRACE_MS
          && !this.pendingTurnSubmit
        ) {
          await RS().completeTurnWindow(this.matchId, this.matchData);
        }
        this.syncTurnBarOnly(this.matchData);
        if (this.matchData) this.syncTurnState(this.matchData);
      }, 200);
    }

    handleDone(data, isP1) {
      this.game?.setMyTurn(false);
      if (this.turnTimer) clearInterval(this.turnTimer);
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      this.hideTurnUrgencyOverlay();
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
      this.els.turnPrevious?.classList.add('hidden');

      const shared = data.sharedState || {};
      const opp = RS().getOpponent(data, this.myUid);
      const RUI = global.RaceResultsUI;
      let resultLine = rt('draw');
      if (data.winnerUid === this.myUid) resultLine = rt('win');
      else if (data.winnerUid) resultLine = rt('loss');

      this.renderMain(RUI.renderResultsPanel({
        resultLine,
        resultKind: data.winnerUid === this.myUid ? 'win' : data.winnerUid ? 'loss' : 'draw',
        winnerUid: data.winnerUid,
        players: [
          { uid: this.myUid, name: rt('me'), statHtml: `${shared.guessCount || 0} ${escapeHtml(rt('turns'))}` },
          { uid: opp?.uid, name: opp?.name || rt('opponent'), statHtml: `${shared.guessCount || 0} ${escapeHtml(rt('turns'))}` },
        ],
        answerTilesHtml: RUI.buildMatchWinTiles(data.target),
        answerLabel: rt('answerLabel'),
        rematchLabel: rt('rematch'),
        profileLabel: rt('profileLink'),
        profileHref: 'index.html',
      }));

      this.root.querySelector('#race-rematch')?.addEventListener('click', async () => {
        const wordLength = RS().getMatchWordLength(data);
        try {
          const newId = await RS().createMatch(isP1 ? data.player2Uid : data.player1Uid, {
            gameType: RS().GAME_TYPES.koreanMatch,
            wordLength,
            playMode: RS().PLAY_MODES.turn,
            excludeTarget: data.target,
          });
          global.location.href = RS().getMatchPageUrl(newId, {
            gameType: RS().GAME_TYPES.koreanMatch,
            playMode: RS().PLAY_MODES.turn,
          });
        } catch {
          alert(rt('rematchFailed'));
        }
      });
    }
  }

  global.MatchTurnApp = MatchTurnApp;
  global.addEventListener('pagehide', () => {
    if (global.__matchTurnAppInstance) global.__matchTurnAppInstance.destroy();
  });
})(typeof window !== 'undefined' ? window : globalThis);
