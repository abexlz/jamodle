/**
 * User profile persistence — local-only, versioned, safe fallbacks.
 */
(function (global) {
  'use strict';

  const PROFILE_KEY = 'jamodeul-user-profile';
  const PROFILE_VERSION = 3;
  const DAILY_TZ = 'Asia/Seoul';
  const MAX_RECENT_WORDS = 8;

  function getTodayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function defaultDisplayName() {
    return global.I18n?.t('profile.defaultName') || 'Learner';
  }

  function emptyQuestState() {
    return {
      dailyKey: '',
      daily: [],
      weeklyKey: '',
      weekly: [],
      weeklyPlayDays: [],
    };
  }

  function emptyProfile() {
    return {
      version: PROFILE_VERSION,
      displayName: defaultDisplayName(),
      avatarId: 'default',
      totalXp: 0,
      coins: 0,
      ownedThemes: [],
      selectedCosmeticTheme: 'default',
      extraGuessTokens: 0,
      lastDailyGiftDayKey: '',
      questState: emptyQuestState(),
      lastCelebratedLevel: 1,
      completedWordsEver: [],
      completedWordsByMode: {
        hangulBuilder: [],
        koreanMatch: [],
        vowelPractice: false,
        dailyMatch: [],
        dailyWordle: [],
      },
      dailyXpAwards: {},
      earnedBadges: [],
      celebratedBadgeIds: [],
      unlockedAvatarIds: ['default'],
      recentWords: [],
      learningDayKeys: [],
      stats: {
        totalActivities: 0,
        dailyChallengesCompleted: 0,
      },
    };
  }

  function normalizeStringArray(val) {
    return Array.isArray(val) ? val.filter((v) => typeof v === 'string') : [];
  }

  function normalizeQuestState(raw) {
    const base = emptyQuestState();
    if (!raw || typeof raw !== 'object') return base;
    return {
      dailyKey: typeof raw.dailyKey === 'string' ? raw.dailyKey : '',
      daily: Array.isArray(raw.daily) ? raw.daily : [],
      weeklyKey: typeof raw.weeklyKey === 'string' ? raw.weeklyKey : '',
      weekly: Array.isArray(raw.weekly) ? raw.weekly : [],
      weeklyPlayDays: normalizeStringArray(raw.weeklyPlayDays),
    };
  }

  function normalizeProfile(raw) {
    if (!raw || typeof raw !== 'object') return emptyProfile();
    const base = emptyProfile();
    const levelInfo = global.LevelUtils?.getLevelFromTotalXp(raw.totalXp) || { level: 1 };

    return {
      version: PROFILE_VERSION,
      displayName: typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim().slice(0, 24)
        : base.displayName,
      avatarId: typeof raw.avatarId === 'string' ? raw.avatarId : 'default',
      totalXp: Math.max(0, parseInt(raw.totalXp, 10) || 0),
      coins: Math.max(0, parseInt(raw.coins, 10) || 0),
      ownedThemes: normalizeStringArray(raw.ownedThemes),
      selectedCosmeticTheme: typeof raw.selectedCosmeticTheme === 'string'
        ? raw.selectedCosmeticTheme
        : 'default',
      extraGuessTokens: Math.max(0, parseInt(raw.extraGuessTokens, 10) || 0),
      lastDailyGiftDayKey: typeof raw.lastDailyGiftDayKey === 'string' ? raw.lastDailyGiftDayKey : '',
      questState: normalizeQuestState(raw.questState),
      lastCelebratedLevel: Math.max(1, parseInt(raw.lastCelebratedLevel, 10) || 1),
      completedWordsEver: normalizeStringArray(raw.completedWordsEver),
      completedWordsByMode: {
        hangulBuilder: normalizeStringArray(raw.completedWordsByMode?.hangulBuilder),
        koreanMatch: normalizeStringArray(raw.completedWordsByMode?.koreanMatch),
        vowelPractice: !!raw.completedWordsByMode?.vowelPractice,
        dailyMatch: normalizeStringArray(raw.completedWordsByMode?.dailyMatch),
        dailyWordle: normalizeStringArray(raw.completedWordsByMode?.dailyWordle),
      },
      dailyXpAwards: raw.dailyXpAwards && typeof raw.dailyXpAwards === 'object' ? raw.dailyXpAwards : {},
      earnedBadges: Array.isArray(raw.earnedBadges)
        ? raw.earnedBadges.filter((b) => b && typeof b.id === 'string')
        : [],
      celebratedBadgeIds: normalizeStringArray(raw.celebratedBadgeIds),
      unlockedAvatarIds: normalizeStringArray(raw.unlockedAvatarIds).length
        ? normalizeStringArray(raw.unlockedAvatarIds)
        : ['default'],
      recentWords: Array.isArray(raw.recentWords)
        ? raw.recentWords.filter((w) => w && typeof w.word === 'string').slice(0, MAX_RECENT_WORDS)
        : [],
      learningDayKeys: normalizeStringArray(raw.learningDayKeys),
      stats: {
        totalActivities: Math.max(0, parseInt(raw.stats?.totalActivities, 10) || 0),
        dailyChallengesCompleted: Math.max(0, parseInt(raw.stats?.dailyChallengesCompleted, 10) || 0),
      },
      _level: levelInfo.level,
    };
  }

  function loadProfile() {
    try {
      const raw = global.AppStorage
        ? global.AppStorage.get(PROFILE_KEY, null)
        : null;
      if (!raw) {
        const profile = emptyProfile();
        saveProfile(profile);
        return profile;
      }
      return normalizeProfile(raw);
    } catch (err) {
      console.warn('[Jamodeul] Profile load failed, using defaults.', err);
      return emptyProfile();
    }
  }

  function saveProfile(profile) {
    try {
      const copy = { ...profile };
      delete copy._level;
      if (global.AppStorage) {
        global.AppStorage.set(PROFILE_KEY, copy);
      } else {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(copy));
      }
      return true;
    } catch (err) {
      console.warn('[Jamodeul] Profile save failed.', err);
      return false;
    }
  }

  function setDisplayName(name) {
    const profile = loadProfile();
    profile.displayName = typeof name === 'string' && name.trim()
      ? name.trim().slice(0, 24)
      : defaultDisplayName();
    saveProfile(profile);
    return profile;
  }

  function setAvatarId(avatarId) {
    const profile = loadProfile();
    if (!(profile.unlockedAvatarIds || []).includes(avatarId)) return profile;
    profile.avatarId = avatarId;
    saveProfile(profile);
    return profile;
  }

  function addRecentWord(profile, word, mode) {
    if (!word) return;
    const entry = {
      word,
      mode,
      completedAt: new Date().toISOString(),
    };
    profile.recentWords = [entry, ...(profile.recentWords || [])]
      .filter((w, i, arr) => arr.findIndex((x) => x.word === w.word && x.mode === w.mode) === i)
      .slice(0, MAX_RECENT_WORDS);
  }

  function markLearningDay(profile, dayKey) {
    if (!profile.learningDayKeys.includes(dayKey)) {
      profile.learningDayKeys.push(dayKey);
    }
  }

  function getProfileSummary() {
    const profile = loadProfile();
    const levelInfo = global.LevelUtils?.getLevelFromTotalXp(profile.totalXp) || {
      level: 1, xpInLevel: 0, xpToNext: 100,
    };
    const streak = global.LearningStreak?.getDisplayInfo?.() || {
      streakDays: 0, longestStreak: 0,
    };
    const progress = global.MenuProgress?.loadProgress?.() || {
      wordsLearned: 0, builderWordsCompleted: 0,
    };
    const t = (key, vars) => global.I18n?.t(key, vars) ?? '';
    const title = global.LevelUtils?.getLevelTitle(levelInfo.level, t) || '';

    return {
      profile,
      displayName: profile.displayName,
      avatarId: profile.avatarId,
      avatarIcon: global.BadgeService?.getAvatarDef(profile.avatarId)?.icon || '🌸',
      totalXp: profile.totalXp,
      coins: profile.coins || 0,
      extraGuessTokens: profile.extraGuessTokens || 0,
      ownedThemes: profile.ownedThemes || [],
      selectedCosmeticTheme: profile.selectedCosmeticTheme || 'default',
      level: levelInfo.level,
      xpInLevel: levelInfo.xpInLevel,
      xpToNext: levelInfo.xpToNext,
      levelTitle: title,
      currentStreak: streak.streakDays,
      longestStreak: streak.longestStreak,
      wordsLearned: progress.wordsLearned,
      builderCompleted: progress.builderWordsCompleted,
      matchCompleted: progress.wordsLearned,
      dailyChallengesCompleted: profile.stats.dailyChallengesCompleted,
      totalLearningDays: profile.learningDayKeys.length,
      uniqueWords: profile.completedWordsEver.length,
      recentWords: profile.recentWords,
      earnedBadges: profile.earnedBadges,
      unlockedAvatarIds: profile.unlockedAvatarIds,
    };
  }

  function resetProfile() {
    if (global.AppStorage) {
      global.AppStorage.remove(PROFILE_KEY);
    } else {
      try { localStorage.removeItem(PROFILE_KEY); } catch {}
    }
    return emptyProfile();
  }

  global.ProfileService = {
    PROFILE_KEY,
    PROFILE_VERSION,
    getTodayKey,
    loadProfile,
    saveProfile,
    setDisplayName,
    setAvatarId,
    addRecentWord,
    markLearningDay,
    getProfileSummary,
    resetProfile,
    emptyProfile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
