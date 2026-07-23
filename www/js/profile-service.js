/**
 * User profile persistence — local storage with optional Firestore cloud sync on login.
 */
(function (global) {
  'use strict';

  const PROFILE_KEY = 'jamodeul-user-profile';
  const PROFILE_VERSION = 5;
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
      dailyWheelClaimed: false,
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
      purchasedTitleIds: [],
      selectedCosmeticTheme: 'default',
      extraGuessTokens: 0,
      lastDailyGiftDayKey: '',
      dailyLoginStreakDay: 1,
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
      frameId: 'none',
      unlockedFrameIds: [],
      titleId: '',
      recentWords: [],
      learningDayKeys: [],
      stats: {
        totalActivities: 0,
        dailyChallengesCompleted: 0,
        battleWins: 0,
        battleLosses: 0,
        battleDraws: 0,
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
      dailyWheelClaimed: !!raw.dailyWheelClaimed,
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
      purchasedTitleIds: normalizeStringArray(raw.purchasedTitleIds),
      selectedCosmeticTheme: typeof raw.selectedCosmeticTheme === 'string'
        ? raw.selectedCosmeticTheme
        : 'default',
      extraGuessTokens: Math.max(0, parseInt(raw.extraGuessTokens, 10) || 0),
      lastDailyGiftDayKey: typeof raw.lastDailyGiftDayKey === 'string' ? raw.lastDailyGiftDayKey : '',
      dailyLoginStreakDay: Math.min(30, Math.max(1, parseInt(raw.dailyLoginStreakDay, 10) || 1)),
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
      frameId: migrateFrameId(typeof raw.frameId === 'string' ? raw.frameId : 'none'),
      unlockedFrameIds: normalizeStringArray(raw.unlockedFrameIds).map(migrateFrameId),
      titleId: typeof raw.titleId === 'string' ? raw.titleId : '',
      recentWords: Array.isArray(raw.recentWords)
        ? raw.recentWords.filter((w) => w && typeof w.word === 'string').slice(0, MAX_RECENT_WORDS)
        : [],
      learningDayKeys: normalizeStringArray(raw.learningDayKeys),
      stats: {
        totalActivities: Math.max(0, parseInt(raw.stats?.totalActivities, 10) || 0),
        dailyChallengesCompleted: Math.max(0, parseInt(raw.stats?.dailyChallengesCompleted, 10) || 0),
        battleWins: Math.max(0, parseInt(raw.stats?.battleWins, 10) || 0),
        battleLosses: Math.max(0, parseInt(raw.stats?.battleLosses, 10) || 0),
        battleDraws: Math.max(0, parseInt(raw.stats?.battleDraws, 10) || 0),
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
      schedulePublicProfileSync(copy);
      global.CloudSyncService?.schedulePush?.();
      return true;
    } catch (err) {
      console.warn('[Jamodeul] Profile save failed.', err);
      return false;
    }
  }

  let publicProfileSyncTimer = null;

  function getPublicProfilePayload(profile) {
    const p = profile || loadProfile();
    return {
      avatarId: typeof p.avatarId === 'string' ? p.avatarId : 'default',
      frameId: migrateFrameId(typeof p.frameId === 'string' ? p.frameId : 'none'),
      totalXp: Math.max(0, parseInt(p.totalXp, 10) || 0),
    };
  }

  function schedulePublicProfileSync(profile) {
    if (!global.FirebaseSocial?.syncPublicProfile) return;
    if (publicProfileSyncTimer) clearTimeout(publicProfileSyncTimer);
    publicProfileSyncTimer = setTimeout(() => {
      publicProfileSyncTimer = null;
      global.FirebaseSocial.syncPublicProfile(getPublicProfilePayload(profile)).catch(() => {});
    }, 400);
  }

  function setDisplayName(name) {
    const profile = loadProfile();
    profile.displayName = typeof name === 'string' && name.trim()
      ? name.trim().slice(0, 24)
      : defaultDisplayName();
    saveProfile(profile);
    return profile;
  }

  function hasDevCosmeticsAccess() {
    return global.DevBuild?.hasDevAccess?.() === true
      && global.UserPreferences?.get?.()?.devMode === true;
  }

  function isAvatarUnlocked(profile, avatarId) {
    if (hasDevCosmeticsAccess()) return true;
    return (profile.unlockedAvatarIds || []).includes(avatarId);
  }

  function migrateFrameId(frameId) {
    return frameId === 'platinum' ? 'ruby' : frameId;
  }

  function isFrameUnlocked(profile, frameId) {
    if (frameId === 'none') return true;
    if (hasDevCosmeticsAccess()) return true;
    const id = migrateFrameId(frameId);
    return (profile.unlockedFrameIds || []).includes(id);
  }

  function setAvatarId(avatarId) {
    const profile = loadProfile();
    if (!isAvatarUnlocked(profile, avatarId)) return profile;
    profile.avatarId = avatarId;
    saveProfile(profile);
    return profile;
  }

  function setFrameId(frameId) {
    const profile = loadProfile();
    const id = migrateFrameId(frameId);
    if (!isFrameUnlocked(profile, id)) return profile;
    profile.frameId = id;
    saveProfile(profile);
    return profile;
  }

  function isTitleUnlocked(profile, titleId) {
    if (hasDevCosmeticsAccess()) return true;
    if ((profile.purchasedTitleIds || []).includes(titleId)) return true;
    const level = global.LevelUtils?.getLevelFromTotalXp(profile.totalXp)?.level || 1;
    return global.LevelUtils?.isTitleUnlocked?.(level, titleId) === true;
  }

  function setTitleId(titleId) {
    const profile = loadProfile();
    if (!isTitleUnlocked(profile, titleId)) return profile;
    profile.titleId = titleId;
    saveProfile(profile);
    return profile;
  }

  function getDisplayTitleId(profile) {
    const level = global.LevelUtils?.getLevelFromTotalXp(profile.totalXp)?.level || 1;
    if (profile.titleId && isTitleUnlocked(profile, profile.titleId)) {
      return profile.titleId;
    }
    return global.LevelUtils?.resolveTitleId?.(level, profile.titleId) || 'hangul-starter';
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

  function recordBattleResult(result) {
    const profile = loadProfile();
    if (!profile.stats) profile.stats = emptyProfile().stats;
    if (result === 'win') profile.stats.battleWins += 1;
    else if (result === 'loss') profile.stats.battleLosses += 1;
    else profile.stats.battleDraws += 1;
    saveProfile(profile);
    return profile;
  }

  function getBattleWinRate(stats) {
    const wins = Math.max(0, parseInt(stats?.battleWins, 10) || 0);
    const losses = Math.max(0, parseInt(stats?.battleLosses, 10) || 0);
    const draws = Math.max(0, parseInt(stats?.battleDraws, 10) || 0);
    const total = wins + losses + draws;
    if (!total) return null;
    return Math.round((wins / total) * 100);
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
    const autoTitle = global.LevelUtils?.getLevelTitle(levelInfo.level, t) || '';
    const titleId = getDisplayTitleId(profile);
    const displayTitle = global.LevelUtils?.getTitleLabel?.(titleId, t) || autoTitle;
    const unlockedTitleIds = [
      ...(global.LevelUtils?.getUnlockedTitleIds?.(levelInfo.level) || []),
      ...(profile.purchasedTitleIds || []),
    ].filter((id, i, arr) => arr.indexOf(id) === i);

    return {
      profile,
      displayName: profile.displayName,
      avatarId: profile.avatarId,
      avatarIcon: global.BadgeService?.getAvatarDef(profile.avatarId)?.icon || '🌸',
      frameId: profile.frameId || 'none',
      unlockedFrameIds: profile.unlockedFrameIds || [],
      titleId,
      unlockedTitleIds,
      displayTitle,
      totalXp: profile.totalXp,
      coins: profile.coins || 0,
      extraGuessTokens: profile.extraGuessTokens || 0,
      ownedThemes: profile.ownedThemes || [],
      selectedCosmeticTheme: profile.selectedCosmeticTheme || 'default',
      level: levelInfo.level,
      xpInLevel: levelInfo.xpInLevel,
      xpToNext: levelInfo.xpToNext,
      levelTitle: autoTitle,
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
      battleWins: profile.stats.battleWins || 0,
      battleLosses: profile.stats.battleLosses || 0,
      battleDraws: profile.stats.battleDraws || 0,
      battleGamesPlayed: (profile.stats.battleWins || 0)
        + (profile.stats.battleLosses || 0)
        + (profile.stats.battleDraws || 0),
      battleWinRate: getBattleWinRate(profile.stats),
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
    setFrameId,
    setTitleId,
    hasDevCosmeticsAccess,
    isAvatarUnlocked,
    isFrameUnlocked,
    isTitleUnlocked,
    getDisplayTitleId,
    addRecentWord,
    markLearningDay,
    getProfileSummary,
    recordBattleResult,
    getBattleWinRate,
    getPublicProfilePayload,
    resetProfile,
    emptyProfile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
