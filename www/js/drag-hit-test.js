/**
 * Reliable elementFromPoint during drag — temporarily hide ghost / dragged tile.
 */
(function (global) {
  'use strict';

  function hideForHitTest(els) {
    const hidden = [];
    (els || []).forEach((el) => {
      if (!el) return;
      hidden.push({ el, visibility: el.style.visibility, pe: el.style.pointerEvents });
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    });
    return hidden;
  }

  function restoreAfterHitTest(hidden) {
    hidden.forEach(({ el, visibility, pe }) => {
      el.style.visibility = visibility;
      el.style.pointerEvents = pe;
    });
  }

  /** @returns {Element|null} */
  function elementAtPoint(x, y, ignoreEls) {
    const hidden = hideForHitTest(ignoreEls);
    const el = document.elementFromPoint(x, y);
    restoreAfterHitTest(hidden);
    return el;
  }

  global.DragHitTest = { elementAtPoint, hideForHitTest, restoreAfterHitTest };
})(typeof window !== 'undefined' ? window : globalThis);
