/**
 * Interactive first-login tutorial — full Korean Match replica with guided steps.
 */
(function (global) {
  'use strict';

  const t = (key, vars) => global.I18n?.t(key, vars) ?? key;
  const TP = () => global.TutorialProgress;
  const Prog = () => global.TutorialProgram;

  class MatchTutorialApp {
    constructor() {
      this.game = null;
      this.coach = new global.TutorialCoachUI();
      this.stepIndex = 0;
      this.step = null;
      this.placementIndex = 0;
      this.rotateDone = false;
      this.mergePlaced = false;
      this.afterRotatePlaced = false;
      this.mergePlacementDone = false;
      this.solveReady = false;
      this._celebrating = false;
    }

    mount() {
      this.coach.mount();
      const params = new URLSearchParams(location.search);
      const start = params.get('start') === '1';
      const replay = params.get('replay') === '1';

      if (replay && global.DevBuild?.hasDevAccess?.()) {
        TP()?.resetProgress?.();
      }

      this.initGame();
      const startIndex = (replay || start) ? 0 : (TP()?.getCurrentStepIndex?.() ?? 0);
      this.loadStep(startIndex);

      global.I18n?.onChange?.(() => {
        if (this.step) this.updateLessonBar(this.step);
        this.refreshCoach();
      });
    }

    initGame() {
      const root = document.getElementById('match-app');
      if (!root) return;

      global.__koreanMatchGameInstance?.destroy?.();

      this.game = new global.KoreanMatchGame(root, {
        tutorialMode: true,
        wordLength: 1,
        tutorialValidator: (action, payload) => this.validateAction(action, payload),
        onTutorialEvent: (event, data) => this.onGameEvent(event, data),
      });
      global.__koreanMatchGameInstance = this.game;
      this.game.mount();

      const title = root.querySelector('.title-block h1');
      const subtitle = root.querySelector('.title-block p');
      if (title) {
        title.textContent = t('tutorial.title');
        title.dataset.i18n = 'tutorial.title';
      }
      if (subtitle) {
        subtitle.textContent = t('tutorial.subtitle');
        subtitle.dataset.i18n = 'tutorial.subtitle';
        subtitle.style.display = '';
      }

      this.game.els.continue?.addEventListener('click', (e) => {
        e.preventDefault();
        this.onResultsContinue();
      });
    }

    updateLessonBar(step) {
      const total = Prog()?.TOTAL_STEPS ?? 6;
      const progress = document.getElementById('tutorial-lesson-progress');
      const title = document.getElementById('tutorial-lesson-title');
      const body = document.getElementById('tutorial-lesson-body');
      if (progress) {
        progress.textContent = t('tutorial.progress', { current: this.stepIndex + 1, total });
      }
      if (title) {
        title.textContent = t(step.titleKey);
        title.dataset.i18n = step.titleKey;
      }
      if (body) {
        const bodyKey = this.solveReady ? 'tutorial.checkPrompt' : step.bodyKey;
        body.textContent = t(bodyKey);
        body.dataset.i18n = bodyKey;
      }
    }

    loadStep(index) {
      const step = Prog()?.getStep?.(index);
      if (!step) {
        this.finishTutorial();
        return;
      }

      this._celebrating = false;
      this.stepIndex = index;
      this.step = step;
      this.placementIndex = 0;
      this.rotateDone = false;
      this.mergePlaced = false;
      this.afterRotatePlaced = false;
      this.mergePlacementDone = false;
      this.solveReady = false;
      this.clearTutorialFocus();
      this.coach.stopFinger();
      this.game.els.results?.classList.add('hidden');

      const params = new URLSearchParams(location.search);
      params.set('step', String(index));
      history.replaceState(null, '', `${location.pathname}?${params.toString()}`);

      this.updateLessonBar(step);
      this.game.loadTutorialStep(step);
    }

    setTutorialFocus(elements, { checkMode = false } = {}) {
      const root = this.game?.root;
      if (!root) return;

      const allGuideTargets = [
        '.drop-zone',
        '.jamo-bank .jamo-tile',
        '.rotation-dock',
        '.merge-slot',
        '.merge-result',
        '.vowel-merge-dock',
        '.game-feedback',
        '.title-block',
      ];
      root.querySelectorAll(allGuideTargets.join(', ')).forEach((el) => {
        el.classList.remove('tutorial-dimmed', 'tutorial-focus');
      });

      root.classList.add('tutorial-guiding');
      root.classList.toggle('tutorial-check-ready', !!checkMode);

      const dimSel = checkMode
        ? [
          '.rotation-dock',
          '.vowel-merge-dock',
          '.game-feedback',
          '.title-block',
        ]
        : [
          '.drop-zone',
          '.jamo-bank .jamo-tile',
          '.rotation-dock',
          '.merge-slot',
          '.merge-result',
          '.vowel-merge-dock',
        ];
      root.querySelectorAll(dimSel.join(', ')).forEach((el) => {
        if (el.classList.contains('drop-zone') && el.classList.contains('locked')) return;
        if (el.classList.contains('jamo-tile') && el.classList.contains('locked')) return;
        el.classList.add('tutorial-dimmed');
      });
      (elements || []).filter(Boolean).forEach((el) => {
        const mergeParent = el.closest?.('.merge-result, .merge-slot');
        const inMergeSlot = el.classList?.contains('jamo-tile') && mergeParent;
        if (!inMergeSlot) {
          el.classList.remove('tutorial-dimmed');
          el.classList.add('tutorial-focus');
        }
        if (mergeParent) {
          mergeParent.classList.remove('tutorial-dimmed');
          mergeParent.classList.add('tutorial-focus');
        }
      });
    }

    clearTutorialFocus() {
      const root = this.game?.root;
      if (!root) return;
      root.classList.remove('tutorial-guiding', 'tutorial-check-ready');
      root.querySelectorAll('.tutorial-dimmed, .tutorial-focus').forEach((el) => {
        el.classList.remove('tutorial-dimmed', 'tutorial-focus');
      });
    }

    onGameEvent(event, data) {
      if (event === 'stepReady') {
        requestAnimationFrame(() => this.refreshCoach());
        return;
      }
      if (event === 'place') this.onPlaced();
      else if (event === 'rotate') this.onRotated(data);
      else if (event === 'merge') this.onMerged();
      else if (event === 'wordComplete') this.onWordSolved();

      if (['place', 'rotate', 'merge', 'mergeSlot', 'change'].includes(event)) {
        const wasSolveReady = this.solveReady;
        this.updateSolveReady();
        if (!this._celebrating && wasSolveReady === this.solveReady
            && (event === 'mergeSlot' || event === 'change')) {
          this.refreshCoach();
        }
      }
    }

    isBoardCorrectlySolved() {
      const game = this.game;
      if (!game?.blocks?.length) return false;
      return game.blocks.every((block) =>
        block.getAllZones().every((zone) => game.isZoneCorrect(zone))
      );
    }

    isStepReadyForCheck() {
      const step = this.step;
      if (!step) return false;
      if (step.type === 'free-solve') return true;
      if (step.type === 'guided-place') {
        return this.placementIndex >= (step.placements?.length || 0);
      }
      if (step.type === 'guided-rotate') {
        if (step.placements) {
          return this.placementIndex >= step.placements.length;
        }
        if (step.afterRotatePlacement) {
          return this.afterRotatePlaced;
        }
      }
      if (step.type === 'guided-merge') {
        return this.mergePlacementDone;
      }
      return false;
    }

    updateSolveReady() {
      if (this._celebrating || !this.step) return false;
      const ready = this.isStepReadyForCheck() && this.isBoardCorrectlySolved();
      const game = this.game;
      if (ready && !this.solveReady) {
        this.solveReady = true;
        if (game) {
          game.tutorialCheckAllowed = true;
          game.updateCheckButton();
        }
        this.updateLessonBar(this.step);
        this.refreshCoach();
        return true;
      }
      if (!ready && this.solveReady) {
        this.solveReady = false;
        if (game) {
          game.tutorialCheckAllowed = false;
          game.updateCheckButton();
        }
        this.updateLessonBar(this.step);
        this.refreshCoach();
      }
      return ready;
    }

    validateAction(action, payload) {
      const step = this.step;
      if (!step || step.type === 'free-solve') return true;

      if (step.type === 'guided-place') {
        if (action !== 'place') return true;
        const expected = step.placements?.[this.placementIndex];
        if (!expected) return false;
        const ok = payload.tile.char === expected.char
          && payload.zone.zoneType === expected.zoneType
          && (payload.zone.syllableIndex ?? 0) === (expected.syllableIndex ?? 0);
        if (!ok) this.game.feedback?.show('info', t('tutorial.tryAgain'));
        return ok;
      }

      if (step.type === 'guided-rotate') {
        if (action === 'place') {
          if (step.rotateTarget && !this.rotateDone) {
            this.game.feedback?.show('info', t('tutorial.rotateFirst'));
            return false;
          }
          if (step.placements) {
            const expected = step.placements[this.placementIndex];
            if (!expected) return true;
            const ok = payload.tile.char === expected.char
              && payload.zone.zoneType === expected.zoneType;
            if (!ok) this.game.feedback?.show('info', t('tutorial.tryAgain'));
            return ok;
          }
          if (step.afterRotatePlacement) {
            const exp = step.afterRotatePlacement;
            const ok = payload.tile.char === exp.char && payload.zone.zoneType === exp.zoneType;
            if (!ok) this.game.feedback?.show('info', t('tutorial.tryAgain'));
            return ok;
          }
        }
        return true;
      }

      if (step.type === 'guided-merge') {
        if (action === 'merge') {
          const slots = this.game.mergeDock?.slotTileIds;
          const bothFilled = slots?.[0] && slots?.[1];
          if (!bothFilled) {
            this.game.feedback?.show('info', t('tutorial.mergeFirst'));
            return false;
          }
          return true;
        }
        if (action === 'place' && this.mergePlaced) {
          const exp = step.afterMergePlacement;
          const allowed = exp.allowResults || [exp.char];
          const ok = allowed.includes(payload.tile.char)
            && payload.zone.zoneType === exp.zoneType;
          if (!ok) this.game.feedback?.show('info', t('tutorial.tryAgain'));
          return ok;
        }
      }

      return true;
    }

    onPlaced() {
      const step = this.step;
      if (!step) return;

      if (step.type === 'guided-place') {
        this.placementIndex++;
        if (this.placementIndex >= (step.placements?.length || 0)) {
          return;
        }
        this.refreshCoach();
        return;
      }

      if (step.type === 'guided-rotate' && step.placements) {
        this.placementIndex++;
        if (this.placementIndex >= step.placements.length) {
          return;
        }
        this.refreshCoach();
        return;
      }

      if (step.type === 'guided-rotate' && step.afterRotatePlacement && this.rotateDone) {
        this.afterRotatePlaced = true;
        return;
      }

      if (step.type === 'guided-merge' && this.mergePlaced) {
        this.mergePlacementDone = true;
        return;
      }
    }

    onRotated(data) {
      const step = this.step;
      if (!step?.rotateTarget) return;
      if (data.next === step.rotateTarget.to) {
        this.rotateDone = true;
        this.game.feedback?.show('success', t('tutorial.rotateSuccess'));
        this.refreshCoach();
      }
    }

    onMerged() {
      if (this.step?.type !== 'guided-merge') return;
      this.mergePlaced = true;
      this.game.feedback?.show('success', t('tutorial.mergeSuccess'));
      this.refreshCoach();
    }

    onWordSolved() {
      if (!this.step) return;
      this.completeCurrentStep(this.step.type === 'free-solve');
    }

    async completeCurrentStep(isFinal) {
      if (this._celebrating) return;
      this._celebrating = true;
      this.coach.stopFinger();
      this.clearTutorialFocus();

      const step = this.step;
      if (!step) return;

      TP()?.completeStep?.(step.id);

      const xpResult = global.XpService?.awardAndCelebrate?.({
        mode: 'tutorial',
        wordId: step.id,
        usedHint: false,
      });

      if (step.type === 'free-solve') {
        this.game.checkedComplete = true;
        this.game.stopTimer();
        if (!global.UserPreferences?.get?.()?.reduceMotion) {
          this.game.spawnConfetti();
        }
        if (this.game.currentWord?.word) {
          await this.game.revealHintWord(this.game.currentWord.word);
        }
      } else {
        await this.game.celebrateTutorialSuccess();
      }

      await delay(TUTORIAL_RESULT_DELAY_MS);

      const total = Prog()?.TOTAL_STEPS ?? 6;
      const isLast = this.stepIndex >= total - 1 || isFinal;
      this.showTutorialResults(isLast, xpResult);
    }

    showTutorialResults(isLast, xpResult) {
      const game = this.game;
      const title = document.getElementById('results-title');
      if (title) {
        title.textContent = t(isLast ? 'tutorial.allDone' : 'tutorial.stepDone');
        title.dataset.i18n = isLast ? 'tutorial.allDone' : 'tutorial.stepDone';
      }
      game.els.resultsWord.textContent = game.currentWord?.word || '';
      if (game.els.resultsTime) game.els.resultsTime.textContent = formatTutorialTime(game.getElapsedMs?.() || 0);
      if (game.els.resultsGuesses) game.els.resultsGuesses.textContent = '1';
      if (game.els.resultsStreak) game.els.resultsStreak.textContent = '';
      if (game.els.resultsBest) {
        game.els.resultsBest.textContent = xpResult?.xpEarned
          ? t('tutorial.xpEarned', { n: xpResult.xpEarned })
          : '';
        game.els.resultsBest.dataset.i18n = xpResult?.xpEarned ? 'tutorial.xpEarned' : '';
      }
      if (game.els.resultsDict) game.els.resultsDict.innerHTML = '';
      if (game.els.continue) {
        game.els.continue.textContent = t(isLast ? 'tutorial.finish' : 'tutorial.next');
        game.els.continue.dataset.i18n = isLast ? 'tutorial.finish' : 'tutorial.next';
      }
      game.els.results?.classList.remove('hidden');
      global.I18n?.applyToDocument?.(game.els.results);
    }

    onResultsContinue() {
      this.game.els.results?.classList.add('hidden');
      this._celebrating = false;
      const total = Prog()?.TOTAL_STEPS ?? 6;
      if (this.stepIndex >= total - 1) {
        this.finishTutorial();
      } else {
        this.loadStep(this.stepIndex + 1);
      }
    }

    finishTutorial() {
      TP()?.markOnboardingComplete?.();
      this.coach.destroy();
      window.removeEventListener('beforeunload', this._guardLeave);
      location.href = 'index.html';
    }

    findBankTile(char, zoneType) {
      return Object.values(this.game.tileMap).find(
        (tl) => tl.inBank && tl.char === char && (!zoneType || tl.zoneType === zoneType)
      );
    }

    refreshCoach() {
      const step = this.step;
      const game = this.game;
      if (!step || !game || this._celebrating) return;

      game.clearSelectionHighlights?.();
      this.coach.stopFinger();
      game.els.check?.classList.remove('tap-target');
      game.mergeDock?.slotEls?.forEach((el) => el.classList.remove('tap-target'));
      game.mergeDock?.resultEl?.classList.remove('tap-target');

      if (this.solveReady) {
        const checkBtn = game.els.check;
        const dock = game.els.bank;
        checkBtn?.classList.remove('hidden');
        checkBtn?.classList.add('tap-target');
        this.setTutorialFocus([checkBtn], { checkMode: true });
        if (checkBtn && dock) {
          this.coach.pointFinger(dock, checkBtn);
        }
        return;
      }

      if (step.type === 'free-solve') {
        this.clearTutorialFocus();
        game.els.check?.classList.remove('hidden');
        if (game.els.check) game.els.check.disabled = true;
        return;
      }

      if (step.type === 'guided-place') {
        const expected = step.placements?.[this.placementIndex];
        if (!expected) return;
        const tile = this.findBankTile(expected.char, expected.zoneType);
        const zone = game.findZone(expected.zoneType, expected.syllableIndex ?? 0);
        if (tile?.el) tile.el.classList.add('selected');
        if (zone?.el) zone.el.classList.add('tap-target');
        this.setTutorialFocus([tile?.el, zone?.el]);
        if (tile?.el && zone?.el) this.coach.pointFinger(tile.el, zone.el);
        return;
      }

      if (step.type === 'guided-rotate') {
        if (step.rotateTarget && !this.rotateDone) {
          const tile = this.findBankTile(step.rotateTarget.from);
          if (tile?.el) tile.el.classList.add('selected');
          game.els.rotationDock?.classList.add('tap-target');
          this.setTutorialFocus([tile?.el, game.els.rotationDock]);
          if (tile?.el && game.els.rotationDock) {
            this.coach.pointFinger(tile.el, game.els.rotationDock);
          }
          return;
        }

        if (step.afterRotatePlacement) {
          const exp = step.afterRotatePlacement;
          const tile = this.findBankTile(exp.char, exp.zoneType);
          const zone = game.findZone(exp.zoneType, exp.syllableIndex ?? 0);
          if (zone?.el) zone.el.classList.add('tap-target');
          this.setTutorialFocus([tile?.el, zone?.el]);
          if (tile?.el && zone?.el) this.coach.pointFinger(tile.el, zone.el);
          return;
        }

        if (step.placements) {
          const expected = step.placements[this.placementIndex];
          if (!expected) return;
          const tile = this.findBankTile(expected.char, expected.zoneType);
          const zone = game.findZone(expected.zoneType, expected.syllableIndex ?? 0);
          this.setTutorialFocus([tile?.el, zone?.el]);
          if (tile?.el && zone?.el) this.coach.pointFinger(tile.el, zone.el);
        }
        return;
      }

      if (step.type === 'guided-merge') {
        if (!this.mergePlaced) {
          const both = game.mergeDock?.slotTileIds?.[0] && game.mergeDock?.slotTileIds?.[1];
          if (both && game.els.rotationDock) {
            const resultEl = game.mergeDock?.resultEl;
            game.els.rotationDock.classList.add('tap-target');
            if (resultEl) resultEl.classList.add('tap-target');
            this.setTutorialFocus([
              game.mergeDock.slotEls[0],
              game.mergeDock.slotEls[1],
              resultEl,
              game.els.rotationDock,
              game.els.mergeDockEl,
            ]);
            this.coach.pointFinger(game.mergeDock.slotEls[1], game.els.rotationDock);
            return;
          }
          const emptyIdx = game.mergeDock?.slotTileIds?.[0] ? 1 : 0;
          const slot = game.mergeDock?.slotEls?.[emptyIdx];
          const nextChar = emptyIdx === 0 ? 'ㅏ' : 'ㅣ';
          const tile = this.findBankTile(nextChar, 'jungV');
          if (slot) slot.classList.add('tap-target');
          if (tile?.el) tile.el.classList.add('selected');
          this.setTutorialFocus([tile?.el, slot, game.els.mergeDockEl]);
          if (tile?.el && slot) this.coach.pointFinger(tile.el, slot);
          return;
        }

        const exp = step.afterMergePlacement;
        const result = game.mergeDock?.getResultTile?.();
        const resultEl = game.mergeDock?.resultEl;
        const zone = game.findZone(exp.zoneType, exp.syllableIndex ?? 0);
        if (result) {
          game.selectedTile = result;
          result.setSelected?.(true);
          game.updateSelectionHighlights?.();
        }
        if (resultEl) resultEl.classList.add('tap-target');
        if (zone?.el) zone.el.classList.add('tap-target');
        this.setTutorialFocus([resultEl, zone?.el]);
        if (result?.el && zone?.el) this.coach.pointFinger(result.el, zone.el);
      }
    }
  }

  const TUTORIAL_RESULT_DELAY_MS = 2000;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatTutorialTime(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  global.MatchTutorialApp = MatchTutorialApp;
})(typeof window !== 'undefined' ? window : globalThis);
