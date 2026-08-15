/**
 * Home bottom tab bar — fixed viewport nav shared across menu and game screens.
 */
(function (global) {
  'use strict';

  const BAR_ID = 'home-bottom-bar';
  const CHROME_HREF = 'css/app-chrome.css?v=20260815m';
  const HOME_TAB_KEY = 'jamodeul-home-tab';
  const ACTIVE_GAME_KEY = 'jamodeul-active-game';
  /** Learn tab skips its landing screen and opens tutorial step 1. */
  const LEARN_TUTORIAL_HREF = 'match-tutorial.html?start=1';

  let leaveHook = null;

  function ensureChromeStyles() {
    if (typeof document === 'undefined') return;
    let link = document.getElementById('app-chrome-styles');
    if (!link) {
      link = document.createElement('link');
      link.id = 'app-chrome-styles';
      link.rel = 'stylesheet';
      (document.head || document.documentElement).appendChild(link);
    } else if (link.parentNode === document.head) {
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== CHROME_HREF) link.href = CHROME_HREF;
  }

  ensureChromeStyles();

  function px(n) {
    return `${Math.max(0, Math.round(n * 100) / 100)}px`;
  }

  function isAppleTouch() {
    const ua = navigator.userAgent || '';
    return /iPhone|iPod|iPad/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function measureSafeInsets() {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top, 0px)',
      'padding-right:env(safe-area-inset-right, 0px)',
      'padding-bottom:env(safe-area-inset-bottom, 0px)',
      'padding-left:env(safe-area-inset-left, 0px)',
    ].join(';');
    document.documentElement.appendChild(probe);
    const cs = getComputedStyle(probe);
    const insets = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    probe.remove();
    return insets;
  }

  function fallbackSafeInsets() {
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    const landscape = w > h;
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    const pad = short >= 600
      || /iPad/.test(navigator.userAgent || '')
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && short >= 600);

    if (pad) {
      return landscape
        ? { top: 20, right: 0, bottom: 21, left: 0 }
        : { top: 24, right: 0, bottom: 21, left: 0 };
    }

    const seLike = short <= 375 && long <= 667;
    if (seLike) {
      return landscape
        ? { top: 0, right: 0, bottom: 0, left: 0 }
        : { top: 20, right: 0, bottom: 0, left: 0 };
    }

    // Classic notch (X–14 / 12–13 Pro Max): 47px. Dynamic Island (14 Pro+): 59px.
    const classicNotch = long <= 844
      || (short >= 414 && long <= 896)
      || (short >= 428 && long <= 926);
    const island = !classicNotch && short >= 390 && long >= 852;
    if (landscape) {
      const side = island ? 59 : 47;
      return { top: 0, right: side, bottom: 21, left: side };
    }
    return {
      top: island ? 59 : 47,
      right: 0,
      bottom: 34,
      left: 0,
    };
  }

  function applySafeAreaInsets() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    let insets = { top: 0, right: 0, bottom: 0, left: 0 };
    try {
      insets = measureSafeInsets();
    } catch {
      insets = { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const missing = insets.top + insets.right + insets.bottom + insets.left <= 0;
    if (isAppleTouch()) {
      const fb = fallbackSafeInsets();
      /* Status-bar-only values (~20–24px) still clip the notch/island HUD. */
      if (insets.top < 44) insets.top = Math.max(insets.top, fb.top);
      /* Do not invent a 34px home-indicator; that doubles the tab bar
         when the webview is already inset. Keep a small cushion only. */
      if (insets.bottom < 8) insets.bottom = 10;
      if (insets.left < 1 && fb.left) insets.left = fb.left;
      if (insets.right < 1 && fb.right) insets.right = fb.right;
    } else if (missing) {
      insets = { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const root = document.documentElement;
    root.style.setProperty('--safe-top', px(insets.top));
    root.style.setProperty('--safe-right', px(insets.right));
    root.style.setProperty('--safe-bottom', px(insets.bottom));
    root.style.setProperty('--safe-left', px(insets.left));
    pinTopHudSafePad(insets.top);
  }

  function pinTopHudSafePad(topPx) {
    const bar = document.getElementById('app-top-hud');
    if (!bar) return;
    const pad = Math.max(0, Math.round(topPx));
    bar.style.setProperty('padding-top', px(pad), 'important');
    requestAnimationFrame(() => {
      const h = Math.ceil(bar.getBoundingClientRect().height);
      if (h > 0) {
        document.documentElement.style.setProperty('--app-top-hud-offset', px(h));
      }
    });
  }

  function applyDynamicTypeClass() {
    const root = document.documentElement;
    if (!root || root.classList.contains('large-text')) return;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;font:-apple-system-body;';
    document.documentElement.appendChild(probe);
    const size = parseFloat(getComputedStyle(probe).fontSize) || 17;
    probe.remove();
    if (size >= 24) {
      root.classList.add('large-text', 'xxx-large-text');
    } else if (size >= 20) {
      root.classList.add('large-text');
    }
  }

  let chromeTimer = 0;
  function scheduleDeviceChrome() {
    clearTimeout(chromeTimer);
    chromeTimer = setTimeout(() => {
      applySafeAreaInsets();
      applyDynamicTypeClass();
    }, 40);
  }

  function bindDeviceChrome() {
    if (document.documentElement.dataset.deviceChromeBound === '1') return;
    document.documentElement.dataset.deviceChromeBound = '1';
    scheduleDeviceChrome();
    window.addEventListener('resize', scheduleDeviceChrome, { passive: true });
    window.addEventListener('orientationchange', scheduleDeviceChrome, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleDeviceChrome, { passive: true });
  }

  bindDeviceChrome();

  /**
   * Vercel Toolbar / Comments inject a bottom-right control that overlaps the
   * settings gear and opens Vercel's panel instead of settings.html.
   */
  function neutralizeVercelToolbar(root) {
    const scope = root || document;
    const nodes = scope.querySelectorAll?.(
      [
        'script[src*="vercel.live"]',
        'iframe[src*="vercel.live"]',
        'vercel-live-feedback',
        '#vercel-live-feedback',
        '[data-vercel-toolbar]',
        '[id^="vercel-live"]',
        '[class*="vercel-toolbar"]',
      ].join(', ')
    );
    nodes?.forEach((el) => {
      try {
        el.remove();
      } catch {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      }
    });
  }

  function watchVercelToolbar() {
    if (typeof document === 'undefined' || document.documentElement?.dataset?.vercelToolbarNeutralized === '1') {
      return;
    }
    document.documentElement.dataset.vercelToolbarNeutralized = '1';
    neutralizeVercelToolbar(document);

    if (typeof MutationObserver !== 'function') return;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          const hit =
            /vercel\.live/i.test(node.getAttribute?.('src') || '') ||
            /vercel-live|vercel-toolbar/i.test(`${node.id || ''} ${node.className || ''} ${node.tagName || ''}`) ||
            node.querySelector?.(
              'script[src*="vercel.live"], iframe[src*="vercel.live"], vercel-live-feedback, #vercel-live-feedback, [data-vercel-toolbar], [id^="vercel-live"], [class*="vercel-toolbar"]'
            );
          if (hit) {
            neutralizeVercelToolbar(document);
            return;
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function isIndexPage() {
    const path = (global.location.pathname || '').split('/').pop() || 'index.html';
    return path === '' || path === 'index.html';
  }

  function isSettingsPage() {
    return (global.location.pathname || '').includes('settings.html');
  }

  function currentPageHref() {
    const path = global.location.pathname || '';
    const file = path.slice(path.lastIndexOf('/') + 1) || 'index.html';
    return file + (global.location.search || '') + (global.location.hash || '');
  }

  function readStoredHomeTab() {
    try {
      const stored = sessionStorage.getItem(HOME_TAB_KEY);
      if (stored === 'learn' || stored === 'shop' || stored === 'quests') return stored;
      return 'menu';
    } catch {
      return 'menu';
    }
  }

  function storeHomeTab(tab) {
    try {
      sessionStorage.setItem(HOME_TAB_KEY, tab);
    } catch { /* ignore */ }
  }

  function getActiveGame() {
    try {
      const raw = sessionStorage.getItem(ACTIVE_GAME_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (data.type === 'daily') return data;
      if (typeof data.href === 'string' && data.href && !data.href.includes('index.html')) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  function setActiveGame(info) {
    try {
      if (!info) {
        sessionStorage.removeItem(ACTIVE_GAME_KEY);
        return;
      }
      sessionStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(info));
    } catch { /* ignore */ }
  }

  function clearActiveGame() {
    setActiveGame(null);
  }

  function setLeaveHook(fn) {
    leaveHook = typeof fn === 'function' ? fn : null;
  }

  function runLeaveHook() {
    try {
      return leaveHook?.() || null;
    } catch (err) {
      console.warn('[Jamodeul] HomeNav leave hook failed', err);
      return null;
    }
  }

  const NAV_ICONS = {
    menu: 'assets/nav/home.png',
    learn: 'assets/nav/learn.png',
    quests: 'assets/nav/quests.png',
    shop: 'assets/nav/shop.png',
    settings: 'assets/nav/settings.png',
  };

  function renderTabIcon(tab) {
    const src = NAV_ICONS[tab] || NAV_ICONS.menu;
    return `<img class="home-tab-icon-img" src="${src}" alt="" width="48" height="48" decoding="async" draggable="false">`;
  }

  function barMarkup() {
    return `
      <nav class="home-bottom-bar" id="${BAR_ID}" aria-label="Home sections">
        <div class="home-bottom-bar-inner home-bottom-bar-inner--5">
          <button type="button" class="home-tab-btn" data-home-tab="menu" aria-selected="false" data-i18n-aria="nav.tabMenu">
            ${renderTabIcon('menu')}
          </button>
          <button type="button" class="home-tab-btn" data-home-tab="learn" aria-selected="false" data-i18n-aria="nav.tabLearn">
            ${renderTabIcon('learn')}
          </button>
          <button type="button" class="home-tab-btn" data-home-tab="quests" aria-selected="false" data-i18n-aria="nav.tabQuests">
            ${renderTabIcon('quests')}
          </button>
          <button type="button" class="home-tab-btn" data-home-tab="shop" aria-selected="false" data-i18n-aria="nav.tabShop">
            ${renderTabIcon('shop')}
          </button>
          <a class="home-tab-btn home-tab-btn--link" href="settings.html" data-home-tab="settings" data-i18n-aria="nav.settings">
            ${renderTabIcon('settings')}
          </a>
        </div>
      </nav>
    `;
  }

  function detectActiveTab() {
    if (isSettingsPage()) return 'settings';
    const file = (global.location.pathname || '').split('/').pop() || '';
    if (file.includes('match-tutorial')) return 'learn';
    if (file.includes('chest-room') || file.includes('wheel')) return 'shop';
    if (!isIndexPage()) return 'menu';
    return readStoredHomeTab();
  }

  function setActiveTab(tab) {
    const active = tab === 'settings' ? 'settings' : tab;
    document.querySelectorAll('[data-home-tab]').forEach((btn) => {
      const key = btn.dataset.homeTab;
      const isActive = key === active;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function goToIndexTab(tab) {
    storeHomeTab(tab);
    const q = tab && tab !== 'menu' ? `?tab=${encodeURIComponent(tab)}` : '';
    global.location.href = `index.html${q}`;
  }

  function resumeActiveGame() {
    const active = getActiveGame();
    if (!active) return false;
    if (active.type === 'daily') {
      if (global.GameShell?.resume?.()) {
        storeHomeTab('menu');
        setActiveTab('menu');
        return true;
      }
      clearActiveGame();
      return false;
    }
    if (active.href && !isIndexPage()) {
      return false;
    }
    if (active.href) {
      storeHomeTab('menu');
      global.location.href = active.href;
      return true;
    }
    return false;
  }

  function openLearnTutorial() {
    // Don't restore the old Learn landing tab after leaving the tutorial.
    storeHomeTab('menu');
    global.location.href = LEARN_TUTORIAL_HREF;
  }

  function handleTabClick(tab) {
    if (tab === 'settings') return;

    if (tab === 'learn') {
      if (isIndexPage()) {
        global.GameShell?.park?.('learn');
      } else if (!(global.location.pathname || '').includes('match-tutorial')) {
        runLeaveHook();
        setActiveGame({
          href: currentPageHref(),
          type: 'page',
          at: Date.now(),
        });
      }
      openLearnTutorial();
      return;
    }

    if (isIndexPage()) {
      // External game resume (Word Chain / Hangul-dle) takes priority on Home.
      if (tab === 'menu') {
        const active = getActiveGame();
        if (active?.type === 'page' && active.href) {
          storeHomeTab('menu');
          global.location.href = active.href;
          return;
        }
      }
      storeHomeTab(tab);
      global.MenuApp?.setHomeTab?.(tab);
      return;
    }

    // Game / secondary pages: park session then open the menu tab on index.
    runLeaveHook();
    setActiveGame({
      href: currentPageHref(),
      type: 'page',
      at: Date.now(),
    });
    goToIndexTab(tab);
  }

  function bind() {
    const bar = document.getElementById(BAR_ID);
    if (!bar || bar.dataset.bound === '1') return;
    bar.dataset.bound = '1';

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-home-tab]');
      if (!btn) return;

      const tab = btn.dataset.homeTab;
      if (tab === 'settings') {
        runLeaveHook();
        if (!isIndexPage() && !isSettingsPage()) {
          setActiveGame({
            href: currentPageHref(),
            type: 'page',
            at: Date.now(),
          });
        }
        global.AppNav?.saveSettingsReturn?.();
        return;
      }

      e.preventDefault();
      handleTabClick(tab);
    });
  }

  function inject(options = {}) {
    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      const wrap = document.createElement('div');
      wrap.innerHTML = barMarkup().trim();
      bar = wrap.firstElementChild;
      document.body.appendChild(bar);
    }

    document.body.classList.add('has-home-bottom-bar');
    document.documentElement.classList.add('viewport-fit-lock');
    watchVercelToolbar();
    bind();
    setActiveTab(options.activeTab || detectActiveTab());
    global.I18n?.applyToDocument?.(bar);
    global.AppNav?.wireSettingsLinks?.(bar);
    return bar;
  }

  function show(options = {}) {
    const bar = document.getElementById(BAR_ID) || inject(options);
    bar.classList.remove('hidden');
    document.body.classList.add('has-home-bottom-bar');
    document.documentElement.classList.add('viewport-fit-lock');
    if (isIndexPage() && !document.body.classList.contains('game-active')) {
      document.body.classList.add('home-menu-active');
    }
    setActiveTab(options.activeTab || detectActiveTab());
  }

  /**
   * Bottom nav stays pinned globally. Overlays cover it via z-index instead of hiding.
   * Only honors an explicit page opt-out via data-no-home-nav="1".
   */
  function hide() {
    if (document.body?.dataset?.noHomeNav !== '1') return;
    const bar = document.getElementById(BAR_ID);
    if (bar) bar.classList.add('hidden');
    document.body.classList.remove('home-menu-active');
  }

  /** Attach bottom nav on a game page and remember how to return. */
  function mountGamePage(options = {}) {
    const href = options.href || currentPageHref();
    setActiveGame({
      href,
      type: options.type || 'page',
      at: Date.now(),
    });
    if (typeof options.onLeave === 'function') {
      setLeaveHook(options.onLeave);
    }
    show({ activeTab: 'menu' });
    document.body.classList.add('has-home-bottom-bar', 'home-nav-game');
    document.body.classList.remove('home-menu-active');
  }

  function shouldAutoMount() {
    if (!document.body) return false;
    if (document.body.dataset.noHomeNav === '1') return false;
    if ((global.location.pathname || '').includes('/admin/')) return false;
    return true;
  }

  function autoMount() {
    watchVercelToolbar();
    if (!shouldAutoMount()) return;
    show();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }

  global.HomeNav = {
    inject,
    bind,
    show,
    hide,
    setActiveTab,
    readStoredHomeTab,
    getActiveGame,
    setActiveGame,
    clearActiveGame,
    setLeaveHook,
    mountGamePage,
    resumeActiveGame,
    syncHudSafePad() {
      const top = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--safe-top')
      ) || 0;
      pinTopHudSafePad(top);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
