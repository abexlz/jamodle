/**
 * Timed shop/chest buffs — daily unlock pass, XP 2×, coins 2×.
 */
(function (global) {
  'use strict';

  const MS_MIN = 60 * 1000;
  const MS_DAY = 24 * 60 * 60 * 1000;

  const BUFFS = {
    dailyUnlock7: {
      id: 'dailyUnlock7',
      durationMs: 7 * MS_DAY,
      untilKey: 'dailyUnlockUntil',
    },
    xpBoost2x15: {
      id: 'xpBoost2x15',
      durationMs: 15 * MS_MIN,
      untilKey: 'xp2xUntil',
      multiplier: 2,
    },
    coinBoost2x15: {
      id: 'coinBoost2x15',
      durationMs: 15 * MS_MIN,
      untilKey: 'coins2xUntil',
      multiplier: 2,
    },
  };

  function now() {
    return Date.now();
  }

  function loadProfile() {
    return global.ProfileService?.loadProfile?.() || null;
  }

  function saveProfile(profile) {
    return global.ProfileService?.saveProfile?.(profile);
  }

  function normalizeActiveBuffs(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      dailyUnlockUntil: Math.max(0, parseInt(src.dailyUnlockUntil, 10) || 0),
      xp2xUntil: Math.max(0, parseInt(src.xp2xUntil, 10) || 0),
      coins2xUntil: Math.max(0, parseInt(src.coins2xUntil, 10) || 0),
    };
  }

  function getActiveBuffs(profile) {
    const p = profile || loadProfile();
    return normalizeActiveBuffs(p?.activeBuffs);
  }

  function getUntil(buffId, profile) {
    const def = BUFFS[buffId];
    if (!def) return 0;
    return getActiveBuffs(profile)[def.untilKey] || 0;
  }

  function getRemainingMs(buffId, profile) {
    return Math.max(0, getUntil(buffId, profile) - now());
  }

  function isActive(buffId, profile) {
    return getRemainingMs(buffId, profile) > 0;
  }

  function formatRemaining(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  /**
   * Extend or start a buff. Stacks by adding duration onto remaining time.
   * @returns {{ ok: boolean, until: number, remainingMs: number, reason?: string }}
   */
  function activate(buffId, opts = {}) {
    const def = BUFFS[buffId];
    if (!def) return { ok: false, until: 0, remainingMs: 0, reason: 'unknown' };
    const profile = opts.profile || loadProfile();
    if (!profile) return { ok: false, until: 0, remainingMs: 0, reason: 'no-profile' };

    const duration = Math.max(0, Number(opts.durationMs) || def.durationMs);
    if (!duration) return { ok: false, until: 0, remainingMs: 0, reason: 'no-duration' };

    const buffs = getActiveBuffs(profile);
    const currentUntil = buffs[def.untilKey] || 0;
    const base = Math.max(now(), currentUntil);
    const until = base + duration;
    buffs[def.untilKey] = until;
    profile.activeBuffs = buffs;

    if (!opts.skipSave) {
      saveProfile(profile);
      global.PlayerHud?.refresh?.();
    }

    return { ok: true, until, remainingMs: until - now() };
  }

  function xpMultiplier(profile) {
    return isActive('xpBoost2x15', profile) ? (BUFFS.xpBoost2x15.multiplier || 2) : 1;
  }

  function coinMultiplier(profile) {
    return isActive('coinBoost2x15', profile) ? (BUFFS.coinBoost2x15.multiplier || 2) : 1;
  }

  function hasDailyUnlockPass(profile) {
    return isActive('dailyUnlock7', profile);
  }

  function scaleXp(amount, profile) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return 0;
    return n * xpMultiplier(profile);
  }

  function scaleCoins(amount, profile) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return 0;
    return n * coinMultiplier(profile);
  }

  /** Pick a random shop buff id for chest drops. */
  function pickChestBuffId(rng = Math.random) {
    const ids = Object.keys(BUFFS);
    return ids[Math.floor(rng() * ids.length)] || 'xpBoost2x15';
  }

  global.BuffService = {
    BUFFS,
    normalizeActiveBuffs,
    getActiveBuffs,
    getUntil,
    getRemainingMs,
    isActive,
    formatRemaining,
    activate,
    xpMultiplier,
    coinMultiplier,
    hasDailyUnlockPass,
    scaleXp,
    scaleCoins,
    pickChestBuffId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
