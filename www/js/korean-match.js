/**
 * Korean Match — drag-and-drop word-building game components.
 */
(function (global) {
  'use strict';

  const HC = global.HangulCompose;
  const MATCH_WORDS = global.MATCH_WORDS || [];
  const MatchWords = global.MatchWords;
  const MD = global.MatchDaily;
  const MMP = () => global.MatchMultiPuzzle;
  const LS = global.LearningStreak;
  const BEST_STREAK_KEY = 'jamodeul-match-best-streak';
  const FLIP_MS = 420;
  const FLIP_STAGGER = 90;

  const t = (key, vars) => global.I18n?.t(key, vars) ?? '';
  const prefs = () => global.UserPreferences;

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function formatTime(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadBestStreak() {
    const raw = global.AppStorage
      ? global.AppStorage.getString(BEST_STREAK_KEY)
      : localStorage.getItem(BEST_STREAK_KEY);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function saveBestStreak(n) {
    if (global.AppStorage) {
      global.AppStorage.setString(BEST_STREAK_KEY, String(n));
    } else {
      try { localStorage.setItem(BEST_STREAK_KEY, String(n)); } catch {}
    }
  }

  /* ── DropZone ── */
  class DropZone {
    constructor({ syllableIndex, zoneType, slotIndex, subIndex, expected, onPlace }) {
      this.syllableIndex = syllableIndex;
      this.zoneType = zoneType;
      this.slotIndex = slotIndex;
      this.subIndex = subIndex ?? 0;
      this.expected = expected;
      this.onPlace = onPlace;
      this.placedTileId = null;
      this.locked = false;
      this.hintDisabled = false;
      this.el = this._createElement();
    }

    _createElement() {
      const el = document.createElement('div');
      el.className = 'drop-zone';
      el.dataset.zone = this.zoneType;
      el.dataset.subIndex = String(this.subIndex);
      el.dataset.syllable = String(this.syllableIndex);
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', `${t('builder.charLabel', { n: this.syllableIndex + 1 })} ${this.zoneType}`);
      el.addEventListener('click', (e) => {
        if (e.target.closest('.jamo-tile')) return;
        this.onPlace?.(this);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.onPlace?.(this);
        }
      });
      el.addEventListener('pointerenter', () => {
        if (global.KoreanMatchDrag?.active) global.KoreanMatchDrag.highlight(this.el, true);
      });
      el.addEventListener('pointerleave', () => {
        if (global.KoreanMatchDrag?.active) global.KoreanMatchDrag.highlight(this.el, false);
      });
      return el;
    }

    setPlaced(tileEl, tileId) {
      this.placedTileId = tileId;
      this.el.classList.add('filled');
      this.el.appendChild(tileEl);
    }

    clear() {
      this.placedTileId = null;
      this.el.classList.remove('filled', 'correct', 'incorrect', 'drag-over', 'revealing', 'revealing-wrong', 'hint-disabled');
      this.el.innerHTML = '';
    }

    setHintDisabled(on) {
      this.hintDisabled = !!on;
      this.el.classList.toggle('hint-disabled', this.hintDisabled);
      if (this.hintDisabled) {
        this.el.setAttribute('aria-disabled', 'true');
        this.el.tabIndex = -1;
      } else {
        this.el.removeAttribute('aria-disabled');
        this.el.tabIndex = 0;
      }
    }

    setLocked(correct) {
      this.locked = true;
      this.el.classList.add('locked', correct ? 'correct' : 'incorrect');
    }

    accepts() {
      return !this.locked && !this.hintDisabled;
    }
  }

  /* ── JamoTile ── */
  class JamoTile {
    constructor({ id, char, zoneType, syllableIndex, subIndex }) {
      this.id = id;
      this.char = char;
      this.zoneType = zoneType;
      this.syllableIndex = syllableIndex;
      this.subIndex = subIndex ?? 0;
      this.inBank = true;
      this.zoneRef = null;
      this.locked = false;
      this.el = this._createElement();
    }

    _createElement() {
      const el = document.createElement('div');
      el.className = 'jamo-tile';
      el.innerHTML = `<span class="jamo-tile-face jamo-tile-front">${this.char}</span><span class="jamo-tile-face jamo-tile-back">${this.char}</span>`;
      el.dataset.tileId = this.id;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', `자모 ${this.char}`);
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        global.KoreanMatchDrag?.onTilePointerDown(e, this);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          global.KoreanMatchGame?.instance?.onTileTap(this);
        }
      });
      return el;
    }

    setInBank(bankContainer) {
      this.inBank = true;
      this.zoneRef = null;
      if (this.el.parentElement !== bankContainer) bankContainer.appendChild(this.el);
      this.el.classList.remove('hidden-in-bank', 'in-zone', 'locked', 'selected', 'revealing', 'revealed', 'revealing-wrong', 'dragging');
      this.el.style.removeProperty('--flip-delay');
      this.el.style.removeProperty('visibility');
      this.el.style.removeProperty('pointer-events');
      this.el.style.removeProperty('transform');
    }

    setInZone(zone) {
      this.inBank = false;
      this.zoneRef = zone;
      this.el.classList.add('in-zone', 'snap-in');
      this.el.classList.remove('hidden-in-bank', 'selected');
    }

    setLocked() {
      this.locked = true;
      this.el.classList.add('locked', 'revealed');
      this.el.tabIndex = -1;
    }

    setSelected(on) {
      this.el.classList.toggle('selected', on);
    }

    hideInBank() { this.el.classList.add('hidden-in-bank'); }
    showInBank() { this.el.classList.remove('hidden-in-bank'); }

    setChar(char) {
      this.char = char;
      this.el.querySelector('.jamo-tile-front').textContent = char;
      this.el.querySelector('.jamo-tile-back').textContent = char;
      this.el.setAttribute('aria-label', `자모 ${char}`);
    }
  }

  /* ── SyllableBlock ── */
  class SyllableBlock {
    constructor(syllableData, index, callbacks) {
      this.index = index;
      this.data = syllableData;
      this.zones = {};
      this.el = this._createElement(callbacks);
    }

    _addZone(parent, config, callbacks) {
      const zone = new DropZone({ ...config, onPlace: callbacks.onZoneTap });
      const key = config.zoneType === 'jungV'
        ? `jungV-${config.subIndex}`
        : config.zoneType;
      this.zones[key] = zone;
      parent.appendChild(zone.el);
      return zone;
    }

    _createElement(callbacks) {
      const block = document.createElement('div');
      block.className = 'syllable-block';
      block.dataset.syllableIndex = String(this.index);
      const grid = document.createElement('div');
      grid.className = 'syllable-grid';

      this._addZone(grid, {
        syllableIndex: this.index,
        zoneType: 'cho',
        slotIndex: 0,
        subIndex: 0,
        expected: this.data.zones.cho.expected,
      }, callbacks);

      const jungHDef = (this.data.vowelSlots || []).find((vs) => vs.zoneType === 'jungH');
      this._addZone(grid, {
        syllableIndex: this.index,
        zoneType: 'jungH',
        slotIndex: 1,
        subIndex: 0,
        expected: jungHDef?.expected || null,
      }, callbacks);

      const jungVDefs = (this.data.vowelSlots || []).filter((vs) => vs.zoneType === 'jungV');
      const vowelColumn = document.createElement('div');
      vowelColumn.className = 'vowel-column';
      vowelColumn.dataset.zone = 'jungV';

      const jungVSlots = jungVDefs.length
        ? jungVDefs
        : [{ zoneType: 'jungV', subIndex: 0, expected: null }];
      jungVSlots.forEach((def, i) => {
        this._addZone(vowelColumn, {
          syllableIndex: this.index,
          zoneType: 'jungV',
          slotIndex: 2 + i,
          subIndex: def.subIndex,
          expected: def.expected ?? null,
        }, callbacks);
      });

      grid.appendChild(vowelColumn);

      this._addZone(grid, {
        syllableIndex: this.index,
        zoneType: 'jong',
        slotIndex: 10,
        subIndex: 0,
        expected: this.data.zones.jong.expected,
      }, callbacks);

      block.appendChild(grid);
      return block;
    }

    getAllZones() {
      return Object.values(this.zones);
    }
  }

  class GameFeedback {
    constructor(containerEl) { this.el = containerEl; this.suppressed = false; }
    show(type, text) {
      if (this.suppressed) return;
      this.el.className = 'game-feedback ' + (type || 'empty');
      this.el.textContent = text || '\u00a0';
      this.el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    }
  }

  /* ── Drag controller ── */
  const DRAG_THRESHOLD_PX = 8;

  const KoreanMatchDrag = {
    active: false,
    pending: null,
    tile: null,
    ghost: null,
    pointerId: null,

    _clearPendingListeners() {
      document.removeEventListener('pointermove', this._onPendingMove);
      document.removeEventListener('pointerup', this._onPendingUp);
      document.removeEventListener('pointercancel', this._onPendingUp);
    },

    _cancelPending() {
      this._clearPendingListeners();
      this.pending = null;
    },

    onTilePointerDown(e, tile) {
      const game = KoreanMatchGame.instance;
      if (!game || game.checkedComplete || game.checking || game.inspectMode || tile.locked) return;
      if (!game.canArrangeTiles()) return;
      e.preventDefault();
      if (this.active) return;
      if (this.pending) this._cancelPending();
      this.pending = {
        tile,
        x: e.clientX,
        y: e.clientY,
        pointerId: e.pointerId,
        sourceEl: e.currentTarget,
      };
      document.addEventListener('pointermove', this._onPendingMove);
      document.addEventListener('pointerup', this._onPendingUp);
      document.addEventListener('pointercancel', this._onPendingUp);
    },

    _onPendingMove(e) {
      const d = KoreanMatchDrag;
      const p = d.pending;
      if (!p || e.pointerId !== p.pointerId) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      const { tile, x, y, pointerId, sourceEl } = p;
      d._cancelPending();
      d.start(x, y, pointerId, tile, sourceEl);
      if (d.ghost) {
        d.ghost.style.left = `${e.clientX}px`;
        d.ghost.style.top = `${e.clientY}px`;
      }
    },

    _onPendingUp(e) {
      const d = KoreanMatchDrag;
      const p = d.pending;
      if (!p || e.pointerId !== p.pointerId) return;
      d._cancelPending();
      KoreanMatchGame.instance?.onTileTap(p.tile);
    },

    _onLostCapture: (e) => {
      const d = KoreanMatchDrag;
      if (!d.active || e.pointerId !== d.pointerId) return;
      d._finishDrag(e.clientX, e.clientY);
    },

    _onDragAbort: () => {
      const d = KoreanMatchDrag;
      if (!d.active || !d.ghost) return;
      d._finishDrag(
        parseFloat(d.ghost.style.left) || 0,
        parseFloat(d.ghost.style.top) || 0
      );
    },

    _onVisibilityAbort: () => {
      if (document.visibilityState === 'hidden') KoreanMatchDrag._onDragAbort();
    },

    _ghostSize(tile, sourceEl) {
      const sizeRoot = KoreanMatchGame.instance?.root || document.documentElement;
      const tileSize = parseFloat(getComputedStyle(sizeRoot).getPropertyValue('--tile-size'));
      if (Number.isFinite(tileSize) && tileSize > 0) {
        const mergeScale = tile?.mergeDockRef === 'slot' || tile?.mergeDockRef === 'result' ? 0.72 : 1;
        return tileSize * mergeScale;
      }
      const stretched = tile?.zoneRef
        || sourceEl?.classList.contains('in-zone')
        || sourceEl?.closest?.('.merge-slot, .merge-result');
      if (stretched) return 36;
      return Math.max(sourceEl?.offsetWidth || 0, sourceEl?.offsetHeight || 0, 36);
    },

    _buildGhost(tile, sourceEl, x, y) {
      const ghost = document.createElement('div');
      ghost.className = 'jamo-ghost';
      ghost.textContent = tile.char;
      ghost.setAttribute('aria-hidden', 'true');
      const size = this._ghostSize(tile, sourceEl);
      ghost.style.width = `${size}px`;
      ghost.style.height = `${size}px`;
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
      return ghost;
    },

    start(x, y, pointerId, tile, sourceEl) {
      KoreanMatchGame.instance?.clearSelection();
      this.active = true;
      this.tile = tile;
      this.pointerId = pointerId;
      this.sourceFromZone = !tile.inBank && !tile.mergeDockRef;
      if (tile.zoneRef) {
        this.dragSource = { type: 'zone', zone: tile.zoneRef };
      } else if (tile.mergeDockRef === 'result') {
        this.dragSource = { type: 'merge-result' };
      } else if (tile.mergeDockRef === 'slot') {
        this.dragSource = { type: 'merge-slot', slot: tile.mergeDockSlot };
      } else {
        this.dragSource = { type: 'bank' };
      }
      const game = KoreanMatchGame.instance;

      const ghost = this._buildGhost(tile, sourceEl, x, y);
      document.body.appendChild(ghost);
      this.ghost = ghost;
      sourceEl.classList.add('dragging');
      try { ghost.setPointerCapture?.(pointerId); } catch { /* synthetic / inactive pointer */ }
      ghost.addEventListener('lostpointercapture', this._onLostCapture);

      if (this.sourceFromZone && tile.zoneRef) {
        const zone = tile.zoneRef;
        zone.placedTileId = null;
        zone.el.classList.remove('filled', 'correct', 'incorrect');
        zone.el.innerHTML = '';
        tile.zoneRef = null;
      } else if (tile.mergeDockRef === 'result') {
        game?.mergeDock?.takeResultTileIfDragging(tile);
      } else if (tile.mergeDockRef === 'slot') {
        const idx = tile.mergeDockSlot;
        if (game?.mergeDock && idx != null) {
          game.mergeDock.slotTileIds[idx] = null;
          game.mergeDock.slotEls[idx].classList.remove('filled');
          game.mergeDock.slotEls[idx].innerHTML = '';
        }
      } else if (tile.inBank) {
        tile.hideInBank();
      }

      document.addEventListener('pointermove', this._onMove);
      document.addEventListener('pointerup', this._onUp);
      document.addEventListener('pointercancel', this._onUp);
      window.addEventListener('blur', this._onDragAbort);
      document.addEventListener('visibilitychange', this._onVisibilityAbort);
    },

    _onMove: (e) => {
      const d = KoreanMatchDrag;
      if (!d.active || e.pointerId !== d.pointerId) return;
      e.preventDefault();
      d.clearHighlights();
      const game = KoreanMatchGame.instance;
      game?.mergeDock?.clearHighlights();
      const isVowelTile = d.tile && (
        d.tile.isMerged || d.tile.isBasic
        || d.tile.zoneType === 'jungH' || d.tile.zoneType === 'jungV'
      );
      const mergeTarget = isVowelTile ? game?.mergeDock?.findDropTarget(e.clientX, e.clientY) : null;
      const bankEl = game?.canArrangeTiles?.() ? d.findBankEl(e.clientX, e.clientY, game) : null;
      if (mergeTarget) {
        game.mergeDock.highlightTarget(mergeTarget, true);
      } else if (bankEl) {
        d.highlight(bankEl, true);
      } else {
        const dockEl = d.findRotationDock(e.clientX, e.clientY);
        if (dockEl) {
          d.highlight(dockEl, true);
        } else {
          const zone = d.resolveZoneAtPoint(e.clientX, e.clientY, game);
          if (zone) d.highlight(zone.el, true);
        }
      }
      if (d.ghost) {
        d.ghost.style.left = `${e.clientX}px`;
        d.ghost.style.top = `${e.clientY}px`;
      }
    },

    _onUp: (e) => {
      const d = KoreanMatchDrag;
      if (!d.active || e.pointerId !== d.pointerId) return;
      e.preventDefault();
      d._finishDrag(e.clientX, e.clientY);
    },

    _finishDrag(x, y) {
      const d = this;
      if (!d.active) return;
      const game = KoreanMatchGame.instance;
      let placed = false;
      const tile = d.tile;
      const isVowelTile = tile && (
        tile.isMerged || tile.isBasic
        || tile.zoneType === 'jungH' || tile.zoneType === 'jungV'
      );
      const mergeTarget = isVowelTile ? game?.mergeDock?.findDropTarget(x, y) : null;
      const zone = d.resolveZoneAtPoint(x, y, game);

      if (zone && game?.tryPlaceTile(tile, zone)) {
        placed = true;
        game?.mergeDock?.clearMergeSlotRef?.(tile);
      } else if (d.findBankEl(x, y, game) && tile && !tile.locked) {
        game.returnTileToBank(tile);
        placed = true;
      } else if (mergeTarget && game?.mergeDock?.tryDrop(tile, mergeTarget)) {
        placed = true;
        game?.updateRotationDockLabel?.();
        game?.onTutorialEvent?.('mergeSlot', { game });
      } else if (d.findRotationDock(x, y) && game?.rotateTile(d.tile)) {
        game.returnTileToBank(d.tile);
        placed = true;
      }
      if (!placed) {
        const src = d.dragSource;
        if (src?.type === 'merge-result' || src?.type === 'merge-slot'
            || tile?.mergeDockRef === 'result' || tile?.mergeDockRef === 'slot'
            || (tile?.isMerged && game?.mergeDock?.resultTileId === tile.id)) {
          game?.mergeDock?.restoreTile(tile);
        } else if (src?.type === 'zone' && src.zone && !src.zone.locked && !src.zone.hintDisabled) {
          if (!game.tryPlaceTile(tile, src.zone)) {
            game.returnTileToBank(d.tile);
          }
        } else {
          game.returnTileToBank(d.tile);
        }
      }
      d.end();
    },

    findZoneEl(x, y) {
      const d = KoreanMatchDrag;
      const ignore = [d.ghost, d.tile?.el];
      const el = global.DragHitTest?.elementAtPoint(x, y, ignore)
        ?? document.elementFromPoint(x, y);
      return el?.closest('.drop-zone:not(.locked):not(.hint-disabled)') || null;
    },

    /** Hit-test by bounding rect — catches flex gaps and preview overlays */
    findZoneAtPoint(x, y, game) {
      if (!game?.blocks) return null;
      let hit = null;
      for (const block of game.blocks) {
        for (const zone of block.getAllZones()) {
          if (zone.locked || zone.hintDisabled) continue;
          const r = zone.el.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            hit = zone;
          }
        }
      }
      return hit;
    },

    resolveZoneAtPoint(x, y, game) {
      if (this.active) {
        return this.findZoneAtPoint(x, y, game);
      }
      const zoneEl = this.findZoneEl(x, y);
      if (zoneEl && game) {
        const sylIdx = parseInt(zoneEl.dataset.syllable, 10);
        const zoneKey = zoneEl.dataset.zone === 'jungV'
          ? `jungV-${zoneEl.dataset.subIndex || '0'}`
          : zoneEl.dataset.zone;
        const zone = game.blocks[sylIdx]?.zones[zoneKey];
        if (zone && !zone.locked && !zone.hintDisabled) {
          return zone;
        }
      }
      return this.findZoneAtPoint(x, y, game);
    },

    findRotationDock(x, y) {
      const dock = document.querySelector('#rotation-dock:not(.disabled)');
      if (!dock) return null;
      const r = dock.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return dock;
      return null;
    },

    findBankEl(x, y, game) {
      const bank = game?.els?.bank;
      if (!bank) return null;
      const r = bank.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return bank;
      return null;
    },

    highlight(el, on) { el?.classList.toggle('drag-over', on); },

    clearHighlights() {
      document.querySelectorAll('.drop-zone.drag-over, #rotation-dock.drag-over, .jamo-bank.drag-over')
        .forEach((z) => z.classList.remove('drag-over'));
    },

    end() {
      const tile = this.tile;
      if (tile?.el) {
        tile.el.classList.remove('dragging');
        tile.el.style.removeProperty('visibility');
        tile.el.style.removeProperty('pointer-events');
        if (tile.inBank) tile.showInBank();
      }
      if (this.ghost) {
        this.ghost.removeEventListener('lostpointercapture', this._onLostCapture);
        try { this.ghost.releasePointerCapture?.(this.pointerId); } catch { /* inactive pointer */ }
        this.ghost.remove();
      }
      this.active = false;
      this.tile = null;
      this.ghost = null;
      this.pointerId = null;
      document.removeEventListener('pointermove', this._onMove);
      document.removeEventListener('pointerup', this._onUp);
      document.removeEventListener('pointercancel', this._onUp);
      window.removeEventListener('blur', this._onDragAbort);
      document.removeEventListener('visibilitychange', this._onVisibilityAbort);
      this.clearHighlights();
      KoreanMatchGame.instance?.mergeDock?.clearHighlights();
    },
  };

  /* ── KoreanMatchGame ── */
  class KoreanMatchGame {
    constructor(rootEl, options = {}) {
      this.root = rootEl;
      this.versus = options.versus === true;
      this.raceControlled = options.raceControlled === true;
      this.turnBased = options.turnBased === true;
      this.inspectMode = false;
      this.rushMode = false;
      this.fixedWord = options.fixedWord || null;
      this.tutorialMode = options.tutorialMode === true;
      this.tutorialValidator = options.tutorialValidator || null;
      this.onTutorialEvent = options.onTutorialEvent || null;
      this.tutorialStep = null;
      this.onProgress = options.onProgress || null;
      this.onFinished = options.onFinished || null;
      this.onFinished = options.onFinished || null;
      this.onTurnSubmit = options.onTurnSubmit || null;
      this.isMyTurn = true;
      this.turnPrepMode = false;
      this.boardHidden = false;
      this.enabled = true;
      this.isDaily = !this.versus && (options.daily ?? MD?.isDailyModeFromUrl?.() ?? false);
      this.multiFindMode = !this.versus && !this.isDaily && options.multiFind === true;
      this.multiPuzzle = null;
      this.multiFoundWords = [];
      const wordLength = MatchWords?.normalizeWordLength?.(
        options.wordLength ?? options.mode ?? options.turnMode
      ) ?? 4;
      this.wordLength = wordLength;
      this.matchMode = wordLength;
      this.modeConfig = MatchWords?.getConfigForLength?.(wordLength) || { shuffleRotations: true };
      this.matchWordList = MatchWords?.getWordsForLength?.(wordLength) || MATCH_WORDS;
      this.shuffleRotations = !this.isDaily && this.modeConfig.shuffleRotations;
      this.blocks = [];
      this.tileMap = {};
      this.selectedTile = null;
      this.checkedComplete = false;
      this.checking = false;
      this.turnSubmitting = false;
      this.streak = 0;
      this.bestStreak = loadBestStreak();
      this.guessCount = 0;
      this.wordStartTime = null;
      this.elapsedOffset = 0;
      this.timerInterval = null;
      this.wordPool = [];
      this.dailySaved = null;
      this.els = {};
      KoreanMatchGame.instance = this;
    }

    mount() {
      if (!HC) {
        console.error('[Jamodeul] HangulCompose unavailable — Korean Match cannot start');
        this.root.innerHTML = '<p style="padding:24px;text-align:center">Unable to load Korean Match. Please refresh the page.</p>';
        return;
      }

      const dayNum = this.isDaily && MD ? MD.getDayNumber(MD.getActiveDateKey()) : null;

      const titleKey = this.tutorialMode
        ? 'tutorial.title'
        : this.multiFindMode
        ? 'match.modes.multiFind'
        : this.versus
        ? 'matchRace.title'
        : (this.isDaily ? 'match.titleDaily' : 'match.title');
      const subtitleKey = this.tutorialMode
        ? 'tutorial.subtitle'
        : this.multiFindMode
        ? 'match.modes.multiFindSubtitle'
        : this.versus
        ? 'match.modes.letterCountSubtitle'
        : (this.isDaily ? 'match.subtitleDaily' : 'match.modes.letterCountSubtitle');
      const subtitleVars = this.multiFindMode
        ? undefined
        : (this.versus || !this.isDaily ? { n: this.wordLength } : undefined);

      const headerBack = this.versus
        ? ''
        : `<a class="back-link" href="index.html" data-i18n="match.back">${t('match.back')}</a>`;

      const headerBadge = this.versus
        ? ''
        : (this.isDaily
          ? `<div class="streak-badge daily-badge" id="match-streak" title="Daily">📅 Day ${dayNum}</div>`
          : `<div class="streak-badge" id="match-streak" title="연속 정답">🔥 0</div>`);

      const learningStreakBar = this.versus
        ? ''
        : `<div class="learning-streak-bar" id="match-learning-streak">
          <div class="streak-headline" id="match-streak-headline"></div>
          <div class="streak-progress" id="match-streak-progress"></div>
        </div>`;

      const showEnglish = prefs()?.shouldShowEnglish?.() !== false;
      const meaningBtnHtml = showEnglish
        ? `<button type="button" class="match-hint-btn match-meaning-btn" id="match-meaning-btn">
            <span class="app-btn-title" data-i18n="match.hints.meaning">${t('match.hints.meaning')}</span>
          </button>`
        : '';

      const hintDock = this.versus
        ? ''
        : `<section class="match-hint-dock" aria-label="${t('match.hints.label')}">
          <div class="match-token-counter" id="match-token-counter" aria-live="polite">
            🪙 <span id="match-token-count">${global.HintTokens?.get?.() ?? 5}</span>
          </div>
          <button type="button" class="match-hint-btn" id="match-orient-hint">
            <span class="app-btn-title" data-i18n="match.hints.orient">${t('match.hints.orient')}</span>
          </button>
          <button type="button" class="match-hint-btn" id="match-disable-hint">
            <span class="app-btn-title" data-i18n="match.hints.disable">${t('match.hints.disable')}</span>
          </button>
          ${meaningBtnHtml}
        </section>`;

      const versusMeaningBtn = this.versus && !this.turnBased ? meaningBtnHtml : '';

      const bankSectionHtml = this.turnBased
        ? `<section class="bank-section bank-section--turn" aria-label="Jamo tiles">
          <div class="race-turn-bottom">
            <div class="bank-tools">
              <button type="button" class="rotation-dock" id="rotation-dock" aria-label="${t('match.rotationLabel')}" title="${t('match.rotationHint')}">
                <span class="rotation-dock-icon" aria-hidden="true">↻</span>
                <span class="rotation-dock-label" data-i18n="match.rotationLabel">${t('match.rotationLabel')}</span>
              </button>
              <div class="vowel-merge-dock" id="vowel-merge-dock" aria-label="Vowel merge"></div>
            </div>
            <div class="race-turn-dock-stack">
              <div id="race-turn-bar-mount" class="race-turn-bar-mount" aria-live="polite"></div>
              <div class="jamo-bank" id="match-bank"></div>
            </div>
          </div>
        </section>`
        : `<section class="bank-section" aria-label="Jamo tiles">
          <p class="section-label" data-i18n="match.jamoLabel">${t('match.jamoLabel')}</p>
          <div class="bank-row">
            <div class="bank-tools">
              <button type="button" class="rotation-dock" id="rotation-dock" aria-label="${t('match.rotationLabel')}" title="${t('match.rotationHint')}">
                <span class="rotation-dock-icon" aria-hidden="true">↻</span>
                <span class="rotation-dock-label" data-i18n="match.rotationLabel">${t('match.rotationLabel')}</span>
              </button>
              <div class="vowel-merge-dock" id="vowel-merge-dock" aria-label="Vowel merge"></div>
            </div>
            <div class="jamo-bank" id="match-bank"></div>
          </div>
        </section>`;

      const streakStatRow = (this.isDaily || this.versus)
        ? ''
        : `<div class="results-stat-row"><dt data-i18n="match.streakLabel">${t('match.streakLabel')}</dt><dd id="results-streak"></dd></div>`;

      const resultsActions = this.versus
        ? ''
        : (this.tutorialMode
          ? `<div class="results-actions">
              <button type="button" class="btn btn-continue" id="match-continue" data-i18n="tutorial.next">${t('tutorial.next')}</button>
            </div>`
          : (this.isDaily
          ? `<div class="results-actions">
              <a class="btn btn-leave" href="index.html" id="match-leave" data-i18n="match.menu">${t('match.menu')}</a>
            </div>`
          : `<div class="results-actions">
              <button type="button" class="btn btn-continue" id="match-continue" data-i18n="match.keepGoing">${t('match.keepGoing')}</button>
              <a class="btn btn-leave" href="index.html" id="match-leave" data-i18n="match.leave">${t('match.leave')}</a>
            </div>`));

      const resultsOverlay = this.versus
        ? ''
        : `<div class="results-overlay hidden" id="match-results" role="dialog" aria-modal="true">
          <div class="results-card">
            <h2 id="results-title" data-i18n="${this.isDaily ? 'match.resultsDaily' : 'match.resultsTitle'}">${t(this.isDaily ? 'match.resultsDaily' : 'match.resultsTitle')}</h2>
            <p class="results-word" id="results-word"></p>
            <dl class="results-stats">
              <div class="results-stat-row"><dt data-i18n="match.time">${t('match.time')}</dt><dd id="results-time"></dd></div>
              <div class="results-stat-row"><dt data-i18n="match.attemptsLabel">${t('match.attemptsLabel')}</dt><dd id="results-guesses"></dd></div>
              ${streakStatRow}
            </dl>
            <p class="results-best" id="results-best"></p>
            <div class="results-dict" id="results-dict"></div>
            ${resultsActions}
          </div>
        </div>`;

      const tutorialLessonBar = this.tutorialMode
        ? `<section class="tutorial-lesson-bar" id="tutorial-lesson-bar" aria-live="polite">
            <p class="tutorial-lesson-progress" id="tutorial-lesson-progress"></p>
            <p class="tutorial-lesson-title" id="tutorial-lesson-title"></p>
            <p class="tutorial-lesson-body" id="tutorial-lesson-body"></p>
          </section>`
        : '';

      this.root.innerHTML = `
        <header class="match-header">
          ${headerBack}
          <div class="title-block">
            <h1 data-i18n="${titleKey}">${t(titleKey)}</h1>
            <p data-i18n="${subtitleKey}">${t(subtitleKey, subtitleVars)}</p>
          </div>
          ${headerBadge}
        </header>
        ${tutorialLessonBar}
        ${learningStreakBar}
        ${this.turnBased ? '' : `<div class="live-stats">
          <span class="live-stat" id="match-timer">0:00</span>
          <span class="live-stat" id="match-guesses">${t('match.guesses', { n: 0 })}</span>
        </div>`}
        <section class="hint-area" id="match-hint" aria-label="Word hint"></section>
        <p class="hint-meaning hidden" id="match-meaning" aria-live="polite"></p>
        <section class="blocks-area opp-submission-area hidden" id="match-opp-area" aria-live="polite">
          <p class="section-label" id="match-opp-label"></p>
          <div class="syllable-blocks-row" id="match-opp-blocks"></div>
          <p class="opp-reveal-stat" id="match-opp-stat"></p>
        </section>
        <section class="blocks-area match-play-surface" aria-label="Syllable blocks">
          <p class="section-label" data-i18n="match.buildLabel">${t('match.buildLabel')}</p>
          <div class="syllable-blocks-row" id="match-blocks"></div>
        </section>
        <div class="game-feedback empty" id="match-feedback" role="status">&nbsp;</div>
        ${bankSectionHtml}
        <footer class="match-footer" aria-label="Game controls">
        ${hintDock}
        ${versusMeaningBtn}
        <div class="match-actions">
          <button type="button" class="btn btn-reset" id="match-reset" data-i18n="match.reset">${t('match.reset')}</button>
          <button type="button" class="btn btn-check" id="match-check" disabled data-i18n="match.check">${t('match.check')}</button>
        </div>
        </footer>
        ${resultsOverlay}
      `;

      this.els = {
        hint: this.root.querySelector('#match-hint'),
        meaning: this.root.querySelector('#match-meaning'),
        oppArea: this.root.querySelector('#match-opp-area'),
        oppLabel: this.root.querySelector('#match-opp-label'),
        oppBlocks: this.root.querySelector('#match-opp-blocks'),
        oppStat: this.root.querySelector('#match-opp-stat'),
        blocks: this.root.querySelector('#match-blocks'),
        bank: this.root.querySelector('#match-bank'),
        feedback: this.root.querySelector('#match-feedback'),
        reset: this.root.querySelector('#match-reset'),
        check: this.root.querySelector('#match-check'),
        results: this.root.querySelector('#match-results'),
        resultsWord: this.root.querySelector('#results-word'),
        resultsTime: this.root.querySelector('#results-time'),
        resultsGuesses: this.root.querySelector('#results-guesses'),
        resultsStreak: this.root.querySelector('#results-streak'),
        resultsBest: this.root.querySelector('#results-best'),
        resultsDict: this.root.querySelector('#results-dict'),
        continue: this.root.querySelector('#match-continue'),
        leave: this.root.querySelector('#match-leave'),
        streak: this.root.querySelector('#match-streak'),
        streakHeadline: this.root.querySelector('#match-streak-headline'),
        streakProgress: this.root.querySelector('#match-streak-progress'),
        timer: this.root.querySelector('#match-timer'),
        guesses: this.root.querySelector('#match-guesses'),
        subtitle: this.root.querySelector('.title-block p'),
        rotationDock: this.root.querySelector('#rotation-dock'),
        mergeDockEl: this.root.querySelector('#vowel-merge-dock'),
        tokenCount: this.root.querySelector('#match-token-count'),
        orientHint: this.root.querySelector('#match-orient-hint'),
        disableHint: this.root.querySelector('#match-disable-hint'),
        meaningBtn: this.root.querySelector('#match-meaning-btn'),
      };

      this.orientHintUsed = false;
      this.disableHintUsed = false;
      this.meaningRevealed = false;
      this.meaningText = '';
      this._meaningPromise = null;
      this.hintsUsedThisRound = false;

      this.feedback = new GameFeedback(this.root.querySelector('#match-feedback'));
      if (this.turnBased) this.feedback.suppressed = true;

      this.mergeDock = new global.VowelMergeDock(this.els.mergeDockEl, {
        getTile: (id) => this.tileMap[id],
        returnTileToBank: (tile) => this.returnTileToBank(tile),
        clearZoneTile: (tile) => this.returnTileToBank(tile),
        removeTile: (id) => this.removeTile(id),
        createMergedTile: (opts) => this.createMergedTile(opts),
        createBasicTile: (opts) => this.createBasicTile(opts),
        renderTileInSlot: (tile) => tile.el,
        swapTiles: (a, b) => this.swapTiles(a, b),
      });

      this.mergeDock.slotEls.forEach((el, index) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.target.closest('.jamo-tile')) return;
          this.onMergeTargetTap({ type: 'slot', index });
        });
      });

      this.els.rotationDock.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onRotationDockTap();
      });
      this.els.rotationDock.addEventListener('pointerenter', () => {
        if (KoreanMatchDrag.active) KoreanMatchDrag.highlight(this.els.rotationDock, true);
      });
      this.els.rotationDock.addEventListener('pointerleave', () => {
        if (KoreanMatchDrag.active) KoreanMatchDrag.highlight(this.els.rotationDock, false);
      });
      this.els.reset.addEventListener('click', () => this.reset());
      this.els.check.addEventListener('click', () => this.checkAnswer());
      this.els.bank?.addEventListener('click', (e) => {
        if (e.target.closest('.jamo-tile')) return;
        this.onBankTap();
      });
      this.els.orientHint?.addEventListener('click', () => this.useOrientHint());
      this.els.disableHint?.addEventListener('click', () => this.useDisableHint());
      this.els.meaningBtn?.addEventListener('click', () => this.useMeaningHint());
      this.els.continue?.addEventListener('click', () => this.continuePlaying());
      this.els.leave?.addEventListener('click', () => { if (!this.isDaily) this.saveBestOnLeave(); });
      this.root.addEventListener('click', (e) => {
        if (!e.target.closest('.jamo-tile') && !e.target.closest('.drop-zone')
          && !e.target.closest('#rotation-dock') && !e.target.closest('.vowel-merge-dock')) {
          this.clearSelection();
        }
      });

      if (this.versus && this.fixedWord) {
        this.startRound({ word: this.fixedWord });
      } else if (this.tutorialMode) {
        this.root.classList.add('tutorial-match');
        this.els.reset?.classList.add('hidden');
        this.root.querySelector('.match-header .back-link')?.classList.add('hidden');
        document.getElementById('match-learning-streak')?.classList.add('hidden');
        document.querySelector('.match-hint-dock')?.classList.add('hidden');
        document.querySelector('.live-stats')?.classList.add('hidden');
      } else if (this.isDaily) {
        const activeDate = MD.getActiveDateKey();
        this.dailySaved = MD.loadDailySaved(activeDate);
        const dailyList = MatchWords?.getWordsForLength?.(4) || MATCH_WORDS;
        const word = MD.pickDailyMatchWord(dailyList.length ? dailyList : MATCH_WORDS, activeDate);
        this.startRound({ word }, this.dailySaved);
      } else if (this.multiFindMode) {
        this.els.mergeDockEl?.classList.add('hidden');
        this.startMultiRound(MMP()?.pickPuzzle?.());
      } else {
        this.refillPool();
        this.startRound(this.drawWord());
      }

      this.updateLearningStreakDisplay();

      if (this.versus && !this.turnBased) {
        this.feedback.show('info', t('matchRace.prompt'));
      }

      if (global.I18n) {
        global.I18n.applyToDocument(this.root);
        global.I18n.onChange(() => {
          global.I18n.applyToDocument(this.root);
          this.updateLearningStreakDisplay();
          if (this.multiFindMode && this.multiPuzzle) this.renderMultiHint(this.multiPuzzle);
          else if (this.currentWord) this.renderHint(this.currentWord);
        });
      }
      if (prefs()?.onChange) {
        prefs().onChange(() => this.applyMeaningPreference());
      }
      this.applyMeaningPreference();
    }

    applyMeaningPreference() {
      const show = prefs()?.shouldShowEnglish?.() !== false;
      if (this.els.meaningBtn) {
        this.els.meaningBtn.style.display = show ? '' : 'none';
      }
      if (!show) {
        this.meaningRevealed = false;
        this.meaningText = '';
      }
      this.updateMeaningDisplay();
      this.updateHintButtons();
    }

    async resolveWordMeaning(word) {
      const q = String(word || '').trim();
      if (!q) return '';
      const entry = global.LearningWords?.findWordEntry?.(q);
      if (entry) {
        const normalized = global.LearningWords?.getNormalizedWord?.(q)
          || global.LearningWordModel?.normalizeLearningWord?.(entry);
        const curated = global.LearningWordModel?.getDisplayMeaning?.(normalized);
        if (curated) return curated;
      }
      try {
        const result = await global.DictionaryService?.lookupWord?.(q);
        if (result?.found && result.entry) {
          return result.entry.definition || result.entry.englishWord || '';
        }
      } catch { /* offline or API error */ }
      return '';
    }

    prefetchMeaning(word) {
      this._meaningPromise = this.resolveWordMeaning(word);
      global.DictionaryService?.prefetchWord?.(word);
    }

    updateMeaningDisplay() {
      const el = this.els.meaning;
      if (!el) return;
      const show = prefs()?.shouldShowEnglish?.() !== false && this.meaningRevealed;
      el.classList.toggle('hidden', !show);
      el.textContent = show ? (this.meaningText || t('match.hints.noMeaning')) : '';
    }

    async useMeaningHint() {
      if (this.meaningRevealed || this.checkedComplete || this.checking) return;
      if (!this.versus) {
        const HT = global.HintTokens;
        if (!HT?.spend(2)) {
          this.feedback.show('info', t('match.hints.noTokens'));
          this.updateHintButtons();
          return;
        }
      }
      const word = this.currentWord?.word;
      const text = await (this._meaningPromise || this.resolveWordMeaning(word));
      this.meaningText = text || t('match.hints.noMeaning');
      this.meaningRevealed = true;
      this.hintsUsedThisRound = true;
      this.updateMeaningDisplay();
      this.updateHintButtons();
      this.feedback.show('info', t('match.hints.meaningDone'));
    }

    updateLearningStreakDisplay() {
      if (!LS || !this.els.streakHeadline) return;
      const info = LS.getDisplayInfo();
      this.els.streakHeadline.textContent = info.headline;
      this.els.streakProgress.textContent = info.progressMessage;
      this.els.streakProgress.classList.toggle('saved', info.savedToday);
    }

    recordLearningStreakActivity() {
      if (!LS) return null;
      const activityType = this.isDaily ? 'daily-match' : 'match';
      const result = LS.recordActivity(activityType);
      this.updateLearningStreakDisplay();
      return result;
    }

    refillPool() {
      const list = this.matchWordList?.length ? this.matchWordList : MATCH_WORDS;
      this.wordPool = HC.shuffle(list.map((w) => ({ word: w })));
    }

    drawWord() {
      if (this.wordPool.length === 0) this.refillPool();
      if (this.wordPool.length === 0) {
        return { word: (this.matchWordList[0] || MATCH_WORDS[0] || '고양이') };
      }
      return this.wordPool.pop();
    }

    saveBestOnLeave() {
      if (this.streak > this.bestStreak) {
        this.bestStreak = this.streak;
        saveBestStreak(this.bestStreak);
      }
    }

    updateStreakDisplay() {
      if (!this.els.streak) return;
      this.els.streak.textContent = `🔥 ${this.streak}`;
    }

    startTimer() {
      this.stopTimer();
      if (!this.els.timer) return;
      if (!this.wordStartTime) this.wordStartTime = Date.now();
      this.els.timer.textContent = formatTime(this.elapsedOffset + Date.now() - this.wordStartTime);
      this.timerInterval = setInterval(() => {
        if (this.wordStartTime && this.els.timer) {
          this.els.timer.textContent = formatTime(this.elapsedOffset + Date.now() - this.wordStartTime);
        }
      }, 1000);
    }

    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    getElapsedMs() {
      if (!this.wordStartTime) return this.elapsedOffset;
      return this.elapsedOffset + (Date.now() - this.wordStartTime);
    }

    serializeDailyState(over, won) {
      const locked = [];
      this.blocks.forEach((block, si) => {
        block.getAllZones().forEach((zone) => {
          if (zone.locked && zone.placedTileId) {
            const tile = this.tileMap[zone.placedTileId];
            if (tile) {
              locked.push({
                syl: si,
                zone: zone.zoneType,
                subIndex: zone.subIndex,
                char: tile.char,
              });
            }
          }
        });
      });
      return {
        guessCount: this.guessCount,
        over: !!over,
        won: !!won,
        elapsedMs: this.getElapsedMs(),
        locked,
      };
    }

    saveDailyProgress(over, won) {
      if (!this.isDaily || !MD) return;
      MD.saveDailyProgress(this.serializeDailyState(over, won), MD.getActiveDateKey());
    }

    restoreDailyLocked(locked) {
      if (!locked || !locked.length) return;
      locked.forEach(({ syl, zone, subIndex, char }) => {
        const block = this.blocks[syl];
        const zoneKey = zone === 'jungV' ? `jungV-${subIndex ?? 0}` : zone;
        const dropZone = block?.zones[zoneKey];
        if (!dropZone || dropZone.locked) return;
        const tile = Object.values(this.tileMap).find(
          (t) => t.syllableIndex === syl
            && t.zoneType === zone
            && (t.subIndex ?? 0) === (subIndex ?? 0)
            && t.char === char
            && t.inBank
        );
        if (tile && this.tryPlaceTile(tile, dropZone)) {
          dropZone.setLocked(true);
          tile.setLocked();
        }
      });
    }

    startRound(wordData, saved) {
      this.checkedComplete = false;
      this.checking = false;
      this.orientHintUsed = false;
      this.disableHintUsed = false;
      this.meaningRevealed = false;
      this.meaningText = '';
      this._meaningPromise = null;
      this.hintsUsedThisRound = false;
      this.blocks = [];
      this.tileMap = {};
      this.selectedTile = null;
      this.currentWord = wordData;
      const word = typeof wordData?.word === 'string' ? wordData.word.trim() : '';
      if (!word) {
        console.error('[Jamodeul] Korean Match startRound: missing word');
        this.feedback?.show('error', t('matchRace.loadWordFailed') || 'Could not load word.');
        return;
      }
      this.syllables = HC.decomposeWordForMatch(word);
      if (!this.syllables.length) {
        console.error('[Jamodeul] Korean Match startRound: could not decompose', word);
        this.feedback?.show('error', t('matchRace.loadWordFailed') || 'Could not load word.');
        return;
      }
      this.els.results?.classList.add('hidden');

      if (saved) {
        this.guessCount = saved.guessCount || 0;
        this.elapsedOffset = saved.elapsedMs || 0;
        this.wordStartTime = Date.now();
      } else {
        this.guessCount = 0;
        this.elapsedOffset = 0;
        this.wordStartTime = null;
      }

      if (this.els.guesses) {
        this.els.guesses.textContent = t('match.guesses', { n: this.guessCount });
      }
      if (!this.isDaily && this.els.streak) this.updateStreakDisplay();

      this.renderHint(wordData);
      this.prefetchMeaning(word);
      this.updateMeaningDisplay();
      this.renderBlocks();
      this.renderBank();
      this.mergeDock?.reset();
      this.updateRotationDockLabel();

      if (saved?.locked?.length) {
        this.restoreDailyLocked(saved.locked);
      }

      if (saved?.over && saved?.won) {
        this.checkedComplete = true;
        this.els.check.disabled = true;
        this.els.reset.disabled = true;
        this.updateHintButtons();
        this.stopTimer();
        this.revealHintWordSync(wordData.word);
        this.showResults(saved.elapsedMs || 0);
        this.feedback.show('success', t('match.feedbackDailyDone'));
        return;
      }

      this.startTimer();
      this.updateCheckButton();
      this.updateHintButtons();
      this.feedback.show('info', this.isDaily ? t('match.feedbackDaily') : t('match.feedbackCheck'));
    }

    startMultiRound(puzzle) {
      const picked = puzzle || MMP()?.pickPuzzle?.(this.multiPuzzle?.id);
      if (!picked) {
        this.feedback?.show('error', t('matchRace.loadWordFailed') || 'Could not load puzzle.');
        return;
      }

      this.multiPuzzle = picked;
      this.multiFoundWords = [];
      this.checkedComplete = false;
      this.checking = false;
      this.turnSubmitting = false;
      this.blocks = [];
      this.tileMap = {};
      this.selectedTile = null;
      this.currentWord = { word: '', puzzle: picked };
      this.syllables = [MMP().buildSyllableTemplate()];
      this.shuffleRotations = false;
      this.guessCount = 0;
      this.elapsedOffset = 0;
      this.wordStartTime = null;
      this.els.results?.classList.add('hidden');
      this.els.guesses.textContent = t('match.multiFind.progress', {
        n: 0,
        total: picked.targetCount,
      });
      if (this.els.streak) this.updateStreakDisplay();

      this.renderMultiHint(picked);
      this.renderBlocks();
      this.renderMultiBank(picked);
      this.mergeDock?.reset();
      this.updateRotationDockLabel();
      this.startTimer();
      this.updateCheckButton();
      this.feedback.show('info', t('match.multiFind.prompt', { n: picked.targetCount }));
    }

    renderMultiHint(puzzle) {
      if (!this.els.hint) return;
      this.els.hint.classList.remove('hidden');
      const found = this.multiFoundWords || [];
      const chips = found.map((w) => `<span class="multi-found-chip">${w}</span>`).join('');
      const tileLabel = puzzle.hintTiles || puzzle.tiles.map((td) => td.char).join(' · ');
      this.els.hint.innerHTML = `
        <p class="hint-prompt">${escapeHtml(t('match.multiFind.prompt', { n: puzzle.targetCount }))}</p>
        <p class="multi-tiles-hint">${escapeHtml(t('match.multiFind.tiles'))}: <strong>${escapeHtml(tileLabel)}</strong></p>
        <div class="multi-found-row" aria-live="polite">
          ${chips || `<span class="multi-found-empty">${escapeHtml(t('match.multiFind.noneYet'))}</span>`}
        </div>
        <p class="multi-progress-label">${escapeHtml(t('match.multiFind.progress', { n: found.length, total: puzzle.targetCount }))}</p>
      `;
    }

    renderMultiBank(puzzle) {
      this.els.bank.innerHTML = '';
      (MMP()?.buildTilesFromPuzzle?.(puzzle) || []).forEach((def) => {
        const tile = new JamoTile({ ...def });
        this.tileMap[tile.id] = tile;
        this.els.bank.appendChild(tile.el);
      });
    }

    hasAllMultiTilesPlaced() {
      const tiles = Object.values(this.tileMap);
      if (!tiles.length) return false;
      return tiles.every((tile) => !tile.inBank);
    }

    async checkMultiWordAnswer() {
      if (!this.multiFindMode || !this.multiPuzzle) return;
      if (!this.hasAllMultiTilesPlaced() || this.checking || this.checkedComplete) return;

      const composed = this.composeSyllableFromBlock(this.blocks[0]);
      if (!composed || !this.multiPuzzle.validWords.includes(composed)) {
        this.feedback.show('error', t('match.multiFind.notValid'));
        return;
      }
      if (this.multiFoundWords.includes(composed)) {
        this.feedback.show('info', t('match.multiFind.alreadyFound'));
        return;
      }

      this.checking = true;
      this.guessCount += 1;
      this.multiFoundWords.push(composed);
      this.renderMultiHint(this.multiPuzzle);
      this.feedback.show('success', t('match.multiFind.found', { word: composed }));

      await delay(450);
      this.clearUnlockedPlacements();
      this.checking = false;

      if (this.multiFoundWords.length >= this.multiPuzzle.targetCount) {
        this.checkedComplete = true;
        this.stopTimer();
        if (!this.isDaily) {
          this.streak += 1;
          if (this.streak > this.bestStreak) {
            this.bestStreak = this.streak;
            saveBestStreak(this.bestStreak);
          }
          this.updateStreakDisplay();
          if (global.MenuProgress?.recordMatchWord) global.MenuProgress.recordMatchWord();
        }
        const streakResult = this.recordLearningStreakActivity();
        if (global.XpService?.awardAndCelebrate) {
          global.XpService.awardAndCelebrate({ mode: 'koreanMatch', wordId: this.multiFoundWords.join('') });
        }
        this.feedback.show('success', t('match.multiFind.win'));
        if (streakResult?.newMilestone) {
          setTimeout(() => {
            this.feedback.show('success', `${streakResult.newMilestone.badge} ${streakResult.newMilestone.message}`);
          }, 1200);
        }
        this.spawnConfetti();
        this.showResults(this.getElapsedMs());
        this.els.check.disabled = true;
        this.els.reset.disabled = true;
        return;
      }

      this.updateCheckButton();
      this.feedback.show('info', t('match.multiFind.keepGoing'));
    }

    revealHintWordSync(word) {
      const letters = this.els.hint.querySelectorAll('.hint-letter');
      const chars = [...word].filter(HC.isHangulSyllable);
      letters.forEach((el, i) => {
        el.textContent = chars[i] || '?';
        el.classList.add('revealed');
      });
    }

    renderHint(wordData) {
      if (this.turnBased) {
        if (this.els.hint) {
          this.els.hint.innerHTML = '';
          this.els.hint.classList.add('hidden');
        }
        return;
      }
      if (this.els.hint) this.els.hint.classList.remove('hidden');
      const syllables = [...wordData.word].filter(HC.isHangulSyllable);
      const prompt = this.isDaily
        ? `Daily · 음절 ${syllables.length}개`
        : `음절 ${syllables.length}개 · 단어를 맞춰 보세요`;
      this.els.hint.innerHTML = `
        <div class="hint-letters" id="hint-letters">
          ${syllables.map((_, i) => `<span class="hint-letter" data-idx="${i}">?</span>`).join('')}
        </div>
        <p class="hint-prompt">${prompt}</p>
      `;
    }

    async revealHintWord(word) {
      const letters = this.els.hint.querySelectorAll('.hint-letter');
      const chars = [...word].filter(HC.isHangulSyllable);
      for (let i = 0; i < letters.length; i++) {
        await delay(FLIP_STAGGER);
        const el = letters[i];
        el.classList.add('hint-flip');
        await delay(FLIP_MS / 2);
        el.textContent = chars[i] || '?';
        el.classList.add('revealed');
        await delay(FLIP_MS / 2);
        el.classList.remove('hint-flip');
      }
    }

    renderBlocks() {
      this.els.blocks.innerHTML = '';
      this.syllables.forEach((syl, i) => {
        const block = new SyllableBlock(syl, i, { onZoneTap: (zone) => this.onZoneTap(zone) });
        this.blocks.push(block);
        this.els.blocks.appendChild(block.el);
      });
      this.syncBlocksRowSylCount(this.els.blocks);
    }

    syncBlocksRowSylCount(rowEl) {
      if (!rowEl) return;
      const n = this.syllables?.length || this.blocks.length || 0;
      const count = String(Math.max(n, 1));
      rowEl.dataset.sylCount = String(n);
      rowEl.style.setProperty('--syl-count', count);
      this.root?.style?.setProperty('--syl-count', count);
    }

    renderBank() {
      this.els.bank.innerHTML = '';
      let tileCounter = 0;
      HC.shuffle(HC.buildTilesFromWord(this.syllables)).forEach((def) => {
        const tile = new JamoTile({ ...def, id: `tile-${tileCounter++}` });
        this.tileMap[tile.id] = tile;
        if (this.shuffleRotations) this.applyRandomTileRotation(tile);
        this.els.bank.appendChild(tile.el);
      });
    }

    findZone(zoneType, syllableIndex = 0, subIndex = 0) {
      const block = this.blocks[syllableIndex];
      if (!block) return null;
      return block.getAllZones().find(
        (z) => z.zoneType === zoneType && (z.subIndex ?? 0) === (subIndex ?? 0)
      ) || null;
    }

    renderCustomBank(tileDefs) {
      this.els.bank.innerHTML = '';
      this.tileMap = {};
      let tileCounter = 0;
      (tileDefs || []).forEach((def) => {
        const tile = new JamoTile({
          char: def.char,
          zoneType: def.zoneType,
          syllableIndex: def.syllableIndex ?? 0,
          subIndex: def.subIndex ?? 0,
          id: `tile-${tileCounter++}`,
        });
        if (def.startChar) {
          tile.setChar(def.startChar);
          tile.zoneType = HC.zoneTypeForRotatedJamo(def.startChar, tile.zoneType);
        }
        this.tileMap[tile.id] = tile;
        this.els.bank.appendChild(tile.el);
      });
    }

    applyPrePlaced(placements) {
      (placements || []).forEach((p) => {
        const zone = this.findZone(p.zoneType, p.syllableIndex ?? 0, p.subIndex ?? 0);
        if (!zone) return;
        const tile = new JamoTile({
          char: p.char,
          zoneType: p.zoneType,
          syllableIndex: p.syllableIndex ?? 0,
          subIndex: p.subIndex ?? 0,
          id: `pre-${p.zoneType}-${p.syllableIndex ?? 0}`,
        });
        this.tileMap[tile.id] = tile;
        this.attachTileToZone(tile, zone);
        if (p.locked) {
          tile.locked = true;
          zone.setLocked(true);
        }
      });
    }

    loadTutorialStep(step) {
      if (!step) return;
      this.tutorialStep = step;
      this.shuffleRotations = false;
      this.wordLength = step.wordLength || [...(step.word || '')].filter(HC.isHangulSyllable).length || 1;
      this.checkedComplete = false;
      this.checking = false;
      this.clearSelection();

      this.startRound({ word: step.word });

      if (step.bankTiles?.length) {
        this.renderCustomBank(step.bankTiles);
      } else if (step.type !== 'free-solve') {
        this.renderBank();
      }

      if (step.prePlaced?.length) {
        this.applyPrePlaced(step.prePlaced);
      }

      this.els.mergeDockEl?.classList.toggle('hidden', !!step.hideMerge);
      this.els.rotationDock?.classList.toggle('hidden', !!step.hideRotation);
      this.els.check?.classList.toggle('hidden', step.type !== 'free-solve');
      this.els.mergeDockEl?.classList.remove('tutorial-merge-focus');
      if (step.type === 'guided-merge') {
        this.els.mergeDockEl?.classList.add('tutorial-merge-focus');
      }

      this.mergeDock?.reset();
      this.updateRotationDockLabel();
      this.updateCheckButton();
      this.onTutorialEvent?.('stepReady', { step, game: this });
    }

    async celebrateTutorialSuccess() {
      if (this.checking) return 0;
      this.checking = true;
      const toReveal = [];
      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          if (zone.locked || zone.expected === null) return;
          const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
          if (tile && this.isZoneCorrect(zone)) {
            toReveal.push({ zone, tile });
          }
        });
      });
      await Promise.all(
        toReveal.map((item, i) => this.flipRevealZone(item.zone, item.tile, i))
      );
      this.checkedComplete = true;
      this.stopTimer();
      if (!prefs()?.shouldReduceMotion?.()) this.spawnConfetti();
      if (this.els.hint && this.currentWord?.word) {
        await this.revealHintWord(this.currentWord.word);
      }
      this.checking = false;
      return toReveal.length;
    }

    applyRandomTileRotation(tile) {
      if (!HC.canRotateJamo(tile.char)) return;
      const syl = this.syllables[tile.syllableIndex];
      const expected = syl?.vowelSlots?.find(
        (vs) => vs.zoneType === tile.zoneType && vs.subIndex === tile.subIndex
      )?.expected ?? syl?.zones?.[tile.zoneType]?.expected;
      if (!expected) return;
      const next = HC.randomRotateJamo(tile.char, true);
      if (next === tile.char) return;
      tile.setChar(next);
      tile.zoneType = HC.zoneTypeForRotatedJamo(next, tile.zoneType);
    }

    getExpectedForTile(tile) {
      const syl = this.syllables[tile.syllableIndex];
      if (!syl) return null;
      if (tile.zoneType === 'cho') return syl.zones.cho.expected;
      if (tile.zoneType === 'jong') return syl.zones.jong.expected;
      const vs = syl.vowelSlots?.find(
        (v) => v.zoneType === tile.zoneType && v.subIndex === tile.subIndex
      );
      return vs?.expected ?? null;
    }

    onTileTap(tile) {
      if (this.checkedComplete || this.checking || this.inspectMode || tile.locked) return;
      if (!this.canArrangeTiles()) return;
      if (this.selectedTile?.id === tile.id) {
        this.clearSelection();
        return;
      }
      if (this.selectedTile && this.trySwapWithTile(this.selectedTile, tile)) {
        this.clearSelection();
        return;
      }
      if (this.selectedTile) this.selectedTile.setSelected(false);
      this.selectedTile = tile;
      tile.setSelected(true);
      this.updateSelectionHighlights();
    }

    trySwapWithTile(tileA, tileB) {
      if (!tileA || !tileB || tileA.id === tileB.id) return false;
      if (tileA.locked || tileB.locked) return false;
      if (tileB.mergeDockRef === 'slot') {
        if (!this.mergeDock?.canAcceptInSlot(tileA)) return false;
        return this.swapTiles(tileA, tileB);
      }
      if (tileA.mergeDockRef === 'slot') {
        if (!this.mergeDock?.canAcceptInSlot(tileB)) return false;
        return this.swapTiles(tileA, tileB);
      }
      if (tileB.zoneRef && HC.isValidMatchPlacement(tileA, tileB.zoneRef)) {
        return this.swapTiles(tileA, tileB);
      }
      if (tileA.zoneRef && HC.isValidMatchPlacement(tileB, tileA.zoneRef)) {
        return this.swapTiles(tileA, tileB);
      }
      return false;
    }

    updateSelectionHighlights() {
      this.clearSelectionHighlights();
      const tile = this.selectedTile;
      if (!tile) return;

      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          if (zone.locked || zone.hintDisabled) return;
          if (HC.isValidMatchPlacement(tile, zone)) {
            zone.el.classList.add('tap-target');
          }
        });
      });

      if (HC.canRotateJamo(tile.char) && !this.els.rotationDock?.classList.contains('disabled')) {
        this.els.rotationDock?.classList.add('tap-target');
      }

      this.mergeDock?.highlightValidTargetsForTile(tile);
    }

    clearSelectionHighlights() {
      this.blocks?.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          zone.el.classList.remove('tap-target');
        });
      });
      this.els.rotationDock?.classList.remove('tap-target');
      this.mergeDock?.clearTapHighlights();
    }

    onZoneTap(zone) {
      if (zone.locked || zone.hintDisabled || this.checking || this.inspectMode) return;
      if (!this.canArrangeTiles()) return;
      if (this.selectedTile?.zoneRef === zone) return;
      if (this.selectedTile && HC.isValidMatchPlacement(this.selectedTile, zone)) {
        if (zone.placedTileId && zone.placedTileId !== this.selectedTile.id) {
          const existing = this.tileMap[zone.placedTileId];
          if (existing && !existing.locked && this.swapTiles(this.selectedTile, existing)) {
            this.clearSelection();
            return;
          }
        }
        if (this.tryPlaceTile(this.selectedTile, zone)) this.clearSelection();
        return;
      }
      if (zone.placedTileId) {
        const placed = this.tileMap[zone.placedTileId];
        if (placed && !placed.locked) this.onTileTap(placed);
      }
    }

    onBankTap() {
      if (!this.canArrangeTiles()) return;
      if (this.selectedTile && !this.selectedTile.inBank && !this.selectedTile.locked) {
        this.returnTileToBank(this.selectedTile);
        this.clearSelection();
        return;
      }
      if (this.selectedTile?.inBank) {
        this.clearSelection();
      }
    }

    onMergeTargetTap(target) {
      if (this.checkedComplete || this.checking || this.inspectMode) return;
      if (!this.canArrangeTiles()) return;
      if (!this.selectedTile) {
        if (target.type === 'slot') {
          const id = this.mergeDock?.slotTileIds?.[target.index];
          const tile = id ? this.tileMap[id] : null;
          if (tile && !tile.locked) this.onTileTap(tile);
        } else if (target.type === 'result') {
          const tile = this.mergeDock?.getResultTile?.();
          if (tile && !tile.locked) this.onTileTap(tile);
        }
        return;
      }
      if (target.type === 'slot') {
        const idx = target.index;
        if (this.selectedTile.mergeDockRef === 'slot' && this.selectedTile.mergeDockSlot === idx) {
          return;
        }
        const existingId = this.mergeDock?.slotTileIds?.[idx];
        if (existingId && existingId !== this.selectedTile.id) {
          const existing = this.tileMap[existingId];
          if (existing && !existing.locked && this.swapTiles(this.selectedTile, existing)) {
            this.clearSelection();
            return;
          }
        }
      }
      if (this.mergeDock?.tryDrop(this.selectedTile, target)) {
        this.clearSelection();
        this.updateRotationDockLabel();
        this.onTutorialEvent?.('mergeSlot', { game: this });
      }
    }

    captureTileLocation(tile) {
      if (tile.zoneRef) return { type: 'zone', zone: tile.zoneRef };
      if (tile.mergeDockRef === 'slot') return { type: 'merge-slot', index: tile.mergeDockSlot };
      if (tile.mergeDockRef === 'result') return { type: 'merge-result' };
      return { type: 'bank' };
    }

    releaseTile(tile) {
      if (!tile) return;
      tile.setSelected(false);
      if (tile.zoneRef) {
        const zone = tile.zoneRef;
        zone.placedTileId = null;
        zone.clear();
        tile.zoneRef = null;
      }
      if (tile.mergeDockRef === 'slot') {
        const idx = tile.mergeDockSlot;
        if (this.mergeDock && this.mergeDock.slotTileIds[idx] === tile.id) {
          this.mergeDock.slotTileIds[idx] = null;
          this.mergeDock.slotEls[idx].classList.remove('filled');
          this.mergeDock.slotEls[idx].innerHTML = '';
        }
        tile.mergeDockRef = null;
        tile.mergeDockSlot = null;
      } else if (tile.mergeDockRef === 'result') {
        this.mergeDock?.clearResultTileRef(tile);
        tile.mergeDockRef = null;
      }
      tile.inBank = false;
      tile.el.classList.remove('in-zone', 'dragging', 'hidden-in-bank');
      if (tile.el.parentElement) tile.el.remove();
    }

    attachTileToZone(tile, zone) {
      const tileEl = tile.el;
      tileEl.classList.remove('dragging', 'hidden-in-bank', 'revealing', 'revealed', 'revealing-wrong', 'selected');
      tileEl.style.cssText = '';
      this.mergeDock?.clearMergeSlotRef?.(tile);
      tile.mergeDockRef = null;
      tile.mergeDockSlot = null;
      zone.setPlaced(tileEl, tile.id);
      tile.setInZone(zone);
      zone.placedTileId = tile.id;
    }

    applyTileLocation(tile, loc) {
      if (!tile || !loc) return false;
      switch (loc.type) {
        case 'bank':
          tile.setInBank(this.els.bank);
          return true;
        case 'zone': {
          const zone = loc.zone;
          if (!zone || zone.locked || zone.hintDisabled) return false;
          this.attachTileToZone(tile, zone);
          return true;
        }
        case 'merge-slot':
          return !!this.mergeDock?.placeInSlotEmpty(loc.index, tile);
        case 'merge-result':
          return !!this.mergeDock?.placeInResult(tile);
        default:
          return false;
      }
    }

    swapTiles(tileA, tileB) {
      if (!tileA || !tileB || tileA.id === tileB.id) return false;
      if (tileA.locked || tileB.locked) return false;
      const locA = this.captureTileLocation(tileA);
      const locB = this.captureTileLocation(tileB);
      this.releaseTile(tileA);
      this.releaseTile(tileB);
      const okA = this.applyTileLocation(tileA, locB);
      const okB = this.applyTileLocation(tileB, locA);
      if (!okA || !okB) {
        this.releaseTile(tileA);
        this.releaseTile(tileB);
        this.applyTileLocation(tileA, locA);
        this.applyTileLocation(tileB, locB);
        this.updateRotationDockLabel();
        this.updateCheckButton();
        return false;
      }
      this.bounceTile(tileA.el);
      this.bounceTile(tileB.el);
      this.updateRotationDockLabel();
      this.updateCheckButton();
      return true;
    }

    /** Returns 'merge' | 'split' | 'rotate' depending on merge dock state. */
    getRotationDockMode() {
      if (!this.mergeDock) return 'rotate';
      const bothSlots = this.mergeDock.slotTileIds[0] && this.mergeDock.slotTileIds[1];
      if (bothSlots) return 'merge';
      if (this.mergeDock.resultTileId) return 'split';
      return 'rotate';
    }

    updateRotationDockLabel() {
      const dock = this.els.rotationDock;
      if (!dock) return;
      const mode = this.getRotationDockMode();
      const iconEl = dock.querySelector('.rotation-dock-icon');
      const labelEl = dock.querySelector('.rotation-dock-label');
      if (mode === 'merge') {
        if (iconEl) { iconEl.textContent = ''; iconEl.hidden = true; }
        if (labelEl) {
          labelEl.textContent = t('match.mergeLabel');
          labelEl.dataset.i18n = 'match.mergeLabel';
        }
        dock.dataset.dockMode = 'merge';
      } else if (mode === 'split') {
        if (iconEl) { iconEl.textContent = ''; iconEl.hidden = true; }
        if (labelEl) {
          labelEl.textContent = t('match.splitLabel');
          labelEl.dataset.i18n = 'match.splitLabel';
        }
        dock.dataset.dockMode = 'split';
      } else {
        if (iconEl) { iconEl.textContent = '↻'; iconEl.hidden = false; }
        if (labelEl) {
          labelEl.textContent = t('match.rotationLabel');
          labelEl.dataset.i18n = 'match.rotationLabel';
        }
        dock.dataset.dockMode = 'rotate';
      }
    }

    onRotationDockTap() {
      if (this.checkedComplete || this.checking) return;
      if (!this.canArrangeTiles()) return;
      const mode = this.getRotationDockMode();

      if (mode === 'merge') {
        if (this.tutorialValidator && !this.tutorialValidator('merge', { game: this })) {
          return;
        }
        this.mergeDock.tryCompose();
        this.updateRotationDockLabel();
        this.updateCheckButton();
        this.onTutorialEvent?.('merge', { game: this });
        return;
      }

      if (mode === 'split') {
        const resultTile = this.mergeDock.getResultTile();
        if (resultTile) {
          this.mergeDock.unmergeTile(resultTile);
          this.updateRotationDockLabel();
          this.updateCheckButton();
        }
        return;
      }

      // rotate mode
      if (!this.selectedTile) {
        this.feedback.show('info', t('match.rotationSelect'));
        return;
      }
      if (!this.els.rotationDock?.classList.contains('tap-target')) {
        this.feedback.show('info', t('match.rotationUnsupported', { char: this.selectedTile.char }));
        return;
      }
      if (this.rotateTile(this.selectedTile)) {
        this.updateSelectionHighlights();
      }
    }

    rotateTile(tile) {
      if (tile.locked || this.checking || this.checkedComplete) return false;
      const prev = tile.char;
      const next = HC.rotateJamo(prev);
      if (!next) return false;
      if (this.tutorialValidator && !this.tutorialValidator('rotate', { tile, prev, next, game: this })) {
        return false;
      }
      tile.setChar(next);
      tile.zoneType = HC.zoneTypeForRotatedJamo(next, tile.zoneType);
      this.bounceTile(tile.el);
      if (!this.tutorialMode) {
        this.feedback.show('info', t('match.rotateSuccess', { from: prev, to: next }));
      }
      this.updateCheckButton();
      this.onTutorialEvent?.('rotate', { tile, prev, next, game: this });
      return true;
    }

    updateHintButtons() {
      const blocked = this.checkedComplete || this.checking;
      const HT = global.HintTokens;
      const tokens = HT?.get?.() ?? 0;
      if (this.els.tokenCount && HT) {
        this.els.tokenCount.textContent = String(tokens);
      }
      if (this.els.orientHint) {
        this.els.orientHint.disabled = blocked || this.orientHintUsed || tokens < 2;
      }
      if (this.els.disableHint) {
        this.els.disableHint.disabled = blocked || this.disableHintUsed || tokens < 2;
      }
      if (this.els.meaningBtn) {
        const needsTokens = !this.versus;
        this.els.meaningBtn.disabled = blocked || this.meaningRevealed || (needsTokens && tokens < 2);
      }
    }

    useOrientHint() {
      if (this.orientHintUsed || this.checkedComplete || this.checking) return;
      const HT = global.HintTokens;
      if (!HT?.spend(2)) {
        this.feedback.show('info', t('match.hints.noTokens'));
        this.updateHintButtons();
        return;
      }

      let count = 0;
      Object.values(this.tileMap).forEach((tile) => {
        if (tile.locked) return;
        const expected = this.getExpectedForTile(tile);
        if (!expected || !HC.canRotateJamo(tile.char)) return;
        const oriented = HC.orientJamoToTarget(tile.char, expected);
        if (!oriented || oriented === tile.char) return;
        tile.setChar(oriented);
        tile.zoneType = HC.zoneTypeForRotatedJamo(oriented, tile.zoneType);
        this.bounceTile(tile.el);
        count += 1;
      });

      this.orientHintUsed = true;
      this.hintsUsedThisRound = true;
      this.updateHintButtons();
      this.updateCheckButton();
      this.feedback.show(
        count ? 'success' : 'info',
        count ? t('match.hints.orientDone', { n: count }) : t('match.hints.orientNone')
      );
    }

    useDisableHint() {
      if (this.disableHintUsed || this.checkedComplete || this.checking) return;
      const HT = global.HintTokens;
      if (!HT?.spend(2)) {
        this.feedback.show('info', t('match.hints.noTokens'));
        this.updateHintButtons();
        return;
      }

      let count = 0;
      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          if (zone.locked || zone.hintDisabled || zone.expected !== null) return;
          if (zone.placedTileId) {
            const tile = this.tileMap[zone.placedTileId];
            if (tile && !tile.locked) this.returnTileToBank(tile);
          }
          zone.clear();
          zone.setHintDisabled(true);
          count += 1;
        });
      });

      this.disableHintUsed = true;
      this.hintsUsedThisRound = true;
      this.updateHintButtons();
      this.updateCheckButton();
      this.feedback.show(
        count ? 'success' : 'info',
        count ? t('match.hints.disableDone', { n: count }) : t('match.hints.disableNone')
      );
    }

    tryPlaceTile(tile, zone) {
      if (!this.canArrangeTiles()) return false;
      if (tile.locked || zone.locked || zone.hintDisabled || this.checking) return false;
      if (!HC.isValidMatchPlacement(tile, zone)) return false;
      if (this.tutorialValidator && !this.tutorialValidator('place', { tile, zone, game: this })) {
        return false;
      }
      if (tile.zoneRef === zone) return true;
      if (zone.placedTileId && zone.placedTileId !== tile.id) {
        const existing = this.tileMap[zone.placedTileId];
        if (existing && !existing.locked) return this.swapTiles(tile, existing);
      }
      if (tile.zoneRef && tile.zoneRef !== zone) {
        tile.zoneRef.placedTileId = null;
        tile.zoneRef.el.classList.remove('filled');
        tile.zoneRef.el.innerHTML = '';
      }
      this.attachTileToZone(tile, zone);
      this.bounceTile(tile.el);
      this.updateCheckButton();
      this.onTutorialEvent?.('place', { tile, zone, game: this });
      return true;
    }

    returnTileToBank(tile) {
      if (!tile || tile.locked) return;
      if (tile.mergeDockRef === 'slot') {
        const idx = tile.mergeDockSlot;
        if (this.mergeDock && idx != null) {
          this.mergeDock.slotTileIds[idx] = null;
          this.mergeDock.slotEls[idx].classList.remove('filled');
          this.mergeDock.slotEls[idx].innerHTML = '';
        }
        tile.mergeDockRef = null;
        tile.setInBank(this.els.bank);
        this.updateRotationDockLabel();
        this.updateCheckButton();
        return;
      }
      if (tile.isMerged && this.mergeDock?.resultTileId === tile.id) {
        this.mergeDock.restoreTile(tile);
        this.updateCheckButton();
        return;
      }
      if (tile.zoneRef) {
        tile.zoneRef.placedTileId = null;
        tile.zoneRef.clear();
        tile.zoneRef = null;
      }
      tile.setInBank(this.els.bank);
      this.updateCheckButton();
    }

    createBasicTile({ char, syllableIndex, zoneType }) {
      const id = `tile-basic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const tile = new JamoTile({ id, char, zoneType, syllableIndex, subIndex: 0 });
      tile.isBasic = true;
      this.tileMap[id] = tile;
      return tile;
    }

    createMergedTile({ char, syllableIndex, mergeSources }) {
      const id = `tile-merged-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const tile = new JamoTile({ id, char, zoneType: 'jungV', syllableIndex, subIndex: 0 });
      tile.isMerged = true;
      tile.mergeSources = mergeSources;
      this.tileMap[id] = tile;
      return tile;
    }

    removeTile(id) {
      const tile = this.tileMap[id];
      if (!tile) return;
      tile.el?.remove();
      delete this.tileMap[id];
    }

    bounceTile(el) {
      el.classList.remove('bounce');
      void el.offsetWidth;
      el.classList.add('bounce');
    }

    clearSelection() {
      if (this.selectedTile) {
        this.selectedTile.setSelected(false);
        this.selectedTile = null;
      }
      this.clearSelectionHighlights();
    }

    hasAnyPlacement() {
      return Object.values(this.tileMap).some((t) => !t.inBank);
    }

    updateCheckButton() {
      if (this.multiFindMode) {
        this.els.check.disabled = !this.hasAllMultiTilesPlaced()
          || this.checkedComplete
          || this.checking;
        this.els.rotationDock?.classList.toggle('disabled', this.checkedComplete || this.checking);
        this.updateHintButtons();
        return;
      }
      const canSubmit = this.canSubmitTurn();
      this.els.check.disabled = !canSubmit || !this.hasAnyPlacement() || this.checkedComplete || this.checking;
      this.els.rotationDock?.classList.toggle('disabled', this.checkedComplete || this.checking);
      this.updateHintButtons();
    }

    reset() {
      if (this.checking) return;
      this.clearUnlockedPlacements();
      this.feedback.show('info', t('match.feedbackReset') || '잠금 해제된 타일만 지웠어요.');
      this.updateCheckButton();
    }

    clearUnlockedPlacements() {
      this.mergeDock?.reset();
      this.updateRotationDockLabel();
      Object.values(this.tileMap).forEach((tile) => {
        if (!tile.locked) this.returnTileToBank(tile);
      });
      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          if (!zone.locked) {
            zone.clear();
            zone.el.classList.remove('turn-neutral', 'incorrect');
          }
        });
      });
      Object.values(this.tileMap).forEach((tile) => {
        tile.el?.classList.remove('turn-neutral-tile');
      });
      this.clearSelection();
    }

    syncSharedState(shared) {
      if (!shared) return;
      this.guessCount = shared.guessCount || 0;
      if (this.els.guesses) {
        this.els.guesses.textContent = t('match.guesses', { n: this.guessCount });
      }
      if (this.turnBased) {
        if (shared.over) {
          this.checkedComplete = true;
          this.els.check.disabled = true;
          this.els.reset.disabled = true;
          this.updateHintButtons();
        }
        return;
      }
      this.clearUnlockedPlacements();
      this.restoreDailyLocked(shared.locked || []);
      if (shared.over) {
        this.checkedComplete = true;
        this.els.check.disabled = true;
        this.els.reset.disabled = true;
        this.updateHintButtons();
      }
      this.updateCheckButton();
    }

    /** Fresh empty board for a new PvP turn — no carried-over correct tiles. */
    resetTurnBoard() {
      this.mergeDock?.reset();
      this.updateRotationDockLabel();
      Object.values(this.tileMap).forEach((tile) => {
        tile.locked = false;
        tile.el?.classList.remove(
          'revealed', 'correct-flip', 'turn-neutral-tile', 'revealing', 'revealing-wrong'
        );
        if (!tile.inBank) this.returnTileToBank(tile);
      });
      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          zone.locked = false;
          zone.clear();
          zone.el.classList.remove(
            'correct', 'incorrect', 'turn-neutral', 'revealing', 'revealing-wrong', 'locked'
          );
        });
      });
      this.checkedComplete = false;
      this.checking = false;
      this.turnSubmitting = false;
      this.clearSelection();
      this.updateCheckButton();
    }

    /** Merge correct slot placements from the player's past turns in this match. */
    buildAutofillPlacements(turnHistory, myUid) {
      const map = new Map();
      (turnHistory || [])
        .filter((entry) => entry?.byUid === myUid)
        .forEach((entry) => {
          (entry.placements || [])
            .filter((p) => p.correct && p.char)
            .forEach((p) => {
              map.set(`${p.syl}:${p.zone}:${p.subIndex ?? 0}`, p);
            });
        });
      return map;
    }

    findBankTileForAutofill(placement) {
      const sub = placement.subIndex ?? 0;
      const exact = Object.values(this.tileMap).find((tile) => (
        tile.inBank
        && !tile.locked
        && tile.char === placement.char
        && tile.syllableIndex === placement.syl
        && tile.zoneType === placement.zone
        && (tile.subIndex ?? 0) === sub
      ));
      if (exact) return exact;
      return Object.values(this.tileMap).find((tile) => (
        tile.inBank
        && !tile.locked
        && tile.char === placement.char
        && tile.syllableIndex === placement.syl
      )) || null;
    }

    applyAutofillFromHistory(turnHistory, myUid) {
      if (!this.turnBased || !prefs()?.shouldTurnAutofillCorrect?.()) return;
      const placements = this.buildAutofillPlacements(turnHistory, myUid);
      placements.forEach((p) => {
        const block = this.blocks[p.syl];
        if (!block) return;
        const zone = block.getAllZones().find((z) => (
          z.zoneType === p.zone && (z.subIndex ?? 0) === (p.subIndex ?? 0)
        ));
        if (!zone || zone.locked) return;
        const tile = this.findBankTileForAutofill(p);
        if (!tile) return;
        this.attachTileToZone(tile, zone);
        tile.locked = true;
        zone.setLocked(true);
        tile.el.classList.add('revealed', 'correct-flip');
      });
      this.mergeDock?.tryCompose?.();
      this.updateCheckButton();
    }

    composeSyllableFromBlock(block) {
      let cho = null;
      let jungH = null;
      const jungVSlots = [];
      let jong = null;
      block.getAllZones().forEach((zone) => {
        const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
        const char = tile?.char || null;
        if (zone.zoneType === 'cho') cho = char;
        else if (zone.zoneType === 'jungH') jungH = char;
        else if (zone.zoneType === 'jungV') jungVSlots[zone.subIndex ?? 0] = char;
        else if (zone.zoneType === 'jong') jong = char;
      });
      return HC.composeSyllableFromZones(cho, jungH, jungVSlots, jong);
    }

    computeSyllableCorrectMask() {
      const targetSyls = [...(this.currentWord?.word || '')].filter(HC.isHangulSyllable);
      return this.blocks.map((block, si) => {
        const targetChar = targetSyls[si];
        if (!targetChar) return false;
        const guessChar = this.composeSyllableFromBlock(block);
        return !!guessChar && guessChar === targetChar;
      });
    }

    resolveSyllableCorrectMask(reveal) {
      if (reveal?.syllableCorrect?.length) return reveal.syllableCorrect;
      const targetSyls = [...(this.currentWord?.word || '')].filter(HC.isHangulSyllable);
      return targetSyls.map((targetChar, si) => {
        const byKey = {};
        (reveal?.placements || []).filter((p) => p.syl === si).forEach((p) => {
          byKey[p.zone === 'jungV' ? `jungV-${p.subIndex ?? 0}` : p.zone] = p.char;
        });
        const block = this.blocks[si];
        if (!block) return false;
        let cho = null;
        let jungH = null;
        const jungVSlots = [];
        let jong = null;
        block.getAllZones().forEach((zone) => {
          const zoneKey = zone.zoneType === 'jungV' ? `jungV-${zone.subIndex ?? 0}` : zone.zoneType;
          const char = byKey[zoneKey] || null;
          if (zone.zoneType === 'cho') cho = char;
          else if (zone.zoneType === 'jungH') jungH = char;
          else if (zone.zoneType === 'jungV') jungVSlots[zone.subIndex ?? 0] = char;
          else if (zone.zoneType === 'jong') jong = char;
        });
        const guessChar = HC.composeSyllableFromZones(cho, jungH, jungVSlots, jong);
        return !!guessChar && guessChar === targetChar;
      });
    }

    serializeTurnSubmission() {
      const placements = [];
      let correctCount = 0;
      let totalPlaced = 0;
      this.blocks.forEach((block, si) => {
        block.getAllZones().forEach((zone) => {
          const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
          if (!tile) return;
          totalPlaced += 1;
          const correct = zone.expected !== null && this.isZoneCorrect(zone);
          if (correct) correctCount += 1;
          placements.push({
            syl: si,
            zone: zone.zoneType,
            subIndex: zone.subIndex ?? 0,
            char: tile.char,
            correct,
            locked: !!zone.locked,
          });
        });
      });
      const syllableCorrect = this.computeSyllableCorrectMask();
      const syllableCorrectCount = syllableCorrect.filter(Boolean).length;
      const state = this.serializeDailyState(false, false);
      return {
        locked: state.locked,
        placements,
        correctCount,
        totalPlaced,
        syllableCorrect,
        syllableCorrectCount,
        syllableTotal: syllableCorrect.length,
      };
    }

    setBoardHidden(hidden) {
      this.boardHidden = !!hidden;
      const shell = this.root?.querySelector('.match-play-surface')
        || this.root?.querySelector('.blocks-area');
      if (shell) shell.classList.toggle('match-board-hidden', this.boardHidden);
    }

    setInspectMode(on) {
      this.inspectMode = !!on;
      this.rushMode = false;
      this.setEnabled(false);
      this.els.check.disabled = true;
      this.els.reset.disabled = true;
    }

    setRushMode(on) {
      this.rushMode = !!on;
      this.inspectMode = false;
      if (on) {
        this.setEnabled(true);
      } else {
        this.setMyTurn(this.isMyTurn);
      }
    }

    /**
     * Paint jamo placements with per-slot feedback onto live syllable blocks.
     */
    renderTurnGuessOnZones(blocks, reveal, { neutral = false } = {}) {
      const byPlacement = {};
      (reveal?.placements || []).forEach((p) => {
        byPlacement[`${p.syl}:${p.zone}:${p.subIndex ?? 0}`] = p;
      });

      blocks.forEach((block, si) => {
        block.getAllZones().forEach((zone) => {
          const placement = byPlacement[`${si}:${zone.zoneType}:${zone.subIndex ?? 0}`];
          const char = placement?.char;
          if (!char) return;

          zone.clear();
          zone.el.classList.add('filled');
          const tileEl = document.createElement('span');
          tileEl.className = 'jamo-tile opp-reveal-tile';
          tileEl.innerHTML = `<span class="jamo-tile-face jamo-tile-front">${char}</span>`;
          zone.el.appendChild(tileEl);

          if (neutral) {
            zone.el.classList.add('turn-neutral');
            tileEl.classList.add('turn-neutral-tile');
          } else if (placement.correct) {
            zone.el.classList.add('correct');
            tileEl.classList.add('revealed', 'correct-flip');
          } else {
            zone.el.classList.add('incorrect');
          }
        });
      });
    }

    hideOpponentSubmission() {
      this.els.oppArea?.classList.add('hidden');
      if (this.els.oppBlocks) this.els.oppBlocks.innerHTML = '';
      if (this.els.oppStat) this.els.oppStat.textContent = '';
    }

    _fillReplayZone(zoneEl, si, byPlacement) {
      const sylIdx = parseInt(zoneEl.dataset.syllable ?? String(si), 10);
      const zoneType = zoneEl.dataset.zone;
      const subIndex = parseInt(zoneEl.dataset.subIndex ?? '0', 10);
      const placement = byPlacement[`${sylIdx}:${zoneType}:${subIndex}`];
      const char = placement?.char;
      zoneEl.innerHTML = '';
      zoneEl.className = 'drop-zone opp-reveal-zone';
      zoneEl.removeAttribute('tabindex');
      zoneEl.setAttribute('aria-hidden', 'true');
      if (!char) return;
      zoneEl.classList.add('filled');
      const tile = document.createElement('span');
      tile.className = 'jamo-tile opp-reveal-tile';
      tile.innerHTML = `<span class="jamo-tile-face jamo-tile-front">${char}</span>`;
      if (placement.correct) {
        zoneEl.classList.add('correct');
        tile.classList.add('revealed', 'correct-flip');
      } else {
        zoneEl.classList.add('incorrect');
      }
      zoneEl.appendChild(tile);
    }

    /** Read-only syllable-slot board HTML (same shape as the live play board). */
    getReplayBoardHtml(reveal) {
      if (!this.blocks.length) return '';
      const byPlacement = {};
      (reveal?.placements || []).forEach((p) => {
        byPlacement[`${p.syl}:${p.zone}:${p.subIndex ?? 0}`] = p;
      });
      const row = document.createElement('div');
      row.className = 'syllable-blocks-row race-turn-previous-blocks';
      row.dataset.sylCount = String(this.blocks.length);
      row.style.setProperty('--syl-count', String(this.blocks.length));
      this.blocks.forEach((block, si) => {
        const clone = block.el.cloneNode(true);
        clone.classList.add('race-turn-previous-block');
        clone.querySelectorAll('.drop-zone').forEach((zoneEl) => {
          this._fillReplayZone(zoneEl, si, byPlacement);
        });
        row.appendChild(clone);
      });
      return row.outerHTML;
    }

    /**
     * Read-only opponent submission using the same syllable slot layout as the player board.
     * @param {{ byName?: string, placements?: object[], correctCount?: number, totalPlaced?: number }} reveal
     * @param {{ name?: string, statLabel?: string, title?: string, stat?: string }} labels
     */
    showOpponentSubmission(reveal, labels = {}) {
      if (!this.turnBased || !this.els.oppArea) return;
      if (!reveal || reveal.byUid === undefined) {
        this.hideOpponentSubmission();
        return;
      }

      if (this.els.oppLabel) {
        this.els.oppLabel.textContent = labels.title
          || t('matchTurn.oppLastTurn', { name: reveal.byName || labels.name || '' });
      }
      if (this.els.oppStat) {
        this.els.oppStat.textContent = labels.stat
          || t('matchTurn.revealStatsOnly', {
            correct: reveal.correctCount || 0,
            total: reveal.totalPlaced || 0,
          });
      }

      const byPlacement = {};
      (reveal.placements || []).forEach((p) => {
        byPlacement[`${p.syl}:${p.zone}:${p.subIndex ?? 0}`] = p;
      });

      const row = this.els.oppBlocks;
      if (!row) return;
      row.innerHTML = '';

      this.blocks.forEach((block, si) => {
        const clone = block.el.cloneNode(true);
        clone.classList.add('opp-submission-block');
        clone.querySelectorAll('.drop-zone').forEach((zoneEl) => {
          this._fillReplayZone(zoneEl, si, byPlacement);
        });
        row.appendChild(clone);
      });

      this.syncBlocksRowSylCount(row);
      this.els.oppArea.classList.remove('hidden');
    }

    applyTurnReveal(reveal, viewMode = 'feedback') {
      if (!reveal) return;
      this.setBoardHidden(false);
      this.setEnabled(false);
      this.resetTurnBoard();

      const neutral = viewMode === 'neutral' || viewMode === 'count';
      this.renderTurnGuessOnZones(this.blocks, reveal, { neutral });
      this.updateCheckButton();
    }

    /** Submit whatever is on the board when the turn timer expires. */
    async submitTurnOnTimeout() {
      if (!this.turnBased || this.inspectMode || this.rushMode) return false;
      if (!this.canSubmitTurn() || this.checkedComplete || this.turnSubmitting) return false;
      if (!this.onTurnSubmit) return false;
      if (this.checking) return false;
      if (!this.hasAnyPlacement()) return false;

      await this.checkAnswer();
      return this.turnSubmitting || this.checkedComplete;
    }

    /** After own submit — keep flip feedback on board, lock interaction. */
    freezeOwnTurnResult() {
      this.setEnabled(false);
      this.els.check.disabled = true;
      this.els.reset.disabled = true;
    }

    setMyTurn(isMine) {
      this.isMyTurn = !!isMine;
      if (isMine) this.turnPrepMode = false;
      const canPlay = !this.inspectMode
        && (this.rushMode || this.isMyTurn)
        && !this.checkedComplete
        && !this.boardHidden;
      this.setEnabled(canPlay);
      this.updateCheckButton();
    }

    /** Opponent's turn — arrange tiles in advance; submit stays disabled. */
    setPreparationMode(on) {
      this.turnPrepMode = !!on;
      if (on) {
        this.isMyTurn = false;
        this.checking = false;
        this.turnSubmitting = false;
        this.enabled = true;
        this.els.check.disabled = true;
        if (!this.inspectMode) this.els.reset.disabled = false;
        this.updateHintButtons();
      } else {
        this.setMyTurn(this.isMyTurn);
      }
    }

    canArrangeTiles() {
      if (this.checking || this.inspectMode) return false;
      if (this.turnBased) {
        if (this.rushMode) return !this.checkedComplete;
        if (this.turnPrepMode) return true;
        return this.isMyTurn && !this.checkedComplete && !this.boardHidden;
      }
      return this.enabled && !this.checkedComplete;
    }

    canSubmitTurn() {
      if (!this.turnBased) return this.enabled && !this.checkedComplete;
      return this.isMyTurn && !this.inspectMode && !this.rushMode && !this.turnPrepMode;
    }

    isZoneCorrect(zone) {
      const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
      const placed = tile ? tile.char : null;
      if (zone.expected === null) return !placed;
      return placed === zone.expected;
    }

    async flipRevealZone(zone, tile, index) {
      await delay(index * FLIP_STAGGER);
      zone.el.classList.add('revealing');
      tile.el.classList.add('revealing');
      tile.el.style.setProperty('--flip-delay', '0ms');
      await delay(FLIP_MS);
      zone.setLocked(true);
      tile.setLocked();
      zone.el.classList.remove('revealing');
      zone.el.classList.add('correct');
      tile.el.classList.remove('revealing');
      tile.el.classList.add('revealed', 'correct-flip');
    }

    async flipWrongZone(zone, tile, index) {
      await delay(index * FLIP_STAGGER);
      zone.el.classList.add('revealing-wrong');
      if (tile) tile.el.classList.add('revealing-wrong');
      await delay(FLIP_MS);
      zone.el.classList.remove('revealing-wrong');
      zone.el.classList.add('incorrect');
      if (tile) tile.el.classList.remove('revealing-wrong');
    }

    async checkAnswer() {
      if (this.multiFindMode) {
        await this.checkMultiWordAnswer();
        return;
      }
      if (!this.canSubmitTurn() || !this.hasAnyPlacement() || this.checking || this.checkedComplete || this.turnSubmitting) return;
      if (this.turnBased && this.inspectMode) return;

      this.checking = true;
      this.guessCount++;
      if (this.els.guesses) {
        this.els.guesses.textContent = t('match.guesses', { n: this.guessCount });
      }
      this.els.check.disabled = true;

      const toReveal = [];
      const toWrong = [];

      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          if (zone.locked) return;
          const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
          const placed = tile ? tile.char : null;
          const ok = this.isZoneCorrect(zone);
          if (placed && ok && zone.expected !== null) {
            toReveal.push({ zone, tile });
          } else if (placed && !ok) {
            toWrong.push({ zone, tile });
          }
        });
      });

      await Promise.all([
        ...toReveal.map((item, i) => this.flipRevealZone(item.zone, item.tile, i)),
        ...toWrong.map((item, i) => this.flipWrongZone(item.zone, item.tile, toReveal.length + i)),
      ]);

      const wordComplete = this.blocks.every((block) =>
        block.getAllZones().every((zone) => this.isZoneCorrect(zone))
      );

      if (wordComplete) {
        this.checkedComplete = true;
        this.stopTimer();
        const elapsed = this.getElapsedMs();
        if (this.tutorialMode) {
          this.checking = false;
          this.onTutorialEvent?.('wordComplete', { game: this, elapsed });
          return;
        }
        if (this.turnBased && this.onTurnSubmit) {
          this.turnSubmitting = true;
          const submission = this.serializeTurnSubmission();
          try {
            await this.onTurnSubmit({
              ...submission,
              won: true,
              guessCount: this.guessCount,
            });
          } catch (err) {
            console.error('[KoreanMatch] turn submit failed', err);
            this.turnSubmitting = false;
            this.feedback.show('error', t('matchTurn.turnSubmitFailed') || 'Could not submit turn.');
            this.checkedComplete = false;
            this.checking = false;
            this.updateCheckButton();
            return;
          }
          this.feedback.show('success', t('match.feedbackSuccess'));
          this.freezeOwnTurnResult();
          this.checking = false;
          return;
        }
        if (this.versus) {
          if (this.onProgress) {
            await this.onProgress({ guessCount: this.guessCount, won: true, elapsedMs: elapsed });
          }
          if (this.onFinished) {
            await this.onFinished({ won: true, guessCount: this.guessCount, elapsedMs: elapsed });
          }
          this.feedback.show('success', t('match.feedbackSuccess'));
          this.els.check.disabled = true;
          this.els.reset.disabled = true;
          this.checking = false;
          return;
        }
        if (!this.isDaily) {
          this.streak++;
          if (this.streak > this.bestStreak) {
            this.bestStreak = this.streak;
            saveBestStreak(this.bestStreak);
          }
          this.updateStreakDisplay();
          if (global.MenuProgress?.recordMatchWord) global.MenuProgress.recordMatchWord();
        } else {
          this.saveDailyProgress(true, true);
          global.DailyCalendarService?.onDailyWin?.(MD.getActiveDateKey());
          global.FirebaseSocial?.onDailyMatchEnd?.(true, elapsed, this.guessCount);
        }
        const streakResult = this.recordLearningStreakActivity();
        if (global.XpService?.awardAndCelebrate) {
          global.XpService.awardAndCelebrate({
            mode: this.isDaily ? 'dailyMatch' : 'koreanMatch',
            wordId: this.currentWord.word,
            usedHint: this.hintsUsedThisRound,
            isDailyChallenge: this.isDaily,
          });
        }
        this.feedback.show('success', this.isDaily ? t('match.feedbackDailyDone') : t('match.feedbackSuccess'));
        if (streakResult?.newMilestone) {
          setTimeout(() => {
            this.feedback.show('success', `${streakResult.newMilestone.badge} ${streakResult.newMilestone.message}`);
          }, 1200);
        }
        await this.revealHintWord(this.currentWord.word);
        this.spawnConfetti();
        this.showResults(elapsed);
      } else if (toReveal.length && toWrong.length) {
        this.feedback.show('success', t('match.feedbackPartial'));
        if (!this.turnBased) {
          setTimeout(() => {
            toWrong.forEach(({ zone }) => { if (!zone.locked) zone.el.classList.remove('incorrect'); });
          }, 900);
        }
      } else if (toReveal.length) {
        this.feedback.show('success', t('match.feedbackPartial'));
      } else if (toWrong.length) {
        this.feedback.show('error', t('match.feedbackWrong'));
        if (!this.turnBased) {
          setTimeout(() => {
            toWrong.forEach(({ zone }) => zone.el.classList.remove('incorrect'));
          }, 900);
        }
      } else {
        this.feedback.show('info', t('match.feedbackCheck'));
      }

      this.checking = false;
      this.updateCheckButton();
      if (this.isDaily && !wordComplete) this.saveDailyProgress(false, false);

      if (this.turnBased && !wordComplete && this.onTurnSubmit) {
        this.turnSubmitting = true;
        const submission = this.serializeTurnSubmission();
        try {
          await this.onTurnSubmit({
            ...submission,
            won: false,
            guessCount: this.guessCount,
          });
          this.freezeOwnTurnResult();
        } catch (err) {
          console.error('[KoreanMatch] turn submit failed', err);
          this.turnSubmitting = false;
          this.feedback.show('error', t('matchTurn.turnSubmitFailed') || 'Could not submit turn.');
        }
        return;
      }

      if (this.versus && !wordComplete && this.onProgress) {
        await this.onProgress({
          guessCount: this.guessCount,
          won: false,
          elapsedMs: this.getElapsedMs(),
        });
      }
    }

    setEnabled(on) {
      this.enabled = on !== false;
      if (!this.enabled) {
        this.els.check.disabled = true;
        this.els.reset.disabled = true;
        this.updateHintButtons();
      } else if (!this.checkedComplete && !this.checking && !this.inspectMode) {
        this.els.reset.disabled = false;
        this.updateCheckButton();
        this.updateHintButtons();
      }
    }

    restoreVisibleTiles() {
      Object.values(this.tileMap || {}).forEach((tile) => {
        if (!tile?.el) return;
        tile.el.style.removeProperty('visibility');
        tile.el.style.removeProperty('transform');
        tile.el.style.removeProperty('pointer-events');
        tile.el.classList.remove('hidden-in-bank', 'dragging', 'revealing', 'revealing-wrong');
        if (tile.inBank) tile.showInBank();
      });
    }

    destroy() {
      KoreanMatchDrag.end();
      this.stopTimer();
      if (KoreanMatchGame.instance === this) {
        KoreanMatchGame.instance = null;
      }
    }

    showResults(elapsed) {
      this.els.resultsWord.textContent = this.multiFindMode
        ? this.multiFoundWords.join(' · ')
        : (this.currentWord?.word || '');
      this.els.resultsTime.textContent = formatTime(elapsed);
      this.els.resultsGuesses.textContent = String(this.guessCount);
      if (this.els.resultsStreak) {
        this.els.resultsStreak.textContent = `${this.streak} 🔥`;
      }
      if (this.isDaily) {
        this.els.resultsBest.textContent = `Daily Day ${MD.getDayNumber()} · 내일 자정(KST)에 새 단어`;
      } else {
        this.els.resultsBest.textContent = this.bestStreak > 0
          ? t('match.bestStreak', { n: this.bestStreak })
          : '';
      }

      if (this.els.resultsDict) {
        this.els.resultsDict.innerHTML = '';
        if (global.DictionaryModal && this.currentWord?.word) {
          const dictBtn = global.DictionaryModal.createButton(t('match.dictionary'));
          dictBtn.addEventListener('click', () => {
            const entry = global.LearningWords?.findWordEntry?.(this.currentWord.word);
            const normalized = global.LearningWords?.getNormalizedWord?.(this.currentWord.word)
              || (entry && global.LearningWordModel?.normalizeLearningWord?.(entry));
            global.DictionaryModal.open(this.currentWord.word, normalized || { word: this.currentWord.word });
          });
          this.els.resultsDict.appendChild(dictBtn);
          global.DictionaryService?.prefetchWord?.(this.currentWord.word);
        }
      }

      this.els.results.classList.remove('hidden');
    }

    continuePlaying() {
      this.els.results.classList.add('hidden');
      if (this.multiFindMode) {
        this.startMultiRound(MMP()?.pickPuzzle?.(this.multiPuzzle?.id));
        return;
      }
      this.startRound(this.drawWord());
    }

    spawnConfetti() {
      if (prefs()?.shouldReduceMotion?.()) return;
      const colors = ['#FFB8D0', '#A8D4F5', '#FFD0A8', '#CFC0F5', '#98DDB8', '#FFEAA0'];
      for (let i = 0; i < 36; i++) {
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
  }

  global.KoreanMatchDrag = KoreanMatchDrag;
  global.KoreanMatchGame = KoreanMatchGame;
  global.MatchComponents = { DropZone, JamoTile, SyllableBlock, GameFeedback, KoreanMatchGame };

  if (typeof window !== 'undefined') {
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      KoreanMatchDrag.end();
      KoreanMatchGame.instance?.restoreVisibleTiles?.();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
