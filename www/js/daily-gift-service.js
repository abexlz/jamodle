/**
 * Daily login rewards — 30-day consecutive login track.
 */
(function (global) {
  'use strict';

  const TRACK_LENGTH = 30;

  const LOGIN_REWARDS = [
    { day: 1, type: 'coins', amount: 10, icon: '🪙' },
    { day: 2, type: 'coins', amount: 10, icon: '🪙' },
    { day: 3, type: 'coins', amount: 12, icon: '🪙' },
    { day: 4, type: 'coins', amount: 12, icon: '🪙' },
    { day: 5, type: 'coins', amount: 15, icon: '🪙' },
    { day: 6, type: 'coins', amount: 15, icon: '🪙' },
    { day: 7, type: 'hintToken', amount: 1, icon: '💡' },
    { day: 8, type: 'coins', amount: 18, icon: '🪙' },
    { day: 9, type: 'coins', amount: 18, icon: '🪙' },
    { day: 10, type: 'coins', amount: 20, icon: '🪙' },
    { day: 11, type: 'coins', amount: 20, icon: '🪙' },
    { day: 12, type: 'coins', amount: 22, icon: '🪙' },
    { day: 13, type: 'coins', amount: 22, icon: '🪙' },
    { day: 14, type: 'xp', amount: 30, icon: '⭐' },
    { day: 15, type: 'coins', amount: 25, icon: '🪙' },
    { day: 16, type: 'coins', amount: 25, icon: '🪙' },
    { day: 17, type: 'coins', amount: 28, icon: '🪙' },
    { day: 18, type: 'coins', amount: 28, icon: '🪙' },
    { day: 19, type: 'coins', amount: 30, icon: '🪙' },
    { day: 20, type: 'coins', amount: 30, icon: '🪙' },
    { day: 21, type: 'extraGuess', amount: 1, icon: '❤️' },
    { day: 22, type: 'coins', amount: 32, icon: '🪙' },
    { day: 23, type: 'coins', amount: 34, icon: '🪙' },
    { day: 24, type: 'coins', amount: 36, icon: '🪙' },
    { day: 25, type: 'coins', amount: 38, icon: '🪙' },
    { day: 26, type: 'coins', amount: 40, icon: '🪙' },
    { day: 27, type: 'coins', amount: 42, icon: '🪙' },
    { day: 28, type: 'coins', amount: 44, icon: '🪙' },
    { day: 29, type: 'coins', amount: 46, icon: '🪙' },
    { day: 30, type: 'coins', amount: 100, icon: '🎁' },
  ];

  function getTodayKey() {
    return global.ProfileService?.getTodayKey?.()
      || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  }

  function getYesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  function loadProfile() {
    return global.ProfileService?.loadProfile?.();
  }

  function normalizeStreakDay(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    if (n > TRACK_LENGTH) return TRACK_LENGTH;
    return n;
  }

  function getRewardForDay(day) {
    return LOGIN_REWARDS.find((r) => r.day === day) || LOGIN_REWARDS[0];
  }

  function resolveClaimDay(profile) {
    const today = getTodayKey();
    const yesterday = getYesterdayKey();
    const last = profile.lastDailyGiftDayKey || '';
    let streakDay = normalizeStreakDay(profile.dailyLoginStreakDay);

    if (last === today) {
      return { claimDay: Math.max(1, streakDay - 1), alreadyClaimed: true };
    }

    if (!last) {
      return { claimDay: 1, alreadyClaimed: false };
    }

    if (last === yesterday) {
      return { claimDay: streakDay, alreadyClaimed: false };
    }

    return { claimDay: 1, alreadyClaimed: false, streakBroken: true };
  }

  function getTrackSnapshot() {
    const profile = loadProfile();
    if (!profile) {
      return {
        canClaimToday: false,
        claimDay: 1,
        nextDay: 1,
        trackLength: TRACK_LENGTH,
        days: [],
        streakBroken: false,
      };
    }

    const { claimDay, alreadyClaimed, streakBroken } = resolveClaimDay(profile);
    const nextDay = alreadyClaimed
      ? normalizeStreakDay(profile.dailyLoginStreakDay)
      : claimDay;

    const days = LOGIN_REWARDS.map((reward) => {
      let state = 'locked';
      if (reward.day < nextDay || (reward.day === claimDay && alreadyClaimed)) {
        state = 'claimed';
      } else if (reward.day === claimDay && !alreadyClaimed) {
        state = 'today';
      }
      return { ...reward, state };
    });

    return {
      canClaimToday: !alreadyClaimed,
      claimDay,
      nextDay,
      trackLength: TRACK_LENGTH,
      days,
      streakBroken: !!streakBroken,
      reward: getRewardForDay(claimDay),
    };
  }

  function canClaimToday() {
    const profile = loadProfile();
    if (!profile) return false;
    return profile.lastDailyGiftDayKey !== getTodayKey();
  }

  function applyReward(profile, reward) {
    if (!profile || !reward) return profile;
    switch (reward.type) {
      case 'coins':
        profile.coins = (profile.coins || 0) + reward.amount;
        break;
      case 'xp':
        profile.totalXp = (profile.totalXp || 0) + reward.amount;
        break;
      case 'hintToken':
        global.HintTokens?.grant?.(reward.amount);
        break;
      case 'extraGuess':
        profile.extraGuessTokens = (profile.extraGuessTokens || 0) + reward.amount;
        break;
      default:
        break;
    }
    return profile;
  }

  function claimToday() {
    const profile = loadProfile();
    if (!profile) return { ok: false, reason: 'no-profile' };

    const today = getTodayKey();
    if (profile.lastDailyGiftDayKey === today) {
      return { ok: false, reason: 'already-claimed' };
    }

    const { claimDay } = resolveClaimDay(profile);
    const reward = getRewardForDay(claimDay);
    applyReward(profile, reward);

    profile.lastDailyGiftDayKey = today;
    profile.dailyLoginStreakDay = claimDay >= TRACK_LENGTH ? 1 : claimDay + 1;
    global.ProfileService?.saveProfile?.(profile);

    global.PlayerHud?.refresh?.();
    const menuRoot = document.getElementById('menu-root');
    if (menuRoot) global.ShopUI?.refreshSection?.(menuRoot);

    return {
      ok: true,
      claimDay,
      reward,
      totalCoins: profile.coins,
      cycleComplete: claimDay >= TRACK_LENGTH,
    };
  }

  global.DailyGiftService = {
    TRACK_LENGTH,
    LOGIN_REWARDS,
    getTodayKey,
    getYesterdayKey,
    getRewardForDay,
    getTrackSnapshot,
    canClaimToday,
    claimToday,
    applyReward,
    resolveClaimDay,
  };
})(typeof window !== 'undefined' ? window : globalThis);
