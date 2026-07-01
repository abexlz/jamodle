/**
 * Badge definitions and unlock checks for the profile system.
 */
(function (global) {
  'use strict';

  const BADGES = [
    { id: 'first-step', icon: '🌱', check: (ctx) => ctx.totalActivities >= 1 },
    { id: 'first-word', icon: '🧩', check: (ctx) => ctx.builderWords >= 1 },
    { id: 'match-maker', icon: '🎯', check: (ctx) => ctx.matchWords >= 10 },
    { id: 'vowel-pro', icon: 'ㅏ', check: (ctx) => ctx.vowelPracticeDone },
    { id: 'week-warrior', icon: '🔥', check: (ctx) => ctx.longestStreak >= 7 },
    { id: 'two-week-learner', icon: '🏅', check: (ctx) => ctx.longestStreak >= 14 },
    { id: 'hangul-hero', icon: '🎖️', check: (ctx) => ctx.level >= 10 },
    { id: 'word-collector', icon: '📚', check: (ctx) => ctx.uniqueWords >= 50 },
  ];

  const AVATAR_UNLOCKS = [
    { id: 'default', icon: '🌸', check: () => true },
    { id: 'cat', icon: '🐱', check: (ctx) => ctx.level >= 3 },
    { id: 'rabbit', icon: '🐰', check: (ctx) => ctx.level >= 5 },
    { id: 'star', icon: '⭐', check: (ctx) => ctx.earnedBadgeCount >= 1 },
    { id: 'hangul-tile', icon: '字', check: (ctx) => ctx.level >= 10 },
    { id: 'flame', icon: '🔥', check: (ctx) => ctx.longestStreak >= 7 },
  ];

  function buildContext(profile, extras) {
    const progress = global.MenuProgress?.loadProgress?.() || {};
    const streak = global.LearningStreak?.loadStreak?.() || {};
    const levelInfo = global.LevelUtils?.getLevelFromTotalXp(profile.totalXp) || { level: 1 };
    return {
      totalActivities: profile.stats?.totalActivities || 0,
      builderWords: progress.builderWordsCompleted || 0,
      matchWords: progress.wordsLearned || 0,
      vowelPracticeDone: !!profile.completedWordsByMode?.vowelPractice,
      longestStreak: streak.longestStreak || 0,
      currentStreak: streak.currentStreak || 0,
      level: levelInfo.level,
      uniqueWords: (profile.completedWordsEver || []).length,
      earnedBadgeCount: (profile.earnedBadges || []).length,
      ...extras,
    };
  }

  function getBadgeDef(id) {
    return BADGES.find((b) => b.id === id) || null;
  }

  function getAvatarDef(id) {
    return AVATAR_UNLOCKS.find((a) => a.id === id) || AVATAR_UNLOCKS[0];
  }

  function checkNewBadges(profile, extras) {
    const ctx = buildContext(profile, extras);
    const earnedIds = new Set((profile.earnedBadges || []).map((b) => b.id));
    const newlyEarned = [];
    const today = new Date().toISOString();

    BADGES.forEach((badge) => {
      if (earnedIds.has(badge.id)) return;
      if (badge.check(ctx)) {
        newlyEarned.push({ id: badge.id, earnedAt: today, icon: badge.icon });
      }
    });

    return newlyEarned;
  }

  function checkNewAvatars(profile, extras) {
    const ctx = buildContext(profile, extras);
    const unlocked = new Set(profile.unlockedAvatarIds || ['default']);
    const newlyUnlocked = [];

    AVATAR_UNLOCKS.forEach((avatar) => {
      if (unlocked.has(avatar.id)) return;
      if (avatar.check(ctx)) newlyUnlocked.push(avatar.id);
    });

    return newlyUnlocked;
  }

  global.BadgeService = {
    BADGES,
    AVATAR_UNLOCKS,
    buildContext,
    getBadgeDef,
    getAvatarDef,
    checkNewBadges,
    checkNewAvatars,
  };
})(typeof window !== 'undefined' ? window : globalThis);
