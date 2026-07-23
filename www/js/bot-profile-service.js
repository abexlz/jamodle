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

  const SPEED_POOL = ['slow', 'medium', 'medium'];

  const BOT_PROFILE_KEY = 'jamodeul-bot-opponent-profile';
  const LOCAL_BOT_UIDS = new Set(['bot']);
  const LOCAL_PLAYER_UIDS = new Set(['me', 'player']);

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

  function storeActiveBotProfile(profile) {
    if (!profile?.name) return;
    try {
      sessionStorage.setItem(BOT_PROFILE_KEY, JSON.stringify(profile));
    } catch { /* ignore */ }
  }

  function getActiveBotProfile() {
    try {
      const raw = sessionStorage.getItem(BOT_PROFILE_KEY);
      if (!raw) return null;
      const profile = JSON.parse(raw);
      if (!profile?.name) return null;
      return {
        name: profile.name,
        displayName: profile.name,
        avatarId: profile.avatarId || 'default',
        avatarIcon: profile.avatarIcon || global.BadgeService?.getAvatarDef?.(profile.avatarId)?.icon || '🌸',
        frameId: profile.frameId || 'none',
        level: profile.level || 1,
        xpInLevel: profile.xpInLevel || 0,
        xpToNext: profile.xpToNext || 100,
        totalXp: profile.totalXp || 0,
      };
    } catch {
      return null;
    }
  }

  function isBotMatchUid(uid) {
    return LOCAL_BOT_UIDS.has(String(uid || ''));
  }

  function isLocalPlayerUid(uid) {
    return LOCAL_PLAYER_UIDS.has(String(uid || ''));
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
    storeActiveBotProfile(profile);
    global.location.href = buildBotMatchUrl(game, profile, options);
  }

  global.BotProfileService = {
    BOT_FALLBACK_MS,
    BOT_NAMES,
    pickRandomBotProfile,
    storeActiveBotProfile,
    getActiveBotProfile,
    isBotMatchUid,
    isLocalPlayerUid,
    buildBotMatchUrl,
    redirectToBotMatch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
