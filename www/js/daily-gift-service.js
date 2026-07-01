/**
 * Daily login gift — pick one of three boxes, always awards coins.
 */
(function (global) {
  'use strict';

  const COIN_REWARD = 10;

  const GIFT_TYPES = [
    { id: 'peach', icon: '🍑', accent: 'peach' },
    { id: 'mint', icon: '🌿', accent: 'mint' },
    { id: 'star', icon: '⭐', accent: 'lavender' },
  ];

  function getTodayKey() {
    return global.ProfileService?.getTodayKey?.()
      || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  }

  function loadProfile() {
    return global.ProfileService?.loadProfile?.();
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  /** Deterministic shuffle so today's three gifts vary by date. */
  function getTodaysGifts() {
    const today = getTodayKey();
    const items = [...GIFT_TYPES];
    let seed = hashString(today);
    for (let i = items.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function canClaimToday() {
    const profile = loadProfile();
    if (!profile) return false;
    return profile.lastDailyGiftDayKey !== getTodayKey();
  }

  function claimGift(giftId) {
    const profile = loadProfile();
    if (!profile) return { ok: false, reason: 'no-profile' };
    const today = getTodayKey();
    if (profile.lastDailyGiftDayKey === today) {
      return { ok: false, reason: 'already-claimed' };
    }

    profile.lastDailyGiftDayKey = today;
    profile.coins = (profile.coins || 0) + COIN_REWARD;
    global.ProfileService?.saveProfile?.(profile);

    global.PlayerHud?.refresh?.();
    const menuRoot = document.getElementById('menu-root');
    if (menuRoot) global.ShopUI?.refreshSection?.(menuRoot);

    return {
      ok: true,
      giftId,
      coinsAwarded: COIN_REWARD,
      totalCoins: profile.coins,
    };
  }

  global.DailyGiftService = {
    COIN_REWARD,
    GIFT_TYPES,
    getTodayKey,
    getTodaysGifts,
    canClaimToday,
    claimGift,
  };
})(typeof window !== 'undefined' ? window : globalThis);
