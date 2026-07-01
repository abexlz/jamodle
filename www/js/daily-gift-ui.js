/**
 * Daily gift picker modal — three boxes, always +10 coins.
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

  function buildGiftButtons(gifts) {
    return gifts.map((gift) => {
      const label = t(`dailyGift.gifts.${gift.id}`);
      return `
        <button type="button" class="daily-gift-box accent-${gift.accent}"
          data-gift-id="${escapeHtml(gift.id)}" aria-label="${escapeHtml(label)}">
          <span class="daily-gift-box-icon" aria-hidden="true">${gift.icon}</span>
          <span class="daily-gift-box-label">${escapeHtml(label)}</span>
        </button>
      `;
    }).join('');
  }

  function showPicker() {
    if (!DG()?.canClaimToday?.()) return;
    ensureStyles();

    const existing = document.getElementById('daily-gift-overlay');
    if (existing) {
      document.body.classList.remove('daily-gift-open');
      existing.remove();
    }

    const gifts = DG().getTodaysGifts();
    const overlay = document.createElement('div');
    overlay.id = 'daily-gift-overlay';
    overlay.className = 'daily-gift-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="daily-gift-modal">
        <h2 class="daily-gift-title">${escapeHtml(t('dailyGift.title'))}</h2>
        <p class="daily-gift-sub">${escapeHtml(t('dailyGift.subtitle'))}</p>
        <div class="daily-gift-grid" role="group" aria-label="${escapeHtml(t('dailyGift.pickOne'))}">
          ${buildGiftButtons(gifts)}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('daily-gift-open');
    global.I18n?.applyToDocument?.(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.querySelectorAll('[data-gift-id]').forEach((btn) => {
      btn.addEventListener('click', () => onPick(overlay, btn.dataset.giftId, btn));
    });
  }

  function onPick(overlay, giftId, btn) {
    if (overlay.dataset.claimed === '1') return;
    overlay.dataset.claimed = '1';

    overlay.querySelectorAll('[data-gift-id]').forEach((b) => {
      b.disabled = true;
      b.classList.toggle('is-picked', b === btn);
      b.classList.toggle('is-faded', b !== btn);
    });

    const result = DG()?.claimGift?.(giftId);
    if (!result?.ok) {
      closeOverlay(overlay);
      return;
    }

    const modal = overlay.querySelector('.daily-gift-modal');
    modal.innerHTML = `
      <div class="daily-gift-reveal">
        <span class="daily-gift-reveal-icon" aria-hidden="true">🎁</span>
        <h2 class="daily-gift-reveal-title">${escapeHtml(t('dailyGift.revealedTitle'))}</h2>
        <p class="daily-gift-reveal-gift">${escapeHtml(t(`dailyGift.gifts.${giftId}`))}</p>
        <p class="daily-gift-reveal-coins">${escapeHtml(t('dailyGift.coinsAwarded', { coins: result.coinsAwarded }))}</p>
        <button type="button" class="daily-gift-done-btn">${escapeHtml(t('dailyGift.continue'))}</button>
      </div>
    `;
    global.I18n?.applyToDocument?.(modal);

    modal.querySelector('.daily-gift-done-btn')?.addEventListener('click', () => closeOverlay(overlay));
  }

  function closeOverlay(overlay) {
    overlay.classList.remove('visible');
    document.body.classList.remove('daily-gift-open');
    setTimeout(() => overlay.remove(), 280);
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
