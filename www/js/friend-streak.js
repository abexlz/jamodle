/**
 * Friend streak — increments only when both friends clear the daily quiz
 * on the same Asia/Seoul calendar day. Independent of personal streak.
 */
(function (global) {
  'use strict';

  const LOCAL_KEY = 'jamodeul-friend-streaks';
  const SHARED_BADGE_DAYS = [3, 7, 14, 30];

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? '';
  }

  function loadMap() {
    const raw = global.AppStorage
      ? global.AppStorage.get(LOCAL_KEY, {})
      : (() => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch { return {}; } })();
    return raw && typeof raw === 'object' ? raw : {};
  }

  function saveMap(map) {
    if (global.AppStorage) global.AppStorage.set(LOCAL_KEY, map);
    else {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(map)); } catch { /* ignore */ }
    }
  }

  function emptyPair() {
    return { streak: 0, lastBothDate: null, badges: [] };
  }

  function todayKey() {
    return global.DailyQuizStreak?.getTodayKey?.() || '';
  }

  function shift(key, d) {
    return global.DailyQuizStreak?.shiftDateKey?.(key, d) || key;
  }

  function rolloverPair(pair, today) {
    const p = { ...emptyPair(), ...pair };
    if (!p.lastBothDate) return p;
    const yesterday = shift(today, -1);
    if (p.lastBothDate === today || p.lastBothDate === yesterday) return p;
    p.streak = 0;
    p.lastBothDate = null;
    return p;
  }

  function applyBothCleared(pair, today) {
    const p = rolloverPair(pair, today);
    if (p.lastBothDate === today) return p;
    const yesterday = shift(today, -1);
    if (p.lastBothDate === yesterday) p.streak += 1;
    else p.streak = 1;
    p.lastBothDate = today;
    SHARED_BADGE_DAYS.forEach((d) => {
      if (p.streak >= d && !(p.badges || []).includes(d)) {
        p.badges = [...(p.badges || []), d];
      }
    });
    return p;
  }

  async function readFriendClearDate(uid) {
    const db = global.FirebaseSocial?.getDb?.();
    if (!db || !uid) return null;
    try {
      const snap = await db.collection('users').doc(uid).get();
        const data = snap.exists ? snap.data() : {};
        return { date: data.dailyQuizLastCleared || null, name: data.nickname || data.displayName || '' };
    } catch {
      return null;
    }
  }

  async function writeMyPublicClear(today, streak) {
    const db = global.FirebaseSocial?.getDb?.();
    const uid = global.FirebaseSocial?.getCurrentUid?.();
    if (!db || !uid) return;
    try {
      await db.collection('users').doc(uid).set({
        dailyQuizLastCleared: today,
        dailyQuizStreak: streak,
      }, { merge: true });
    } catch { /* rules / offline */ }
  }

  function friendIds() {
    const profile = global.FirebaseSocial?.getUserProfile?.();
    return Array.isArray(profile?.friends) ? profile.friends.filter(Boolean) : [];
  }

  function displayName(uid, fallback) {
    return fallback || t('dailyStreak.friendFallback') || 'Friend';
  }

  async function refresh() {
    const today = todayKey();
    if (!today) return [];
    const myClear = global.DailyQuizStreak?.getSnapshot?.().lastClearedDate || null;
    const myUid = global.FirebaseSocial?.getCurrentUid?.();
    const ids = friendIds();
    const map = loadMap();
    const rows = [];

    for (const uid of ids) {
      const info = await readFriendClearDate(uid);
      const friendClear = info?.date || null;
      const friendName = info?.name || displayName(uid);
      let pair = rolloverPair(map[uid] || emptyPair(), today);
      if (myClear === today && friendClear === today) {
        pair = applyBothCleared(pair, today);
      }
      map[uid] = pair;
      rows.push({
        uid,
        name: friendName,
        streak: pair.streak,
        meCleared: myClear === today,
        friendCleared: friendClear === today,
        badges: pair.badges || [],
        nudge: !!(friendClear === today && myClear !== today),
      });
    }
    saveMap(map);
    if (myUid && myClear === today) {
      const snap = global.DailyQuizStreak?.getSnapshot?.();
      writeMyPublicClear(today, snap?.currentStreak || 0);
    }
    return rows;
  }

  async function onPersonalClear(today) {
    const snap = global.DailyQuizStreak?.getSnapshot?.();
    await writeMyPublicClear(today, snap?.currentStreak || 0);
    return refresh();
  }

  function getCachedRows() {
    const today = todayKey();
    const myClear = global.DailyQuizStreak?.getSnapshot?.().lastClearedDate || null;
    const map = loadMap();
    return friendIds().map((uid) => {
      const pair = rolloverPair(map[uid] || emptyPair(), today);
      return {
        uid,
        name: displayName(uid),
        streak: pair.streak,
        meCleared: myClear === today,
        friendCleared: false,
        badges: pair.badges || [],
        nudge: false,
      };
    });
  }

  global.FriendStreak = {
    LOCAL_KEY,
    SHARED_BADGE_DAYS,
    refresh,
    onPersonalClear,
    getCachedRows,
    friendIds,
  };
})(typeof window !== 'undefined' ? window : globalThis);
