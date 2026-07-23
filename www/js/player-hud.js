/**
 * Compact level / XP / coin display for menu and profile areas.
 */
(function (global) {
  'use strict';

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

  function render(container, { compact } = {}) {
    if (!container) return;
    const summary = global.ProfileService?.getProfileSummary?.();
    if (!summary) {
      container.innerHTML = '';
      container.hidden = true;
      return;
    }

    const pct = summary.xpToNext > 0
      ? Math.min(100, Math.round((summary.xpInLevel / summary.xpToNext) * 100))
      : 0;

    if (compact) {
      container.hidden = false;
      container.innerHTML = `
        <a class="menu-hud-coins player-hud-compact" href="index.html?tab=shop"
          role="group" aria-label="${escapeHtml(t('shop.hudLabel'))}">
          <span class="menu-hud-coins-value" aria-label="${escapeHtml(t('shop.coins'))}">${summary.coins}</span>
          <span class="menu-hud-coins-coin" aria-hidden="true">🪙</span>
          <span class="menu-hud-coins-plus" aria-hidden="true">+</span>
        </a>
      `;
      return;
    }

    container.hidden = false;
    container.innerHTML = `
      <div class="player-hud-full">
        <div class="player-hud-row">
          <span class="player-hud-level-badge">${escapeHtml(t('profile.levelShort', { level: summary.level }))}</span>
          <span class="player-hud-coins player-hud-coins--lg">🪙 ${summary.coins}</span>
        </div>
        ${global.ProfileUI?.renderXpProgressBar?.({
          xpInLevel: summary.xpInLevel,
          xpToNext: summary.xpToNext,
          level: summary.level,
          compact: true,
        }) || ''}
      </div>
    `;
  }

  function refreshMenuProfileNav() {
    const nav = document.getElementById('nav-profile');
    const card = document.getElementById('menu-profile-card');
    if (!nav) return;
    const summary = global.ProfileService?.getProfileSummary?.();
    if (!summary) return;

    global.ProfileUI?.ensureStyles?.();
    if (card && global.ProfileUI?.renderMenuProfileCard) {
      card.innerHTML = global.ProfileUI.renderMenuProfileCard(summary, { variant: 'menu' });
    } else {
      const slot = document.getElementById('menu-profile-avatar');
      const levelEl = document.getElementById('menu-profile-level');
      if (slot) slot.textContent = summary.avatarIcon || '🌸';
      if (levelEl) levelEl.textContent = String(summary.level || 1);
    }

    nav.setAttribute('aria-label', `${summary.displayName || t('nav.profile')} · ${summary.displayTitle || t('profile.levelShort', { level: summary.level })}`);
  }

  function refresh() {
    document.querySelectorAll('[data-player-hud]').forEach((el) => {
      render(el, { compact: el.dataset.playerHud === 'compact' });
    });
    refreshMenuProfileNav();
  }

  function mount(containerId, opts) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return;
    if (opts?.compact) el.dataset.playerHud = 'compact';
    render(el, opts);
    refreshMenuProfileNav();
  }

  global.PlayerHud = {
    render,
    refresh,
    refreshMenuProfileNav,
    mount,
  };
})(typeof window !== 'undefined' ? window : globalThis);
