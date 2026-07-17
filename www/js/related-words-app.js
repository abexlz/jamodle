/**
 * Related Words — chain mode: link syllables into the next related word.
 */
(function (global) {
  'use strict';

  const RW = () => global.RelatedWordsPuzzles;
  const PROGRESS_KEY = 'jamodeul-related-words-progress';
  const SOLO_LEFT_KEY = 'jamodeul-related-words-left';
  const SOLO_SAVED_EXIT_KEY = 'jamodeul-rw-solo-saved-exit';
  const MAX_GUESSES = 3;
  const EXTRA_GUESS_TIMER_MS = 10000;
  const HEARTBEAT_RADIUS = 52;
  const STUN_MS = 10000;
  const FLIP_MS = 380;
  const FLIP_FAST_MS = 120;
  const FLIP_STAGGER = 90;
  const FLY_MS = 300;
  const GREEN_FLASH_MS = 200;
  const GREEN_FLASH_FAST_MS = 70;
  const TRAIL_ADVANCE_MS = 480;
  const TRAIL_ADVANCE_RACE_MS = 400;
  const SOLVED_FLY_MS = 420;
  const TRANSITION_MS = 320;
  const REVEAL_IDLE_MS = 30000;
  const REVEAL_VANISH_MS = 320;
  const REVEAL_FORM_MS = 520;
  const REVEAL_FORM_HOLD_MS = 140;

  const t = (key, vars) => global.I18n?.t(key, vars) ?? key;
  const prefs = () => global.UserPreferences;
  const reduceMotion = () => prefs()?.shouldReduceMotion?.() === true;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadProgress() {
    const data = global.AppStorage ? global.AppStorage.get(PROGRESS_KEY, {}) : {};
    const legacyIndex = parseInt(data.puzzleIndex, 10);
    const soloStreak = Math.max(0, parseInt(data.soloStreak, 10) || 0);
    const hasBest = data.bestSoloStreak != null && data.bestSoloStreak !== '';
    const bestSoloStreak = hasBest
      ? Math.max(0, parseInt(data.bestSoloStreak, 10) || 0)
      : soloStreak;
    return {
      chainId: data.chainId || null,
      linkIndex: Number.isFinite(parseInt(data.linkIndex, 10))
        ? parseInt(data.linkIndex, 10)
        : (Number.isFinite(legacyIndex) ? legacyIndex : 0),
      completedChainIds: Array.isArray(data.completedChainIds) ? [...data.completedChainIds] : [],
      cycles: Math.max(0, parseInt(data.cycles, 10) || 0),
      globalLinkIndex: Number.isFinite(parseInt(data.globalLinkIndex, 10))
        ? parseInt(data.globalLinkIndex, 10)
        : null,
      solvedInChain: Array.isArray(data.solvedInChain) ? [...data.solvedInChain] : [],
      soloStreak,
      bestSoloStreak,
    };
  }

  function saveProgress(patch) {
    const next = { ...loadProgress(), ...patch };
    if (global.AppStorage) {
      global.AppStorage.set(PROGRESS_KEY, next);
    } else {
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      } catch {}
    }
    return next;
  }

  function clearSoloLeftMark() {
    try {
      localStorage.removeItem(SOLO_LEFT_KEY);
    } catch {}
  }

  function markSavedExit() {
    try {
      sessionStorage.setItem(SOLO_SAVED_EXIT_KEY, '1');
    } catch {}
  }

  function consumeSavedExit() {
    try {
      if (sessionStorage.getItem(SOLO_SAVED_EXIT_KEY) === '1') {
        sessionStorage.removeItem(SOLO_SAVED_EXIT_KEY);
        return true;
      }
    } catch {}
    return false;
  }

  function markSoloLeft() {
    try {
      if (sessionStorage.getItem(SOLO_SAVED_EXIT_KEY) === '1') return;
      localStorage.setItem(SOLO_LEFT_KEY, '1');
    } catch {}
  }

  function consumeSoloLeftReset() {
    try {
      const nav = global.performance?.getEntriesByType?.('navigation')?.[0];
      if (nav?.type === 'reload') {
        localStorage.removeItem(SOLO_LEFT_KEY);
        return false;
      }
      if (localStorage.getItem(SOLO_LEFT_KEY) === '1') {
        localStorage.removeItem(SOLO_LEFT_KEY);
        return true;
      }
    } catch {}
    return false;
  }

  if (!global.__rwSoloLeftWired) {
    global.__rwSoloLeftWired = true;
    global.addEventListener('pagehide', () => markSoloLeft());
  }

  function ensureChain(progress) {
    const puzzles = RW();
    if (!puzzles) return progress;

    let chainId = progress.chainId;
    if (!chainId || !puzzles.getChain?.(chainId)) {
      chainId = puzzles.pickChain?.(progress)?.id || 'rw-food-cooking';
    }

    const linkCount = puzzles.getPuzzleCount?.(chainId) ?? 0;
    let linkIndex = Number(progress.linkIndex);
    if (!Number.isFinite(linkIndex) || linkIndex < 0 || linkIndex >= linkCount) {
      linkIndex = 0;
    }

    if (chainId !== progress.chainId || linkIndex !== progress.linkIndex) {
      return saveProgress({
        ...progress,
        chainId,
        linkIndex,
        solvedInChain: Array.isArray(progress.solvedInChain) ? progress.solvedInChain : [],
      });
    }

    return progress;
  }

  class RelatedWordsGame {
    constructor(rootEl, options = {}) {
      this.root = rootEl;
      this.options = options || {};
      this.versus = this.options.versus === true;
      this.raceMode = this.versus && Number(this.options.raceTarget) > 0;
      this.raceTarget = this.raceMode ? Number(this.options.raceTarget) : 0;
      this.fixedChainId = this.options.chainId || null;
      this.useThemeRotation = this.options.useThemeRotation === true;
      this.globalLinkIndex = 0;
      this.onProgress = typeof this.options.onProgress === 'function' ? this.options.onProgress : null;
      this.onFinished = typeof this.options.onFinished === 'function' ? this.options.onFinished : null;
      this.raceControlled = this.options.raceControlled === true;
      this.sharedRace = this.raceMode && this.options.sharedRace !== false;
      this.initialLinkIndex = Number(this.options.initialLinkIndex) || 0;
      this.onRoundWin = typeof this.options.onRoundWin === 'function' ? this.options.onRoundWin : null;
      this.onRevealSkip = typeof this.options.onRevealSkip === 'function' ? this.options.onRevealSkip : null;
      this.onSlotsChange = typeof this.options.onSlotsChange === 'function' ? this.options.onSlotsChange : null;
      this.onLiveHudUpdate = typeof this.options.onLiveHudUpdate === 'function' ? this.options.onLiveHudUpdate : null;
      this.getScoreFlyTargets = typeof this.options.getScoreFlyTargets === 'function'
        ? this.options.getScoreFlyTargets
        : null;
      this.onScoreFlyPrepare = typeof this.options.onScoreFlyPrepare === 'function'
        ? this.options.onScoreFlyPrepare
        : null;
      this.onScoreFlyComplete = typeof this.options.onScoreFlyComplete === 'function'
        ? this.options.onScoreFlyComplete
        : null;
      this.showOppPreview = this.sharedRace;
      this.oppSlotChars = [];
      this.oppWrongCount = 0;
      this.oppStunnedUntil = 0;
      this.stunnedUntil = 0;
      this._stunTimer = null;
      this._oppStunTimer = null;
      this.currentRoundId = 0;
      this.wordsSolved = 0;
      this.sharedWordsDone = 0;
      this.raceStartTime = null;
      this.enabled = true;
      this.roundLocked = false;
      this._oppFlippedThisRound = false;
      this._oppWinAnimating = false;
      this._oppRoundWonPending = false;
      this._slotFlipPromise = null;
      this._activeSlotFlip = null;
      this._pendingRoundSync = null;
      this.checkedComplete = false;
      this._activeFlies = 0;
      this._animatedTrailLinkIndex = null;
      this._flyingSlotIndex = -1;
      this._flyingTileId = null;
      this._prevGuessCount = 0;
      this._prevOppWrong = 0;
      this._oppStunLocalEndsAt = 0;
      this._revealIdleTimer = null;
      this._revealUiVisible = false;
      this._revealPressed = false;
      this._revealBusy = false;
      this.awaitingExtraGuess = false;
      this._extraGuessTimer = null;
      this._extraGuessRaf = null;

      if (this.raceMode) {
        this.progress = {
          chainId: this.fixedChainId,
          linkIndex: 0,
          solvedInChain: [],
        };
      } else {
        if (consumeSavedExit()) {
          clearSoloLeftMark();
        } else if (consumeSoloLeftReset()) {
          const prevChainId = loadProgress().chainId;
          const chains = global.RelatedWordsChains?.getAllChains?.() || [];
          let pool = chains.length ? chains : [{ id: 'rw-food-cooking' }];
          if (prevChainId && pool.length > 1) {
            const withoutPrev = pool.filter((c) => c.id !== prevChainId);
            if (withoutPrev.length) pool = withoutPrev;
          }
          const chainId = global.RelatedWordsChains?.pickRandomChain?.(`${Date.now()}-${Math.random()}`)
            || pool[Math.floor(Math.random() * pool.length)].id;
          saveProgress({
            chainId,
            linkIndex: 0,
            solvedInChain: [],
            globalLinkIndex: null,
            soloStreak: 0,
          });
        }
        this.progress = ensureChain(loadProgress());
        if (!this.versus) {
          const raw = global.AppStorage ? global.AppStorage.get(PROGRESS_KEY, {}) : {};
          if ((raw.bestSoloStreak == null || raw.bestSoloStreak === '') && this.progress.soloStreak > 0) {
            this.progress = saveProgress({ bestSoloStreak: this.progress.soloStreak });
          }
          const best = this.getBestSoloStreak();
          if (best > 0) {
            global.FirebaseSocial?.syncWordChainBestStreak?.(best);
          }
        }
      }

      this.puzzle = null;
      this.slots = [];
      this.dock = [];
      this.guessCount = 0;
      this.checking = false;
      this.gameOver = false;
      this.won = false;
    }

    mount() {
      if (!RW()) {
        this.root.innerHTML = '<p style="padding:24px;text-align:center">Unable to load Word Chain.</p>';
        return;
      }

      const headerNav = this.isSoloMode()
        ? global.PauseQuitUI?.pauseButtonHtml('rw-pause-btn') || ''
        : `<a class="back-link" href="index.html" data-i18n="relatedWords.back">${t('relatedWords.back')}</a>`;

      this.root.innerHTML = `
        <header class="rw-header">
          ${headerNav}
          <div class="rw-banner" data-i18n="relatedWords.banner">${t('relatedWords.banner')}</div>
        </header>

        <p class="rw-chain-title" id="rw-chain-title"></p>
        <p class="rw-chain-progress" id="rw-chain-progress"></p>
        <div class="wc-combo-wrap">
          <div class="wc-combo-badge wc-combo-badge--zero" id="rw-solo-streak" aria-live="polite" aria-label="">
            <span class="wc-combo-badge__glow" aria-hidden="true"></span>
            <span class="wc-combo-badge__pill">
              <span class="wc-combo-badge__count-stack">
                <span class="wc-combo-badge__flame" aria-hidden="true"></span>
                <span class="wc-combo-badge__count" id="rw-solo-streak-count">0</span>
              </span>
              <span class="wc-combo-badge__label" data-i18n="relatedWords.comboLabel">COMBO</span>
            </span>
          </div>
        </div>

        <div class="rw-lives" id="rw-lives" aria-label="${t('relatedWords.livesLabel')}"></div>

        <section class="rw-clue-area">
          <div class="rw-trail" id="rw-trail">
            <div class="rw-trail-track" id="rw-trail-track"></div>
          </div>
        </section>

        <div class="rw-board" id="rw-board">
          <section class="rw-answer-area">
            <div class="rw-slots" id="rw-slots"></div>
          </section>

          <div class="rw-divider" role="presentation"></div>

          <section class="rw-dock-area">
            <div class="rw-dock" id="rw-dock"></div>
            <div class="rw-reveal-skip hidden" id="rw-reveal-skip" aria-live="polite">
              <button type="button" class="race-btn race-btn--ghost rw-reveal-btn hidden" id="rw-reveal-btn" data-i18n="relatedWordsRace.revealAnswer">${t('relatedWordsRace.revealAnswer')}</button>
              <p class="rw-reveal-status hidden" id="rw-reveal-status"></p>
            </div>
          </section>
        </div>

        <div class="rw-feedback hidden" id="rw-feedback" role="status" aria-live="polite"></div>

        <div class="rw-extra-guess hidden" id="rw-extra-guess" role="dialog" aria-modal="true" aria-labelledby="rw-extra-guess-title">
          <div class="rw-extra-guess-card">
            <div class="rw-heartbeat" id="rw-heartbeat" aria-hidden="true">
              <svg class="rw-heartbeat-svg" viewBox="0 0 120 120">
                <circle class="rw-heartbeat-track" cx="60" cy="60" r="${HEARTBEAT_RADIUS}" fill="none"></circle>
                <circle class="rw-heartbeat-arc" id="rw-heartbeat-arc" cx="60" cy="60" r="${HEARTBEAT_RADIUS}" fill="none"></circle>
              </svg>
              <span class="rw-heartbeat-icon">❤️</span>
            </div>
            <h2 class="rw-extra-guess-title" id="rw-extra-guess-title"></h2>
            <div class="rw-extra-guess-actions" id="rw-extra-guess-actions"></div>
            <button type="button" class="rw-extra-guess-giveup" id="rw-extra-guess-giveup"></button>
          </div>
        </div>

        <div class="rw-overlay hidden" id="rw-overlay">
          <div class="rw-overlay-card">
            <span class="rw-overlay-emoji" id="rw-overlay-emoji"></span>
            <h2 id="rw-overlay-title"></h2>
            <p class="rw-overlay-answer" id="rw-overlay-answer"></p>
            <p class="rw-overlay-sub" id="rw-overlay-sub"></p>
            <button type="button" class="btn btn-continue" id="rw-overlay-btn"></button>
          </div>
        </div>
      `;

      this.els = {
        board: this.root.querySelector('#rw-board'),
        chainTitle: document.getElementById('rw-race-chain-title') || this.root.querySelector('#rw-chain-title'),
        chainProgress: document.getElementById('rw-race-chain-progress') || this.root.querySelector('#rw-chain-progress'),
        soloStreak: this.root.querySelector('#rw-solo-streak'),
        soloStreakCount: this.root.querySelector('#rw-solo-streak-count'),
        pauseBtn: this.root.querySelector('#rw-pause-btn'),
        trail: this.root.querySelector('#rw-trail'),
        trailTrack: this.root.querySelector('#rw-trail-track'),
        lives: this.root.querySelector('#rw-lives'),
        slots: this.root.querySelector('#rw-slots'),
        revealSkip: this.root.querySelector('#rw-reveal-skip'),
        revealBtn: this.root.querySelector('#rw-reveal-btn'),
        revealStatus: this.root.querySelector('#rw-reveal-status'),
        dock: this.root.querySelector('#rw-dock'),
        feedback: this.root.querySelector('#rw-feedback'),
        extraGuess: this.root.querySelector('#rw-extra-guess'),
        extraGuessTitle: this.root.querySelector('#rw-extra-guess-title'),
        extraGuessActions: this.root.querySelector('#rw-extra-guess-actions'),
        extraGuessGiveUp: this.root.querySelector('#rw-extra-guess-giveup'),
        extraGuessArc: this.root.querySelector('#rw-heartbeat-arc'),
        overlay: this.root.querySelector('#rw-overlay'),
        overlayEmoji: this.root.querySelector('#rw-overlay-emoji'),
        overlayTitle: this.root.querySelector('#rw-overlay-title'),
        overlayAnswer: this.root.querySelector('#rw-overlay-answer'),
        overlaySub: this.root.querySelector('#rw-overlay-sub'),
        overlayBtn: this.root.querySelector('#rw-overlay-btn'),
      };

      this.els.slots.addEventListener('click', (e) => {
        const slot = e.target.closest('[data-slot-index]');
        if (!slot || slot.classList.contains('revealing') || this.gameOver || this.checking || this.roundLocked || this.awaitingExtraGuess) return;
        this.clearSlot(parseInt(slot.dataset.slotIndex, 10));
      });

      this.els.dock.addEventListener('click', (e) => {
        const tile = e.target.closest('[data-tile-id]');
        if (!tile || this.gameOver || this.checking || this.roundLocked || this.awaitingExtraGuess) return;
        if (tile.classList.contains('rw-dock-tile--used')) {
          if (this.isSoloMode()) this.recallFromDock(tile.dataset.tileId);
          return;
        }
        this.placeFromDock(tile.dataset.tileId);
      });

      this.els.extraGuessActions?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        const action = btn.dataset.action;
        if (action === 'token') this.onExtraGuessUseToken();
        else if (action === 'coins') this.onExtraGuessBuyCoins();
        else if (action === 'ad') this.onExtraGuessWatchAd();
      });
      this.els.extraGuessGiveUp?.addEventListener('click', () => this.onExtraGuessGiveUp());

      this.els.pauseBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        this.openPauseMenu();
      });

      this.els.overlayBtn.addEventListener('click', () => this.onOverlayContinue());
      this.els.revealBtn?.addEventListener('click', () => this.onRevealButtonClick());

      if (this.raceMode) {
        this.root.classList.add('rw-race-mode');
        this.root.querySelector('.rw-header')?.classList.add('hidden');
        this.els.soloStreak?.closest('.wc-combo-wrap')?.classList.add('hidden');
      } else if (!this.showOppPreview) {
        this.root.classList.add('rw-solo-mode');
      }

      global.I18n?.onChange?.(() => this.renderStaticI18n());

      const chainId = this.raceMode ? this.fixedChainId : this.progress.chainId;
      const linkIndex = this.raceMode ? this.initialLinkIndex : this.progress.linkIndex;
      if (this.useThemeRotation) {
        this.globalLinkIndex = this.raceMode
          ? (Number(this.initialLinkIndex) || 0)
          : (Number(this.progress.globalLinkIndex) || 0);
        this.applyLinkState(this.globalLinkIndex);
      } else {
        this.loadLink(chainId, linkIndex);
      }
    }

    renderStaticI18n() {
      this.root.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (key) el.textContent = t(key);
      });
      this.updateLives();
      if (this.isSoloMode()) {
        this.updateSoloStreakDisplay({ animate: false });
      }
      if (this.puzzle) {
        this.renderChainMeta();
        if (this.showOppPreview) {
          this.renderSlots({ skipEmit: true });
          this.updateRevealUi();
        }
      }
    }

    getTrailWords(linkIndex, chainId) {
      if (this.useThemeRotation) {
        const resolved = global.RelatedWordsChains?.resolveRoundPuzzle?.(linkIndex);
        if (!resolved) return [];
        const chain = RW().getChain(resolved.chainId);
        if (!chain?.words) return [];
        return chain.words.slice(Math.max(0, resolved.linkIndex - 2), resolved.linkIndex);
      }
      const chain = RW().getChain(chainId || this.puzzle?.chainId);
      if (!chain?.words) return [];
      return chain.words.slice(Math.max(0, linkIndex - 2), linkIndex);
    }

    puzzleLocation(globalLinkIndex) {
      if (this.useThemeRotation) {
        return global.RelatedWordsChains.resolveRoundPuzzle(globalLinkIndex);
      }
      return {
        chainId: this.fixedChainId || this.progress.chainId,
        linkIndex: globalLinkIndex,
        globalLinkIndex,
      };
    }

    loadLink(chainId, linkIndex, opts = {}) {
      if (this.useThemeRotation) {
        const globalIdx = Number.isFinite(Number(chainId)) && linkIndex == null
          ? Number(chainId)
          : (Number(linkIndex) ?? Number(chainId) ?? this.globalLinkIndex);
        if (opts.useTileFlipTransition) {
          return this.advanceToNextLink(globalIdx, opts);
        }
        this.applyLinkState(globalIdx, opts);
        return;
      }
      if (opts.useTileFlipTransition) {
        return this.advanceToNextLink(chainId, linkIndex, opts);
      }
      this.applyLinkState(chainId, linkIndex, opts);
    }

    applyLinkState(chainIdOrGlobal, linkIndexOrOpts, maybeOpts = {}) {
      let chainId;
      let linkIndex;
      let opts;
      if (this.useThemeRotation) {
        const globalIdx = Math.max(0, Number(chainIdOrGlobal) || 0);
        opts = linkIndexOrOpts || {};
        this.globalLinkIndex = globalIdx;
        const resolved = this.puzzleLocation(globalIdx);
        chainId = resolved.chainId;
        linkIndex = resolved.linkIndex;
      } else {
        chainId = chainIdOrGlobal;
        linkIndex = linkIndexOrOpts;
        opts = maybeOpts;
      }
      const skipTrail = opts.skipTrail === true;
      const skipDockRender = opts.skipDockRender === true;
      this.puzzle = RW().getPuzzle(chainId, linkIndex);
      if (!this.puzzle) {
        if (this.raceMode) {
          this.setSharedWordsDone(linkIndex);
          if (this.isRaceObjectiveComplete(linkIndex)) {
            this.gameOver = true;
            this.checkedComplete = true;
            this.enabled = false;
          }
          return;
        }
        if (!opts._resetAttempted) {
          const reset = saveProgress({
            chainId: RW()?.getAllChains?.()?.[0]?.id || 'rw-food-cooking',
            linkIndex: 0,
            solvedInChain: [],
          });
          this.progress = reset;
          return this.applyLinkState(reset.chainId, 0, { ...opts, _resetAttempted: true });
        }
        console.warn('[Jamodeul] Related words puzzle missing', { chainId, linkIndex });
        return;
      }
      if (this.raceMode) {
        this.setSharedWordsDone(linkIndex);
      }
      this._animatedTrailLinkIndex = null;
      if (this.raceMode) {
        this.progress = {
          chainId: this.puzzle.chainId,
          linkIndex: this.puzzle.linkIndex,
          solvedInChain: this.progress?.solvedInChain || [],
        };
      } else {
        this.progress = saveProgress({
          chainId: this.puzzle.chainId,
          linkIndex: this.puzzle.linkIndex,
        });
      }
      this.guessCount = 0;
      this.checking = false;
      this.gameOver = false;
      this.awaitingExtraGuess = false;
      this.won = false;
      this.roundLocked = false;
      this._oppFlippedThisRound = false;
      this._oppWinAnimating = false;
      this._oppRoundWonPending = false;
      this._flyingSlotIndex = -1;
      this._flyingTileId = null;
      this._prevGuessCount = 0;
      this._prevOppWrong = 0;
      this._oppStunLocalEndsAt = 0;
      this.resetRevealRoundState();
      this.slots = this.puzzle.answerSyllables.map(() => null);
      if (!skipDockRender) {
        this.dock = this.puzzle.dockTiles.map((tile) => ({ ...tile, used: false, slotIndex: null }));
      }
      this.oppSlotChars = this.slots.map(() => '');
      this.els.overlay.classList.add('hidden');
      this.hideExtraGuessPrompt();
      this.els.feedback.classList.add('hidden');
      this.els.feedback.classList.remove('success', 'chain-complete');
      this.els.board.classList.remove('rw-fade-out', 'rw-fade-in', 'rw-round-locked');

      if (!skipTrail) {
        const trailIdx = this.useThemeRotation ? this.globalLinkIndex : linkIndex;
        const trailChain = this.useThemeRotation ? null : chainId;
        this.renderTrail(this.getTrailWords(trailIdx, trailChain));
      }
      this.renderChainMeta();
      this.updateLives();
      this.renderSlots();
      if (!skipDockRender) {
        this.renderDock();
      }
      if (this.isSoloMode()) {
        this.updateSoloStreakDisplay();
      }
    }

    isSoloMode() {
      return !this.raceMode && !this.showOppPreview;
    }

    getSoloStreak() {
      return Math.max(0, Number(this.progress?.soloStreak ?? loadProgress().soloStreak) || 0);
    }

    getBestSoloStreak() {
      return Math.max(0, Number(this.progress?.bestSoloStreak ?? loadProgress().bestSoloStreak) || 0);
    }

    recordSoloStreakWin() {
      const streak = this.getSoloStreak() + 1;
      const best = Math.max(this.getBestSoloStreak(), streak);
      this.progress = saveProgress({ soloStreak: streak, bestSoloStreak: best });
      global.FirebaseSocial?.syncWordChainBestStreak?.(best);
      return streak;
    }

    getComboFireTier(streak) {
      const n = Math.max(0, Number(streak) || 0);
      if (n <= 0) return 0;
      if (n >= 100) return 100;
      if (n >= 75) return 75;
      if (n >= 50) return 50;
      if (n >= 40) return 40;
      if (n >= 30) return 30;
      if (n >= 10) return 10;
      if (n >= 5) return 5;
      if (n >= 3) return 3;
      return 1;
    }

    getComboSparkConfig(tier) {
      if (tier >= 100) {
        return { count: 20, spread: 54, colors: ['#ffffff', '#ff6ec7', '#7dffd8', '#ffe566', '#b47aff', '#4de8ff'], rainbow: true };
      }
      if (tier >= 75) {
        return { count: 18, spread: 48, colors: ['#ffffff', '#a855f7', '#6366f1', '#c084fc', '#818cf8'] };
      }
      if (tier >= 50) {
        return { count: 16, spread: 44, colors: ['#ffffff', '#d946ef', '#a855f7', '#e879f9', '#c084fc'] };
      }
      if (tier >= 40) {
        return { count: 14, spread: 40, colors: ['#ffffff', '#7dffd8', '#b47aff', '#a855f7', '#4de8c8'] };
      }
      if (tier >= 30) {
        return { count: 12, spread: 40, colors: ['#ffffff', '#7dffd8', '#4de8c8', '#a8fff0'] };
      }
      if (tier >= 10) {
        return { count: 12, spread: 36, colors: ['#ffffff', '#ffb84d', '#ff9628', '#ffe566'] };
      }
      return { count: 10, spread: 28, colors: ['#ffffff', '#ffb84d', '#ff9628', '#ffe566'] };
    }

    applyComboFireTier(badgeEl, streak) {
      if (!badgeEl) return;
      const tier = this.getComboFireTier(streak);
      badgeEl.classList.remove(
        'wc-combo-badge--tier-1',
        'wc-combo-badge--tier-3',
        'wc-combo-badge--tier-5',
        'wc-combo-badge--tier-10',
        'wc-combo-badge--tier-30',
        'wc-combo-badge--tier-40',
        'wc-combo-badge--tier-50',
        'wc-combo-badge--tier-75',
        'wc-combo-badge--tier-100',
      );
      if (tier > 0) {
        badgeEl.classList.add(`wc-combo-badge--tier-${tier}`);
        badgeEl.dataset.comboTier = String(tier);
      } else {
        delete badgeEl.dataset.comboTier;
      }
    }

    isComboMilestone(streak) {
      const n = Math.max(0, Number(streak) || 0);
      return n > 0 && (
        n === 3 || n === 5 || n === 10 || n === 30 || n === 40 || n === 50 || n === 75 || n === 100
        || (n > 100 && n % 10 === 0)
      );
    }

    playComboIncrease(badgeEl, countEl, streak) {
      if (reduceMotion() || !badgeEl) return;
      const prevTier = this.getComboFireTier(this._lastDisplayedStreak ?? 0);
      const nextTier = this.getComboFireTier(streak);
      badgeEl.classList.remove('wc-combo-badge--pop', 'wc-combo-badge--glow', 'wc-combo-badge--tier-up');
      countEl?.classList.remove('wc-combo-badge__count--pulse');
      void badgeEl.offsetWidth;
      badgeEl.classList.add('wc-combo-badge--pop', 'wc-combo-badge--glow');
      if (nextTier > prevTier) badgeEl.classList.add('wc-combo-badge--tier-up');
      countEl?.classList.add('wc-combo-badge__count--pulse');
      window.setTimeout(() => {
        badgeEl.classList.remove('wc-combo-badge--pop', 'wc-combo-badge--glow', 'wc-combo-badge--tier-up');
        countEl?.classList.remove('wc-combo-badge__count--pulse');
      }, 720);
      const sparkCfg = this.getComboSparkConfig(nextTier);
      const shouldSpark = this.isComboMilestone(streak) || nextTier >= 40;
      if (shouldSpark) {
        this.spawnComboSparks(badgeEl, { ...sparkCfg, tier: nextTier });
      }
    }

    spawnComboSparks(badgeEl, opts = {}) {
      if (reduceMotion() || !badgeEl) return;
      const rect = badgeEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const tier = opts.tier || Number(badgeEl.dataset.comboTier) || 1;
      const fallback = this.getComboSparkConfig(tier);
      const colors = opts.colors || fallback.colors;
      const count = opts.count || fallback.count;
      const spread = opts.spread || fallback.spread;
      const rainbow = opts.rainbow || fallback.rainbow;
      for (let i = 0; i < count; i++) {
        const spark = document.createElement('span');
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
        const dist = spread * 0.7 + Math.random() * spread;
        let cls = 'wc-combo-spark';
        if (rainbow) cls += ' wc-combo-spark--rainbow';
        else if (tier >= 75 && i % 4 === 0) cls += ' wc-combo-spark--cosmic';
        else if (i % 3 === 0) cls += ' wc-combo-spark--star';
        spark.className = cls;
        spark.style.left = `${cx}px`;
        spark.style.top = `${cy}px`;
        spark.style.background = colors[i % colors.length];
        if (rainbow) {
          spark.style.setProperty('--wc-spark-hue', `${(i * 47) % 360}`);
        }
        spark.style.setProperty('--wc-spark-dx', `${Math.cos(angle) * dist}px`);
        spark.style.setProperty('--wc-spark-dy', `${Math.sin(angle) * dist - 6}px`);
        spark.style.animationDuration = `${0.42 + Math.random() * 0.28}s`;
        spark.style.animationDelay = `${Math.random() * 0.06}s`;
        document.body.appendChild(spark);
        window.setTimeout(() => spark.remove(), 900);
      }
    }

    updateSoloStreakDisplay(opts = {}) {
      const el = this.els.soloStreak;
      const countEl = this.els.soloStreakCount;
      if (!el) return;
      if (!this.isSoloMode()) {
        el.closest('.wc-combo-wrap')?.classList.add('hidden');
        return;
      }
      el.closest('.wc-combo-wrap')?.classList.remove('hidden');
      const streak = this.getSoloStreak();
      const prev = this._lastDisplayedStreak ?? streak;
      if (countEl) countEl.textContent = String(streak);
      el.setAttribute('aria-label', t('relatedWords.streak', { count: streak }));
      el.classList.toggle('wc-combo-badge--zero', streak <= 0);
      el.classList.toggle('is-burning', streak > 0);
      this.applyComboFireTier(el, streak);
      el.classList.remove('hidden');
      const animate = opts.animate !== false;
      if (animate && streak > prev) {
        this.playComboIncrease(el, countEl, streak);
      }
      this._lastDisplayedStreak = streak;
    }

    resetSoloStreak() {
      this.progress = saveProgress({ soloStreak: 0 });
      this._lastDisplayedStreak = 0;
      this.updateSoloStreakDisplay({ animate: false });
    }

    persistSoloProgress() {
      if (!this.puzzle) return;
      const base = loadProgress();
      this.progress = saveProgress({
        ...base,
        chainId: this.puzzle.chainId,
        linkIndex: this.puzzle.linkIndex,
        soloStreak: this.getSoloStreak(),
        solvedInChain: Array.isArray(this.progress?.solvedInChain)
          ? [...this.progress.solvedInChain]
          : [],
      });
      markSavedExit();
    }

    openPauseMenu() {
      if (!this.isSoloMode() || !global.PauseQuitUI) return;
      global.PauseQuitUI.show({
        mode: 'wordChain',
        streak: this.getSoloStreak(),
        warningKey: 'comboWarning',
        onResume: () => {},
        onQuit: () => {
          this.resetSoloStreak();
          clearSoloLeftMark();
          global.location.href = 'index.html';
        },
        onSaveProgressAd: () => {
          if (!global.confirm(t('pauseQuit.saveAdConfirm'))) return;
          this.persistSoloProgress();
          clearSoloLeftMark();
          global.PauseQuitUI.close();
          global.location.href = 'index.html';
        },
      });
    }

    async startNewChainForRetry() {
      const prevChainId = this.puzzle?.chainId || this.progress?.chainId || '';
      const base = loadProgress();
      const chain = RW().pickChain({
        ...base,
        chainId: prevChainId,
        soloStreak: 0,
      });
      this.progress = saveProgress({
        ...base,
        chainId: chain.id,
        linkIndex: 0,
        solvedInChain: [],
        soloStreak: 0,
      });
      this.gameOver = false;
      this.won = false;
      this.checking = false;
      this.guessCount = 0;
      this.awaitingExtraGuess = false;
      await this.loadLink(chain.id, 0);
    }

    recallFromDock(tileId) {
      if (!this.isSoloMode() || !this.enabled || this.roundLocked || this.isStunned()) return;
      const tile = this.dock.find((item) => item.id === tileId && item.used);
      if (!tile || tile.slotIndex == null) return;
      this.clearSlot(tile.slotIndex);
    }

    getExtraGuessPrice() {
      return global.ShopService?.ITEMS?.extraGuess?.price || 40;
    }

    renderExtraGuessPrompt() {
      const inv = global.ShopService?.getInventory?.() || {};
      const tokens = Math.max(0, Number(inv.extraGuessTokens) || 0);
      const coins = Math.max(0, Number(inv.coins) || 0);
      const price = this.getExtraGuessPrice();
      const parts = [];

      if (tokens > 0) {
        parts.push(`<button type="button" class="rw-extra-btn rw-extra-btn--token" data-action="token">${escapeHtml(t('relatedWords.extraGuessUseToken', { count: tokens }))}</button>`);
      }
      parts.push(`<button type="button" class="rw-extra-btn rw-extra-btn--coins" data-action="coins"${coins < price ? ' disabled' : ''}>${escapeHtml(t('relatedWords.extraGuessBuyCoins', { count: price }))}</button>`);
      parts.push(`<button type="button" class="rw-extra-btn rw-extra-btn--ad" data-action="ad">${escapeHtml(t('relatedWords.extraGuessWatchAd'))}</button>`);

      this.els.extraGuessTitle.textContent = t('relatedWords.extraGuessTitle');
      this.els.extraGuessActions.innerHTML = parts.join('');
      this.els.extraGuessGiveUp.textContent = t('relatedWords.extraGuessGiveUp');
      this.els.extraGuess?.classList.remove('hidden');
    }

    stopExtraGuessTimer() {
      if (this._extraGuessTimer) {
        clearTimeout(this._extraGuessTimer);
        this._extraGuessTimer = null;
      }
      if (this._extraGuessRaf) {
        cancelAnimationFrame(this._extraGuessRaf);
        this._extraGuessRaf = null;
      }
    }

    startExtraGuessTimer() {
      this.stopExtraGuessTimer();
      const arc = this.els.extraGuessArc;
      if (!arc) {
        this._extraGuessTimer = setTimeout(() => this.onExtraGuessTimeout(), EXTRA_GUESS_TIMER_MS);
        return;
      }

      const circumference = 2 * Math.PI * HEARTBEAT_RADIUS;
      arc.style.strokeDasharray = `${circumference}`;
      arc.style.strokeDashoffset = '0';

      if (reduceMotion()) {
        this._extraGuessTimer = setTimeout(() => this.onExtraGuessTimeout(), EXTRA_GUESS_TIMER_MS);
        return;
      }

      const startedAt = performance.now();
      const tick = (now) => {
        if (!this.awaitingExtraGuess) return;
        const elapsed = Math.min(EXTRA_GUESS_TIMER_MS, now - startedAt);
        const progress = elapsed / EXTRA_GUESS_TIMER_MS;
        arc.style.strokeDashoffset = String(circumference * progress);
        if (progress < 1) {
          this._extraGuessRaf = requestAnimationFrame(tick);
        }
      };
      this._extraGuessRaf = requestAnimationFrame(tick);
      this._extraGuessTimer = setTimeout(() => this.onExtraGuessTimeout(), EXTRA_GUESS_TIMER_MS);
    }

    hideExtraGuessPrompt() {
      this.stopExtraGuessTimer();
      this.awaitingExtraGuess = false;
      this.els.extraGuess?.classList.add('hidden');
    }

    grantExtraGuess() {
      this.hideExtraGuessPrompt();
      this.gameOver = false;
      this.guessCount = 0;
      this.resetSlots();
      this.updateLives();
      this.els.feedback.classList.add('hidden');
    }

    onExtraGuessUseToken() {
      if (!global.ShopService?.spendExtraGuessToken?.()) return;
      this.grantExtraGuess();
    }

    onExtraGuessBuyCoins() {
      const price = this.getExtraGuessPrice();
      const profile = global.ProfileService?.loadProfile?.();
      if (!profile || (profile.coins || 0) < price) {
        this.showFeedback(t('relatedWords.extraGuessInsufficient'), 'error');
        return;
      }
      profile.coins -= price;
      global.ProfileService?.saveProfile?.(profile);
      global.PlayerHud?.refresh?.();
      this.grantExtraGuess();
    }

    onExtraGuessWatchAd() {
      if (!global.confirm(t('relatedWords.extraGuessAdConfirm'))) return;
      this.grantExtraGuess();
    }

    async onExtraGuessGiveUp() {
      this.hideExtraGuessPrompt();
      this.resetSoloStreak();
      await this.delay(120);
      this.showLoss();
    }

    async onExtraGuessTimeout() {
      if (!this.awaitingExtraGuess) return;
      this.hideExtraGuessPrompt();
      this.resetSoloStreak();
      await this.delay(120);
      this.showLoss();
    }

    async showExtraGuessPrompt() {
      this.awaitingExtraGuess = true;
      this.gameOver = true;
      this.renderExtraGuessPrompt();
      this.startExtraGuessTimer();
    }

    async advanceToNextLink(chainIdOrGlobal, linkIndexOrOpts, maybeOpts = {}) {
      let chainId;
      let linkIndex;
      let opts;
      if (this.useThemeRotation) {
        linkIndex = Math.max(0, Number(chainIdOrGlobal) || 0);
        opts = linkIndexOrOpts || {};
        const resolved = this.puzzleLocation(linkIndex);
        chainId = resolved.chainId;
      } else {
        chainId = chainIdOrGlobal;
        linkIndex = linkIndexOrOpts;
        opts = maybeOpts;
      }
      const nextPuzzle = RW().getPuzzle(chainId, linkIndex);
      const linkCount = RW().getPuzzleCount(chainId);
      const pastRaceTarget = this.raceMode && linkIndex >= this.raceTarget;
      const pastChainEnd = this.raceMode && linkIndex >= linkCount;
      if (!nextPuzzle || pastChainEnd || pastRaceTarget) {
        this.setSharedWordsDone(Math.min(linkIndex, linkCount, this.raceTarget));
        if (this.isRaceObjectiveComplete(linkIndex)) {
          this.gameOver = true;
          this.checkedComplete = true;
          if (this.sharedRace) this.enabled = false;
        }
        return;
      }

      await this.onRoundAdvanceLivesReset();
      global.SoundEffects?.roundAdvance?.();

      const solvedWord = this.puzzle?.answer;
      const skipTrailAnim = opts.skipTrail === true || this._animatedTrailLinkIndex === linkIndex;
      const skipSlotFlip = opts.skipSlotFlip === true;

      if (!skipTrailAnim && solvedWord && !opts.skipped && !skipSlotFlip) {
        if (opts.opponentWon) {
          await this.flashSlotsGreen('.rw-opp-slot.flip-tile', { fast: this.raceMode });
          let flipPromise = this._slotFlipPromise || null;
          this._slotFlipPromise = null;
          if (!opts.skipScoreFly) {
            const points = global.RelatedWordsChains?.relatedWordsRoundPoints?.(solvedWord) ?? 1;
            await this.playScoreFly({
              side: 'opp',
              points,
              slotSelector: '.rw-opp-slot.flip-tile',
              onPop: () => {
                if (!flipPromise) {
                  flipPromise = this.flipOppSlotsAway({ skipFlash: true, fast: false });
                }
              },
            });
          } else if (!flipPromise) {
            flipPromise = this.flipOppSlotsAway({ skipFlash: true, fast: false });
          }
          await this.flyThenTrailAdvance(solvedWord, linkIndex, 'enemy', { flipPromise });
          this._oppRoundWonPending = false;
        } else {
          if (this.raceMode || this.showOppPreview || this.isSoloMode()) {
            await this.flashSlotsGreen('.rw-slot.flip-tile', { fast: this.raceMode });
          }
          let flipPromise = this._slotFlipPromise || null;
          this._slotFlipPromise = null;
          if (!opts.skipScoreFly) {
            const points = global.RelatedWordsChains?.relatedWordsRoundPoints?.(solvedWord) ?? 1;
            await this.playScoreFly({
              side: 'my',
              points,
              slotSelector: '.rw-slot.flip-tile',
              onPop: () => {
                if (!flipPromise) {
                  flipPromise = this.flipSlotsAway({ skipFlash: true, fast: false });
                }
              },
            });
          } else if (!flipPromise) {
            flipPromise = this.flipSlotsAway({ skipFlash: true, fast: false });
          }
          await this.flyThenTrailAdvance(solvedWord, linkIndex, 'you', { flipPromise });
        }
        this._animatedTrailLinkIndex = linkIndex;
      } else if (opts.skipped && solvedWord) {
        await this.animateRevealSkip(solvedWord, linkIndex);
        this._animatedTrailLinkIndex = linkIndex;
      } else if (opts.opponentWon) {
        this._oppRoundWonPending = false;
        await this.delay(reduceMotion() ? 60 : 100);
      }

      await this.flipDockToNewLetters(nextPuzzle.dockTiles, { fast: this.raceMode });
      global.SoundEffects?.dockFlip?.();

      const applyOpts = { skipTrail: true, skipDockRender: true };
      if (this.useThemeRotation) {
        this.applyLinkState(linkIndex, applyOpts);
      } else {
        this.applyLinkState(chainId, linkIndex, applyOpts);
      }

      this.dock = nextPuzzle.dockTiles.map((tile) => ({ ...tile, used: false, slotIndex: null }));
      if (reduceMotion()) {
        this.renderDock();
      }
    }

    getRaceProgressCurrent() {
      if (this.sharedRace || this.raceMode) {
        return Math.max(0, Number(this.sharedWordsDone) || 0);
      }
      return this.wordsSolved;
    }

    setSharedWordsDone(count) {
      if (!this.raceMode) return;
      this.sharedWordsDone = Math.max(0, Number(count) || 0);
      this.renderChainMeta();
    }

    isRaceObjectiveComplete(linkIndex = this.sharedWordsDone) {
      if (!this.raceMode || !this.fixedChainId) return false;
      const idx = Math.max(0, Number(linkIndex) || 0);
      const linkCount = RW().getPuzzleCount(this.fixedChainId);
      return idx >= this.raceTarget || idx >= linkCount;
    }

    renderChainMeta() {
      const chain = RW()?.getChain?.(this.puzzle.chainId);
      const titled = this.puzzle.chainTitleKey ? t(this.puzzle.chainTitleKey) : '';
      const label = (titled && titled !== this.puzzle.chainTitleKey)
        ? titled
        : (global.RelatedWordsChains?.chainLabel?.(chain) || titled || '');
      this.els.chainTitle.textContent = label;
      if (this.raceMode) {
        this.els.chainProgress.textContent = t('relatedWordsRace.wordsProgress', {
          current: this.getRaceProgressCurrent(),
          target: this.raceTarget,
        });
      } else {
        this.els.chainProgress.textContent = t('relatedWords.chainProgress', {
          current: this.puzzle.linkIndex + 1,
          total: this.puzzle.linkCount,
        });
      }
    }

    renderTrail(words) {
      const track = this.els.trailTrack;
      const count = words.length;
      if (!count) {
        track.innerHTML = '';
        track.classList.remove('advancing', 'active');
        return;
      }

      const ageOffset = Math.max(0, 3 - count);
      track.innerHTML = words.map((word, index) => {
        const slot = ageOffset + index;
        const isClue = index === count - 1;
        return `<span class="rw-trail-word${isClue ? ' clue' : ''}" data-slot="${slot}">${word}</span>`;
      }).join('');
      track.classList.remove('advancing', 'active');
      track.classList.toggle('rw-trail--race', this.raceMode);
      track.classList.toggle('rw-trail--solo', this.raceMode && count === 1);
    }

    async animateTrailAdvance(solvedWord, nextLinkIndex) {
      const nextWords = this.getTrailWords(nextLinkIndex, this.puzzle.chainId);
      const track = this.els.trailTrack;
      const existing = [...track.querySelectorAll('.rw-trail-word:not(.entering)')];
      const advanceMs = this.raceMode ? TRAIL_ADVANCE_RACE_MS : TRAIL_ADVANCE_MS;

      if (reduceMotion() || !existing.length) {
        this.renderTrail(nextWords);
        return;
      }

      const incoming = document.createElement('span');
      incoming.className = 'rw-trail-word clue entering';
      incoming.dataset.slot = '2';
      incoming.textContent = solvedWord;

      track.classList.add('advancing');
      void track.offsetWidth;

      existing.forEach((el) => {
        const slot = parseInt(el.dataset.slot, 10);
        if (Number.isNaN(slot)) return;
        if (slot === 0) {
          el.classList.add('exit');
          return;
        }
        el.dataset.slot = String(slot - 1);
        el.classList.remove('clue');
      });

      track.appendChild(incoming);
      void track.offsetWidth;
      track.classList.add('active');

      await this.delay(advanceMs);

      this.renderTrail(nextWords);
    }

    prepareTrailShift(solvedWord, nextLinkIndex) {
      const nextWords = this.getTrailWords(nextLinkIndex, this.puzzle.chainId);
      const track = this.els.trailTrack;
      const durationMs = this.raceMode ? TRAIL_ADVANCE_RACE_MS : TRAIL_ADVANCE_MS;

      const fallbackTarget = () => track.querySelector('.rw-trail-word.clue')
        || track.querySelector('.rw-trail-word[data-slot="2"]')
        || track.querySelector('.rw-trail-word:last-child')
        || track;

      if (!solvedWord) {
        return { flyTarget: fallbackTarget(), trailDone: Promise.resolve(), nextWords };
      }

      const oldest = track.querySelector('.rw-trail-word[data-slot="0"]');
      if (!oldest || nextWords.length <= 2) {
        return { flyTarget: fallbackTarget(), trailDone: Promise.resolve(), nextWords };
      }

      const existing = [...track.querySelectorAll('.rw-trail-word:not(.entering)')];
      const incoming = document.createElement('span');
      incoming.className = 'rw-trail-word clue entering';
      incoming.dataset.slot = '2';
      incoming.textContent = solvedWord;

      track.classList.add('advancing');
      void track.offsetWidth;

      existing.forEach((el) => {
        const slot = parseInt(el.dataset.slot, 10);
        if (Number.isNaN(slot)) return;
        if (slot === 0) {
          el.classList.add('exit');
          return;
        }
        el.dataset.slot = String(slot - 1);
        el.classList.remove('clue');
      });

      track.appendChild(incoming);
      void track.offsetWidth;

      const trailDone = new Promise((resolve) => {
        requestAnimationFrame(() => {
          track.classList.add('active');
          setTimeout(resolve, durationMs);
        });
      });

      return { flyTarget: incoming, trailDone, nextWords };
    }

    /** Ghost word lifts from a vs panel into the trail clue slot. */
    async flySolvedWordToTrail(word, source = 'you', targetEl = null) {
      if (reduceMotion() || !word) return;

      const panelSel = source === 'enemy' ? '.rw-vs-panel--enemy' : '.rw-vs-panel--you';
      const panel = this.els.slots?.querySelector(panelSel);
      const slotsEl = panel?.querySelector('.rw-vs-panel-slots');
      const trailTrack = this.els.trailTrack;
      if (!slotsEl || !trailTrack) return;

      const fromRect = slotsEl.getBoundingClientRect();
      const clueEl = targetEl
        || trailTrack.querySelector('.rw-trail-word.clue')
        || trailTrack.querySelector('.rw-trail-word[data-slot="2"]')
        || trailTrack.querySelector('.rw-trail-word:last-child');
      const trackRect = trailTrack.getBoundingClientRect();
      const toRect = clueEl
        ? clueEl.getBoundingClientRect()
        : {
          left: trackRect.left + trackRect.width / 2 - 24,
          top: trackRect.top + trackRect.height * 0.62,
          width: 48,
          height: 48,
        };

      const ghost = document.createElement('div');
      ghost.className = `rw-solved-fly rw-solved-fly--${source}`;
      ghost.textContent = word;
      ghost.setAttribute('aria-hidden', 'true');

      const startX = fromRect.left + fromRect.width / 2;
      const startY = fromRect.top + fromRect.height / 2;
      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;
      const dx = endX - startX;
      const dy = endY - startY;
      const endScale = clueEl
        ? Math.min(1.15, Math.max(0.45, toRect.height / Math.max(fromRect.height, 1)))
        : 0.75;

      ghost.style.left = `${startX}px`;
      ghost.style.top = `${startY}px`;
      document.body.appendChild(ghost);

      const anim = ghost.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${endScale})`,
          opacity: 0.95,
        },
      ], {
        duration: SOLVED_FLY_MS,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      });

      await new Promise((resolve) => {
        anim.onfinish = resolve;
        anim.oncancel = resolve;
        setTimeout(resolve, SOLVED_FLY_MS + 40);
      });
      ghost.remove();
    }

    async flyThenTrailAdvance(solvedWord, nextLinkIndex, source = 'you', opts = {}) {
      const { flipPromise = null } = opts;
      const { flyTarget, trailDone, nextWords } = this.prepareTrailShift(solvedWord, nextLinkIndex);

      if (reduceMotion() || !solvedWord) {
        if (flipPromise) await flipPromise;
        this.renderTrail(nextWords);
        return;
      }

      const flyPromise = this.flySolvedWordToTrail(solvedWord, source, flyTarget);
      await Promise.all([
        flyPromise,
        trailDone,
        flipPromise || Promise.resolve(),
      ]);
      this.renderTrail(nextWords);
    }

    render() {
      this.renderChainMeta();
      this.renderTrail(
        this.getTrailWords(
          this.useThemeRotation ? this.globalLinkIndex : this.puzzle.linkIndex,
          this.useThemeRotation ? null : this.puzzle.chainId,
        ),
      );
      this.updateLives();
      this.renderSlots();
      this.renderDock();
    }

    updateLives() {
      if (this.showOppPreview) {
        this.els.lives.innerHTML = '';
        this.renderVsPanelLives(
          this.getVsPanelLivesEl('you'),
          this.guessCount,
          this._prevGuessCount,
        );
        this.renderVsPanelLives(
          this.getVsPanelLivesEl('enemy'),
          this.oppWrongCount,
          this._prevOppWrong,
        );
        this._prevGuessCount = this.guessCount;
        this._prevOppWrong = this.oppWrongCount;
        this.els.lives.setAttribute('aria-label', t('relatedWords.livesAria', {
          used: this.guessCount,
          total: MAX_GUESSES,
        }));
        this.emitLiveHudUpdate();
        return;
      }

      const prev = this._prevGuessCount ?? this.guessCount;
      const parts = [];
      for (let i = 0; i < MAX_GUESSES; i++) {
        let cls = 'rw-life';
        const used = i < this.guessCount;
        if (used) cls += ' used';
        if (this.guessCount > prev && i === this.guessCount - 1) cls += ' rw-life--wrong';
        const mark = used ? '✕' : '';
        parts.push(`<span class="${cls}" aria-hidden="true"><span class="rw-life-mark">${mark}</span></span>`);
      }
      this.els.lives.innerHTML = parts.join('');
      this._prevGuessCount = this.guessCount;
      this.els.lives.setAttribute('aria-label', t('relatedWords.livesAria', {
        used: this.guessCount,
        total: MAX_GUESSES,
      }));
      this.emitLiveHudUpdate();
    }

    getVsPanelLivesEl(side) {
      return this.els.slots?.querySelector(`.rw-vs-column--${side} .rw-vs-panel-lives`) || null;
    }

    renderVsPanelLives(container, usedCount, prevUsed = usedCount) {
      if (!container) return;
      const used = Math.max(0, Math.min(MAX_GUESSES, Number(usedCount) || 0));
      const prev = Math.max(0, Math.min(MAX_GUESSES, Number(prevUsed) || 0));
      const parts = [];
      for (let i = 0; i < MAX_GUESSES; i++) {
        let cls = 'rw-vs-panel-life';
        if (i < used) cls += ' used';
        if (used > prev && i === used - 1) cls += ' rw-vs-panel-life--wrong';
        if (used < prev && i === used) cls += ' rw-vs-panel-life--clear';
        const mark = i < used ? '✕' : '';
        parts.push(`<span class="${cls}" aria-hidden="true"><span class="rw-vs-panel-life-mark">${mark}</span></span>`);
      }
      container.innerHTML = parts.join('');
    }

    isStunned() {
      return this.getStunRemainingMs(this.stunnedUntil) > 0;
    }

    isOppStunned() {
      this.syncOpponentStunLocalEnd();
      return (this._oppStunLocalEndsAt || 0) > Date.now();
    }

    getStunRemainingMs(until) {
      const end = Math.max(0, Number(until) || 0);
      if (!end) return 0;
      const raw = end - Date.now();
      if (raw <= 0) return 0;
      return Math.min(raw, STUN_MS);
    }

    syncOpponentStunLocalEnd() {
      if (!this._oppStunLocalEndsAt) return;
      if (Date.now() < this._oppStunLocalEndsAt) return;
      this.clearOpponentStunLocal();
      if (this.oppWrongCount >= MAX_GUESSES) {
        this.oppWrongCount = 0;
        this._prevOppWrong = 0;
        this.updateLives();
      }
    }

    beginOpponentStunLocal() {
      this._oppStunLocalEndsAt = Date.now() + STUN_MS;
    }

    clearOpponentStunLocal() {
      this._oppStunLocalEndsAt = 0;
      this.oppStunnedUntil = 0;
    }

    emitLiveHudUpdate() {
      this.onLiveHudUpdate?.({
        wrongCount: this.guessCount,
        stunnedUntil: this.stunnedUntil || 0,
      });
    }

    setOpponentLiveState({ wrongCount, stunnedUntil } = {}) {
      const prevWrong = this.oppWrongCount;
      const nextWrong = Math.max(0, Math.min(MAX_GUESSES, Number(wrongCount) || 0));
      const remoteUntil = Math.max(0, Number(stunnedUntil) || 0);

      if (nextWrong >= MAX_GUESSES && prevWrong < MAX_GUESSES) {
        this.beginOpponentStunLocal();
      } else if (nextWrong >= MAX_GUESSES && remoteUntil > Date.now() && !this._oppStunLocalEndsAt) {
        this.beginOpponentStunLocal();
      }

      if (nextWrong === 0) {
        this.clearOpponentStunLocal();
        this._prevOppWrong = 0;
      }

      this.oppWrongCount = nextWrong;
      this.oppStunnedUntil = remoteUntil;

      if (this.isOppStunned() && this.oppSlotChars.some((char) => !!char)) {
        this.oppSlotChars = this.slots.map(() => '');
        this.renderSlots({ skipEmit: true });
      }

      this.updateLives();
      this.renderStunOverlays();

      if (this._oppStunTimer) {
        clearTimeout(this._oppStunTimer);
        this._oppStunTimer = null;
      }
      const remain = (this._oppStunLocalEndsAt || 0) - Date.now();
      if (remain > 0) {
        this._oppStunTimer = setTimeout(() => {
          this._oppStunTimer = null;
          this.syncOpponentStunLocalEnd();
          this.renderStunOverlays();
        }, remain + 50);
      }
    }

    renderStunOverlays() {
      if (!this.showOppPreview || !this.els.slots) return;
      const youPanel = this.els.slots.querySelector('.rw-vs-panel--you');
      const enemyPanel = this.els.slots.querySelector('.rw-vs-panel--enemy');
      const youStunned = this.isStunned();
      const oppStunned = this.isOppStunned();

      youPanel?.classList.toggle('rw-vs-stunned', youStunned);
      enemyPanel?.classList.toggle('rw-vs-stunned-opp', oppStunned);

      this.updateStunTimerDisplay(youPanel, this.stunnedUntil, youStunned, false);
      this.updateStunTimerDisplay(
        enemyPanel,
        this._oppStunLocalEndsAt || 0,
        oppStunned,
        true,
      );

      if (youStunned || oppStunned) {
        this.startStunCountdownTick();
      } else {
        this.stopStunCountdownTick();
      }
    }

    updateStunTimerDisplay(panel, stunnedUntil, stunned, isOpponent = false) {
      const slotsEl = panel?.querySelector('.rw-vs-panel-slots');
      const overlay = slotsEl?.querySelector('.rw-vs-stun-timer');
      const numEl = overlay?.querySelector('.rw-vs-stun-timer-num');
      if (!overlay || !numEl) return;

      overlay.classList.toggle('is-active', stunned);
      if (stunned) {
        const remainMs = isOpponent
          ? Math.max(0, (stunnedUntil || 0) - Date.now())
          : this.getStunRemainingMs(stunnedUntil);
        const maxSecs = Math.ceil(STUN_MS / 1000);
        const secs = Math.max(1, Math.min(maxSecs, Math.ceil(remainMs / 1000)));
        numEl.textContent = String(secs);
      } else {
        numEl.textContent = '';
      }
    }

    startStunCountdownTick() {
      if (this._stunCountdownTick) return;
      this._stunCountdownTick = setInterval(() => {
        if (!this.showOppPreview) {
          this.stopStunCountdownTick();
          return;
        }
        this.renderStunOverlays();
        if (!this.isStunned() && !this.isOppStunned()) {
          this.stopStunCountdownTick();
        }
      }, 200);
    }

    stopStunCountdownTick() {
      if (!this._stunCountdownTick) return;
      clearInterval(this._stunCountdownTick);
      this._stunCountdownTick = null;
    }

    async animateLivesClear(count) {
      const n = Math.max(0, Number(count) || 0);
      if (!n) return;
      for (let i = n; i > 0; i--) {
        this.guessCount = i - 1;
        this.updateLives();
        global.SoundEffects?.tick?.();
        await this.delay(220);
      }
      this.guessCount = 0;
      this.updateLives();
    }

    async onRoundAdvanceLivesReset() {
      const prev = this.guessCount;
      const wasStunned = this.isStunned();
      if (prev > 0) {
        await this.animateLivesClear(prev);
      } else {
        this.guessCount = 0;
        this.updateLives();
      }
      this.enabled = !wasStunned;
      this.renderStunOverlays();
      this.syncRwLive();
    }

    async applyStun() {
      this.stunnedUntil = Date.now() + STUN_MS;
      this.enabled = false;
      this.resetSlots();
      global.SoundEffects?.stun?.();
      this.showFeedback(t('relatedWordsRace.stunned'), 'error');
      this.renderStunOverlays();
      this.syncRwLive();

      await new Promise((resolve) => {
        if (this._stunTimer) clearTimeout(this._stunTimer);
        this._stunTimer = setTimeout(() => {
          this._stunTimer = null;
          this.stunnedUntil = 0;
          this.guessCount = 0;
          this.enabled = true;
          this.updateLives();
          this.resetSlots();
          this.renderStunOverlays();
          this.syncRwLive();
          this.els.feedback.classList.add('hidden');
          resolve();
        }, STUN_MS);
      });
    }

    renderSlots(opts = {}) {
      const skipEmit = opts.skipEmit === true;
      if (this.showOppPreview) {
        const enemyLabel = t('relatedWordsRace.enemy');
        const youLabel = t('relatedWordsRace.you');
        const oppSlotsHtml = this.slots.map((_, index) => {
          const oppChar = this.oppSlotChars[index] || '';
          const oppFilled = !!oppChar;
          return `<div class="rw-opp-slot flip-tile${oppFilled ? ' filled' : ''}" data-opp-slot-index="${index}" aria-hidden="true">
            <span class="rw-opp-slot-face rw-opp-slot-front">${oppChar}</span>
            <span class="rw-opp-slot-face rw-opp-slot-back" aria-hidden="true"></span>
          </div>`;
        }).join('');
        const playerSlotsHtml = this.slots.map((tile, index) => {
          const isFlying = this._flyingSlotIndex === index;
          const filled = tile !== null && !isFlying;
          const char = tile && !isFlying ? tile.char : '';
          const disabled = this.roundLocked ? ' disabled' : '';
          const pendingCls = isFlying ? ' rw-slot-pending' : '';
          return `<button type="button" class="rw-slot flip-tile${filled ? ' filled' : ''}${pendingCls}" data-slot-index="${index}"${disabled} aria-label="${t('relatedWords.slotAria', { n: index + 1 })}">
            <span class="rw-slot-face rw-slot-front">${char}</span>
            <span class="rw-slot-face rw-slot-back" aria-hidden="true"></span>
          </button>`;
        }).join('');

        this.els.slots.className = `rw-slots rw-vs-slots${this.slots.length === 3 ? ' rw-slots--3' : ''}`;
        this.els.slots.innerHTML = `
          <div class="rw-vs-column rw-vs-column--enemy">
            <div class="rw-vs-column-head rw-vs-column-head--enemy">
              <div class="rw-vs-panel-lives" aria-hidden="true"></div>
              <span class="rw-vs-panel-label">${enemyLabel}</span>
            </div>
            <div class="rw-vs-panel rw-vs-panel--enemy">
              <div class="rw-vs-panel-slots">
                ${oppSlotsHtml}
                <div class="rw-vs-stun-timer" aria-hidden="true"><span class="rw-vs-stun-timer-num"></span></div>
              </div>
            </div>
          </div>
          <div class="rw-vs-split" aria-hidden="true"></div>
          <div class="rw-vs-column rw-vs-column--you">
            <div class="rw-vs-column-head rw-vs-column-head--you">
              <span class="rw-vs-panel-label">${youLabel}</span>
              <div class="rw-vs-panel-lives" aria-hidden="true"></div>
            </div>
            <div class="rw-vs-panel rw-vs-panel--you">
              <div class="rw-vs-panel-slots">
                ${playerSlotsHtml}
                <div class="rw-vs-stun-timer" aria-hidden="true"><span class="rw-vs-stun-timer-num"></span></div>
              </div>
            </div>
          </div>`;
        this.updateLives();
        this.renderStunOverlays();
        if (this.roundLocked) {
          this.els.board?.classList.add('rw-round-locked');
        }
      } else {
        this.els.slots.className = 'rw-slots';
        this.els.slots.innerHTML = this.slots.map((tile, index) => {
          const isFlying = this._flyingSlotIndex === index;
          const filled = tile !== null && !isFlying;
          const char = tile && !isFlying ? tile.char : '';
          const pendingCls = isFlying ? ' rw-slot-pending' : '';
          return `<button type="button" class="rw-slot flip-tile${filled ? ' filled' : ''}${pendingCls}" data-slot-index="${index}" aria-label="${t('relatedWords.slotAria', { n: index + 1 })}">
            <span class="rw-slot-face rw-slot-front">${char}</span>
            <span class="rw-slot-face rw-slot-back" aria-hidden="true"></span>
          </button>`;
        }).join('');
      }
      if (!skipEmit) this.syncRwLive();
    }

    resetRevealRoundState() {
      this.clearRevealIdleTimer();
      this._revealUiVisible = false;
      this._revealPressed = false;
      this._revealBusy = false;
      this.hideRevealUi();
      this.startRevealIdleTimer();
    }

    clearRevealIdleTimer() {
      if (!this._revealIdleTimer) return;
      clearTimeout(this._revealIdleTimer);
      this._revealIdleTimer = null;
    }

    startRevealIdleTimer() {
      this.clearRevealIdleTimer();
      if (!this.showOppPreview || this.gameOver || this.roundLocked) return;
      this._revealIdleTimer = setTimeout(() => {
        this._revealIdleTimer = null;
        if (this.gameOver || this.roundLocked || this.checking) return;
        this._revealUiVisible = true;
        this.updateRevealUi();
      }, REVEAL_IDLE_MS);
    }

    touchRevealActivity() {
      if (!this.showOppPreview || this.gameOver || this.roundLocked) return;
      this._revealUiVisible = false;
      this.hideRevealUi();
      this.startRevealIdleTimer();
    }

    hideRevealUi() {
      this.els.revealSkip?.classList.add('hidden');
      this.els.revealBtn?.classList.add('hidden');
      this.els.revealStatus?.classList.add('hidden');
    }

    updateRevealUi() {
      if (!this.showOppPreview || !this.els.revealSkip) return;
      const visible = this._revealUiVisible && !this.gameOver && !this.roundLocked && !this._revealPressed;
      this.els.revealSkip.classList.toggle('hidden', !visible);
      if (!visible) return;

      this.els.revealBtn?.classList.remove('hidden');
      this.els.revealBtn.textContent = t('relatedWordsRace.revealAnswer');
      this.els.revealBtn.disabled = this._revealBusy;
      this.els.revealStatus?.classList.add('hidden');
    }

    getAnswerDockTileIds() {
      const need = [...(this.puzzle?.answerSyllables || [])];
      const ids = new Set();
      this.dock.forEach((tile) => {
        const idx = need.indexOf(tile.char);
        if (idx >= 0) {
          ids.add(tile.id);
          need.splice(idx, 1);
        }
      });
      return ids;
    }

    markRevealVanishTargets() {
      const correctIds = this.getAnswerDockTileIds();

      this.els.dock?.querySelectorAll('.rw-dock-tile').forEach((el) => {
        if (!correctIds.has(el.dataset.tileId)) {
          el.classList.add('rw-reveal-vanish');
        }
      });

      this.els.slots?.querySelectorAll('.rw-slot.filled, .rw-opp-slot.filled').forEach((el) => {
        el.classList.add('rw-reveal-vanish');
      });
    }

    clearAllSlotPlacements() {
      this.slots = this.slots.map(() => null);
      this.dock.forEach((tile) => {
        tile.used = false;
        tile.slotIndex = null;
      });
    }

    pruneRevealDockTiles() {
      const correctIds = this.getAnswerDockTileIds();
      this.dock.forEach((tile) => {
        if (!correctIds.has(tile.id)) {
          tile.used = true;
          tile.slotIndex = null;
        }
      });
    }

    getAnswerDockTilesInOrder() {
      const syllables = this.puzzle?.answerSyllables || [];
      const correctIds = this.getAnswerDockTileIds();
      const used = new Set();
      const ordered = [];

      syllables.forEach((char) => {
        const tile = this.dock.find((item) => (
          !used.has(item.id)
          && correctIds.has(item.id)
          && item.char === char
        ));
        if (!tile) return;
        used.add(tile.id);
        const el = this.els.dock?.querySelector(`[data-tile-id="${tile.id}"]`);
        if (el) ordered.push({ tile, el, char });
      });

      return ordered;
    }

    createDockLetterGhost(dockEl, char) {
      const rect = dockEl.getBoundingClientRect();
      const front = dockEl.querySelector('.rw-dock-front');
      const frontStyle = front ? getComputedStyle(front) : null;

      const ghost = document.createElement('div');
      ghost.className = 'rw-fly-letter rw-fly-letter--you rw-reveal-letter';
      ghost.textContent = char;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.left = `${rect.left + rect.width / 2}px`;
      ghost.style.top = `${rect.top + rect.height / 2}px`;
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;

      if (frontStyle) {
        ghost.style.fontSize = frontStyle.fontSize;
        ghost.style.background = frontStyle.backgroundColor;
        ghost.style.color = frontStyle.color;
        ghost.style.boxShadow = frontStyle.boxShadow;
        ghost.style.borderRadius = frontStyle.borderRadius;
      }

      document.body.appendChild(ghost);
      return ghost;
    }

    getGhostGroupCenter(ghosts) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      ghosts.forEach((ghost) => {
        const rect = ghost.getBoundingClientRect();
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.right);
        maxY = Math.max(maxY, rect.bottom);
      });

      if (!Number.isFinite(minX)) {
        const dockRect = this.els.dock?.getBoundingClientRect();
        return {
          x: dockRect ? dockRect.left + dockRect.width / 2 : window.innerWidth / 2,
          y: dockRect ? dockRect.top + dockRect.height / 2 : window.innerHeight / 2,
        };
      }

      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    animateRevealLettersToWord(ghosts) {
      if (!ghosts.length) return Promise.resolve();

      const dockRect = this.els.dock?.getBoundingClientRect();
      const sampleRect = ghosts[0].getBoundingClientRect();
      const tileW = sampleRect.width || 64;
      const tileH = sampleRect.height || 64;
      const gap = Math.min(10, tileW * 0.12);
      const count = ghosts.length;
      const totalW = count * tileW + Math.max(0, count - 1) * gap;
      const centerX = dockRect
        ? dockRect.left + dockRect.width / 2
        : sampleRect.left + sampleRect.width / 2;
      const centerY = dockRect
        ? dockRect.top - tileH * 0.42
        : sampleRect.top - tileH * 0.8;

      const animations = ghosts.map((ghost, index) => {
        const targetX = centerX - totalW / 2 + tileW / 2 + index * (tileW + gap);
        const targetY = centerY;
        const rect = ghost.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        const dx = targetX - startX;
        const dy = targetY - startY;

        return ghost.animate([
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`,
            opacity: 1,
          },
        ], {
          duration: REVEAL_FORM_MS,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        });
      });

      return Promise.all(animations.map((anim) => new Promise((resolve) => {
        anim.onfinish = resolve;
        anim.oncancel = resolve;
      })));
    }

    async flyWordFromCenterToTrail(word, fromCenter, targetEl) {
      const trailTrack = this.els.trailTrack;
      if (!trailTrack || !word || !fromCenter) return;

      const trackRect = trailTrack.getBoundingClientRect();
      const toRect = targetEl?.getBoundingClientRect() || {
        left: trackRect.left + trackRect.width / 2 - 24,
        top: trackRect.top + trackRect.height * 0.62,
        width: 48,
        height: 48,
      };

      const ghost = document.createElement('div');
      ghost.className = 'rw-solved-fly rw-solved-fly--you';
      ghost.textContent = word;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.left = `${fromCenter.x}px`;
      ghost.style.top = `${fromCenter.y}px`;
      document.body.appendChild(ghost);

      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;
      const dx = endX - fromCenter.x;
      const dy = endY - fromCenter.y;
      const endScale = targetEl
        ? Math.min(1.15, Math.max(0.45, toRect.height / 48))
        : 0.75;

      const anim = ghost.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${endScale})`,
          opacity: 0.95,
        },
      ], {
        duration: SOLVED_FLY_MS,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      });

      await new Promise((resolve) => {
        anim.onfinish = resolve;
        anim.oncancel = resolve;
        setTimeout(resolve, SOLVED_FLY_MS + 40);
      });
      ghost.remove();
    }

    async animateRevealSkip(solvedWord, nextLinkIndex) {
      this.checking = true;
      this.clearRevealIdleTimer();
      this.hideRevealUi();
      this.oppSlotChars = this.slots.map(() => '');

      if (reduceMotion() || !solvedWord) {
        await this.flyThenTrailAdvance(solvedWord, nextLinkIndex, 'you', {});
        this.checking = false;
        return;
      }

      this.markRevealVanishTargets();
      await this.delay(REVEAL_VANISH_MS);

      this.clearAllSlotPlacements();
      this.pruneRevealDockTiles();
      this.oppSlotChars = this.slots.map(() => '');
      this.renderSlots({ skipEmit: true });
      this.renderDock();

      const answerTiles = this.getAnswerDockTilesInOrder();
      const letterGhosts = answerTiles.map(({ el, char }) => this.createDockLetterGhost(el, char));

      answerTiles.forEach(({ el }) => {
        el.classList.add('rw-reveal-vanish');
      });

      await this.animateRevealLettersToWord(letterGhosts);
      await this.delay(REVEAL_FORM_HOLD_MS);

      const fromCenter = this.getGhostGroupCenter(letterGhosts);
      const { flyTarget, trailDone, nextWords } = this.prepareTrailShift(solvedWord, nextLinkIndex);

      letterGhosts.forEach((ghost) => {
        ghost.animate([
          { opacity: 1 },
          { opacity: 0 },
        ], { duration: 200, easing: 'ease-out', fill: 'forwards' });
      });

      await Promise.all([
        this.flyWordFromCenterToTrail(solvedWord, fromCenter, flyTarget),
        trailDone,
      ]);

      letterGhosts.forEach((ghost) => ghost.remove());
      this.renderTrail(nextWords);
      this.renderDock();
      this.checking = false;
    }

    async onRevealButtonClick() {
      if (!this.showOppPreview || this._revealPressed || this._revealBusy) return;
      if (this.gameOver || this.roundLocked || this.checking || this.isStunned()) return;
      if (!this._revealUiVisible || !this.puzzle) return;

      this._revealPressed = true;
      this._revealBusy = true;
      this.hideRevealUi();

      if (!this.onRevealSkip) {
        this._revealBusy = false;
        return;
      }

      try {
        const result = await this.onRevealSkip({
          linkIndex: this.useThemeRotation ? this.globalLinkIndex : this.puzzle.linkIndex,
          roundId: this.currentRoundId,
        }) || { applied: false };

        if (!result.applied) {
          this._revealPressed = false;
          this.touchRevealActivity();
        } else if (result.matchOver) {
          this.gameOver = true;
          this.setEnabled(false);
        }
      } catch (err) {
        console.warn('[RelatedWords] reveal skip failed', err);
        this._revealPressed = false;
        this.touchRevealActivity();
      } finally {
        this._revealBusy = false;
      }
    }

    syncRwLive() {
      if (!this.onSlotsChange || !this.showOppPreview || !this.puzzle) return;
      this.onSlotsChange({
        linkIndex: this.useThemeRotation ? this.globalLinkIndex : this.puzzle.linkIndex,
        roundId: this.currentRoundId,
        slots: this.slots.map((tile) => (tile?.char || null)),
        wrongCount: this.guessCount,
        stunnedUntil: this.stunnedUntil || 0,
      });
      this.emitLiveHudUpdate();
    }

    emitSlotsChange() {
      this.syncRwLive();
    }

    setRoundContext(ctx = {}) {
      this.currentRoundId = Number(ctx.roundId) || 0;
    }

    setOpponentSlots(live, sharedRoundId) {
      if (!this.showOppPreview) return;
      const roundId = Number(sharedRoundId) || 0;
      const globalLink = this.useThemeRotation
        ? (this.globalLinkIndex ?? -1)
        : (this.puzzle?.linkIndex ?? -1);
      const liveRound = Number(live?.roundId);
      const liveLink = Number(live?.linkIndex);

      if (live && liveRound === roundId) {
        this.setOpponentLiveState({
          wrongCount: live.wrongCount,
          stunnedUntil: live.stunnedUntil,
        });
      }

      const valid = live
        && liveRound === roundId
        && liveLink === globalLink
        && Array.isArray(live.slots);

      if (this._oppRoundWonPending || this._oppFlippedThisRound || this._oppWinAnimating) {
        if (valid) {
          this.setOpponentLiveState({
            wrongCount: live.wrongCount,
            stunnedUntil: live.stunnedUntil,
          });
        }
        return;
      }

      const prevChars = [...this.oppSlotChars];
      let nextChars;
      if (!valid) {
        nextChars = this.slots.map(() => '');
      } else {
        nextChars = live.slots.map((char) => (char ? String(char) : ''));
        while (nextChars.length < this.slots.length) nextChars.push('');
        nextChars = nextChars.slice(0, this.slots.length);
      }

      const prevFilled = prevChars.some((char) => !!char);
      const nextFilled = nextChars.some((char) => !!char);
      const oppFailed = valid && prevFilled && !nextFilled;

      if (oppFailed && !reduceMotion()) {
        this.animateOppFailure(prevChars, () => {
          this.oppSlotChars = nextChars;
          this.renderSlots({ skipEmit: true });
          this.touchRevealActivity();
        });
        return;
      }

      const oppActivity = valid && nextChars.join('|') !== prevChars.join('|');
      this.oppSlotChars = nextChars;
      this.renderSlots({ skipEmit: true });
      if (oppActivity) {
        this.touchRevealActivity();
      }
      if (!reduceMotion()) {
        this.oppSlotChars.forEach((char, index) => {
          if (char && !prevChars[index]) {
            this.animateOppRise(this.els.slots.querySelector(`[data-opp-slot-index="${index}"]`));
          }
        });
      }

      if (this.isOpponentAnswerComplete(nextChars)) {
        this.onOpponentRoundWin();
      }
    }

    isOpponentAnswerComplete(chars) {
      if (!this.showOppPreview || !this.puzzle?.answer || !Array.isArray(chars)) return false;
      if (!chars.length || !chars.every((char) => !!char)) return false;
      return chars.join('') === this.puzzle.answer;
    }

    lockRoundForOpponent() {
      if (this.roundLocked) return;
      this.roundLocked = true;
      this.clearRevealIdleTimer();
      this.hideRevealUi();
      this.els.board?.classList.add('rw-round-locked');
      this.els.dock?.querySelectorAll('button').forEach((btn) => {
        btn.disabled = true;
      });
      this.els.slots?.querySelectorAll('.rw-slot').forEach((btn) => {
        btn.disabled = true;
      });
    }

    unlockRound() {
      this.roundLocked = false;
      this._oppFlippedThisRound = false;
      this._oppWinAnimating = false;
      this._oppRoundWonPending = false;
      this.els.board?.classList.remove('rw-round-locked');
      this.startRevealIdleTimer();
    }

    onOpponentRoundWin() {
      if (!this.showOppPreview || this._oppRoundWonPending || this._oppFlippedThisRound) return;
      this._oppRoundWonPending = true;
      this.lockRoundForOpponent();
      this.checking = false;

      global.SoundEffects?.win?.();
      this.showFeedback(t('relatedWordsRace.oppGotRound'), 'info');
    }

    getPlayerSlotEl(slotIndex) {
      return this.els.slots.querySelector(`[data-slot-index="${slotIndex}"]`);
    }

    flyLetterFromDock(char, fromRect, toRect, sourceEl, onComplete) {
      if (!fromRect || !toRect || reduceMotion()) {
        onComplete?.();
        return;
      }

      const ghost = document.createElement('div');
      ghost.className = 'rw-fly-letter rw-fly-letter--you';
      ghost.textContent = char;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = `${fromRect.width}px`;
      ghost.style.height = `${fromRect.height}px`;

      if (sourceEl) {
        const front = sourceEl.querySelector('[class*="-front"]');
        const style = front ? getComputedStyle(front) : null;
        if (style) {
          ghost.style.background = style.backgroundColor;
          ghost.style.color = style.color;
          ghost.style.boxShadow = style.boxShadow;
          ghost.style.fontSize = style.fontSize;
          ghost.style.borderRadius = style.borderRadius;
        }
      }

      const startX = fromRect.left + fromRect.width / 2;
      const startY = fromRect.top + fromRect.height / 2;
      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;
      const dx = endX - startX;
      const dy = endY - startY;
      const scale = toRect.width / Math.max(fromRect.width, 1);

      ghost.style.left = `${startX}px`;
      ghost.style.top = `${startY}px`;
      document.body.appendChild(ghost);

      const anim = ghost.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`, opacity: 1 },
      ], {
        duration: FLY_MS,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      });

      const finish = () => {
        ghost.remove();
        onComplete?.();
      };
      anim.onfinish = finish;
      anim.oncancel = finish;
    }

    animateOppRise(el) {
      if (!el || reduceMotion()) return;
      el.classList.remove('rw-opp-rise');
      void el.offsetWidth;
      el.classList.add('rw-opp-rise');
      setTimeout(() => el.classList.remove('rw-opp-rise'), FLY_MS);
    }

    animateOppFailure(prevChars, onDone) {
      const panel = this.els.slots.querySelector('.rw-vs-panel--enemy');
      if (!panel) {
        onDone?.();
        return;
      }

      this.oppSlotChars = prevChars.slice();
      while (this.oppSlotChars.length < this.slots.length) this.oppSlotChars.push('');
      this.oppSlotChars = this.oppSlotChars.slice(0, this.slots.length);
      this.renderSlots({ skipEmit: true });

      panel.classList.remove('rw-opp-fail-shake');
      void panel.offsetWidth;
      panel.classList.add('rw-opp-fail-shake');
      panel.querySelectorAll('.rw-opp-slot.filled').forEach((slot) => {
        slot.classList.add('rw-opp-fail-flash');
      });

      setTimeout(() => {
        panel.classList.remove('rw-opp-fail-shake');
        panel.querySelectorAll('.rw-opp-slot').forEach((slot) => {
          slot.classList.remove('rw-opp-fail-flash');
        });
        onDone?.();
      }, 520);
    }

    renderDock() {
      const solo = this.isSoloMode();
      this.els.dock.innerHTML = this.dock.map((tile) => {
        const used = tile.used ? ' rw-dock-tile--used' : '';
        const isDisabled = this.roundLocked || (tile.used && !solo);
        const recallLabel = solo && tile.used
          ? ` aria-label="${escapeHtml(t('relatedWords.recallDockAria', { char: tile.char }))}"`
          : '';
        return `<button type="button" class="rw-dock-tile flip-tile${used}" data-tile-id="${tile.id}"${isDisabled ? ' disabled' : ''}${recallLabel}>
          <span class="rw-dock-face rw-dock-front">${tile.char}</span>
          <span class="rw-dock-face rw-dock-back" aria-hidden="true"></span>
        </button>`;
      }).join('');
    }

    clearSlotsGreenHint(selector = '.rw-slot.flip-tile') {
      this.els.slots.querySelectorAll(selector).forEach((el) => {
        el.classList.remove('rw-slot--correct');
        el.querySelectorAll('.rw-slot-front, .rw-slot-back').forEach((face) => {
          face.classList.remove('correct-hint');
        });
      });
    }

    prepareCorrectFlipFaces(el) {
      const front = el.querySelector('.rw-slot-front, .rw-opp-slot-front');
      if (!front) return;
      el.classList.add('rw-slot--correct');
      front.classList.add('correct-hint');
    }

    markSlotsCorrect() {
      this.els.slots.querySelectorAll('.rw-slot.flip-tile.filled').forEach((el) => {
        this.prepareCorrectFlipFaces(el);
      });
    }

    async flashSlotsGreen(selector, { fast = false } = {}) {
      const filledEls = [...this.els.slots.querySelectorAll(selector)]
        .filter((el) => el.classList.contains('filled'));
      if (!filledEls.length) return;

      const flashMs = reduceMotion() ? 0 : (fast ? GREEN_FLASH_FAST_MS : GREEN_FLASH_MS);
      filledEls.forEach((el) => {
        if (el.classList.contains('rw-slot')) {
          this.prepareCorrectFlipFaces(el);
        } else {
          el.querySelector('[class*="-front"]')?.classList.add('correct-hint');
        }
      });
      if (flashMs) await this.delay(flashMs);
      return filledEls;
    }

    async playScoreFly({ side, points, slotSelector, onPop }) {
      const fly = global.RwScoreFly;
      const targets = this.getScoreFlyTargets?.();
      const key = side === 'opp' || side === 'enemy' ? 'opp' : 'my';
      if (!fly?.play || !targets) {
        if (typeof onPop === 'function') onPop();
        this.onScoreFlyComplete?.({ side: key, points });
        return;
      }

      const target = targets[key];
      if (!target?.num) {
        if (typeof onPop === 'function') onPop();
        this.onScoreFlyComplete?.({ side: key, points });
        return;
      }

      const sourceSlots = [...(this.els.slots?.querySelectorAll(slotSelector) || [])]
        .filter((el) => el.classList.contains('filled'));
      const panelSel = key === 'opp'
        ? '.rw-vs-panel--enemy .rw-vs-panel-slots'
        : '.rw-vs-panel--you .rw-vs-panel-slots';
      const panelSlots = this.els.slots?.querySelector(panelSel);
      const from = fly.getPanelFlyOrigin?.(panelSlots)
        || fly.getElementsCenter(sourceSlots);
      if (!from) {
        if (typeof onPop === 'function') onPop();
        this.onScoreFlyComplete?.({ side: key, points });
        return;
      }

      this.onScoreFlyPrepare?.({ side: key, points });

      await fly.play({
        points,
        from,
        toEl: target.num,
        stackEl: target.stack,
        sourceSlots,
        team: key,
        onPop,
      });

      this.onScoreFlyComplete?.({ side: key, points });
    }

    async flipTilesCorrect(selector, {
      simultaneous = false,
      successClass = '',
      fast = false,
      skipFlash = false,
      preserveLetters = false,
    } = {}) {
      const slotEls = [...this.els.slots.querySelectorAll(selector)];
      const filledEls = slotEls.filter((el) => el.classList.contains('filled'));
      if (!filledEls.length) return;

      const successEl = successClass
        ? this.els.slots.querySelector(successClass)
        : null;
      successEl?.classList.add('rw-opp-success');

      const keepLetters = preserveLetters
        || filledEls.some((el) => el.classList.contains('rw-slot--correct'));
      const stagger = simultaneous || reduceMotion() ? 0 : FLIP_STAGGER;
      const flipMs = reduceMotion() ? 0 : (fast ? FLIP_FAST_MS : FLIP_MS);
      const flashMs = (skipFlash || reduceMotion())
        ? 0
        : (fast ? GREEN_FLASH_FAST_MS : GREEN_FLASH_MS);

      if (!skipFlash && !keepLetters) {
        filledEls.forEach((el) => {
          el.querySelector('[class*="-front"]')?.classList.add('correct-hint');
        });
      }

      if (keepLetters) {
        filledEls.forEach((el) => this.prepareCorrectFlipFaces(el));
      }

      if (flashMs) await this.delay(flashMs);

      if (!keepLetters) {
        filledEls.forEach((el) => {
          const front = el.querySelector('[class*="-front"]');
          if (front) front.textContent = '';
        });
      }

      await Promise.all(filledEls.map((el, index) => new Promise((resolve) => {
        const finishFlip = () => {
          if (flipMs) {
            el.style.transform = 'rotateX(180deg)';
          }
          el.classList.remove('revealing', 'revealing--fast');
          if (!keepLetters) {
            el.classList.remove('filled', 'rw-slot--correct', 'rw-dock-tile--correct');
            el.querySelectorAll('[class*="-front"], [class*="-back"]').forEach((face) => {
              face.classList.remove('correct-hint');
            });
            const front = el.querySelector('[class*="-front"]');
            if (front) front.textContent = '';
          }
          resolve();
        };

        const startFlip = () => {
          el.style.setProperty('--flip-delay', '0ms');
          el.classList.add('revealing');
          if (fast) el.classList.add('revealing--fast');

          if (!flipMs) {
            finishFlip();
            return;
          }

          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            el.removeEventListener('animationend', onAnimEnd);
            finishFlip();
          };
          const onAnimEnd = (ev) => {
            if (ev.target !== el) return;
            done();
          };
          el.addEventListener('animationend', onAnimEnd);
          setTimeout(done, flipMs + 60);
        };

        setTimeout(startFlip, index * stagger);
      })));

      successEl?.classList.remove('rw-opp-success');
    }

    async flipSlotsAway({ skipFlash = false, fast = null, preserveLetters = null } = {}) {
      if (this._activeSlotFlip) return this._activeSlotFlip;

      const run = async () => {
        const useFast = fast ?? (this.raceMode && this.showOppPreview);
        const keepLetters = preserveLetters ?? this.isSoloMode();
        await this.flipTilesCorrect('.rw-slot.flip-tile', {
          simultaneous: useFast,
          fast: useFast,
          skipFlash,
          preserveLetters: keepLetters,
        });
        this.slots = this.slots.map(() => null);
        this.dock.forEach((tile) => {
          tile.used = false;
          tile.slotIndex = null;
        });
        this.renderSlots({ skipEmit: this.showOppPreview });
        this.renderDock();
      };

      this._activeSlotFlip = run().finally(() => {
        this._activeSlotFlip = null;
        this._slotFlipPromise = null;
      });
      this._slotFlipPromise = this._activeSlotFlip;
      return this._activeSlotFlip;
    }

    async flipOppSlotsAway({ skipFlash = false, fast = null } = {}) {
      if (this._oppFlippedThisRound) return;
      const useFast = fast ?? this.raceMode;
      await this.flipTilesCorrect('.rw-opp-slot.flip-tile', {
        simultaneous: true,
        fast: useFast,
        successClass: '.rw-vs-panel--enemy',
        skipFlash,
      });
      this._oppFlippedThisRound = true;
      this.oppSlotChars = this.slots.map(() => '');
      this.renderSlots({ skipEmit: true });
    }

    applyDockTileFace(el, index, nextDockTiles, nextChars) {
      const front = el.querySelector('.rw-dock-front');
      if (front) front.textContent = nextChars[index] || '';
      const back = el.querySelector('.rw-dock-back');
      if (back) back.textContent = '';
      el.classList.remove('rw-dock-tile--used', 'revealing', 'revealing--fast', 'rw-dock-tile--correct');
      el.querySelectorAll('.rw-dock-front, .rw-dock-back').forEach((face) => {
        face.classList.remove('correct-hint');
      });
      el.disabled = false;
      el.style.visibility = 'visible';
      el.style.removeProperty('transform');
      if (nextDockTiles[index]) {
        el.dataset.tileId = nextDockTiles[index].id;
      }
    }

    async flipDockToNewLetters(nextDockTiles, opts = {}) {
      const dockEls = [...this.els.dock.querySelectorAll('.rw-dock-tile.flip-tile')];
      const fast = opts.fast === true;
      const flipMs = reduceMotion() ? 0 : (fast ? FLIP_FAST_MS : FLIP_MS);
      const nextChars = nextDockTiles.map((tile) => tile?.char || '');

      if (!dockEls.length) {
        this.dock = nextDockTiles.map((tile) => ({ ...tile, used: false, slotIndex: null }));
        this.renderDock();
        return;
      }

      dockEls.forEach((el, index) => {
        const back = el.querySelector('.rw-dock-back');
        if (back) back.textContent = nextChars[index] || '';
        el.classList.remove('rw-dock-tile--used', 'revealing', 'revealing--fast', 'rw-dock-tile--correct');
        el.querySelectorAll('.rw-dock-front, .rw-dock-back').forEach((face) => {
          face.classList.remove('correct-hint');
        });
        el.disabled = false;
        el.style.visibility = 'visible';
        el.style.setProperty('--flip-delay', '0ms');
        el.classList.add('revealing');
        if (fast) el.classList.add('revealing--fast');
      });

      if (flipMs) await this.delay(flipMs);

      if (dockEls.length !== nextDockTiles.length) {
        this.dock = nextDockTiles.map((tile) => ({ ...tile, used: false, slotIndex: null }));
        this.renderDock();
        return;
      }

      dockEls.forEach((el, index) => {
        this.applyDockTileFace(el, index, nextDockTiles, nextChars);
      });
    }

    placeFromDock(tileId) {
      if (!this.enabled || this.roundLocked || this.isStunned() || this.awaitingExtraGuess) return;
      const tile = this.dock.find((item) => item.id === tileId && !item.used);
      if (!tile) return;
      const slotIndex = this.slots.findIndex((slot) => slot === null);
      if (slotIndex === -1) return;
      this.touchRevealActivity();

      const dockEl = this.els.dock.querySelector(`[data-tile-id="${tileId}"]`);
      const fromRect = dockEl?.getBoundingClientRect();
      const toRect = this.getPlayerSlotEl(slotIndex)?.getBoundingClientRect();

      this.slots[slotIndex] = tile;
      tile.used = true;
      tile.slotIndex = slotIndex;

      const finishPlace = () => {
        if (this.allSlotsFilled()) {
          this.checkAnswer();
        }
      };

      if (reduceMotion() || !fromRect || !toRect) {
        this._flyingSlotIndex = -1;
        this._flyingTileId = null;
        this.renderSlots();
        this.renderDock();
        global.SoundEffects?.place?.();
        finishPlace();
        return;
      }

      this._flyingSlotIndex = slotIndex;
      this._flyingTileId = tileId;
      this.renderSlots();
      this.renderDock();

      const slotEl = this.getPlayerSlotEl(slotIndex);
      const targetRect = slotEl?.getBoundingClientRect();
      if (!slotEl || !targetRect) {
        this._flyingSlotIndex = -1;
        this._flyingTileId = null;
        this.renderSlots();
        this.renderDock();
        finishPlace();
        return;
      }

      this._activeFlies += 1;

      this.flyLetterFromDock(tile.char, fromRect, targetRect, dockEl, () => {
        this._flyingSlotIndex = -1;
        this._flyingTileId = null;
        this._activeFlies = Math.max(0, this._activeFlies - 1);
        this.renderSlots();
        this.renderDock();
        global.SoundEffects?.place?.();
        finishPlace();
      });
    }

    clearSlot(slotIndex) {
      if (!this.enabled || this.roundLocked || this.isStunned() || this.awaitingExtraGuess) return;
      const tile = this.slots[slotIndex];
      if (!tile) return;
      tile.used = false;
      tile.slotIndex = null;
      this.slots[slotIndex] = null;
      global.SoundEffects?.tap?.();
      this.touchRevealActivity();
      // Instant return to dock — no drop animation.
      this.renderSlots();
      this.renderDock();
    }

    allSlotsFilled() {
      return this.slots.every((slot) => slot !== null);
    }

    getBuiltWord() {
      return this.slots.map((slot) => slot.char).join('');
    }

    async animatePlayerWrongAnswer() {
      this.touchRevealActivity();
      global.SoundEffects?.wrong?.();
      this.guessCount++;
      this.updateLives();
      this.showFeedback(t('relatedWords.wrong'), 'error');

      const youPanel = this.els.slots.querySelector('.rw-vs-panel--you');
      if (!youPanel || reduceMotion()) {
        await this.delay(420);
        return;
      }

      youPanel.classList.remove('rw-vs-wrong-shake');
      void youPanel.offsetWidth;
      youPanel.classList.add('rw-vs-wrong-shake');
      youPanel.querySelectorAll('.rw-slot.filled').forEach((el) => {
        el.classList.add('rw-slot-wrong-flash');
      });
      this.els.dock.classList.remove('rw-dock-wrong-shake');
      void this.els.dock.offsetWidth;
      this.els.dock.classList.add('rw-dock-wrong-shake');

      await this.delay(520);

      youPanel.classList.remove('rw-vs-wrong-shake');
      youPanel.querySelectorAll('.rw-slot').forEach((el) => {
        el.classList.remove('rw-slot-wrong-flash');
      });
      this.els.dock.classList.remove('rw-dock-wrong-shake');
    }

    async checkAnswer() {
      if (this.checking || this.gameOver || !this.enabled || this.roundLocked || this.isStunned() || this.awaitingExtraGuess) return;
      this.checking = true;

      const word = this.getBuiltWord();
      const correct = word === this.puzzle.answer;

      if (correct) {
        await this.handleCorrect();
      } else if (this.showOppPreview) {
        await this.animatePlayerWrongAnswer();

        if (this.guessCount >= MAX_GUESSES) {
          await this.applyStun();
          this.checking = false;
          return;
        }

        this.resetSlots();
        this.showFeedback(t('relatedWords.tryAgain'), 'info');
        this.syncRwLive();
        this.checking = false;
      } else {
        global.SoundEffects?.wrong?.();
        this.guessCount++;
        this.updateLives();
        this.showFeedback(t('relatedWords.wrong'), 'error');
        this.els.slots.classList.add('shake');
        this.els.dock.classList.add('shake');
        await this.delay(500);
        this.els.slots.classList.remove('shake');
        this.els.dock.classList.remove('shake');

        if (this.guessCount >= MAX_GUESSES) {
          if (this.raceMode) {
            this.guessCount = 0;
            this.updateLives();
            this.resetSlots();
            this.showFeedback(t('relatedWords.tryAgain'), 'info');
            this.checking = false;
            return;
          }
          await this.delay(200);
          await this.showExtraGuessPrompt();
        } else {
          this.resetSlots();
          this.showFeedback(t('relatedWords.tryAgain'), 'info');
        }
        this.checking = false;
      }
    }

    async handleCorrect() {
      this.clearRevealIdleTimer();
      this.hideRevealUi();
      this.won = true;
      const nextLinkIndex = this.puzzle.linkIndex + 1;
      const sharedRace = this.raceMode && this.sharedRace;

      global.SoundEffects?.win?.();

      if (sharedRace && this.onRoundWin) {
        const points = global.RelatedWordsChains?.relatedWordsRoundPoints?.(this.puzzle.answer) ?? 1;
        await this.flashSlotsGreen('.rw-slot.flip-tile', { fast: this.raceMode });
        this.showFeedback(t('relatedWords.correct'), 'success');
        this.onScoreFlyPrepare?.({ side: 'my', points });

        let roundResult = { applied: false };
        try {
          roundResult = await this.onRoundWin({
            linkIndex: this.puzzle.linkIndex,
            answer: this.puzzle.answer,
            elapsedMs: this.getRaceElapsedMs(),
          }) || { applied: false };
        } catch (err) {
          console.warn('[RelatedWords] round submit failed', err);
        }

        if (!roundResult.applied) {
          this.won = false;
          this.clearSlotsGreenHint();
          this.showFeedback(t('relatedWords.raceSaveFailed'), 'error');
          this.onScoreFlyComplete?.({ side: 'my', points });
          this.checking = false;
          return;
        }

        let slotFlipPromise = null;
        await this.playScoreFly({
          side: 'my',
          points,
          slotSelector: '.rw-slot.flip-tile',
          onPop: () => {
            slotFlipPromise = this.flipSlotsAway({ skipFlash: true, fast: false });
          },
        });
        if (slotFlipPromise) await slotFlipPromise;

        this.spawnConfetti();
        if (typeof roundResult.myScore === 'number') {
          this.wordsSolved = roundResult.myScore;
          this.renderChainMeta();
        }

        if (roundResult.matchOver) {
          this.gameOver = true;
          this.checkedComplete = true;
        }
        this.checking = false;
        this.flushPendingRoundSync();
        return;
      }

      if (this.raceMode) {
        await this.flashSlotsGreen('.rw-slot.flip-tile', { fast: this.raceMode });
        this.showFeedback(t('relatedWords.correct'), 'success');
        const points = global.RelatedWordsChains?.relatedWordsRoundPoints?.(this.puzzle.answer) ?? 1;
        let slotFlipPromise = null;
        await this.playScoreFly({
          side: 'my',
          points,
          slotSelector: '.rw-slot.flip-tile',
          onPop: () => {
            slotFlipPromise = this.flipSlotsAway({ skipFlash: true, fast: false });
          },
        });
        if (slotFlipPromise) await slotFlipPromise;
        this.spawnConfetti();

        this.wordsSolved += points;
        const elapsedMs = this.getRaceElapsedMs();
        if (this.onProgress) {
          await this.onProgress({ guessCount: this.wordsSolved, elapsedMs });
        }

        if (this.wordsSolved >= this.raceTarget) {
          this.gameOver = true;
          this.checkedComplete = true;
          if (this.onFinished) {
            await this.onFinished({ won: true, guessCount: this.wordsSolved, elapsedMs });
          }
          this.checking = false;
          return;
        }

        await this.loadLink(this.puzzle.chainId, nextLinkIndex, {
          useTileFlipTransition: true,
          skipTrail: true,
          skipSlotFlip: true,
        });
        this.checking = false;
        return;
      }

      this.markSlotsCorrect();
      this.els.feedback.classList.add('hidden');
      this.spawnConfetti();

      if (this.isSoloMode()) {
        this.recordSoloStreakWin();
      }
      this.updateSoloStreakDisplay();

      this.gameOver = true;

      await this.delay(reduceMotion() ? 200 : 360);

      const advance = this.commitWinProgress();
      this.awardWinXp();
      if (advance.chainDone) {
        try {
          const questResult = global.QuestService?.recordActivity?.('relatedWordsChain') || {};
          if (questResult.rewards?.length) {
            global.QuestUI?.showQuestCompleteToast?.(questResult.rewards);
          }
          if (questResult.wheelAvailable) {
            setTimeout(() => global.WheelUI?.tryShow?.(), questResult.rewards?.length ? 1200 : 400);
          }
        } catch (err) {
          console.warn('[Jamodeul] Chain quest progress failed.', err);
        }

        const chain = RW().pickChain(loadProgress());
        this.progress = saveProgress({
          chainId: chain.id,
          linkIndex: 0,
          solvedInChain: [],
        });
        await this.loadLink(chain.id, 0, { useTileFlipTransition: true });
      } else {
        await this.loadLink(advance.chainId, advance.linkIndex, {
          useTileFlipTransition: true,
        });
      }

      this.checking = false;
    }

    commitWinProgress() {
      const solved = [...(this.progress.solvedInChain || []), this.puzzle.answer];
      const nextLinkIndex = this.puzzle.linkIndex + 1;
      const chainDone = nextLinkIndex >= this.puzzle.linkCount;

      let completedChainIds = [...(this.progress.completedChainIds || [])];
      let cycles = this.progress.cycles || 0;

      if (chainDone) {
        if (!completedChainIds.includes(this.puzzle.chainId)) {
          completedChainIds.push(this.puzzle.chainId);
        }
        if (completedChainIds.length >= RW().getAllChains().length) {
          completedChainIds = [];
          cycles += 1;
        }
      }

      this.progress = saveProgress({
        linkIndex: chainDone ? 0 : nextLinkIndex,
        solvedInChain: chainDone ? [] : solved,
        completedChainIds,
        cycles,
        chainId: this.puzzle.chainId,
      });

      global.LearningStreak?.recordActivity?.('related-words');

      return {
        chainDone,
        chainId: this.puzzle.chainId,
        linkIndex: nextLinkIndex,
      };
    }

    awardWinXp() {
      if (!global.XpService?.awardAndCelebrate) return;
      global.XpService.awardAndCelebrate({
        mode: 'relatedWords',
        wordId: `${this.puzzle.chainId}:${this.puzzle.linkIndex}`,
        usedHint: false,
        won: true,
      });
    }

    resetSlots() {
      this.dock.forEach((tile) => {
        tile.used = false;
        tile.slotIndex = null;
      });
      this.slots = this.puzzle.answerSyllables.map(() => null);
      this.renderSlots();
      this.renderDock();
    }

    showFeedback(message, type) {
      this.els.feedback.textContent = message;
      this.els.feedback.className = `rw-feedback ${type}`;
      this.els.feedback.classList.remove('hidden');
    }

    showLoss() {
      this.hideExtraGuessPrompt();
      global.SoundEffects?.lose?.();
      this.els.overlayEmoji.textContent = '💭';
      this.els.overlayTitle.textContent = t('relatedWords.lossTitle');
      this.els.overlayAnswer.textContent = this.puzzle.answer;
      this.els.overlaySub.textContent = t('relatedWords.lossSub', { clue: this.puzzle.clue });
      this.els.overlayBtn.textContent = t('relatedWords.retry');
      this.els.overlayBtn.dataset.action = 'retry';
      this.els.overlay.classList.remove('hidden');
    }

    onOverlayContinue() {
      const action = this.els.overlayBtn.dataset.action;
      this.els.overlay.classList.add('hidden');
      if (action === 'retry') {
        this.startNewChainForRetry();
      }
    }

    spawnConfetti() {
      if (reduceMotion()) return;
      const colors = ['#8FE8B0', '#FFE566', '#A8D4F5', '#CFC0F5', '#FFB8D0', '#98DDB8'];
      const origin = this.els.slots.getBoundingClientRect();
      const count = 28;
      for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'rw-confetti-piece';
        piece.style.left = `${origin.left + origin.width * (0.2 + Math.random() * 0.6)}px`;
        piece.style.top = `${origin.top + origin.height * 0.4}px`;
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.setProperty('--rw-dx', `${(Math.random() - 0.5) * 120}px`);
        piece.style.setProperty('--rw-rot', `${Math.random() * 720 - 360}deg`);
        piece.style.animationDuration = `${0.9 + Math.random() * 0.7}s`;
        piece.style.animationDelay = `${Math.random() * 0.15}s`;
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 1800);
      }
    }

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    getRaceElapsedMs() {
      if (!this.raceStartTime) this.raceStartTime = Date.now();
      return Math.max(0, Date.now() - this.raceStartTime);
    }

    setRaceScore(score) {
      if (!this.raceMode) return;
      this.wordsSolved = Math.max(0, Number(score) || 0);
      this.renderChainMeta();
    }

    flushPendingRoundSync() {
      const pending = this._pendingRoundSync;
      if (!pending) return;
      this._pendingRoundSync = null;
      this.syncToLink(pending.nextIndex, pending.opts);
    }

    syncToLink(linkIndex, opts = {}) {
      if (!this.raceMode || !this.fixedChainId) return;
      const nextIndex = Math.max(0, Number(linkIndex) || 0);

      if (this.checking) {
        this._pendingRoundSync = { nextIndex, opts: { ...opts } };
        return;
      }

      this.setSharedWordsDone(nextIndex);

      if (this.isRaceObjectiveComplete(nextIndex)) {
        this.checking = false;
        if (this.sharedRace) {
          this.gameOver = true;
          this.checkedComplete = true;
          this.enabled = false;
        }
        return;
      }

      const currentIndex = this.puzzle?.linkIndex ?? -1;
      if (currentIndex === nextIndex && !opts.force) {
        this.onRoundAdvanceLivesReset().catch(() => {});
        this.checking = false;
        this.gameOver = false;
        this.unlockRound();
        if (!this.isStunned()) this.enabled = true;
        this.updateLives();
        this.resetSlots();
        this.els.feedback.classList.add('hidden');
        return;
      }

      const run = async () => {
        if (opts.opponentWon) {
          this.lockRoundForOpponent();
          if (!this._oppFlippedThisRound) {
            this.showFeedback(t('relatedWordsRace.oppGotRound'), 'info');
            await this.delay(reduceMotion() ? 60 : 120);
          }
        }

        await this.advanceToNextLink(this.fixedChainId, nextIndex, {
          opponentWon: opts.opponentWon === true,
          skipTrail: opts.skipTrail === true,
          skipped: opts.skipped === true,
          skipScoreFly: opts.skipScoreFly === true,
        });
      };

      run().catch(() => {
        this.applyLinkState(this.fixedChainId, nextIndex);
      });
    }

    setEnabled(enabled) {
      this.enabled = enabled !== false;
      if (!this.enabled) {
        this.gameOver = true;
        this.showFeedback(t('relatedWordsRace.oppFinishedFirst'), 'info');
      }
    }

    destroy() {
      this.gameOver = true;
      this.enabled = false;
      if (this._stunTimer) {
        clearTimeout(this._stunTimer);
        this._stunTimer = null;
      }
      if (this._oppStunTimer) {
        clearTimeout(this._oppStunTimer);
        this._oppStunTimer = null;
      }
      this.clearRevealIdleTimer();
      this.stopExtraGuessTimer();
      this.stopStunCountdownTick();
    }
  }

  global.RelatedWordsGame = RelatedWordsGame;
})(typeof window !== 'undefined' ? window : globalThis);
