/**
 * Home bottom tab bar — fixed viewport nav shared across menu screens.
 */
(function (global) {
  'use strict';

  const BAR_ID = 'home-bottom-bar';
  const HOME_TAB_KEY = 'jamodeul-home-tab';

  function isIndexPage() {
    const path = (global.location.pathname || '').split('/').pop() || 'index.html';
    return path === '' || path === 'index.html';
  }

  function isSettingsPage() {
    return (global.location.pathname || '').includes('settings.html');
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

  function barMarkup() {
    return `
      <nav class="home-bottom-bar" id="${BAR_ID}" aria-label="Home sections">
        <div class="home-bottom-bar-inner home-bottom-bar-inner--5">
          <button type="button" class="home-tab-btn" data-home-tab="menu" aria-selected="false">
            <span class="home-tab-icon" aria-hidden="true">🏠</span>
            <span data-i18n="nav.tabMenu">Menu</span>
          </button>
          <button type="button" class="home-tab-btn" data-home-tab="learn" aria-selected="false">
            <span class="home-tab-icon" aria-hidden="true">📚</span>
            <span data-i18n="nav.tabLearn">Learn</span>
          </button>
          <button type="button" class="home-tab-btn" data-home-tab="quests" aria-selected="false">
            <span class="home-tab-icon" aria-hidden="true">🎯</span>
            <span data-i18n="nav.tabQuests">Quests</span>
          </button>
          <button type="button" class="home-tab-btn" data-home-tab="shop" aria-selected="false">
            <span class="home-tab-icon" aria-hidden="true">🛒</span>
            <span data-i18n="nav.tabShop">Shop</span>
          </button>
          <a class="home-tab-btn home-tab-btn--link" href="settings.html" data-home-tab="settings" data-i18n-aria="nav.settings">
            <span class="home-tab-icon" aria-hidden="true">⚙️</span>
            <span data-i18n="nav.settings">Settings</span>
          </a>
        </div>
      </nav>
    `;
  }

  function detectActiveTab() {
    if (isSettingsPage()) return 'settings';
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

  function bind() {
    const bar = document.getElementById(BAR_ID);
    if (!bar || bar.dataset.bound === '1') return;
    bar.dataset.bound = '1';

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-home-tab]');
      if (!btn) return;

      const tab = btn.dataset.homeTab;
      if (tab === 'settings') return;

      e.preventDefault();
      storeHomeTab(tab);

      if (isIndexPage()) {
        global.MenuApp?.setHomeTab?.(tab);
        return;
      }

      const href = btn.getAttribute('href');
      if (href && href !== global.location.pathname) {
        global.location.href = href;
        return;
      }
      global.location.href = 'index.html';
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
    bind();
    setActiveTab(options.activeTab || detectActiveTab());
    global.I18n?.applyToDocument?.(bar);
    return bar;
  }

  function show() {
    const bar = document.getElementById(BAR_ID) || inject();
    bar.classList.remove('hidden');
    document.body.classList.add('has-home-bottom-bar');
    if (isIndexPage()) {
      document.body.classList.add('home-menu-active');
    }
    setActiveTab(detectActiveTab());
  }

  function hide() {
    const bar = document.getElementById(BAR_ID);
    if (bar) bar.classList.add('hidden');
    document.body.classList.remove('home-menu-active');
  }

  global.HomeNav = {
    inject,
    bind,
    show,
    hide,
    setActiveTab,
    readStoredHomeTab,
  };
})(typeof window !== 'undefined' ? window : globalThis);
