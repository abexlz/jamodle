/**
 * Random bot profiles for matchmaking fallback opponents.
 */
(function (global) {
  'use strict';

  const BOT_FALLBACK_MS = 25_000;

  const BOT_NAMES = [
    '민지', '서준', '하은', '도윤', '지우', '예린', '수아', '태양', '유나', '현우',
    '지민', '은서', '준호', '소율', '건우', '나연', '시우', '다은', '재민', '하린',
    '윤서', '지호', '채원', '우진', '서연', '민준', '지아', '도현', '수빈', '예준',
    '자모고수', '단어왕', '한글탐험가', '초성마스터', '글자요정', '모음요리사',
    '받침킹', '연결고리', '끝말잇기왕', '연상달인', '자모요정', '한글챔피언',
  ];

  const SPEED_POOL = ['slow', 'medium', 'medium', 'medium', 'fast'];

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function pickRandomBotProfile() {
    const BS = global.BadgeService;
    const avatars = (BS?.AVATAR_UNLOCKS || []).filter((a) => a.id !== 'default');
    const frames = (BS?.FRAME_UNLOCKS || []).filter((f) => f.id !== 'none');
    const avatar = pickRandom(avatars.length ? avatars : [{ id: 'cat', icon: '🐱' }]);
    const frame = pickRandom(frames.length ? frames : [{ id: 'bronze' }]);
    const level = 3 + Math.floor(Math.random() * 18);
    const xpToNext = 100;
    const xpInLevel = Math.floor(Math.random() * xpToNext);
    const totalXp = level * 120 + xpInLevel;
    const avatarDef = BS?.getAvatarDef?.(avatar.id) || avatar;

    return {
      name: pickRandom(BOT_NAMES),
      avatarId: avatar.id,
      avatarIcon: avatarDef.icon || avatar.icon || '🌸',
      frameId: frame.id,
      level,
      xpInLevel,
      xpToNext,
      totalXp,
    };
  }

  function randomBotDifficulty() {
    return {
      winrate: 40 + Math.floor(Math.random() * 21),
      speed: pickRandom(SPEED_POOL),
    };
  }

  function buildBotMatchUrl(game, profile, options = {}) {
    const difficulty = randomBotDifficulty();
    const params = new URLSearchParams({
      bot: '1',
      source: 'matchmaking',
      name: profile.name,
      avatarId: profile.avatarId,
      frameId: profile.frameId,
      level: String(profile.level),
      winrate: String(options.winrate ?? difficulty.winrate),
      speed: options.speed || difficulty.speed,
    });
    if (game === 'jamodle' && options.wordLength) {
      params.set('wordLength', String(options.wordLength));
    }
    const page = game === 'word-chain' ? 'related-words-race.html' : 'match-turn.html';
    return `${page}?${params}`;
  }

  function redirectToBotMatch(game, options = {}) {
    const profile = pickRandomBotProfile();
    global.location.href = buildBotMatchUrl(game, profile, options);
  }

  global.BotProfileService = {
    BOT_FALLBACK_MS,
    BOT_NAMES,
    pickRandomBotProfile,
    buildBotMatchUrl,
    redirectToBotMatch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
