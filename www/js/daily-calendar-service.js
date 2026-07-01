/**
 * Daily Match calendar — completion tracking, past-day unlocks, monthly badges.
 */
(function (global) {
  'use strict';

  const CALENDAR_KEY = 'jamodeul-daily-calendar';
  const DAILY_LAUNCH = '2024-01-01';
  const PAST_DAY_COST = 150;
  const BADGE_THRESHOLDS = [3, 10, 30];
  const BADGE_IDS = ['bronze', 'silver', 'gold'];

  function storageGet(key, fallback) {
    if (global.AppStorage) return global.AppStorage.get(key, fallback);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function storageSet(key, value) {
    if (global.AppStorage) return global.AppStorage.set(key, value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function getTodayKey() {
    return global.MatchDaily?.getTodayKey?.()
      || new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
  }

  function isValidDateKey(key) {
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function compareDateKeys(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  function monthKeyFromDate(dateKey) {
    return dateKey.slice(0, 7);
  }

  function loadCalendarData() {
    const data = storageGet(CALENDAR_KEY, {});
    return {
      unlockedPast: Array.isArray(data.unlockedPast) ? [...data.unlockedPast] : [],
      earnedBadges: data.earnedBadges && typeof data.earnedBadges === 'object'
        ? { ...data.earnedBadges }
        : {},
    };
  }

  function saveCalendarData(data) {
    storageSet(CALENDAR_KEY, data);
  }

  function dailySaveKey(dateKey) {
    return 'jamodeul-match-daily-' + dateKey;
  }

  function loadDailySaved(dateKey) {
    const key = dailySaveKey(dateKey);
    if (global.AppStorage) return global.AppStorage.get(key, null);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function isDateCompleted(dateKey) {
    const saved = loadDailySaved(dateKey);
    return !!(saved && saved.over && saved.won);
  }

  function isDateInProgress(dateKey) {
    const saved = loadDailySaved(dateKey);
    return !!(saved && !saved.over && (saved.guessCount > 0));
  }

  function isToday(dateKey) {
    return dateKey === getTodayKey();
  }

  function isPastDate(dateKey) {
    return compareDateKeys(dateKey, getTodayKey()) < 0;
  }

  function isFutureDate(dateKey) {
    return compareDateKeys(dateKey, getTodayKey()) > 0;
  }

  function isUnlockedPast(dateKey) {
    const data = loadCalendarData();
    return data.unlockedPast.includes(dateKey);
  }

  function canSelectDate(dateKey) {
    if (!isValidDateKey(dateKey)) return false;
    if (compareDateKeys(dateKey, DAILY_LAUNCH) < 0) return false;
    if (isFutureDate(dateKey)) return false;
    return true;
  }

  function canPlayDate(dateKey) {
    if (!canSelectDate(dateKey)) return false;
    if (isToday(dateKey)) return true;
    if (isDateCompleted(dateKey)) return true;
    if (isUnlockedPast(dateKey)) return true;
    return false;
  }

  function getPlayCost(dateKey) {
    if (!isPastDate(dateKey)) return 0;
    if (isDateCompleted(dateKey) || isUnlockedPast(dateKey)) return 0;
    return PAST_DAY_COST;
  }

  function getCoins() {
    return global.ShopService?.getCoins?.() ?? 0;
  }

  function spendCoins(amount) {
    const n = Math.max(0, parseInt(amount, 10) || 0);
    if (!n) return { ok: true, coins: getCoins() };
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return { ok: false, reason: 'no-profile' };
    if ((profile.coins || 0) < n) return { ok: false, reason: 'insufficient' };
    profile.coins -= n;
    global.ProfileService?.saveProfile?.(profile);
    global.PlayerHud?.refresh?.();
    return { ok: true, coins: profile.coins };
  }

  function unlockPastDate(dateKey, method) {
    if (!isPastDate(dateKey) || canPlayDate(dateKey)) {
      return { ok: true, already: true };
    }
    const data = loadCalendarData();
    if (!data.unlockedPast.includes(dateKey)) {
      data.unlockedPast.push(dateKey);
      saveCalendarData(data);
    }
    return { ok: true, method: method || 'unknown' };
  }

  function unlockWithCoins(dateKey) {
    const cost = getPlayCost(dateKey);
    if (cost <= 0) return unlockPastDate(dateKey, 'free');
    const spent = spendCoins(cost);
    if (!spent.ok) return spent;
    return unlockPastDate(dateKey, 'coins');
  }

  function unlockWithAd(dateKey) {
    return unlockPastDate(dateKey, 'ad');
  }

  function listCompletedDatesInMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const completed = [];
    if (global.AppStorage) {
      global.AppStorage.getPrefixed('jamodeul-match-daily-').forEach((key) => {
        if (!key.startsWith(prefix)) return;
        const dateKey = key.replace('jamodeul-match-daily-', '');
        if (isDateCompleted(dateKey)) completed.push(dateKey);
      });
      return completed.sort();
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('jamodeul-match-daily-')) continue;
        const dateKey = key.replace('jamodeul-match-daily-', '');
        if (!dateKey.startsWith(prefix)) continue;
        if (isDateCompleted(dateKey)) completed.push(dateKey);
      }
    } catch { /* ignore */ }
    return completed.sort();
  }

  function getMonthWinCount(year, month) {
    return listCompletedDatesInMonth(year, month).length;
  }

  function getBadgeState(year, month) {
    const mk = `${year}-${String(month).padStart(2, '0')}`;
    const wins = getMonthWinCount(year, month);
    const data = loadCalendarData();
    const earned = new Set(data.earnedBadges[mk] || []);
    return BADGE_THRESHOLDS.map((threshold, i) => ({
      id: BADGE_IDS[i],
      threshold,
      earned: earned.has(threshold) || wins >= threshold,
      wins,
    }));
  }

  function getNextBadgeThreshold(year, month) {
    const wins = getMonthWinCount(year, month);
    for (let i = 0; i < BADGE_THRESHOLDS.length; i++) {
      if (wins < BADGE_THRESHOLDS[i]) return BADGE_THRESHOLDS[i];
    }
    return BADGE_THRESHOLDS[BADGE_THRESHOLDS.length - 1];
  }

  function checkAndAwardBadges(dateKey) {
    const [y, m] = dateKey.split('-').map(Number);
    const mk = monthKeyFromDate(dateKey);
    const wins = getMonthWinCount(y, m);
    const data = loadCalendarData();
    if (!data.earnedBadges[mk]) data.earnedBadges[mk] = [];
    const newlyEarned = [];
    BADGE_THRESHOLDS.forEach((threshold, i) => {
      if (wins >= threshold && !data.earnedBadges[mk].includes(threshold)) {
        data.earnedBadges[mk].push(threshold);
        newlyEarned.push({ id: BADGE_IDS[i], threshold });
      }
    });
    if (newlyEarned.length) saveCalendarData(data);
    return newlyEarned;
  }

  function onDailyWin(dateKey) {
    const key = dateKey || getTodayKey();
    return checkAndAwardBadges(key);
  }

  function buildPlayUrl(dateKey) {
    return `match.html?daily=1&date=${encodeURIComponent(dateKey)}`;
  }

  function navigateToDaily(dateKey) {
    global.location.href = buildPlayUrl(dateKey);
  }

  function getCalendarDays(year, month) {
    const firstDow = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateKey });
    }
    return cells;
  }

  function parseMonthKey(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return { year: y, month: m };
  }

  function clampMonth(year, month) {
    let y = year;
    let m = month;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    const launch = parseMonthKey(DAILY_LAUNCH);
    const launchIdx = launch.year * 12 + launch.month;
    const idx = y * 12 + m;
    const today = parseMonthKey(getTodayKey());
    const todayIdx = today.year * 12 + today.month;
    if (idx < launchIdx) return { year: launch.year, month: launch.month };
    if (idx > todayIdx) return { year: today.year, month: today.month };
    return { year: y, month: m };
  }

  function shiftMonth(year, month, delta) {
    return clampMonth(year, month + delta);
  }

  global.DailyCalendarService = {
    CALENDAR_KEY,
    DAILY_LAUNCH,
    PAST_DAY_COST,
    BADGE_THRESHOLDS,
    BADGE_IDS,
    getTodayKey,
    isValidDateKey,
    compareDateKeys,
    monthKeyFromDate,
    isDateCompleted,
    isDateInProgress,
    isToday,
    isPastDate,
    isFutureDate,
    canSelectDate,
    canPlayDate,
    getPlayCost,
    getCoins,
    unlockWithCoins,
    unlockWithAd,
    getMonthWinCount,
    getBadgeState,
    getNextBadgeThreshold,
    onDailyWin,
    buildPlayUrl,
    navigateToDaily,
    getCalendarDays,
    clampMonth,
    shiftMonth,
    listCompletedDatesInMonth,
    loadCalendarData,
  };
})(typeof window !== 'undefined' ? window : globalThis);
