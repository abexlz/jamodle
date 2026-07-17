/**
 * XP awards — anti-farming, leveling, badges, and celebrations.
 */
(function (global) {
  'use strict';

  const XP_REWARDS = {
    hangulBuilder: 10,
    koreanMatch: 15,
    wordChain: 20,
    vowelPractice: 10,
    dailyMatch: 25,
    dailyWordle: 15,
    tutorial: 12,
    relatedWords: 12,
    newWordBonus: 5,
    noHintBonus: 5,
    streakBonus: 5,
  };

  const MODE_LABEL_KEYS = {
    hangulBuilder: 'profile.xp.builderComplete',
    koreanMatch: 'profile.xp.matchComplete',
    wordChain: 'profile.xp.wordChainComplete',
    vowelPractice: 'profile.xp.vowelComplete',
    dailyMatch: 'profile.xp.dailyMatchComplete',
    dailyWordle: 'profile.xp.dailyWordleComplete',
    tutorial: 'profile.xp.tutorialStep',
    relatedWords: 'profile.xp.relatedWordsComplete',
  };

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? '';
  }

  function getDailyAwards(profile, dayKey) {
    if (!profile.dailyXpAwards[dayKey]) profile.dailyXpAwards[dayKey] = [];
    return profile.dailyXpAwards[dayKey];
  }

  function hasDailyAward(profile, dayKey, awardKey) {
    return getDailyAwards(profile, dayKey).includes(awardKey);
  }

  function markDailyAward(profile, dayKey, awardKey) {
    const awards = getDailyAwards(profile, dayKey);
    if (!awards.includes(awardKey)) awards.push(awardKey);
  }

  function resolveMode(opts) {
    if (opts.mode) return opts.mode;
    if (opts.isDailyChallenge && opts.mode === 'dailyWordle') return 'dailyWordle';
    return opts.mode;
  }

  function getBaseXp(mode) {
    return XP_REWARDS[mode] || 0;
  }

  function getAwardKey(mode, wordId) {
    return `${mode}:${wordId || 'lesson'}`;
  }

  /**
   * @param {{
   *   mode: 'hangulBuilder'|'koreanMatch'|'wordChain'|'vowelPractice'|'dailyMatch'|'dailyWordle',
   *   wordId?: string,
   *   usedHint?: boolean,
   *   isDailyChallenge?: boolean,
   * }} opts
   */
  function awardLearningXp(opts) {
    const safe = opts && typeof opts === 'object' ? opts : {};
    const mode = resolveMode(safe);
    const wordId = safe.wordId || (mode === 'vowelPractice' ? 'lesson' : '');
    const dayKey = global.ProfileService?.getTodayKey?.() || 'today';

    let profile;
    try {
      profile = global.ProfileService?.loadProfile?.();
    } catch {
      return { awarded: false, xpEarned: 0, breakdown: [] };
    }
    if (!profile) return { awarded: false, xpEarned: 0, breakdown: [] };

    const breakdown = [];
    let xpEarned = 0;
    const awardKey = getAwardKey(mode, wordId);
    const isDailyMode = mode === 'dailyMatch' || mode === 'dailyWordle';

    if (mode === 'vowelPractice' && profile.completedWordsByMode.vowelPractice) {
      return { awarded: false, xpEarned: 0, breakdown: [], reason: 'lesson-complete' };
    }

    if (mode === 'tutorial') {
      const tutorialKey = `tutorial:${wordId || 'step'}`;
      if ((profile.completedWordsEver || []).includes(tutorialKey)) {
        return { awarded: false, xpEarned: 0, breakdown: [], reason: 'tutorial-repeat' };
      }
    }

    if (isDailyMode) {
      const dateList = mode === 'dailyMatch'
        ? profile.completedWordsByMode.dailyMatch
        : profile.completedWordsByMode.dailyWordle;
      if (dateList.includes(dayKey)) {
        return { awarded: false, xpEarned: 0, breakdown: [], reason: 'daily-already' };
      }
    } else if (mode !== 'tutorial' && hasDailyAward(profile, dayKey, awardKey)) {
      return { awarded: false, xpEarned: 0, breakdown: [], reason: 'daily-word' };
    }

    const baseXp = getBaseXp(mode);
    if (baseXp <= 0) {
      return { awarded: false, xpEarned: 0, breakdown: [], reason: 'unknown-mode' };
    }

    xpEarned += baseXp;
    breakdown.push({ type: 'base', amount: baseXp, mode });

    const isNewWord = wordId
      && !(profile.completedWordsEver || []).includes(wordId)
      && mode !== 'vowelPractice'
      && mode !== 'tutorial';
    if (isNewWord) {
      xpEarned += XP_REWARDS.newWordBonus;
      breakdown.push({ type: 'newWord', amount: XP_REWARDS.newWordBonus });
      profile.completedWordsEver.push(wordId);
    }

    if (!safe.usedHint && mode !== 'vowelPractice' && mode !== 'hangulBuilder' && mode !== 'tutorial' && mode !== 'relatedWords') {
      xpEarned += XP_REWARDS.noHintBonus;
      breakdown.push({ type: 'noHint', amount: XP_REWARDS.noHintBonus });
    }

    const streak = global.LearningStreak?.loadStreak?.() || {};
    if (
      streak.currentStreak >= 1
      && streak.todayCompleted
      && !hasDailyAward(profile, dayKey, 'streak-bonus')
    ) {
      xpEarned += XP_REWARDS.streakBonus;
      breakdown.push({ type: 'streak', amount: XP_REWARDS.streakBonus });
      markDailyAward(profile, dayKey, 'streak-bonus');
    }

    if (mode === 'tutorial' && wordId) {
      const tutorialKey = `tutorial:${wordId}`;
      if (!(profile.completedWordsEver || []).includes(tutorialKey)) {
        profile.completedWordsEver.push(tutorialKey);
      }
    } else if (mode !== 'tutorial') {
      markDailyAward(profile, dayKey, awardKey);
    }

    if (isDailyMode) {
      if (mode === 'dailyMatch') profile.completedWordsByMode.dailyMatch.push(dayKey);
      else profile.completedWordsByMode.dailyWordle.push(dayKey);
      profile.stats.dailyChallengesCompleted += 1;
    } else if (mode === 'vowelPractice') {
      profile.completedWordsByMode.vowelPractice = true;
    } else if (mode === 'hangulBuilder' && wordId) {
      if (!profile.completedWordsByMode.hangulBuilder.includes(wordId)) {
        profile.completedWordsByMode.hangulBuilder.push(wordId);
      }
    } else if (mode === 'koreanMatch' && wordId) {
      if (!profile.completedWordsByMode.koreanMatch.includes(wordId)) {
        profile.completedWordsByMode.koreanMatch.push(wordId);
      }
    }

    const prevLevel = global.LevelUtils?.getLevelFromTotalXp(profile.totalXp)?.level || 1;
    profile.totalXp += xpEarned;
    profile.stats.totalActivities += 1;
    global.ProfileService?.markLearningDay?.(profile, dayKey);
    if (wordId && mode !== 'vowelPractice') {
      global.ProfileService?.addRecentWord?.(profile, wordId, mode);
    }

    const newBadges = global.BadgeService?.checkNewBadges?.(profile) || [];
    newBadges.forEach((b) => profile.earnedBadges.push(b));

    const newAvatars = global.BadgeService?.checkNewAvatars?.(profile) || [];
    newAvatars.forEach((id) => {
      if (!profile.unlockedAvatarIds.includes(id)) profile.unlockedAvatarIds.push(id);
    });

    const newFrames = global.BadgeService?.checkNewFrames?.(profile) || [];
    newFrames.forEach((id) => {
      if (!profile.unlockedFrameIds.includes(id)) profile.unlockedFrameIds.push(id);
    });

    const newLevel = global.LevelUtils?.getLevelFromTotalXp(profile.totalXp)?.level || 1;
    const leveledUp = newLevel > prevLevel;
    const coinsGranted = leveledUp
      ? global.ShopService?.grantLevelUpCoinsOnProfile?.(profile, prevLevel, newLevel) || 0
      : 0;

    global.ProfileService?.saveProfile?.(profile);
    if (coinsGranted > 0) global.PlayerHud?.refresh?.();

    const levelInfo = global.LevelUtils?.getLevelFromTotalXp(profile.totalXp);
    const uncelebratedBadges = newBadges.filter(
      (b) => !(profile.celebratedBadgeIds || []).includes(b.id)
    );

    return {
      awarded: true,
      xpEarned,
      breakdown,
      totalXp: profile.totalXp,
      level: newLevel,
      prevLevel,
      leveledUp,
      coinsGranted,
      levelInfo,
      newBadges,
      uncelebratedBadges,
      newAvatars,
      messageKey: MODE_LABEL_KEYS[mode] || 'profile.xp.genericComplete',
      profile,
    };
  }

  function markLevelCelebrated(level) {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return;
    profile.lastCelebratedLevel = Math.max(profile.lastCelebratedLevel || 1, level);
    global.ProfileService?.saveProfile?.(profile);
  }

  function markBadgesCelebrated(badgeIds) {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile || !badgeIds?.length) return;
    badgeIds.forEach((id) => {
      if (!profile.celebratedBadgeIds.includes(id)) profile.celebratedBadgeIds.push(id);
    });
    global.ProfileService?.saveProfile?.(profile);
  }

  const MATCH_XP_MODES = new Set(['koreanMatch', 'dailyMatch', 'wordChain', 'relatedWords']);

  function getResultMode(result) {
    return result?.breakdown?.find((b) => b.type === 'base')?.mode || '';
  }

  function isMatchXpMode(mode) {
    return MATCH_XP_MODES.has(mode);
  }

  function shouldShowLevelUp(result) {
    if (!result?.leveledUp) return false;
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return false;
    return result.level > (profile.lastCelebratedLevel || 1);
  }

  function handleRewards(result) {
    if (!result?.awarded || !global.ProfileUI) return result;
    const mode = getResultMode(result);
    const isMatch = isMatchXpMode(mode);
    let badgeDelay = 0;

    if (isMatch) {
      setTimeout(() => { void global.ProfileUI.showMatchXpCelebration(result); }, 320);
      if (shouldShowLevelUp(result)) {
        if (result.coinsGranted > 0) {
          setTimeout(() => global.ShopUI?.showLevelCoinToast?.(result.coinsGranted), 1800);
        }
        markLevelCelebrated(result.level);
        badgeDelay = 3400;
      } else {
        badgeDelay = 2000;
      }
    } else {
      global.ProfileUI.showXpToast(result);
      if (shouldShowLevelUp(result)) {
        global.ProfileUI.showLevelUpModal(result);
        if (result.coinsGranted > 0) {
          global.ShopUI?.showLevelCoinToast?.(result.coinsGranted);
        }
        markLevelCelebrated(result.level);
        badgeDelay = 800;
      }
    }

    if (result.uncelebratedBadges?.length) {
      result.uncelebratedBadges.forEach((badge, i) => {
        setTimeout(() => {
          global.ProfileUI.showBadgeModal(badge);
          markBadgesCelebrated([badge.id]);
        }, i * 400 + badgeDelay);
      });
    }
    return result;
  }

  function awardAndCelebrate(opts) {
    try {
      const safe = opts && typeof opts === 'object' ? opts : {};
      const mode = resolveMode(safe);
      const result = awardLearningXp(safe);
      try {
        const questResult = global.QuestService?.recordActivity?.(mode, {
          won: safe.won === true,
          guessCount: safe.guessCount,
        }) || {};
        const questRewards = questResult.rewards || [];
        if (questRewards.length) global.QuestUI?.showQuestCompleteToast?.(questRewards);
        if (questResult.wheelAvailable) {
          setTimeout(() => global.WheelUI?.tryShow?.(), questRewards.length ? 1200 : 400);
        }
      } catch (questErr) {
        console.warn('[Jamodeul] Quest progress failed safely.', questErr);
      }
      if (result.awarded) handleRewards(result);
      return result;
    } catch (err) {
      console.warn('[Jamodeul] XP award failed safely.', err);
      return { awarded: false, xpEarned: 0, breakdown: [] };
    }
  }

  global.XpService = {
    XP_REWARDS,
    awardLearningXp,
    awardAndCelebrate,
    markLevelCelebrated,
    markBadgesCelebrated,
    shouldShowLevelUp,
    isMatchXpMode,
    getResultMode,
    handleRewards,
  };
})(typeof window !== 'undefined' ? window : globalThis);
