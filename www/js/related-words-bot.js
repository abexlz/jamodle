/**
 * Related Words vs Bot — local 1v1 match against a simulated opponent.
 * Dev-only. No Firestore: shared round state is simulated in-memory so it
 * works when no real players are online. Win rate is adjustable (0–100).
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  const RC = () => global.RaceCountdown;
  const RWC = () => global.RelatedWordsChains;
  const COUNTDOWN_SEC = 3;

  /** Pacing presets — letter gaps are still randomized per keystroke. */
  const SPEED_PROFILES = {
    slow: {
      readMin: 2000,
      readMax: 4500,
      letterMin: 900,
      letterMax: 3200,
      longPauseMin: 2400,
      longPauseMax: 4200,
      quickMin: 700,
      quickMax: 1200,
      rethinkMin: 1000,
      rethinkMax: 2400,
      wrongHold: 900,
    },
    medium: {
      readMin: 900,
      readMax: 2200,
      letterMin: 450,
      letterMax: 1600,
      longPauseMin: 1800,
      longPauseMax: 3200,
      quickMin: 350,
      quickMax: 900,
      rethinkMin: 500,
      rethinkMax: 1300,
      wrongHold: 650,
    },
    fast: {
      readMin: 450,
      readMax: 1100,
      letterMin: 220,
      letterMax: 750,
      longPauseMin: 900,
      longPauseMax: 1600,
      quickMin: 150,
      quickMax: 450,
      rethinkMin: 280,
      rethinkMax: 650,
      wrongHold: 420,
    },
  };

  function rt(key, vars) {
    return global.I18n?.t('relatedWordsRace.' + key, vars) ?? '';
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

  function formatTime(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
    return rt('timeSec', { s });
  }

  class RelatedWordsBotMatchApp {
    constructor(rootEl) {
      this.root = rootEl;
      const params = new URLSearchParams(global.location.search);
      const wr = Number(params.get('winrate'));
      // Bot's target win rate as a fraction (0 = always loses, 1 = nearly unbeatable).
      this.winRate = Number.isFinite(wr) ? Math.min(100, Math.max(0, wr)) / 100 : 0.5;
      const speedParam = String(params.get('speed') || 'medium').toLowerCase();
      this.speed = SPEED_PROFILES[speedParam] ? speedParam : 'medium';
      const target = Number(params.get('target'));
      this.raceTarget = Number.isFinite(target) && target > 0
        ? target
        : (RS()?.RELATED_WORDS_RACE_TARGET || 25);
      this.chainId = params.get('chain')
        || RWC()?.pickRandomChain?.(`bot-${Date.now()}`)
        || RWC()?.getAllChains?.()[0]?.id;

      this.game = null;
      this.els = null;
      this.countdownDone = false;
      this.countdownTimer = null;
      this._countdownFallbackTimer = null;

      this.linkIndex = 0;
      this.roundId = 0;
      this.roundOpen = false;
      this.myScore = 0;
      this.botScore = 0;
      this.myStreak = 0;
      this.botStreak = 0;
      this._prevMyScore = 0;
      this._prevBotScore = 0;
      this._scoreFlyHold = { my: false, opp: false };
      this._pendingScores = { my: null, opp: null };
      this.matchOver = false;
      this.startMs = null;
      this._myElapsedMs = null;
      this._botElapsedMs = null;
      this._botTimers = [];
      this._prevOppWrong = 0;
      this.botWrongCount = 0;
    }

    botName() {
      const speedLabel = this.speed.charAt(0).toUpperCase() + this.speed.slice(1);
      return `🤖 Bot ${Math.round(this.winRate * 100)}% · ${speedLabel}`;
    }

    speedProfile() {
      return SPEED_PROFILES[this.speed] || SPEED_PROFILES.medium;
    }

    async init() {
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

      this.renderMain(`
        <div class="race-panel race-countdown-panel">
          <p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p>
        </div>
      `);
      this.renderBattleHud();

      const raceStartMs = Date.now() + (RC()?.countdownTotalMs?.(COUNTDOWN_SEC) ?? 4000);
      RC()?.runCountdown?.(this, {
        el: this.els.countdown,
        raceStartMs,
        countdownSec: COUNTDOWN_SEC,
        onDone: () => this.startGame(),
        goLabel: rt('go'),
      });
    }

    destroy() {
      this.clearBotTimers();
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

    renderShell() {
      this.root.innerHTML = `
        <header class="race-header">
          <a class="race-back" href="index.html">${escapeHtml(rt('backProfile'))}</a>
          <h1>${escapeHtml(rt('title'))} · BOT</h1>
          <a class="race-settings-link" href="settings.html" aria-label="Settings">⚙️</a>
        </header>
        <div id="race-battle-hud" class="rw-race-battle-hud hidden" aria-live="polite">
          <div class="rw-race-battle-mid">
            <div class="rw-race-battle-cluster">
              <div class="rw-race-profile-stack">
                <div id="race-opp-card" class="rw-race-battle-card"></div>
                <p id="race-opp-name" class="rw-race-battle-name"></p>
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
              <div class="rw-race-profile-stack">
                <div id="race-my-card" class="rw-race-battle-card"></div>
                <p id="race-my-name" class="rw-race-battle-name rw-race-battle-name--you"></p>
              </div>
            </div>
          </div>
          <div class="rw-race-battle-bottom">
            <div class="rw-race-battle-center-meta">
              <span id="rw-race-chain-title" class="rw-race-chain-title"></span>
              <span id="rw-race-chain-progress" class="rw-race-chain-progress"></span>
            </div>
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
      };
      this.els.myWordCountNum = global.RwScoreOdometer?.mount(this.els.myWordCountNum) || this.els.myWordCountNum;
      this.els.oppWordCountNum = global.RwScoreOdometer?.mount(this.els.oppWordCountNum) || this.els.oppWordCountNum;
    }

    renderMain(html) {
      if (this.els.main) this.els.main.innerHTML = html;
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

    updateEnemyHudLives() {
      const oppLivesEl = this.game?.getVsPanelLivesEl?.('enemy');
      if (oppLivesEl) {
        this.renderHudLives(oppLivesEl, this.botWrongCount, this._prevOppWrong);
      }
      this._prevOppWrong = this.botWrongCount;
      if (this.game) {
        this.game.setOpponentLiveState({
          wrongCount: this.botWrongCount,
          stunnedUntil: 0,
        });
      }
    }

    streakFireMin() {
      return RS()?.RELATED_WORDS_STREAK_FIRE_MIN || 4;
    }

    updateScoreStack(stackEl, numElKey, score, streak, prevScore, { skipBump = false } = {}) {
      if (!stackEl || !numElKey) return;
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
      stackEl.classList.toggle('is-burning', safeStreak >= this.streakFireMin());
      stackEl.dataset.streak = String(safeStreak);

      if (!skipBump && score > prevScore) {
        stackEl.classList.remove('rw-score-bump');
        void stackEl.offsetWidth;
        stackEl.classList.add('rw-score-bump');
        global.setTimeout(() => stackEl.classList.remove('rw-score-bump'), 420);
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
      const prev = key === 'my' ? this._prevMyScore : this._prevBotScore;
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
      else this._prevBotScore = newScore;
    }

    getScoreFlyTargets() {
      return {
        my: { stack: this.els.myScoreStack, num: this.els.myWordCountNum },
        opp: { stack: this.els.oppScoreStack, num: this.els.oppWordCountNum },
      };
    }

    renderBattleHud() {
      this.els.battleHud?.classList.remove('hidden');
      document.body.classList.add('rw-race-active');

      if (this.els.oppName) this.els.oppName.textContent = this.botName();
      if (this.els.myName) this.els.myName.textContent = rt('me');

      if (this._scoreFlyHold.opp) {
        this.updateScoreStack(
          this.els.oppScoreStack,
          'oppWordCountNum',
          this._prevBotScore,
          this.botStreak,
          this._prevBotScore,
          { skipBump: true },
        );
      } else {
        this.updateScoreStack(
          this.els.oppScoreStack,
          'oppWordCountNum',
          this.botScore,
          this.botStreak,
          this._prevBotScore,
        );
        this._prevBotScore = this.botScore;
      }

      if (this._scoreFlyHold.my) {
        this.updateScoreStack(
          this.els.myScoreStack,
          'myWordCountNum',
          this._prevMyScore,
          this.myStreak,
          this._prevMyScore,
          { skipBump: true },
        );
      } else {
        this.updateScoreStack(
          this.els.myScoreStack,
          'myWordCountNum',
          this.myScore,
          this.myStreak,
          this._prevMyScore,
        );
        this._prevMyScore = this.myScore;
      }

      this.updateEnemyHudLives();
      this.loadCards();
    }

    loadCards() {
      if (this.els.oppCard && !this.els.oppCard.dataset.loaded) {
        this.els.oppCard.dataset.loaded = '1';
        global.MatchEmotes?.renderOpponentBattleCard?.(this.els.oppCard, {
          name: this.botName(),
          displayName: this.botName(),
          avatarId: 'default',
          avatarIcon: '🤖',
          frameId: 'none',
          level: 1,
          xpInLevel: 0,
          xpToNext: 100,
          totalXp: 0,
        });
      }
      this.loadMyBattleCard();
    }

    loadMyBattleCard() {
      if (!this.els.myCard) return;
      const local = global.MatchEmotes?.buildLocalPlayerSummary?.();
      if (local) {
        global.MatchEmotes?.renderOpponentBattleCard?.(this.els.myCard, local);
        if (this.els.myName && local.name) this.els.myName.textContent = local.name;
      } else {
        global.MatchEmotes?.renderOpponentBattleCard?.(this.els.myCard, {
          name: rt('me'),
          displayName: rt('me'),
          avatarId: 'default',
          avatarIcon: '🌸',
          frameId: 'none',
          level: 1,
          xpInLevel: 0,
          xpToNext: 100,
          totalXp: 0,
        });
      }

      const myUid = global.FirebaseSocial?.getCurrentUid?.();
      if (!myUid || this.els.myCard.dataset.loadedUid === myUid) return;
      this.els.myCard.dataset.loadedUid = myUid;
      global.MatchEmotes?.fetchOpponentSummary?.(myUid).then((summary) => {
        if (!summary || !this.els.myCard) return;
        global.MatchEmotes.renderOpponentBattleCard(this.els.myCard, summary);
        if (this.els.myName && summary.name) this.els.myName.textContent = summary.name;
      });
    }

    startGame() {
      if (this.game || this.linkIndex < 0) return;
      this.els.countdown?.classList.add('hidden');
      this.startMs = Date.now();

      this.renderMain('<div id="rw-race-game" class="rw-race-game"></div>');
      const gameRoot = this.root.querySelector('#rw-race-game');

      this.game = new global.RelatedWordsGame(gameRoot, {
        versus: true,
        raceControlled: true,
        sharedRace: true,
        chainId: this.chainId,
        raceTarget: this.raceTarget,
        initialLinkIndex: this.linkIndex,
        onRoundWin: (payload) => this.onPlayerRoundWin(payload),
        onRevealSkip: (payload) => this.onPlayerRevealSkip(payload),
        onLiveHudUpdate: (state) => {
          if (state.enemy) this.updateEnemyHudLives();
        },
        getScoreFlyTargets: () => this.getScoreFlyTargets(),
        onScoreFlyPrepare: ({ side }) => this.prepareScoreFly(side),
        onScoreFlyComplete: ({ side }) => {
          const key = side === 'opp' || side === 'enemy' ? 'opp' : 'my';
          const pending = this._pendingScores[key];
          if (!pending) {
            this._scoreFlyHold[key] = false;
            return;
          }
          this.completeScoreFly(side, pending.score, pending.streak);
        },
      });
      this.game.mount();
      this.game.setRoundContext({ roundId: this.roundId });
      this.game.raceStartTime = this.startMs;
      this.game.setRaceScore(this.myScore);
      this.game.setSharedWordsDone(this.linkIndex);
      this.game.setEnabled(true);
      this.renderBattleHud();

      this.roundOpen = true;
      this.scheduleBotRound();
    }

    chainLinkCount() {
      return global.RelatedWordsChains?.getLinkCount?.(this.chainId) ?? this.raceTarget;
    }

    isObjectiveComplete(linkIndex = this.linkIndex) {
      const idx = Math.max(0, Number(linkIndex) || 0);
      return idx >= this.raceTarget || idx >= this.chainLinkCount();
    }

    finishMatch(winner) {
      this.matchOver = true;
      this.renderBattleHud();
      this.game?.setEnabled(false);
      global.setTimeout(() => this.showResults(winner), 900);
    }

    /** Current link within the selected chain. */
    currentLink() {
      return RWC()?.getLink?.(this.chainId, this.linkIndex) || null;
    }

    /* ── Player round win (called by the game engine) ── */

    async onPlayerRoundWin(payload) {
      if (this.matchOver || !this.roundOpen) return { applied: false };
      const link = this.currentLink();
      if (!link || Number(payload?.linkIndex) !== this.linkIndex) return { applied: false };
      if (String(payload?.answer || '').trim() !== link.answer) return { applied: false };

      this.roundOpen = false;
      this.clearBotTimers();

      this.myScore += RWC()?.relatedWordsRoundPoints?.(link.answer) ?? 1;
      this.myStreak += 1;
      this.botStreak = 0;
      this._myElapsedMs = Date.now() - this.startMs;
      this._pendingScores.my = { score: this.myScore, streak: this.myStreak };

      const nextLink = this.linkIndex + 1;
      if (this.isObjectiveComplete(nextLink)) {
        const winner = this.myScore > this.botScore ? 'me' : this.botScore > this.myScore ? 'bot' : 'me';
        this.finishMatch(winner);
        return { applied: true, matchOver: true, myScore: this.myScore, nextLinkIndex: nextLink };
      }

      // Short beat so the board can settle, then the bot starts thinking.
      global.setTimeout(() => this.advanceRound(false), 80);
      return { applied: true, matchOver: false, myScore: this.myScore, nextLinkIndex: this.linkIndex + 1 };
    }

    async onPlayerRevealSkip(payload) {
      if (this.matchOver || !this.roundOpen) return { applied: false };
      if (Number(payload?.linkIndex) !== this.linkIndex) return { applied: false };
      if (Number(payload?.roundId) !== this.roundId) return { applied: false };

      this.clearBotTimers();
      const matchOver = this.skipRoundByReveal();
      return { applied: true, skipped: true, matchOver: !!matchOver };
    }

    skipRoundByReveal() {
      if (this.matchOver || !this.roundOpen) return false;
      this.roundOpen = false;
      this.clearBotTimers();

      const nextLink = this.linkIndex + 1;
      if (this.isObjectiveComplete(nextLink)) {
        const winner = this.myScore > this.botScore ? 'me' : this.botScore > this.myScore ? 'bot' : 'me';
        this.finishMatch(winner);
        return true;
      }

      this.botWrongCount = 0;
      this.linkIndex = nextLink;
      this.roundId += 1;

      if (this.game) {
        this.game.setRaceScore(this.myScore);
        this.game.setSharedWordsDone(this.linkIndex);
        this.game.setRoundContext({ roundId: this.roundId });
        this.game.syncToLink(this.linkIndex, { skipped: true });
      }

      this._prevOppWrong = 0;
      this.updateEnemyHudLives();
      this.renderBattleHud();
      this.roundOpen = true;
      this.scheduleBotRound();
      return false;
    }

    /* ── Bot round win ── */

    botWinsRound() {
      if (this.matchOver || !this.roundOpen || !this.game) return;
      this.roundOpen = false;
      this.clearBotTimers();

      const link = this.currentLink();
      const points = RWC()?.relatedWordsRoundPoints?.(link?.answer) ?? 1;
      this.botScore += points;
      this.botStreak += 1;
      this.myStreak = 0;
      this._botElapsedMs = Date.now() - this.startMs;
      this._scoreFlyHold.opp = true;
      this._pendingScores.opp = { score: this.botScore, streak: this.botStreak };

      const nextLink = this.linkIndex + 1;
      if (this.isObjectiveComplete(nextLink)) {
        const winner = this.myScore > this.botScore ? 'me' : this.botScore > this.myScore ? 'bot' : 'bot';
        this.finishMatch(winner);
        return;
      }

      this.advanceRound(true);
    }

    advanceRound(botWon) {
      const prevWrong = this.botWrongCount;
      this.botWrongCount = 0;
      this.linkIndex += 1;
      this.roundId += 1;

      const runAdvance = () => {
        this._prevOppWrong = 0;
        this.updateEnemyHudLives();
        this.renderBattleHud();

        if (this.game) {
          this.game.setRaceScore(this.myScore);
          this.game.setSharedWordsDone(this.linkIndex);
          this.game.setRoundContext({ roundId: this.roundId });
          this.game.syncToLink(this.linkIndex, {
            animateIn: !botWon,
            opponentWon: botWon,
            skipScoreFly: !botWon,
          });
        }

        this.roundOpen = true;
        this.scheduleBotRound();
      };

      const oppLivesEl = this.game?.getVsPanelLivesEl?.('enemy');
      if (prevWrong > 0 && oppLivesEl) {
        const animate = async () => {
          for (let i = prevWrong; i > 0; i--) {
            this.renderHudLives(oppLivesEl, i - 1, i);
            global.SoundEffects?.tick?.();
            await new Promise((r) => global.setTimeout(r, 220));
          }
          runAdvance();
        };
        animate().catch(() => runAdvance());
        return;
      }

      runAdvance();
    }

    /* ── Bot behavior simulation ── */

    clearBotTimers() {
      this._botTimers.forEach((id) => clearTimeout(id));
      this._botTimers = [];
    }

    botDelay(fn, ms) {
      const id = global.setTimeout(() => {
        this._botTimers = this._botTimers.filter((t) => t !== id);
        fn();
      }, Math.max(0, ms));
      this._botTimers.push(id);
    }

    pushBotSlots(chars, roundId) {
      if (!this.game || this.matchOver || roundId !== this.roundId) return;
      this.game.setOpponentSlots({
        linkIndex: this.linkIndex,
        roundId,
        slots: chars,
        wrongCount: this.botWrongCount,
        stunnedUntil: 0,
      }, roundId);
    }

    /**
     * Human-ish delay before the next letter: quick taps, normal pace, or
     * a longer "hmm…" pause (e.g. ~3s then ~1s on the next key).
     */
    nextHumanLetterDelay(letterIndex, letterCount, profile) {
      if (letterIndex === 0) {
        return randRange(profile.letterMin * 1.1, profile.letterMax * 1.35);
      }

      const roll = Math.random();
      // ~18% long think, ~28% snappy follow-up, rest normal spread.
      if (roll < 0.18) return randRange(profile.longPauseMin, profile.longPauseMax);
      if (roll < 0.46) return randRange(profile.quickMin, profile.quickMax);
      return randRange(profile.letterMin, profile.letterMax);
    }

    /** Type chars one-by-one; returns the timestamp after the last letter. */
    scheduleBotTyping(chars, roundId, startAt, profile) {
      let t = startAt;
      chars.forEach((_, i) => {
        t += this.nextHumanLetterDelay(i, chars.length, profile);
        const upto = chars.slice(0, i + 1);
        this.botDelay(() => this.pushBotSlots(upto, roundId), t);
      });
      return t;
    }

    /**
     * Plan the bot's round. Win rate → wrong-guess rate + occasional stumble.
     * Speed preset → overall pacing. Letter gaps stay irregular either way.
     */
    scheduleBotRound() {
      if (this.matchOver) return;
      const roundId = this.roundId;
      const link = this.currentLink();
      if (!link?.answer) return;

      const answerChars = RWC()?.splitSyllables?.(link.answer) || [...link.answer];
      const profile = this.speedProfile();
      const wr = this.winRate;

      const wrongChance = lerp(0.52, 0.07, wr);
      const stumbleChance = lerp(0.32, 0.06, wr);
      const makesWrongAttempt = Math.random() < wrongChance;

      let t = randRange(profile.readMin, profile.readMax);

      if (makesWrongAttempt) {
        this.botWrongCount = Math.min(3, this.botWrongCount + 1);
        this.updateEnemyHudLives();
        const wrongChars = this.buildWrongAttempt(link, answerChars);
        // Sometimes bail out of a bad guess part-way through.
        const partialWrong = Math.random() < 0.45;
        const wrongToType = partialWrong
          ? wrongChars.slice(0, Math.max(1, Math.floor(randRange(1, wrongChars.length))))
          : wrongChars;

        t = this.scheduleBotTyping(wrongToType, roundId, t, profile);
        t += profile.wrongHold;
        this.botDelay(() => this.pushBotSlots([], roundId), t);
        t += randRange(profile.rethinkMin, profile.rethinkMax);
      }

      if (Math.random() < stumbleChance) {
        t += randRange(profile.longPauseMin, profile.longPauseMax);
      }

      t = this.scheduleBotTyping(answerChars, roundId, t, profile);
      this.botDelay(() => {
        if (roundId === this.roundId) this.botWinsRound();
      }, t + randRange(180, 420));
    }

    buildWrongAttempt(link, answerChars) {
      const dockChars = (link.dockTiles || []).map((tile) => tile.char).filter(Boolean);
      const pool = dockChars.length >= answerChars.length ? [...dockChars] : [...answerChars];
      // Shuffle until it differs from the correct answer.
      for (let attempt = 0; attempt < 6; attempt++) {
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const candidate = pool.slice(0, answerChars.length);
        if (candidate.join('') !== answerChars.join('')) return candidate;
      }
      return [...answerChars].reverse();
    }

    /* ── Results ── */

    showResults(winner) {
      this.clearBotTimers();
      if (this.game) this.game.setEnabled(false);

      const iWon = winner === 'me';
      const RUI = global.RaceResultsUI;

      this.renderMain(RUI.renderResultsPanel({
        resultLine: iWon ? rt('win') : rt('loss'),
        resultKind: iWon ? 'win' : 'loss',
        winnerUid: iWon ? 'me' : 'bot',
        battleXpMode: iWon ? 'relatedWords' : '',
        battleMatchId: `bot-${this.chainId}`,
        players: [
          {
            uid: 'me',
            name: rt('me'),
            statHtml: `${this.myScore} ${escapeHtml(rt('points'))} · ${escapeHtml(formatTime(this._myElapsedMs))}`,
          },
          {
            uid: 'bot',
            name: this.botName(),
            statHtml: `${this.botScore} ${escapeHtml(rt('points'))} · ${escapeHtml(formatTime(this._botElapsedMs))}`,
          },
        ],
        rematchLabel: rt('rematch'),
        profileLabel: rt('profileLink'),
        profileHref: 'index.html',
      }));

      RUI.afterResultsMount(this.els.main);
      this.els.main.querySelector('#race-rematch')?.addEventListener('click', () => {
        global.location.reload();
      });
    }
  }

  global.RelatedWordsBotMatchApp = RelatedWordsBotMatchApp;

  global.addEventListener('pagehide', () => {
    if (global.__relatedWordsBotAppInstance) global.__relatedWordsBotAppInstance.destroy();
  });
})(typeof window !== 'undefined' ? window : globalThis);
