/**
 * Vowel merge dock — combine two basic vowel jamo into a compound medial.
 * Left slot + right slot (order matters). Preview shows faint result before merge.
 */
(function (global) {
  'use strict';

  const HC = () => global.HangulCompose;

  class VowelMergeDock {
    constructor(rootEl, callbacks) {
      this.root = rootEl;
      this.callbacks = callbacks;
      this.slotEls = [];
      this.resultEl = null;
      this.previewEl = null;
      this.slotTileIds = [null, null];
      this.resultTileId = null;
      this._mount();
    }

    _mount() {
      this.root.innerHTML = `
        <div class="merge-machine">
          <div class="merge-input-row">
            <div class="merge-slot" data-merge-slot="0" aria-label="Merge left slot"></div>
            <span class="merge-op" aria-hidden="true">+</span>
            <div class="merge-slot" data-merge-slot="1" aria-label="Merge right slot"></div>
          </div>
          <span class="merge-op merge-arrow" aria-hidden="true">⇅</span>
          <div class="merge-result" data-merge-result aria-label="Merged vowel">
            <span class="merge-preview-glyphs" aria-hidden="true"></span>
          </div>
        </div>
      `;
      this.slotEls = [
        this.root.querySelector('[data-merge-slot="0"]'),
        this.root.querySelector('[data-merge-slot="1"]'),
      ];
      this.resultEl = this.root.querySelector('[data-merge-result]');
      this.previewEl = this.root.querySelector('.merge-preview-glyphs');
    }

    reset() {
      this.slotTileIds = [null, null];
      this.resultTileId = null;
      this.slotEls.forEach((el) => {
        el.classList.remove('filled', 'drag-over');
        el.innerHTML = '';
      });
      this.resultEl.classList.remove('filled', 'drag-over', 'has-preview');
      this.resultEl.innerHTML = '';
      const preview = document.createElement('span');
      preview.className = 'merge-preview-glyphs';
      preview.setAttribute('aria-hidden', 'true');
      this.resultEl.appendChild(preview);
      this.previewEl = preview;
      this.updatePreview();
    }

    getOrderedMergePreview() {
      if (this.resultTileId) return null;
      const left = this.slotTileIds[0]
        ? this.callbacks.getTile(this.slotTileIds[0])?.char
        : null;
      const right = this.slotTileIds[1]
        ? this.callbacks.getTile(this.slotTileIds[1])?.char
        : null;
      if (!left || !right) return null;
      return HC()?.tryComposeVerticalMedial?.(left, right) || null;
    }

    updatePreview() {
      if (!this.previewEl) return;
      const merged = this.getOrderedMergePreview();
      if (merged) {
        this.previewEl.textContent = merged;
        this.resultEl.classList.add('has-preview');
      } else {
        this.previewEl.textContent = '';
        this.resultEl.classList.remove('has-preview');
      }
    }

    findDropTarget(x, y) {
      if (global.KoreanMatchDrag?.active) {
        return this._findDropTargetByRect(x, y);
      }
      const ignore = [
        global.KoreanMatchDrag?.ghost,
        document.querySelector('.tile-ghost'),
        document.querySelector('.jamo-ghost'),
      ].filter(Boolean);
      const el = global.DragHitTest?.elementAtPoint(x, y, ignore) ?? document.elementFromPoint(x, y);
      if (!el) return null;
      const slot = el.closest('[data-merge-slot]');
      if (slot && this.root.contains(slot)) {
        return { type: 'slot', index: parseInt(slot.dataset.mergeSlot, 10) };
      }
      const result = el.closest('[data-merge-result]');
      if (result && this.root.contains(result)) return { type: 'result' };
      if (el.closest('#vowel-merge-dock, #builder-vowel-merge-dock')) {
        return { type: 'dock' };
      }
      return null;
    }

    _findDropTargetByRect(x, y) {
      const hit = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };
      for (let i = 0; i < this.slotEls.length; i++) {
        if (hit(this.slotEls[i])) return { type: 'slot', index: i };
      }
      if (hit(this.resultEl)) return { type: 'result' };
      if (hit(this.root)) return { type: 'dock' };
      return null;
    }

    highlightTarget(target, on) {
      if (!target) return;
      if (target.type === 'slot') {
        this.slotEls[target.index]?.classList.toggle('drag-over', on);
      } else if (target.type === 'result') {
        this.resultEl.classList.toggle('drag-over', on);
      } else if (target.type === 'dock') {
        this.root.classList.toggle('drag-over', on);
      }
    }

    clearHighlights() {
      this.slotEls.forEach((el) => el.classList.remove('drag-over', 'tap-target'));
      this.resultEl.classList.remove('drag-over', 'tap-target');
      this.root.classList.remove('drag-over', 'tap-target');
    }

    /** Yellow glow on merge targets valid for the selected tile. */
    highlightValidTargetsForTile(tile) {
      if (!tile || tile.locked) return;
      if (tile.isMerged && tile.mergeDockRef === 'result') {
        this.resultEl.classList.add('tap-target');
        return;
      }
      if (tile.isMerged && tile.inBank && !this.hasResult() && !this.hasSlotTiles()) {
        this.resultEl.classList.add('tap-target');
        return;
      }
      if (!this.canAcceptInSlot(tile)) return;
      this.slotEls.forEach((el) => el.classList.add('tap-target'));
    }

    clearTapHighlights() {
      this.slotEls.forEach((el) => el.classList.remove('tap-target'));
      this.resultEl.classList.remove('tap-target');
      this.root.classList.remove('tap-target');
    }

    hasSlotTiles() {
      return this.slotTileIds.some(Boolean);
    }

    hasBothSlots() {
      return !!(this.slotTileIds[0] && this.slotTileIds[1]);
    }

    hasResult() {
      return !!this.resultTileId;
    }

    canMerge() {
      return this.hasBothSlots() && !this.hasResult() && !!this.getOrderedMergePreview();
    }

    canSplit() {
      return this.hasResult() && !this.hasSlotTiles();
    }

    canAcceptInSlot(tile) {
      if (!tile || tile.locked) return false;
      if (tile.zoneType === 'cho' || tile.zoneType === 'jong') return false;
      if (tile.isMerged) return HC()?.isVerticalMergeMedial?.(tile.char);
      return HC()?.PLACEABLE_VERTICAL_VOWELS?.has(tile.char);
    }

    tryDrop(tile, target) {
      if (!tile || tile.locked) return false;

      if (tile.isMerged) {
        if (target.type === 'result') {
          if (this.hasSlotTiles()) return false;
          if (this.hasResult() && this.resultTileId !== tile.id) return false;
          return this.placeInResult(tile);
        }
        if (!this.canSplit()) return false;
        if (tile.mergeDockRef === 'result' && target.type === 'slot') {
          return this.unmergeTile(tile);
        }
        return false;
      }

      if (!this.canAcceptInSlot(tile)) return false;

      if (target.type === 'dock') {
        const emptyIdx = this.slotTileIds.findIndex((id) => !id);
        if (emptyIdx < 0) return false;
        return this.placeInSlot(emptyIdx, tile);
      }

      if (target.type === 'slot') {
        return this.placeInSlot(target.index, tile);
      }
      return false;
    }

    placeInSlot(index, tile) {
      if (!this.canAcceptInSlot(tile)) return false;

      const existingId = this.slotTileIds[index];
      if (existingId && existingId !== tile.id) {
        const existing = this.callbacks.getTile(existingId);
        if (existing && this.callbacks.swapTiles) {
          const ok = this.callbacks.swapTiles(tile, existing);
          if (ok) this.updatePreview();
          return ok;
        }
      }
      const ok = this.placeInSlotEmpty(index, tile);
      if (ok) this.updatePreview();
      return ok;
    }

    placeInSlotEmpty(index, tile) {
      if (!this.canAcceptInSlot(tile)) return false;
      if (this.hasResult() && tile.mergeDockRef !== 'slot') return false;

      if (tile.mergeDockRef === 'result') this.clearResultTileRef(tile);
      if (tile.mergeDockRef === 'slot') {
        const prevIdx = tile.mergeDockSlot;
        if (this.slotTileIds[prevIdx] === tile.id) this.slotTileIds[prevIdx] = null;
      }
      if (tile.zoneRef) this.callbacks.detachZoneTile?.(tile);

      this.slotTileIds[index] = tile.id;
      tile.inBank = false;
      tile.mergeDockRef = 'slot';
      tile.mergeDockSlot = index;
      tile.zoneRef = null;

      const el = this.callbacks.renderTileInSlot?.(tile) || tile.el;
      el.classList?.remove('hidden-in-bank', 'dragging', 'selected', 'in-zone', 'snap-in');
      el.style.removeProperty('transform');
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      el.style.removeProperty('width');
      el.style.removeProperty('height');
      this.slotEls[index].classList.add('filled');
      this.slotEls[index].innerHTML = '';
      this.slotEls[index].appendChild(el);

      global.SoundEffects?.mergeSlot?.();
      return true;
    }

    placeInResult(tile) {
      if (!tile?.isMerged) return false;
      if (this.resultTileId && this.resultTileId !== tile.id) return false;
      if (this.hasSlotTiles()) return false;
      if (tile.zoneRef) {
        tile.zoneRef.placedTileId = null;
        tile.zoneRef.clear();
        tile.zoneRef = null;
      }
      this.resultTileId = tile.id;
      tile.mergeDockRef = 'result';
      tile.inBank = false;
      tile.zoneRef = null;
      const el = this.callbacks.renderTileInSlot?.(tile) || tile.el;
      el.classList?.remove('hidden-in-bank', 'dragging', 'selected', 'in-zone', 'snap-in');
      el.style.removeProperty('transform');
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      el.style.removeProperty('width');
      el.style.removeProperty('height');
      this.resultEl.classList.add('filled');
      this.resultEl.classList.remove('has-preview');
      if (this.previewEl) this.previewEl.textContent = '';
      this.resultEl.querySelectorAll('.jamo-tile').forEach((n) => n.remove());
      this.resultEl.appendChild(el);
      return true;
    }

    tryCompose(options = {}) {
      if (!this.canMerge()) return;

      const playSound = options.playSound !== false;

      const chars = this.slotTileIds.map((id) => {
        const t = id ? this.callbacks.getTile(id) : null;
        return t ? t.char : null;
      });
      const merged = HC().tryComposeVerticalMedial(chars[0], chars[1]);
      if (!merged) return;

      const syllableIndex = this.callbacks.getTile(this.slotTileIds[0])?.syllableIndex;
      this.slotTileIds.forEach((id, i) => {
        if (!id) return;
        const t = this.callbacks.getTile(id);
        this.slotEls[i].classList.remove('filled');
        this.slotEls[i].innerHTML = '';
        this.callbacks.removeTile?.(id);
        this.slotTileIds[i] = null;
        if (t) t.mergeDockRef = null;
      });

      const mergedTile = this.callbacks.createMergedTile({
        char: merged,
        syllableIndex,
        mergeSources: chars.slice(),
      });
      this.resultTileId = mergedTile.id;
      mergedTile.mergeDockRef = 'result';
      mergedTile.inBank = false;

      this.resultEl.classList.add('filled');
      this.resultEl.classList.remove('has-preview');
      if (this.previewEl) this.previewEl.textContent = '';
      this.resultEl.querySelectorAll('.jamo-tile').forEach((n) => n.remove());
      const el = this.callbacks.renderTileInSlot?.(mergedTile) || mergedTile.el;
      el.classList?.remove('hidden-in-bank', 'dragging');
      this.resultEl.appendChild(el);
      if (playSound) global.SoundEffects?.merge?.();
    }

    unmergeTile(mergedTile) {
      if (!mergedTile?.isMerged) return false;

      const pair = (mergedTile.mergeSources?.length === 2
        ? mergedTile.mergeSources
        : HC().getMergePairComponents(mergedTile.char));
      if (!pair || pair.length !== 2) return false;

      const fromResult = mergedTile.mergeDockRef === 'result';
      const syllableIndex = mergedTile.syllableIndex;

      if (fromResult) {
        if (!this.canSplit()) return false;
        this.clearResult();
      } else if (mergedTile.inBank && !mergedTile.mergeDockRef) {
        if (this.hasResult() || this.hasSlotTiles()) return false;
        this.callbacks.removeTile?.(mergedTile.id);
      } else {
        return false;
      }

      pair.forEach((char, i) => {
        const basic = this.callbacks.createBasicTile({
          char,
          syllableIndex,
          zoneType: 'jungV',
        });
        if (fromResult) {
          this.placeInSlotEmpty(i, basic);
        } else {
          this.callbacks.returnTileToBank?.(basic);
        }
      });

      this.updatePreview();
      return true;
    }

    clearResult() {
      if (!this.resultTileId) return;
      const t = this.callbacks.getTile(this.resultTileId);
      if (t) this.callbacks.removeTile?.(this.resultTileId);
      this.resultTileId = null;
      this.resultEl.classList.remove('filled');
      this.resultEl.querySelectorAll('.jamo-tile').forEach((n) => n.remove());
      this.updatePreview();
    }

    clearResultTileRef(tile) {
      if (this.resultTileId === tile.id) {
        this.resultTileId = null;
        this.resultEl.classList.remove('filled');
        this.resultEl.querySelectorAll('.jamo-tile, .merge-live-glyph').forEach((n) => n.remove());
        this.updatePreview();
      }
    }

    clearSlotsAndResult() {
      this.slotTileIds.forEach((id, i) => {
        if (id) this.callbacks.removeTile?.(id);
        this.slotTileIds[i] = null;
        this.slotEls[i].classList.remove('filled');
        this.slotEls[i].innerHTML = '';
      });
      this.clearResult();
    }

    takeResultTileIfDragging(tile) {
      if (this.resultTileId !== tile.id) return;
      this.resultEl.classList.remove('filled');
      this.resultEl.querySelectorAll('.jamo-tile, .merge-live-glyph').forEach((n) => n.remove());
    }

    onTapSlot(index) {
      const id = this.slotTileIds[index];
      if (!id) return null;
      const tile = this.callbacks.getTile(id);
      this.callbacks.returnTileToBank?.(tile);
      this.slotTileIds[index] = null;
      this.slotEls[index].classList.remove('filled');
      this.slotEls[index].innerHTML = '';
      if (tile) tile.mergeDockRef = null;
      this.updatePreview();
      return tile;
    }

    restoreTile(tile) {
      if (!tile) return;
      if (tile.isMerged && this.resultTileId === tile.id) {
        this.resultEl.classList.add('filled');
        this.resultEl.classList.remove('has-preview');
        this.resultEl.querySelectorAll('.jamo-tile').forEach((n) => n.remove());
        const el = this.callbacks.renderTileInSlot?.(tile) || tile.el;
        el.classList?.remove('hidden-in-bank', 'dragging', 'snap-in', 'selected', 'in-zone');
        this.resultEl.appendChild(el);
        tile.mergeDockRef = 'result';
        tile.inBank = false;
        tile.zoneRef = null;
        return;
      }
      if (tile.mergeDockRef === 'slot' && tile.mergeDockSlot != null) {
        this.placeInSlot(tile.mergeDockSlot, tile);
      }
    }

    getResultTile() {
      return this.resultTileId ? this.callbacks.getTile(this.resultTileId) : null;
    }

    serializeLiveChars() {
      const slots = this.slotTileIds.map((id) => (
        id ? this.callbacks.getTile(id)?.char ?? null : null
      ));
      const result = this.resultTileId
        ? this.callbacks.getTile(this.resultTileId)?.char ?? null
        : null;
      return {
        slots,
        slotIds: [...this.slotTileIds],
        result,
        resultId: this.resultTileId || null,
      };
    }

    /** Plain glyph fallback when the watcher cannot resolve a tile id. */
    _liveGlyphEl(char) {
      const el = document.createElement('span');
      el.className = 'merge-live-glyph';
      el.setAttribute('aria-hidden', 'true');
      el.textContent = char;
      return el;
    }

    showLiveSlotGlyph(index, char) {
      const el = this.slotEls[index];
      if (!el || !char) return;
      el.classList.add('filled');
      el.innerHTML = '';
      el.appendChild(this._liveGlyphEl(char));
    }

    showLiveResultGlyph(char) {
      if (!char) return;
      this.resultEl.classList.add('filled');
      this.resultEl.classList.remove('has-preview');
      if (this.previewEl) this.previewEl.textContent = '';
      this.resultEl.querySelectorAll('.jamo-tile, .merge-live-glyph').forEach((n) => n.remove());
      const tile = document.createElement('span');
      tile.className = 'jamo-tile opp-reveal-tile in-zone';
      tile.innerHTML = `<span class="jamo-tile-face jamo-tile-front">${char}</span>`;
      this.resultEl.appendChild(tile);
    }

    applyLiveChars(slots = [null, null], result = null) {
      this.slotEls.forEach((el, i) => {
        el.classList.remove('filled');
        el.innerHTML = '';
        if (slots[i]) this.showLiveSlotGlyph(i, slots[i]);
      });
      this.resultEl.classList.remove('filled', 'has-preview');
      this.resultEl.querySelectorAll('.jamo-tile, .merge-live-glyph').forEach((n) => n.remove());
      if (this.previewEl) this.previewEl.textContent = '';
      if (result) this.showLiveResultGlyph(result);
      else this.updatePreview();
    }

    /** Clear merge dock bookkeeping when a tile leaves for the syllable grid */
    clearMergeSlotRef(tile) {
      if (!tile) return;
      if (tile.mergeDockRef === 'slot' && tile.mergeDockSlot != null) {
        const idx = tile.mergeDockSlot;
        if (this.slotTileIds[idx] === tile.id) {
          this.slotTileIds[idx] = null;
          this.slotEls[idx]?.classList.remove('filled');
          this.slotEls[idx].innerHTML = '';
          this.updatePreview();
        }
      }
      if (tile.mergeDockRef === 'result' && this.resultTileId === tile.id) {
        this.clearResultTileRef(tile);
      }
    }
  }

  global.VowelMergeDock = VowelMergeDock;
})(typeof window !== 'undefined' ? window : globalThis);
