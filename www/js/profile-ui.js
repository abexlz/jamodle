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

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function animateBarFill(el, pct, durationMs = 750) {
    if (!el) return Promise.resolve();
    const target = Math.max(0, Math.min(100, pct));
    if (shouldReduceMotion() || durationMs <= 0) {
      el.style.transition = 'none';
      el.style.width = `${target}%`;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        el.removeEventListener('transitionend', done);
        resolve();
      };
      el.addEventListener('transitionend', done, { once: true });
      el.style.transition = `width ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      requestAnimationFrame(() => { el.style.width = `${target}%`; });
      setTimeout(done, durationMs + 60);
    });
  }

  /** Non-blocking post-match XP bar + optional center-screen level odometer. */
  async function showMatchXpCelebration(result) {
    ensureStyles();
    document.getElementById('match-xp-celebration')?.remove();

    const prevTotalXp = Math.max(0, (result.totalXp || 0) - (result.xpEarned || 0));
    const prevInfo = global.LevelUtils?.getLevelFromTotalXp(prevTotalXp)
      || { level: 1, xpInLevel: 0, xpToNext: 100 };
    const nextInfo = result.levelInfo
      || global.LevelUtils?.getLevelFromTotalXp(result.totalXp)
      || prevInfo;
    const showLevelUp = global.XpService?.shouldShowLevelUp?.(result) === true;
    const prevLevel = result.prevLevel || prevInfo.level;
    const nextLevel = result.level || nextInfo.level;

    const prevPct = prevInfo.xpToNext > 0
      ? (prevInfo.xpInLevel / prevInfo.xpToNext) * 100
      : 0;
    const nextPct = nextInfo.xpToNext > 0
      ? (nextInfo.xpInLevel / nextInfo.xpToNext) * 100
      : 0;
    const barMs = shouldReduceMotion() ? 0 : 750;

    const overlay = document.createElement('div');
    overlay.id = 'match-xp-celebration';
    overlay.className = 'match-xp-celebration';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML = `
      <div class="match-xp-level-wrap" id="match-xp-level-wrap" hidden>
        <span class="match-xp-level-odometer" id="match-xp-level-num">${prevLevel}</span>
      </div>
      <div class="match-xp-bar-panel">
        <span class="match-xp-earned">+${result.xpEarned} XP</span>
        <div class="match-xp-bar-track" role="progressbar"
          aria-valuemin="0" aria-valuemax="${prevInfo.xpToNext}" aria-valuenow="${prevInfo.xpInLevel}">
          <div class="match-xp-bar-fill" id="match-xp-bar-fill" style="width:${prevPct}%"></div>
        </div>
        <span class="match-xp-bar-label" id="match-xp-bar-label">${t('profile.levelShort', { level: prevInfo.level })}</span>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const fillEl = overlay.querySelector('#match-xp-bar-fill');
    const labelEl = overlay.querySelector('#match-xp-bar-label');
    const levelWrap = overlay.querySelector('#match-xp-level-wrap');
    const levelNumEl = overlay.querySelector('#match-xp-level-num');
    const barTrack = overlay.querySelector('.match-xp-bar-track');

    if (showLevelUp) {
      spawnSoftConfetti(overlay);
      await animateBarFill(fillEl, 100, barMs);
      await wait(shouldReduceMotion() ? 0 : 120);

      levelWrap.hidden = false;
      requestAnimationFrame(() => levelWrap.classList.add('visible'));

      if (global.RwScoreOdometer) {
        const numEl = global.RwScoreOdometer.mount(levelNumEl);
        await global.RwScoreOdometer.update(numEl, nextLevel, prevLevel, { animate: true });
      } else {
        levelNumEl.textContent = String(nextLevel);
      }

      await wait(shouldReduceMotion() ? 200 : 650);
      levelWrap.classList.remove('visible');
      await wait(shouldReduceMotion() ? 0 : 280);
      levelWrap.hidden = true;

      fillEl.style.transition = 'none';
      fillEl.style.width = '0%';
      barTrack.setAttribute('aria-valuenow', '0');
      labelEl.textContent = t('profile.levelShort', { level: nextLevel });
      await wait(shouldReduceMotion() ? 0 : 40);
      await animateBarFill(fillEl, nextPct, barMs);
      barTrack.setAttribute('aria-valuemax', String(nextInfo.xpToNext));
      barTrack.setAttribute('aria-valuenow', String(nextInfo.xpInLevel));
    } else {
      await animateBarFill(fillEl, nextPct, barMs);
      barTrack.setAttribute('aria-valuenow', String(nextInfo.xpInLevel));
      labelEl.textContent = t('profile.levelShort', { level: nextInfo.level });
    }

    await wait(shouldReduceMotion() ? 500 : 1500);
    overlay.classList.remove('visible');
    await wait(400);
    overlay.remove();
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderParallelogramFrame({ icon, frameId, size }) {
    const frame = frameId || 'none';
    const sizeClass = size === 'sm' ? ' profile-parallelogram--sm'
      : size === 'picker' ? ' profile-parallelogram--picker'
        : size === 'xl' ? ' profile-parallelogram--xl'
          : size === 'lg' ? ' profile-parallelogram--lg'
            : size === 'menu' ? ' profile-parallelogram--menu' : '';
    return `
      <div class="profile-parallelogram profile-parallelogram--${frame}${sizeClass}" aria-hidden="true">
        <div class="profile-parallelogram-skew">
          <span class="profile-parallelogram-inner">${icon}</span>
        </div>
      </div>
    `;
  }

  function renderTitlePill(titleText) {
    return `
      <div class="profile-badge-title-pill">
        <span class="profile-badge-spark" aria-hidden="true">✦</span>
        <span class="profile-badge-title-text">${escapeHtml(titleText)}</span>
        <span class="profile-badge-spark" aria-hidden="true">✦</span>
      </div>
    `;
  }

  function renderTitleBanner(titleText, { compact } = {}) {
    if (!compact) return renderTitlePill(titleText);
    return `
      <div class="profile-badge-title-pill profile-badge-title-pill--compact">
        <span class="profile-badge-spark" aria-hidden="true">✦</span>
        <span class="profile-badge-title-text">${escapeHtml(titleText)}</span>
        <span class="profile-badge-spark" aria-hidden="true">✦</span>
      </div>
    `;
  }

  function renderLevelStar(level, { large } = {}) {
    const cls = large ? ' profile-badge-level-star--lg' : '';
    return `
      <div class="profile-badge-level-star${cls}" aria-label="${escapeHtml(t('profile.levelShort', { level }))}">
        <img class="profile-badge-level-star-img" src="assets/level-star.png" alt="" width="36" height="36" decoding="async">
        <span class="profile-badge-level-num">${level || 1}</span>
      </div>
    `;
  }

  const BATTLE_CARD_TIERS = {
    none: 'bronze',
    bronze: 'bronze',
    silver: 'silver',
    gold: 'gold',
    ruby: 'ruby',
    diamond: 'diamond',
    emerald: 'emerald',
    amethyst: 'amethyst',
    obsidian: 'obsidian',
    pink: 'pink',
    sakura: 'pink',
    neon: 'diamond',
    sunset: 'gold',
    galaxy: 'amethyst',
  };

  function getBattleCardTier(frameId) {
    return BATTLE_CARD_TIERS[frameId] || 'bronze';
  }

  function renderBadgeCard(summary, { variant } = {}) {
    const isHero = variant === 'hero';
    const frameId = summary.frameId || 'none';
    const tier = getBattleCardTier(frameId);
    const pct = summary.xpToNext > 0
      ? Math.min(100, Math.round((summary.xpInLevel / summary.xpToNext) * 100))
      : 0;
    const titleText = summary.displayTitle || summary.levelTitle || '';
    const showTitle = isHero && titleText;
    const sizeClass = isHero ? 'profile-badge-card--hero' : 'profile-badge-card--menu';

    return `
      <div class="profile-badge-card ${sizeClass}">
        <div class="profile-battle-card">
          <img class="profile-battle-card-img" src="assets/battle-cards/${escapeHtml(tier)}.png?v=4" alt="" width="200" height="200" decoding="async">
          <div class="profile-battle-card-level" aria-label="${escapeHtml(t('profile.levelShort', { level: summary.level }))}">${summary.level || 1}</div>
          <div class="profile-battle-card-xp" role="progressbar"
            aria-valuemin="0" aria-valuemax="${summary.xpToNext}" aria-valuenow="${summary.xpInLevel}"
            aria-label="${escapeHtml(t('profile.xpProgress', { current: summary.xpInLevel, total: summary.xpToNext }))}">
            <div class="profile-battle-card-xp-fill" style="width:${pct}%"></div>
          </div>
          <div class="profile-battle-card-body">
            <span class="profile-battle-card-icon" aria-hidden="true">${summary.avatarIcon || '🌸'}</span>
            ${showTitle ? renderTitlePill(titleText) : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderParallelogramCard({ frameId, size, innerHtml }) {
    const frame = frameId || 'none';
    const sizeClass = size === 'menu' ? ' profile-parallelogram--menu-card'
      : size === 'hero' ? ' profile-parallelogram--hero-card' : '';
    return `
      <div class="profile-parallelogram profile-parallelogram--${frame} profile-parallelogram--card${sizeClass}" aria-hidden="true">
        <div class="profile-parallelogram-skew">
          <div class="menu-profile-frame-inner">${innerHtml}</div>
        </div>
      </div>
    `;
  }

  function renderMenuProfileCard(summary, { variant } = {}) {
    if (!summary) return '';
    ensureStyles();
    const isHero = variant === 'hero';
    const isMenu = variant === 'menu';
    const cardClass = isHero ? ' menu-profile-card--hero' : isMenu ? ' menu-profile-card--menu' : '';
    return `
      <div class="menu-profile-card${cardClass}">
        ${renderBadgeCard(summary, { variant })}
      </div>
    `;
  }

  function renderAvatarWithFrame({ icon, frameId, size, shape }) {
    if (shape !== 'circle') {
      return renderParallelogramFrame({ icon, frameId, size });
    }
    const frame = frameId || 'none';
    const sizeClass = size === 'sm' ? ' profile-avatar-frame--sm'
      : size === 'picker' ? ' profile-avatar-frame--picker'
        : size === 'xl' ? ' profile-avatar-frame--xl'
          : size === 'lg' ? ' profile-avatar-frame--lg' : '';
    return `
      <div class="profile-avatar-frame profile-avatar-frame--${frame}${sizeClass}" aria-hidden="true">
        <span class="profile-avatar-inner">${icon}</span>
      </div>
    `;
  }

  function renderXpProgressBar({ xpInLevel, xpToNext, level, compact, minimal }) {
    const pct = xpToNext > 0 ? Math.min(100, Math.round((xpInLevel / xpToNext) * 100)) : 0;
    const compactClass = compact ? ' xp-bar-compact' : '';
    const label = minimal ? '' : `
        <span class="xp-progress-label">${xpInLevel} / ${xpToNext} XP · ${t('profile.levelShort', { level })}</span>`;
    return `
      <div class="xp-progress-wrap${compactClass}${minimal ? ' xp-progress-wrap--minimal' : ''}" role="progressbar"
        aria-valuemin="0" aria-valuemax="${xpToNext}" aria-valuenow="${xpInLevel}"
        aria-label="${t('profile.xpProgress', { current: xpInLevel, total: xpToNext })}">
        <div class="xp-progress-track">
          <div class="xp-progress-fill" style="width:${pct}%"></div>
        </div>${label}
      </div>
    `;
  }

  global.ProfileUI = {
    showXpToast,
    showMatchXpCelebration,
    showLevelUpModal,
    showBadgeModal,
    renderAvatarWithFrame,
    renderParallelogramFrame,
    renderTitleBanner,
    renderTitlePill,
    renderBadgeCard,
    renderMenuProfileCard,
    renderXpProgressBar,
    spawnSoftConfetti,
    ensureStyles,
  };
})(typeof window !== 'undefined' ? window : globalThis);
