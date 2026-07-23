/**
 * Reliable press feedback on touch devices via .is-pressed (pairs with app-buttons.css).
 * Plays UI tap/nav sounds for pressable controls (game board tiles use their own SFX).
 */
(function (global) {
  'use strict';

  const PRESSABLE =
    'button, a[role="button"], a.btn, .app-btn, .app-pressable, input[type="button"], input[type="submit"], ' +
    '.race-btn, .top-nav-btn, .back-link, .settings-back, .pause-btn, .learning-mode-card, .match-mode-btn, ' +
    '.key, .tile-btn, .dock-key, [data-pressable], ' +
    '.profile-nav-btn, .profile-modal-btn, .profile-login-btn, .profile-nickname-save, ' +
    '.avatar-option, .title-option, .frame-option, .pause-quit-btn, ' +
    '.wheel-spin-btn, .wheel-done-btn, .daily-gift-done-btn, .daily-gift-claim-btn, ' +
    '.menu-wheel-nav, .menu-calendar-nav, .menu-hud-coins, ' +
    '.leaderboard-login-btn, .shop-buy-btn, .quest-claim-btn, .quest-daily-bonus-btn, .quest-scope-btn, ' +
    '.daily-challenge-card, .daily-leaderboard-btn, .menu-battle-game-btn, .battle-mode-action-btn, ' +
    '.match-hint-btn, .match-action-btn, .match-emote-btn, .match-emote-option, ' +
    '.rw-extra-btn, .rw-extra-guess-giveup, .rw-reveal-btn, ' +
    '.daily-cal-play-btn, .daily-cal-unlock-btn, .daily-cal-month-btn, ' +
    '.settings-option-btn, .btn, .pronounce-btn, .answer-speak-btn, .done-lesson-btn, .level-mode-complete-btn, ' +
    '.profile-challenge-btn, ' +
    'a.daily-challenge-card, a.menu-single-player-game-btn, a.menu-tutorial-btn, a.featured-continue-cta, ' +
    'a.race-btn, a.top-nav-btn, a.settings-back';

  const GAME_SOUND_SELECTORS = [
    '.key',
    '.tile-btn',
    '.dock-key',
    '.jamo-tile',
    '.drop-zone',
    '[data-slot-index]',
    '[data-tile-id]',
    '.match-emote-option',
    '.answer-speak-btn',
  ].join(', ');

  const NAV_SOUND_SELECTORS = [
    'a',
    '.top-nav-btn',
    '.back-link',
    '.settings-back',
    '.profile-nav-btn',
    '.daily-challenge-card',
    '.learning-mode-card',
    '.menu-tutorial-btn',
    '.menu-single-player-game-btn',
    '.featured-continue-cta',
    '.daily-leaderboard-btn',
    '.race-btn--home',
  ].join(', ');

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

  function shouldPlaySound() {
    return global.SoundEffects && global.UserPreferences?.get?.()?.soundEffects !== false;
  }

  function usesGameSound(el) {
    return !!el.closest(GAME_SOUND_SELECTORS);
  }

  function pickSound(el) {
    const override = el.dataset.sound;
    if (override === 'none') return null;
    if (override === 'nav') return 'nav';
    if (override === 'tap') return 'tap';
    if (override === 'select') return 'select';
    if (el.matches(NAV_SOUND_SELECTORS)) return 'nav';
    return 'tap';
  }

  function playButtonSound(el) {
    if (!shouldPlaySound() || !el || usesGameSound(el)) return;
    const sound = pickSound(el);
    if (!sound) return;
    global.SoundEffects[sound]?.();
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
        playButtonSound(el);
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

  global.ButtonPress = { init, findPressable, press, release, playButtonSound };
})(typeof window !== 'undefined' ? window : globalThis);
