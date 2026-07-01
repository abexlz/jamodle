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
    document.querySelectorAll('[data-home-tab]').forEach((btn) => {
      const isActive = btn.dataset.homeTab === activeHomeTab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function bindHomeTabBar() {
    const bar = document.getElementById('home-bottom-bar');
    if (!bar || bar.dataset.bound === '1') return;
    bar.dataset.bound = '1';
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-home-tab]');
      if (!btn) return;
      setHomeTab(btn.dataset.homeTab);
    });
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

  function setHomeTab(tab) {
    const next = normalizeHomeTab(tab);
    if (next === activeHomeTab) return;
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
    updateMenuScreenTabClass(activeHomeTab);
    updateTabBarUI();
    global.MultiplayerUI?.mount?.();
    global.QuestUI?.updateTabBadge?.();
    global.TutorialOnboardingUI?.mount?.();
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
      } else if (action === 'wordle-practice') {
        e.preventDefault();
        handlers.openLengthPicker?.('practice');
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
