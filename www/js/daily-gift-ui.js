/**
 * Daily login rewards modal — 30-day track with claim button.
 */
(function (global) {
  'use strict';

  const DG = () => global.DailyGiftService;

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

  function ensureStyles() {
    if (document.getElementById('daily-gift-styles')) return;
    const link = document.createElement('link');
    link.id = 'daily-gift-styles';
    link.rel = 'stylesheet';
    link.href = 'css/daily-gift.css';
    document.head.appendChild(link);
  }

  function shouldShowOnPage() {
    const menu = document.getElementById('menu-screen');
    if (menu && !menu.classList.contains('hidden')) return true;
    if (document.getElementById('profile-root')) return true;
    return false;
  }

  function rewardLabel(reward) {
    if (!reward) return '';
    const key = `dailyGift.rewards.${reward.type}`;
    const label = t(key, { amount: reward.amount });
    if (label) return label;
    return `${reward.icon} +${reward.amount}`;
  }

  function buildTrackCells(days) {
    return days.map((day) => {
      const isMilestone = day.day === 7 || day.day === 14 || day.day === 21 || day.day === 30;
      return `
        <div class="daily-gift-cell state-${day.state}${isMilestone ? ' is-milestone' : ''}"
          data-day="${day.day}" aria-label="${escapeHtml(t('dailyGift.dayLabel', { day: day.day }))}">
          <span class="daily-gift-cell-day">${day.day}</span>
          <span class="daily-gift-cell-icon" aria-hidden="true">${day.icon}</span>
          ${day.state === 'claimed' ? '<span class="daily-gift-cell-check" aria-hidden="true">✓</span>' : ''}
        </div>
      `;
    }).join('');
  }

  function buildTrackModal(snapshot) {
    const { claimDay, canClaimToday, days, streakBroken } = snapshot;
    const subtitle = streakBroken
      ? t('dailyGift.streakBroken')
      : t('dailyGift.subtitle', { day: claimDay, total: snapshot.trackLength });

    return `
      <div class="daily-gift-modal">
        <h2 class="daily-gift-title">${escapeHtml(t('dailyGift.title'))}</h2>
        <p class="daily-gift-sub">${escapeHtml(subtitle)}</p>
        <div class="daily-gift-track" role="list" aria-label="${escapeHtml(t('dailyGift.trackLabel'))}">
          ${buildTrackCells(days)}
        </div>
        <div class="daily-gift-today-reward">
          <span class="daily-gift-today-icon" aria-hidden="true">${snapshot.reward?.icon || '🎁'}</span>
          <span class="daily-gift-today-text">${escapeHtml(rewardLabel(snapshot.reward))}</span>
        </div>
        <button type="button" class="daily-gift-claim-btn" id="daily-gift-claim-btn"
          ${canClaimToday ? '' : 'disabled'}>
          ${escapeHtml(canClaimToday ? t('dailyGift.claim') : t('dailyGift.claimedToday'))}
        </button>
      </div>
    `;
  }

  function buildRevealModal(result) {
    const reward = result.reward;
    return `
      <div class="daily-gift-modal">
        <div class="daily-gift-reveal">
          <span class="daily-gift-reveal-icon" aria-hidden="true">${reward?.icon || '🎁'}</span>
          <h2 class="daily-gift-reveal-title">${escapeHtml(t('dailyGift.revealedTitle'))}</h2>
          <p class="daily-gift-reveal-day">${escapeHtml(t('dailyGift.dayComplete', { day: result.claimDay }))}</p>
          <p class="daily-gift-reveal-gift">${escapeHtml(rewardLabel(reward))}</p>
          ${result.cycleComplete
            ? `<p class="daily-gift-reveal-cycle">${escapeHtml(t('dailyGift.cycleComplete'))}</p>`
            : ''}
          <button type="button" class="daily-gift-done-btn">${escapeHtml(t('dailyGift.continue'))}</button>
        </div>
      </div>
    `;
  }

  function closeOverlay(overlay) {
    overlay.classList.remove('visible');
    document.body.classList.remove('daily-gift-open');
    setTimeout(() => overlay.remove(), 280);
  }

  function showPicker() {
    ensureStyles();
    const snapshot = DG()?.getTrackSnapshot?.();
    if (!snapshot) return;

    const existing = document.getElementById('daily-gift-overlay');
    if (existing) {
      document.body.classList.remove('daily-gift-open');
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'daily-gift-overlay';
    overlay.className = 'daily-gift-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = buildTrackModal(snapshot);

    document.body.appendChild(overlay);
    document.body.classList.add('daily-gift-open');
    global.I18n?.applyToDocument?.(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.querySelector('#daily-gift-claim-btn')?.addEventListener('click', () => onClaim(overlay));
  }

  function onClaim(overlay) {
    if (overlay.dataset.claimed === '1') return;
    const result = DG()?.claimToday?.();
    if (!result?.ok) {
      closeOverlay(overlay);
      return;
    }
    overlay.dataset.claimed = '1';
    overlay.innerHTML = buildRevealModal(result);
    global.I18n?.applyToDocument?.(overlay);
    overlay.querySelector('.daily-gift-done-btn')?.addEventListener('click', () => closeOverlay(overlay));
  }

  function tryShow() {
    if (!DG()?.canClaimToday?.()) return;
    if (!shouldShowOnPage()) return;
    showPicker();
  }

  global.DailyGiftUI = {
    tryShow,
    showPicker,
  };
})(typeof window !== 'undefined' ? window : globalThis);
