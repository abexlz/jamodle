/**
 * Unified Daily Quiz Streak — one consecutive-day counter for daily Hangul-dle.
 * Calendar day boundary: Asia/Seoul (same as the rest of the app).
 */
(function (global) {
  'use strict';

  const STREAK_KEY = 'jamodeul-daily-quiz-streak';
  const DAILY_TZ = 'Asia/Seoul';
  const BASE_COINS = 10;
  const BASE_XP = 20;
  const FREEZE_SHOP_PRICE = 200;

  const MILESTONES = [
    { days: 3, id: 'fire-badge' },
    { days: 7, id: 'frame-freeze' },
    { days: 14, id: 'special-avatar' },
    { days: 30, id: 'gold-trophy' },
    { days: 100, id: 'master-title' },
  ];

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? '';
  }

  function getTodayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function shiftDateKey(key, delta) {
    const [y, m, d] = String(key).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function daysBetween(a, b) {
    if (!a || !b) return 0;
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    const da = Date.UTC(ay, am - 1, ad);
    const db = Date.UTC(by, bm - 1, bd);
    return Math.round((db - da) / 86400000);
  }

  function emptyState() {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastClearedDate: null,
      freezeCount: 0,
      freezeMilestonesGranted: [],
      milestonesAwarded: [],
      lastFreezeUsedDate: null,
      pendingNotice: null,
    };
  }

  function loadState() {
    const raw = global.AppStorage
      ? global.AppStorage.get(STREAK_KEY, null)
      : (() => {
        try { return JSON.parse(localStorage.getItem(STREAK_KEY) || 'null'); } catch { return null; }
      })();
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return migrateFromLearningStreak(base);
    return {
      currentStreak: Math.max(0, parseInt(raw.currentStreak, 10) || 0),
      longestStreak: Math.max(0, parseInt(raw.longestStreak, 10) || 0),
      lastClearedDate: raw.lastClearedDate || null,
      freezeCount: Math.max(0, parseInt(raw.freezeCount, 10) || 0),
      freezeMilestonesGranted: Array.isArray(raw.freezeMilestonesGranted) ? raw.freezeMilestonesGranted : [],
      milestonesAwarded: Array.isArray(raw.milestonesAwarded) ? raw.milestonesAwarded : [],
      lastFreezeUsedDate: raw.lastFreezeUsedDate || null,
      pendingNotice: raw.pendingNotice || null,
    };
  }

  function migrateFromLearningStreak(base) {
    const old = global.LearningStreak?.loadStreak?.();
    if (!old || !(old.currentStreak > 0)) return base;
    base.currentStreak = old.currentStreak;
    base.longestStreak = old.longestStreak || old.currentStreak;
    base.lastClearedDate = old.lastActivityDate || old.todayDate || null;
    return base;
  }

  function saveState(state) {
    if (global.AppStorage) global.AppStorage.set(STREAK_KEY, state);
    else {
      try { localStorage.setItem(STREAK_KEY, JSON.stringify(state)); } catch { /* ignore */ }
    }
    syncFreezeToProfile(state.freezeCount);
  }

  function syncFreezeToProfile(count) {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return;
    if ((profile.streakFreezeTokens || 0) === count) return;
    profile.streakFreezeTokens = count;
    global.ProfileService.saveProfile(profile);
  }

  function freezeCountFromProfile(state) {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return state.freezeCount;
    const n = Math.max(0, parseInt(profile.streakFreezeTokens, 10) || 0);
    if (n !== state.freezeCount) {
      state.freezeCount = n;
    }
    return state.freezeCount;
  }

  function showNotice(message) {
    if (!message || typeof document === 'undefined') return;
    let el = document.getElementById('daily-streak-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'daily-streak-toast';
      el.className = 'daily-streak-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(showNotice._timer);
    showNotice._timer = setTimeout(() => el.classList.remove('is-visible'), 4200);
  }

  /**
   * Close gaps before today. Missing exactly one day spends one freeze.
   * Missing two or more days resets the streak (even if freezes remain).
   */
  function applyMissedDays(state, today) {
    freezeCountFromProfile(state);
    const last = state.lastClearedDate;
    if (!last) {
      state.currentStreak = 0;
      return state;
    }
    if (last === today) return state;
    const yesterday = shiftDateKey(today, -1);
    if (last === yesterday) return state;

    const gap = daysBetween(last, today) - 1;
    if (gap === 1 && state.freezeCount > 0) {
      state.freezeCount -= 1;
      state.lastClearedDate = yesterday;
      state.lastFreezeUsedDate = today;
      state.pendingNotice = t('dailyStreak.freezeUsed') || 'Your streak was protected! 1 Streak Freeze used.';
      return state;
    }
    if (gap >= 1) {
      state.currentStreak = 0;
      state.lastClearedDate = null;
    }
    return state;
  }

  function ensureRollover() {
    const today = getTodayKey();
    const state = applyMissedDays(loadState(), today);
    saveState(state);
    if (state.pendingNotice) {
      showNotice(state.pendingNotice);
      state.pendingNotice = null;
      saveState(state);
    }
    return state;
  }

  function grantMilestone(state, milestone) {
    const profile = global.ProfileService?.loadProfile?.();
    const rewards = [];
    if (!profile) return rewards;

    if (milestone.id === 'fire-badge') {
      const id = 'streak-fire';
      if (!(profile.earnedBadges || []).some((b) => b.id === id)) {
        profile.earnedBadges.push({ id, earnedAt: new Date().toISOString(), icon: '🔥' });
        rewards.push({ type: 'badge', id });
      }
    }
    if (milestone.id === 'frame-freeze') {
      if (!(profile.unlockedFrameIds || []).includes('gold')) {
        profile.unlockedFrameIds = profile.unlockedFrameIds || [];
        profile.unlockedFrameIds.push('gold');
        rewards.push({ type: 'frame', id: 'gold' });
      }
      if (!state.freezeMilestonesGranted.includes(7)) {
        state.freezeCount += 1;
        state.freezeMilestonesGranted.push(7);
        rewards.push({ type: 'freeze', amount: 1 });
      }
    }
    if (milestone.id === 'special-avatar') {
      if (!(profile.unlockedAvatarIds || []).includes('crown')) {
        profile.unlockedAvatarIds = profile.unlockedAvatarIds || ['default'];
        profile.unlockedAvatarIds.push('crown');
        rewards.push({ type: 'avatar', id: 'crown' });
      }
    }
    if (milestone.id === 'gold-trophy') {
      const id = 'streak-gold';
      if (!(profile.earnedBadges || []).some((b) => b.id === id)) {
        profile.earnedBadges.push({ id, earnedAt: new Date().toISOString(), icon: '🏆' });
        rewards.push({ type: 'badge', id });
      }
      if (!state.freezeMilestonesGranted.includes(30)) {
        state.freezeCount += 1;
        state.freezeMilestonesGranted.push(30);
        rewards.push({ type: 'freeze', amount: 1 });
      }
    }
    if (milestone.id === 'master-title') {
      if (!(profile.purchasedTitleIds || []).includes('hangul-master')) {
        profile.purchasedTitleIds = profile.purchasedTitleIds || [];
        profile.purchasedTitleIds.push('hangul-master');
        rewards.push({ type: 'title', id: 'hangul-master' });
      }
    }
    global.ProfileService.saveProfile(profile);
    return rewards;
  }

  function recordClear(dateKey) {
    const today = dateKey || getTodayKey();
    const state = applyMissedDays(loadState(), getTodayKey());
    if (state.lastClearedDate === today) {
      saveState(state);
      return { already: true, streak: state.currentStreak, freezeCount: state.freezeCount, rewards: [] };
    }

    const yesterday = shiftDateKey(today, -1);
    if (state.lastClearedDate === yesterday) state.currentStreak += 1;
    else state.currentStreak = 1;
    state.lastClearedDate = today;
    if (state.currentStreak > state.longestStreak) state.longestStreak = state.currentStreak;

    const rewards = [];
    if (global.ShopService?.grantCoins) {
      global.ShopService.grantCoins(BASE_COINS);
    } else {
      const profile = global.ProfileService?.loadProfile?.();
      if (profile) {
        profile.coins = (profile.coins || 0) + BASE_COINS;
        global.ProfileService.saveProfile(profile);
        global.PlayerHud?.refresh?.();
      }
    }
    rewards.push({ type: 'coins', amount: BASE_COINS });

    MILESTONES.forEach((m) => {
      if (state.currentStreak >= m.days && !state.milestonesAwarded.includes(m.days)) {
        state.milestonesAwarded.push(m.days);
        rewards.push(...grantMilestone(state, m));
      }
    });

    saveState(state);
    try { global.FriendStreak?.onPersonalClear?.(today); } catch { /* ignore */ }
    return {
      already: false,
      streak: state.currentStreak,
      freezeCount: state.freezeCount,
      rewards,
      xp: BASE_XP,
      coins: BASE_COINS,
    };
  }

  function addFreezes(amount) {
    const state = loadState();
    state.freezeCount += Math.max(0, parseInt(amount, 10) || 0);
    saveState(state);
    return state.freezeCount;
  }

  function syncFreezeFromProfile() {
    const state = loadState();
    freezeCountFromProfile(state);
    saveState(state);
    return state.freezeCount;
  }

  function getSnapshot() {
    const state = ensureRollover();
    const today = getTodayKey();
    return {
      currentStreak: state.currentStreak,
      longestStreak: state.longestStreak,
      freezeCount: state.freezeCount,
      clearedToday: state.lastClearedDate === today,
      lastClearedDate: state.lastClearedDate,
      today,
      timezone: DAILY_TZ,
    };
  }

  global.DailyQuizStreak = {
    STREAK_KEY,
    DAILY_TZ,
    BASE_COINS,
    BASE_XP,
    FREEZE_SHOP_PRICE,
    MILESTONES,
    getTodayKey,
    shiftDateKey,
    daysBetween,
    loadState,
    ensureRollover,
    recordClear,
    addFreezes,
    syncFreezeFromProfile,
    getSnapshot,
    showNotice,
  };
})(typeof window !== 'undefined' ? window : globalThis);
