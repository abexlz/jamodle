/**
 * Daily login rewards modal — 7-day week track (Angry Birds–style gift UI).
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

  const GIFT_STYLES_HREF = 'css/daily-gift.css?v=3';

  function ensureStyles() {
    let link = document.getElementById('daily-gift-styles');
    if (!link) {
      link = document.createElement('link');
      link.id = 'daily-gift-styles';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== GIFT_STYLES_HREF) {
      link.href = GIFT_STYLES_HREF;
    }
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

  function rewardAmountText(reward) {
    if (!reward) return '';
    if (reward.type === 'coins' || reward.type === 'xp') return String(reward.amount);
    return String(reward.amount);
  }

  function resolveIcon(icon, cls) {
    return global.CoinIcon?.resolve?.(icon, cls) || escapeHtml(icon || '🎁');
  }

  function dayHeaderLabel(day, snapshot) {
    if (day.state === 'tomorrow') return t('dailyGift.tomorrow');
    if (day.state === 'today' && snapshot.canClaimToday) return t('dailyGift.today');
    return t('dailyGift.dayLabel', { day: day.day });
  }

  function buildRewardStack(rewards, sizeClass) {
    const list = rewards && rewards.length ? rewards : [];
    return list.map((reward) => `
      <div class="daily-gift-reward-item">
        <span class="daily-gift-reward-icon" aria-hidden="true">${resolveIcon(reward.icon, `coin-icon ${sizeClass}`)}</span>
        <span class="daily-gift-reward-amt">${escapeHtml(rewardAmountText(reward))}</span>
      </div>
    `).join('');
  }

  function buildDayCard(day, snapshot) {
    const header = dayHeaderLabel(day, snapshot);
    const check = day.state === 'claimed'
      ? '<span class="daily-gift-cell-check" aria-hidden="true">✓</span>'
      : '';

    if (day.isJackpot) {
      return `
        <div class="daily-gift-cell daily-gift-cell--jackpot state-${day.state}"
          data-day="${day.day}" role="listitem"
          aria-label="${escapeHtml(t('dailyGift.dayLabel', { day: day.day }))}">
          <div class="daily-gift-cell-header">${escapeHtml(header)}</div>
          <div class="daily-gift-jackpot-rewards">
            ${buildRewardStack(day.rewards, 'coin-icon--md')}
          </div>
          ${check}
        </div>
      `;
    }

    const primary = day.rewards?.[0] || day;
    return `
      <div class="daily-gift-cell state-${day.state}"
        data-day="${day.day}" role="listitem"
        aria-label="${escapeHtml(t('dailyGift.dayLabel', { day: day.day }))}">
        <div class="daily-gift-cell-header">${escapeHtml(header)}</div>
        <div class="daily-gift-cell-body">
          <span class="daily-gift-reward-icon" aria-hidden="true">${resolveIcon(primary.icon, 'coin-icon coin-icon--md')}</span>
          <span class="daily-gift-reward-amt">${escapeHtml(rewardAmountText(primary))}</span>
        </div>
        ${check}
      </div>
    `;
  }

  function buildTrackCells(snapshot) {
    const regular = snapshot.days.filter((d) => !d.isJackpot).map((d) => buildDayCard(d, snapshot)).join('');
    const jackpot = snapshot.days.filter((d) => d.isJackpot).map((d) => buildDayCard(d, snapshot)).join('');
    return `
      <div class="daily-gift-track-grid">${regular}</div>
      ${jackpot}
    `;
  }

  function buildSubtitle(snapshot) {
    if (snapshot.streakBroken) return t('dailyGift.streakBroken');
    if (!snapshot.canClaimToday) return t('dailyGift.returnTomorrow');
    return t('dailyGift.subtitle', {
      day: snapshot.claimDay,
      week: snapshot.weekIndex,
      start: snapshot.weekStart,
      end: snapshot.weekEnd,
    });
  }

  function buildTrackModal(snapshot) {
    const { canClaimToday } = snapshot;
    return `
      <div class="daily-gift-modal">
        <div class="daily-gift-mascot" aria-hidden="true">🎁</div>
        <button type="button" class="daily-gift-close" aria-label="${escapeHtml(t('dailyGift.closeLabel'))}">
          <span aria-hidden="true">×</span>
        </button>
        <div class="daily-gift-banner">
          <h2 class="daily-gift-title">${escapeHtml(t('dailyGift.title'))}</h2>
        </div>
        <p class="daily-gift-sub">${escapeHtml(buildSubtitle(snapshot))}</p>
        <div class="daily-gift-track" role="list" aria-label="${escapeHtml(t('dailyGift.trackLabel'))}">
          ${buildTrackCells(snapshot)}
        </div>
        <button type="button" class="daily-gift-claim-btn" id="daily-gift-claim-btn"
          ${canClaimToday ? '' : 'disabled'}>
          ${escapeHtml(canClaimToday ? t('dailyGift.claim') : t('dailyGift.claimedToday'))}
        </button>
      </div>
    `;
  }

  function buildRevealModal(result) {
    const rewards = result.rewards?.length ? result.rewards : (result.reward ? [result.reward] : []);
    const giftsHtml = rewards.map((reward) => `
      <p class="daily-gift-reveal-gift">${escapeHtml(rewardLabel(reward))}</p>
    `).join('');

    return `
      <div class="daily-gift-modal daily-gift-modal--reveal">
        <div class="daily-gift-mascot" aria-hidden="true">🎁</div>
        <div class="daily-gift-reveal">
          <div class="daily-gift-reveal-icons" aria-hidden="true">
            ${rewards.map((r) => `<span class="daily-gift-reveal-icon">${resolveIcon(r.icon, 'coin-icon coin-icon--lg')}</span>`).join('')}
          </div>
          <h2 class="daily-gift-reveal-title">${escapeHtml(t('dailyGift.revealedTitle'))}</h2>
          <p class="daily-gift-reveal-day">${escapeHtml(t('dailyGift.dayComplete', { day: result.claimDay }))}</p>
          ${giftsHtml}
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

  function bindOverlayChrome(overlay) {
    overlay.querySelector('.daily-gift-close')?.addEventListener('click', () => closeOverlay(overlay));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay(overlay);
    });
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
    overlay.setAttribute('aria-label', t('dailyGift.title'));
    overlay.innerHTML = buildTrackModal(snapshot);

    document.body.appendChild(overlay);
    document.body.classList.add('daily-gift-open');
    global.I18n?.applyToDocument?.(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    bindOverlayChrome(overlay);
    overlay.querySelector('#daily-gift-claim-btn')?.addEventListener('click', () => onClaim(overlay));
  }

  function onClaim(overlay) {
    if (overlay.dataset.claimed === '1') return;
    const result = DG()?.claimToday?.();
    if (!result?.ok) {
      closeOverlay(overlay);
      updateMenuDailyGiftNav();
      return;
    }
    overlay.dataset.claimed = '1';
    overlay.innerHTML = buildRevealModal(result);
    global.I18n?.applyToDocument?.(overlay);
    overlay.querySelector('.daily-gift-done-btn')?.addEventListener('click', () => {
      closeOverlay(overlay);
      updateMenuDailyGiftNav();
    });
    bindOverlayChrome(overlay);
    updateMenuDailyGiftNav();
  }

  function updateMenuDailyGiftNav() {
    const btn = document.getElementById('menu-daily-gift-nav');
    const dot = document.getElementById('menu-daily-gift-dot');
    if (!btn) return;
    const canClaim = !!DG()?.canClaimToday?.();
    btn.classList.toggle('is-claimable', canClaim);
    if (dot) dot.classList.toggle('hidden', !canClaim);
  }

  function tryShow() {
    if (!DG()?.canClaimToday?.()) return;
    if (!shouldShowOnPage()) return;
    showPicker();
  }

  global.DailyGiftUI = {
    tryShow,
    showPicker,
    updateMenuDailyGiftNav,
  };
})(typeof window !== 'undefined' ? window : globalThis);
