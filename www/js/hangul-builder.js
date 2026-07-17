/**
 * Hangul Builder — beginner word-building game.
 * Shows the Korean word upfront; player rebuilds it with jamo tiles.
 */
(function (global) {
  'use strict';

  const HC = global.HangulCompose;
  const LW = global.LearningWords;
  const LS = global.LearningStreak;
  const PROGRESS_KEY = 'jamodeul-builder-progress';

  const t = (key, vars) => global.I18n?.t(key, vars) ?? '';
  const prefs = () => global.UserPreferences;

  function zoneLabel(zoneType) {
    const map = {
      cho: 'builder.slotInitial',
      jungH: 'builder.slotVowel',
      jungV: 'builder.slotVowel',
      jong: 'builder.slotFinal',
    };
    return t(map[zoneType] || 'builder.slotVowel');
  }

  function zoneTileClass(zoneType) {
    if (zoneType === 'cho') return 'cho';
    if (zoneType === 'jong') return 'jong';
    return 'jung';
  }

  function formatSyllableBreakdown(word) {
    return HC.decomposeWordForMatch(word).map((syl) => {
      const parts = [syl.cho, syl.jung, syl.jong].filter(Boolean).join(' + ');
      return `${syl.syllable} = ${parts}`;
    }).join(' · ');
  }

  function loadProgress() {
    const data = global.AppStorage ? global.AppStorage.get(PROGRESS_KEY, {}) : {};
    return { wordIndex: Math.max(0, parseInt(data.wordIndex, 10) || 0) };
  }

  function saveProgress(wordIndex) {
    if (global.AppStorage) {
      global.AppStorage.set(PROGRESS_KEY, { wordIndex });
    } else {
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify({ wordIndex }));
      } catch {}
    }
  }

  class HangulBuilderGame {
    constructor(rootEl) {
      this.root = rootEl;
      this.words = LW?.getBuilderWordList?.() || [];
      this.wordIndex = loadProgress().wordIndex;
      if (this.wordIndex >= this.words.length) this.wordIndex = 0;

      this.slotMap = {};
      this.tileMap = {};
      this.syllablePreviews = {};
      this.selectedTileId = null;
      this.wordComplete = false;

      this.drag = {
        active: false,
        sourceType: null,
        sourceId: null,
        sourceEl: null,
        ghost: null,
        pointerId: null,
      };

      HangulBuilderGame.instance = this;
    }

    mount() {
      if (!HC) {
        console.error('[Jamodeul] HangulCompose unavailable — Hangul Builder cannot start');
        this.root.innerHTML = '<p style="padding:24px;text-align:center">Unable to load Hangul Builder. Please refresh the page.</p>';
        return;
      }

      this.root.innerHTML = `
        <header class="header">
          <a class="back-link" href="index.html" data-i18n="builder.back">${t('builder.back')}</a>
          <div class="title-block">
            <h1 data-i18n="builder.title">${t('builder.title')}</h1>
            <p><span data-i18n="builder.subtitle">${t('builder.subtitle')}</span>${prefs()?.shouldShowKoreanSupport?.() !== false ? ` · <span data-i18n="builder.subtitleKo">${t('builder.subtitleKo')}</span>` : ''}</p>
          </div>
          <div class="level-badge" id="builder-level">1 / 1</div>
        </header>

        <div class="learning-streak-bar" id="builder-streak-bar">
          <div class="streak-headline" id="builder-streak-headline"></div>
          <div class="streak-progress" id="builder-streak-progress"></div>
        </div>

        <div class="progress-dots" id="builder-dots"></div>

        <section class="clue-card" id="builder-clue">
          <span class="clue-emoji" id="builder-emoji"></span>
          <p class="clue-word" id="builder-word"></p>
          <p class="clue-meaning" id="builder-meaning"></p>
          <button type="button" class="pronounce-btn" id="builder-pronounce" data-i18n="builder.hearIt">${t('builder.hearIt')}</button>
          <p class="clue-hint" data-i18n="builder.clueHint">${t('builder.clueHint')}</p>
          <p class="clue-hint-ko" data-i18n="builder.clueHintKo">${t('builder.clueHintKo')}</p>
        </section>

        <section>
          <p class="section-label"><span data-i18n="builder.buildLabel">${t('builder.buildLabel')}</span>${prefs()?.shouldShowKoreanSupport?.() !== false ? ` · <span data-i18n="builder.buildLabelKo">${t('builder.buildLabelKo')}</span>` : ''}</p>
          <div class="answer-area">
            <div class="syllable-blocks-row" id="builder-slots"></div>
          </div>
        </section>

        <div class="feedback empty" id="builder-feedback" role="status">&nbsp;</div>

        <section>
          <p class="section-label"><span data-i18n="builder.jamoLabel">${t('builder.jamoLabel')}</span>${prefs()?.shouldShowKoreanSupport?.() !== false ? ` · <span data-i18n="builder.jamoLabelKo">${t('builder.jamoLabelKo')}</span>` : ''}</p>
          <div class="bank-area">
            <div class="bank-grid" id="builder-bank"></div>
          </div>
        </section>

        <div class="actions">
          <button type="button" class="btn btn-reset" id="builder-reset" data-i18n="builder.tryAgain">${t('builder.tryAgain')}</button>
          <button type="button" class="btn btn-next" id="builder-next" data-i18n="builder.nextWord">${t('builder.nextWord')}</button>
        </div>

        <div class="win-overlay" id="builder-win">
          <div class="win-card">
            <span class="big-emoji" id="win-emoji">🎉</span>
            <h2 id="win-title" data-i18n="builder.winTitle">${t('builder.winTitle')}</h2>
            <p class="win-word" id="win-word"></p>
            <p class="win-breakdown" id="win-breakdown"></p>
            <p class="win-milestone" id="win-milestone"></p>
            <div class="win-actions" id="win-actions"></div>
            <button type="button" class="btn btn-next visible" id="win-continue" data-i18n="builder.winContinue">${t('builder.winContinue')}</button>
          </div>
        </div>
      `;

      this.els = {
        level: this.root.querySelector('#builder-level'),
        streakHeadline: this.root.querySelector('#builder-streak-headline'),
        streakProgress: this.root.querySelector('#builder-streak-progress'),
        dots: this.root.querySelector('#builder-dots'),
        emoji: this.root.querySelector('#builder-emoji'),
        word: this.root.querySelector('#builder-word'),
        meaning: this.root.querySelector('#builder-meaning'),
        pronounce: this.root.querySelector('#builder-pronounce'),
        slots: this.root.querySelector('#builder-slots'),
        bank: this.root.querySelector('#builder-bank'),
        feedback: this.root.querySelector('#builder-feedback'),
        reset: this.root.querySelector('#builder-reset'),
        next: this.root.querySelector('#builder-next'),
        win: this.root.querySelector('#builder-win'),
        winEmoji: this.root.querySelector('#win-emoji'),
        winTitle: this.root.querySelector('#win-title'),
        winWord: this.root.querySelector('#win-word'),
        winBreakdown: this.root.querySelector('#win-breakdown'),
        winMilestone: this.root.querySelector('#win-milestone'),
        winActions: this.root.querySelector('#win-actions'),
        winContinue: this.root.querySelector('#win-continue'),
      };

      this.els.reset.addEventListener('click', () => this.resetWord());
      this.els.next.addEventListener('click', () => this.nextWord());
      this.els.winContinue.addEventListener('click', () => this.dismissWin());
      this.els.pronounce.addEventListener('click', () => this.speakWord());

      this.root.addEventListener('click', (e) => {
        if (!e.target.closest('.tile') && !e.target.closest('.drop-zone')) {
          this.clearSelection();
        }
      });

      this.updateStreakDisplay();
      this.applyPreferences();
      this.renderWord();

      if (global.I18n) {
        global.I18n.applyToDocument(this.root);
        this._i18nOff = global.I18n.onChange(() => {
          global.I18n.applyToDocument(this.root);
          this.applyPreferences();
          this.updateStreakDisplay();
        });
      }
      if (prefs()?.onChange) {
        prefs().onChange(() => this.applyPreferences());
      }
    }

    applyPreferences() {
      const p = prefs();
      if (!p) return;
      const showEn = p.shouldShowEnglish();
      const showKo = p.shouldShowKoreanSupport();
      const showBtn = p.shouldShowPronunciationButton();
      if (this.els.meaning) this.els.meaning.style.display = showEn ? '' : 'none';
      if (this.els.pronounce) this.els.pronounce.style.display = showBtn ? '' : 'none';
      this.root.querySelectorAll('.clue-hint-ko, [data-i18n="builder.subtitleKo"], [data-i18n="builder.buildLabelKo"], [data-i18n="builder.jamoLabelKo"]').forEach((el) => {
        el.style.display = showKo ? '' : 'none';
      });
      const hints = prefs()?.get?.()?.beginnerHints !== false;
      this.root.querySelectorAll('.clue-hint, .clue-hint-ko').forEach((el) => {
        el.style.display = hints ? (el.classList.contains('clue-hint-ko') && !showKo ? 'none' : '') : 'none';
      });
    }

    updateStreakDisplay() {
      if (!LS) return;
      const info = LS.getDisplayInfo();
      this.els.streakHeadline.textContent = info.headline;
      this.els.streakProgress.textContent = info.progressMessage;
      this.els.streakProgress.classList.toggle('saved', info.savedToday);
    }

    getCurrentEntry() {
      return this.words[this.wordIndex] || this.words[0];
    }

    speakWord(text) {
      const word = text || this.getCurrentEntry()?.word;
      if (!word) return;
      if (prefs()?.speakKorean) prefs().speakKorean(word);
    }

    setFeedback(type, text) {
      this.els.feedback.className = 'feedback ' + (type || 'empty');
      this.els.feedback.textContent = text || '\u00a0';
    }

    renderProgressDots() {
      const total = this.words.length;
      const windowSize = Math.min(total, 12);
      const start = Math.max(0, Math.min(this.wordIndex - 5, total - windowSize));
      this.els.dots.innerHTML = '';
      for (let i = start; i < start + windowSize; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i < this.wordIndex ? ' done' : '') + (i === this.wordIndex ? ' current' : '');
        this.els.dots.appendChild(dot);
      }
    }

    renderWord() {
      this.wordComplete = false;
      this.slotMap = {};
      this.tileMap = {};
      this.syllablePreviews = {};
      this.selectedTileId = null;
      this.els.next.classList.remove('visible');
      this.els.win.classList.remove('show');
      this.setFeedback('info', t('builder.feedbackDrag'));

      const entry = this.getCurrentEntry();
      const { syllables, tiles } = HC.buildBuilderTilesFromWord(entry.word);

      this.els.level.textContent = `${this.wordIndex + 1} / ${this.words.length}`;
      this.els.emoji.textContent = entry.emoji;
      this.els.word.textContent = entry.word;
      this.els.meaning.textContent = entry.meaning;
      this.renderProgressDots();

      this.els.slots.innerHTML = '';
      syllables.forEach((syl, si) => {
        const block = document.createElement('div');
        block.className = 'syllable-block';
        block.dataset.syllableIndex = String(si);

        const label = document.createElement('span');
        label.className = 'syllable-label';
        label.textContent = t('builder.charLabel', { n: si + 1 });

        const preview = document.createElement('div');
        preview.className = 'syllable-preview';
        preview.dataset.syllableIndex = String(si);
        preview.textContent = '·';
        this.syllablePreviews[si] = preview;

        const grid = document.createElement('div');
        grid.className = 'syllable-grid';

        const jungHDef = (syl.vowelSlots || []).find((vs) => vs.zoneType === 'jungH');
        const jungVDefs = (syl.vowelSlots || []).filter((vs) => vs.zoneType === 'jungV');

        const choSlot = this.createSlotElement(syl.zones.cho.expected, si, {
          slotKey: 'cho', zoneType: 'cho', subIndex: 0, expected: syl.zones.cho.expected,
        });
        grid.appendChild(choSlot.el);

        const jungHSlot = this.createSlotElement(jungHDef?.expected, si, {
          slotKey: 'jungH', zoneType: 'jungH', subIndex: 0, expected: jungHDef?.expected || null,
        });
        if (!jungHDef) jungHSlot.el.classList.add('zone-inactive');
        grid.appendChild(jungHSlot.el);

        const vowelColumn = document.createElement('div');
        vowelColumn.className = 'vowel-column' + (jungVDefs.length ? '' : ' zone-inactive');
        vowelColumn.dataset.zone = 'jungV';

        if (jungVDefs.length) {
          jungVDefs.forEach((def) => {
            const vs = this.createSlotElement(def.expected, si, {
              slotKey: `jungV-${def.subIndex}`,
              zoneType: 'jungV',
              subIndex: def.subIndex,
              expected: def.expected,
            });
            vowelColumn.appendChild(vs.el);
          });
          const mergePreview = document.createElement('div');
          mergePreview.className = 'vowel-merge-preview';
          mergePreview.dataset.syllableIndex = String(si);
          if (syl.medialComponents?.length > 1) {
            mergePreview.textContent = HC.formatVowelCompositionPreview(syl.medialComponents) || '';
            mergePreview.dataset.defaultPreview = mergePreview.textContent;
          }
          vowelColumn.appendChild(mergePreview);
        }
        grid.appendChild(vowelColumn);

        const jongSlot = this.createSlotElement(syl.zones.jong.expected, si, {
          slotKey: 'jong', zoneType: 'jong', subIndex: 0, expected: syl.zones.jong.expected,
        });
        if (!syl.zones.jong.expected) jongSlot.el.classList.add('zone-inactive');
        grid.appendChild(jongSlot.el);

        block.appendChild(label);
        block.appendChild(preview);
        block.appendChild(grid);
        this.els.slots.appendChild(block);
      });

      this.els.bank.innerHTML = '';
      HC.shuffle(tiles).forEach((t) => {
        const tile = { ...t, inBank: true, slotId: null, locked: false };
        this.tileMap[t.id] = tile;
        this.els.bank.appendChild(this.createTileElement(tile));
      });
    }

    createSlotElement(expected, syllableIndex, def) {
      const slotId = `slot-${syllableIndex}-${def.slotKey}`;
      const slot = document.createElement('div');
      slot.className = 'drop-zone';
      if (!expected) slot.classList.add('zone-inactive');
      slot.dataset.slotId = slotId;
      slot.dataset.zone = def.zoneType;
      slot.dataset.subIndex = String(def.subIndex);
      slot.dataset.expected = expected || '';
      slot.dataset.syllableIndex = String(syllableIndex);
      slot.innerHTML = `<span class="slot-part-tag">${zoneLabel(def.zoneType)}</span>`;
      slot.addEventListener('pointerenter', () => {
        if (this.drag.active) this.highlightSlot(slot, true);
      });
      slot.addEventListener('pointerleave', () => this.highlightSlot(slot, false));
      slot.addEventListener('click', () => this.onSlotTap(slotId));

      this.slotMap[slotId] = {
        el: slot,
        expected: expected || null,
        zoneType: def.zoneType,
        subIndex: def.subIndex,
        syllableIndex,
        filled: null,
        locked: false,
      };
      return this.slotMap[slotId];
    }

    createTileElement(tile) {
      const el = document.createElement('div');
      el.className = `tile ${zoneTileClass(tile.zoneType)}`;
      el.textContent = tile.char;
      el.dataset.tileId = tile.id;
      el.dataset.zone = tile.zoneType;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${zoneLabel(tile.zoneType)} ${tile.char}`);
      el.addEventListener('pointerdown', (e) => this.onTilePointerDown(e, tile.id));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onTileTap(tile.id);
      });
      tile.el = el;
      return el;
    }

    createSlotTileContent(tile) {
      const el = document.createElement('div');
      el.className = `tile ${zoneTileClass(tile.zoneType)} snap-in`;
      el.textContent = tile.char;
      el.dataset.tileId = tile.id;
      el.dataset.zone = tile.zoneType;
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.fontSize = 'clamp(20px, 5.5vw, 28px)';
      el.style.boxShadow = 'none';
      el.style.borderRadius = '12px';
      if (!tile.locked) {
        el.style.cursor = 'grab';
        el.addEventListener('pointerdown', (e) => this.onSlotTilePointerDown(e, tile.id));
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!tile.locked) this.onTileTap(tile.id);
        });
      }
      return el;
    }

    updateSyllablePreview(syllableIndex) {
      const preview = this.syllablePreviews[syllableIndex];
      if (!preview) return;

      const slots = Object.values(this.slotMap).filter((s) => s.syllableIndex === syllableIndex);
      const getChar = (zoneType, subIndex) => {
        const slot = slots.find((s) => s.zoneType === zoneType && (s.subIndex ?? 0) === subIndex);
        if (!slot || !slot.expected) return null;
        if (slot.locked) return slot.expected;
        if (slot.filled) return this.tileMap[slot.filled]?.char || null;
        return null;
      };

      const choChar = getChar('cho', 0);
      const jungH = getChar('jungH', 0);
      const jungVSlots = slots
        .filter((s) => s.zoneType === 'jungV' && s.expected)
        .sort((a, b) => a.subIndex - b.subIndex)
        .map((s) => getChar('jungV', s.subIndex))
        .filter((c) => c != null);
      const jongChar = getChar('jong', 0) || '';

      const placedComponents = [];
      if (jungH) placedComponents.push(jungH);
      placedComponents.push(...jungVSlots);

      const mergeEl = this.root.querySelector(`.vowel-merge-preview[data-syllable-index="${syllableIndex}"]`);
      if (mergeEl) {
        const livePreview = HC.formatVowelCompositionPreview(placedComponents);
        mergeEl.textContent = livePreview || mergeEl.dataset.defaultPreview || '';
        mergeEl.classList.toggle('preview-active', !!livePreview);
      }

      if (choChar && placedComponents.length) {
        const composed = HC.composeSyllableFromZones(choChar, jungH, jungVSlots, jongChar);
        preview.textContent = composed || '·';
        preview.classList.toggle('preview-active', !!composed);
      } else {
        preview.textContent = '·';
        preview.classList.remove('preview-active');
      }
    }

    onTileTap(tileId) {
      if (this.wordComplete) return;
      const tile = this.tileMap[tileId];
      if (!tile || tile.locked) return;

      if (this.selectedTileId === tileId) {
        this.clearSelection();
        return;
      }

      this.clearSelection();
      this.selectedTileId = tileId;
      if (tile.el) tile.el.classList.add('selected');
      global.SoundEffects?.select?.();
      this.setFeedback('info', t('builder.feedbackTapSlot'));
    }

    onSlotTap(slotId) {
      if (this.wordComplete) return;
      const slot = this.slotMap[slotId];
      if (!slot || slot.locked || !slot.expected) return;

      if (this.selectedTileId) {
        this.tryPlaceTile(this.selectedTileId, slotId);
        return;
      }

      if (slot.filled) {
        const tile = this.tileMap[slot.filled];
        if (tile && !tile.locked) {
          this.returnTileToBank(slot.filled);
          this.updateSyllablePreview(slot.syllableIndex);
        }
      }
    }

    tryPlaceTile(tileId, slotId) {
      const tile = this.tileMap[tileId];
      const slot = this.slotMap[slotId];
      if (!tile || !slot || slot.locked || tile.locked) return false;

      if (!HC.isValidTilePlacement(tile, slot)) {
        if (slot.expected) {
          slot.el.classList.add('wrong');
          global.SoundEffects?.wrong?.();
          this.setFeedback('error', t('builder.feedbackWrong'));
          setTimeout(() => slot.el.classList.remove('wrong'), 600);
        }
        this.clearSelection();
        return false;
      }

      if (!HC.isCorrectTilePlacement(tile, slot)) {
        slot.el.classList.add('wrong');
        global.SoundEffects?.wrong?.();
        this.setFeedback('error', t('builder.feedbackWrong'));
        setTimeout(() => slot.el.classList.remove('wrong'), 600);
        this.clearSelection();
        return false;
      }

      this.placeTileInSlot(tileId, slotId, true);
      this.clearSelection();
      return true;
    }

    placeTileInSlot(tileId, slotId, lockOnCorrect) {
      const tile = this.tileMap[tileId];
      const slot = this.slotMap[slotId];
      if (!tile || !slot) return false;

      if (slot.filled && slot.filled !== tileId) {
        this.returnTileToBank(slot.filled);
      }
      if (tile.slotId && tile.slotId !== slotId) {
        this.clearSlot(tile.slotId);
      }

      const bankEl = this.getBankTileEl(tileId);
      if (bankEl) bankEl.classList.add('hidden-in-bank');

      slot.el.classList.add('filled');
      if (lockOnCorrect) {
        slot.el.classList.add('correct');
        slot.locked = true;
        tile.locked = true;
      }
      slot.el.innerHTML = '';
      slot.el.appendChild(this.createSlotTileContent(tile));
      slot.filled = tileId;
      tile.inBank = false;
      tile.slotId = slotId;

      this.updateSyllablePreview(slot.syllableIndex);
      global.SoundEffects?.place?.();
      this.maybeCompleteWord();
      return true;
    }

    clearSlot(slotId) {
      const slot = this.slotMap[slotId];
      if (!slot || !slot.filled) return;
      const tileId = slot.filled;
      const tile = this.tileMap[tileId];
      slot.el.classList.remove('filled', 'correct', 'wrong');
      if (slot.expected) {
        slot.el.innerHTML = `<span class="slot-part-tag">${zoneLabel(slot.zoneType)}</span>`;
      } else {
        slot.el.innerHTML = '';
      }
      slot.filled = null;
      slot.locked = false;
      if (tile) {
        tile.slotId = null;
        tile.inBank = true;
        tile.locked = false;
        const bankEl = this.getBankTileEl(tileId);
        if (bankEl) bankEl.classList.remove('hidden-in-bank');
      }
    }

    returnTileToBank(tileId) {
      const tile = this.tileMap[tileId];
      if (!tile || tile.locked) return;
      if (tile.slotId) this.clearSlot(tile.slotId);
      else {
        const bankEl = this.getBankTileEl(tileId);
        if (bankEl) bankEl.classList.remove('hidden-in-bank');
        tile.inBank = true;
      }
    }

    clearSelection() {
      if (this.selectedTileId) {
        const tile = this.tileMap[this.selectedTileId];
        if (tile?.el) tile.el.classList.remove('selected');
      }
      this.selectedTileId = null;
    }

    getBankTileEl(id) {
      return this.els.bank.querySelector(`[data-tile-id="${id}"]`);
    }

    highlightSlot(slotEl, on) {
      if (!this.drag.active) return;
      slotEl.classList.toggle('drag-over', on);
    }

    clearSlotHighlight() {
      this.root.querySelectorAll('.drop-zone.drag-over').forEach((s) => s.classList.remove('drag-over'));
    }

    allSlotsLocked() {
      return Object.values(this.slotMap)
        .filter((s) => s.expected)
        .every((s) => s.locked);
    }

    maybeCompleteWord() {
      if (!this.allSlotsLocked() || this.wordComplete) return;
      this.wordComplete = true;
      global.SoundEffects?.win?.();
      const entry = this.getCurrentEntry();

      let milestoneText = '';
      if (LS) {
        const result = LS.recordActivity('builder');
        this.updateStreakDisplay();
        if (result.newMilestone) {
          milestoneText = `${result.newMilestone.badge} ${result.newMilestone.message}`;
        }
      }

      if (global.MenuProgress?.recordBuilderWord) global.MenuProgress.recordBuilderWord();

      if (global.XpService?.awardAndCelebrate && entry?.word) {
        global.XpService.awardAndCelebrate({
          mode: 'hangulBuilder',
          wordId: entry.word,
          usedHint: false,
        });
      }

      this.setFeedback('success', t('builder.feedbackSuccess'));
      this.els.next.classList.add('visible');
      this.spawnConfetti();

      this.els.winEmoji.textContent = entry.emoji;
      this.els.winTitle.textContent = t('builder.winTitle');
      this.els.winWord.textContent = `${entry.word} — ${entry.meaning}`;
      this.els.winBreakdown.textContent = formatSyllableBreakdown(entry.word);
      this.els.winMilestone.textContent = milestoneText;

      this.els.winActions.innerHTML = '';
      if (global.DictionaryModal) {
        const dictBtn = global.DictionaryModal.createButton(t('builder.dictionary'));
        dictBtn.addEventListener('click', () => {
          const normalized = global.LearningWords?.getNormalizedWord?.(entry.word)
            || global.LearningWordModel?.normalizeLearningWord?.(entry);
          global.DictionaryModal.open(entry.word, normalized || entry);
        });
        this.els.winActions.appendChild(dictBtn);
        global.DictionaryService?.prefetchWord?.(entry.word);
      }

      this.els.win.classList.add('show');
    }

    resetWord() {
      this.wordComplete = false;
      this.clearSelection();
      this.els.next.classList.remove('visible');
      this.els.win.classList.remove('show');
      this.setFeedback('info', t('builder.feedbackDrag'));

      Object.values(this.slotMap).forEach((slot) => {
        if (slot.locked) return;
        slot.el.classList.remove('filled', 'correct', 'wrong', 'drag-over');
        if (slot.expected) {
          slot.el.innerHTML = `<span class="slot-part-tag">${zoneLabel(slot.zoneType)}</span>`;
        } else {
          slot.el.innerHTML = '';
        }
        slot.filled = null;
      });

      Object.values(this.tileMap).forEach((tile) => {
        if (tile.locked) return;
        tile.slotId = null;
        tile.inBank = true;
        if (tile.el) {
          tile.el.classList.remove('hidden-in-bank', 'dragging', 'selected');
          if (tile.el.parentElement !== this.els.bank) this.els.bank.appendChild(tile.el);
        }
      });

      Object.keys(this.syllablePreviews).forEach((si) => {
        this.updateSyllablePreview(Number(si));
      });
    }

    nextWord() {
      this.dismissWin();
      this.wordIndex = (this.wordIndex + 1) % this.words.length;
      saveProgress(this.wordIndex);
      this.renderWord();
    }

    dismissWin() {
      this.els.win.classList.remove('show');
    }

    spawnConfetti() {
      if (prefs()?.shouldReduceMotion?.()) return;
      const colors = ['#FFB8D0', '#A8D4F5', '#FFD0A8', '#CFC0F5', '#98DDB8', '#FFEAA0'];
      for (let i = 0; i < 40; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDuration = (1.8 + Math.random() * 1.5) + 's';
        piece.style.animationDelay = Math.random() * 0.6 + 's';
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 3500);
      }
    }

    findDropSlot(x, y) {
      const ignore = [this.drag.ghost, this.drag.sourceEl];
      const el = global.DragHitTest?.elementAtPoint(x, y, ignore) ?? document.elementFromPoint(x, y);
      const slot = el?.closest?.('.drop-zone:not(.locked):not(.zone-inactive)');
      if (slot?.dataset?.slotId) {
        const mapped = this.slotMap[slot.dataset.slotId];
        if (mapped && !mapped.locked) return slot.dataset.slotId;
      }
      let hitId = null;
      Object.entries(this.slotMap).forEach(([slotId, mapped]) => {
        if (mapped.locked || !mapped.expected) return;
        const r = mapped.el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          hitId = slotId;
        }
      });
      return hitId;
    }

    onTilePointerDown(e, tileId) {
      if (this.wordComplete) return;
      const tile = this.tileMap[tileId];
      if (!tile || tile.locked) return;
      if (prefs()?.shouldUseTapToPlace?.()) {
        e.preventDefault();
        this.onTileTap(tileId);
        return;
      }
      e.preventDefault();
      this.startDrag('bank', tileId, e.clientX, e.clientY, e.pointerId, e.currentTarget);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    onSlotTilePointerDown(e, tileId) {
      if (this.wordComplete) return;
      const tile = this.tileMap[tileId];
      if (!tile || !tile.slotId || tile.locked) return;
      e.preventDefault();
      e.stopPropagation();
      this.startDrag('slot', tileId, e.clientX, e.clientY, e.pointerId, e.currentTarget);
    }

    startDrag(sourceType, sourceId, x, y, pointerId, sourceEl) {
      const tile = this.tileMap[sourceId];
      if (!tile || tile.locked) return;

      this.drag.active = true;
      this.drag.sourceType = sourceType;
      this.drag.sourceId = sourceId;
      this.drag.sourceEl = sourceEl;
      this.drag.pointerId = pointerId;

      const ghost = sourceEl.cloneNode(true);
      ghost.classList.add('tile-ghost');
      ghost.classList.remove('dragging', 'snap-in', 'hidden-in-bank', 'selected');
      ghost.style.width = sourceEl.offsetWidth + 'px';
      ghost.style.height = sourceEl.offsetHeight + 'px';
      ghost.style.left = x + 'px';
      ghost.style.top = y + 'px';
      document.body.appendChild(ghost);
      this.drag.ghost = ghost;
      sourceEl.classList.add('dragging');

      if (sourceType === 'slot' && tile.slotId) {
        const slot = this.slotMap[tile.slotId];
        slot.el.classList.remove('filled', 'correct');
        if (slot.expected) {
          slot.el.innerHTML = `<span class="slot-part-tag">${zoneLabel(slot.zoneType)}</span>`;
        }
        slot.filled = null;
        slot.locked = false;
        tile.locked = false;
      } else if (sourceType === 'bank' && tile.inBank) {
        const bankEl = this.getBankTileEl(sourceId);
        if (bankEl) bankEl.classList.add('hidden-in-bank');
      }

      document.addEventListener('pointermove', this._onMove);
      document.addEventListener('pointerup', this._onUp);
      document.addEventListener('pointercancel', this._onUp);
    }

    _onMove = (e) => {
      if (!this.drag.active || e.pointerId !== this.drag.pointerId) return;
      e.preventDefault();
      if (this.drag.ghost) {
        this.drag.ghost.style.left = e.clientX + 'px';
        this.drag.ghost.style.top = e.clientY + 'px';
      }
      this.clearSlotHighlight();
      const slotId = this.findDropSlot(e.clientX, e.clientY);
      if (slotId) this.highlightSlot(this.slotMap[slotId].el, true);
    };

    _onUp = (e) => {
      if (!this.drag.active || e.pointerId !== this.drag.pointerId) return;
      e.preventDefault();
      this.endDrag(e.clientX, e.clientY);
    };

    endDrag(x, y) {
      if (!this.drag.active) return;
      const { sourceType, sourceId, sourceEl, ghost } = this.drag;
      this.clearSlotHighlight();

      const tile = this.tileMap[sourceId];
      let dropped = false;
      const slotId = this.findDropSlot(x, y);
      if (slotId) dropped = this.tryPlaceTile(sourceId, slotId);

      if (!dropped) {
        if (sourceType === 'slot') {
          this.returnTileToBank(sourceId);
          const si = tile?.syllableIndex;
          if (si != null) this.updateSyllablePreview(si);
        } else {
          this.returnTileToBank(sourceId);
        }
      }

      if (sourceEl) sourceEl.classList.remove('dragging');
      if (ghost) ghost.remove();

      this.drag.active = false;
      this.drag.sourceType = null;
      this.drag.sourceId = null;
      this.drag.sourceEl = null;
      this.drag.ghost = null;
      this.drag.pointerId = null;

      document.removeEventListener('pointermove', this._onMove);
      document.removeEventListener('pointerup', this._onUp);
      document.removeEventListener('pointercancel', this._onUp);
    }
  }

  global.HangulBuilderGame = HangulBuilderGame;
})(typeof window !== 'undefined' ? window : globalThis);
