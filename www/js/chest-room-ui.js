/**
 * Chest Room UI — buy wooden / original / mega boxes; claim free mega from dailies.
 */
(function (global) {
  'use strict';

  const CRS = () => global.ChestRoomService || global.WheelService;

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

  function coinHtml(cls) {
    return global.CoinIcon?.html?.(cls) || '🪙';
  }

  function prizeLabel(prize) {
    if (!prize) return '';
    const key = `chestRoom.prizes.${prize.id}`;
    const labeled = t(key);
    if (labeled && labeled !== key) return labeled;
    return t(`wheel.prizes.${prize.id}`) || prize.id;
  }

  function getStatus() {
    const snap = global.QuestService?.getQuestSnapshot?.() || { daily: [], dailyWheelClaimed: false };
    const profile = global.ProfileService?.loadProfile?.();
    if (snap.dailyWheelClaimed) {
      return { status: 'claimed', snap, profile };
    }
    if (CRS()?.isDailyMegaAvailable?.(profile) || CRS()?.isDailyWheelAvailable?.(profile)) {
      return { status: 'ready', snap, profile };
    }
    const doneCount = (snap.daily || []).filter((q) => q.progress >= q.target).length;
    return {
      status: 'locked',
      snap,
      profile,
      doneCount,
      total: (snap.daily || []).length,
    };
  }

  function statusMessage(statusInfo) {
    if (statusInfo.status === 'claimed') return t('chestRoom.claimedDesc');
    if (statusInfo.status === 'ready') return t('chestRoom.readyDesc');
    return t('chestRoom.lockedDesc', {
      done: statusInfo.doneCount || 0,
      total: statusInfo.total || 0,
    });
  }

  function openRewardOverlay(result, onComplete) {
    if (!result?.ok) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const display = result.display || CRS()?.prizeToRewardDisplay?.(result.prize) || {};
    const tier = result.tier || CRS()?.getTier?.(result.tierId);

    const show = () => {
      if (!global.ChestRewardUI?.show) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      global.ChestRewardUI.show({
        coins: display.coins || 0,
        xp: display.xp || 0,
        bonusItem: display.bonusItem || null,
        bonusKind: display.bonusKind || null,
        bonusAmount: display.bonusAmount || 0,
        prizeLabel: prizeLabel(result.prize),
        coinsBefore: result.coinsBefore,
        chestTier: result.tierId || 'mega',
        closedSrc: tier?.closedImg,
        openSrc: tier?.openImg,
        title: result.free ? t('chestRoom.freeMegaTitle') : t(`chestRoom.tiers.${result.tierId}.opened`),
        onComplete: () => {
          updateMenuWheelNav();
          const menuRoot = document.getElementById('menu-root');
          if (menuRoot) global.QuestUI?.refreshSection?.(menuRoot);
          if (typeof onComplete === 'function') onComplete();
        },
      });
    };

    // Slight delay so the room UI can refresh purchase state first.
    setTimeout(show, 80);
  }

  function renderTier(statusInfo) {
    const coins = statusInfo.profile?.coins || 0;
    const freeReady = statusInfo.status === 'ready';
    const tiers = CRS()?.listTiers?.() || [];

    return tiers.map((tier) => {
      const isMega = tier.id === 'mega';
      const canBuy = coins >= tier.price;
      const showFree = isMega && freeReady;
      const priceLabel = showFree
        ? t('chestRoom.free')
        : `${tier.price}`;
      const ctaLabel = showFree
        ? t('chestRoom.openFree')
        : t('chestRoom.buy');
      const disabled = showFree ? false : !canBuy;
      const tierClass = `chest-room-card chest-room-card--${escapeHtml(tier.id)}${showFree ? ' is-free-ready' : ''}${disabled ? ' is-locked' : ''}`;

      return `
        <article class="${tierClass}" data-chest-tier="${escapeHtml(tier.id)}">
          <div class="chest-room-card-art">
            <img src="${escapeHtml(tier.closedImg)}" alt="" draggable="false" decoding="async">
            ${showFree ? `<span class="chest-room-free-badge">${escapeHtml(t('chestRoom.freeBadge'))}</span>` : ''}
          </div>
          <h3 class="chest-room-card-title">${escapeHtml(t(`chestRoom.tiers.${tier.id}.name`))}</h3>
          <p class="chest-room-card-desc">${escapeHtml(t(`chestRoom.tiers.${tier.id}.desc`))}</p>
          <button type="button"
            class="chest-room-buy-btn"
            data-buy-tier="${escapeHtml(tier.id)}"
            data-free="${showFree ? '1' : '0'}"
            ${disabled ? ' disabled' : ''}>
            ${showFree
              ? `<span>${escapeHtml(ctaLabel)}</span>`
              : `<span class="chest-room-buy-price">${coinHtml('coin-icon coin-icon--sm')}<span>${escapeHtml(priceLabel)}</span></span><span>${escapeHtml(ctaLabel)}</span>`
            }
          </button>
        </article>
      `;
    }).join('');
  }

  function renderRoom(statusInfo) {
    const stateClass = statusInfo.status === 'claimed'
      ? ' is-claimed'
      : statusInfo.status === 'ready'
        ? ' is-ready'
        : ' is-locked';
    const coins = statusInfo.profile?.coins || 0;

    return `
      <div class="chest-room-panel${stateClass}">
        <header class="chest-room-header">
          <h2 class="chest-room-title">${escapeHtml(t('chestRoom.pageTitle'))}</h2>
          <p class="chest-room-balance" aria-label="${escapeHtml(t('shop.coins'))}">
            ${coinHtml('coin-icon coin-icon--sm')}
            <span id="chest-room-coins">${escapeHtml(String(coins))}</span>
          </p>
        </header>
        <p class="chest-room-status" id="chest-room-status">${escapeHtml(statusMessage(statusInfo))}</p>
        <div class="chest-room-grid" id="chest-room-grid">
          ${renderTiers(statusInfo)}
        </div>
        <footer class="chest-room-footer">
          <a class="chest-room-quests-link" href="index.html?tab=quests">${escapeHtml(t('chestRoom.goQuests'))}</a>
        </footer>
      </div>
    `;
  }

  function handleBuy(tierId, isFree, pageRoot) {
    if (pageRoot?.dataset.busy === '1') return;
    if (pageRoot) pageRoot.dataset.busy = '1';

    let result;
    if (isFree && tierId === 'mega') {
      result = CRS()?.claimFreeMega?.();
    } else {
      result = CRS()?.buyChest?.(tierId);
    }

    if (!result?.ok) {
      if (pageRoot) pageRoot.dataset.busy = '0';
      if (result?.reason === 'insufficient') {
        const status = document.getElementById('chest-room-status');
        if (status) status.textContent = t('chestRoom.needCoins', { price: result.price || 0 });
      }
      mountPage(pageRoot);
      return;
    }

    mountPage(pageRoot);
    openRewardOverlay(result, () => {
      if (pageRoot) pageRoot.dataset.busy = '0';
      mountPage(pageRoot);
    });
  }

  function bindRoom(root, pageRoot) {
    root.querySelectorAll('[data-buy-tier]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const tierId = btn.getAttribute('data-buy-tier');
        const isFree = btn.getAttribute('data-free') === '1';
        handleBuy(tierId, isFree, pageRoot);
      });
    });
  }

  function mountPage(rootEl, options) {
    if (!rootEl) return false;
    global.QuestService?.getQuestSnapshot?.();
    const statusInfo = getStatus();
    rootEl.innerHTML = renderRoom(statusInfo);
    global.I18n?.applyToDocument?.(rootEl);
    bindRoom(rootEl, rootEl);

    const autoClaim = options?.autoClaim || options?.autoSpin;
    if (autoClaim && statusInfo.status === 'ready') {
      setTimeout(() => handleBuy('mega', true, rootEl), 420);
    }
    return true;
  }

  function updateMenuWheelNav() {
    const btn = document.getElementById('menu-wheel-nav')
      || document.getElementById('menu-chest-nav');
    if (!btn) return;
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    const ready = CRS()?.isDailyMegaAvailable?.(profile)
      || CRS()?.isDailyWheelAvailable?.(profile);
    const snap = global.QuestService?.getQuestSnapshot?.();
    const claimed = snap?.dailyWheelClaimed;
    btn.classList.toggle('is-ready', !!ready);
    btn.classList.toggle('is-claimed', !!claimed && !ready);
    let badge = btn.querySelector('.menu-hud-spin-badge') || btn.querySelector('.menu-wheel-nav-badge');
    if (ready) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'menu-hud-spin-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.textContent = '!';
    } else if (badge) {
      badge.remove();
    }
  }

  function show(options) {
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    const ready = CRS()?.isDailyMegaAvailable?.(profile)
      || CRS()?.isDailyWheelAvailable?.(profile);
    const suffix = (options?.autoSpin || options?.autoClaim) && ready ? '?claim=1' : '';
    window.location.href = `chest-room.html${suffix}`;
    return true;
  }

  function tryShow() {
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    if (!(CRS()?.isDailyMegaAvailable?.(profile) || CRS()?.isDailyWheelAvailable?.(profile))) {
      return false;
    }
    window.location.href = 'chest-room.html?claim=1';
    return true;
  }

  global.ChestRoomUI = { show, tryShow, mountPage, updateMenuWheelNav };
  // Back-compat for menu / quest code still calling WheelUI.
  global.WheelUI = global.ChestRoomUI;
})(typeof window !== 'undefined' ? window : globalThis);
