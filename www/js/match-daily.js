/**
 * Daily word selection & persistence for Korean Match (KST, same scheme as Wordle Daily).
 */
(function (global) {
  'use strict';

  const DAILY_LAUNCH = '2024-01-01';
  const DAILY_TZ = 'Asia/Seoul';
  const DAILY_WORD_LENGTH = 2;

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function getTodayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_TZ,
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

  function getDateFromUrl() {
    const params = new URLSearchParams(global.location?.search || '');
    const raw = params.get('date');
    if (!raw || !isValidDateKey(raw)) return null;
    if (raw < DAILY_LAUNCH || raw > getTodayKey()) return null;
    return raw;
  }

  function getActiveDateKey() {
    return getDateFromUrl() || getTodayKey();
  }

  function getDayNumber(dateKey) {
    const key = dateKey || getActiveDateKey();
    const launchMs = new Date(DAILY_LAUNCH + 'T00:00:00+09:00').getTime();
    const dayMs = new Date(key + 'T00:00:00+09:00').getTime();
    return Math.floor((dayMs - launchMs) / 86400000) + 1;
  }

  function dailyStorageKey(dateKey) {
    return 'jamodeul-match-daily-' + (dateKey || getActiveDateKey());
  }

  function pickDailyMatchWord(wordList, dateKey) {
    const list = wordList.filter(Boolean);
    if (!list.length) return '나무';
    const seed = (dateKey || getActiveDateKey()) + '-match';
    return list[hashString(seed) % list.length];
  }

  function loadDailySaved(dateKey) {
    const key = dailyStorageKey(dateKey);
    if (global.AppStorage) return global.AppStorage.get(key, null);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveDailyProgress(payload, dateKey) {
    const key = dailyStorageKey(dateKey);
    if (global.AppStorage) {
      global.AppStorage.set(key, payload);
    } else {
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {}
    }
  }

  function getDailyMenuStatus() {
    const today = getTodayKey();
    const day = getDayNumber(today);
    const saved = loadDailySaved(today);
    if (saved && saved.over) {
      if (saved.won) {
        return 'Day ' + day + ' · ' + saved.guessCount + ' tries ✓';
      }
      return 'Day ' + day + ' · incomplete';
    }
    if (saved && saved.guessCount > 0) {
      return 'Day ' + day + ' · in progress';
    }
    return 'Day ' + day + ' · not played yet';
  }

  function isDailyModeFromUrl() {
    const params = new URLSearchParams(global.location?.search || '');
    return params.get('daily') === '1' || params.get('mode') === 'daily';
  }

  global.MatchDaily = {
    DAILY_LAUNCH,
    DAILY_TZ,
    DAILY_WORD_LENGTH,
    hashString,
    getTodayKey,
    isValidDateKey,
    getDateFromUrl,
    getActiveDateKey,
    getDayNumber,
    dailyStorageKey,
    pickDailyMatchWord,
    loadDailySaved,
    saveDailyProgress,
    getDailyMenuStatus,
    isDailyModeFromUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
