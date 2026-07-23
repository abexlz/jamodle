/**
 * Daily quest bonus wheel — weighted prizes, one spin per day when all dailies done.
 */
(function (global) {
  'use strict';

  const PRIZES = [
    { id: 'coins-5', type: 'coins', amount: 5, weight: 22, icon: '🪙', color: '#FFE8D4' },
    { id: 'coins-10', type: 'coins', amount: 10, weight: 18, icon: '🪙', color: '#FFD0A8' },
    { id: 'coins-15', type: 'coins', amount: 15, weight: 14, icon: '🪙', color: '#FFC090' },
    { id: 'coins-25', type: 'coins', amount: 25, weight: 8, icon: '💰', color: '#FFD878' },
    { id: 'xp-20', type: 'xp', amount: 20, weight: 12, icon: '⭐', color: '#E8DEFF' },
    { id: 'xp-40', type: 'xp', amount: 40, weight: 6, icon: '✨', color: '#CFC0F5' },
    { id: 'hint-1', type: 'hintToken', amount: 1, weight: 10, icon: '💡', color: '#C8F0E0' },
    { id: 'extra-1', type: 'extraGuess', amount: 1, weight: 7, icon: '❤️', color: '#FFB8D0' },
    { id: 'coins-50', type: 'coins', amount: 50, weight: 3, icon: '🎁', color: '#98DDB8' },
  ];

  const TOTAL_WEIGHT = PRIZES.reduce((s, p) => s + p.weight, 0);

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function getTodayKey() {
    return global.QuestService?.getTodayKey?.()
      || global.ProfileService?.getTodayKey?.()
      || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  }

  function pickPrize(seedKey) {
    let seed = hashString(seedKey || String(Date.now()));
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    let roll = seed % TOTAL_WEIGHT;
    for (let i = 0; i < PRIZES.length; i++) {
      roll -= PRIZES[i].weight;
      if (roll < 0) return { prize: PRIZES[i], index: i };
    }
    return { prize: PRIZES[0], index: 0 };
  }

  function getSegmentAngle(index) {
    const slice = 360 / PRIZES.length;
    return slice * index + slice / 2;
  }

  function spinRotation(index) {
    const targetAngle = getSegmentAngle(index);
    const spins = 5 + (hashString(getTodayKey()) % 3);
    return spins * 360 + (360 - targetAngle);
  }

  function isDailyWheelAvailable(profile) {
    return global.QuestService?.isDailyWheelAvailable?.(profile) ?? false;
  }

  function applyPrize(profile, prize) {
    if (!profile || !prize) return profile;
    switch (prize.type) {
      case 'coins':
        profile.coins = (profile.coins || 0) + prize.amount;
        break;
      case 'xp':
        profile.totalXp = (profile.totalXp || 0) + prize.amount;
        break;
      case 'hintToken':
        global.HintTokens?.grant?.(prize.amount);
        break;
      case 'extraGuess':
        profile.extraGuessTokens = (profile.extraGuessTokens || 0) + prize.amount;
        break;
      default:
        break;
    }
    return profile;
  }

  function claimSpin() {
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return { ok: false, reason: 'no-profile' };

    global.QuestService?.claimCompletedDailies?.(profile);
    if (!isDailyWheelAvailable(profile)) return { ok: false, reason: 'unavailable' };

    const today = getTodayKey();
    const { prize, index } = pickPrize(`wheel:${today}:${profile.displayName || 'player'}`);
    applyPrize(profile, prize);
    profile.questState.dailyWheelClaimed = true;
    global.ProfileService?.saveProfile?.(profile);
    global.PlayerHud?.refresh?.();

    return {
      ok: true,
      prize,
      index,
      rotation: spinRotation(index),
    };
  }

  global.WheelService = {
    PRIZES,
    pickPrize,
    spinRotation,
    isDailyWheelAvailable,
    applyPrize,
    claimSpin,
    getTodayKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
