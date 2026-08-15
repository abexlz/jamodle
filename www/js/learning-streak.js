/**
 * Korean Learning Streak — one streak day per calendar day (Asia/Seoul)
 * when the user completes any Korean learning activity.
 */
(function (global) {
  'use strict';

  const STREAK_KEY = 'jamodeul-korean-learning-streak';
  const DAILY_TZ = 'Asia/Seoul';

  const MILESTONES = [
    { days: 3, badge: '🌱', message: '3-day streak! You are building a great habit!' },
    { days: 7, badge: '⭐', message: '7-day streak! One week of Korean learning!' },
    { days: 14, badge: '🏅', message: '14-day streak! Amazing dedication!' },
    { days: 30, badge: '🎖️', message: '30-day streak! You are a Korean learning champion!' },
  ];

  function getTodayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function getYesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  function loadStreak() {
    const empty = {
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      todayCompleted: false,
      todayDate: null,
      milestonesEarned: [],
    };
    const data = global.AppStorage ? global.AppStorage.get(STREAK_KEY, {}) : {};
    if (!data || typeof data !== 'object') return empty;
    return {
      currentStreak: Math.max(0, parseInt(data.currentStreak, 10) || 0),
      longestStreak: Math.max(0, parseInt(data.longestStreak, 10) || 0),
      lastActivityDate: data.lastActivityDate || null,
      todayCompleted: !!data.todayCompleted,
      todayDate: data.todayDate || null,
      milestonesEarned: Array.isArray(data.milestonesEarned) ? data.milestonesEarned : [],
    };
  }

  function saveStreak(data) {
    if (global.AppStorage) {
      global.AppStorage.set(STREAK_KEY, data);
    } else {
      try {
        localStorage.setItem(STREAK_KEY, JSON.stringify(data));
      } catch {}
    }
  }

  function syncTodayState(data) {
    const today = getTodayKey();
    if (data.todayDate !== today) {
      data.todayCompleted = false;
      data.todayDate = today;
    }
    return data;
  }

  /**
   * Record a learning activity completion.
   * @param {'builder'|'match'|'daily-match'|'vowel-practice'} activityType
   * @returns {{ streakDays: number, newMilestone: object|null, savedToday: boolean }}
   */
  function recordActivity(activityType) {
    if (activityType === 'daily-match') {
      const snap = global.DailyQuizStreak?.getSnapshot?.();
      return {
        streakDays: snap?.currentStreak || 0,
        newMilestone: null,
        savedToday: !!snap?.clearedToday,
        activityType,
      };
    }
    const data = syncTodayState(loadStreak());
    saveStreak(data);
    return {
      streakDays: global.DailyQuizStreak?.getSnapshot?.().currentStreak || data.currentStreak,
      newMilestone: null,
      savedToday: data.todayCompleted,
      activityType,
    };
  }

  function getDisplayInfo() {
    const snap = global.DailyQuizStreak?.getSnapshot?.();
    if (snap) {
      const tFn = (key, vars) => global.I18n?.t(key, vars) ?? '';
      return {
        streakDays: snap.currentStreak,
        longestStreak: snap.longestStreak,
        savedToday: snap.clearedToday,
        progressMessage: snap.clearedToday ? tFn('dailyStreak.savedToday') : tFn('dailyStreak.keepStreak'),
        headline: snap.currentStreak > 0
          ? tFn('dailyStreak.headline', { days: snap.currentStreak })
          : tFn('dailyStreak.headlineStart'),
        milestonesEarned: [],
      };
    }
    const data = syncTodayState(loadStreak());
    const streakDays = data.currentStreak;
    const savedToday = data.todayCompleted;
    const tFn = (key, vars) => global.I18n?.t(key, vars) ?? '';
    let progressMessage;
    if (savedToday) progressMessage = tFn('streak.savedToday');
    else if (streakDays > 0) progressMessage = tFn('streak.keepStreak');
    else progressMessage = tFn('streak.startStreak');
    return {
      streakDays,
      longestStreak: data.longestStreak,
      savedToday,
      progressMessage,
      headline: streakDays > 0
        ? tFn('streak.headline', { days: streakDays })
        : tFn('streak.headlineStart'),
      milestonesEarned: data.milestonesEarned,
    };
  }

  function getMilestoneMessage(days) {
    const t = (key) => global.I18n?.t(key) ?? '';
    const map = { 3: 'streak.milestone3', 7: 'streak.milestone7', 14: 'streak.milestone14', 30: 'streak.milestone30' };
    return t(map[days] || '');
  }

  function getLatestMilestone() {
    const { milestonesEarned } = loadStreak();
    if (!milestonesEarned.length) return null;
    const latest = Math.max(...milestonesEarned);
    return MILESTONES.find((m) => m.days === latest) || null;
  }

  global.LearningStreak = {
    MILESTONES,
    getTodayKey,
    loadStreak,
    recordActivity,
    getDisplayInfo,
    getLatestMilestone,
    getMilestoneMessage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
