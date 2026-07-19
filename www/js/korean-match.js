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
  const isDevModeActive = () => global.DevBuild?.isDevModeActive?.() === true;

  function getDropZoneGuideLabel(zoneType) {
    if (zoneType === 'cho') return t('match.slotGuideConsonant');
    if (zoneType === 'jong') return t('match.slotGuideBatchim');
    return t('match.slotGuideVowel');
  }

  function applyDropZoneGuideLabels(root, options = {}) {
    const scope = root || document;
    const guideSyllableIndex = options.guideSyllableIndex ?? 0;
    scope.querySelectorAll('.drop-zone[data-zone]').forEach((zoneEl) => {
      const guide = zoneEl.querySelector(':scope > .drop-zone-guide');
      if (!guide) return;
      const sylIdx = parseInt(zoneEl.dataset.syllable, 10) || 0;
      const showGuide = sylIdx === guideSyllableIndex;
      guide.style.display = showGuide ? '' : 'none';
      if (showGuide) {
        guide.textContent = getDropZoneGuideLabel(zoneEl.dataset.zone);
      }
    });
  }

  /** Columns used for block sizing; 5–6 syllable words use the 3-column width. */
  function layoutSylColumnCount(syllableCount) {
    const n = Number(syllableCount) || 0;
    return n > 4 ? 3 : Math.max(n, 1);
  }

  /** Jamo dock: keep up to 12 tiles on row 1; wrap the 13th+ to the next row. */
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
      this.guideEl = null;
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
      const guide = document.createElement('span');
      guide.className = 'drop-zone-guide';
      guide.setAttribute('aria-hidden', 'true');
      guide.textContent = getDropZoneGuideLabel(this.zoneType);
      el.appendChild(guide);
      this.guideEl = guide;
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
      this.el.classList.remove('filled', 'correct', 'incorrect', 'drag-over', 'revealing', 'revealing-wrong');
      if (this.hintDisabled) {
        this.el.classList.add('hint-disabled');
      } else {
        this.el.classList.remove('hint-disabled');
      }
      this.el.querySelectorAll('.jamo-tile').forEach((tileEl) => tileEl.remove());
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
  function jamoGlyphInner(char, zoneType) {
    if (zoneType === 'jungV') {
      return `<span class="jamo-glyph-stretch">${char}</span>`;
    }
    return char;
  }

  function jamoTileFaceHtml(char, zoneType) {
    const inner = jamoGlyphInner(char, zoneType);
    return `<span class="jamo-tile-face jamo-tile-front">${inner}</span><span class="jamo-tile-face jamo-tile-back">${inner}</span>`;
  }

  class JamoTile {
    constructor({ id, char, zoneType, syllableIndex, subIndex, targetChar }) {
      this.id = id;
      this.char = char;
      this.zoneType = zoneType;
      this.syllableIndex = syllableIndex;
      this.subIndex = subIndex ?? 0;
      this.targetChar = targetChar ?? char;
      this.inBank = true;
      this.zoneRef = null;
      this.locked = false;
      this.el = this._createElement();
    }

    _createElement() {
      const el = document.createElement('div');
      el.className = 'jamo-tile';
      el.innerHTML = jamoTileFaceHtml(this.char, this.zoneType);
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
      const inner = jamoGlyphInner(char, this.zoneType);
      this.el.querySelector('.jamo-tile-front').innerHTML = inner;
      this.el.querySelector('.jamo-tile-back').innerHTML = inner;
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
    lastX: 0,
    lastY: 0,
    lastMergeTarget: null,
    _finishing: false,

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
      if (game.watchMode || !game.canArrangeTiles()) return;
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
      ghost.innerHTML = `<span class="jamo-ghost-glyphs">${tile.char}</span>`;
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
      this._finishing = false;
      this.lastX = x;
      this.lastY = y;
      this.lastMergeTarget = null;
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
        zone.clear();
        tile.zoneRef = null;
        tile.el.classList.remove('in-zone', 'snap-in');
      } else if (tile.mergeDockRef === 'result') {
        game?.mergeDock?.takeResultTileIfDragging(tile);
      } else if (tile.mergeDockRef === 'slot') {
        const idx = tile.mergeDockSlot;
        if (game?.mergeDock && idx != null) {
          game.mergeDock.slotTileIds[idx] = null;
          game.mergeDock.slotEls[idx].classList.remove('filled');
          game.mergeDock.slotEls[idx].innerHTML = '';
          game.mergeDock.updatePreview?.();
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
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      d.lastMergeTarget = mergeTarget;
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
      if (!d.active || d._finishing) return;
      d._finishing = true;
      const game = KoreanMatchGame.instance;
      let placed = false;
      const tile = d.tile;
      const dropX = Number.isFinite(x) ? x : d.lastX;
      const dropY = Number.isFinite(y) ? y : d.lastY;
      const isVowelTile = tile && (
        tile.isMerged || tile.isBasic
        || tile.zoneType === 'jungH' || tile.zoneType === 'jungV'
      );
      let mergeTarget = isVowelTile ? game?.mergeDock?.findDropTarget(dropX, dropY) : null;
      if (!mergeTarget && d.lastMergeTarget) {
        mergeTarget = d.lastMergeTarget;
      }
      const zone = mergeTarget ? null : d.resolveZoneAtPoint(dropX, dropY, game);

      if (mergeTarget && game?.mergeDock?.tryDrop(tile, mergeTarget)) {
        placed = true;
        game?.updateRotationDockLabel?.();
        game?.onTutorialEvent?.('mergeSlot', { game });
        game?.notifyTurnLiveChange?.();
      } else if (zone && game?.tryPlaceTile(tile, zone)) {
        placed = true;
        game?.mergeDock?.clearMergeSlotRef?.(tile);
      } else if (d.findBankEl(dropX, dropY, game) && tile && !tile.locked) {
        game.returnTileToBank(tile);
        placed = true;
      } else if (d.findRotationDock(dropX, dropY) && game?.rotateTile(d.tile)) {
        if (!d.tile?.mergeDockRef) {
          game.returnTileToBank(d.tile);
        }
        game?.notifyTurnLiveChange?.();
        placed = true;
      }
      if (!placed) {
        d.restoreDraggedTile(game);
      }
      d.end();
    },

    restoreDraggedTile(game) {
      const tile = this.tile;
      const src = this.dragSource;
      if (!tile || !game) {
        game?.returnTileToBank?.(tile);
        return;
      }
      if (
        src?.type === 'merge-result' || src?.type === 'merge-slot'
        || tile.mergeDockRef === 'result' || tile.mergeDockRef === 'slot'
        || (tile.isMerged && game.mergeDock?.resultTileId === tile.id)
      ) {
        game.mergeDock?.restoreTile(tile);
        if (
          tile.mergeDockRef === 'slot'
          || tile.mergeDockRef === 'result'
          || game.mergeDock?.slotTileIds?.includes(tile.id)
          || game.mergeDock?.resultTileId === tile.id
        ) {
          return;
        }
      }
      if (src?.type === 'zone' && src.zone && !src.zone.locked && !src.zone.hintDisabled) {
        if (game.tryPlaceTile(tile, src.zone)) return;
        game.attachTileToZone(tile, src.zone);
        game.updateCheckButton?.();
        game.syncDockTileSize?.();
        game.notifyTurnLiveChange?.();
        if (tile.zoneRef) return;
      }
      game.returnTileToBank(tile);
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
      this._finishing = false;
      this.tile = null;
      this.ghost = null;
      this.pointerId = null;
      this.lastMergeTarget = null;
      document.removeEventListener('pointermove', this._onMove);
      document.removeEventListener('pointerup', this._onUp);
      document.removeEventListener('pointercancel', this._onUp);
      window.removeEventListener('blur', this._onDragAbort);
      document.removeEventListener('visibilitychange', this._onVisibilityAbort);
      this.clearHighlights();
      KoreanMatchGame.instance?.mergeDock?.clearHighlights();
    },
  };

  /** Deterministic RNG so both 1v1 clients build an identical jamo dock. */
  function createSeededRng(seedStr) {
    let h = 2166136261 >>> 0;
    const s = String(seedStr || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6D2B79F5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(list, rng) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ── KoreanMatchGame ── */
  class KoreanMatchGame {
    constructor(rootEl, options = {}) {
      this.root = rootEl;
      this.versus = options.versus === true;
      this.raceControlled = options.raceControlled === true;
      this.turnBased = options.turnBased === true;
      this.sharedSeed = options.sharedSeed || null;
      this.inspectMode = false;
      this.rushMode = false;
      this.fixedWord = options.fixedWord || null;
      this.tutorialMode = options.tutorialMode === true;
      this.tutorialValidator = options.tutorialValidator || null;
      this.onTutorialEvent = options.onTutorialEvent || null;
      this.tutorialStep = null;
      this.tutorialCheckAllowed = false;
      this.onProgress = options.onProgress || null;
      this.onFinished = options.onFinished || null;
      this.onFinished = options.onFinished || null;
      this.onTurnSubmit = options.onTurnSubmit || null;
      this.onTurnLiveChange = options.onTurnLiveChange || null;
      this.isMyTurn = true;
      this.turnPrepMode = false;
      this.watchMode = false;
      this._lastLiveFingerprint = null;
      this._liveBroadcastTimer = null;
      this._suspendLiveBroadcast = false;
      this._removedTileIds = [];
      this._liveActionSeq = 0;
      this._pendingLiveAction = null;
      this._lastOppFlashSeq = 0;
      this._watchRevealPlayedKey = null;
      this._watchRevealBusy = false;
      this._restoringTurnLocks = false;
      this._watchLivePrevSnapshot = null;
      this._watchLiveBank = [];
      this.boardHidden = false;
      this.enabled = true;
      this.isDaily = !this.versus && (options.daily ?? MD?.isDailyModeFromUrl?.() ?? false);
      this.multiFindMode = !this.versus && !this.isDaily && options.multiFind === true;
      this.multiPuzzle = null;
      this.multiFoundWords = [];
      const dailyLength = MD?.DAILY_WORD_LENGTH ?? 2;
      const wordLength = this.isDaily
        ? dailyLength
        : (MatchWords?.normalizeWordLength?.(
          options.wordLength ?? options.mode ?? options.turnMode
        ) ?? 4);
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

      const isJamoSolo = !this.versus && !this.isDaily && !this.tutorialMode && !this.multiFindMode && !this.turnBased;

      const headerBack = this.versus
        ? ''
        : isJamoSolo && global.PauseQuitUI
        ? global.PauseQuitUI.pauseButtonHtml('match-pause-btn')
        : `<a class="back-link" href="index.html" data-i18n="match.back">${t('match.back')}</a>`;

      const headerBadge = this.versus
        ? ''
        : (this.isDaily
          ? `<div class="streak-badge daily-badge" id="match-streak" title="Daily">📅 Day ${dayNum}</div>`
          : `<div class="streak-badge" id="match-streak" title="연속 정답">🔥 0</div>`);

      const learningStreakBar = '';

      const statsRow = this.versus
        ? `<div class="live-stats">
          <span class="live-stat" id="match-timer">0:00</span>
          <span class="live-stat" id="match-guesses">${t('match.guesses', { n: 0 })}</span>
        </div>`
        : this.turnBased
        ? ''
        : `<div class="match-attempts-bar" id="match-attempts-bar" aria-live="polite">
          <span id="match-guesses">${t('match.guesses', { n: 0 })}</span>
          <span id="match-timer" class="match-timer-hidden" aria-hidden="true">0:00</span>
        </div>`;

      const showEnglish = prefs()?.shouldShowEnglish?.() !== false;
      const meaningBtnHtml = showEnglish
        ? `<button type="button" class="match-hint-btn match-hint-btn--icon match-meaning-btn" id="match-meaning-btn" aria-label="${t('match.hints.meaning')}" title="${t('match.hints.meaning')}">
            <img class="match-hint-btn-icon" src="assets/hint-meaning.png" alt="" draggable="false">
          </button>`
        : '';

      const devAnswerBtnHtml = !this.tutorialMode && isDevModeActive()
        ? `<button type="button" class="match-hint-btn match-dev-answer-btn" id="match-dev-answer-btn">
            <span class="app-btn-title" data-i18n="match.dev.showAnswer">${t('match.dev.showAnswer')}</span>
          </button>`
        : '';

      const hintDock = this.versus
        ? ''
        : `<section class="match-hint-dock" aria-label="${t('match.hints.label')}">
          <div class="match-token-counter" id="match-token-counter" aria-live="polite">
            🪙 <span id="match-token-count">${global.HintTokens?.get?.() ?? 5}</span>
          </div>
          <button type="button" class="match-hint-btn match-hint-btn--icon" id="match-orient-hint" aria-label="${t('match.hints.orient')}" title="${t('match.hints.orient')}">
            <img class="match-hint-btn-icon" src="assets/hint-orient.png" alt="" draggable="false">
          </button>
          <button type="button" class="match-hint-btn match-hint-btn--icon" id="match-disable-hint" aria-label="${t('match.hints.disable')}" title="${t('match.hints.disable')}">
            <img class="match-hint-btn-icon" src="assets/hint-disable-empty.png" alt="" draggable="false">
          </button>
          ${meaningBtnHtml}
          ${devAnswerBtnHtml}
        </section>`;

      const versusMeaningBtn = this.versus && !this.turnBased ? meaningBtnHtml : '';
      const versusDevAnswerBtn = this.versus && !this.tutorialMode && isDevModeActive() ? devAnswerBtnHtml : '';

      const bankToolsEmote = this.versus
        ? `<div class="match-emote-row">
            <div class="match-emote-mount" id="match-emote-mount"></div>
            <div class="match-emote-self" id="match-emote-self" aria-live="polite"></div>
          </div>`
        : '';

      const bankToolsCore = `
              <button type="button" class="rotation-dock" id="rotation-dock" aria-label="${t('match.rotationLabel')}" title="${t('match.rotationHint')}">
                <span class="rotation-dock-icon" aria-hidden="true">↻</span>
                <span class="rotation-dock-label" data-i18n="match.rotationLabel">${t('match.rotationLabel')}</span>
              </button>
              <div class="vowel-merge-dock" id="vowel-merge-dock" aria-label="Vowel merge"></div>`;

      const bankToolsHtml = `
            ${this.versus ? `<div class="bank-tools-emote">${bankToolsEmote}</div>` : ''}
            <div class="bank-tools-core">
              ${bankToolsCore}
            </div>`;

      const bankSectionHtml = this.turnBased
        ? `<section class="bank-section bank-section--turn" aria-label="Jamo tiles">
          <div class="race-turn-bottom${this.versus ? ' race-turn-bottom--versus' : ''}">
            <div class="bank-tools">
              ${bankToolsHtml}
            </div>
            <div class="race-turn-dock-stack">
              <div id="race-turn-bar-mount" class="race-turn-bar-mount" aria-live="polite"></div>
              <div class="jamo-bank jamo-bank--turn" id="match-bank"></div>
            </div>
          </div>
        </section>`
        : `<section class="bank-section" aria-label="Jamo tiles">
          <p class="section-label" data-i18n="match.jamoLabel">${t('match.jamoLabel')}</p>
          <div class="bank-row${this.versus ? ' bank-row--versus' : ''}">
            <div class="bank-tools">
              ${bankToolsHtml}
            </div>
            <div class="jamo-bank" id="match-bank"></div>
          </div>
        </section>`;

      const comboStatsGroup = (this.isDaily || this.versus)
        ? ''
        : `<div class="results-stats-group results-stats-group--combo">
            <dl class="results-stats">
              <div class="results-stat-row"><dt data-i18n="match.comboLabel">${t('match.comboLabel')}</dt><dd id="results-streak"></dd></div>
            </dl>
            <p class="results-best" id="results-best"></p>
          </div>`;

      const dailyBestLine = (this.isDaily || this.versus)
        ? `<p class="results-best" id="results-best"></p>`
        : '';

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
        : `<div class="results-overlay results-overlay--clear hidden" id="match-results" role="dialog" aria-modal="true">
          <div class="results-card">
            <h2 id="results-title" data-i18n="${this.isDaily ? 'match.resultsDaily' : 'match.resultsTitle'}">${t(this.isDaily ? 'match.resultsDaily' : 'match.resultsTitle')}</h2>
            <div class="results-word-banner">
              <p class="results-word" id="results-word"></p>
            </div>
            <p class="results-word-meaning" id="results-word-meaning" aria-live="polite"></p>
            <div class="results-stats-panel">
              <div class="results-stats-group">
                <dl class="results-stats">
                  <div class="results-stat-row"><dt data-i18n="match.time">${t('match.time')}</dt><dd id="results-time"></dd></div>
                  <div class="results-stat-row"><dt data-i18n="match.attemptsLabel">${t('match.attemptsLabel')}</dt><dd id="results-guesses"></dd></div>
                </dl>
              </div>
              ${comboStatsGroup}
              ${dailyBestLine}
            </div>
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
        ${statsRow}
        <section class="hint-area" id="match-hint" aria-label="Word hint"></section>
        <p class="hint-meaning hidden" id="match-meaning" aria-live="polite"></p>
        <section class="blocks-area opp-submission-area hidden" id="match-opp-area" aria-live="polite">
          <p class="section-label" id="match-opp-label"></p>
          <div class="syllable-blocks-row" id="match-opp-blocks"></div>
          <p class="opp-reveal-stat" id="match-opp-stat"></p>
        </section>
        <section class="blocks-area match-play-surface" aria-label="Syllable blocks">
          <p class="section-label" data-i18n="match.buildLabel">${t('match.buildLabel')}</p>
          <div id="watch-reveal-banner" class="watch-reveal-banner hidden" aria-live="polite"></div>
          <div class="syllable-blocks-row" id="match-blocks"></div>
          ${this.turnBased ? `<div id="turn-answer-banner" class="turn-answer-banner hidden" aria-live="polite">
            <p class="turn-answer-word" id="turn-answer-word"></p>
            <p class="turn-answer-meaning hidden" id="turn-answer-meaning"></p>
          </div>` : ''}
        </section>
        <div class="game-feedback empty" id="match-feedback" role="status">&nbsp;</div>
        ${bankSectionHtml}
        <footer class="match-footer" aria-label="Game controls">
        ${hintDock}
        ${versusMeaningBtn}
        ${versusDevAnswerBtn}
        <div class="match-actions">
          <button type="button" class="btn btn-reset match-action-btn" id="match-reset" data-i18n="match.reset">
            <span class="match-action-btn__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
            </span>
            <span class="match-action-btn__label">${t('match.reset')}</span>
          </button>
          <button type="button" class="btn btn-check match-action-btn match-action-btn--primary" id="match-check" disabled data-i18n="match.check">
            <span class="match-action-btn__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            </span>
            <span class="match-action-btn__label">${t('match.check')}</span>
          </button>
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
        watchRevealBanner: this.root.querySelector('#watch-reveal-banner'),
        turnAnswerBanner: this.root.querySelector('#turn-answer-banner'),
        turnAnswerWord: this.root.querySelector('#turn-answer-word'),
        turnAnswerMeaning: this.root.querySelector('#turn-answer-meaning'),
        bank: this.root.querySelector('#match-bank'),
        feedback: this.root.querySelector('#match-feedback'),
        reset: this.root.querySelector('#match-reset'),
        check: this.root.querySelector('#match-check'),
        results: this.root.querySelector('#match-results'),
        resultsWord: this.root.querySelector('#results-word'),
        resultsWordMeaning: this.root.querySelector('#results-word-meaning'),
        resultsTime: this.root.querySelector('#results-time'),
        resultsGuesses: this.root.querySelector('#results-guesses'),
        resultsStreak: this.root.querySelector('#results-streak'),
        resultsBest: this.root.querySelector('#results-best'),
        continue: this.root.querySelector('#match-continue'),
        leave: this.root.querySelector('#match-leave'),
        pauseBtn: this.root.querySelector('#match-pause-btn'),
        streak: this.root.querySelector('#match-streak'),
        streakHeadline: this.root.querySelector('#match-streak-headline'),
        streakProgress: this.root.querySelector('#match-streak-progress'),
        timer: this.root.querySelector('#match-timer'),
        guesses: this.root.querySelector('#match-guesses'),
        subtitle: this.root.querySelector('.title-block p'),
        rotationDock: this.root.querySelector('#rotation-dock'),
        emoteMount: this.root.querySelector('#match-emote-mount'),
        emoteSelf: this.root.querySelector('#match-emote-self'),
        mergeDockEl: this.root.querySelector('#vowel-merge-dock'),
        tokenCount: this.root.querySelector('#match-token-count'),
        orientHint: this.root.querySelector('#match-orient-hint'),
        disableHint: this.root.querySelector('#match-disable-hint'),
        meaningBtn: this.root.querySelector('#match-meaning-btn'),
        devAnswerBtn: this.root.querySelector('#match-dev-answer-btn'),
      };

      this.orientHintUsed = false;
      this.disableHintUsed = false;
      this.meaningRevealed = false;
      this.meaningText = '';
      this._meaningPromise = null;
      this._meaningWord = '';
      this.hintsUsedThisRound = false;

      this.feedback = new GameFeedback(this.root.querySelector('#match-feedback'));
      if (this.turnBased) this.feedback.suppressed = true;

      this.mergeDock = new global.VowelMergeDock(this.els.mergeDockEl, {
        getTile: (id) => this.tileMap[id],
        returnTileToBank: (tile) => this.returnTileToBank(tile),
        detachZoneTile: (tile) => this.detachZoneTile(tile),
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

      this.mergeDock.resultEl?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('.jamo-tile')) return;
        this.onMergeTargetTap({ type: 'result' });
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
      this.els.devAnswerBtn?.addEventListener('click', () => this.devRevealAnswer());
      this.els.continue?.addEventListener('click', () => this.continuePlaying());
      this.els.leave?.addEventListener('click', () => { if (!this.isDaily) this.saveBestOnLeave(); });
      this.els.pauseBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        this.openPauseMenu();
      });
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
        this.startDailyFresh();
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
        applyDropZoneGuideLabels(this.root);
        global.I18n.onChange(() => {
          global.I18n.applyToDocument(this.root);
          applyDropZoneGuideLabels(this.root);
          this.updateLearningStreakDisplay();
          if (this.multiFindMode && this.multiPuzzle) this.renderMultiHint(this.multiPuzzle);
          else if (this.currentWord) this.renderHint(this.currentWord);
        });
      }
      if (prefs()?.onChange) {
        prefs().onChange(() => this.applyMeaningPreference());
      }
      this.applyMeaningPreference();

      if (!this._dockResizeBound) {
        this._dockResizeBound = true;
        this._onDockResize = () => this.syncDockTileSize();
        window.addEventListener('resize', this._onDockResize);
      }
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

      const prefetched = this.multiDictionaryEntries?.[q]
        || (q === this.discoveredWord ? this.discoveredDictionaryEntry : null);
      const dictMeaning = await global.DictionaryService?.resolveEnglishMeaning?.(q, prefetched);
      if (dictMeaning) return dictMeaning;

      const glossary = global.MatchWordMeanings?.[q]
        || global.LearningWords?.getWordMeaning?.(q);
      if (glossary) return glossary;

      const entry = global.LearningWords?.findWordEntry?.(q);
      if (entry) {
        const normalized = global.LearningWords?.getNormalizedWord?.(q)
          || global.LearningWordModel?.normalizeLearningWord?.(entry);
        const curated = global.LearningWordModel?.getDisplayMeaning?.(normalized);
        if (curated) return curated;
      }
      return '';
    }

    prefetchMeaning(word) {
      const q = String(word || '').trim();
      this._meaningWord = q;
      this._meaningPromise = this.resolveWordMeaning(q);
      global.DictionaryService?.prefetchWord?.(q);
    }

    async getMeaningForWord(word) {
      const q = String(word || '').trim();
      if (!q) return '';
      if (this._meaningWord === q && this._meaningPromise) {
        return this._meaningPromise;
      }
      return this.resolveWordMeaning(q);
    }

    updateMeaningDisplay() {
      const el = this.els.meaning;
      if (!el) return;
      const gameFinished = this.checkedComplete || this.inspectMode;
      const show = prefs()?.shouldShowEnglish?.() !== false && this.meaningRevealed && gameFinished;
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
      const text = await this.getMeaningForWord(word);
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

    isJamoSoloMode() {
      return !this.versus && !this.isDaily && !this.tutorialMode && !this.multiFindMode && !this.turnBased;
    }

    openPauseMenu() {
      if (!this.isJamoSoloMode() || !global.PauseQuitUI) return;
      global.PauseQuitUI.show({
        mode: 'jamo',
        streak: this.streak,
        onResume: () => {},
        onQuit: () => {
          this.streak = 0;
          this.saveBestOnLeave();
          global.location.href = 'index.html';
        },
      });
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
                tileId: tile.id,
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
        winningWord: this.winningWord || this.getResolvedWord(),
      };
    }

    saveDailyProgress(over, won) {
      if (!this.isDaily || !MD) return;
      MD.saveDailyProgress(this.serializeDailyState(over, won), MD.getActiveDateKey());
    }

    startDailyFresh() {
      if (!this.isDaily || !MD) return;
      this.els.results?.classList.add('hidden');
      const activeDate = MD.getActiveDateKey();
      const dailyLength = MD.DAILY_WORD_LENGTH ?? 2;
      const dailyList = MatchWords?.getWordsForLength?.(dailyLength) || MATCH_WORDS;
      const word = MD.pickDailyMatchWord(dailyList.length ? dailyList : MATCH_WORDS, activeDate);
      this.startRound({ word }, null);
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
      this._meaningWord = '';
      this.hintsUsedThisRound = false;
      this.blocks = [];
      this.tileMap = {};
      this.selectedTile = null;
      this.currentWord = wordData;
      this.discoveredWord = null;
      this.discoveredDictionaryEntry = null;
      this.winningWord = '';
      this.multiDictionaryEntries = {};
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

      this.hideTurnAnswerBanner();
      this.prefetchMeaning(word);

      this.renderHint(wordData);
      this.updateMeaningDisplay();
      this.renderBlocks();
      this.renderBank();
      this.mergeDock?.reset();
      this.updateRotationDockLabel();

      if (saved?.locked?.length) {
        this.restoreDailyLocked(saved.locked);
      }

      if (saved?.winningWord) {
        this.winningWord = saved.winningWord;
        if (saved.winningWord !== word) {
          this.discoveredWord = saved.winningWord;
        }
      }

      if (!this.isDaily && saved?.over && saved?.won) {
        this.checkedComplete = true;
        this.els.check.disabled = true;
        this.els.reset.disabled = true;
        this.updateHintButtons();
        this.stopTimer();
        this.revealHintWordSync(this.winningWord || word);
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
      this.multiDictionaryEntries = {};
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

    /** True when every jamo tile has left the dock (bank). */
    hasAllDockTilesOnBoard() {
      const tiles = Object.values(this.tileMap);
      if (!tiles.length) return false;
      return tiles.every((tile) => !tile.inBank);
    }

    hasAllMultiTilesPlaced() {
      return this.hasAllDockTilesOnBoard();
    }

    getLocalWordFallback(word) {
      if (this.multiFindMode) {
        return !!this.multiPuzzle?.validWords?.includes(word);
      }
      return word === (this.currentWord?.word || '');
    }

    matchesDictionaryEntry(result, word) {
      return global.DictionaryService?.matchesExactEntry?.(result, word) || false;
    }

    /** Compose the full word when every syllable block is complete on the board. */
    getSubmittedBoardWord() {
      if (!this.blocks.length) return null;
      const word = this.composeWordFromBlocks();
      if (!word) return null;
      const syllables = [...word].filter(HC.isHangulSyllable);
      if (syllables.length !== this.blocks.length) return null;
      return word;
    }

    /** Dictionary alternate answers when every dock tile is on the board (solo + 1v1). */
    shouldUseDictionaryCheck() {
      if (this.tutorialMode || this.isDaily || this.multiFindMode) return false;
      return this.hasAllDockTilesOnBoard();
    }

    async isDictionaryAcceptedWord(word) {
      const trimmed = String(word || '').trim();
      if (!trimmed) return { valid: false, offline: false };

      const DS = global.DictionaryService;
      if (!DS?.validateWord) return { valid: false, offline: true };

      try {
        const result = await DS.validateWord(trimmed);
        const valid = !!(result?.valid || DS.matchesExactEntry?.(result, trimmed));
        const offline = !!(result?.offline || result?.error || result?.code === 'CONFIG');
        return { valid, offline: offline && !valid, entry: valid ? (result.entry || null) : null };
      } catch {
        return { valid: false, offline: true };
      }
    }

    composeWordFromBlocks() {
      if (!this.blocks.length) return null;
      const parts = this.blocks.map((block, i) => this.composeSyllableFromBlock(block, i));
      if (parts.some((part) => !part)) return null;
      return parts.join('');
    }

    captureWinningWord() {
      if (this.multiFindMode) {
        this.winningWord = this.multiFoundWords.join(' · ');
        return this.winningWord;
      }
      const submitted = this.getSubmittedBoardWord();
      this.winningWord = this.discoveredWord || submitted || this.currentWord?.word || '';
      if (this.winningWord) this.prefetchMeaning(this.winningWord);
      return this.winningWord;
    }

    getResolvedWord() {
      if (this.winningWord) return this.winningWord;
      if (this.discoveredWord) return this.discoveredWord;
      const submitted = this.getSubmittedBoardWord();
      if (submitted) return submitted;
      return this.currentWord?.word || '';
    }

    async isMultiFindWordAccepted(word) {
      return this.isDictionaryAcceptedWord(word);
    }

    async checkMultiWordAnswer() {
      if (!this.multiFindMode || !this.multiPuzzle) return;
      if (!this.hasAllMultiTilesPlaced() || this.checking || this.checkedComplete) return;

      const composed = this.composeSyllableFromBlock(this.blocks[0]);
      if (!composed) {
        this.feedback.show('error', t('match.multiFind.notValid'));
        return;
      }
      if (this.multiFoundWords.includes(composed)) {
        this.feedback.show('info', t('match.multiFind.alreadyFound'));
        return;
      }

      this.checking = true;
      this.updateCheckButton();
      this.feedback.show('info', t('match.multiFind.checking'));

      const accepted = await this.isDictionaryAcceptedWord(composed);
      if (!accepted.valid) {
        this.checking = false;
        this.updateCheckButton();
        this.feedback.show('error', accepted.offline
          ? t('match.feedbackDictionaryOffline')
          : t('match.multiFind.notValid'));
        return;
      }
      if (accepted.entry) {
        this.multiDictionaryEntries[composed] = accepted.entry;
      }
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
          global.XpService.awardAndCelebrate({
            mode: 'koreanMatch',
            wordId: this.multiFoundWords.join(''),
            won: true,
            guessCount: this.guessCount,
          });
        }
        this.feedback.show('success', t('match.multiFind.win'));
        if (streakResult?.newMilestone) {
          setTimeout(() => {
            this.feedback.show('success', `${streakResult.newMilestone.badge} ${streakResult.newMilestone.message}`);
          }, 1200);
        }
        this.captureWinningWord();
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
      if (!this.versus) {
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
      applyDropZoneGuideLabels(this.els.blocks);
    }

    syncBlocksRowSylCount(rowEl) {
      if (!rowEl) return;
      const n = this.syllables?.length || this.blocks.length || 0;
      const layoutCols = layoutSylColumnCount(n);
      rowEl.dataset.sylCount = String(n);
      rowEl.style.setProperty('--syl-count', String(layoutCols));
      this.root?.style?.setProperty('--syl-count', String(layoutCols));
    }

    renderBank() {
      this.els.bank.innerHTML = '';
      this._removedTileIds = [];
      let tileCounter = 0;
      const rng = this.sharedSeed ? createSeededRng(this.sharedSeed) : null;
      const defs = rng
        ? seededShuffle(HC.buildTilesFromWord(this.syllables), rng)
        : HC.shuffle(HC.buildTilesFromWord(this.syllables));
      defs.forEach((def) => {
        const tile = new JamoTile({ ...def, id: `tile-${tileCounter++}`, targetChar: def.char });
        this.tileMap[tile.id] = tile;
        if (this.shuffleRotations) this.applyRandomTileRotation(tile, rng);
        this.els.bank.appendChild(tile.el);
      });
      this.syncDockTileSize();
    }

    /** Deterministic replacement for HC.randomRotateJamo when a shared rng is used. */
    seededRotateJamo(char, rng) {
      const cycle = [];
      let cur = HC.rotateJamo(char);
      while (cur && cur !== char && cycle.length < 6) {
        cycle.push(cur);
        cur = HC.rotateJamo(cur);
      }
      if (!cycle.length) return char;
      return cycle[Math.floor(rng() * cycle.length)];
    }

    syncDockTileSize() {
      const bank = this.els.bank;
      if (!bank || (this.versus && !this.turnBased)) return;

      const tiles = bank.querySelectorAll('.jamo-tile:not(.in-zone):not(.hidden-in-bank)');
      const n = tiles.length;
      bank.dataset.tileCount = String(n);

      const rootTile = parseFloat(getComputedStyle(this.root).getPropertyValue('--tile-size'));
      const tileSize = Number.isFinite(rootTile) && rootTile > 0 ? rootTile : 46;

      if (!n) {
        bank.style.removeProperty('--dock-tile-size');
        bank.style.removeProperty('--turn-dock-tile-size');
        bank.style.removeProperty('min-height');
        bank.style.removeProperty('max-height');
        bank.classList.remove('jamo-bank--wrap12');
        bank.removeAttribute('data-dock-fitted');
        return;
      }

      const bankStyle = getComputedStyle(bank);
      const gap = parseFloat(bankStyle.gap) || 6;
      const padX = (parseFloat(bankStyle.paddingLeft) || 0) + (parseFloat(bankStyle.paddingRight) || 0);
      const padY = (parseFloat(bankStyle.paddingTop) || 0) + (parseFloat(bankStyle.paddingBottom) || 0);

      let innerW = bank.clientWidth - padX;
      if (innerW < tileSize && this.turnBased) {
        const dockStack = bank.closest('.race-turn-dock-stack');
        if (dockStack?.clientWidth > 0) innerW = dockStack.clientWidth - padX;
      }
      innerW = Math.max(innerW, tileSize);

      const cols = Math.max(1, Math.floor((innerW + gap) / (tileSize + gap)));
      const rows = Math.ceil(n / cols);
      bank.classList.toggle('jamo-bank--wrap12', rows > 1);

      bank.style.setProperty('--dock-tile-size', `${tileSize}px`);
      bank.style.setProperty('--turn-dock-tile-size', `${tileSize}px`);

      const fittedH = rows * tileSize + gap * Math.max(rows - 1, 0) + padY;
      bank.style.minHeight = `${Math.ceil(fittedH)}px`;
      bank.style.maxHeight = 'none';
      bank.style.overflowX = 'hidden';
      bank.style.overflowY = 'visible';
      bank.dataset.dockFitted = 'true';
    }

    getVowelSlotSyllableIndex(tile) {
      if (tile.zoneRef
        && (tile.zoneRef.zoneType === 'jungH' || tile.zoneRef.zoneType === 'jungV')) {
        return tile.zoneRef.syllableIndex;
      }
      return tile.syllableIndex;
    }

    findZone(zoneType, syllableIndex = 0, subIndex = 0) {
      const block = this.blocks[syllableIndex];
      if (!block) return null;
      return block.getAllZones().find(
        (z) => z.zoneType === zoneType && (z.subIndex ?? 0) === (subIndex ?? 0)
      ) || null;
    }

    findVowelTargetZone(syllableIndex, zoneType, preferredSubIndex = 0) {
      if (zoneType === 'jungH') {
        return this.findZone('jungH', syllableIndex, 0);
      }
      const preferred = this.findZone('jungV', syllableIndex, preferredSubIndex);
      if (preferred && !preferred.placedTileId) return preferred;
      const block = this.blocks[syllableIndex];
      if (!block) return preferred;
      return block.getAllZones().find(
        (z) => z.zoneType === 'jungV' && !z.placedTileId
      ) || preferred;
    }

    isOtherVowelSlotOccupied(tile) {
      if (!tile.zoneRef) return false;
      const block = this.blocks[this.getVowelSlotSyllableIndex(tile)];
      if (!block) return false;
      const myZone = tile.zoneRef.zoneType;
      return block.getAllZones().some((z) => (
        z.placedTileId
        && z.placedTileId !== tile.id
        && ((myZone === 'jungH' && z.zoneType === 'jungV')
          || (myZone === 'jungV' && z.zoneType === 'jungH'))
      ));
    }

    syncSyllableVowelLayout(block) {
      if (!block?.el) return;
      const zones = block.getAllZones();
      const hasH = zones.some((z) => z.zoneType === 'jungH' && z.placedTileId);
      const hasV = zones.some((z) => z.zoneType === 'jungV' && z.placedTileId);
      block.el.classList.remove('vowel-layout-stack', 'vowel-layout-side', 'vowel-layout-compound');
      if (hasH && hasV) block.el.classList.add('vowel-layout-compound');
      else if (hasH) block.el.classList.add('vowel-layout-stack');
      else if (hasV) block.el.classList.add('vowel-layout-side');
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
          targetChar: def.targetChar ?? def.char,
          id: `tile-${tileCounter++}`,
        });
        if (def.startChar) {
          tile.zoneType = HC.zoneTypeForRotatedJamo(def.startChar, tile.zoneType);
          tile.setChar(def.startChar);
        }
        this.tileMap[tile.id] = tile;
        this.els.bank.appendChild(tile.el);
      });
      this.syncDockTileSize();
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
          targetChar: p.char,
          id: `pre-${p.zoneType}-${p.syllableIndex ?? 0}`,
        });
        this.tileMap[tile.id] = tile;
        this.attachTileToZone(tile, zone);
        if (p.locked) {
          this.markPlacementLocked(zone, tile);
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
      this.els.check?.classList.remove('hidden');
      this.tutorialCheckAllowed = false;
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

    applyRandomTileRotation(tile, rng) {
      if (!HC.canRotateJamo(tile.char)) return;
      const expected = tile.targetChar;
      if (!expected) return;
      const next = rng
        ? this.seededRotateJamo(tile.char, rng)
        : HC.randomRotateJamo(tile.char, true);
      if (next === tile.char) return;
      tile.zoneType = HC.zoneTypeForRotatedJamo(next, tile.zoneType);
      tile.setChar(next);
    }

    getExpectedForTile(tile) {
      if (tile.targetChar) return tile.targetChar;
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
      global.SoundEffects?.select?.();
      this.updateRotationDockLabel();
      this.updateSelectionHighlights();
      this.pulseLiveAction('select');
      this.notifyTurnLiveChange();
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

    canSplitMergedInBank(tile) {
      if (!tile?.isMerged || tile.locked || !tile.inBank || tile.mergeDockRef) return false;
      if (!HC.isVerticalMergeMedial(tile.char)) return false;
      if (this.mergeDock?.hasResult?.() || this.mergeDock?.hasSlotTiles?.()) return false;
      return true;
    }

    canRotateTile(tile) {
      if (!tile || tile.locked) return false;
      if (tile.mergeDockRef === 'slot') {
        return HC.canRotateJamoInMergeSlot?.(tile.char) === true;
      }
      if (tile.mergeDockRef) return false;
      const inVowelSlot = !!(tile.zoneRef
        && (tile.zoneRef.zoneType === 'jungH' || tile.zoneRef.zoneType === 'jungV'));
      if (inVowelSlot) {
        return HC.canRotateJamoForZone(tile.char, tile.zoneRef.zoneType, {
          inVowelSlot: true,
          otherSlotOccupied: this.isOtherVowelSlotOccupied(tile),
        });
      }
      return HC.canRotateJamo(tile.char);
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

      const dockMode = this.getRotationDockMode();
      if ((dockMode === 'split' || this.canRotateTile(tile))
          && !this.els.rotationDock?.classList.contains('disabled')) {
        this.els.rotationDock?.classList.add('tap-target');
      }

      if (tile.mergeDockRef === 'result' || this.canSplitMergedInBank(tile)) {
        this.els.bank?.classList.add('tap-target');
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
      this.els.bank?.classList.remove('tap-target');
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
        this.mergeDock?.updatePreview?.();
        this.onTutorialEvent?.('mergeSlot', { game: this });
        this.pulseLiveAction('move');
        this.notifyTurnLiveChange();
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
      this.pulseLiveAction('move');
      this.notifyTurnLiveChange();
    }

    detachZoneTile(tile) {
      if (!tile?.zoneRef) return;
      tile.zoneRef.placedTileId = null;
      tile.zoneRef.clear();
      tile.zoneRef = null;
      tile.inBank = false;
      tile.el.classList.remove('in-zone');
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
      this.mergeDock?.updatePreview?.();
      this.updateCheckButton();
      this.pulseLiveAction('move');
      this.notifyTurnLiveChange();
      return true;
    }

    /** Returns 'merge' | 'split' | 'rotate' depending on merge dock state. */
    getRotationDockMode() {
      if (!this.mergeDock) return 'rotate';
      if (this.mergeDock.canMerge?.()) return 'merge';
      if (this.mergeDock.canSplit?.()) return 'split';
      if (this.canSplitMergedInBank(this.selectedTile)) return 'split';
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
        if (!this.mergeDock?.canMerge?.()) {
          this.feedback?.show('info', t('match.mergeBlocked'));
          return;
        }
        if (this.tutorialValidator && !this.tutorialValidator('merge', { game: this })) {
          return;
        }
        const ingredientIds = [...(this.mergeDock?.slotTileIds || [null, null])];
        this.mergeDock.tryCompose();
        this.updateRotationDockLabel();
        this.updateCheckButton();
        this.onTutorialEvent?.('merge', { game: this });
        this.pulseLiveAction('merge', { ingredientIds });
        this.notifyTurnLiveChange();
        return;
      }

      if (mode === 'split') {
        if (this.mergeDock?.canSplit?.()) {
          const resultTile = this.mergeDock.getResultTile();
          if (resultTile) {
            const fromResultId = this.mergeDock.resultTileId;
            this.mergeDock.unmergeTile(resultTile);
            this.clearSelection();
            this.updateRotationDockLabel();
            this.updateCheckButton();
            this.syncDockTileSize();
            this.pulseLiveAction('split', { fromResultId });
            this.notifyTurnLiveChange();
          }
          return;
        }
        if (this.canSplitMergedInBank(this.selectedTile)) {
          const fromResultId = this.selectedTile?.id;
          this.mergeDock.unmergeTile(this.selectedTile);
          this.clearSelection();
          this.updateRotationDockLabel();
          this.updateCheckButton();
          this.syncDockTileSize();
          this.pulseLiveAction('split', { fromResultId });
          this.notifyTurnLiveChange();
          return;
        }
        this.feedback?.show('info', t('match.splitBlocked'));
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
        this.notifyTurnLiveChange();
      }
    }

    rotateTile(tile) {
      if (tile.locked || this.checking || this.checkedComplete) return false;

      if (tile.mergeDockRef === 'slot') {
        const rotation = HC.rotateJamoInMergeSlot?.(tile.char);
        if (!rotation || rotation.char === tile.char) return false;
        const prev = tile.char;
        const next = rotation.char;
        if (this.tutorialValidator && !this.tutorialValidator('rotate', { tile, prev, next, game: this })) {
          return false;
        }
        tile.setChar(next);
        tile.zoneType = 'jungV';
        this.bounceTile(tile.el);
        if (!this.tutorialMode) {
          this.feedback.show('info', t('match.rotateSuccess', { from: prev, to: next }));
        }
        this.updateRotationDockLabel();
        this.mergeDock?.updatePreview?.();
        this.updateCheckButton();
        this.onTutorialEvent?.('rotate', { tile, prev, next, game: this });
        global.SoundEffects?.rotate?.();
        this.pulseLiveAction('rotate', { tileId: tile.id, at: this.serializeTileLiveRef(tile) });
        return true;
      }

      if (tile.mergeDockRef) return false;
      const prev = tile.char;
      const inVowelSlot = !!(tile.zoneRef
        && (tile.zoneRef.zoneType === 'jungH' || tile.zoneRef.zoneType === 'jungV'));
      const prevZone = tile.zoneRef;
      const sourceSyllableIndex = inVowelSlot
        ? prevZone.syllableIndex
        : tile.syllableIndex;
      const slotZoneType = inVowelSlot ? prevZone.zoneType : tile.zoneType;
      const rotation = HC.rotateJamoForZone(prev, slotZoneType, {
        inVowelSlot,
        otherSlotOccupied: inVowelSlot ? this.isOtherVowelSlotOccupied(tile) : false,
      });
      if (!rotation || rotation.char === prev) return false;
      const next = rotation.char;
      if (this.tutorialValidator && !this.tutorialValidator('rotate', { tile, prev, next, game: this })) {
        return false;
      }

      tile.setChar(next);
      tile.zoneType = rotation.zoneType;
      if (rotation.zoneType === 'jungH') {
        tile.subIndex = 0;
      }

      if (inVowelSlot && prevZone && rotation.zoneType !== prevZone.zoneType) {
        const targetZone = this.findVowelTargetZone(
          sourceSyllableIndex,
          rotation.zoneType,
          rotation.zoneType === 'jungV' ? (tile.subIndex ?? 0) : 0
        );
        if (!targetZone
          || targetZone.syllableIndex !== sourceSyllableIndex
          || (targetZone.placedTileId && targetZone.placedTileId !== tile.id)) {
          tile.setChar(prev);
          tile.zoneType = prevZone.zoneType;
          return false;
        }
        prevZone.clear();
        tile.zoneRef = null;
        this.attachTileToZone(tile, targetZone);
        tile.syllableIndex = sourceSyllableIndex;
        if (rotation.zoneType === 'jungV') {
          tile.subIndex = targetZone.subIndex ?? 0;
        }
        this.syncSyllableVowelLayout(this.blocks[sourceSyllableIndex]);
      } else if (inVowelSlot) {
        tile.syllableIndex = sourceSyllableIndex;
        this.syncSyllableVowelLayout(this.blocks[sourceSyllableIndex]);
      }

      this.bounceTile(tile.el);
      if (!this.tutorialMode) {
        this.feedback.show('info', t('match.rotateSuccess', { from: prev, to: next }));
      }
      this.updateCheckButton();
      this.onTutorialEvent?.('rotate', { tile, prev, next, game: this });
      global.SoundEffects?.rotate?.();
      this.pulseLiveAction('rotate', { tileId: tile.id, at: this.serializeTileLiveRef(tile) });
      return true;
    }

    updateHintButtons() {
      const blocked = this.checkedComplete || this.checking;
      const HT = global.HintTokens;
      const unlimited = HT?.hasDevUnlimited?.() === true;
      const tokens = HT?.get?.() ?? 0;
      if (this.els.tokenCount && HT) {
        this.els.tokenCount.textContent = unlimited ? '∞' : String(tokens);
      }
      if (this.els.orientHint) {
        this.els.orientHint.disabled = blocked || this.orientHintUsed || (!unlimited && tokens < 2);
      }
      if (this.els.disableHint) {
        this.els.disableHint.disabled = blocked || this.disableHintUsed || (!unlimited && tokens < 2);
      }
      if (this.els.meaningBtn) {
        const needsTokens = !this.versus;
        this.els.meaningBtn.disabled = blocked || this.meaningRevealed
          || (needsTokens && !unlimited && tokens < 2);
      }
      if (this.els.devAnswerBtn) {
        this.els.devAnswerBtn.disabled = blocked || this.multiFindMode || !this.currentWord?.word;
      }
    }

    findDevTileForZone(zone, { inBankOnly = false } = {}) {
      const expected = zone.expected;
      if (!expected) return null;
      let candidates = Object.values(this.tileMap).filter((tile) => !tile.locked);
      if (inBankOnly) candidates = candidates.filter((tile) => tile.inBank);
      const canUse = (tile) => {
        const probe = {
          char: expected,
          zoneType: zone.zoneType,
          subIndex: zone.subIndex ?? 0,
          syllableIndex: zone.syllableIndex,
          isMerged: zone.zoneType === 'jungV'
            && (HC.isComposedMedial(expected) || HC.isVerticalMergeMedial(expected)),
        };
        return HC.isValidMatchPlacement({ ...tile, ...probe }, zone);
      };
      const pick = (list) => list.find(canUse) || null;
      return pick(candidates.filter((tile) => tile.char === expected))
        || pick(candidates.filter((tile) => tile.inBank))
        || pick(candidates)
        || null;
    }

    prepareDevTileForZone(tile, zone) {
      const expected = zone.expected;
      if (!expected || !tile) return tile;
      tile.setChar(expected);
      tile.zoneType = zone.zoneType;
      tile.subIndex = zone.subIndex ?? 0;
      tile.syllableIndex = zone.syllableIndex;
      if (zone.zoneType === 'jungV'
        && (HC.isComposedMedial(expected) || HC.isVerticalMergeMedial(expected))) {
        tile.isMerged = true;
      } else {
        tile.isMerged = false;
      }
      return tile;
    }

    placeDevAnswerTile(zone, { inBankOnly = false } = {}) {
      if (zone.locked || zone.expected === null || this.isZoneCorrect(zone)) return false;
      if (zone.placedTileId) {
        const existing = this.tileMap[zone.placedTileId];
        if (existing && !existing.locked) this.returnTileToBank(existing);
        else zone.clear();
      }
      const tile = this.findDevTileForZone(zone, { inBankOnly });
      if (!tile) return false;
      this.prepareDevTileForZone(tile, zone);
      if (tile.mergeDockRef) {
        this.returnTileToBank(tile);
        this.prepareDevTileForZone(tile, zone);
      }
      return this.tryPlaceTile(tile, zone);
    }

    async devRevealAnswer() {
      if (!isDevModeActive() || this.tutorialMode || this.multiFindMode) return;
      if (this.checkedComplete || this.checking || this.turnSubmitting) return;
      const word = this.currentWord?.word;
      if (!word) return;

      if (this.versus && this.els.hint?.querySelector('.hint-letter')) {
        await this.revealHintWord(word);
      } else if (this.els.hint) {
        this.els.hint.classList.remove('hidden');
        this.els.hint.innerHTML = `
          <p class="hint-prompt dev-answer-reveal">${escapeHtml(t('match.dev.answer', { word }))}</p>
        `;
      }

      this.clearUnlockedPlacements();

      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          if (this.placeDevAnswerTile(zone, { inBankOnly: true })) {
            this.syncSyllableVowelLayout(this.blocks[zone.syllableIndex]);
          }
        });
      });

      this.clearSelection();
      this.updateRotationDockLabel();
      this.updateCheckButton();
      this.feedback.show('info', t('match.dev.answer', { word }));
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
        if (tile.locked || tile.isMerged) return;
        const expected = this.getExpectedForTile(tile);
        if (!expected) return;
        const inVowelSlot = !!(tile.zoneRef
          && (tile.zoneRef.zoneType === 'jungH' || tile.zoneRef.zoneType === 'jungV'));
        const oriented = HC.orientTileJamo(tile.char, tile.zoneType, expected, {
          inMergeSlot: tile.mergeDockRef === 'slot',
          inVowelSlot,
          otherSlotOccupied: inVowelSlot ? this.isOtherVowelSlotOccupied(tile) : false,
        });
        if (!oriented || oriented.char === tile.char) return;
        tile.zoneType = oriented.zoneType;
        tile.setChar(oriented.char);
        this.bounceTile(tile.el);
        count += 1;
      });

      this.orientHintUsed = true;
      this.hintsUsedThisRound = true;
      if (count > 0) this.mergeDock?.updatePreview?.();
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
        tile.zoneRef.clear();
      }
      this.attachTileToZone(tile, zone);
      this.bounceTile(tile.el);
      global.SoundEffects?.place?.();
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
        this.mergeDock?.updatePreview?.();
        this.updateRotationDockLabel();
        this.updateCheckButton();
        this.syncDockTileSize();
        this.pulseLiveAction('move');
        this.notifyTurnLiveChange();
        if (this.tutorialMode) this.onTutorialEvent?.('change', { game: this });
        return;
      }
      if (tile.isMerged && this.mergeDock?.resultTileId === tile.id) {
        this.mergeDock.clearResultTileRef(tile);
        tile.mergeDockRef = null;
        tile.setInBank(this.els.bank);
        this.mergeDock?.updatePreview?.();
        this.updateRotationDockLabel();
        this.updateCheckButton();
        this.syncDockTileSize();
        this.pulseLiveAction('move');
        this.notifyTurnLiveChange();
        if (this.tutorialMode) this.onTutorialEvent?.('change', { game: this });
        return;
      }
      if (tile.zoneRef) {
        tile.zoneRef.placedTileId = null;
        tile.zoneRef.clear();
        tile.zoneRef = null;
      }
      tile.setInBank(this.els.bank);
      this.updateCheckButton();
      this.syncDockTileSize();
      this.pulseLiveAction('move');
      this.notifyTurnLiveChange();
      if (this.tutorialMode) this.onTutorialEvent?.('change', { game: this });
    }

    createBasicTile({ char, syllableIndex, zoneType }) {
      const id = `tile-basic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const tile = new JamoTile({ id, char, zoneType, syllableIndex, subIndex: 0, targetChar: char });
      tile.isBasic = true;
      this.tileMap[id] = tile;
      return tile;
    }

    createMergedTile({ char, syllableIndex, mergeSources }) {
      const id = `tile-merged-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const tile = new JamoTile({ id, char, zoneType: 'jungV', syllableIndex, subIndex: 0, targetChar: char });
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
      if (this.turnBased && !this.watchMode) {
        this._removedTileIds = this._removedTileIds || [];
        if (!this._removedTileIds.includes(id)) {
          this._removedTileIds.push(id);
          if (this._removedTileIds.length > 60) this._removedTileIds.shift();
        }
      }
    }

    bounceTile(el) {
      el.classList.remove('bounce');
      void el.offsetWidth;
      el.classList.add('bounce');
    }

    clearSelection() {
      let changed = false;
      if (this.selectedTile) {
        this.selectedTile.setSelected(false);
        this.selectedTile = null;
        changed = true;
      }
      this.clearSelectionHighlights();
      this.updateRotationDockLabel();
      if (changed) this.notifyTurnLiveChange();
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
      if (this.tutorialMode && !this.tutorialCheckAllowed) {
        this.els.check.disabled = true;
        this.els.rotationDock?.classList.toggle('disabled', this.checkedComplete || this.checking);
        this.updateHintButtons();
        return;
      }
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
          this.updateMeaningDisplay();
        }
        this.applySharedLocked(shared.locked || []);
        this.updateCheckButton();
        return;
      }
      this.clearUnlockedPlacements();
      this.restoreDailyLocked(shared.locked || []);
      if (shared.over) {
        this.checkedComplete = true;
        this.els.check.disabled = true;
        this.els.reset.disabled = true;
        this.updateHintButtons();
        this.updateMeaningDisplay();
      }
      this.updateCheckButton();
    }

    /** Fresh empty board for a new PvP turn — no carried-over correct tiles. */
    resetTurnBoard() {
      this.mergeDock?.reset();
      this.updateRotationDockLabel();
      this._lastLiveFingerprint = null;
      this._watchRevealPlayedKey = null;
      this._suspendLiveBroadcast = false;
      this.clearWatchRevealVisuals();
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

    /**
     * Clear active-turn placements while restoring cumulative shared greens.
     * Used on turn boundaries so correct letters survive turn swaps.
     */
    prepareForNewTurn(locked, turnHistory, myUid) {
      if (!this.turnBased) return;
      this.mergeDock?.reset();
      this.updateRotationDockLabel();
      this._lastLiveFingerprint = null;
      this._suspendLiveBroadcast = false;
      this.clearWatchRevealVisuals();
      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          zone.el.querySelectorAll('.opp-reveal-tile').forEach((el) => el.remove());
          if (zone.locked) return;
          zone.clear();
          zone.el.classList.remove(
            'correct', 'incorrect', 'turn-neutral', 'revealing', 'revealing-wrong', 'locked',
            'watch-correct', 'watch-wrong', 'watch-reveal-pending'
          );
        });
      });
      Object.values(this.tileMap).forEach((tile) => {
        if (tile.locked) return;
        tile.el?.classList.remove(
          'revealed', 'correct-flip', 'turn-neutral-tile', 'revealing', 'revealing-wrong'
        );
        if (!tile.inBank) this.returnTileToBank(tile);
      });
      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          if (!zone.locked) return;
          const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
          zone.locked = false;
          zone.clear();
          zone.el.classList.remove(
            'correct', 'incorrect', 'turn-neutral', 'revealing', 'revealing-wrong', 'locked',
            'watch-correct', 'watch-wrong', 'watch-reveal-pending'
          );
          if (tile) {
            tile.locked = false;
            tile.el?.classList.remove('revealed', 'correct-flip', 'locked');
            this.returnTileToBank(tile);
          }
        });
      });
      this.checkedComplete = false;
      this.checking = false;
      this.turnSubmitting = false;
      this.clearSelection();
      this.restoreTurnLockedPlacements(locked, turnHistory, myUid);
      this.updateCheckButton();
    }

    waitForWatchReveal() {
      return this._watchRevealInFlight || Promise.resolve();
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
      if (placement.tileId) {
        const byId = this.tileMap[placement.tileId];
        if (byId && byId.inBank && !byId.locked && byId.char === placement.char) return byId;
      }
      const block = this.blocks[placement.syl];
      const zone = block?.getAllZones().find((z) => (
        z.zoneType === placement.zone && (z.subIndex ?? 0) === sub
      ));
      const candidates = Object.values(this.tileMap).filter((tile) => (
        tile.inBank && !tile.locked && tile.char === placement.char
      ));
      if (!candidates.length) return null;
      const exact = candidates.find((tile) => (
        tile.syllableIndex === placement.syl
        && tile.zoneType === placement.zone
        && (tile.subIndex ?? 0) === sub
      ));
      if (exact) return exact;
      if (zone) {
        const valid = candidates.find((tile) => HC.isValidMatchPlacement(tile, zone));
        if (valid) return valid;
      }
      const sameSyl = candidates.find((tile) => tile.syllableIndex === placement.syl);
      if (sameSyl) return sameSyl;
      return candidates[0];
    }

    markPlacementLocked(zone, tile) {
      tile.locked = true;
      zone.setLocked(true);
      tile.setLocked();
      tile.el.classList.add('correct-flip');
      zone.el.classList.add('correct', 'filled');
    }

    placeLockedPlacement(placement) {
      const block = this.blocks[placement.syl];
      if (!block) return false;
      const sub = placement.subIndex ?? 0;
      const zone = block.getAllZones().find((z) => (
        z.zoneType === placement.zone && (z.subIndex ?? 0) === sub
      ));
      if (!zone) return false;

      const existing = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
      if (zone.locked && existing?.char === placement.char) {
        this.markPlacementLocked(zone, existing);
        return true;
      }
      if (existing?.char === placement.char && !zone.locked) {
        this.markPlacementLocked(zone, existing);
        return true;
      }
      if (existing) {
        if (existing.locked) return false;
        this.returnTileToBank(existing);
        zone.clear();
      }

      const tile = this.findBankTileForAutofill(placement);
      if (!tile) return false;
      this.attachTileToZone(tile, zone);
      this.markPlacementLocked(zone, tile);
      return true;
    }

    /** Re-apply cumulative greens after a turn-board reset (shared + optional autofill). */
    restoreTurnLockedPlacements(locked, turnHistory, myUid) {
      if (!this.turnBased) return;
      this._restoringTurnLocks = true;
      try {
        this.applySharedLocked(locked);
        if (myUid) this.applyAutofillFromHistory(turnHistory, myUid);
      } finally {
        this._restoringTurnLocks = false;
      }
    }

    applyAutofillFromHistory(turnHistory, myUid) {
      if (!this.turnBased || !prefs()?.shouldTurnAutofillCorrect?.()) return;
      const placements = this.buildAutofillPlacements(turnHistory, myUid);
      placements.forEach((p) => {
        this.placeLockedPlacement(p);
      });
      this.mergeDock?.tryCompose?.({ playSound: false });
      this.updateCheckButton();
    }

    /** Restore cumulative correct slots from the shared match state. */
    applySharedLocked(locked) {
      if (!this.turnBased || !locked?.length) return;
      locked.forEach((p) => {
        this.placeLockedPlacement(p);
      });
      this.mergeDock?.tryCompose?.({ playSound: false });
      this.updateCheckButton();
    }

    composeSyllableFromBlock(block, syllableIndex) {
      let cho = null;
      let jungH = null;
      const jungVSlots = [];
      let jong = '';
      block.getAllZones().forEach((zone) => {
        const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
        const char = tile?.char || null;
        if (!char) return;
        if (zone.zoneType === 'cho') cho = char;
        else if (zone.zoneType === 'jungH') jungH = char;
        else if (zone.zoneType === 'jungV') jungVSlots[zone.subIndex ?? 0] = char;
        else if (zone.zoneType === 'jong') jong = char;
      });

      let jungV = jungVSlots.filter((c) => c != null && c !== '');

      if (!jungH && !jungV.length && this.mergeDock && syllableIndex != null) {
        const merged = this.mergeDock.getResultTile?.();
        if (merged && Number(merged.syllableIndex) === Number(syllableIndex)) {
          const parts = HC.decomposeVowel(merged.char);
          if (parts.h) jungH = parts.h;
          if (parts.vSlots?.length) jungV = parts.vSlots;
          else if (parts.v) jungV = [parts.v];
        } else if (this.mergeDock.slotTileIds?.filter(Boolean).length === 2) {
          const chars = this.mergeDock.slotTileIds
            .map((id) => (id ? this.tileMap[id]?.char : null))
            .filter(Boolean);
          const slotSyl = this.mergeDock.slotTileIds
            .map((id) => (id ? this.tileMap[id]?.syllableIndex : null))
            .find((si) => si != null);
          if (chars.length === 2 && Number(slotSyl) === Number(syllableIndex)) {
            const parts = HC.decomposeVowel(HC.tryComposeMedial(chars) || '');
            if (parts.h) jungH = parts.h;
            if (parts.vSlots?.length) jungV = parts.vSlots;
            else if (parts.v) jungV = [parts.v];
          }
        }
      }

      if (!cho || (!jungH && !jungV.length)) return null;
      return HC.composeSyllableFromZones(cho, jungH, jungV, jong || '');
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
            tileId: tile.id,
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
          if (!char || zone.locked) return;

          zone.clear();
          zone.el.classList.add('filled');
          const tileEl = document.createElement('span');
          tileEl.className = 'jamo-tile opp-reveal-tile in-zone';
          tileEl.innerHTML = jamoTileFaceHtml(char, zone.zoneType);
          zone.el.appendChild(tileEl);

          if (neutral) {
            zone.el.classList.add('turn-neutral');
            tileEl.classList.add('turn-neutral-tile');
          } else if (placement.correct) {
            zone.el.classList.add('correct', 'watch-correct');
            tileEl.classList.add('revealed', 'correct-flip');
          } else {
            zone.el.classList.add('incorrect', 'watch-wrong');
          }
        });
      });
    }

    hasWatchBoardPlacements() {
      if (!this.blocks?.length) return false;
      return this.blocks.some((block) => block.getAllZones().some((zone) => (
        !zone.locked && zone.el.querySelector('.opp-reveal-tile')
      )));
    }

    isWatchPlacementCorrect(placement) {
      if (!placement?.char) return false;
      if (typeof placement.correct === 'boolean') return placement.correct;
      const zone = this.findZone(placement.zone, placement.syl, placement.subIndex ?? 0);
      return !!(zone && zone.expected !== null && placement.char === zone.expected);
    }

    buildWatchRevealFromLive(live) {
      const placements = (live?.placements || []).map((p) => {
        const correct = this.isWatchPlacementCorrect(p);
        return { ...p, correct };
      });
      const correctCount = placements.filter((p) => p.correct).length;
      return {
        byUid: live?.byUid,
        turnNumber: live?.turnNumber,
        placements,
        correctCount,
        totalPlaced: placements.length,
        syllableCorrect: this.resolveSyllableCorrectMask({ placements }),
        syllableTotal: this.blocks.length,
        timedOut: false,
      };
    }

    prefersReducedMotion() {
      return document.documentElement.classList.contains('reduce-motion')
        || global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    }

    showWatchRevealSummary(reveal, labels = {}) {
      const banner = this.els.watchRevealBanner;
      if (!banner) return;
      const correct = reveal?.correctCount || 0;
      const total = reveal?.totalPlaced || 0;
      const syllableCorrect = (reveal?.syllableCorrect || []).filter(Boolean).length;
      const syllableTotal = reveal?.syllableTotal || reveal?.syllableCorrect?.length || this.blocks.length;
      const name = labels.name || reveal?.byName || '';
      const title = labels.title
        || (name ? t('matchTurn.oppLastTurn', { name }) : t('matchTurn.revealStatsOnly', { correct, total }));
      const stat = labels.stat || t('matchTurn.revealStatsOnly', { correct, total });
      const syllableLine = syllableTotal > 0
        ? t('matchTurn.revealSyllableStats', { correct: syllableCorrect, total: syllableTotal })
        : '';
      banner.innerHTML = `
        <span class="watch-reveal-banner-title">${title}</span>
        <span class="watch-reveal-banner-stat">${stat}</span>
        ${syllableLine ? `<span class="watch-reveal-banner-syllables">${syllableLine}</span>` : ''}
      `;
      banner.classList.remove('hidden');
      void banner.offsetWidth;
      banner.classList.add('watch-reveal-banner--show');
    }

    hideWatchRevealSummary() {
      const banner = this.els.watchRevealBanner;
      if (!banner) return;
      banner.classList.remove('watch-reveal-banner--show');
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }

    clearWatchRevealVisuals() {
      this.hideWatchRevealSummary();
      this.blocks.forEach((block) => {
        block.el.classList.remove('watch-syl-correct', 'watch-syl-partial', 'watch-syl-wrong');
        block.getAllZones().forEach((zone) => {
          zone.el.classList.remove(
            'watch-correct', 'watch-wrong', 'watch-reveal-pending', 'turn-neutral'
          );
        });
      });
    }

    applyWatchSyllableHints(reveal) {
      const mask = this.resolveSyllableCorrectMask(reveal);
      const placedBySyl = {};
      (reveal?.placements || []).forEach((p) => {
        placedBySyl[p.syl] = (placedBySyl[p.syl] || 0) + 1;
      });
      this.blocks.forEach((block, si) => {
        block.el.classList.remove('watch-syl-correct', 'watch-syl-partial', 'watch-syl-wrong');
        if (!placedBySyl[si]) return;
        if (mask[si]) block.el.classList.add('watch-syl-correct');
        else if ((reveal?.placements || []).some((p) => p.syl === si && p.correct)) {
          block.el.classList.add('watch-syl-partial');
        } else {
          block.el.classList.add('watch-syl-wrong');
        }
      });
    }

    applyWatchRevealFinalState(toReveal, toWrong) {
      toReveal.forEach(({ zone, tileEl }) => {
        zone.el.classList.remove('turn-neutral', 'revealing', 'watch-reveal-pending');
        zone.el.classList.add('correct', 'watch-correct', 'filled');
        tileEl.classList.remove('turn-neutral-tile', 'revealing');
        tileEl.classList.add('revealed', 'correct-flip');
      });
      toWrong.forEach(({ zone, tileEl }) => {
        zone.el.classList.remove('turn-neutral', 'revealing-wrong');
        zone.el.classList.add('incorrect', 'watch-wrong', 'filled');
        tileEl.classList.remove('turn-neutral-tile', 'revealing-wrong');
      });
    }

    persistWatchCorrectReveals(toReveal) {
      (toReveal || []).forEach(({ zone, placement }) => {
        zone.el.querySelectorAll('.opp-reveal-tile').forEach((el) => el.remove());
        zone.el.classList.remove('turn-neutral', 'watch-correct', 'watch-reveal-pending', 'revealing');
        if (placement?.char) {
          this.placeLockedPlacement(placement);
        }
      });
    }

    hideTurnAnswerBanner() {
      global.AnswerTTS?.cancel?.();
      this.els.turnAnswerBanner?.classList.add('hidden');
      if (this.els.turnAnswerWord) this.els.turnAnswerWord.textContent = '';
      if (this.els.turnAnswerMeaning) {
        this.els.turnAnswerMeaning.textContent = '';
        this.els.turnAnswerMeaning.classList.add('hidden');
      }
    }

    async showTurnAnswerBanner(word) {
      const banner = this.els.turnAnswerBanner;
      if (!banner) return;
      const wordEl = this.els.turnAnswerWord;
      const meaningEl = this.els.turnAnswerMeaning;
      if (wordEl) wordEl.textContent = word;
      if (meaningEl) {
        meaningEl.textContent = '';
        meaningEl.classList.add('hidden');
      }
      banner.classList.remove('hidden');
      global.AnswerTTS?.attachPopup?.({
        word,
        wordEl,
        autoplay: !this.versus,
        autoplayRepeats: 2,
        root: banner,
      });
      const meaning = await this.getMeaningForWord(word);
      if (meaningEl && meaning) {
        meaningEl.textContent = meaning;
        meaningEl.classList.remove('hidden');
      }
    }

    async flipRevealWatchZone(zone, tileEl, index) {
      await delay(index * FLIP_STAGGER);
      global.SoundEffects?.correct?.();
      zone.el.classList.remove('turn-neutral');
      zone.el.classList.add('revealing', 'watch-reveal-pending');
      tileEl.classList.remove('turn-neutral-tile');
      tileEl.classList.add('revealing');
      tileEl.style.setProperty('--flip-delay', '0ms');
      await delay(FLIP_MS);
      zone.el.classList.remove('revealing', 'watch-reveal-pending');
      zone.el.classList.add('correct', 'watch-correct');
      tileEl.classList.remove('revealing');
      tileEl.classList.add('revealed', 'correct-flip');
    }

    async flipWrongWatchZone(zone, tileEl, index) {
      await delay(index * FLIP_STAGGER);
      global.SoundEffects?.wrong?.();
      zone.el.classList.remove('turn-neutral');
      zone.el.classList.add('revealing-wrong', 'watch-wrong');
      tileEl.classList.remove('turn-neutral-tile');
      tileEl.classList.add('revealing-wrong');
      await delay(FLIP_MS);
      zone.el.classList.remove('revealing-wrong');
      zone.el.classList.add('incorrect', 'watch-wrong');
      tileEl.classList.remove('revealing-wrong');
    }

    collectWatchRevealTargets(reveal) {
      const byPlacement = {};
      (reveal?.placements || []).forEach((p) => {
        byPlacement[`${p.syl}:${p.zone}:${p.subIndex ?? 0}`] = p;
      });
      const toReveal = [];
      const toWrong = [];
      this.blocks.forEach((block, si) => {
        block.getAllZones().forEach((zone) => {
          if (zone.locked) return;
          const placement = byPlacement[`${si}:${zone.zoneType}:${zone.subIndex ?? 0}`];
          if (!placement?.char) return;
          const tileEl = zone.el.querySelector('.opp-reveal-tile');
          if (!tileEl) return;
          const correct = this.isWatchPlacementCorrect(placement);
          if (correct) toReveal.push({ zone, tileEl, placement });
          else toWrong.push({ zone, tileEl, placement });
        });
      });
      return { toReveal, toWrong };
    }

    async playWatchTurnReveal(reveal, labels = {}) {
      if (!this.turnBased || !reveal?.placements?.length) return;
      const key = `${reveal.byUid || 'opp'}:${reveal.turnNumber ?? ''}`;
      if (key !== ':') {
        if (key === this._watchRevealPlayedKey) return;
        this._watchRevealPlayedKey = key;
      }
      if (this._watchRevealInFlight) return this._watchRevealInFlight;
      this._watchRevealInFlight = this._runWatchTurnReveal(reveal, labels).finally(() => {
        this._watchRevealInFlight = null;
      });
      return this._watchRevealInFlight;
    }

    async _runWatchTurnReveal(reveal, labels = {}) {
      this._watchRevealBusy = true;

      try {
        let { toReveal, toWrong } = this.collectWatchRevealTargets(reveal);
        if (!toReveal.length && !toWrong.length && reveal.placements?.length) {
          this.renderTurnGuessOnZones(this.blocks, reveal, { neutral: true });
          ({ toReveal, toWrong } = this.collectWatchRevealTargets(reveal));
        }
        if (!toReveal.length && !toWrong.length) return;

        this.root?.classList.add('match-watch-revealing');
        this.showWatchRevealSummary(reveal, labels);
        this.applyWatchSyllableHints(reveal);

        if (this.prefersReducedMotion()) {
          this.applyWatchRevealFinalState(toReveal, toWrong);
          this.persistWatchCorrectReveals(toReveal);
          await delay(500);
        } else {
          await Promise.all([
            ...toReveal.map((item, i) => this.flipRevealWatchZone(item.zone, item.tileEl, i)),
            ...toWrong.map((item, i) => this.flipWrongWatchZone(item.zone, item.tileEl, toReveal.length + i)),
          ]);
          await delay(650);
          this.persistWatchCorrectReveals(toReveal);
          toWrong.forEach(({ zone }) => {
            zone.el.classList.remove('incorrect', 'watch-wrong', 'revealing-wrong', 'filled', 'turn-neutral');
            zone.el.querySelectorAll('.opp-reveal-tile').forEach((el) => el.remove());
          });
        }

        await delay(450);
      } finally {
        this._watchRevealBusy = false;
        this.root?.classList.remove('match-watch-revealing');
        this.hideWatchRevealSummary();
      }
    }

    hideOpponentSubmission() {
      this.els.oppArea?.classList.add('hidden');
      if (this.els.oppBlocks) this.els.oppBlocks.innerHTML = '';
      if (this.els.oppStat) this.els.oppStat.textContent = '';
    }

    serializeTileLiveRef(tile) {
      if (!tile) return null;
      if (tile.zoneRef) {
        return {
          type: 'zone',
          syl: tile.zoneRef.syllableIndex,
          zone: tile.zoneRef.zoneType,
          subIndex: tile.zoneRef.subIndex ?? 0,
        };
      }
      if (tile.mergeDockRef === 'slot') {
        return { type: 'merge-slot', index: tile.mergeDockSlot ?? 0 };
      }
      if (tile.mergeDockRef === 'result') {
        return { type: 'merge-result' };
      }
      return { type: 'bank', tileId: tile.id };
    }

    pulseLiveAction(kind, detail = {}) {
      if (!this.turnBased || this.watchMode || !this.isMyTurn || this._restoringTurnLocks) return;
      const seq = ++this._liveActionSeq;
      const action = { seq, kind, ...detail };
      if (kind === 'select' && this.selectedTile) {
        action.selected = this.serializeSelectedLiveState();
      }
      this._pendingLiveAction = action;
    }

    flashLiveElement(el) {
      if (!el) return;
      if (document.documentElement.classList.contains('reduce-motion')) return;
      if (global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
      el.classList.remove('opp-live-flash');
      void el.offsetWidth;
      el.classList.add('opp-live-flash');
      const done = () => el.classList.remove('opp-live-flash');
      el.addEventListener('animationend', done, { once: true });
      setTimeout(done, 480);
    }

    resolveLiveFlashEl(target) {
      if (!target) return null;
      if (target.type === 'rotation-dock') return this.els.rotationDock;
      if (target.type === 'bank' && target.tileId) {
        const tile = this.tileMap[target.tileId];
        if (tile?.el?.isConnected) return tile.el;
        return null;
      }
      if (target.type === 'zone') {
        const zone = this.findZone(target.zone, target.syl, target.subIndex ?? 0);
        return zone?.el?.querySelector('.jamo-tile, .opp-reveal-tile') || zone?.el;
      }
      if (target.type === 'merge-slot') {
        const idx = target.index ?? 0;
        const slot = this.mergeDock?.slotEls?.[idx];
        const tileId = this.mergeDock?.slotTileIds?.[idx];
        const tile = tileId ? this.tileMap[tileId] : null;
        return tile?.el || slot?.querySelector('.jamo-tile, .merge-live-glyph') || slot;
      }
      if (target.type === 'merge-result') {
        const dock = this.mergeDock;
        const tileId = dock?.resultTileId;
        const tile = tileId ? this.tileMap[tileId] : null;
        return tile?.el
          || dock?.resultEl?.querySelector('.jamo-tile, .merge-live-glyph')
          || dock?.resultEl;
      }
      return null;
    }

    flashLiveTarget(target) {
      this.flashLiveElement(this.resolveLiveFlashEl(target));
    }

    captureWatchLiveSnapshot(live) {
      return {
        placements: (live?.placements || []).map((p) => ({ ...p })),
        merge: live?.merge ? JSON.parse(JSON.stringify(live.merge)) : { slots: [null, null], slotIds: [null, null], result: null, resultId: null },
        bank: (live?.bank || []).map((b) => ({ ...b })),
        selected: live?.selected ? { ...live.selected } : null,
      };
    }

    flashOppMoveFromDiff(prev, live) {
      const seen = new Set();
      const flash = (target) => {
        const key = JSON.stringify(target);
        if (seen.has(key)) return;
        seen.add(key);
        this.flashLiveTarget(target);
      };
      const pKey = (p) => `${p.syl}:${p.zone}:${p.subIndex ?? 0}`;
      const prevP = {};
      (prev?.placements || []).forEach((p) => { prevP[pKey(p)] = p.char; });
      const nextP = {};
      (live?.placements || []).forEach((p) => { nextP[pKey(p)] = p.char; });
      new Set([...Object.keys(prevP), ...Object.keys(nextP)]).forEach((k) => {
        if (prevP[k] === nextP[k]) return;
        const [syl, zone, sub] = k.split(':');
        flash({ type: 'zone', syl: Number(syl), zone, subIndex: Number(sub) });
      });

      const prevBank = new Map((prev?.bank || []).map((b) => [b.id, b.char]));
      const nextBank = new Map((live?.bank || []).map((b) => [b.id, b.char]));
      new Set([...prevBank.keys(), ...nextBank.keys()]).forEach((id) => {
        if (prevBank.get(id) !== nextBank.get(id)) flash({ type: 'bank', tileId: id });
      });

      const prevM = prev?.merge || {};
      const nextM = live?.merge || {};
      const prevSlots = Array.isArray(prevM.slotIds) ? prevM.slotIds : [null, null];
      const nextSlots = Array.isArray(nextM.slotIds) ? nextM.slotIds : [null, null];
      for (let i = 0; i < 2; i += 1) {
        if (prevSlots[i] === nextSlots[i] && prevM.slots?.[i] === nextM.slots?.[i]) continue;
        if (nextSlots[i]) flash({ type: 'bank', tileId: nextSlots[i] });
        else if (prevSlots[i]) flash({ type: 'bank', tileId: prevSlots[i] });
        else flash({ type: 'merge-slot', index: i });
      }
      if (prevM.resultId !== nextM.resultId || prevM.result !== nextM.result) {
        if (nextM.resultId) flash({ type: 'bank', tileId: nextM.resultId });
        else if (prevM.resultId) flash({ type: 'bank', tileId: prevM.resultId });
        flash({ type: 'merge-result' });
      }
    }

    playOppActionFlash(live, prev) {
      const action = live?.action;
      if (!action?.seq || action.seq <= this._lastOppFlashSeq) return;
      this._lastOppFlashSeq = action.seq;
      const { kind } = action;

      if (kind === 'move') {
        if (prev) this.flashOppMoveFromDiff(prev, live);
        return;
      }

      if (kind === 'select') {
        const sel = action.selected || live.selected;
        if (!sel) return;
        if (sel.type === 'bank' && sel.tileId) this.flashLiveTarget({ type: 'bank', tileId: sel.tileId });
        else if (sel.type === 'zone') {
          this.flashLiveTarget({ type: 'zone', syl: sel.syl, zone: sel.zone, subIndex: sel.subIndex ?? 0 });
        } else if (sel.type === 'merge-slot') {
          this.flashLiveTarget({ type: 'merge-slot', index: sel.index ?? 0 });
        } else if (sel.type === 'merge-result') {
          this.flashLiveTarget({ type: 'merge-result' });
        }
        return;
      }

      if (kind === 'rotate') {
        this.flashLiveTarget({ type: 'rotation-dock' });
        const at = action.at;
        if (at?.type === 'zone') {
          this.flashLiveTarget({ type: 'zone', syl: at.syl, zone: at.zone, subIndex: at.subIndex ?? 0 });
        } else if (at?.type === 'merge-slot') {
          this.flashLiveTarget({ type: 'merge-slot', index: at.index ?? 0 });
        } else if (at?.type === 'bank' || action.tileId) {
          this.flashLiveTarget({ type: 'bank', tileId: action.tileId || at?.tileId });
        }
        return;
      }

      if (kind === 'merge') {
        this.flashLiveTarget({ type: 'rotation-dock' });
        const ingredientIds = action.ingredientIds || prev?.merge?.slotIds || [];
        ingredientIds.forEach((id) => {
          if (id) this.flashLiveTarget({ type: 'bank', tileId: id });
        });
        (prev?.merge?.slots || []).forEach((char, i) => {
          if (char && !ingredientIds[i]) this.flashLiveTarget({ type: 'merge-slot', index: i });
        });
        this.flashLiveTarget({ type: 'merge-result' });
        return;
      }

      if (kind === 'split') {
        this.flashLiveTarget({ type: 'rotation-dock' });
        if (action.fromResultId) this.flashLiveTarget({ type: 'bank', tileId: action.fromResultId });
        this.flashLiveTarget({ type: 'merge-result' });
        (live?.merge?.slotIds || []).forEach((id, i) => {
          if (id) this.flashLiveTarget({ type: 'bank', tileId: id });
          else if (live?.merge?.slots?.[i]) this.flashLiveTarget({ type: 'merge-slot', index: i });
        });
        return;
      }

      if (kind === 'checking') {
        return;
      }
    }

    serializeSelectedLiveState() {
      const tile = this.selectedTile;
      if (!tile || tile.locked) return null;
      if (tile.zoneRef) {
        return {
          type: 'zone',
          syl: tile.zoneRef.syllableIndex,
          zone: tile.zoneRef.zoneType,
          subIndex: tile.zoneRef.subIndex ?? 0,
        };
      }
      if (tile.mergeDockRef === 'slot') {
        return { type: 'merge-slot', index: tile.mergeDockSlot ?? 0 };
      }
      if (tile.mergeDockRef === 'result') {
        return { type: 'merge-result' };
      }
      return { type: 'bank', tileId: tile.id };
    }

    /** Bank tiles in visual (DOM) order so the watcher can mirror the dock exactly. */
    serializeBankLiveState() {
      const out = [];
      this.els.bank?.querySelectorAll('.jamo-tile').forEach((el) => {
        const id = el.dataset.tileId;
        const tile = id ? this.tileMap[id] : null;
        if (
          tile
          && tile.inBank
          && !tile.locked
          && !el.classList.contains('hidden-in-bank')
        ) {
          out.push({ id: tile.id, char: tile.char });
        }
      });
      return out;
    }

    serializeTurnLiveState() {
      const placements = [];
      this.blocks.forEach((block, si) => {
        block.getAllZones().forEach((zone) => {
          const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
          if (!tile) return;
          placements.push({
            syl: si,
            zone: zone.zoneType,
            subIndex: zone.subIndex ?? 0,
            char: tile.char,
          });
        });
      });
      const merge = this.mergeDock?.serializeLiveChars?.() || { slots: [null, null], result: null };
      return {
        placements,
        merge,
        bank: this.serializeBankLiveState(),
        selected: this.serializeSelectedLiveState(),
        removed: this._removedTileIds || [],
        action: this._pendingLiveAction ? { ...this._pendingLiveAction } : null,
      };
    }

    /**
     * Mirror the active player's dock onto the watcher's identical,
     * seed-generated bank (ids line up because both clients built the dock
     * from the same sharedSeed):
     * - rotations → update chars in place
     * - merges → delete consumed tiles, materialize the merged tile locally
     * - splits → materialize the new basic tiles locally
     */
    applyBankLiveState(live) {
      if (!this.sharedSeed) return;
      const bankEntries = Array.isArray(live?.bank) ? live.bank : [];
      try {
        (Array.isArray(live?.removed) ? live.removed : []).forEach((id) => {
          const tile = this.tileMap[id];
          if (tile && !tile.locked) this.removeTile(id);
        });
        bankEntries.forEach((entry) => {
          if (!entry?.id || !entry.char) return;
          let tile = this.tileMap[entry.id];
          if (!tile) {
            tile = new JamoTile({
              id: entry.id,
              char: entry.char,
              zoneType: HC.zoneTypeForRotatedJamo(entry.char, 'jungV'),
              syllableIndex: 0,
              subIndex: 0,
            });
            if (HC.getMergePairComponents?.(entry.char)) tile.isMerged = true;
            this.tileMap[entry.id] = tile;
            tile.setInBank(this.els.bank);
            return;
          }
          if (tile.locked) return;
          if (tile.char !== entry.char) {
            tile.setChar(entry.char);
            tile.zoneType = HC.zoneTypeForRotatedJamo(entry.char, tile.zoneType);
          }
        });
      } catch (err) {
        console.warn('[KoreanMatch] bank live sync', err);
      }
    }

    /**
     * Mirror the active player's dock exactly — by tile id, not by char guessing.
     */
    syncWatchBankExact(liveBank) {
      if (!this.turnBased || !this.watchMode || !this.sharedSeed) return;
      const entries = Array.isArray(liveBank) ? liveBank : [];
      const liveIds = new Set(entries.map((e) => e.id));
      const bank = this.els.bank;
      if (!bank) return;

      Object.values(this.tileMap).forEach((tile) => {
        if (tile.locked) return;
        if (liveIds.has(tile.id)) {
          if (!tile.inBank) {
            tile.mergeDockRef = null;
            tile.mergeDockSlot = null;
            tile.zoneRef = null;
            tile.setInBank(bank);
          }
          tile.showInBank();
          return;
        }
        if (tile.inBank) tile.hideInBank();
      });

      entries.forEach((entry) => {
        const tile = this.tileMap[entry.id];
        if (tile?.el && tile.inBank && !tile.locked) bank.appendChild(tile.el);
      });
      this.syncDockTileSize();
    }

    detachWatchZoneTile(zone) {
      const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
      zone.placedTileId = null;
      if (!tile) return;
      if (tile.zoneRef === zone) {
        tile.zoneRef = null;
        tile.inBank = false;
      }
      if (tile.el?.parentElement === zone.el) tile.el.remove();
    }

    clearLiveSelectionIndicators() {
      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => zone.el.classList.remove('tap-target'));
      });
      this.mergeDock?.slotEls?.forEach((slotEl) => slotEl.classList.remove('tap-target'));
      this.mergeDock?.resultEl?.classList.remove('tap-target');
      Object.values(this.tileMap).forEach((tile) => tile.el?.classList.remove('selected'));
    }

    applyLiveSelection(live) {
      this.clearLiveSelectionIndicators();
      const selected = live?.selected;
      if (!selected) return;
      if (selected.type === 'zone') {
        const zone = this.findZone(selected.zone, selected.syl, selected.subIndex ?? 0);
        zone?.el?.classList.add('tap-target');
        return;
      }
      if (selected.type === 'merge-slot') {
        const idx = selected.index ?? 0;
        this.mergeDock?.slotEls?.[idx]?.classList.add('tap-target');
        return;
      }
      if (selected.type === 'merge-result') {
        this.mergeDock?.resultEl?.classList.add('tap-target');
        return;
      }
      if (selected.type === 'bank' && selected.tileId) {
        this.tileMap[selected.tileId]?.el?.classList.add('selected');
      }
    }

    applyWatchMerge(merge) {
      const dock = this.mergeDock;
      if (!dock || !this.watchMode) return;

      const nextSlotIds = Array.isArray(merge?.slotIds)
        ? merge.slotIds.map((id) => id || null)
        : [null, null];
      const nextSlots = Array.isArray(merge?.slots) ? merge.slots : [null, null];
      const nextResultId = merge?.resultId || null;
      const nextResult = merge?.result || null;

      const releaseWatchTile = (tile, keepIds = []) => {
        if (!tile) return;
        tile.mergeDockRef = null;
        tile.mergeDockSlot = null;
        if (tile.el?.isConnected && tile.el.parentElement !== this.els.bank) {
          tile.el.remove();
        }
        const keep = keepIds.includes(tile.id)
          || this.isWatchCharInLiveLayout(tile.char, merge, nextResultId, nextSlotIds);
        if (!tile.zoneRef && !keep) {
          tile.inBank = false;
          if (tile.el?.isConnected) tile.el.remove();
        } else {
          tile.inBank = false;
        }
      };

      dock.slotTileIds.forEach((id, i) => {
        const prevId = id;
        dock.slotTileIds[i] = null;
        dock.slotEls[i]?.classList.remove('filled');
        dock.slotEls[i].innerHTML = '';
        if (prevId && !nextSlotIds.includes(prevId)) {
          releaseWatchTile(this.tileMap[prevId], nextSlotIds);
        }
      });

      const prevResultId = dock.resultTileId;
      dock.resultTileId = null;
      dock.resultEl?.classList.remove('filled', 'has-preview', 'drag-over');
      if (dock.previewEl) dock.previewEl.textContent = '';
      dock.resultEl?.querySelectorAll('.jamo-tile, .merge-live-glyph').forEach((n) => n.remove());
      if (prevResultId && prevResultId !== nextResultId) {
        releaseWatchTile(this.tileMap[prevResultId], [nextResultId, ...nextSlotIds]);
      }

      nextSlotIds.forEach((id, i) => {
        if (id) {
          const char = nextSlots[i] || this.tileMap[id]?.char;
          const tile = this.ensureWatchTileFromLive(id, char);
          if (tile) {
            dock.placeInSlotEmpty(i, tile);
            return;
          }
        }
        if (nextSlots[i]) dock.showLiveSlotGlyph(i, nextSlots[i]);
      });

      if (nextResultId || nextResult) {
        const tile = this.ensureWatchTileFromLive(nextResultId, nextResult);
        if (tile?.isMerged) {
          dock.placeInResult(tile);
        } else if (nextResult) {
          dock.showLiveResultGlyph(nextResult);
        }
      } else {
        dock.updatePreview?.();
      }
    }

    isWatchCharInLiveLayout(char, merge, nextResultId, nextSlotIds) {
      if (!char) return false;
      if ((this._watchLivePlacements || []).some((p) => p.char === char)) return true;
      if (merge?.result === char && nextResultId) return true;
      const slots = Array.isArray(merge?.slots) ? merge.slots : [];
      const slotIds = nextSlotIds || merge?.slotIds || [];
      for (let i = 0; i < slots.length; i += 1) {
        if (slots[i] === char && slotIds[i]) return true;
      }
      return false;
    }

    ensureWatchTileFromLive(id, char) {
      if (!id || !char || !this.watchMode) return null;
      let tile = this.tileMap[id];
      if (tile) {
        if (tile.locked) return tile;
        if (tile.char !== char) {
          tile.setChar(char);
          tile.zoneType = HC.zoneTypeForRotatedJamo(char, tile.zoneType);
        }
        tile.isMerged = HC.isVerticalMergeMedial?.(char) === true;
        return tile;
      }
      const isMerged = HC.isVerticalMergeMedial?.(char) === true;
      tile = new JamoTile({
        id,
        char,
        zoneType: 'jungV',
        syllableIndex: 0,
        subIndex: 0,
      });
      tile.isMerged = isMerged;
      if (isMerged) tile.mergeSources = HC.getMergePairComponents?.(char) || null;
      this.tileMap[id] = tile;
      return tile;
    }

    applyTurnLiveState(live) {
      if (!live || !this.turnBased || !this.watchMode) return;
      const actionSeq = live?.action?.seq ?? 0;

      if (live.action?.kind === 'checking' && actionSeq > this._lastOppFlashSeq) {
        this._lastOppFlashSeq = actionSeq;
        this.renderTurnGuessOnZones(this.blocks, { placements: live.placements || [] }, { neutral: true });
        const reveal = this.buildWatchRevealFromLive(live);
        void this.playWatchTurnReveal(reveal);
        return;
      }

      const fp = JSON.stringify(live.placements || [])
        + '|'
        + JSON.stringify(live.merge || {})
        + '|'
        + JSON.stringify(live.bank || [])
        + '|'
        + JSON.stringify(live.selected || null)
        + '|'
        + JSON.stringify(live.removed || []);
      const sameFp = fp === this._lastLiveFingerprint;
      const sameAction = actionSeq <= this._lastOppFlashSeq;
      if (sameFp && sameAction) return;

      const prevSnap = this._watchLivePrevSnapshot;
      this._lastLiveFingerprint = fp;

      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          if (zone.locked) return;
          this.detachWatchZoneTile(zone);
          zone.clear();
          zone.el.classList.remove('turn-neutral', 'incorrect', 'correct', 'filled');
          zone.el.querySelectorAll('.opp-reveal-tile').forEach((el) => el.remove());
        });
      });

      const filtered = {
        placements: (live.placements || []).filter((p) => {
          const zone = this.findZone(p.zone, p.syl, p.subIndex ?? 0);
          return zone && !zone.locked;
        }),
      };
      this.applyBankLiveState(live);
      this.renderTurnGuessOnZones(this.blocks, filtered, { neutral: true });
      const merge = live.merge || {};
      this._watchLivePlacements = filtered.placements;
      this._watchLiveBank = Array.isArray(live.bank) ? live.bank : [];
      this._watchLiveMerge = {
        slots: Array.isArray(merge.slots) ? [...merge.slots] : [null, null],
        slotIds: Array.isArray(merge.slotIds) ? [...merge.slotIds] : [null, null],
        result: merge.result || null,
        resultId: merge.resultId || null,
      };
      if (this.sharedSeed) this.applyWatchMerge(merge);
      else this.mergeDock?.applyLiveChars?.(merge.slots, merge.result);
      this.applyLiveSelection(live);

      if (this.sharedSeed) {
        this.syncWatchBankExact(live.bank || []);
      } else {
        this.syncDockUsageVisibility();
      }
      this.playOppActionFlash(live, prevSnap);
      this._watchLivePrevSnapshot = this.captureWatchLiveSnapshot(live);
    }

    collectDockUsedChars() {
      const chars = [];
      if (this.watchMode) {
        this.blocks.forEach((block) => {
          block.getAllZones().forEach((zone) => {
            if (!zone.locked) return;
            const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
            if (tile?.char) chars.push(tile.char);
          });
        });
        (this._watchLivePlacements || []).forEach((p) => {
          if (p.char) chars.push(p.char);
        });
        const merge = this._watchLiveMerge || { slots: [null, null], result: null };
        (merge.slots || []).forEach((c) => { if (c) chars.push(c); });
        if (merge.result) chars.push(merge.result);
        // Merged tiles the opponent parked in their dock exist only in their
        // tileMap; count their chars too so our source vowels stay hidden.
        (this._watchLiveBank || []).forEach((entry) => {
          if (entry?.id && entry.char && !this.tileMap[entry.id]) chars.push(entry.char);
        });
        return chars;
      }
      this.blocks.forEach((block) => {
        block.getAllZones().forEach((zone) => {
          const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
          if (tile?.char) chars.push(tile.char);
        });
      });
      const merge = this.mergeDock?.serializeLiveChars?.() || { slots: [null, null], result: null };
      (merge.slots || []).forEach((c) => { if (c) chars.push(c); });
      if (merge.result) chars.push(merge.result);
      return chars;
    }

    /** While watching opponent live state, mirror bank visibility from live payload. */
    syncDockUsageVisibility() {
      if (!this.turnBased || !this.watchMode) return;
      if (this.sharedSeed && Array.isArray(this._watchLiveBank)) {
        this.syncWatchBankExact(this._watchLiveBank);
        return;
      }
      const remaining = {};
      this.collectDockUsedChars().forEach((c) => {
        if (c) remaining[c] = (remaining[c] || 0) + 1;
      });
      const bankTiles = Object.values(this.tileMap).filter((t) => t.inBank && !t.locked);
      bankTiles.forEach((t) => t.showInBank());
      bankTiles.forEach((t) => {
        if (remaining[t.char] > 0) {
          t.hideInBank();
          remaining[t.char] -= 1;
        }
      });
      // A merged vowel (e.g. ㅘ) has no matching bank tile here — hide its
      // component vowels instead so they don't look "returned" to the dock.
      Object.keys(remaining).forEach((char) => {
        let count = remaining[char];
        if (count <= 0) return;
        const pair = HC.getMergePairComponents?.(char);
        if (!pair || pair.length !== 2) return;
        while (count > 0) {
          pair.forEach((component) => {
            const tile = bankTiles.find((t) => (
              t.char === component && !t.el.classList.contains('hidden-in-bank')
            ));
            tile?.hideInBank();
          });
          count -= 1;
        }
        remaining[char] = 0;
      });
      this.syncDockTileSize();
    }

    /** @deprecated use syncDockUsageVisibility */
    syncWatchDockVisibility(usedChars) {
      if (Array.isArray(usedChars)) {
        const remaining = {};
        usedChars.forEach((c) => { if (c) remaining[c] = (remaining[c] || 0) + 1; });
        const bankTiles = Object.values(this.tileMap).filter((t) => t.inBank && !t.locked);
        bankTiles.forEach((t) => t.showInBank());
        bankTiles.forEach((t) => {
          if (remaining[t.char] > 0) {
            t.hideInBank();
            remaining[t.char] -= 1;
          }
        });
        this.syncDockTileSize();
        return;
      }
      this.syncDockUsageVisibility();
    }

    /** Restore every un-locked bank tile to visible (used when regaining control). */
    restoreDockVisibility() {
      Object.values(this.tileMap).forEach((tile) => {
        if (tile.inBank && !tile.locked) tile.showInBank();
      });
    }

    notifyTurnLiveChange() {
      if (!this.turnBased || !this.onTurnLiveChange || !this.isMyTurn || this.watchMode || this.turnSubmitting) return;
      if (this._suspendLiveBroadcast || this._restoringTurnLocks) return;
      if (this._liveBroadcastTimer) return;
      this._liveBroadcastTimer = setTimeout(() => {
        this._liveBroadcastTimer = null;
        try {
          this.onTurnLiveChange(this.serializeTurnLiveState());
        } catch (err) {
          console.warn('[KoreanMatch] turn live broadcast', err);
        }
      }, 400);
    }

    /**
     * Stop broadcasting live turn state. Called the instant a turn submission
     * starts so the debounced updateTurnLive write can't collide with the
     * submitTurn transaction (which caused stacking failed-precondition errors
     * and left the turn stuck).
     */
    suspendLiveBroadcast() {
      this._suspendLiveBroadcast = true;
      if (this._liveBroadcastTimer) {
        clearTimeout(this._liveBroadcastTimer);
        this._liveBroadcastTimer = null;
      }
    }

    setWatchMode(on) {
      this.watchMode = !!on;
      this.root?.classList.toggle('match-watch-mode', !!on);
      if (on) {
        this.turnPrepMode = false;
        this.isMyTurn = false;
        this.clearSelection();
        this._lastOppFlashSeq = 0;
        this._watchLivePrevSnapshot = null;
        this.setEnabled(false);
        this.els.check.disabled = true;
        this.els.reset.disabled = true;
      }
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
      tile.className = 'jamo-tile opp-reveal-tile in-zone';
      tile.innerHTML = jamoTileFaceHtml(char, zoneType);
      if (placement.correct) {
        zoneEl.classList.add('correct', 'watch-correct');
        tile.classList.add('revealed', 'correct-flip');
      } else {
        zoneEl.classList.add('incorrect', 'watch-wrong');
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
      const n = this.blocks.length;
      row.dataset.sylCount = String(n);
      row.style.setProperty('--syl-count', String(layoutSylColumnCount(n)));
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

    /** When the turn timer hits zero — same outcome as tapping Check. */
    async expireMyTurn() {
      if (!this.turnBased || this.inspectMode || this.rushMode || this.watchMode) return false;
      if (!this.isMyTurn || this.turnPrepMode || this.checkedComplete) return false;
      if (this.checking || this.turnSubmitting) return false;
      if (!this.onTurnSubmit) return false;

      if (!this.hasAnyPlacement()) {
        this.suspendLiveBroadcast();
        this.turnSubmitting = true;
        const submission = this.serializeTurnSubmission();
        try {
          await this.onTurnSubmit({
            ...submission,
            won: false,
            guessCount: this.guessCount,
          });
          this.freezeOwnTurnResult();
          return true;
        } catch (err) {
          if (err?.message === 'turn-not-applied') {
            this.turnSubmitting = false;
            return false;
          }
          console.error('[KoreanMatch] turn timeout submit failed', err);
          this.turnSubmitting = false;
          this.feedback.show('error', t('matchTurn.turnSubmitFailed') || 'Could not submit turn.');
          return false;
        }
      }

      await this.checkAnswer();
      return this.turnSubmitting || this.checkedComplete;
    }

    /** @deprecated use expireMyTurn */
    async submitTurnOnTimeout() {
      return this.expireMyTurn();
    }

    /** After own submit — keep flip feedback on board, lock interaction. */
    freezeOwnTurnResult() {
      this.setEnabled(false);
      this.els.check.disabled = true;
      this.els.reset.disabled = true;
    }

    setMyTurn(isMine) {
      this.isMyTurn = !!isMine;
      if (isMine) {
        this.turnPrepMode = false;
        this.watchMode = false;
        this.root?.classList.remove('match-watch-mode');
        this._lastLiveFingerprint = null;
        this._watchLivePlacements = null;
        this._watchLiveMerge = null;
        this._suspendLiveBroadcast = false;
        this.restoreDockVisibility();
      }
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
      if (this.checking || this.inspectMode || this.watchMode) return false;
      if (this.turnBased) {
        if (this.rushMode) return !this.checkedComplete;
        if (this.turnPrepMode && !this.raceControlled) return true;
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
      global.SoundEffects?.correct?.();
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
      global.SoundEffects?.wrong?.();
      zone.el.classList.add('revealing-wrong');
      if (tile) tile.el.classList.add('revealing-wrong');
      await delay(FLIP_MS);
      zone.el.classList.remove('revealing-wrong');
      zone.el.classList.add('incorrect');
      if (tile) tile.el.classList.remove('revealing-wrong');
    }

    returnWrongTilesToBank(entries) {
      (entries || []).forEach(({ zone, tile }) => {
        if (!tile || zone.locked) return;
        zone.el.classList.remove('incorrect', 'revealing-wrong');
        zone.clear();
        this.returnTileToBank(tile);
      });
      this.syncDockTileSize();
    }

    async checkAnswer() {
      if (!this.versus) global.AnswerTTS?.armSolveAutoplay?.();
      if (this.multiFindMode) {
        await this.checkMultiWordAnswer();
        return;
      }
      if (!this.canSubmitTurn() || !this.hasAnyPlacement() || this.checking || this.checkedComplete || this.turnSubmitting) return;
      if (this.turnBased && this.inspectMode) return;

      if (this.turnBased && this.onTurnLiveChange) {
        this._liveActionSeq += 1;
        this._pendingLiveAction = { seq: this._liveActionSeq, kind: 'checking' };
        try {
          this.onTurnLiveChange(this.serializeTurnLiveState());
        } catch (err) {
          console.warn('[KoreanMatch] live checking broadcast', err);
        }
        this._pendingLiveAction = null;
      }
      if (this.turnBased) this.suspendLiveBroadcast();
      this.checking = true;
      this.guessCount++;
      if (this.els.guesses) {
        this.els.guesses.textContent = t('match.guesses', { n: this.guessCount });
      }
      if (this.isDaily && this.guessCount === 1) {
        try {
          global.QuestService?.recordActivity?.('dailyMatch', { won: false });
        } catch (err) {
          console.warn('[KoreanMatch] daily quest progress failed', err);
        }
      }
      this.els.check.disabled = true;

      const composedWord = this.shouldUseDictionaryCheck() ? this.getSubmittedBoardWord() : null;
      const fullBoardSubmit = !!composedWord;
      let dictionaryWin = false;
      let dictionaryOffline = false;

      if (composedWord) {
        this.feedback.show('info', t('match.feedbackChecking'));
        const dictResult = await this.isDictionaryAcceptedWord(composedWord);
        dictionaryWin = dictResult.valid;
        dictionaryOffline = dictResult.offline;
        if (dictionaryWin) {
          this.discoveredWord = composedWord;
          this.discoveredDictionaryEntry = dictResult.entry || null;
          this.prefetchMeaning(composedWord);
        }
      }

      const toReveal = [];
      const toWrong = [];

      if (dictionaryWin) {
        this.blocks.forEach((block) => {
          block.getAllZones().forEach((zone) => {
            if (zone.locked) return;
            const tile = zone.placedTileId ? this.tileMap[zone.placedTileId] : null;
            if (tile) toReveal.push({ zone, tile });
          });
        });
      } else {
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
      }

      if (toReveal.length || toWrong.length) {
        await Promise.all([
          ...toReveal.map((item, i) => this.flipRevealZone(item.zone, item.tile, i)),
          ...toWrong.map((item, i) => this.flipWrongZone(item.zone, item.tile, toReveal.length + i)),
        ]);
      }

      if (this.turnBased && !dictionaryWin) {
        this.returnWrongTilesToBank(toWrong);
      }

      const allZonesCorrect = this.blocks.every((block) =>
        block.getAllZones().every((zone) => this.isZoneCorrect(zone))
      );
      const wordComplete = dictionaryWin || (
        this.turnBased
          ? allZonesCorrect
          : (!fullBoardSubmit && allZonesCorrect)
      );

      if (wordComplete) {
        global.SoundEffects?.win?.();
        this.checkedComplete = true;
        this.stopTimer();
        const elapsed = this.getElapsedMs();
        const resolvedWord = this.captureWinningWord();
        if (this.tutorialMode) {
          this.checking = false;
          this.onTutorialEvent?.('wordComplete', { game: this, elapsed });
          return;
        }
        if (this.turnBased && this.onTurnSubmit) {
          this.turnSubmitting = true;
          void this.showTurnAnswerBanner(resolvedWord);
          this.freezeOwnTurnResult();
          this.checking = false;
          const submission = this.serializeTurnSubmission();
          try {
            await this.onTurnSubmit({
              ...submission,
              won: true,
              guessCount: this.guessCount,
              solvedWord: resolvedWord,
            });
          } catch (err) {
            if (err?.message === 'turn-not-applied') {
              this.turnSubmitting = false;
              this.checkedComplete = false;
              this.checking = false;
              this.updateCheckButton();
              return;
            }
            console.error('[KoreanMatch] turn submit failed', err);
            this.turnSubmitting = false;
            this.feedback.show('error', t('matchTurn.turnSubmitFailed') || 'Could not submit turn.');
            this.checkedComplete = false;
            this.checking = false;
            this.updateCheckButton();
            return;
          }
          return;
        }
        if (this.versus) {
          if (this.onProgress) {
            await this.onProgress({
              guessCount: this.guessCount,
              won: true,
              elapsedMs: elapsed,
              solvedWord: resolvedWord,
            });
          }
          if (this.onFinished) {
            await this.onFinished({
              won: true,
              guessCount: this.guessCount,
              elapsedMs: elapsed,
              solvedWord: resolvedWord,
            });
          }
          const targetWord = this.currentWord?.word || '';
          const versusKey = dictionaryWin && resolvedWord && targetWord && resolvedWord !== targetWord
            ? 'match.feedbackDictionarySuccess'
            : 'match.feedbackSuccess';
          const versusVars = versusKey === 'match.feedbackDictionarySuccess'
            ? { word: resolvedWord }
            : undefined;
          this.feedback.show('success', t(versusKey, versusVars));
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
            wordId: resolvedWord,
            usedHint: this.hintsUsedThisRound,
            isDailyChallenge: this.isDaily,
            won: true,
            guessCount: this.guessCount,
          });
        }
        const targetWord = this.currentWord?.word || '';
        const successKey = dictionaryWin && resolvedWord && targetWord && resolvedWord !== targetWord
          ? 'match.feedbackDictionarySuccess'
          : (this.isDaily ? 'match.feedbackDailyDone' : 'match.feedbackSuccess');
        const successVars = successKey === 'match.feedbackDictionarySuccess'
          ? { word: resolvedWord }
          : undefined;
        this.feedback.show('success', t(successKey, successVars));
        if (streakResult?.newMilestone) {
          setTimeout(() => {
            this.feedback.show('success', `${streakResult.newMilestone.badge} ${streakResult.newMilestone.message}`);
          }, 1200);
        }
        await this.revealHintWord(resolvedWord);
        this.spawnConfetti();
        this.showResults(elapsed);
      } else if (!composedWord && this.hasAllDockTilesOnBoard() && this.shouldUseDictionaryCheck()) {
        this.feedback.show('error', t('match.feedbackCantCompose'));
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
      } else if (fullBoardSubmit && !dictionaryWin) {
        this.feedback.show('error', dictionaryOffline
          ? t('match.feedbackDictionaryOffline')
          : t('match.feedbackNotInDictionary'));
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
          if (err?.message === 'turn-not-applied') {
            this.turnSubmitting = false;
            return;
          }
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

    getResultsMeaningText(words) {
      const list = (Array.isArray(words) ? words : [words])
        .map((w) => String(w || '').trim())
        .filter(Boolean);
      const formatDict = (entry) => global.DictionaryService?.formatEntryMeaning?.(entry) || '';
      return list
        .map((w) => {
          const dictEntry = this.multiDictionaryEntries?.[w]
            || (w === this.discoveredWord ? this.discoveredDictionaryEntry : null);
          return formatDict(dictEntry);
        })
        .filter(Boolean)
        .join(' · ');
    }

    ensureResultsMeaningEl() {
      if (this.els.resultsWordMeaning?.isConnected) return this.els.resultsWordMeaning;
      const banner = this.els.resultsWord?.closest('.results-word-banner');
      if (!banner) return null;
      let el = banner.parentElement?.querySelector('#results-word-meaning');
      if (!el) {
        el = document.createElement('p');
        el.className = 'results-word-meaning';
        el.id = 'results-word-meaning';
        el.setAttribute('aria-live', 'polite');
        banner.insertAdjacentElement('afterend', el);
      }
      this.els.resultsWordMeaning = el;
      return el;
    }

    updateResultsMeaning(words) {
      const meaningEl = this.ensureResultsMeaningEl();
      if (!meaningEl) return;
      const meaningWords = Array.isArray(words)
        ? words
        : String(words || '').split('·').map((w) => w.trim()).filter(Boolean);
      const syncText = this.getResultsMeaningText(meaningWords);
      meaningEl.textContent = syncText;
      meaningEl.hidden = !syncText;
      meaningEl.classList.toggle('hidden', !syncText);
      if (syncText) return;
      const fallbackWord = meaningWords[0] || this.getResolvedWord();
      if (!fallbackWord) return;
      const fillAsync = async () => {
        const text = await this.getMeaningForWord(fallbackWord);
        if (!text || !meaningEl.isConnected) return;
        meaningEl.textContent = text;
        meaningEl.hidden = false;
        meaningEl.classList.remove('hidden');
      };
      fillAsync().catch(() => {});
    }

    destroy() {
      KoreanMatchDrag.end();
      this.stopTimer();
      if (this._dockResizeBound && this._onDockResize) {
        window.removeEventListener('resize', this._onDockResize);
        this._dockResizeBound = false;
      }
      if (KoreanMatchGame.instance === this) {
        KoreanMatchGame.instance = null;
      }
    }

    showResults(elapsed) {
      const word = this.multiFindMode
        ? this.multiFoundWords.join(' · ')
        : (this.winningWord || this.getResolvedWord());
      this.els.resultsWord.textContent = word;
      this.updateResultsMeaning(this.multiFindMode ? this.multiFoundWords : word);
      this.els.resultsTime.textContent = formatTime(elapsed);
      this.els.resultsGuesses.textContent = String(this.guessCount);
      if (this.els.resultsStreak) {
        this.els.resultsStreak.textContent = String(this.streak);
      }
      if (this.isDaily) {
        this.els.resultsBest.textContent = `Daily Day ${MD.getDayNumber()} · 내일 자정(KST)에 새 단어`;
      } else if (!this.versus) {
        this.els.resultsBest.textContent = this.bestStreak > 0
          ? t('match.bestCombo', { n: this.bestStreak })
          : '';
      }

      this.els.results.classList.remove('hidden');
      global.AnswerTTS?.attachPopup?.({
        word,
        wordEl: this.els.resultsWord,
        autoplay: !this.versus,
        autoplayRepeats: 2,
        root: this.els.results,
      });
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
      const colors = ['#FFB8D0', '#5FD4E8', '#FFE566', '#FFD0A8', '#F5A0C8', '#7BE0F0'];
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
      const game = KoreanMatchGame.instance;
      game?.restoreVisibleTiles?.();
      if (game?.isDaily) game.startDailyFresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
