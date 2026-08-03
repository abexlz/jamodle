/**
 * Chest Room — buy wooden / original / mega boxes; free mega when all dailies done.
 */
(function (global) {
  'use strict';

  const TIERS = {
    wooden: {
      id: 'wooden',
      price: 20,
      closedImg: 'assets/chests/wooden-closed.png',
      openImg: 'assets/chests/wooden-open.png',
      prizes: [
        { id: 'coins-3', type: 'coins', amount: 3, weight: 20, icon: '🪙' },
        { id: 'coins-5', type: 'coins', amount: 5, weight: 16, icon: '🪙' },
        { id: 'coins-8', type: 'coins', amount: 8, weight: 14, icon: '🪙' },
        { id: 'coins-12', type: 'coins', amount: 12, weight: 10, icon: '🪙' },
        { id: 'xp-10', type: 'xp', amount: 10, weight: 12, icon: '⭐' },
        { id: 'xp-15', type: 'xp', amount: 15, weight: 8, icon: '✨' },
        { id: 'hint-1', type: 'hintToken', amount: 1, weight: 8, icon: '💡' },
        { id: 'extra-1', type: 'extraGuess', amount: 1, weight: 4, icon: '❤️' },
        { id: 'coins-20', type: 'coins', amount: 20, weight: 3, icon: '💰' },
      ],
    },
    original: {
      id: 'original',
      price: 50,
      closedImg: 'assets/chests/chest-closed.png',
      openImg: 'assets/chests/chest-open.png',
      prizes: [
        { id: 'coins-5', type: 'coins', amount: 5, weight: 16, icon: '🪙' },
        { id: 'coins-10', type: 'coins', amount: 10, weight: 14, icon: '🪙' },
        { id: 'coins-15', type: 'coins', amount: 15, weight: 12, icon: '🪙' },
        { id: 'coins-25', type: 'coins', amount: 25, weight: 8, icon: '💰' },
        { id: 'xp-20', type: 'xp', amount: 20, weight: 12, icon: '⭐' },
        { id: 'xp-40', type: 'xp', amount: 40, weight: 6, icon: '✨' },
        { id: 'hint-1', type: 'hintToken', amount: 1, weight: 10, icon: '💡' },
        { id: 'hint-2', type: 'hintToken', amount: 2, weight: 4, icon: '💡' },
        { id: 'extra-1', type: 'extraGuess', amount: 1, weight: 7, icon: '❤️' },
        { id: 'buff-xp', type: 'buff', amount: 1, buffId: 'xpBoost2x15', weight: 3, icon: '⚡' },
        { id: 'coins-50', type: 'coins', amount: 50, weight: 3, icon: '🎁' },
      ],
    },
    mega: {
      id: 'mega',
      price: 100,
      closedImg: 'assets/chests/mega-closed.png',
      openImg: 'assets/chests/mega-open.png',
      prizes: [
        { id: 'coins-15', type: 'coins', amount: 15, weight: 14, icon: '🪙' },
        { id: 'coins-25', type: 'coins', amount: 25, weight: 12, icon: '🪙' },
        { id: 'coins-40', type: 'coins', amount: 40, weight: 10, icon: '💰' },
        { id: 'coins-60', type: 'coins', amount: 60, weight: 6, icon: '💰' },
        { id: 'coins-100', type: 'coins', amount: 100, weight: 2, icon: '🎁' },
        { id: 'xp-30', type: 'xp', amount: 30, weight: 11, icon: '⭐' },
        { id: 'xp-50', type: 'xp', amount: 50, weight: 8, icon: '✨' },
        { id: 'xp-80', type: 'xp', amount: 80, weight: 4, icon: '✨' },
        { id: 'hint-1', type: 'hintToken', amount: 1, weight: 9, icon: '💡' },
        { id: 'hint-2', type: 'hintToken', amount: 2, weight: 5, icon: '💡' },
        { id: 'extra-1', type: 'extraGuess', amount: 1, weight: 7, icon: '❤️' },
        { id: 'extra-2', type: 'extraGuess', amount: 2, weight: 3, icon: '❤️' },
        { id: 'buff-xp', type: 'buff', amount: 1, buffId: 'xpBoost2x15', weight: 4, icon: '⚡' },
        { id: 'buff-coin', type: 'buff', amount: 1, buffId: 'coinBoost2x15', weight: 3, icon: '⚡' },
        { id: 'buff-daily', type: 'buff', amount: 1, buffId: 'dailyUnlock7', weight: 1, icon: '📅' },
      ],
    },
  };

  const TIER_ORDER = ['wooden', 'original', 'mega'];

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

  function getTier(tierId) {
    return TIERS[tierId] || null;
  }

  function listTiers() {
    return TIER_ORDER.map((id) => ({ ...TIERS[id] }));
  }

  function pickPrize(tierId, seedKey) {
    const tier = getTier(tierId);
    if (!tier) return { prize: null, index: -1 };
    const prizes = tier.prizes;
    const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
    let seed = hashString(seedKey || String(Date.now()));
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    let roll = seed % totalWeight;
    for (let i = 0; i < prizes.length; i++) {
      roll -= prizes[i].weight;
      if (roll < 0) return { prize: { ...prizes[i] }, index: i };
    }
    return { prize: { ...prizes[0] }, index: 0 };
  }

  function isDailyMegaAvailable(profile) {
    return global.QuestService?.isDailyWheelAvailable?.(profile) ?? false;
  }

  function applyPrize(profile, prize) {
    if (!profile || !prize) return profile;
    switch (prize.type) {
      case 'coins':
        profile.coins = (profile.coins || 0)
          + (global.BuffService?.scaleCoins?.(prize.amount, profile) ?? prize.amount);
        break;
      case 'xp':
        profile.totalXp = (profile.totalXp || 0)
          + (global.BuffService?.scaleXp?.(prize.amount, profile) ?? prize.amount);
        break;
      case 'hintToken':
        global.HintTokens?.grant?.(prize.amount);
        break;
      case 'extraGuess':
        profile.extraGuessTokens = (profile.extraGuessTokens || 0) + prize.amount;
        break;
      case 'buff':
        global.BuffService?.activate?.(prize.buffId || 'xpBoost2x15', { profile, skipSave: true });
        break;
      default:
        break;
    }
    return profile;
  }

  function prizeToRewardDisplay(prize) {
    if (!prize) return { coins: 0, xp: 0, bonusItem: null };
    if (prize.type === 'coins') {
      return { coins: prize.amount, xp: 0, bonusItem: null };
    }
    if (prize.type === 'xp') {
      return { coins: 0, xp: prize.amount, bonusItem: null };
    }
    if (prize.type === 'buff') {
      return { coins: 0, xp: 0, bonusItem: prize.buffId || null };
    }
    if (prize.type === 'hintToken') {
      return { coins: 0, xp: 0, bonusItem: null, bonusKind: 'hint', bonusAmount: prize.amount };
    }
    if (prize.type === 'extraGuess') {
      return { coins: 0, xp: 0, bonusItem: null, bonusKind: 'heart', bonusAmount: prize.amount };
    }
    return { coins: 0, xp: 0, bonusItem: null };
  }

  function claimFreeMega() {
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return { ok: false, reason: 'no-profile' };

    global.QuestService?.claimCompletedDailies?.(profile);
    if (!isDailyMegaAvailable(profile)) return { ok: false, reason: 'unavailable' };

    const today = getTodayKey();
    const coinsBefore = profile.coins || 0;
    const { prize, index } = pickPrize(
      'mega',
      `mega-free:${today}:${profile.displayName || 'player'}`,
    );
    applyPrize(profile, prize);
    profile.questState.dailyWheelClaimed = true;
    global.ProfileService?.saveProfile?.(profile);
    global.PlayerHud?.refresh?.();

    return {
      ok: true,
      free: true,
      tierId: 'mega',
      tier: getTier('mega'),
      prize,
      index,
      coinsBefore,
      display: prizeToRewardDisplay(prize),
    };
  }

  function buyChest(tierId) {
    const tier = getTier(tierId);
    if (!tier) return { ok: false, reason: 'invalid-tier' };

    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return { ok: false, reason: 'no-profile' };

    if ((profile.coins || 0) < tier.price) {
      return { ok: false, reason: 'insufficient', price: tier.price, coins: profile.coins || 0 };
    }

    const coinsBeforePurchase = profile.coins || 0;
    profile.coins = coinsBeforePurchase - tier.price;

    const today = getTodayKey();
    const seed = `chest-buy:${tierId}:${today}:${Date.now()}:${profile.displayName || 'player'}`;
    const { prize, index } = pickPrize(tierId, seed);
    const coinsBeforeReward = profile.coins || 0;
    applyPrize(profile, prize);
    global.ProfileService?.saveProfile?.(profile);
    global.PlayerHud?.refresh?.();

    return {
      ok: true,
      free: false,
      tierId,
      tier,
      prize,
      index,
      price: tier.price,
      coinsBefore: coinsBeforeReward,
      display: prizeToRewardDisplay(prize),
    };
  }

  // Back-compat aliases used by older quest / menu code paths.
  function claimSpin() {
    const result = claimFreeMega();
    if (!result.ok) return result;
    return {
      ...result,
      rotation: 1800,
    };
  }

  global.ChestRoomService = {
    TIERS,
    TIER_ORDER,
    getTier,
    listTiers,
    pickPrize,
    isDailyMegaAvailable,
    isDailyWheelAvailable: isDailyMegaAvailable,
    applyPrize,
    prizeToRewardDisplay,
    claimFreeMega,
    buyChest,
    claimSpin,
    getTodayKey,
  };

  // Keep WheelService working for older scripts/tests until fully migrated.
  global.WheelService = global.ChestRoomService;
})(typeof window !== 'undefined' ? window : globalThis);
