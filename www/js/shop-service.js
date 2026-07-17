/**
 * Shop inventory, purchases, and coin rewards — persisted via ProfileService.
 */
(function (global) {
  'use strict';

  const COINS_PER_LEVEL = 10;

  const THEMES = {
    cherry: { id: 'cherry', price: 50, swatch: '#FFB8D0' },
    'deep-sea': { id: 'deep-sea', price: 50, swatch: '#4A9EC8' },
    'dark-hanji': { id: 'dark-hanji', price: 50, swatch: '#8A7858' },
  };

  const TITLES = {
    wordsmith: { id: 'wordsmith', price: 80, icon: '⚔️' },
    'chain-master': { id: 'chain-master', price: 80, icon: '🔗' },
    'jamodle-pro': { id: 'jamodle-pro', price: 100, icon: '🎯' },
    'hangul-sage': { id: 'hangul-sage', price: 120, icon: '📜' },
  };

  const FRAMES = {
    sakura: { id: 'sakura', price: 60, swatch: '#FFB8D0' },
    neon: { id: 'neon', price: 75, swatch: '#68d8f8' },
    sunset: { id: 'sunset', price: 75, swatch: '#FFB878' },
    galaxy: { id: 'galaxy', price: 100, swatch: '#9966cc' },
  };

  const ITEMS = {
    hintToken: { id: 'hintToken', price: 15, icon: '🪙', useHintTokens: true },
    extraGuess: { id: 'extraGuess', field: 'extraGuessTokens', price: 40, icon: '❤️' },
  };

  function loadProfile() {
    return global.ProfileService?.loadProfile?.() || null;
  }

  function saveProfile(profile) {
    return global.ProfileService?.saveProfile?.(profile);
  }

  function getCoins() {
    return loadProfile()?.coins || 0;
  }

  function getInventory() {
    const p = loadProfile();
    if (!p) {
      return {
        coins: 0, extraGuessTokens: 0, ownedThemes: [],
        purchasedTitleIds: [], unlockedFrameIds: [], selectedCosmeticTheme: 'default',
      };
    }
    return {
      coins: p.coins || 0,
      extraGuessTokens: p.extraGuessTokens || 0,
      ownedThemes: [...(p.ownedThemes || [])],
      purchasedTitleIds: [...(p.purchasedTitleIds || [])],
      unlockedFrameIds: [...(p.unlockedFrameIds || [])],
      selectedCosmeticTheme: p.selectedCosmeticTheme || 'default',
    };
  }

  function getItemCount(itemId) {
    const item = ITEMS[itemId];
    if (!item) return 0;
    if (item.useHintTokens) return global.HintTokens?.get?.() ?? 0;
    const p = loadProfile();
    return p ? Math.max(0, parseInt(p[item.field], 10) || 0) : 0;
  }

  function ownsTheme(themeId) {
    if (!themeId || themeId === 'default') return true;
    const p = loadProfile();
    return !!(p?.ownedThemes || []).includes(themeId);
  }

  function ownsTitle(titleId) {
    const p = loadProfile();
    if (!p) return false;
    if (global.ProfileService?.isTitleUnlocked?.(p, titleId)) return true;
    return !!(p.purchasedTitleIds || []).includes(titleId);
  }

  function ownsFrame(frameId) {
    if (!frameId || frameId === 'none') return true;
    const p = loadProfile();
    if (!p) return false;
    return global.ProfileService?.isFrameUnlocked?.(p, frameId) === true;
  }

  function canAfford(price) {
    return getCoins() >= price;
  }

  function grantCoins(amount) {
    const n = Math.max(0, parseInt(amount, 10) || 0);
    if (!n) return getCoins();
    const profile = loadProfile();
    if (!profile) return 0;
    profile.coins = (profile.coins || 0) + n;
    saveProfile(profile);
    global.PlayerHud?.refresh?.();
    return profile.coins;
  }

  function grantLevelUpCoinsOnProfile(profile, prevLevel, newLevel) {
    const from = Math.max(1, parseInt(prevLevel, 10) || 1);
    const to = Math.max(from, parseInt(newLevel, 10) || from);
    if (to <= from || !profile) return 0;
    const coins = (to - from) * COINS_PER_LEVEL;
    profile.coins = (profile.coins || 0) + coins;
    return coins;
  }

  function grantLevelUpCoins(prevLevel, newLevel) {
    const profile = loadProfile();
    if (!profile) return 0;
    const coins = grantLevelUpCoinsOnProfile(profile, prevLevel, newLevel);
    if (coins > 0) saveProfile(profile);
    global.PlayerHud?.refresh?.();
    return coins;
  }

  function buyTheme(themeId) {
    const theme = THEMES[themeId];
    if (!theme) return { ok: false, reason: 'unknown' };
    const profile = loadProfile();
    if (!profile) return { ok: false, reason: 'no-profile' };
    if ((profile.ownedThemes || []).includes(themeId)) return { ok: false, reason: 'owned' };
    if ((profile.coins || 0) < theme.price) return { ok: false, reason: 'insufficient' };

    profile.coins -= theme.price;
    if (!profile.ownedThemes) profile.ownedThemes = [];
    profile.ownedThemes.push(themeId);
    saveProfile(profile);
    global.PlayerHud?.refresh?.();
    return { ok: true, coins: profile.coins };
  }

  function buyTitle(titleId) {
    const title = TITLES[titleId];
    if (!title) return { ok: false, reason: 'unknown' };
    const profile = loadProfile();
    if (!profile) return { ok: false, reason: 'no-profile' };
    if (ownsTitle(titleId)) return { ok: false, reason: 'owned' };
    if ((profile.coins || 0) < title.price) return { ok: false, reason: 'insufficient' };

    profile.coins -= title.price;
    if (!profile.purchasedTitleIds) profile.purchasedTitleIds = [];
    profile.purchasedTitleIds.push(titleId);
    saveProfile(profile);
    global.PlayerHud?.refresh?.();
    return { ok: true, coins: profile.coins };
  }

  function buyFrame(frameId) {
    const frame = FRAMES[frameId];
    if (!frame) return { ok: false, reason: 'unknown' };
    const profile = loadProfile();
    if (!profile) return { ok: false, reason: 'no-profile' };
    if (ownsFrame(frameId)) return { ok: false, reason: 'owned' };
    if ((profile.coins || 0) < frame.price) return { ok: false, reason: 'insufficient' };

    profile.coins -= frame.price;
    if (!profile.unlockedFrameIds) profile.unlockedFrameIds = [];
    if (!profile.unlockedFrameIds.includes(frameId)) {
      profile.unlockedFrameIds.push(frameId);
    }
    saveProfile(profile);
    global.PlayerHud?.refresh?.();
    return { ok: true, coins: profile.coins };
  }

  function buyItem(itemId) {
    const item = ITEMS[itemId];
    if (!item) return { ok: false, reason: 'unknown' };
    const profile = loadProfile();
    if (!profile) return { ok: false, reason: 'no-profile' };
    if ((profile.coins || 0) < item.price) return { ok: false, reason: 'insufficient' };

    profile.coins -= item.price;

    if (item.useHintTokens) {
      saveProfile(profile);
      global.HintTokens?.grant?.(1);
      global.PlayerHud?.refresh?.();
      return { ok: true, count: global.HintTokens?.get?.() ?? 0, coins: profile.coins };
    }

    profile[item.field] = (profile[item.field] || 0) + 1;
    saveProfile(profile);
    global.PlayerHud?.refresh?.();
    return { ok: true, count: profile[item.field], coins: profile.coins };
  }

  function selectTheme(themeId) {
    const profile = loadProfile();
    if (!profile) return { ok: false };
    if (themeId !== 'default' && !(profile.ownedThemes || []).includes(themeId)) {
      return { ok: false, reason: 'locked' };
    }
    profile.selectedCosmeticTheme = themeId || 'default';
    saveProfile(profile);
    global.CosmeticThemes?.apply?.(themeId);
    return { ok: true };
  }

  function spendExtraGuessToken() {
    const profile = loadProfile();
    if (!profile || (profile.extraGuessTokens || 0) < 1) return false;
    profile.extraGuessTokens -= 1;
    saveProfile(profile);
    global.PlayerHud?.refresh?.();
    return true;
  }

  global.ShopService = {
    COINS_PER_LEVEL,
    THEMES,
    TITLES,
    FRAMES,
    ITEMS,
    getCoins,
    getInventory,
    getItemCount,
    ownsTheme,
    ownsTitle,
    ownsFrame,
    canAfford,
    grantCoins,
    grantLevelUpCoins,
    grantLevelUpCoinsOnProfile,
    buyTheme,
    buyTitle,
    buyFrame,
    buyItem,
    selectTheme,
    spendExtraGuessToken,
  };
})(typeof window !== 'undefined' ? window : globalThis);
