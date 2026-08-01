/**
 * Daily login rewards — rolling 7-day weeks (1–7, 8–14, …).
 */
(function (global) {
  'use strict';

  const WEEK_LENGTH = 7;
  const MAX_STREAK_DAY = 999;

  /** Base rewards for each day-in-week. Day 7 is a multi-reward jackpot. */
  const WEEK_TEMPLATE = [
    { dayInWeek: 1, rewards: [{ type: 'coins', amount: 10, icon: '🪙' }] },
    { dayInWeek: 2, rewards: [{ type: 'coins', amount: 12, icon: '🪙' }] },
    { dayInWeek: 3, rewards: [{ type: 'coins', amount: 15, icon: '🪙' }] },
    { dayInWeek: 4, rewards: [{ type: 'xp', amount: 20, icon: '⭐' }] },
    { dayInWeek: 5, rewards: [{ type: 'coins', amount: 20, icon: '🪙' }] },
    { dayInWeek: 6, rewards: [{ type: 'extraGuess', amount: 1, icon: '❤️' }] },
    {
      dayInWeek: 7,
      rewards: [
        { type: 'coins', amount: 50, icon: '🪙' },
        { type: 'hintToken', amount: 1, icon: '💡' },
        { type: 'xp', amount: 30, icon: '⭐' },
      ],
    },
  ];

  function getTodayKey() {
    return global.ProfileService?.getTodayKey?.()
      || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  }

  function getYesterdayKey() {
    const today = getTodayKey();
    const parts = String(today).split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    const fallback = new Date();
    fallback.setDate(fallback.getDate() - 1);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(fallback);
  }

  function loadProfile() {
    return global.ProfileService?.loadProfile?.();
  }

  function normalizeStreakDay(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    if (n > MAX_STREAK_DAY) return MAX_STREAK_DAY;
    return n;
  }

  function getWeekInfo(absoluteDay) {
    const day = normalizeStreakDay(absoluteDay);
    const weekIndex = Math.ceil(day / WEEK_LENGTH);
    const dayInWeek = ((day - 1) % WEEK_LENGTH) + 1;
    const weekStart = (weekIndex - 1) * WEEK_LENGTH + 1;
    return {
      weekIndex,
      dayInWeek,
      weekStart,
      weekEnd: weekStart + WEEK_LENGTH - 1,
    };
  }

  function scaleAmount(amount, type, weekIndex) {
    if (type !== 'coins' && type !== 'xp') return amount;
    const week = Math.max(1, weekIndex || 1);
    const bonus = Math.min(week - 1, 4); // +0..+4 weeks of scaling
    return Math.round(amount * (1 + bonus * 0.25));
  }

  function getRewardsForDay(absoluteDay) {
    const { weekIndex, dayInWeek } = getWeekInfo(absoluteDay);
    const template = WEEK_TEMPLATE.find((r) => r.dayInWeek === dayInWeek) || WEEK_TEMPLATE[0];
    return template.rewards.map((reward) => ({
      ...reward,
      amount: scaleAmount(reward.amount, reward.type, weekIndex),
    }));
  }

  function getRewardForDay(absoluteDay) {
    const rewards = getRewardsForDay(absoluteDay);
    return rewards[0] || { type: 'coins', amount: 10, icon: '🪙' };
  }

  function resolveClaimDay(profile) {
    const today = getTodayKey();
    const yesterday = getYesterdayKey();
    const last = profile.lastDailyGiftDayKey || '';
    const streakDay = normalizeStreakDay(profile.dailyLoginStreakDay);

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

  function dayState(absDay, claimDay, alreadyClaimed, nextDay) {
    if (absDay < nextDay || (absDay === claimDay && alreadyClaimed)) return 'claimed';
    if (absDay === claimDay && !alreadyClaimed) return 'today';
    if (alreadyClaimed && absDay === nextDay) return 'tomorrow';
    return 'locked';
  }

  function getTrackSnapshot() {
    const profile = loadProfile();
    if (!profile) {
      return {
        canClaimToday: false,
        claimDay: 1,
        nextDay: 1,
        trackLength: WEEK_LENGTH,
        weekIndex: 1,
        weekStart: 1,
        weekEnd: WEEK_LENGTH,
        days: [],
        streakBroken: false,
        rewards: [],
        reward: null,
      };
    }

    const { claimDay, alreadyClaimed, streakBroken } = resolveClaimDay(profile);
    const nextDay = alreadyClaimed
      ? normalizeStreakDay(profile.dailyLoginStreakDay)
      : claimDay;
    const week = getWeekInfo(claimDay);
    const rewards = getRewardsForDay(claimDay);

    const days = [];
    for (let i = 0; i < WEEK_LENGTH; i += 1) {
      const absDay = week.weekStart + i;
      const dayRewards = getRewardsForDay(absDay);
      const primary = dayRewards[0];
      days.push({
        day: absDay,
        dayInWeek: i + 1,
        weekIndex: week.weekIndex,
        state: dayState(absDay, claimDay, alreadyClaimed, nextDay),
        isJackpot: i + 1 === WEEK_LENGTH,
        rewards: dayRewards,
        type: primary.type,
        amount: primary.amount,
        icon: primary.icon,
      });
    }

    return {
      canClaimToday: !alreadyClaimed,
      claimDay,
      nextDay,
      trackLength: WEEK_LENGTH,
      weekIndex: week.weekIndex,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      days,
      streakBroken: !!streakBroken,
      rewards,
      reward: rewards[0] || null,
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

  function applyRewards(profile, rewards) {
    (rewards || []).forEach((reward) => applyReward(profile, reward));
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
    const rewards = getRewardsForDay(claimDay);
    applyRewards(profile, rewards);

    profile.lastDailyGiftDayKey = today;
    profile.dailyLoginStreakDay = Math.min(MAX_STREAK_DAY, claimDay + 1);
    global.ProfileService?.saveProfile?.(profile);

    global.PlayerHud?.refresh?.();
    const menuRoot = document.getElementById('menu-root');
    if (menuRoot) global.ShopUI?.refreshSection?.(menuRoot);

    const weekComplete = claimDay % WEEK_LENGTH === 0;

    return {
      ok: true,
      claimDay,
      reward: rewards[0] || null,
      rewards,
      totalCoins: profile.coins,
      cycleComplete: weekComplete,
      weekIndex: getWeekInfo(claimDay).weekIndex,
    };
  }

  global.DailyGiftService = {
    WEEK_LENGTH,
    TRACK_LENGTH: WEEK_LENGTH,
    MAX_STREAK_DAY,
    WEEK_TEMPLATE,
    LOGIN_REWARDS: WEEK_TEMPLATE,
    getTodayKey,
    getYesterdayKey,
    getWeekInfo,
    getRewardForDay,
    getRewardsForDay,
    getTrackSnapshot,
    canClaimToday,
    claimToday,
    applyReward,
    applyRewards,
    resolveClaimDay,
  };
})(typeof window !== 'undefined' ? window : globalThis);
