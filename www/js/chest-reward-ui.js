/**
 * Quest chest rewards — tap to open, CS-style prize reel, coin fly to HUD.
 */
(function (global) {
  'use strict';

  const STYLES_HREF = 'css/chest-reward.css?v=5';
  const CHEST_CLOSED = 'assets/chests/chest-closed.png';
  const CHEST_OPEN = 'assets/chests/chest-open.png';
  const COIN_SRC = 'assets/coin.png';

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
  ];

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
    [CHEST_CLOSED, CHEST_OPEN, COIN_SRC].forEach((src) => {
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
    const items = [];
    for (let i = 0; i < REEL_COUNT; i++) {
      if (i === WINNER_INDEX) {
        items.push({
          kind: 'coins',
          amount: coins,
          tier: winnerTier(coins),
          xp: Math.max(0, Math.floor(Number(reward.xp) || 0)),
          winner: true,
        });
      } else {
        items.push({ ...pickFiller(coins), winner: false });
      }
    }
    return items;
  }

  function cardIconHtml(item) {
    if (item.kind === 'coins') {
      return global.CoinIcon?.html?.('coin-icon coin-icon--md') || '🪙';
    }
    if (item.kind === 'xp') return '<span class="chest-reel-emoji" aria-hidden="true">⭐</span>';
    if (item.kind === 'hint') return '<span class="chest-reel-emoji" aria-hidden="true">💡</span>';
    if (item.kind === 'heart') return '<span class="chest-reel-emoji" aria-hidden="true">❤️</span>';
    return global.CoinIcon?.html?.('coin-icon coin-icon--md') || '🪙';
  }

  function cardLabel(item) {
    if (item.kind === 'xp') return `+${item.amount}`;
    if (item.kind === 'hint' || item.kind === 'heart') return `×${item.amount}`;
    return String(item.amount);
  }

  function cardSub(item) {
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

  function buildOverlayHtml(reward) {
    const coinIcon = global.CoinIcon?.html?.('coin-icon coin-icon--lg') || '🪙';
    const items = buildReelItems(reward);
    return `
      <div class="chest-reward-stage">
        <h2 class="chest-reward-title">${escapeHtml(t('quests.chestTitle'))}</h2>
        <p class="chest-reward-hint" id="chest-reward-hint">${escapeHtml(t('quests.chestTap'))}</p>

        <button type="button" class="chest-reward-chest-wrap no-press is-idle" id="chest-reward-tap"
          aria-label="${escapeHtml(t('quests.chestTap'))}">
          <span class="chest-reward-glow" aria-hidden="true"></span>
          <img class="chest-reward-img chest-reward-img--closed" src="${CHEST_CLOSED}" alt="" draggable="false">
          <img class="chest-reward-img chest-reward-img--open" src="${CHEST_OPEN}" alt="" draggable="false">
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
          <div class="chest-reward-coins">
            <span aria-hidden="true">${coinIcon}</span>
            <span>+${escapeHtml(String(reward.coins || 0))}</span>
          </div>
          <div class="chest-reward-xp">+${escapeHtml(String(reward.xp || 0))} XP</div>
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
      || document.getElementById('player-hud')
    );
  }

  function getHudCoinValueEl(hud) {
    return hud?.querySelector?.('.menu-hud-coins-value') || null;
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
    const totalCoins = Math.max(0, Math.floor(Number(reward.coins) || 0));
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
    global.PlayerHud?.refresh?.();
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

    chestBtn?.classList.remove('is-idle');
    chestBtn?.classList.add('is-shake');
    global.SoundEffects?.chestShake?.();

    await wait(reduceMotion() ? 60 : 480);

    chestBtn?.classList.remove('is-shake');
    chestBtn?.classList.add('is-burst');
    overlay.classList.add('is-chest-open');
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
   * @param {{ coins: number, xp?: number, coinsBefore?: number, autoOpen?: boolean, onOpenStart?: Function, onComplete?: Function }} opts
   */
  function show(opts = {}) {
    ensureStyles();
    preloadImages();

    const reward = {
      coins: Math.max(0, Math.floor(Number(opts.coins) || 0)),
      xp: Math.max(0, Math.floor(Number(opts.xp) || 0)),
    };

    const profile = global.ProfileService?.loadProfile?.();
    const currentCoins = profile?.coins ?? reward.coins;
    const coinsBefore = opts.coinsBefore != null
      ? opts.coinsBefore
      : Math.max(0, currentCoins - reward.coins);

    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = null;
    }

    const overlay = document.createElement('div');
    overlay.id = 'chest-reward-overlay';
    overlay.className = 'chest-reward-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t('quests.chestTitle'));
    overlay.innerHTML = buildOverlayHtml(reward);

    document.body.appendChild(overlay);
    document.body.classList.add('chest-reward-open');
    activeOverlay = overlay;
    opening = false;
    global.I18n?.applyToDocument?.(overlay);

    setDisplayedCoins(coinsBefore);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    global.SoundEffects?.chestAppear?.();

    const chestBtn = overlay.querySelector('#chest-reward-tap');
    const onOpen = () => openChest(
      overlay,
      reward,
      coinsBefore,
      opts.onComplete,
      opts.onOpenStart,
    );
    chestBtn?.addEventListener('click', onOpen, { once: true });

    // Soft idle shake cue while waiting for tap
    if (!reduceMotion()) {
      const idleShake = global.setInterval(() => {
        if (!activeOverlay || opening || overlay.classList.contains('is-spinning')
          || overlay.classList.contains('is-opened')) {
          global.clearInterval(idleShake);
          return;
        }
        chestBtn?.classList.remove('is-idle');
        void chestBtn?.offsetWidth;
        chestBtn?.classList.add('is-shake');
        global.SoundEffects?.chestShake?.(true);
        global.setTimeout(() => {
          chestBtn?.classList.remove('is-shake');
          if (!opening && !overlay.classList.contains('is-opened')) {
            chestBtn?.classList.add('is-idle');
          }
        }, 560);
      }, 2400);
    }

    return overlay;
  }

  preloadImages();

  global.ChestRewardUI = {
    show,
    preloadImages,
  };
})(typeof window !== 'undefined' ? window : globalThis);
