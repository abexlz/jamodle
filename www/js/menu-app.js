/**
 * Home menu bootstrap — renders config-driven cards and wires Wordle mode actions.
 */
(function (global) {
  'use strict';

  const DEV = '[Jamodeul]';
  const HOME_TAB_KEY = 'jamodeul-home-tab';
  let activeHomeTab = 'menu';

  function readStoredHomeTab() {
    try {
      const stored = sessionStorage.getItem(HOME_TAB_KEY);
      if (stored === 'learn' || stored === 'shop' || stored === 'quests') return stored;
      return 'menu';
    } catch {
      return 'menu';
    }
  }

  function getHomeTab() {
    return activeHomeTab;
  }

  function updateTabBarUI() {
    if (global.HomeNav?.setActiveTab) {
      global.HomeNav.setActiveTab(activeHomeTab);
      return;
    }
    document.querySelectorAll('[data-home-tab]').forEach((btn) => {
      const isActive = btn.dataset.homeTab === activeHomeTab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function bindHomeTabBar() {
    if (global.HomeNav?.bind) {
      global.HomeNav.bind();
      return;
    }
    const bar = document.getElementById('home-bottom-bar');
    if (!bar || bar.dataset.bound === '1') return;
    bar.dataset.bound = '1';
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-home-tab]');
      if (!btn || btn.dataset.homeTab === 'settings') return;
      setHomeTab(btn.dataset.homeTab);
    });
  }

  function bindMenuSounds() {
    const root = document.getElementById('menu-root');
    if (!root || root.dataset.soundsBound === '1') return;
    root.dataset.soundsBound = '1';
    root.addEventListener('click', (e) => {
      const card = e.target.closest(
        'a.learning-mode-card, a.daily-challenge-card, a.featured-continue-cta, '
        + 'a.menu-tutorial-btn, a.menu-top-classic, button.learning-mode-card, '
        + 'button.word-game-card, button.menu-battle-game-btn, a.menu-single-player-game-btn, button.battle-mode-action-btn'
      );
      if (!card || card.disabled || card.classList.contains('is-locked')) return;
      global.SoundEffects?.nav?.();
    });
    const profileNav = document.querySelector('.menu-profile-nav');
    profileNav?.addEventListener('click', () => global.SoundEffects?.nav?.());
  }

  function normalizeHomeTab(tab) {
    if (tab === 'learn' || tab === 'shop' || tab === 'quests') return tab;
    return 'menu';
  }

  function updateMenuScreenTabClass(tab) {
    const screen = document.getElementById('menu-screen');
    if (!screen) return;
    screen.classList.toggle('is-quests-tab', tab === 'quests');
  }

  function updateHomeTabBodyClass(tab) {
    const next = normalizeHomeTab(tab);
    document.body.classList.remove('home-tab-menu', 'home-tab-learn', 'home-tab-quests', 'home-tab-shop');
    document.body.classList.add(`home-tab-${next}`);
  }

  function setHomeTab(tab) {
    const next = normalizeHomeTab(tab);
    if (next === activeHomeTab) return;
    global.SoundEffects?.nav?.();
    activeHomeTab = next;
    try {
      sessionStorage.setItem(HOME_TAB_KEY, next);
    } catch { /* ignore */ }
    const root = document.getElementById('menu-root');
    if (root && global.MenuComponents?.renderMenu) {
      root.innerHTML = global.MenuComponents.renderMenu(next);
      global.I18n?.applyToDocument?.(root);
      global.ShopUI?.bindSection?.(root);
      global.QuestUI?.bindSection?.(root);
    }
    updateMenuScreenTabClass(next);
    updateHomeTabBodyClass(next);
    updateTabBarUI();
    global.MultiplayerUI?.mount?.();
  }

  function mountMenu(rootId, tab) {
    const root = document.getElementById(rootId);
    if (!root) {
      console.warn(`${DEV} mountMenu: #${rootId} not found`);
      return;
    }
    if (!global.MenuComponents?.renderMenu) {
      console.error(`${DEV} MenuComponents unavailable — menu not rendered`);
      return;
    }
    activeHomeTab = tab || readStoredHomeTab();
    root.innerHTML = global.MenuComponents.renderMenu(activeHomeTab);
    global.I18n?.applyToDocument?.(root);
    global.ShopUI?.bindSection?.(root);
    global.QuestUI?.bindSection?.(root);
    bindHomeTabBar();
    bindMenuSounds();
    updateMenuScreenTabClass(activeHomeTab);
    updateHomeTabBodyClass(activeHomeTab);
    updateTabBarUI();
    global.MultiplayerUI?.mount?.();
    global.QuestUI?.updateTabBadge?.();
  }

  function refreshMenu() {
    if (global.MenuComponents?.rerenderMenu) {
      global.MenuComponents.rerenderMenu();
    } else if (global.MenuComponents?.refreshStatus) {
      global.MenuComponents.refreshStatus();
    }
    updateTabBarUI();
  }

  /**
   * Bind click handlers for in-page Wordle modes (once per menu root).
   */
  function bindMenuActions(handlers) {
    const root = document.getElementById('menu-root');
    if (!root) {
      console.warn(`${DEV} bindMenuActions: #menu-root not found`);
      return;
    }
    if (root.dataset.actionsBound === '1') return;
    root.dataset.actionsBound = '1';

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-menu-action]');
      if (!el) return;

      const action = el.dataset.menuAction;
      if (action === 'daily-wordle') {
        e.preventDefault();
        handlers.startDailyWordle?.();
      } else if (action === 'daily-match') {
        e.preventDefault();
        handlers.openDailyMatchCalendar?.();
      }
    });
  }

  global.MenuApp = {
    mountMenu,
    refreshMenu,
    bindMenuActions,
    setHomeTab,
    getHomeTab,
  };
})(typeof window !== 'undefined' ? window : globalThis);
