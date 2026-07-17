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
    { id: 'cherry-blossom', icon: '🌺', check: (ctx) => ctx.level >= 2 },
    { id: 'cat', icon: '🐱', check: (ctx) => ctx.level >= 3 },
    { id: 'dog', icon: '🐶', check: (ctx) => ctx.level >= 4 },
    { id: 'rabbit', icon: '🐰', check: (ctx) => ctx.level >= 5 },
    { id: 'butterfly', icon: '🦋', check: (ctx) => ctx.level >= 6 },
    { id: 'bear', icon: '🐻', check: (ctx) => ctx.level >= 7 },
    { id: 'fox', icon: '🦊', check: (ctx) => ctx.level >= 8 },
    { id: 'sun', icon: '☀️', check: (ctx) => ctx.level >= 9 },
    { id: 'hangul-tile', icon: '字', check: (ctx) => ctx.level >= 10 },
    { id: 'rainbow', icon: '🌈', check: (ctx) => ctx.level >= 11 },
    { id: 'panda', icon: '🐼', check: (ctx) => ctx.level >= 12 },
    { id: 'rocket', icon: '🚀', check: (ctx) => ctx.level >= 14 },
    { id: 'owl', icon: '🦉', check: (ctx) => ctx.level >= 15 },
    { id: 'sparkles', icon: '✨', check: (ctx) => ctx.level >= 16 },
    { id: 'crown', icon: '👑', check: (ctx) => ctx.level >= 18 },
    { id: 'trophy', icon: '🏆', check: (ctx) => ctx.level >= 20 },
    { id: 'seedling', icon: '🌱', check: (ctx) => ctx.totalActivities >= 1 },
    { id: 'star', icon: '⭐', check: (ctx) => ctx.earnedBadgeCount >= 1 },
    { id: 'clover', icon: '🍀', check: (ctx) => ctx.longestStreak >= 3 },
    { id: 'flame', icon: '🔥', check: (ctx) => ctx.longestStreak >= 7 },
    { id: 'heart', icon: '💗', check: (ctx) => ctx.longestStreak >= 14 },
    { id: 'moon', icon: '🌙', check: (ctx) => ctx.earnedBadgeCount >= 3 },
    { id: 'medal', icon: '🏅', check: (ctx) => ctx.earnedBadgeCount >= 5 },
    { id: 'book', icon: '📖', check: (ctx) => ctx.uniqueWords >= 10 },
    { id: 'pencil', icon: '✏️', check: (ctx) => ctx.builderWords >= 5 },
    { id: 'puzzle', icon: '🧩', check: (ctx) => ctx.matchWords >= 10 },
    { id: 'frog', icon: '🐸', check: (ctx) => ctx.uniqueWords >= 25 },
    { id: 'music', icon: '🎵', check: (ctx) => ctx.vowelPracticeDone },
    { id: 'globe', icon: '🌍', check: (ctx) => ctx.uniqueWords >= 50 },
  ];

  const FRAME_UNLOCKS = [
    { id: 'none', check: () => true },
    { id: 'bronze', check: (ctx) => ctx.level >= 5 },
    { id: 'silver', check: (ctx) => ctx.level >= 10 },
    { id: 'gold', check: (ctx) => ctx.level >= 15 },
    { id: 'ruby', check: (ctx) => ctx.level >= 20 },
    { id: 'diamond', check: (ctx) => ctx.level >= 25 },
    { id: 'emerald', check: (ctx) => ctx.earnedBadgeCount >= 3 },
    { id: 'amethyst', check: (ctx) => ctx.longestStreak >= 14 },
    { id: 'obsidian', check: (ctx) => ctx.level >= 30 },
    { id: 'pink', check: (ctx) => ctx.level >= 35 },
    { id: 'sakura', shopOnly: true },
    { id: 'neon', shopOnly: true },
    { id: 'sunset', shopOnly: true },
    { id: 'galaxy', shopOnly: true },
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

  function getFrameDef(id) {
    return FRAME_UNLOCKS.find((f) => f.id === id) || FRAME_UNLOCKS[0];
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

  function checkNewFrames(profile, extras) {
    const ctx = buildContext(profile, extras);
    const unlocked = new Set(profile.unlockedFrameIds || []);
    const newlyUnlocked = [];

    FRAME_UNLOCKS.forEach((frame) => {
      if (frame.id === 'none' || frame.shopOnly) return;
      if (unlocked.has(frame.id)) return;
      if (frame.check(ctx)) newlyUnlocked.push(frame.id);
    });

    return newlyUnlocked;
  }

  global.BadgeService = {
    BADGES,
    AVATAR_UNLOCKS,
    FRAME_UNLOCKS,
    buildContext,
    getBadgeDef,
    getAvatarDef,
    getFrameDef,
    checkNewBadges,
    checkNewAvatars,
    checkNewFrames,
  };
})(typeof window !== 'undefined' ? window : globalThis);
