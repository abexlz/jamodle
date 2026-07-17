/**
 * XP level calculations — flat 100 XP per level.
 * Level = floor(totalXp / 100) + 1
 */
(function (global) {
  'use strict';

  const XP_PER_LEVEL = 100;

  /** XP needed to advance from `level` to level + 1 */
  function xpRequiredForLevel(_level) {
    return XP_PER_LEVEL;
  }

  /** Total XP required to reach `level` (level 1 = 0 XP) */
  function totalXpForLevel(level) {
    const target = Math.max(1, parseInt(level, 10) || 1);
    return (target - 1) * XP_PER_LEVEL;
  }

  function getLevelFromTotalXp(totalXp) {
    const xp = Math.max(0, parseInt(totalXp, 10) || 0);
    const level = Math.floor(xp / XP_PER_LEVEL) + 1;
    const xpInLevel = xp % XP_PER_LEVEL;
    return {
      level,
      xpInLevel,
      xpToNext: XP_PER_LEVEL,
    };
  }

  const TITLE_RANGES = [
    { min: 21, id: 'hangul-hero' },
    { min: 15, id: 'korean-pathfinder' },
    { min: 10, id: 'word-explorer' },
    { min: 6, id: 'syllable-builder' },
    { min: 3, id: 'jamo-learner' },
    { min: 1, id: 'hangul-starter' },
  ];

  function getLevelTitleId(level) {
    const lv = Math.max(1, parseInt(level, 10) || 1);
    const match = TITLE_RANGES.find((r) => lv >= r.min);
    return match ? match.id : 'hangul-starter';
  }

  function getLevelTitle(level, t) {
    const id = getLevelTitleId(level);
    return getTitleLabel(id, t);
  }

  function getTitleLabel(titleId, t) {
    const shopTitle = global.ShopService?.TITLES?.[titleId];
    if (shopTitle) {
      const shopKey = `shop.titles.${titleId}`;
      const shopTranslated = t ? t(shopKey) : '';
      if (shopTranslated && shopTranslated !== shopKey) return shopTranslated;
    }
    const key = `profile.levelTitles.${titleId}`;
    const translated = t ? t(key) : '';
    return translated || titleId;
  }

  function getUnlockedTitleIds(level, profile) {
    const lv = Math.max(1, parseInt(level, 10) || 1);
    const levelTitles = TITLE_RANGES
      .filter((r) => lv >= r.min)
      .map((r) => r.id)
      .reverse();
    const purchased = profile?.purchasedTitleIds || [];
    return [...levelTitles, ...purchased.filter((id) => !levelTitles.includes(id))];
  }

  function isTitleUnlocked(level, titleId, profile) {
    if (profile && (profile.purchasedTitleIds || []).includes(titleId)) return true;
    const lv = Math.max(1, parseInt(level, 10) || 1);
    const match = TITLE_RANGES.find((r) => r.id === titleId);
    return match ? lv >= match.min : false;
  }

  function resolveTitleId(level, titleId) {
    const unlocked = getUnlockedTitleIds(level);
    if (titleId && unlocked.includes(titleId)) return titleId;
    return getLevelTitleId(level);
  }

  global.LevelUtils = {
    XP_PER_LEVEL,
    xpRequiredForLevel,
    totalXpForLevel,
    getLevelFromTotalXp,
    getLevelTitleId,
    getLevelTitle,
    getTitleLabel,
    getUnlockedTitleIds,
    isTitleUnlocked,
    resolveTitleId,
    TITLE_RANGES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
