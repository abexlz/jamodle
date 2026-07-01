/**
 * Learning progress & daily-challenge status for the home menu.
 *
 * Storage keys (do not rename — existing daily/streak data stays separate):
 * - jamodeul-learning-progress: { wordsLearned: number }
 * - jamodeul-daily-{date}-{2|3}: Wordle daily (read-only here)
 * - jamodeul-match-daily-{date}: Match daily (read-only here)
 */
(function (global) {
  'use strict';

  const PROGRESS_KEY = 'jamodeul-learning-progress';
  const DAILY_LAUNCH = '2024-01-01';
  const DAILY_TZ = 'Asia/Seoul';

  const FALLBACK_CONFIG = {
    MATCH_LEVELS: [{ level: 1, theme: 'First words', themeKo: '첫 단어' }],
    WORDS_PER_LEVEL: 4,
    HARD_MODE_UNLOCK_LEVEL: 5,
  };

  function cfg() {
    return global.MenuConfig || FALLBACK_CONFIG;
  }

  function getTodayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function loadProgress() {
    const store = global.AppStorage;
    const data = store ? store.get(PROGRESS_KEY, {}) : {};
    return {
      wordsLearned: Math.max(0, parseInt(data.wordsLearned, 10) || 0),
      builderWordsCompleted: Math.max(0, parseInt(data.builderWordsCompleted, 10) || 0),
    };
  }

  function saveProgress(data) {
    if (global.AppStorage) {
      global.AppStorage.set(PROGRESS_KEY, data);
    } else {
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
      } catch {}
    }
  }

  /** Called when the user completes a Korean Match practice word. */
  function recordMatchWord() {
    const progress = loadProgress();
    progress.wordsLearned += 1;
    saveProgress(progress);
    return progress;
  }

  /**
   * Map wordsLearned to a themed level for the Continue Learning card.
   * Level advances every WORDS_PER_LEVEL wins (Level 1 at 0–3, Level 2 at 4–7, …).
   */
  function getMatchLevelInfo(wordsLearned) {
    const { MATCH_LEVELS, WORDS_PER_LEVEL } = cfg();
    const levelIndex = Math.min(
      Math.floor(wordsLearned / WORDS_PER_LEVEL),
      MATCH_LEVELS.length - 1
    );
    const level = MATCH_LEVELS[levelIndex] || MATCH_LEVELS[0];
    return {
      ...level,
      levelIndex,
      wordsInLevel: wordsLearned % WORDS_PER_LEVEL,
      wordsToNext: WORDS_PER_LEVEL - (wordsLearned % WORDS_PER_LEVEL),
    };
  }

  /** Called when the user completes a Hangul Builder word. */
  function recordBuilderWord() {
    const progress = loadProgress();
    progress.builderWordsCompleted += 1;
    saveProgress(progress);
    return progress;
  }

  function t(key, vars) {
    const val = global.I18n?.t(key, vars);
    return val != null && val !== '' ? val : '';
  }

  function getFeaturedProgress() {
    const { wordsLearned } = loadProgress();
    const info = getMatchLevelInfo(wordsLearned);
    const themeKey = `menu.themes.${info.level}`;
    const themeName = t(themeKey) || info.theme;
    return {
      level: info.level,
      theme: themeName,
      wordsLearned,
      progressLine: t('menu.progress.levelLine', { level: info.level, theme: themeName, count: wordsLearned }),
      href: 'match.html',
    };
  }

  /** Hard Mode unlocks after reaching Korean Match Level 5. */
  function isHardModeUnlocked() {
    return getMatchLevelInfo(loadProgress().wordsLearned).level >= cfg().HARD_MODE_UNLOCK_LEVEL;
  }

  function getHardModeUnlockHint() {
    const { wordsLearned } = loadProgress();
    const info = getMatchLevelInfo(wordsLearned);
    if (info.level >= cfg().HARD_MODE_UNLOCK_LEVEL) return '';
    const wordsForLevel = (cfg().HARD_MODE_UNLOCK_LEVEL - 1) * cfg().WORDS_PER_LEVEL;
    const remaining = Math.max(0, wordsForLevel - wordsLearned);
    if (remaining === 0) return '';
    return t('menu.progress.hardUnlock', { count: remaining });
  }

  function loadDailySaved(wordLength) {
    const key = 'jamodeul-daily-' + getTodayKey() + '-' + wordLength;
    if (global.AppStorage) return global.AppStorage.get(key, null);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function loadMatchDailySaved() {
    const key = 'jamodeul-match-daily-' + getTodayKey();
    if (global.AppStorage) return global.AppStorage.get(key, null);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Daily Wordle card progress — always 2-letter daily. */
  function getDailyWordleProgress() {
    const saved = loadDailySaved(2);

    if (saved && !saved.over) {
      return t('menu.progress.dailyWordleAttempts', { count: saved.guesses.length });
    }
    if (saved && saved.over && saved.won) return t('menu.progress.dailyWordleComplete');
    if (saved && saved.over) return t('menu.progress.dailyWordleFinished');
    return t('menu.progress.dailyWordleNotStarted');
  }

  function isDailyWordleComplete() {
    const text = getDailyWordleProgress();
    return text === t('menu.progress.dailyWordleComplete') || text === t('menu.progress.dailyWordleFinished');
  }

  /** Daily Match — one play per day; show completion or remaining attempt. */
  function getDailyMatchProgress() {
    const saved = loadMatchDailySaved();
    if (saved && saved.over && saved.won) return t('menu.progress.dailyMatchComplete');
    if (saved && saved.over) return t('menu.progress.dailyMatchTomorrow');
    if (saved && saved.guessCount > 0) return t('menu.progress.dailyMatchInProgress');
    return t('menu.progress.dailyMatchLeft');
  }

  function isDailyMatchComplete() {
    const saved = loadMatchDailySaved();
    return !!(saved && saved.over && saved.won);
  }

  function resetAllProgress() {
    const prefixes = ['jamodeul-daily-', 'jamodeul-match-daily-'];
    const exact = [
      PROGRESS_KEY,
      'jamodeul-korean-learning-streak',
      'jamodeul-builder-progress',
      'jamodeul-match-best-streak',
      'jamodeul-tokens',
      'jamodeul-user-profile',
      'jamodeul-daily-calendar',
      global.TutorialProgress?.PROGRESS_KEY || 'jamodeul-tutorial-progress',
    ];
    if (global.AppStorage) {
      exact.forEach((k) => global.AppStorage.remove(k));
      prefixes.forEach((p) => global.AppStorage.getPrefixed(p).forEach((k) => global.AppStorage.remove(k)));
      return;
    }
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (exact.includes(k) || prefixes.some((p) => k.startsWith(p))) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }

  global.MenuProgress = {
    loadProgress,
    recordMatchWord,
    recordBuilderWord,
    getMatchLevelInfo,
    getFeaturedProgress,
    isHardModeUnlocked,
    getHardModeUnlockHint,
    getDailyWordleProgress,
    isDailyWordleComplete,
    getDailyMatchProgress,
    isDailyMatchComplete,
    resetAllProgress,
  };
})(typeof window !== 'undefined' ? window : globalThis);
