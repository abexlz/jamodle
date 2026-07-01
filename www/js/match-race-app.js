/**
 * Korean Match 1v1 race — waiting room, countdown, game, results.
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  const RC = () => global.RaceCountdown;
  const COUNTDOWN_SEC = 3;
  const countdownTotalMs = () => RC()?.countdownTotalMs?.(COUNTDOWN_SEC) ?? (COUNTDOWN_SEC + 1) * 1000;

  function rt(key, vars) {
    return global.I18n?.t('matchRace.' + key, vars) ?? '';
  }

  function ct(key) {
    return global.I18n?.t('common.' + key) ?? '';
  }

  function modeLabel(data) {
    const n = RS().getMatchWordLength?.(data) ?? global.MatchWords?.normalizeWordLength?.(data?.matchMode) ?? 4;
    return global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
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

  class MatchRaceApp {
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
      this.renderMain(`
        <div class="race-panel">
          <p class="race-panel-title">${escapeHtml(rt('loading'))}</p>
        </div>
      `);
      this.matchUnsub = RS().subscribeMatch(
        this.matchId,
        (data) => this.onMatchUpdate(data),
        (err) => {
          console.error('[MatchRaceApp]', err);
          const detail = err?.code === 'permission-denied'
            ? rt('permissionDenied')
            : rt('loadFailed');
          this.renderError(detail);
        }
      );
    }

    destroy() {
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
      global.KoreanMatchDrag?.end?.();
      if (this.game) {
        this.game.destroy();
        this.game = null;
      }
    }

    onLocaleChange() {
      document.title = rt('pageTitle');
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
          <a class="race-back" href="profile.html">${escapeHtml(rt('backProfile'))}</a>
          <h1>${escapeHtml(rt('title'))}</h1>
          <a class="race-settings-link" href="settings.html" aria-label="${escapeHtml(global.I18n?.t('nav.settings') || 'Settings')}">⚙️</a>
        </header>
        <div id="race-opponent-bar" class="race-opponent-bar hidden" aria-live="polite"></div>
        <div id="race-main" class="race-main"></div>
        <div id="race-countdown" class="race-countdown hidden" aria-live="assertive"></div>
      `;
      this.els = {
        opponentBar: this.root.querySelector('#race-opponent-bar'),
        main: this.root.querySelector('#race-main'),
        countdown: this.root.querySelector('#race-countdown'),
      };
    }

    renderError(msg) {
      this.root.innerHTML = `
        <div class="race-panel">
          <p class="race-panel-msg">${escapeHtml(msg)}</p>
          <a class="race-btn" href="profile.html">${escapeHtml(rt('backToProfile'))}</a>
        </div>
      `;
    }

    matchModeLabel(data) {
      return modeLabel(data);
    }

    onMatchUpdate(data) {
      if (!data) {
        this.phase = 'cancelled';
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-msg">${escapeHtml(rt('matchCancelled'))}</p>
            <a class="race-btn" href="profile.html">${escapeHtml(rt('backToProfile'))}</a>
          </div>
        `);
        return;
      }

      if (!RS().isKoreanMatch(data)) {
        global.location.replace(RS().getMatchPageUrl(data.id, data));
        return;
      }

      if (RS().isTurnBased(data)) {
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

      this.renderOpponentBar(data);

      if (data.status === 'pending') {
        this.phase = 'pending';
        this.handlePending(data, isP1);
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
        this.handleDone(data, isP1);
      }
    }

    renderOpponentBar(data) {
      const opp = RS().getOpponent(data, this.myUid);
      if (!opp || !this.els.opponentBar) return;

      const count = opp.progress?.guessCount || 0;
      const finished = opp.progress?.finished;
      let statusText = '';
      if (finished && opp.progress?.won === true) statusText = rt('oppDone');
      else if (finished) statusText = rt('oppGaveUp');

      this.els.opponentBar.classList.remove('hidden');
      this.els.opponentBar.innerHTML = `
        <span class="race-opp-name">${escapeHtml(opp.name)}</span>
        <span class="race-opp-attempts">${escapeHtml(rt('oppAttempts', { count }))}</span>
        <span class="race-opp-status">${statusText}</span>
      `;

      if (this.game && opp.progress?.won === true && !this.game.checkedComplete) {
        this.game.setEnabled(false);
        this.game.feedback?.show('info', rt('oppFinishedFirst'));
      }
    }

    renderMain(html) {
      if (this.els.main) this.els.main.innerHTML = html;
    }

    handlePending(data, isP1) {
      const mode = this.matchModeLabel(data);
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
            global.location.href = 'profile.html';
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
      const mode = this.matchModeLabel(data);

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
      const startMs = RS().startedAtMs(data);
      if (!startMs) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p>
          </div>
        `);
        return;
      }

      const raceStartMs = startMs + countdownTotalMs();
      const now = Date.now();

      if (now < raceStartMs) {
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
        this.renderOpponentBar(data);
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
      if (!data?.target) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-msg">${escapeHtml(rt('loadFailed'))}</p>
          </div>
        `);
        return;
      }
      this.gameStarted = true;
      this.els.countdown?.classList.add('hidden');

      this.renderMain('<div id="match-app" class="match-race-game"></div>');
      const gameRoot = this.root.querySelector('#match-app');

      this.game = new global.KoreanMatchGame(gameRoot, {
        versus: true,
        raceControlled: true,
        wordLength: RS().getMatchWordLength(data),
        mode: RS().getMatchWordLength(data),
        fixedWord: data.target,
        onProgress: async ({ guessCount, won, elapsedMs }) => {
          await RS().updateMyProgress(this.matchId, isP1, { guessCount, elapsedMs });
          if (won) {
            await RS().markFinished(this.matchId, isP1, true);
          }
        },
        onFinished: async ({ won, guessCount, elapsedMs }) => {
          await RS().updateMyProgress(this.matchId, isP1, { guessCount, elapsedMs });
          await RS().markFinished(this.matchId, isP1, won);
        },
      });
      this.game.mount();
      this.game.setEnabled(true);
    }

    handleDone(data, isP1) {
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
        players: [
          {
            uid: this.myUid,
            name: rt('me'),
            statHtml: `${myProgress.guessCount} ${escapeHtml(rt('attempts'))} · ${escapeHtml(formatTime(elapsedFor(myProgress)))}`,
          },
          {
            uid: opp?.uid,
            name: opp?.name || rt('opponent'),
            statHtml: `${oppProgress.guessCount} ${escapeHtml(rt('attempts'))} · ${escapeHtml(formatTime(elapsedFor(oppProgress)))}`,
          },
        ],
        answerTilesHtml: RUI.buildMatchWinTiles(data.target),
        answerLabel: rt('answerLabel'),
        rematchLabel: rt('rematch'),
        profileLabel: rt('profileLink'),
      }));

      this.root.querySelector('#race-rematch')?.addEventListener('click', async () => {
        const oppUid = isP1 ? data.player2Uid : data.player1Uid;
        try {
          const newId = await RS().createMatch(oppUid, {
            gameType: RS().GAME_TYPES.koreanMatch,
            wordLength: RS().getMatchWordLength(data),
            excludeTarget: data.target,
          });
          global.location.href = RS().getMatchPageUrl(newId, { gameType: RS().GAME_TYPES.koreanMatch });
        } catch {
          alert(rt('rematchFailed'));
        }
      });
    }
  }

  global.MatchRaceApp = MatchRaceApp;

  global.addEventListener('pagehide', () => {
    if (global.__matchRaceAppInstance) global.__matchRaceAppInstance.destroy();
  });
})(typeof window !== 'undefined' ? window : globalThis);
