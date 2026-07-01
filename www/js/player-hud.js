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
        <div class="player-hud-compact" role="group" aria-label="${escapeHtml(t('shop.hudLabel'))}">
          <span class="player-hud-level">${escapeHtml(t('profile.levelShort', { level: summary.level }))}</span>
          <div class="player-hud-xp" role="progressbar"
            aria-valuemin="0" aria-valuemax="${summary.xpToNext}" aria-valuenow="${summary.xpInLevel}"
            aria-label="${escapeHtml(t('profile.xpProgress', { current: summary.xpInLevel, total: summary.xpToNext }))}">
            <div class="player-hud-xp-fill" style="width:${pct}%"></div>
          </div>
          <span class="player-hud-coins" aria-label="${escapeHtml(t('shop.coins'))}">🪙 ${summary.coins}</span>
        </div>
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

  function refresh() {
    document.querySelectorAll('[data-player-hud]').forEach((el) => {
      render(el, { compact: el.dataset.playerHud === 'compact' });
    });
  }

  function mount(containerId, opts) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return;
    if (opts?.compact) el.dataset.playerHud = 'compact';
    render(el, opts);
  }

  global.PlayerHud = {
    render,
    refresh,
    mount,
  };
})(typeof window !== 'undefined' ? window : globalThis);
