/**
 * Quest chest rewards — tap-to-open overlay with coin fly to HUD.
 */
(function (global) {
  'use strict';

  const STYLES_HREF = 'css/chest-reward.css?v=3';
  const CHEST_CLOSED = 'assets/chests/chest-closed.png';
  const CHEST_OPEN = 'assets/chests/chest-open.png';
  const COIN_SRC = 'assets/coin.png';

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

  function buildOverlayHtml(reward, { autoOpen = false } = {}) {
    const coinIcon = global.CoinIcon?.html?.('coin-icon coin-icon--lg') || '🪙';
    const hint = autoOpen ? t('quests.chestOpening') : t('quests.chestTap');
    return `
      <div class="chest-reward-stage">
        <h2 class="chest-reward-title">${escapeHtml(t('quests.chestTitle'))}</h2>
        <p class="chest-reward-hint">${escapeHtml(hint)}</p>
        <button type="button" class="chest-reward-chest-wrap no-press is-idle" id="chest-reward-tap"
          aria-label="${escapeHtml(hint)}">
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

      // Trail near burst peak
      spawnTrail(mid1.x, mid1.y, delay + duration * 0.12);

      anim.finished
        .then(() => {
          el.remove();
          resolve();
        })
        .catch(() => {
          el.remove();
          resolve();
        });
    });
  }

  async function playCoinFlight(overlay, reward, coinsBefore) {
    const chestBtn = overlay.querySelector('#chest-reward-tap');
    const from = getElCenter(chestBtn) || {
      x: global.innerWidth / 2,
      y: global.innerHeight / 2,
    };
    // Spawn from upper-center of chest (mouth)
    from.y -= 18;

    const hud = getHudCoinEl();
    const to = getElCenter(hud?.querySelector?.('.menu-hud-coins-coin') || hud) || {
      x: global.innerWidth - 36,
      y: 36,
    };

    const count = coinCountForAmount(reward.coins);
    const totalCoins = Math.max(0, Math.floor(Number(reward.coins) || 0));
    let landed = 0;

    // Hold HUD at pre-claim value until coins arrive
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
        const shown = coinsBefore + Math.round(totalCoins * progress);
        setDisplayedCoins(shown);
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

  async function openChest(overlay, reward, coinsBefore, onComplete) {
    if (opening || overlay.classList.contains('is-opened')) return;
    opening = true;

    const chestBtn = overlay.querySelector('#chest-reward-tap');
    chestBtn?.classList.remove('is-idle');
    chestBtn?.classList.add('is-shake');
    global.SoundEffects?.chestShake?.();

    await wait(reduceMotion() ? 80 : 520);

    overlay.classList.add('is-opened');
    chestBtn?.classList.remove('is-shake');
    chestBtn?.classList.add('is-burst');
    chestBtn?.setAttribute('aria-label', t('quests.chestOpened'));
    global.SoundEffects?.chestOpen?.();

    await wait(reduceMotion() ? 60 : 180);

    const amounts = overlay.querySelector('#chest-reward-amounts');
    amounts?.classList.add('is-visible');

    await playCoinFlight(overlay, reward, coinsBefore);

    const continueBtn = overlay.querySelector('#chest-reward-continue');
    continueBtn?.classList.add('is-visible');
    continueBtn?.focus?.();

    // Auto-dismiss if user doesn't tap
    const autoClose = global.setTimeout(() => {
      closeOverlay(overlay, onComplete);
    }, 4200);

    continueBtn?.addEventListener('click', () => {
      global.clearTimeout(autoClose);
      global.SoundEffects?.tap?.();
      closeOverlay(overlay, onComplete);
    }, { once: true });
  }

  /**
   * @param {{ coins: number, xp?: number, coinsBefore?: number, autoOpen?: boolean, onComplete?: Function }} opts
   */
  function show(opts = {}) {
    ensureStyles();
    preloadImages();

    const reward = {
      coins: Math.max(0, Math.floor(Number(opts.coins) || 0)),
      xp: Math.max(0, Math.floor(Number(opts.xp) || 0)),
    };
    const autoOpen = opts.autoOpen === true;

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
    overlay.innerHTML = buildOverlayHtml(reward, { autoOpen });

    document.body.appendChild(overlay);
    document.body.classList.add('chest-reward-open');
    activeOverlay = overlay;
    opening = false;
    global.I18n?.applyToDocument?.(overlay);

    // Show pre-claim balance while chest is closed
    setDisplayedCoins(coinsBefore);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    global.SoundEffects?.chestAppear?.();

    const chestBtn = overlay.querySelector('#chest-reward-tap');
    const onOpen = () => openChest(overlay, reward, coinsBefore, opts.onComplete);

    if (autoOpen) {
      chestBtn?.setAttribute('tabindex', '-1');
      global.setTimeout(onOpen, reduceMotion() ? 180 : 650);
    } else {
      chestBtn?.addEventListener('click', onOpen, { once: true });

      // Soft idle shake cue (manual tap mode only)
      if (!reduceMotion()) {
        const idleShake = global.setInterval(() => {
          if (!activeOverlay || overlay.classList.contains('is-opened') || opening) {
            global.clearInterval(idleShake);
            return;
          }
          chestBtn?.classList.remove('is-idle');
          void chestBtn?.offsetWidth;
          chestBtn?.classList.add('is-shake');
          global.SoundEffects?.chestShake?.(true);
          global.setTimeout(() => {
            chestBtn?.classList.remove('is-shake');
            if (!overlay.classList.contains('is-opened')) {
              chestBtn?.classList.add('is-idle');
            }
          }, 560);
        }, 2400);
      }
    }

    return overlay;
  }

  preloadImages();

  global.ChestRewardUI = {
    show,
    preloadImages,
  };
})(typeof window !== 'undefined' ? window : globalThis);
