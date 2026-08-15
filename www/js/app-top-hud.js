/**
 * Persistent top HUD (chest, calendar, profile, gift, coins).
 * Lives on document.body so it stays visible when the home menu hides
 * and on every game / secondary page that loads this script.
 */
(function (global) {
  'use strict';

  const HUD_ID = 'app-top-hud';
  const STYLE_HREF = 'css/menu-hud.css?v=20260815d';
  const CHROME_HREF = 'css/app-chrome.css?v=20260815d';
  const PROFILE_STYLE_HREF = 'css/profile.css';

  const DEPS = [
    ['BadgeService', 'js/badge-service.js'],
    ['ProfileUI', 'js/profile-ui.js'],
    ['PlayerHud', 'js/player-hud.js?v=20260815a'],
    ['DailyGiftService', 'js/daily-gift-service.js'],
    ['DailyGiftUI', 'js/daily-gift-ui.js?v=20260803a'],
    ['DailyCalendarService', 'js/daily-calendar-service.js'],
    ['DailyCalendarModal', 'js/daily-calendar-modal.js?v=20260814v'],
    ['ChestRoomService', 'js/chest-room-service.js?v=20260803c'],
    ['ChestRoomUI', 'js/chest-room-ui.js?v=20260803b'],
  ];

  function bind(bar) {
    if (bar.dataset.appHudBound === '1') return;
    bar.dataset.appHudBound = '1';

    const calBtn = bar.querySelector('#menu-calendar-nav');
    if (calBtn) {
      const next = calBtn.cloneNode(true);
      calBtn.replaceWith(next);
      next.dataset.bound = '1';
    }
    const giftBtn = bar.querySelector('#menu-daily-gift-nav');
    if (giftBtn) {
      const next = giftBtn.cloneNode(true);
      giftBtn.replaceWith(next);
      next.dataset.bound = '1';
    }

    bar.addEventListener('click', (e) => {
      const cal = e.target.closest('#menu-calendar-nav');
      if (cal) {
        if (global.DailyCalendarModal?.open) global.DailyCalendarModal.open();
        else global.location.href = 'match.html?daily=1';
        return;
      }
      const gift = e.target.closest('#menu-daily-gift-nav');
      if (gift) {
        global.DailyGiftUI?.showPicker?.();
        return;
      }
      const shopLink = e.target.closest('.menu-hud-coins');
      if (shopLink && !isIndexPage()) {
        e.preventDefault();
        global.HomeNav?.setActiveGame?.({
          href: currentPageHref(),
          type: 'page',
          at: Date.now(),
        });
        global.location.href = 'index.html?tab=shop';
      }
    });
  }

  function ensureLink(id, href) {
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (id === 'app-chrome-styles') document.head.appendChild(link);
    if (link.getAttribute('href') !== href) link.href = href;
  }

  function ensureStyles() {
    ensureLink('app-top-hud-styles', STYLE_HREF);
    ensureLink('app-chrome-styles', CHROME_HREF);
    if (!document.querySelector('link[href*="profile.css"]')) {
      ensureLink('app-top-hud-profile-styles', PROFILE_STYLE_HREF);
    }
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const path = src.split('?')[0];
      if (document.querySelector(`script[src*="${path}"]`)) {
        resolve();
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => resolve();
      document.head.appendChild(el);
    });
  }

  async function ensureDeps() {
    for (const [name, src] of DEPS) {
      if (global[name]) continue;
      await loadScript(src);
    }
  }

  function markup() {
    return `
      <div class="menu-top-bar menu-hud-bar" id="${HUD_ID}">
        <div class="menu-top-bar-left menu-hud-left">
          <a class="menu-hud-spin menu-wheel-nav" href="chest-room.html" id="menu-wheel-nav" data-i18n-aria="chestRoom.pageNav">
            <img class="menu-hud-spin-chest" src="assets/chests/mega-closed.png" alt="" width="42" height="42" decoding="async" draggable="false">
            <span class="menu-hud-spin-label" data-i18n="wheel.spinShort">BOX</span>
          </a>
          <button type="button" class="menu-calendar-nav menu-hud-calendar" id="menu-calendar-nav" data-i18n-aria="dailyCalendar.pageNav">
            <span class="menu-calendar-nav-sheet" aria-hidden="true">
              <span class="menu-calendar-nav-month" id="menu-calendar-nav-month"></span>
              <span class="menu-calendar-nav-day" id="menu-calendar-nav-day"></span>
            </span>
          </button>
        </div>
        <a class="menu-profile-nav menu-hud-profile" href="profile.html" id="nav-profile" data-i18n-aria="nav.profile">
          <span class="menu-profile-card" id="menu-profile-card"></span>
        </a>
        <div class="menu-hud-right">
          <button type="button" class="menu-daily-gift-nav menu-hud-gift" id="menu-daily-gift-nav" data-i18n-aria="dailyGift.pageNav">
            <span class="menu-hud-gift-box" aria-hidden="true">🎁</span>
            <span class="menu-hud-gift-dot hidden" id="menu-daily-gift-dot" aria-hidden="true"></span>
          </button>
          <div class="player-hud-slot menu-hud-coins-slot" id="player-hud" data-player-hud="compact"></div>
        </div>
      </div>
    `;
  }

  function isIndexPage() {
    const path = (global.location.pathname || '').split('/').pop() || 'index.html';
    return path === '' || path === 'index.html';
  }

  function currentPageHref() {
    const path = global.location.pathname || '';
    const file = path.slice(path.lastIndexOf('/') + 1) || 'index.html';
    return file + (global.location.search || '') + (global.location.hash || '');
  }

  function refresh() {
    global.PlayerHud?.refresh?.();
    global.DailyCalendarModal?.updateMenuCalendarNav?.();
    global.DailyGiftUI?.updateMenuDailyGiftNav?.();
    global.ChestRoomUI?.updateMenuWheelNav?.();
    const bar = document.getElementById(HUD_ID);
    if (bar) global.I18n?.applyToDocument?.(bar);
  }

  function inject() {
    ensureStyles();
    let bar = document.getElementById(HUD_ID)
      || document.querySelector('.menu-top-bar.menu-hud-bar');

    if (bar) {
      bar.id = HUD_ID;
      if (bar.parentElement !== document.body) {
        document.body.appendChild(bar);
      }
    } else {
      const wrap = document.createElement('div');
      wrap.innerHTML = markup().trim();
      bar = wrap.firstElementChild;
      document.body.appendChild(bar);
    }

    document.body.classList.add('has-app-top-hud');
    bind(bar);
    refresh();
    return bar;
  }

  async function mount() {
    if (document.body?.dataset?.noAppTopHud === '1') return null;
    if ((global.location.pathname || '').includes('/admin/')) return null;
    ensureStyles();
    await ensureDeps();
    return inject();
  }

  function autoMount() {
    // Paint the bar immediately so the home screen is never HUD-less while
    // optional calendar/gift scripts finish loading.
    try { ensureStyles(); } catch (err) {}
    try { inject(); } catch (err) { console.warn('[Jamodeul] AppTopHud inject', err); }
    mount().catch((err) => console.warn('[Jamodeul] AppTopHud failed', err));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }

  global.addEventListener?.('jamodeul-cloud-sync', () => refresh());

  global.AppTopHud = {
    mount,
    inject,
    refresh,
    HUD_ID,
  };
})(typeof window !== 'undefined' ? window : globalThis);
