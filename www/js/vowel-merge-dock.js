/**
 * Vowel merge dock — combine two basic vowel jamo into a compound medial.
 * Dropping a merged result back onto the dock un-merges it.
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
      this.slotTileIds = [null, null];
      this.resultTileId = null;
      this._mount();
    }

    _mount() {
      this.root.innerHTML = `
        <div class="merge-stack">
          <div class="merge-slot" data-merge-slot="0" aria-label="Merge slot 1"></div>
          <span class="merge-op" aria-hidden="true">+</span>
          <div class="merge-slot" data-merge-slot="1" aria-label="Merge slot 2"></div>
        </div>
        <span class="merge-op merge-eq" aria-hidden="true">=</span>
        <div class="merge-result" data-merge-result aria-label="Merged vowel"></div>
      `;
      this.slotEls = [
        this.root.querySelector('[data-merge-slot="0"]'),
        this.root.querySelector('[data-merge-slot="1"]'),
      ];
      this.resultEl = this.root.querySelector('[data-merge-result]');
    }

    reset() {
      this.slotTileIds = [null, null];
      this.resultTileId = null;
      this.slotEls.forEach((el) => {
        el.classList.remove('filled', 'drag-over');
        el.innerHTML = '';
      });
      this.resultEl.classList.remove('filled', 'drag-over');
      this.resultEl.innerHTML = '';
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
        this.slotEls.forEach((el) => el.classList.add('tap-target'));
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

    canAcceptInSlot(tile) {
      if (!tile || tile.locked) return false;
      if (tile.zoneType === 'cho' || tile.zoneType === 'jong') return false;
      if (tile.isMerged) return HC()?.isVerticalMergeMedial?.(tile.char);
      return HC()?.PLACEABLE_VERTICAL_VOWELS?.has(tile.char);
    }

    tryDrop(tile, target) {
      if (!tile || tile.locked) return false;

      if (tile.isMerged) {
        if (tile.mergeDockRef === 'result') {
          if (target.type === 'slot') return this.unmergeTile(tile);
          return false;
        }
        if (target.type === 'dock' || target.type === 'slot' || target.type === 'result') {
          return this.unmergeTile(tile);
        }
      }

      if (!this.canAcceptInSlot(tile)) return false;

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
          return this.callbacks.swapTiles(tile, existing);
        }
      }
      return this.placeInSlotEmpty(index, tile);
    }

    placeInSlotEmpty(index, tile) {
      if (!this.canAcceptInSlot(tile)) return false;

      if (tile.mergeDockRef === 'result') this.clearResultTileRef(tile);
      if (tile.mergeDockRef === 'slot') {
        const prevIdx = tile.mergeDockSlot;
        if (this.slotTileIds[prevIdx] === tile.id) this.slotTileIds[prevIdx] = null;
      }
      if (tile.zoneRef) this.callbacks.clearZoneTile?.(tile);

      this.slotTileIds[index] = tile.id;
      tile.inBank = false;
      tile.mergeDockRef = 'slot';
      tile.mergeDockSlot = index;
      tile.zoneRef = null;

      const el = this.callbacks.renderTileInSlot?.(tile) || tile.el;
      el.classList?.remove('hidden-in-bank', 'dragging', 'selected');
      this.slotEls[index].classList.add('filled');
      this.slotEls[index].innerHTML = '';
      this.slotEls[index].appendChild(el);

      return true;
    }

    placeInResult(tile) {
      if (!tile?.isMerged) return false;
      if (this.resultTileId && this.resultTileId !== tile.id) return false;
      this.resultTileId = tile.id;
      tile.mergeDockRef = 'result';
      tile.inBank = false;
      tile.zoneRef = null;
      const el = this.callbacks.renderTileInSlot?.(tile) || tile.el;
      el.classList?.remove('hidden-in-bank', 'dragging', 'selected');
      this.resultEl.classList.add('filled');
      this.resultEl.innerHTML = '';
      this.resultEl.appendChild(el);
      return true;
    }

    tryCompose() {
      const chars = this.slotTileIds.map((id) => {
        const t = id ? this.callbacks.getTile(id) : null;
        return t ? t.char : null;
      });
      if (!chars[0] || !chars[1]) return;

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
      this.resultEl.innerHTML = '';
      const el = this.callbacks.renderTileInSlot?.(mergedTile) || mergedTile.el;
      el.classList?.remove('hidden-in-bank', 'dragging');
      this.resultEl.appendChild(el);
    }

    unmergeTile(mergedTile) {
      const pair = HC().getMergePairComponents(mergedTile.char);
      if (!pair || pair.length !== 2) return false;

      this.clearSlotsAndResult();

      pair.forEach((char, i) => {
        const basic = this.callbacks.createBasicTile({
          char,
          syllableIndex: mergedTile.syllableIndex,
          zoneType: 'jungV',
        });
        this.slotTileIds[i] = basic.id;
        basic.mergeDockRef = 'slot';
        basic.mergeDockSlot = i;
        basic.inBank = false;
        this.slotEls[i].classList.add('filled');
        this.slotEls[i].innerHTML = '';
        const el = this.callbacks.renderTileInSlot?.(basic) || basic.el;
        this.slotEls[i].appendChild(el);
      });

      this.callbacks.removeTile?.(mergedTile.id);
      return true;
    }

    clearResult() {
      if (!this.resultTileId) return;
      const t = this.callbacks.getTile(this.resultTileId);
      if (t) this.callbacks.removeTile?.(this.resultTileId);
      this.resultTileId = null;
      this.resultEl.classList.remove('filled');
      this.resultEl.innerHTML = '';
    }

    clearResultTileRef(tile) {
      if (this.resultTileId === tile.id) {
        this.resultTileId = null;
        this.resultEl.classList.remove('filled');
        this.resultEl.innerHTML = '';
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
      this.resultEl.innerHTML = '';
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
      return tile;
    }

    restoreTile(tile) {
      if (!tile) return;
      if (tile.isMerged && this.resultTileId === tile.id) {
        this.resultEl.classList.add('filled');
        this.resultEl.innerHTML = '';
        const el = this.callbacks.renderTileInSlot?.(tile) || tile.el;
        el.classList?.remove('hidden-in-bank', 'dragging', 'snap-in', 'selected');
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

    /** Clear merge dock bookkeeping when a tile leaves for the syllable grid */
    clearMergeSlotRef(tile) {
      if (!tile) return;
      if (tile.mergeDockRef === 'slot' && tile.mergeDockSlot != null) {
        const idx = tile.mergeDockSlot;
        if (this.slotTileIds[idx] === tile.id) {
          this.slotTileIds[idx] = null;
          this.slotEls[idx]?.classList.remove('filled');
          this.slotEls[idx].innerHTML = '';
        }
      }
      if (tile.mergeDockRef === 'result' && this.resultTileId === tile.id) {
        this.clearResultTileRef(tile);
      }
    }
  }

  global.VowelMergeDock = VowelMergeDock;
})(typeof window !== 'undefined' ? window : globalThis);
