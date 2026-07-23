/**
 * Game-mode menu configuration — single source of truth for sections, cards, and unlock rules.
 *
 * Progression model:
 * - Korean Match practice wins increment `wordsLearned` (see menu-progress.js).
 * - Each MATCH_LEVEL spans WORDS_PER_LEVEL wins; level name drives the Continue Learning card.
 * - Hard Mode unlocks once the user reaches HARD_MODE_UNLOCK_LEVEL (words learned threshold).
 */
(function (global) {
  'use strict';

  /** Words completed in Korean Match needed before Hard Mode is recommended/unlocked. */
  const HARD_MODE_UNLOCK_LEVEL = 5;

  /** Wins per themed level shown on the Continue Learning card. */
  const WORDS_PER_LEVEL = 4;

  /**
   * Themed Korean Match levels — index 0 = Level 1, etc.
   * `wordsRequired` is cumulative words learned to *enter* this level.
   */
  const MATCH_LEVELS = [
    { level: 1, theme: 'First words', themeKo: '첫 단어' },
    { level: 2, theme: 'Animals', themeKo: '동물' },
    { level: 3, theme: 'Food words', themeKo: '음식' },
    { level: 4, theme: 'Nature', themeKo: '자연' },
    { level: 5, theme: 'Daily life', themeKo: '일상' },
    { level: 6, theme: 'Places', themeKo: '장소' },
    { level: 7, theme: 'Friends & family', themeKo: '사람' },
    { level: 8, theme: 'School', themeKo: '학교' },
    { level: 9, theme: 'Travel', themeKo: '여행' },
    { level: 10, theme: 'Challenge ready', themeKo: '도전 준비' },
  ];

  const ACCENTS = {
    mint: 'mint',
    peach: 'peach',
    blue: 'blue',
    lavender: 'lavender',
    yellow: 'yellow',
    pink: 'pink',
    battle: 'battle',
    muted: 'muted',
  };

  const MENU = {
    header: {
      title: '한글들',
      subtitle: 'Learn Korean letters by building real words.',
      subtitleKo: '실제 단어를 만들며 한글을 배워요',
    },
    sections: [
      {
        id: 'featured',
        type: 'featured',
      },
      {
        id: 'daily',
        type: 'daily-challenges',
        title: 'Daily Challenges',
        titleKo: '오늘의 도전',
      },
      {
        id: 'word-games',
        type: 'word-games',
        title: 'Word Games',
        titleKo: '단어 게임',
        modes: [],
      },
      {
        id: 'learn',
        type: 'learning',
        title: 'Learn Hangul',
        titleKo: '한글 배우기',
        modes: [
          {
            id: 'hangul-builder',
            icon: '🧩',
            title: 'Hangul Builder',
            subtitle: 'Learn how Korean syllable blocks are made.',
            subtitleKo: 'ㄱ + ㅗ = 고',
            accent: ACCENTS.lavender,
            href: 'builder.html',
            recommended: false,
          },
          {
            id: 'vowel-practice',
            icon: 'ㅏ',
            title: 'Vowel Practice',
            subtitle: 'Learn horizontal, vertical, and compound vowels.',
            subtitleKo: 'ㅏ · ㅓ · ㅗ · ㅜ · ㅘ',
            accent: ACCENTS.blue,
            href: 'vowels.html',
            recommended: false,
          },
          {
            id: 'tutorial',
            icon: '📘',
            title: 'Tutorial',
            subtitle: 'Learn placement, rotation, merge, and word building.',
            subtitleKo: '배치 · 돌리기 · 합치기 · 단어 만들기',
            accent: ACCENTS.muted,
            href: 'match-tutorial.html?start=1',
            recommended: false,
          },
        ],
      },
    ],
    menuTop: [
      {
        id: 'daily-match',
        icon: '🎯',
        title: 'Daily Puzzle',
        subtitleKo: '오늘의 자모 조합',
        accent: ACCENTS.peach,
        action: 'daily-match',
      },
    ],
    menuPlay: [
      {
        id: 'classic',
        icon: '🎯',
        title: 'Classic',
        subtitleKo: '자모를 끌어 단어를 완성해요',
        accent: ACCENTS.peach,
        href: 'match.html',
      },
      {
        id: 'related-words',
        icon: '🔗',
        title: 'Word Chain',
        subtitle: 'Link related words across every theme.',
        subtitleKo: '여러 테마의 연관 단어를 이어 만들어요',
        accent: ACCENTS.mint,
        href: 'related-words.html',
      },
    ],
    dailyChallenges: [],
    featured: {
      title: 'Continue Learning',
      subtitle: 'Build your next Korean word',
      subtitleKo: '다음 단어를 만들어 보세요',
      cta: 'Play Korean Match',
      href: 'match.html',
    },
  };

  global.MenuConfig = {
    MENU,
    MATCH_LEVELS,
    WORDS_PER_LEVEL,
    HARD_MODE_UNLOCK_LEVEL,
    ACCENTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
