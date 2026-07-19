/**
 * Jamo Game turn-based 1v1 vs Bot — local match with adjustable win rate.
 * Dev-only. No Firestore; turn state is simulated in-memory.
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  const RC = () => global.RaceCountdown;
  const HUD = () => global.RaceBattleHudUI;
  const HC = () => global.HangulCompose;
  const MY_UID = 'player';
  const BOT_UID = 'bot';
  const COUNTDOWN_SEC = 3;

  const SPEED_PROFILES = {
    slow: {
      readMin: 1800,
      readMax: 4200,
      placeMin: 700,
      placeMax: 2200,
      longPauseMin: 2200,
      longPauseMax: 4000,
      rethinkMin: 900,
      rethinkMax: 2000,
      wrongHold: 900,
    },
    medium: {
      readMin: 900,
      readMax: 2200,
      placeMin: 350,
      placeMax: 1100,
      longPauseMin: 1400,
      longPauseMax: 2800,
      rethinkMin: 500,
      rethinkMax: 1200,
      wrongHold: 650,
    },
    fast: {
      readMin: 400,
      readMax: 1000,
      placeMin: 180,
      placeMax: 550,
      longPauseMin: 700,
      longPauseMax: 1400,
      rethinkMin: 280,
      rethinkMax: 650,
      wrongHold: 420,
    },
  };

  const WRONG_JAMO = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ';

  function rt(key, vars) {
    const t = global.I18n?.t;
    if (!t) return '';
    const turn = t('matchTurn.' + key, vars);
    if (turn) return turn;
    const matchRace = t('matchRace.' + key, vars);
    if (matchRace) return matchRace;
    return t('race.' + key, vars) || '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function placementKey(p) {
    return `${p.syl}:${p.zone}:${p.subIndex ?? 0}`;
  }

  function mergeSharedLocked(existing, payload) {
    const map = new Map();
    (existing || []).forEach((p) => {
      if (p?.char != null) map.set(placementKey(p), p);
    });
    const add = (p) => {
      if (!p?.correct || p?.char == null) return;
      const key = placementKey(p);
      const prev = map.get(key);
      map.set(key, {
        syl: p.syl,
        zone: p.zone,
        subIndex: p.subIndex ?? 0,
        char: p.char,
        tileId: p.tileId || prev?.tileId || null,
      });
    };
    (payload?.locked || []).forEach((p) => {
      if (p?.char != null) map.set(placementKey(p), p);
    });
    (payload?.placements || []).forEach(add);
    return [...map.values()];
  }

  function buildTurnHistoryEntry(data, uid, payload, turnNumber) {
    const isP1 = data.player1Uid === uid;
    return {
      turnNumber: turnNumber || data.turnNumber || 1,
      byUid: uid,
      byName: isP1 ? data.player1Name : data.player2Name,
      timedOut: false,
      placements: payload.placements || [],
      correctCount: payload.correctCount || 0,
      totalPlaced: payload.totalPlaced || 0,
      syllableCorrect: payload.syllableCorrect || [],
      syllableCorrectCount: payload.syllableCorrectCount ?? 0,
      syllableTotal: payload.syllableTotal ?? 0,
      locked: payload.locked || [],
    };
  }

  function pickTarget(wordLength) {
    const len = global.MatchWords?.normalizeWordLength?.(wordLength) ?? 4;
    const pool = global.MatchWords?.getWordsForLength?.(len) || [];
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    return len === 1 ? '책' : len === 2 ? '사과' : len === 6 ? '대한민국' : '고양이';
  }

  function iterTargetZones(target) {
    const syllables = HC().decomposeWordForMatch(target);
    const zones = [];
    syllables.forEach((sylData, si) => {
      if (sylData.cho) {
        zones.push({ syl: si, zone: 'cho', subIndex: 0, expected: sylData.cho });
      }
      (sylData.vowelSlots || []).forEach((vs) => {
        if (vs.expected) {
          zones.push({
            syl: si,
            zone: vs.zoneType,
            subIndex: vs.subIndex ?? 0,
            expected: vs.expected,
          });
        }
      });
      if (sylData.jong) {
        zones.push({ syl: si, zone: 'jong', subIndex: 0, expected: sylData.jong });
      }
    });
    return zones;
  }

  function pickWrongChar(correct) {
    const options = [...WRONG_JAMO].filter((c) => c !== correct);
    return options[Math.floor(Math.random() * options.length)] || 'ㄱ';
  }

  function buildPlacements(target, locked, { wrong = false, partial = false } = {}) {
    const lockedKeys = new Set((locked || []).map((p) => placementKey(p)));
    const zones = iterTargetZones(target).filter((z) => !lockedKeys.has(placementKey(z)));
    if (!zones.length) return [];

    let activeZones = zones;
    if (partial) {
      const syls = [...new Set(zones.map((z) => z.syl))];
      const syl = syls[Math.floor(Math.random() * syls.length)];
      activeZones = zones.filter((z) => z.syl === syl);
    }

    const placements = activeZones.map((z) => {
      const char = wrong ? pickWrongChar(z.expected) : z.expected;
      const correct = char === z.expected;
      return {
        syl: z.syl,
        zone: z.zone,
        subIndex: z.subIndex,
        char,
        correct,
        locked: false,
        tileId: null,
      };
    });

    if (wrong) {
      const idx = Math.floor(Math.random() * placements.length);
      placements[idx].char = pickWrongChar(placements[idx].expected || activeZones[idx].expected);
      placements[idx].correct = false;
    }

    return placements;
  }

  function computeSyllableMask(placements, target) {
    const syllableTotal = [...target].filter((c) => HC().isHangulSyllable(c)).length;
    const bySyl = new Map();
    placements.forEach((p) => {
      if (!p.correct) return;
      if (!bySyl.has(p.syl)) bySyl.set(p.syl, []);
      bySyl.get(p.syl).push(p);
    });
    const mask = Array(syllableTotal).fill(false);
    bySyl.forEach((items, si) => {
      const expected = iterTargetZones(target).filter((z) => z.syl === si);
      if (!expected.length) return;
      const placed = new Set(items.map((p) => placementKey(p)));
      if (expected.every((z) => placed.has(placementKey(z)))) mask[si] = true;
    });
    return mask;
  }

  function finalizePayload(placements, target, won = false) {
    const correctCount = placements.filter((p) => p.correct).length;
    const syllableCorrect = computeSyllableMask(placements, target);
    return {
      locked: [],
      placements,
      correctCount,
      totalPlaced: placements.length,
      syllableCorrect,
      syllableCorrectCount: syllableCorrect.filter(Boolean).length,
      syllableTotal: syllableCorrect.length,
      won,
      solvedWord: won ? target : undefined,
    };
  }

  function isWinningSubmission(placements, locked, target) {
    const map = new Map();
    (locked || []).forEach((p) => map.set(placementKey(p), p.char));
    placements.forEach((p) => map.set(placementKey(p), p.char));
    return iterTargetZones(target).every((z) => map.get(placementKey(z)) === z.expected);
  }

  class MatchTurnBotApp {
    constructor(rootEl) {
      this.root = rootEl;
      const params = new URLSearchParams(global.location.search);
      const wr = Number(params.get('winrate'));
      this.winRate = Number.isFinite(wr) ? Math.min(100, Math.max(0, wr)) / 100 : 0.5;
      const speedParam = String(params.get('speed') || 'medium').toLowerCase();
      this.speed = SPEED_PROFILES[speedParam] ? speedParam : 'medium';
      const wl = Number(params.get('wordLength'));
      this.wordLength = global.MatchWords?.normalizeWordLength?.(wl) ?? 4;
      this.matchId = `bot-${Date.now()}`;

      this.game = null;
      this.els = null;
      this.matchData = null;
      this.countdownDone = false;
      this.gameStarted = false;
      this.preparedTurnNumber = null;
      this.pendingTurnSubmit = false;
      this._playedRevealKey = null;
      this._prevTurnBoundaryKey = null;
      this._turnSwapTimer = null;
      this._lastUrgencySec = null;
      this._turnLocalKey = null;
      this._turnLocalStartMs = null;
      this._observedAnyTurn = false;
      this._resultsRendered = false;
      this.turnTimer = null;
      this.countdownTimer = null;
      this._botTimers = [];
      this._botTurnRunning = false;
      this._localeOff = null;
    }

    myUid() {
      return MY_UID;
    }

    botName() {
      const speedLabel = this.speed.charAt(0).toUpperCase() + this.speed.slice(1);
      return `🤖 Bot ${Math.round(this.winRate * 100)}% · ${speedLabel}`;
    }

    speedProfile() {
      return SPEED_PROFILES[this.speed] || SPEED_PROFILES.medium;
    }

    async init() {
      this._localeOff = global.I18n?.onChange?.(() => this.onLocaleChange());
      document.title = rt('pageTitle');
      this.renderShell();

      if (global.DevBuild && !global.DevBuild.isDevModeActive()) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-msg">Bot fight is only available in dev mode.</p>
            <a class="race-btn" href="index.html">← Home</a>
          </div>
        `);
        return;
      }

      const target = pickTarget(this.wordLength);
      this.matchData = {
        gameType: RS().GAME_TYPES.koreanMatch,
        playMode: RS().PLAY_MODES.turn,
        status: 'active',
        target,
        wordLength: this.wordLength,
        player1Uid: MY_UID,
        player2Uid: BOT_UID,
        player1Name: rt('me'),
        player2Name: this.botName(),
        currentTurnUid: MY_UID,
        turnNumber: 1,
        turnDurationMs: RS().turnDurationForLength(this.wordLength),
        turnPhase: RS().TURN_PHASES.playing,
        sharedState: RS().defaultSharedState(),
        turnHistory: [],
        lastTurnReveal: null,
        turnLive: null,
      };

      this.renderMain(`<div class="race-panel race-countdown-panel"><p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p></div>`);
      const raceStartMs = Date.now() + (RC()?.countdownTotalMs?.(COUNTDOWN_SEC) ?? 4000);
      RC()?.runCountdown?.(this, {
        el: this.els.countdown,
        raceStartMs,
        countdownSec: COUNTDOWN_SEC,
        onDone: () => this.startGame(true),
        goLabel: rt('go'),
      });
    }

    destroy() {
      this.clearBotTimers();
      this._localeOff?.();
      if (this.turnTimer) clearInterval(this.turnTimer);
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      if (this.countdownTimer) clearInterval(this.countdownTimer);
      global.KoreanMatchDrag?.end?.();
      this.game?.destroy();
    }

    onLocaleChange() {
      document.title = rt('pageTitle');
      if (this.matchData?.status === 'done') this._resultsRendered = false;
      if (this.matchData) this.onMatchUpdate(this.matchData);
    }

    renderShell() {
      const hud = HUD()?.shellMarkup?.({ showScores: false, emoteSlot: false }) || '';
      this.root.innerHTML = `
        <header class="race-header">
          <a class="race-back" href="index.html">${escapeHtml(rt('backHome'))}</a>
          <h1>${escapeHtml(rt('title'))} · BOT</h1>
          <a class="race-settings-link" href="settings.html" aria-label="Settings">⚙️</a>
        </header>
        ${hud}
        <div id="race-turn-urgency" class="race-turn-urgency hidden" aria-hidden="true"></div>
        <div id="race-turn-swap" class="race-turn-swap hidden" aria-live="assertive"></div>
        <div id="race-main" class="race-main"></div>
        <div id="race-countdown" class="race-countdown hidden" aria-live="assertive"></div>
      `;
      this.els = {
        main: this.root.querySelector('#race-main'),
        countdown: this.root.querySelector('#race-countdown'),
        battleHud: this.root.querySelector('#race-battle-hud'),
        centerTitle: this.root.querySelector('#race-center-title'),
        centerSub: this.root.querySelector('#race-center-sub'),
        turnUrgency: this.root.querySelector('#race-turn-urgency'),
        turnSwap: this.root.querySelector('#race-turn-swap'),
        turnBar: null,
      };
    }

    renderMain(html) {
      if (this.els?.main) this.els.main.innerHTML = html;
    }

    turnModeLabel(data) {
      const n = global.MatchWords?.normalizeWordLength?.(data?.wordLength) ?? this.wordLength;
      return global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
    }

    startGame(anchorTimerNow = false) {
      if (this.gameStarted || !this.matchData) return;
      this.gameStarted = true;
      this.els.countdown?.classList.add('hidden');
      this.renderMain(`
        <section class="race-turn-mine" aria-label="${escapeHtml(rt('mineSection'))}">
          <div id="match-app" class="match-race-game"></div>
        </section>
      `);
      const data = this.matchData;
      this.game = new global.KoreanMatchGame(this.root.querySelector('#match-app'), {
        versus: true,
        turnBased: true,
        raceControlled: true,
        wordLength: data.wordLength,
        mode: data.wordLength,
        fixedWord: data.target,
        sharedSeed: this.matchId,
        onTurnSubmit: async (payload) => {
          const applied = this.applyPlayerTurn(payload);
          if (!applied) throw new Error('turn-not-applied');
        },
        onTurnLiveChange: () => {},
      });
      this.game.mount();
      requestAnimationFrame(() => {
        this.game?.syncDockTileSize?.();
        requestAnimationFrame(() => this.game?.syncDockTileSize?.());
      });
      this.ensureTurnBar();
      this.mountTurnBarToDock();
      if (anchorTimerNow) this.anchorTurnTimerNow(data);
      this.syncTurnState(data);
      this.renderBattleHud(data);
    }

    renderBattleHud(data) {
      HUD()?.updateBattleHud?.(data, {
        els: this.els,
        myUid: MY_UID,
        matchId: this.matchId,
        onOpp: () => {
          if (this.els.centerTitle) this.els.centerTitle.textContent = this.turnModeLabel(data);
          if (this.els.centerSub) {
            this.els.centerSub.textContent = rt('turnNumber', { n: data.turnNumber || 1 });
          }
        },
      });
    }

    applyPlayerTurn(payload) {
      const data = this.matchData;
      if (!data || data.status !== 'active') return false;
      if (data.currentTurnUid !== MY_UID) return false;

      const turnNum = data.turnNumber || 1;
      const historyEntry = buildTurnHistoryEntry(data, MY_UID, payload, turnNum);
      const shared = {
        guessCount: (data.sharedState?.guessCount || 0) + 1,
        locked: mergeSharedLocked(data.sharedState?.locked, payload),
        over: !!payload.won,
        winnerUid: payload.won ? MY_UID : null,
        ...(payload.solvedWord ? { solvedWord: payload.solvedWord } : {}),
      };

      if (payload.won) {
        this.matchData = {
          ...data,
          status: 'done',
          winnerUid: MY_UID,
          sharedState: shared,
          lastTurnReveal: historyEntry,
          turnHistory: [...(data.turnHistory || []), historyEntry],
          currentTurnUid: MY_UID,
          turnLive: null,
        };
      } else {
        this.matchData = {
          ...data,
          sharedState: shared,
          currentTurnUid: BOT_UID,
          turnNumber: turnNum + 1,
          lastTurnReveal: historyEntry,
          turnHistory: [...(data.turnHistory || []), historyEntry],
          turnLive: null,
        };
      }
      this.preparedTurnNumber = null;
      this.onMatchUpdate(this.matchData);
      return true;
    }

    applyBotTurn(payload) {
      const data = this.matchData;
      if (!data || data.status !== 'active') return false;
      if (data.currentTurnUid !== BOT_UID) return false;

      const turnNum = data.turnNumber || 1;
      const historyEntry = buildTurnHistoryEntry(data, BOT_UID, payload, turnNum);
      const shared = {
        guessCount: (data.sharedState?.guessCount || 0) + 1,
        locked: mergeSharedLocked(data.sharedState?.locked, payload),
        over: !!payload.won,
        winnerUid: payload.won ? BOT_UID : null,
        ...(payload.won ? { solvedWord: payload.solvedWord || data.target } : {}),
      };

      if (payload.won) {
        this.matchData = {
          ...data,
          status: 'done',
          winnerUid: BOT_UID,
          sharedState: shared,
          lastTurnReveal: historyEntry,
          turnHistory: [...(data.turnHistory || []), historyEntry],
          currentTurnUid: BOT_UID,
          turnLive: null,
        };
      } else {
        this.matchData = {
          ...data,
          sharedState: shared,
          currentTurnUid: MY_UID,
          turnNumber: turnNum + 1,
          lastTurnReveal: historyEntry,
          turnHistory: [...(data.turnHistory || []), historyEntry],
          turnLive: null,
        };
      }
      this.preparedTurnNumber = null;
      this._botTurnRunning = false;
      this.onMatchUpdate(this.matchData);
      return true;
    }

    onMatchUpdate(data) {
      if (!data) return;
      if (data.status === 'done') {
        this.handleDone(data);
        return;
      }
      if (data.status === 'active' && this.gameStarted) {
        this.syncTurnState(data);
        this.renderBattleHud(data);
      }
    }

    currentTurnKey(data) {
      return `${data?.currentTurnUid || ''}:${data?.turnNumber || 0}:${data?.turnPhase || ''}`;
    }

    updateTurnLocalStart(data) {
      const key = this.currentTurnKey(data);
      if (this._turnLocalKey === key) return;
      this._turnLocalKey = key;
      this._turnLocalStartMs = Date.now();
      this._observedAnyTurn = true;
    }

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
      const duration = data?.turnDurationMs || RS().turnDurationForLength(this.wordLength);
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
      if (this.els.turnBar.parentElement !== mount) mount.appendChild(this.els.turnBar);
    }

    renderTurnBar(data, mode) {
      this.ensureTurnBar();
      const bar = this.els.turnBar;
      if (!bar) return;
      const oppName = data.player2Name || this.botName();
      let label = rt('yourTurn');
      let pct = 100;
      let myTurnStyle = false;
      let timerHtml = '';
      const duration = data.turnDurationMs || 1;
      const localPct = Math.round((this.getTurnRemainingMs(data) / duration) * 100);

      if (mode === 'waiting') {
        label = rt('oppTurn', { name: oppName });
        pct = localPct;
      } else if (mode === 'mine') {
        label = rt('yourTurn');
        pct = localPct;
        myTurnStyle = true;
      }

      if (data.currentTurnUid) {
        const sec = Math.ceil(this.getTurnRemainingMs(data) / 1000);
        timerHtml = `<span class="race-turn-timer">${sec}</span>`;
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
    }

    updateTurnUrgencyOverlay(data) {
      const el = this.els.turnUrgency;
      if (!el || !this.gameStarted || data.status !== 'active') {
        this.hideTurnUrgencyOverlay();
        return;
      }
      if (data.currentTurnUid !== MY_UID) {
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
    }

    hideTurnUrgencyOverlay() {
      this._lastUrgencySec = null;
      const el = this.els.turnUrgency;
      if (!el) return;
      el.classList.add('hidden');
      el.textContent = '';
    }

    maybeShowTurnSwapOverlay(data) {
      if (!this.gameStarted) return;
      const key = `${data.currentTurnUid || ''}:${data.turnNumber || 0}`;
      if (this._prevTurnBoundaryKey == null) {
        this._prevTurnBoundaryKey = key;
        return;
      }
      if (this._prevTurnBoundaryKey === key) return;
      this._prevTurnBoundaryKey = key;
      const el = this.els.turnSwap;
      if (!el) return;
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      el.textContent = rt('turnSwap');
      el.classList.remove('hidden');
      this._turnSwapTimer = setTimeout(() => {
        el.classList.add('hidden');
        this._turnSwapTimer = null;
      }, 700);
    }

    async maybePlayOpponentReveal(data) {
      const reveal = data?.lastTurnReveal;
      if (!this.game || !reveal || reveal.byUid === MY_UID) return;
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
        this.game.prepareForNewTurn(lockedBeforeReveal, data.turnHistory, MY_UID);
        this.game.setWatchMode(true);
        this.game.renderTurnGuessOnZones(this.game.blocks, reveal, { neutral: true });
      }

      this._playedRevealKey = key;
      await this.game.playWatchTurnReveal(reveal, { name: reveal.byName || this.botName() });
      if (!wasWatching) this.game.setWatchMode(false);
    }

    watchOpponentTurn(data) {
      const watchKey = `watch-${data.turnNumber || 1}`;
      if (this.preparedTurnNumber !== watchKey) {
        this.game.prepareForNewTurn?.(data.sharedState?.locked || []);
        this.preparedTurnNumber = watchKey;
      }
      this.game.syncSharedState(data.sharedState || RS().defaultSharedState());
      this.game.setWatchMode(true);
      this.game.setBoardHidden(false);
      const live = data.turnLive;
      if (live?.byUid === BOT_UID && live?.turnNumber === data.turnNumber) {
        this.game.applyTurnLiveState(live);
      }
      this.scheduleBotTurn(data);
    }

    async syncTurnState(data) {
      if (!data || !this.game) return;
      this.maybeShowTurnSwapOverlay(data);
      const myTurn = data.currentTurnUid === MY_UID;

      if (myTurn) {
        await this.maybePlayOpponentReveal(data);
        await this.game.waitForWatchReveal?.();
        this.renderTurnBar(data, 'mine');
        if (this.preparedTurnNumber !== data.turnNumber) {
          this.game.prepareForNewTurn?.(
            data.sharedState?.locked || [],
            data.turnHistory,
            MY_UID
          );
          this.preparedTurnNumber = data.turnNumber;
        }
        this.game.syncSharedState(data.sharedState || RS().defaultSharedState());
        this.game.setBoardHidden(false);
        this.game.setMyTurn(true);
      } else {
        this.renderTurnBar(data, 'waiting');
        this.watchOpponentTurn(data);
      }

      this.startTurnTimer(data);
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
        const myTurn = live.currentTurnUid === MY_UID;
        this.renderTurnBar(live, myTurn ? 'mine' : 'waiting');
        this.updateTurnUrgencyOverlay(live);

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
          try {
            await this.game.expireMyTurn?.();
          } catch (_) {}
          finally {
            this.pendingTurnSubmit = false;
          }
        }
      };
      tick();
      this.turnTimer = setInterval(tick, 250);
    }

    botDelay(fn, ms) {
      const id = global.setTimeout(() => {
        this._botTimers = this._botTimers.filter((t) => t !== id);
        fn();
      }, Math.max(0, ms));
      this._botTimers.push(id);
      return id;
    }

    clearBotTimers() {
      this._botTimers.forEach((id) => clearTimeout(id));
      this._botTimers = [];
      this._botTurnRunning = false;
    }

    scheduleBotTurn(data) {
      if (this._botTurnRunning || data.currentTurnUid !== BOT_UID || data.status !== 'active') return;
      this._botTurnRunning = true;
      this.clearBotTimers();
      this._botTurnRunning = true;

      const profile = this.speedProfile();
      const wr = this.winRate;
      const wrongChance = lerp(0.55, 0.08, wr);
      const solveChance = lerp(0.12, 0.72, wr);
      const stumbleChance = lerp(0.28, 0.05, wr);
      const locked = data.sharedState?.locked || [];
      const target = data.target;

      const makesWrong = Math.random() < wrongChance;
      const triesSolve = !makesWrong && Math.random() < solveChance;
      let placements;
      let won = false;

      if (triesSolve) {
        placements = buildPlacements(target, locked, { wrong: false, partial: false });
        won = isWinningSubmission(placements, locked, target);
        if (!won) placements = buildPlacements(target, locked, { wrong: false, partial: true });
      } else if (makesWrong) {
        placements = buildPlacements(target, locked, { wrong: true, partial: false });
      } else {
        placements = buildPlacements(target, locked, { wrong: false, partial: true });
      }

      const payload = finalizePayload(placements, target, won);
      let t = randRange(profile.readMin, profile.readMax);

      if (Math.random() < stumbleChance) {
        t += randRange(profile.longPauseMin, profile.longPauseMax);
      }

      const steps = [];
      let built = [];
      placements.forEach((p, i) => {
        t += randRange(profile.placeMin, profile.placeMax);
        built = built.concat([p]);
        const stepPlacements = [...built];
        steps.push({ at: t, live: { placements: stepPlacements, merge: { slots: [null, null], result: null } } });
      });

      steps.forEach((step) => {
        this.botDelay(() => {
          if (!this.game || this.matchData?.currentTurnUid !== BOT_UID) return;
          this.matchData.turnLive = {
            byUid: BOT_UID,
            turnNumber: this.matchData.turnNumber,
            placements: step.live.placements,
            merge: step.live.merge,
          };
          this.game.applyTurnLiveState(this.matchData.turnLive);
        }, step.at);
      });

      t += randRange(profile.rethinkMin, profile.rethinkMax);
      this.botDelay(() => {
        if (!this.game || this.matchData?.currentTurnUid !== BOT_UID) return;
        const checkingLive = {
          byUid: BOT_UID,
          turnNumber: this.matchData.turnNumber,
          placements: payload.placements,
          merge: { slots: [null, null], result: null },
          action: { kind: 'checking', seq: Date.now() },
        };
        this.matchData.turnLive = checkingLive;
        this.game.applyTurnLiveState(checkingLive);
      }, t);

      this.botDelay(() => {
        if (!this.matchData || this.matchData.currentTurnUid !== BOT_UID) return;
        this.applyBotTurn(payload);
      }, t + (makesWrong ? profile.wrongHold : randRange(400, 900)));
    }

    handleDone(data) {
      if (this._resultsRendered) return;
      this._resultsRendered = true;
      this.clearBotTimers();
      if (this.turnTimer) clearInterval(this.turnTimer);
      this.hideTurnUrgencyOverlay();
      this.els.turnBar?.classList.add('hidden');
      this.els.battleHud?.classList.add('hidden');
      this.game?.setMyTurn(false);

      const shared = data.sharedState || {};
      const RUI = global.RaceResultsUI;
      let resultLine = rt('draw');
      if (data.winnerUid === MY_UID) resultLine = rt('win');
      else if (data.winnerUid) resultLine = rt('loss');
      const displayWord = shared.solvedWord || data.target;

      this.renderMain(RUI.renderResultsPanel({
        resultLine,
        resultKind: data.winnerUid === MY_UID ? 'win' : data.winnerUid ? 'loss' : 'draw',
        winnerUid: data.winnerUid,
        battleXpMode: data.winnerUid === MY_UID ? 'koreanMatch' : '',
        battleMatchId: this.matchId,
        battleQuestMode: 'turn',
        players: [
          { uid: MY_UID, name: rt('me'), statHtml: `${shared.guessCount || 0} ${escapeHtml(rt('turns'))}` },
          { uid: BOT_UID, name: this.botName(), statHtml: `${shared.guessCount || 0} ${escapeHtml(rt('turns'))}` },
        ],
        answerTilesHtml: RUI.buildMatchWinTiles(displayWord),
        answerLabel: rt('answerLabel'),
        rematchLabel: rt('rematch'),
        profileLabel: rt('profileLink'),
        profileHref: 'index.html',
      }));

      RUI.afterResultsMount(this.els.main);
      void RUI.fillAnswerMeaning(this.els.main, displayWord, { autoplay: false });
      this.els.main.querySelector('#race-rematch')?.addEventListener('click', () => {
        global.location.reload();
      });
    }
  }

  global.MatchTurnBotApp = MatchTurnBotApp;

  global.addEventListener('pagehide', () => {
    if (global.__matchTurnBotAppInstance) global.__matchTurnBotAppInstance.destroy();
  });
})(typeof window !== 'undefined' ? window : globalThis);
