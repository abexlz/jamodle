/**
 * Quest chest rewards — tap to open, CS-style prize reel, coin fly to HUD.
 */
(function (global) {
  'use strict';

  const STYLES_HREF = 'css/chest-reward.css?v=9';
  const CHEST_CLOSED = 'assets/chests/chest-closed.png';
  const CHEST_OPEN = 'assets/chests/chest-open.png';
  const COIN_SRC = 'assets/coin.png';

  const TIER_ASSETS = {
    wooden: {
      closed: 'assets/chests/wooden-closed.png',
      open: 'assets/chests/wooden-open.png',
    },
    original: {
      closed: CHEST_CLOSED,
      open: CHEST_OPEN,
    },
    mega: {
      closed: 'assets/chests/mega-closed.png',
      open: 'assets/chests/mega-open.png',
    },
  };

  /** How many taps before the chest fully opens. */
  const TIER_TAP_COUNTS = {
    wooden: 2,
    original: 3,
    mega: 4,
  };

  function resolveChestAssets(opts = {}) {
    const tier = opts.chestTier && TIER_ASSETS[opts.chestTier]
      ? TIER_ASSETS[opts.chestTier]
      : TIER_ASSETS.original;
    return {
      closed: opts.closedSrc || tier.closed,
      open: opts.openSrc || tier.open,
    };
  }

  function resolveTapCount(opts = {}) {
    if (opts.tapCount != null) {
      return Math.max(1, Math.floor(Number(opts.tapCount) || 1));
    }
    if (reduceMotion()) return 1;
    const tier = opts.chestTier && TIER_TAP_COUNTS[opts.chestTier]
      ? opts.chestTier
      : 'original';
    return TIER_TAP_COUNTS[tier] || 3;
  }

  const CARD_W = 88;
  const CARD_GAP = 10;
  const STRIDE = CARD_W + CARD_GAP;
  const REEL_COUNT = 42;
  const WINNER_INDEX = 34;

  const FILLER_POOL = [
    { kind: 'coins', amount: 5, tier: 'common' },
    { kind: 'coins', amount: 8, tier: 'common' },
    { kind: 'coins', amount: 10, tier: 'common' },
    { kind: 'coins', amount: 12, tier: 'common' },
    { kind: 'coins', amount: 15, tier: 'uncommon' },
    { kind: 'coins', amount: 20, tier: 'uncommon' },
    { kind: 'coins', amount: 40, tier: 'rare' },
    { kind: 'coins', amount: 50, tier: 'rare' },
    { kind: 'xp', amount: 10, tier: 'common' },
    { kind: 'xp', amount: 15, tier: 'common' },
    { kind: 'xp', amount: 25, tier: 'uncommon' },
    { kind: 'xp', amount: 50, tier: 'rare' },
    { kind: 'hint', amount: 1, tier: 'uncommon' },
    { kind: 'heart', amount: 1, tier: 'uncommon' },
    { kind: 'buff', buffId: 'dailyUnlock7', tier: 'legendary' },
    { kind: 'buff', buffId: 'xpBoost2x15', tier: 'rare' },
    { kind: 'buff', buffId: 'coinBoost2x15', tier: 'rare' },
  ];

  const BUFF_ICONS = {
    dailyUnlock7: 'assets/shop/daily-unlock-7.png',
    xpBoost2x15: 'assets/shop/xp-boost-2x.png',
    coinBoost2x15: 'assets/shop/coin-boost-2x.png',
  };

  let activeOverlay = null;
  let opening = false;

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function reduceMotion() {
    return global.UserPreferences?.shouldReduceMotion?.() === true;
  }

  function ensureStyles() {
    let link = document.getElementById('chest-reward-styles');
    if (!link) {
      link = document.createElement('link');
      link.id = 'chest-reward-styles';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== STYLES_HREF) {
      link.href = STYLES_HREF;
    }
  }

  function preloadImages() {
    [
      CHEST_CLOSED,
      CHEST_OPEN,
      TIER_ASSETS.wooden.closed,
      TIER_ASSETS.wooden.open,
      TIER_ASSETS.mega.closed,
      TIER_ASSETS.mega.open,
      COIN_SRC,
      ...Object.values(BUFF_ICONS),
    ].forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  function wait(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  function easeOutQuint(x) {
    return 1 - ((1 - x) ** 5);
  }

  function pickFiller(avoidCoins) {
    const pool = FILLER_POOL.filter((p) => !(p.kind === 'coins' && p.amount === avoidCoins));
    return pool[Math.floor(Math.random() * pool.length)] || FILLER_POOL[0];
  }

  function winnerTier(coins) {
    if (coins >= 40) return 'legendary';
    if (coins >= 25) return 'rare';
    if (coins >= 15) return 'uncommon';
    return 'common';
  }

  function buildReelItems(reward) {
    const coins = Math.max(0, Math.floor(Number(reward.coins) || 0));
    const bonusItem = typeof reward.bonusItem === 'string' ? reward.bonusItem : null;
    const bonusKind = typeof reward.bonusKind === 'string' ? reward.bonusKind : null;
    const bonusAmount = Math.max(0, Math.floor(Number(reward.bonusAmount) || 0));
    const items = [];
    for (let i = 0; i < REEL_COUNT; i++) {
      if (i === WINNER_INDEX) {
        if (bonusItem && BUFF_ICONS[bonusItem]) {
          items.push({
            kind: 'buff',
            buffId: bonusItem,
            tier: 'legendary',
            coins,
            xp: Math.max(0, Math.floor(Number(reward.xp) || 0)),
            winner: true,
          });
        } else if (bonusKind === 'hint') {
          items.push({
            kind: 'hint',
            amount: bonusAmount || 1,
            tier: 'uncommon',
            winner: true,
          });
        } else if (bonusKind === 'heart') {
          items.push({
            kind: 'heart',
            amount: bonusAmount || 1,
            tier: 'uncommon',
            winner: true,
          });
        } else if ((reward.xp || 0) > 0 && coins <= 0) {
          items.push({
            kind: 'xp',
            amount: Math.max(0, Math.floor(Number(reward.xp) || 0)),
            tier: winnerTier(reward.xp || 0),
            winner: true,
          });
        } else {
          items.push({
            kind: 'coins',
            amount: coins,
            tier: winnerTier(coins),
            xp: Math.max(0, Math.floor(Number(reward.xp) || 0)),
            winner: true,
          });
        }
      } else {
        items.push({ ...pickFiller(coins), winner: false });
      }
    }
    return items;
  }

  function cardIconHtml(item) {
    if (item.kind === 'buff') {
      const src = BUFF_ICONS[item.buffId] || COIN_SRC;
      return `<img class="chest-reel-buff-img" src="${escapeHtml(src)}" alt="" width="40" height="40" decoding="async" draggable="false">`;
    }
    if (item.kind === 'coins') {
      return global.CoinIcon?.html?.('coin-icon coin-icon--md') || '🪙';
    }
    if (item.kind === 'xp') {
      return '<span class="chest-reel-xp-badge" aria-hidden="true">XP</span>';
    }
    if (item.kind === 'hint') return '<span class="chest-reel-emoji" aria-hidden="true">💡</span>';
    if (item.kind === 'heart') return '<span class="chest-reel-emoji" aria-hidden="true">❤️</span>';
    return global.CoinIcon?.html?.('coin-icon coin-icon--md') || '🪙';
  }

  function cardLabel(item) {
    if (item.kind === 'buff') return t(`shop.items.${item.buffId}Short`) || t(`shop.items.${item.buffId}`) || 'BUFF';
    if (item.kind === 'xp') return `+${item.amount}`;
    if (item.kind === 'hint' || item.kind === 'heart') return `×${item.amount}`;
    return String(item.amount);
  }

  function cardSub(item) {
    if (item.kind === 'buff') return t(`shop.items.${item.buffId}Tag`) || 'BUFF';
    if (item.kind === 'xp') return 'XP';
    if (item.kind === 'hint') return t('quests.reelHint') || 'Hint';
    if (item.kind === 'heart') return t('quests.reelHeart') || 'Life';
    return t('shop.coins') || 'Coins';
  }

  function buildReelCardsHtml(items) {
    return items.map((item, i) => `
      <div class="chest-reel-card chest-reel-card--${escapeHtml(item.tier)}${item.winner ? ' is-winner' : ''}"
        data-reel-index="${i}" aria-hidden="true">
        <span class="chest-reel-card-icon">${cardIconHtml(item)}</span>
        <span class="chest-reel-card-amt">${escapeHtml(cardLabel(item))}</span>
        <span class="chest-reel-card-sub">${escapeHtml(cardSub(item))}</span>
      </div>
    `).join('');
  }

  function buildAmountsHtml(reward) {
    const coinIcon = global.CoinIcon?.html?.('coin-icon coin-icon--lg') || '🪙';
    const parts = [];
    if ((reward.coins || 0) > 0) {
      parts.push(`
        <div class="chest-reward-coins">
          <span aria-hidden="true">${coinIcon}</span>
          <span>+${escapeHtml(String(reward.coins || 0))}</span>
        </div>
      `);
    }
    if ((reward.xp || 0) > 0) {
      parts.push(`
        <div class="chest-reward-xp">
          <span class="chest-reel-xp-badge" aria-hidden="true">XP</span>
          <span>+${escapeHtml(String(reward.xp || 0))}</span>
        </div>
      `);
    }
    if (reward.bonusItem) {
      parts.push(`
        <div class="chest-reward-bonus">
          <img class="chest-reward-bonus-img" src="${escapeHtml(BUFF_ICONS[reward.bonusItem] || COIN_SRC)}" alt="" width="36" height="36" decoding="async" draggable="false">
          <span>${escapeHtml(t(`shop.items.${reward.bonusItem}`) || reward.bonusItem)}</span>
        </div>
      `);
    } else if (reward.bonusKind === 'hint') {
      parts.push(`
        <div class="chest-reward-bonus">
          <span class="chest-reel-emoji" aria-hidden="true">💡</span>
          <span>+${escapeHtml(String(reward.bonusAmount || 1))} ${escapeHtml(t('quests.reelHint') || 'Hint')}</span>
        </div>
      `);
    } else if (reward.bonusKind === 'heart') {
      parts.push(`
        <div class="chest-reward-bonus">
          <span class="chest-reel-emoji" aria-hidden="true">❤️</span>
          <span>+${escapeHtml(String(reward.bonusAmount || 1))} ${escapeHtml(t('quests.reelHeart') || 'Life')}</span>
        </div>
      `);
    } else if (reward.prizeLabel && !(reward.coins || reward.xp)) {
      parts.push(`<div class="chest-reward-xp">${escapeHtml(reward.prizeLabel)}</div>`);
    }
    if (!parts.length) {
      parts.push(`<div class="chest-reward-xp">${escapeHtml(reward.prizeLabel || t('quests.chestOpened'))}</div>`);
    }
    return parts.join('');
  }

  function buildOverlayHtml(reward, assets, tapTotal) {
    const items = buildReelItems(reward);
    const title = reward.title || t('quests.chestTitle');
    const dots = Array.from({ length: Math.max(1, tapTotal) }, (_, i) => (
      `<span class="chest-tap-dot" data-tap-dot="${i}" aria-hidden="true"></span>`
    )).join('');
    return `
      <div class="chest-reward-stage">
        <h2 class="chest-reward-title">${escapeHtml(title)}</h2>
        <p class="chest-reward-hint" id="chest-reward-hint">${escapeHtml(t('quests.chestTap'))}</p>
        <div class="chest-tap-progress" id="chest-tap-progress" aria-hidden="true">
          ${dots}
        </div>

        <button type="button" class="chest-reward-chest-wrap no-press is-idle" id="chest-reward-tap"
          aria-label="${escapeHtml(t('quests.chestTap'))}">
          <span class="chest-reward-glow" aria-hidden="true"></span>
          <img class="chest-reward-img chest-reward-img--closed" src="${escapeHtml(assets.closed)}" alt="" draggable="false">
          <img class="chest-reward-img chest-reward-img--open" src="${escapeHtml(assets.open)}" alt="" draggable="false">
          <span class="chest-reward-sparkles" aria-hidden="true">
            <span class="chest-reward-sparkle"></span>
            <span class="chest-reward-sparkle"></span>
            <span class="chest-reward-sparkle"></span>
            <span class="chest-reward-sparkle"></span>
            <span class="chest-reward-sparkle"></span>
            <span class="chest-reward-sparkle"></span>
          </span>
        </button>

        <div class="chest-reel" id="chest-reel" hidden>
          <div class="chest-reel-window" aria-hidden="true">
            <div class="chest-reel-fade chest-reel-fade--left"></div>
            <div class="chest-reel-fade chest-reel-fade--right"></div>
            <div class="chest-reel-marker"></div>
            <div class="chest-reel-track" id="chest-reel-track" style="transform: translate3d(0,0,0)">
              ${buildReelCardsHtml(items)}
            </div>
          </div>
        </div>

        <div class="chest-reward-amounts" id="chest-reward-amounts" aria-live="polite">
          ${buildAmountsHtml(reward)}
        </div>
        <button type="button" class="chest-reward-continue" id="chest-reward-continue">
          ${escapeHtml(t('quests.chestContinue'))}
        </button>
      </div>
    `;
  }

  function getHudCoinEl() {
    return (
      document.querySelector('.menu-hud-coins.player-hud-compact')
      || document.querySelector('.menu-hud-coins')
      || document.querySelector('[data-player-hud="compact"] .menu-hud-coins')
      || document.querySelector('.player-hud-coins')
      || document.querySelector('.chest-room-balance')
      || document.getElementById('player-hud')
    );
  }

  function getHudCoinValueEl(hud) {
    return hud?.querySelector?.('.menu-hud-coins-value')
      || hud?.querySelector?.('#chest-room-coins')
      || null;
  }

  function getElCenter(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function setDisplayedCoins(value) {
    const hud = getHudCoinEl();
    const valueEl = getHudCoinValueEl(hud);
    if (valueEl) valueEl.textContent = String(Math.max(0, Math.floor(value)));
  }

  function bumpHud() {
    const hud = getHudCoinEl();
    if (!hud) return;
    hud.classList.remove('is-chest-collect');
    void hud.offsetWidth;
    hud.classList.add('is-chest-collect');
    global.setTimeout(() => hud.classList.remove('is-chest-collect'), 450);
  }

  function coinCountForAmount(coins) {
    const n = Math.max(1, Math.floor(Number(coins) || 0));
    if (n <= 8) return Math.max(6, n);
    if (n <= 25) return 12;
    if (n <= 45) return 16;
    return 20;
  }

  function spawnTrail(x, y, delay) {
    const trail = document.createElement('span');
    trail.className = 'chest-fly-trail';
    trail.style.transform = `translate(${x - 4}px, ${y - 4}px)`;
    document.body.appendChild(trail);
    const anim = trail.animate([
      { opacity: 0.75, transform: `translate(${x - 4}px, ${y - 4}px) scale(1)` },
      { opacity: 0, transform: `translate(${x - 4}px, ${y - 4}px) scale(0.2)` },
    ], {
      duration: 320,
      delay,
      easing: 'ease-out',
      fill: 'forwards',
    });
    anim.finished.then(() => trail.remove()).catch(() => trail.remove());
  }

  function flyOneCoin(from, to, delay, size) {
    return new Promise((resolve) => {
      const el = document.createElement('img');
      el.className = 'chest-fly-coin';
      el.src = COIN_SRC;
      el.alt = '';
      el.draggable = false;
      el.width = size;
      el.height = size;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      document.body.appendChild(el);

      const burstAngle = (Math.random() * Math.PI) - (Math.PI / 2);
      const burstDist = 40 + Math.random() * 90;
      const mid1 = {
        x: from.x + Math.cos(burstAngle) * burstDist,
        y: from.y + Math.sin(burstAngle) * burstDist - 20,
      };
      const mid2 = {
        x: from.x + (to.x - from.x) * 0.55 + (Math.random() * 40 - 20),
        y: Math.min(from.y, to.y) - 40 - Math.random() * 50,
      };

      const start = `translate(${from.x - size / 2}px, ${from.y - size / 2}px) scale(0.25) rotate(0deg)`;
      const burst = `translate(${mid1.x - size / 2}px, ${mid1.y - size / 2}px) scale(1.25) rotate(${90 + Math.random() * 120}deg)`;
      const arc = `translate(${mid2.x - size / 2}px, ${mid2.y - size / 2}px) scale(1.05) rotate(${180 + Math.random() * 120}deg)`;
      const end = `translate(${to.x - size / 2}px, ${to.y - size / 2}px) scale(0.35) rotate(${300 + Math.random() * 80}deg)`;

      const duration = 720 + Math.random() * 180;
      const anim = el.animate([
        { transform: start, opacity: 0 },
        { transform: burst, opacity: 1, offset: 0.18 },
        { transform: arc, opacity: 1, offset: 0.48 },
        { transform: end, opacity: 0.95, offset: 0.92 },
        { transform: end, opacity: 0 },
      ], {
        duration,
        delay,
        easing: 'cubic-bezier(0.18, 0.7, 0.22, 1)',
        fill: 'forwards',
      });

      spawnTrail(mid1.x, mid1.y, delay + duration * 0.12);

      anim.finished
        .then(() => { el.remove(); resolve(); })
        .catch(() => { el.remove(); resolve(); });
    });
  }

  async function playCoinFlight(overlay, reward, coinsBefore) {
    const totalCoins = Math.max(0, Math.floor(Number(reward.coins) || 0));
    if (totalCoins <= 0) return;

    const reel = overlay.querySelector('#chest-reel');
    const winnerCard = overlay.querySelector('.chest-reel-card.is-winner');
    const from = getElCenter(winnerCard) || getElCenter(reel) || {
      x: global.innerWidth / 2,
      y: global.innerHeight / 2,
    };

    const hud = getHudCoinEl();
    const to = getElCenter(hud?.querySelector?.('.menu-hud-coins-coin') || hud) || {
      x: global.innerWidth - 36,
      y: 36,
    };

    const count = coinCountForAmount(reward.coins);
    let landed = 0;

    setDisplayedCoins(coinsBefore);

    if (reduceMotion()) {
      setDisplayedCoins(coinsBefore + totalCoins);
      bumpHud();
      global.SoundEffects?.coinCollect?.();
      return;
    }

    const flights = [];
    for (let i = 0; i < count; i++) {
      const delay = 40 + i * 55 + Math.random() * 30;
      const size = 28 + Math.floor(Math.random() * 10);
      const flight = flyOneCoin(from, to, delay, size).then(() => {
        landed += 1;
        const progress = landed / count;
        setDisplayedCoins(coinsBefore + Math.round(totalCoins * progress));
        bumpHud();
        global.SoundEffects?.coinCollect?.();
      });
      flights.push(flight);
      global.setTimeout(() => global.SoundEffects?.coinFly?.(), delay + 80);
    }

    await Promise.all(flights);
    setDisplayedCoins(coinsBefore + totalCoins);
    if (!reward.xp) global.PlayerHud?.refresh?.();
  }

  function getHudXpEl() {
    return (
      document.querySelector('#nav-profile .profile-battle-card-xp')
      || document.querySelector('#menu-profile-card .profile-battle-card-xp')
      || document.querySelector('.profile-badge-card--hero .profile-battle-card-xp')
      || document.querySelector('.profile-battle-card-xp')
    );
  }

  function xpChipCount(amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n <= 0) return 0;
    if (n <= 10) return 4;
    if (n <= 20) return 6;
    if (n <= 40) return 8;
    return 10;
  }

  function flyOneXp(from, to, delay, size) {
    return new Promise((resolve) => {
      const el = document.createElement('span');
      el.className = 'chest-fly-xp';
      el.textContent = 'XP';
      el.style.width = `${size}px`;
      el.style.height = `${Math.round(size * 0.72)}px`;
      el.style.fontSize = `${Math.max(8, Math.round(size * 0.32))}px`;
      document.body.appendChild(el);

      const burstAngle = (Math.random() * Math.PI) - (Math.PI / 2);
      const burstDist = 36 + Math.random() * 70;
      const mid1 = {
        x: from.x + Math.cos(burstAngle) * burstDist,
        y: from.y + Math.sin(burstAngle) * burstDist - 16,
      };
      const mid2 = {
        x: from.x + (to.x - from.x) * 0.55 + (Math.random() * 36 - 18),
        y: Math.min(from.y, to.y) - 36 - Math.random() * 40,
      };

      const start = `translate(${from.x - size / 2}px, ${from.y - size / 2}px) scale(0.2)`;
      const burst = `translate(${mid1.x - size / 2}px, ${mid1.y - size / 2}px) scale(1.15)`;
      const arc = `translate(${mid2.x - size / 2}px, ${mid2.y - size / 2}px) scale(1)`;
      const end = `translate(${to.x - size / 2}px, ${to.y - size / 2}px) scale(0.35)`;
      const duration = 680 + Math.random() * 160;

      const anim = el.animate([
        { transform: start, opacity: 0 },
        { transform: burst, opacity: 1, offset: 0.18 },
        { transform: arc, opacity: 1, offset: 0.5 },
        { transform: end, opacity: 0.95, offset: 0.9 },
        { transform: end, opacity: 0 },
      ], {
        duration,
        delay,
        easing: 'cubic-bezier(0.18, 0.7, 0.22, 1)',
        fill: 'forwards',
      });

      anim.finished
        .then(() => { el.remove(); resolve(); })
        .catch(() => { el.remove(); resolve(); });
    });
  }

  async function playXpFlight(overlay, reward, xpBefore, xpAfter) {
    const gained = Math.max(0, Math.floor(Number(reward.xp) || 0));
    if (gained <= 0) return;

    const fromXp = xpBefore != null ? xpBefore : Math.max(0, (xpAfter || 0) - gained);
    const toXp = xpAfter != null ? xpAfter : fromXp + gained;
    global.ProfileUI?.applyBattleCardXp?.(fromXp);

    const reel = overlay.querySelector('#chest-reel');
    const winnerCard = overlay.querySelector('.chest-reel-card.is-winner');
    const from = getElCenter(winnerCard) || getElCenter(reel) || {
      x: global.innerWidth / 2,
      y: global.innerHeight / 2,
    };
    const to = getElCenter(getHudXpEl()) || getElCenter(document.getElementById('nav-profile')) || {
      x: global.innerWidth / 2,
      y: 40,
    };

    if (reduceMotion()) {
      await global.ProfileUI?.animateBattleCardXp?.(fromXp, toXp, { duration: 1 });
      global.PlayerHud?.refresh?.();
      return;
    }

    const count = xpChipCount(gained);
    const flights = [];
    for (let i = 0; i < count; i++) {
      const delay = 30 + i * 50 + Math.random() * 24;
      const size = 26 + Math.floor(Math.random() * 8);
      flights.push(flyOneXp(from, to, delay, size));
    }
    await Promise.all(flights);
    await global.ProfileUI?.animateBattleCardXp?.(fromXp, toXp);
    global.PlayerHud?.refresh?.();
    global.ProfileUI?.applyBattleCardXp?.(toXp);
  }

  function computeStopOffset(windowEl) {
    const windowW = windowEl?.clientWidth || 320;
    const centerPad = (windowW - CARD_W) / 2;
    // Land with a tiny random bias so it doesn't feel robotic
    const jitter = (Math.random() * 10) - 5;
    return (WINNER_INDEX * STRIDE) - centerPad + jitter;
  }

  function playReelSpin(overlay) {
    const track = overlay.querySelector('#chest-reel-track');
    const windowEl = overlay.querySelector('.chest-reel-window');
    if (!track || !windowEl) return Promise.resolve();

    if (reduceMotion()) {
      const stopAt = computeStopOffset(windowEl);
      track.style.transform = `translate3d(${-stopAt}px, 0, 0)`;
      overlay.querySelector('.chest-reel-card.is-winner')?.classList.add('is-landed');
      return Promise.resolve();
    }

    const stopAt = computeStopOffset(windowEl);
    const duration = 4200 + Math.floor(Math.random() * 600);
    let lastTickIndex = -1;

    return new Promise((resolve) => {
      const start = performance.now();

      function frame(now) {
        const tNorm = Math.min(1, (now - start) / duration);
        const eased = easeOutQuint(tNorm);
        const x = stopAt * eased;
        track.style.transform = `translate3d(${-x}px, 0, 0)`;

        const passing = Math.floor((x + (windowEl.clientWidth / 2)) / STRIDE);
        if (passing !== lastTickIndex && passing >= 0) {
          lastTickIndex = passing;
          if (tNorm < 0.97) global.SoundEffects?.reelTick?.();
        }

        if (tNorm < 1) {
          requestAnimationFrame(frame);
          return;
        }

        track.style.transform = `translate3d(${-stopAt}px, 0, 0)`;
        const winner = overlay.querySelector('.chest-reel-card.is-winner');
        winner?.classList.add('is-landed');
        global.SoundEffects?.reelLand?.();
        resolve();
      }

      requestAnimationFrame(frame);
    });
  }

  function closeOverlay(overlay, onComplete) {
    if (!overlay || overlay.dataset.closing === '1') return;
    overlay.dataset.closing = '1';
    overlay.classList.remove('visible');
    document.body.classList.remove('chest-reward-open');
    opening = false;
    activeOverlay = null;
    global.setTimeout(() => {
      overlay.remove();
      if (typeof onComplete === 'function') onComplete();
    }, 320);
  }

  function updateTapHint(overlay, tapsDone, tapTotal) {
    const hint = overlay.querySelector('#chest-reward-hint');
    const progress = overlay.querySelector('#chest-tap-progress');
    const remaining = Math.max(0, tapTotal - tapsDone);
    if (hint) {
      if (tapsDone <= 0) {
        hint.textContent = tapTotal > 1
          ? t('quests.chestTapMulti', { count: tapTotal })
          : t('quests.chestTap');
      } else if (remaining > 0) {
        hint.textContent = t('quests.chestTapAgain', {
          current: tapsDone,
          total: tapTotal,
        });
      } else {
        hint.textContent = t('quests.chestOpening');
      }
    }
    progress?.querySelectorAll('[data-tap-dot]').forEach((dot) => {
      const idx = Number(dot.getAttribute('data-tap-dot')) || 0;
      dot.classList.toggle('is-filled', idx < tapsDone);
    });
    if (progress) {
      progress.hidden = tapTotal <= 1;
      progress.setAttribute('aria-hidden', tapTotal <= 1 ? 'true' : 'false');
    }
  }

  function playTapShake(chestBtn, intensity) {
    if (!chestBtn) return;
    const level = Math.max(1, Math.min(3, intensity));
    chestBtn.classList.remove('is-idle', 'is-shake', 'is-shake-1', 'is-shake-2', 'is-shake-3');
    void chestBtn.offsetWidth;
    chestBtn.classList.add('is-shake', `is-shake-${level}`);
    global.SoundEffects?.chestShake?.(level === 1);
    global.setTimeout(() => {
      chestBtn.classList.remove('is-shake', 'is-shake-1', 'is-shake-2', 'is-shake-3');
      if (!opening) chestBtn.classList.add('is-idle');
    }, level >= 3 ? 720 : 560);
  }

  async function openChest(overlay, reward, coinsBefore, onComplete, onOpenStart) {
    if (opening || overlay.classList.contains('is-opened') || overlay.classList.contains('is-spinning')) {
      return;
    }
    opening = true;

    if (typeof onOpenStart === 'function') {
      try { onOpenStart(); } catch (err) {
        console.warn('[ChestRewardUI] onOpenStart failed', err);
      }
    }

    const chestBtn = overlay.querySelector('#chest-reward-tap');
    const hint = overlay.querySelector('#chest-reward-hint');
    const reel = overlay.querySelector('#chest-reel');
    const progress = overlay.querySelector('#chest-tap-progress');

    chestBtn?.classList.remove('is-idle', 'is-shake', 'is-shake-1', 'is-shake-2', 'is-shake-3');
    chestBtn?.classList.add('is-shake', 'is-shake-3');
    global.SoundEffects?.chestShake?.();

    await wait(reduceMotion() ? 60 : 480);

    chestBtn?.classList.remove('is-shake', 'is-shake-3');
    chestBtn?.classList.add('is-burst');
    overlay.classList.add('is-chest-open');
    if (progress) progress.hidden = true;
    global.SoundEffects?.chestOpen?.();

    await wait(reduceMotion() ? 80 : 420);

    // Swap to reel
    overlay.classList.add('is-spinning');
    overlay.classList.remove('is-chest-open');
    if (hint) hint.textContent = t('quests.chestSpinning');
    if (reel) reel.hidden = false;
    chestBtn?.setAttribute('tabindex', '-1');
    chestBtn?.setAttribute('aria-hidden', 'true');

    await wait(reduceMotion() ? 40 : 180);
    await playReelSpin(overlay);

    await wait(reduceMotion() ? 80 : 380);

    // Undim + reveal
    overlay.classList.add('is-opened');
    overlay.classList.remove('is-spinning');
    if (hint) {
      hint.textContent = '';
      hint.hidden = true;
    }

    const amounts = overlay.querySelector('#chest-reward-amounts');
    amounts?.classList.add('is-visible');

    await playCoinFlight(overlay, reward, coinsBefore);
    await playXpFlight(overlay, reward, overlay._xpBefore, overlay._xpAfter);

    const continueBtn = overlay.querySelector('#chest-reward-continue');
    continueBtn?.classList.add('is-visible');
    continueBtn?.focus?.();

    const autoClose = global.setTimeout(() => {
      closeOverlay(overlay, onComplete);
    }, 4800);

    continueBtn?.addEventListener('click', () => {
      global.clearTimeout(autoClose);
      global.SoundEffects?.tap?.();
      closeOverlay(overlay, onComplete);
    }, { once: true });
  }

  /**
   * @param {{
   *   coins: number, xp?: number, coinsBefore?: number, autoOpen?: boolean,
   *   bonusItem?: string, bonusKind?: string, bonusAmount?: number,
   *   prizeLabel?: string, title?: string, chestTier?: string,
   *   closedSrc?: string, openSrc?: string, tapCount?: number,
   *   xpBefore?: number, xpAfter?: number,
   *   onOpenStart?: Function, onComplete?: Function
   * }} opts
   */
  function show(opts = {}) {
    ensureStyles();
    preloadImages();

    const assets = resolveChestAssets(opts);
    const tapTotal = resolveTapCount(opts);
    const reward = {
      coins: Math.max(0, Math.floor(Number(opts.coins) || 0)),
      xp: Math.max(0, Math.floor(Number(opts.xp) || 0)),
      bonusItem: typeof opts.bonusItem === 'string' ? opts.bonusItem : null,
      bonusKind: typeof opts.bonusKind === 'string' ? opts.bonusKind : null,
      bonusAmount: Math.max(0, Math.floor(Number(opts.bonusAmount) || 0)),
      prizeLabel: opts.prizeLabel || '',
      title: opts.title || '',
    };

    const profile = global.ProfileService?.loadProfile?.();
    const currentCoins = profile?.coins ?? reward.coins;
    const coinsBefore = opts.coinsBefore != null
      ? opts.coinsBefore
      : Math.max(0, currentCoins - reward.coins);
    const xpBefore = opts.xpBefore != null
      ? opts.xpBefore
      : Math.max(0, (profile?.totalXp || 0) - reward.xp);
    const xpAfter = opts.xpAfter != null ? opts.xpAfter : xpBefore + reward.xp;

    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = null;
    }

    const overlay = document.createElement('div');
    overlay.id = 'chest-reward-overlay';
    overlay.className = 'chest-reward-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', reward.title || t('quests.chestTitle'));
    overlay.innerHTML = buildOverlayHtml(reward, assets, tapTotal);

    document.body.appendChild(overlay);
    document.body.classList.add('chest-reward-open');
    activeOverlay = overlay;
    opening = false;
    global.I18n?.applyToDocument?.(overlay);

    overlay._xpBefore = xpBefore;
    overlay._xpAfter = xpAfter;
    setDisplayedCoins(coinsBefore);
    if (reward.xp > 0) global.ProfileUI?.applyBattleCardXp?.(xpBefore);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    global.SoundEffects?.chestAppear?.();

    const chestBtn = overlay.querySelector('#chest-reward-tap');
    let tapsDone = 0;
    let tapBusy = false;
    updateTapHint(overlay, 0, tapTotal);

    const onTap = () => {
      if (opening || tapBusy || overlay.classList.contains('is-opened')
        || overlay.classList.contains('is-spinning')) {
        return;
      }
      tapsDone += 1;
      updateTapHint(overlay, tapsDone, tapTotal);

      if (tapsDone < tapTotal) {
        tapBusy = true;
        const intensity = Math.min(3, tapsDone);
        playTapShake(chestBtn, intensity);
        global.setTimeout(() => { tapBusy = false; }, intensity >= 3 ? 420 : 320);
        return;
      }

      chestBtn?.removeEventListener('click', onTap);
      openChest(
        overlay,
        reward,
        coinsBefore,
        opts.onComplete,
        opts.onOpenStart,
      );
    };
    chestBtn?.addEventListener('click', onTap);

    // Soft idle shake cue while waiting for first taps
    if (!reduceMotion()) {
      const idleShake = global.setInterval(() => {
        if (!activeOverlay || opening || tapBusy || overlay.classList.contains('is-spinning')
          || overlay.classList.contains('is-opened')) {
          global.clearInterval(idleShake);
          return;
        }
        playTapShake(chestBtn, 1);
      }, 2600);
    }

    return overlay;
  }

  preloadImages();

  global.ChestRewardUI = {
    show,
    preloadImages,
    TIER_TAP_COUNTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
