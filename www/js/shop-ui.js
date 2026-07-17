/**
 * Shop — inline scroll section (cosmetics + items in one list).
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

  function themeNameKey(themeId) {
    if (themeId === 'deep-sea') return 'deepSea';
    if (themeId === 'dark-hanji') return 'darkHanji';
    return themeId;
  }

  function renderCosmeticsBlock(inv) {
    const selected = inv.selectedCosmeticTheme || 'default';
    const themes = [
      { id: 'default', price: 0 },
      ...Object.values(SS().THEMES),
    ];

    return themes.map((theme) => {
      const owned = theme.id === 'default' || inv.ownedThemes.includes(theme.id);
      const isSelected = selected === theme.id;
      const key = themeNameKey(theme.id);
      const name = t(`shop.themes.${key}`);
      const desc = t(`shop.themes.${key}Desc`);

      let action = '';
      if (theme.id === 'default' || owned) {
        action = `
          <label class="shop-theme-select" title="${escapeHtml(t('shop.applyTheme'))}">
            <input type="radio" name="cosmetic-theme" value="${escapeHtml(theme.id)}"
              ${isSelected ? 'checked' : ''} ${owned ? '' : 'disabled'}
              aria-label="${escapeHtml(t('shop.applyTheme'))}">
          </label>`;
      } else {
        action = `
          <button type="button" class="shop-buy-btn shop-buy-btn--compact" data-buy-theme="${escapeHtml(theme.id)}"
            ${inv.coins >= theme.price ? '' : 'disabled'}>
            🪙 ${theme.price}
          </button>`;
      }

      const ownedBadge = owned && theme.id !== 'default'
        ? `<span class="shop-owned-badge">${escapeHtml(t('shop.owned'))}</span>`
        : '';

      return `
        <article class="shop-item-card shop-theme-card${owned ? ' is-owned' : ''}${isSelected ? ' is-selected' : ''}"
          title="${escapeHtml(desc)}">
          <div class="shop-theme-swatch" data-theme-id="${escapeHtml(theme.id)}" aria-hidden="true"></div>
          <div class="shop-theme-card-foot">
            <span class="shop-item-name">${escapeHtml(name)}</span>
            ${ownedBadge}
            ${action}
          </div>
        </article>
      `;
    }).join('');
  }

  function renderTitlesBlock(inv) {
    return Object.values(SS().TITLES).map((title) => {
      const owned = SS().ownsTitle(title.id);
      const name = t(`shop.titles.${title.id}`);
      const desc = t(`shop.titles.${title.id}Desc`);

      let action = '';
      if (owned) {
        action = `<span class="shop-owned-badge">${escapeHtml(t('shop.owned'))}</span>`;
      } else {
        action = `
          <button type="button" class="shop-buy-btn shop-buy-btn--compact" data-buy-title="${escapeHtml(title.id)}"
            ${inv.coins >= title.price ? '' : 'disabled'}>
            🪙 ${title.price}
          </button>`;
      }

      return `
        <article class="shop-item-card shop-item-card--row shop-cosmetic-card${owned ? ' is-owned' : ''}"
          title="${escapeHtml(desc)}">
          <span class="shop-item-icon" aria-hidden="true">${title.icon}</span>
          <div class="shop-item-main">
            <span class="shop-item-name">${escapeHtml(name)}</span>
          </div>
          ${action}
        </article>
      `;
    }).join('');
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
            🪙 ${frame.price}
          </button>`;
      }

      return `
        <article class="shop-item-card shop-cosmetic-card shop-frame-card${owned ? ' is-owned' : ''}"
          title="${escapeHtml(desc)}">
          <div class="shop-frame-swatch" style="background:${frame.swatch}" aria-hidden="true"></div>
          <div class="shop-item-main">
            <span class="shop-item-name">${escapeHtml(name)}</span>
          </div>
          ${action}
        </article>
      `;
    }).join('');
  }

  function renderItemsBlock(inv) {
    const items = Object.entries(SS().ITEMS).map(([key, item]) => ({ key, ...item }));
    return items.map((item) => {
      const count = item.useHintTokens
        ? (global.HintTokens?.get?.() ?? 0)
        : (inv[item.field] || 0);
      const name = t(`shop.items.${item.key}`);
      const desc = t(`shop.items.${item.key}Desc`);

      return `
        <article class="shop-item-card shop-item-card--row" title="${escapeHtml(desc)}">
          <span class="shop-item-icon" aria-hidden="true">${item.icon}</span>
          <div class="shop-item-main">
            <span class="shop-item-name">${escapeHtml(name)}</span>
            <span class="shop-item-qty">${escapeHtml(t('shop.quantity', { count }))}</span>
          </div>
          <button type="button" class="shop-buy-btn shop-buy-btn--compact" data-buy-item="${escapeHtml(item.key)}"
            ${inv.coins >= item.price ? '' : 'disabled'}
            aria-label="${escapeHtml(t('shop.buy'))} ${escapeHtml(name)}">
            🪙 ${item.price}
          </button>
        </article>
      `;
    }).join('');
  }

  function renderSection() {
    const inv = SS()?.getInventory?.() || {
      coins: 0, ownedThemes: [], extraGuessTokens: 0, selectedCosmeticTheme: 'default',
    };

    return `
      <section class="shop-section" id="shop-section" aria-labelledby="shop-section-heading">
        <div class="shop-section-header">
          <h2 class="shop-section-title" id="shop-section-heading">🛒 ${escapeHtml(t('shop.title'))}</h2>
          <p class="shop-section-balance">${escapeHtml(t('shop.balance'))}: <strong>🪙 ${inv.coins}</strong></p>
        </div>
        <h3 class="shop-subsection-title">${escapeHtml(t('shop.tabCosmetics'))}</h3>
        <div class="shop-item-grid shop-theme-grid">${renderCosmeticsBlock(inv)}</div>
        <h3 class="shop-subsection-title">${escapeHtml(t('shop.tabTitles'))}</h3>
        <div class="shop-item-grid shop-consumables-list">${renderTitlesBlock(inv)}</div>
        <h3 class="shop-subsection-title">${escapeHtml(t('shop.tabFrames'))}</h3>
        <div class="shop-item-grid shop-frame-grid">${renderFramesBlock(inv)}</div>
        <h3 class="shop-subsection-title">${escapeHtml(t('shop.tabItems'))}</h3>
        <div class="shop-item-grid shop-consumables-list">${renderItemsBlock(inv)}</div>
        <p class="shop-msg" id="shop-section-msg" hidden></p>
      </section>
    `;
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

    section.querySelectorAll('[data-buy-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = SS()?.buyTheme?.(btn.dataset.buyTheme);
        if (result?.ok) {
          showMessage(section.closest('.menu-sections') || section, t('shop.purchaseSuccess'), 'ok');
          refreshSection(root);
        } else if (result?.reason === 'insufficient') {
          showMessage(section.closest('.menu-sections') || section, t('shop.insufficientCoins'), 'error');
        }
      });
    });

    section.querySelectorAll('[data-buy-title]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = SS()?.buyTitle?.(btn.dataset.buyTitle);
        if (result?.ok) {
          showMessage(section.closest('.menu-sections') || section, t('shop.purchaseSuccess'), 'ok');
          refreshSection(root);
        } else if (result?.reason === 'insufficient') {
          showMessage(section.closest('.menu-sections') || section, t('shop.insufficientCoins'), 'error');
        }
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

    section.querySelectorAll('input[name="cosmetic-theme"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        SS()?.selectTheme?.(input.value);
        showMessage(section.closest('.menu-sections') || section, t('shop.themeApplied'), 'ok');
        section.querySelectorAll('.shop-theme-card').forEach((card) => {
          card.classList.toggle('is-selected', card.querySelector('input')?.value === input.value);
        });
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
    toast.textContent = t('shop.levelUpCoins', { coins: coinsGranted });
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
