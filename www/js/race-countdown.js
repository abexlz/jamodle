/**
 * Shared pre-race countdown helpers for 1v1 screens.
 */
(function (global) {
  'use strict';

  const DEFAULT_COUNTDOWN_SEC = 3;
  const TICK_STALE_MS = 250;

  function countdownTotalMs(countdownSec) {
    const sec = Number(countdownSec) > 0 ? Number(countdownSec) : DEFAULT_COUNTDOWN_SEC;
    return sec * 1000;
  }

  /** Seconds left to display (3 → 2 → 1), capped at countdownSec. */
  function countdownDisplaySec(remainingMs, countdownSec) {
    const cap = Number(countdownSec) > 0 ? Number(countdownSec) : DEFAULT_COUNTDOWN_SEC;
    const sec = Math.ceil(Math.max(0, remainingMs) / 1000);
    return Math.min(cap, Math.max(1, sec));
  }

  function clearCountdownTimers(state) {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
    if (state._countdownFallbackTimer) {
      clearTimeout(state._countdownFallbackTimer);
      state._countdownFallbackTimer = null;
    }
  }

  /**
   * Drive a pre-race countdown overlay. Re-entrant when Firestore pushes
   * duplicate active-state updates during the same countdown window.
   */
  function runCountdown(state, { el, raceStartMs, countdownSec, onDone, goLabel }) {
    if (state.countdownDone) {
      onDone();
      return;
    }
    if (!el) {
      onDone();
      return;
    }

    const now = Date.now();
    if (state._countdownEndMs === raceStartMs && state.countdownTimer) {
      // Same window: skip restart only if the interval is still ticking.
      if (state._countdownLastTickAt && now - state._countdownLastTickAt < TICK_STALE_MS) {
        return;
      }
      clearCountdownTimers(state);
    }
    state._countdownEndMs = raceStartMs;

    el.classList.remove('hidden');
    const cap = Number(countdownSec) > 0 ? Number(countdownSec) : DEFAULT_COUNTDOWN_SEC;

    const finish = () => {
      if (state.countdownDone) return;
      state.countdownDone = true;
      clearCountdownTimers(state);
      el.textContent = goLabel || 'Go!';
      el.classList.add('go');
      setTimeout(() => {
        el.classList.add('hidden');
        onDone();
      }, 600);
    };

    const tick = () => {
      state._countdownLastTickAt = Date.now();
      const remaining = raceStartMs - Date.now();
      if (remaining <= 0) {
        finish();
        return;
      }
      el.textContent = String(countdownDisplaySec(remaining, cap));
      el.classList.remove('go');
    };

    tick();
    if (state.countdownDone) return;

    clearCountdownTimers(state);
    state.countdownTimer = setInterval(tick, 100);

    const msUntilEnd = Math.max(0, raceStartMs - Date.now());
    state._countdownFallbackTimer = setTimeout(finish, msUntilEnd + 100);
  }

  global.RaceCountdown = {
    DEFAULT_COUNTDOWN_SEC,
    countdownTotalMs,
    countdownDisplaySec,
    runCountdown,
  };
})(typeof window !== 'undefined' ? window : globalThis);
