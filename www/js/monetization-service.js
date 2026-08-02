/**
 * Coin packs (IAP) + rewarded ads for coins.
 *
 * Web / until plugins are installed: preview/mock flows so you can test the shop.
 * Native: wires to AdMob + StoreKit/Play Billing when Capacitor plugins are present.
 *
 * Outside setup (AdMob / App Store / Play Console) is documented in MONETIZATION.md.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'jamodeul-monetization';

  /** Google sample rewarded units — replace with yours after AdMob setup. */
  const TEST_REWARDED = {
    android: 'ca-app-pub-3940256099942544/5224354917',
    ios: 'ca-app-pub-3940256099942544/1712485313',
  };

  const CONFIG = {
    // Set false and fill real IDs once AdMob units exist.
    useTestAdIds: true,
    admob: {
      androidAppId: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
      iosAppId: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
      rewardedAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ',
      rewardedIos: 'ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ',
    },
    adRewardCoins: 25,
    adDailyLimit: 5,
    adCooldownMs: 90 * 1000,
  };

  /**
   * productId must match App Store Connect + Google Play Console exactly.
   * Bundle: com.kyh.jamodeul (see capacitor.config.json).
   */
  const COIN_PACKS = [
    {
      id: 'coins_100',
      coins: 100,
      priceLabel: '$0.99',
      productId: 'com.kyh.jamodeul.coins_100',
      badge: null,
    },
    {
      id: 'coins_550',
      coins: 550,
      priceLabel: '$4.99',
      productId: 'com.kyh.jamodeul.coins_550',
      badge: 'popular',
    },
    {
      id: 'coins_1200',
      coins: 1200,
      priceLabel: '$9.99',
      productId: 'com.kyh.jamodeul.coins_1200',
      badge: 'best',
    },
  ];

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? key;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function loadState() {
    const raw = global.AppStorage?.get?.(STORAGE_KEY, null);
    if (raw && typeof raw === 'object') return raw;
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    if (global.AppStorage?.set) global.AppStorage.set(STORAGE_KEY, state);
    else {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
    }
  }

  function isNative() {
    return !!(global.Capacitor?.isNativePlatform?.());
  }

  function platform() {
    const p = global.Capacitor?.getPlatform?.();
    if (p === 'ios' || p === 'android') return p;
    return 'web';
  }

  function rewardedAdUnitId() {
    if (CONFIG.useTestAdIds) {
      return platform() === 'ios' ? TEST_REWARDED.ios : TEST_REWARDED.android;
    }
    return platform() === 'ios'
      ? CONFIG.admob.rewardedIos
      : CONFIG.admob.rewardedAndroid;
  }

  function getAdStatus() {
    const state = loadState();
    const day = todayKey();
    if (state.adDay !== day) {
      return {
        remaining: CONFIG.adDailyLimit,
        cooldownMs: 0,
        rewardCoins: CONFIG.adRewardCoins,
        dailyLimit: CONFIG.adDailyLimit,
      };
    }
    const used = Math.max(0, parseInt(state.adCount, 10) || 0);
    const lastAt = parseInt(state.adLastAt, 10) || 0;
    const cooldownLeft = Math.max(0, CONFIG.adCooldownMs - (Date.now() - lastAt));
    return {
      remaining: Math.max(0, CONFIG.adDailyLimit - used),
      cooldownMs: cooldownLeft,
      rewardCoins: CONFIG.adRewardCoins,
      dailyLimit: CONFIG.adDailyLimit,
    };
  }

  function recordAdReward() {
    const state = loadState();
    const day = todayKey();
    if (state.adDay !== day) {
      state.adDay = day;
      state.adCount = 0;
    }
    state.adCount = (parseInt(state.adCount, 10) || 0) + 1;
    state.adLastAt = Date.now();
    saveState(state);
  }

  function grantPackCoins(coins, source) {
    const n = Math.max(0, parseInt(coins, 10) || 0);
    if (!n) return { ok: false, reason: 'empty' };
    // Paid / ad coins should not double via coin boost.
    global.ShopService?.grantCoins?.(n, { skipBoost: true });
    global.PlayerHud?.refresh?.();
    return { ok: true, coins: n, source };
  }

  function getAdMobPlugin() {
    return global.AdMob
      || global.Capacitor?.Plugins?.AdMob
      || null;
  }

  function getPurchasesPlugin() {
    return global.NativePurchases
      || global.Purchases
      || global.Capacitor?.Plugins?.NativePurchases
      || global.Capacitor?.Plugins?.Purchases
      || null;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Short preview overlay when real AdMob is not installed yet. */
  async function mockRewardedAd() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'monetization-ad-preview';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="monetization-ad-preview-card">
          <p class="monetization-ad-preview-title">${t('shop.adPreviewTitle')}</p>
          <p class="monetization-ad-preview-body">${t('shop.adPreviewBody')}</p>
          <div class="monetization-ad-preview-bar"><span></span></div>
        </div>
      `;
      document.body.appendChild(overlay);
      const bar = overlay.querySelector('.monetization-ad-preview-bar > span');
      const duration = 2200;
      const start = performance.now();
      function tick(now) {
        const p = Math.min(1, (now - start) / duration);
        if (bar) bar.style.width = `${Math.round(p * 100)}%`;
        if (p < 1) requestAnimationFrame(tick);
        else {
          overlay.remove();
          resolve({ ok: true, mocked: true });
        }
      }
      requestAnimationFrame(tick);
    });
  }

  async function showNativeRewardedAd() {
    const AdMob = getAdMobPlugin();
    if (!AdMob) return { ok: false, reason: 'no-plugin' };

    const adId = rewardedAdUnitId();
    try {
      if (typeof AdMob.initialize === 'function' && !global.__jamodeulAdMobReady) {
        await AdMob.initialize({
          initializeForTesting: !!CONFIG.useTestAdIds,
        });
        global.__jamodeulAdMobReady = true;
      }

      const options = {
        adId,
        isTesting: !!CONFIG.useTestAdIds,
      };

      if (typeof AdMob.prepareRewardVideoAd === 'function') {
        await AdMob.prepareRewardVideoAd(options);
        const result = await AdMob.showRewardVideoAd();
        if (result === true || result?.rewarded || result?.type) {
          return { ok: true };
        }
        return { ok: false, reason: 'not-rewarded' };
      }

      if (typeof AdMob.showRewardedAd === 'function') {
        await AdMob.showRewardedAd(options);
        return { ok: true };
      }

      return { ok: false, reason: 'unsupported-api' };
    } catch (err) {
      console.warn('[Monetization] rewarded ad failed', err);
      return { ok: false, reason: 'ad-error', error: String(err?.message || err) };
    }
  }

  async function watchAdForCoins() {
    const status = getAdStatus();
    if (status.remaining <= 0) {
      return { ok: false, reason: 'daily-limit', status };
    }
    if (status.cooldownMs > 0) {
      return { ok: false, reason: 'cooldown', status };
    }

    let adResult;
    if (isNative() && getAdMobPlugin()) {
      adResult = await showNativeRewardedAd();
      if (!adResult.ok && adResult.reason === 'no-plugin') {
        adResult = await mockRewardedAd();
      }
    } else {
      adResult = await mockRewardedAd();
    }

    if (!adResult.ok) return { ...adResult, status: getAdStatus() };

    recordAdReward();
    const grant = grantPackCoins(CONFIG.adRewardCoins, 'ad');
    return {
      ok: true,
      coins: grant.coins,
      mocked: !!adResult.mocked,
      status: getAdStatus(),
    };
  }

  async function purchaseCoinPack(packId) {
    const pack = COIN_PACKS.find((p) => p.id === packId);
    if (!pack) return { ok: false, reason: 'unknown-pack' };

    const Purchases = getPurchasesPlugin();
    if (isNative() && Purchases) {
      try {
        if (typeof Purchases.purchaseProduct === 'function') {
          await Purchases.purchaseProduct({ productIdentifier: pack.productId });
        } else if (typeof Purchases.purchasePackage === 'function') {
          await Purchases.purchasePackage({ identifier: pack.productId });
        } else if (typeof Purchases.purchase === 'function') {
          await Purchases.purchase({ productId: pack.productId });
        } else {
          return { ok: false, reason: 'unsupported-iap' };
        }
        const grant = grantPackCoins(pack.coins, 'iap');
        return { ok: true, coins: grant.coins, packId: pack.id };
      } catch (err) {
        const msg = String(err?.message || err || '');
        if (/cancel/i.test(msg)) return { ok: false, reason: 'cancelled' };
        console.warn('[Monetization] IAP failed', err);
        return { ok: false, reason: 'iap-error', error: msg };
      }
    }

    // Preview purchase (web / plugins not installed yet).
    const confirmed = global.confirm?.(
      t('shop.iapPreviewConfirm', {
        coins: pack.coins,
        price: pack.priceLabel,
      })
    );
    if (!confirmed) return { ok: false, reason: 'cancelled' };
    const grant = grantPackCoins(pack.coins, 'iap-preview');
    return { ok: true, coins: grant.coins, packId: pack.id, mocked: true };
  }

  function getCoinPacks() {
    return COIN_PACKS.map((p) => ({ ...p }));
  }

  global.MonetizationService = {
    CONFIG,
    COIN_PACKS,
    getCoinPacks,
    getAdStatus,
    watchAdForCoins,
    purchaseCoinPack,
    isNative,
    platform,
  };
})(typeof window !== 'undefined' ? window : globalThis);
