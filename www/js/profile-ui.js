/**
 * Profile UI — XP toast, level-up modal, badge modal, soft confetti.
 */
(function (global) {
  'use strict';

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? '';
  }

  function shouldReduceMotion() {
    return global.UserPreferences?.shouldReduceMotion?.() === true;
  }

  function ensureStyles() {
    if (document.getElementById('profile-ui-styles')) return;
    const link = document.createElement('link');
    link.id = 'profile-ui-styles';
    link.rel = 'stylesheet';
    link.href = 'css/profile.css';
    document.head.appendChild(link);
  }

  function spawnSoftConfetti(container) {
    if (shouldReduceMotion()) return;
    const colors = ['#FFD6E8', '#C8E6FF', '#C8F0E0', '#E8DEFF', '#FFF6C8'];
    const root = container || document.body;
    for (let i = 0; i < 18; i++) {
      const piece = document.createElement('span');
      piece.className = 'xp-confetti-piece';
      piece.style.left = `${20 + Math.random() * 60}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.4}s`;
      root.appendChild(piece);
      setTimeout(() => piece.remove(), 2200);
    }
  }

  function showXpToast(result) {
    ensureStyles();
    const existing = document.getElementById('xp-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'xp-toast';
    toast.className = 'xp-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <span class="xp-toast-amount">+${result.xpEarned} XP</span>
      <span class="xp-toast-label">${t(result.messageKey)}</span>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 2600);
  }

  function showLevelUpModal(result) {
    ensureStyles();
    const existing = document.getElementById('level-up-modal');
    if (existing) existing.remove();

    const title = global.LevelUtils?.getLevelTitle(result.level, t) || '';
    const overlay = document.createElement('div');
    overlay.id = 'level-up-modal';
    overlay.className = 'profile-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="profile-modal-card level-up-card">
        <div class="profile-modal-stars" aria-hidden="true">✨</div>
        <h2 data-i18n="profile.levelUp.title">${t('profile.levelUp.title')}</h2>
        <p class="level-up-line">${t('profile.levelUp.message', { level: result.level, title })}</p>
        <button type="button" class="profile-modal-btn" data-action="close">${t('profile.levelUp.continue')}</button>
      </div>
    `;
    document.body.appendChild(overlay);
    spawnSoftConfetti(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300);
    };
    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  function showBadgeModal(badge) {
    ensureStyles();
    const badgeDef = global.BadgeService?.getBadgeDef(badge.id);
    const icon = badgeDef?.icon || badge.icon || '🏅';
    const overlay = document.createElement('div');
    overlay.className = 'profile-modal-overlay badge-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="profile-modal-card badge-earned-card">
        <span class="badge-earned-icon" aria-hidden="true">${icon}</span>
        <h2 data-i18n="profile.badgeEarned.title">${t('profile.badgeEarned.title')}</h2>
        <p class="badge-earned-name">${t(`profile.badges.${badge.id}.name`)}</p>
        <p class="badge-earned-desc">${t(`profile.badges.${badge.id}.desc`)}</p>
        <button type="button" class="profile-modal-btn" data-action="close">${t('profile.badgeEarned.continue')}</button>
      </div>
    `;
    document.body.appendChild(overlay);
    spawnSoftConfetti(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300);
    };
    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  function renderXpProgressBar({ xpInLevel, xpToNext, level, compact }) {
    const pct = xpToNext > 0 ? Math.min(100, Math.round((xpInLevel / xpToNext) * 100)) : 0;
    const compactClass = compact ? ' xp-bar-compact' : '';
    return `
      <div class="xp-progress-wrap${compactClass}" role="progressbar"
        aria-valuemin="0" aria-valuemax="${xpToNext}" aria-valuenow="${xpInLevel}"
        aria-label="${t('profile.xpProgress', { current: xpInLevel, total: xpToNext })}">
        <div class="xp-progress-track">
          <div class="xp-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="xp-progress-label">${xpInLevel} / ${xpToNext} XP · ${t('profile.levelShort', { level })}</span>
      </div>
    `;
  }

  global.ProfileUI = {
    showXpToast,
    showLevelUpModal,
    showBadgeModal,
    renderXpProgressBar,
    spawnSoftConfetti,
  };
})(typeof window !== 'undefined' ? window : globalThis);
