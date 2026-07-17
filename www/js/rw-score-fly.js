/**
 * Related Words 1v1 — fly +N from solved slots to the score odometer.
 */
(function (global) {
  'use strict';

  const POP_MS = 260;
  const TRAVEL_MS = 460;

  function reduceMotion() {
    return global.UserPreferences?.shouldReduceMotion?.() === true;
  }

  function getPanelFlyOrigin(panelSlotsEl, offsetAbove = 20) {
    if (!panelSlotsEl) return null;
    const r = panelSlotsEl.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: r.left + r.width / 2,
      y: r.top - offsetAbove,
      anchor: 'above',
    };
  }

  function getElementsCenter(els) {
    const nodes = [...(els || [])].filter(Boolean);
    if (!nodes.length) return null;
    const rects = nodes.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      anchor: 'center',
    };
  }

  function getElCenter(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, anchor: 'center' };
  }

  function anchorTransform(anchor, scale = 1) {
    if (anchor === 'above') {
      return `translate(-50%, -100%) scale(${scale})`;
    }
    return `translate(-50%, -50%) scale(${scale})`;
  }

  function bumpStack(stackEl) {
    if (!stackEl) return;
    stackEl.classList.remove('rw-score-bump', 'rw-score-arrived');
    void stackEl.offsetWidth;
    stackEl.classList.add('rw-score-bump', 'rw-score-arrived');
    global.setTimeout(() => {
      stackEl.classList.remove('rw-score-bump', 'rw-score-arrived');
    }, 520);
  }

  function markSourceSlots(slots, on) {
    slots.forEach((el) => el.classList.toggle('rw-score-source', on));
  }

  function wait(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  /**
   * @param {object} opts
   * @param {number} opts.points
   * @param {{x:number,y:number}|null} opts.from
   * @param {Element|null} opts.toEl
   * @param {Element|null} opts.stackEl
   * @param {Element[]} [opts.sourceSlots]
   * @param {'my'|'opp'} [opts.team]
   * @param {Function} [opts.onPop]
   */
  async function play({
    points,
    from,
    toEl,
    stackEl,
    sourceSlots = [],
    team = 'my',
    onPop,
  } = {}) {
    const pts = Math.max(1, Math.floor(Number(points) || 1));
    const to = getElCenter(toEl);
    if (!from || !to) return;

    const firePop = () => {
      if (typeof onPop === 'function') onPop();
    };

    if (reduceMotion()) {
      firePop();
      bumpStack(stackEl);
      return;
    }

    markSourceSlots(sourceSlots, true);

    const badge = document.createElement('div');
    badge.className = 'rw-score-fly-badge';
    badge.classList.add(team === 'opp' ? 'rw-score-fly-badge--enemy' : 'rw-score-fly-badge--you');
    if (pts >= 2) badge.classList.add('rw-score-fly-badge--multi');
    badge.textContent = `+${pts}`;
    badge.setAttribute('aria-hidden', 'true');
    document.body.appendChild(badge);

    const anchor = from.anchor || 'above';
    const travelMs = pts >= 3 ? 380 : pts >= 2 ? 420 : TRAVEL_MS;

    badge.style.left = `${from.x}px`;
    badge.style.top = `${from.y}px`;
    badge.style.transform = anchorTransform(anchor, 0.5);
    badge.style.opacity = '0';

    requestAnimationFrame(() => {
      badge.classList.add('is-pop');
      badge.style.transform = anchorTransform(anchor, pts >= 2 ? 1.18 : 1.1);
      badge.style.opacity = '1';
      firePop();
    });

    await wait(POP_MS);

    badge.classList.remove('is-pop');
    badge.classList.add('is-travel');
    badge.style.transitionDuration = `${travelMs}ms, ${travelMs}ms, ${travelMs}ms, ${Math.round(travelMs * 0.75)}ms`;
    badge.style.left = `${to.x}px`;
    badge.style.top = `${to.y}px`;
    badge.style.transform = 'translate(-50%, -50%) scale(0.78)';
    badge.style.opacity = '0.95';

    await wait(travelMs);

    badge.remove();
    markSourceSlots(sourceSlots, false);
    bumpStack(stackEl);
  }

  global.RwScoreFly = {
    play,
    getPanelFlyOrigin,
    getElementsCenter,
    getElCenter,
    bumpStack,
  };
})(typeof window !== 'undefined' ? window : globalThis);
