/**
 * Reliable press feedback on touch devices via .is-pressed (pairs with app-buttons.css).
 */
(function (global) {
  'use strict';

  const PRESSABLE =
    'button, a[role="button"], a.btn, .app-btn, .app-pressable, input[type="button"], input[type="submit"], ' +
    '.race-btn, .home-tab-btn, .top-nav-btn, .back-link, .pause-btn, .learning-mode-card, .match-mode-btn, ' +
    '.key, .tile-btn, .dock-key, [data-pressable]';

  let activeEl = null;

  function isDisabled(el) {
    return (
      !el ||
      el.disabled ||
      el.getAttribute('aria-disabled') === 'true' ||
      el.classList.contains('disabled') ||
      el.classList.contains('is-locked') ||
      el.closest('.no-press')
    );
  }

  function findPressable(target) {
    if (!(target instanceof Element)) return null;
    const el = target.closest(PRESSABLE);
    if (!el || isDisabled(el)) return null;
    if (el.matches('.learning-mode-card.is-locked')) return null;
    return el;
  }

  function shouldAnimate() {
    return !global.UserPreferences || !global.UserPreferences.shouldReduceMotion();
  }

  function press(el) {
    if (!el || !shouldAnimate()) return;
    if (activeEl && activeEl !== el) activeEl.classList.remove('is-pressed');
    activeEl = el;
    el.classList.add('is-pressed');
  }

  function release(el) {
    const target = el || activeEl;
    if (!target) return;
    target.classList.remove('is-pressed');
    if (activeEl === target) activeEl = null;
  }

  function init() {
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        const el = findPressable(e.target);
        if (!el) return;
        press(el);
      },
      { passive: true }
    );

    document.addEventListener(
      'pointerup',
      () => release(),
      { passive: true }
    );

    document.addEventListener(
      'pointercancel',
      () => release(),
      { passive: true }
    );

    document.addEventListener(
      'blur',
      () => release(),
      true
    );

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') release();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ButtonPress = { init, findPressable, press, release };
})(typeof window !== 'undefined' ? window : globalThis);
