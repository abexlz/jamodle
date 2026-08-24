/**
 * Shop — inline scroll section with Item / Cosmetic scope tabs.
 */
(function (global) {
  'use strict';

  const SS = () => global.ShopService;

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

  function renderFramePreview(frameId) {
    if (global.ProfileUI?.renderAvatarWithFrame) {
      return global.ProfileUI.renderAvatarWithFrame({
        icon: '🌸',
        frameId,
        size: 'picker',
        shape: 'circle',
      });
    }
    const frame = SS().FRAMES[frameId];
    return `<div class="shop-frame-swatch" style="background:${frame?.swatch || '#ccc'}" aria-hidden="true"></div>`;
  }

  function renderFramesBlock(inv) {
    return Object.values(SS().FRAMES).map((frame) => {
      const owned = SS().ownsFrame(frame.id);
      const name = t(`shop.frames.${frame.id}`);
      const desc = t(`shop.frames.${frame.id}Desc`);

      let action = '';
      if (owned) {
        action = `<span class="shop-owned-badge">${escapeHtml(t('shop.owned'))}</span>`;
      } else {
        action = `
          <button type="button" class="shop-buy-btn shop-buy-btn--compact" data-buy-frame="${escapeHtml(frame.id)}"
            ${inv.coins >= frame.price ? '' : 'disabled'}>
            ${global.CoinIcon?.html?.('coin-icon coin-icon--sm') || '🪙'} ${frame.price}
          </button>`;
      }

      return `
        <article class="shop-item-card shop-cosmetic-card shop-frame-card${owned ? ' is-owned' : ''}"
          title="${escapeHtml(desc)}">
          <div class="shop-frame-preview" aria-hidden="true">
            ${renderFramePreview(frame.id)}
          </div>
          <div class="shop-item-main">
            <span class="shop-item-name">${escapeHtml(name)}</span>
          </div>
          ${action}
        </article>
      `;
    }).join('');
  }

  function renderCoinEarnBlock() {
    const MS = global.MonetizationService;
    const packs = MS?.getCoinPacks?.() || [];
    const ad = MS?.getAdStatus?.() || { remaining: 0, cooldownMs: 0, rewardCoins: 25, dailyLimit: 5 };
    const adDisabled = ad.remaining <= 0 || ad.cooldownMs > 0;
    let adHint = t('shop.adRemaining', { n: ad.remaining, max: ad.dailyLimit });
    if (ad.remaining <= 0) adHint = t('shop.adDailyLimit');
    else if (ad.cooldownMs > 0) {
      adHint = t('shop.adCooldown', { sec: Math.ceil(ad.cooldownMs / 1000) });
    }

    const packCards = packs.map((pack) => {
      const badge = pack.badge
        ? `<span class="shop-pack-badge shop-pack-badge--${escapeHtml(pack.badge)}">${escapeHtml(t(`shop.packBadge.${pack.badge}`))}</span>`
        : '';
      return `
        <article class="shop-item-card shop-pack-card">
          ${badge}
          <span class="shop-item-icon" aria-hidden="true">${global.CoinIcon?.html?.('coin-icon coin-icon--md') || '🪙'}</span>
          <div class="shop-item-main">
            <span class="shop-item-name">${escapeHtml(t('shop.packCoins', { n: pack.coins }))}</span>
            <span class="shop-item-qty">${escapeHtml(pack.priceLabel)}</span>
          </div>
          <button type="button" class="shop-buy-btn shop-buy-btn--compact shop-buy-btn--cash"
            data-buy-pack="${escapeHtml(pack.id)}"
            aria-label="${escapeHtml(t('shop.buyPack', { n: pack.coins, price: pack.priceLabel }))}">
            ${escapeHtml(pack.priceLabel)}
          </button>
        </article>
      `;
    }).join('');

    return `
      <h3 class="shop-subsection-title">${escapeHtml(t('shop.tabGetCoins'))}</h3>
      <div class="shop-item-grid shop-consumables-list shop-pack-list">${packCards}</div>
      <article class="shop-item-card shop-item-card--row shop-ad-card">
        <span class="shop-item-icon" aria-hidden="true">📺</span>
        <div class="shop-item-main">
          <span class="shop-item-name">${escapeHtml(t('shop.watchAdTitle', { n: ad.rewardCoins }))}</span>
          <span class="shop-item-qty">${escapeHtml(adHint)}</span>
        </div>
        <button type="button" class="shop-buy-btn shop-buy-btn--compact shop-buy-btn--ad"
          data-watch-ad-coins
          ${adDisabled ? 'disabled' : ''}
          aria-label="${escapeHtml(t('shop.watchAdTitle', { n: ad.rewardCoins }))}">
          ${escapeHtml(t('shop.watchAdCta'))}
        </button>
      </article>
    `;
  }

  function itemIconHtml(item) {
    if (item.iconSrc) {
      return `<img class="shop-item-icon-img" src="${escapeHtml(item.iconSrc)}" alt="" width="44" height="44" decoding="async" draggable="false">`;
    }
    return global.CoinIcon?.resolve?.(item.icon, 'coin-icon coin-icon--md') || escapeHtml(item.icon);
  }

  function renderItemsBlock(inv) {
    const items = Object.entries(SS().ITEMS).map(([key, item]) => ({ key, ...item }));
    return items.map((item) => {
      const activeLabel = item.buffId ? SS()?.getItemStatusLabel?.(item.key) : null;
      const count = item.buffId
        ? null
        : (item.useHintTokens
          ? (global.HintTokens?.get?.() ?? 0)
          : (inv[item.field] || 0));
      const name = t(`shop.items.${item.key}`);
      const desc = t(`shop.items.${item.key}Desc`);
      const qty = activeLabel
        ? t('shop.activeFor', { time: activeLabel })
        : (count == null ? '' : t('shop.quantity', { count }));

      return `
        <article class="shop-item-card shop-item-card--row" title="${escapeHtml(desc)}">
          <span class="shop-item-icon${item.iconSrc ? ' shop-item-icon--img' : ''}" aria-hidden="true">${itemIconHtml(item)}</span>
          <div class="shop-item-main">
            <span class="shop-item-name">${escapeHtml(name)}</span>
            ${qty ? `<span class="shop-item-qty">${escapeHtml(qty)}</span>` : `<span class="shop-item-qty">${escapeHtml(desc)}</span>`}
          </div>
          <button type="button" class="shop-buy-btn shop-buy-btn--compact" data-buy-item="${escapeHtml(item.key)}"
            ${inv.coins >= item.price ? '' : 'disabled'}
            aria-label="${escapeHtml(t('shop.buy'))} ${escapeHtml(name)}">
            ${global.CoinIcon?.html?.('coin-icon coin-icon--sm') || '🪙'} ${item.price}
          </button>
        </article>
      `;
    }).join('');
  }

  let activeShopScope = 'item';

  function renderSection() {
    const inv = SS()?.getInventory?.() || {
      coins: 0, ownedThemes: [], extraGuessTokens: 0, selectedCosmeticTheme: 'default',
    };
    const scope = activeShopScope;

    return `
      <section class="shop-section" id="shop-section" aria-label="${escapeHtml(t('shop.title'))}">
        <div class="shop-scope-bar">
          <div class="shop-scope-switch" role="tablist" aria-label="${escapeHtml(t('shop.title'))}">
            <button type="button" class="shop-scope-btn${scope === 'item' ? ' is-active' : ''}"
              role="tab" aria-selected="${scope === 'item'}" data-shop-scope="item">
              ${escapeHtml(t('shop.scopeItem'))}
            </button>
            <button type="button" class="shop-scope-btn${scope === 'cosmetic' ? ' is-active' : ''}"
              role="tab" aria-selected="${scope === 'cosmetic'}" data-shop-scope="cosmetic">
              ${escapeHtml(t('shop.scopeCosmetic'))}
            </button>
          </div>
        </div>

        <div class="shop-scope-panel${scope === 'item' ? '' : ' hidden'}" data-shop-scope-panel="item"
          role="tabpanel" aria-labelledby="shop-scope-item">
          ${renderCoinEarnBlock()}
          <h3 class="shop-subsection-title" id="shop-scope-item">${escapeHtml(t('shop.tabItems'))}</h3>
          <div class="shop-item-grid shop-consumables-list">${renderItemsBlock(inv)}</div>
        </div>

        <div class="shop-scope-panel${scope === 'cosmetic' ? '' : ' hidden'}" data-shop-scope-panel="cosmetic"
          role="tabpanel" aria-labelledby="shop-scope-cosmetic">
          <h3 class="shop-subsection-title" id="shop-scope-cosmetic">${escapeHtml(t('shop.tabFrames'))}</h3>
          <div class="shop-item-grid shop-frame-grid">${renderFramesBlock(inv)}</div>
        </div>

        <p class="shop-msg" id="shop-section-msg" hidden></p>
      </section>
    `;
  }

  function setShopScope(scope, root) {
    if (scope !== 'item' && scope !== 'cosmetic') return;
    activeShopScope = scope;

    const section = root?.querySelector('#shop-section') || document.getElementById('shop-section');
    if (!section) return;

    section.querySelectorAll('[data-shop-scope]').forEach((btn) => {
      const active = btn.dataset.shopScope === scope;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    section.querySelectorAll('[data-shop-scope-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.shopScopePanel !== scope);
    });
  }

  function showMessage(root, text, kind) {
    const msg = root?.querySelector('#shop-section-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.hidden = !text;
    msg.className = 'shop-msg' + (kind ? ` shop-msg--${kind}` : '');
  }

  function refreshSection(root) {
    const section = root?.querySelector('#shop-section') || document.getElementById('shop-section');
    if (!section) return;
    const parent = section.parentElement;
    if (!parent) return;
    section.outerHTML = renderSection();
    bindSection(parent);
    global.I18n?.applyToDocument?.(parent);
  }

  function bindSection(root) {
    if (!root) return;
    const section = root.querySelector('#shop-section') || root;

    section.querySelectorAll('[data-shop-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.shopScope;
        if (next) setShopScope(next, root);
      });
    });

    section.querySelectorAll('[data-buy-frame]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = SS()?.buyFrame?.(btn.dataset.buyFrame);
        if (result?.ok) {
          showMessage(section.closest('.menu-sections') || section, t('shop.purchaseSuccess'), 'ok');
          refreshSection(root);
        } else if (result?.reason === 'insufficient') {
          showMessage(section.closest('.menu-sections') || section, t('shop.insufficientCoins'), 'error');
        }
      });
    });

    section.querySelectorAll('[data-buy-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = SS()?.buyItem?.(btn.dataset.buyItem);
        if (result?.ok) {
          showMessage(section.closest('.menu-sections') || section, t('shop.purchaseSuccess'), 'ok');
          refreshSection(root);
        } else if (result?.reason === 'insufficient') {
          showMessage(section.closest('.menu-sections') || section, t('shop.insufficientCoins'), 'error');
        }
      });
    });

    section.querySelectorAll('[data-buy-pack]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const result = await global.MonetizationService?.purchaseCoinPack?.(btn.dataset.buyPack);
          const host = section.closest('.menu-sections') || section;
          if (result?.ok) {
            showMessage(host, t('shop.packGranted', { n: result.coins }), 'ok');
            refreshSection(root);
            global.PlayerHud?.refresh?.();
          } else if (result?.reason === 'cancelled') {
            showMessage(host, '', '');
          } else if (result?.reason === 'iap-unavailable' || result?.reason === 'unsupported-iap') {
            showMessage(host, t('shop.iapUnavailable'), 'error');
          } else {
            showMessage(host, t('shop.iapFailed'), 'error');
          }
        } finally {
          btn.disabled = false;
        }
      });
    });

    section.querySelectorAll('[data-watch-ad-coins]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const result = await global.MonetizationService?.watchAdForCoins?.();
          const host = section.closest('.menu-sections') || section;
          if (result?.ok) {
            showMessage(host, t('shop.adGranted', { n: result.coins }), 'ok');
            refreshSection(root);
            global.PlayerHud?.refresh?.();
          } else if (result?.reason === 'daily-limit') {
            showMessage(host, t('shop.adDailyLimit'), 'error');
            refreshSection(root);
          } else if (result?.reason === 'cooldown') {
            const sec = Math.ceil((result.status?.cooldownMs || 0) / 1000);
            showMessage(host, t('shop.adCooldown', { sec }), 'error');
            refreshSection(root);
          } else {
            showMessage(host, t('shop.adFailed'), 'error');
            refreshSection(root);
          }
        } finally {
          // refreshSection rebinds; if still on same node, re-enable
          btn.disabled = false;
        }
      });
    });
  }

  function showLevelCoinToast(coinsGranted) {
    const existing = document.getElementById('level-coin-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'level-coin-toast';
    toast.className = 'level-coin-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = global.CoinIcon?.format?.(t('shop.levelUpCoins', { coins: coinsGranted }), 'coin-icon coin-icon--sm')
      || escapeHtml(t('shop.levelUpCoins', { coins: coinsGranted }));
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    global.PlayerHud?.refresh?.();
    const menuRoot = document.getElementById('menu-root');
    if (menuRoot) refreshSection(menuRoot);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  /** @deprecated use scrollToShop */
  function open() {
    scrollToShop();
  }

  function scrollToShop() {
    if (global.MenuApp?.setHomeTab) {
      global.MenuApp.setHomeTab('shop');
      return;
    }
    document.getElementById('shop-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  global.ShopUI = {
    renderSection,
    bindSection,
    refreshSection,
    scrollToShop,
    open,
    showLevelCoinToast,
  };
})(typeof window !== 'undefined' ? window : globalThis);
