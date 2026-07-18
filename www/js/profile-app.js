/**
 * Profile page controller.
 */
(function (global) {
  'use strict';

  let activePanel = 'friends';

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

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
    } catch {
      return '';
    }
  }

  function renderBadges(summary) {
    const earnedMap = new Map((summary.earnedBadges || []).map((b) => [b.id, b]));
    return global.BadgeService.BADGES.map((badge) => {
      const earned = earnedMap.get(badge.id);
      const cls = earned ? 'earned' : 'locked';
      const status = earned
        ? t('profile.badges.earnedOn', { date: formatDate(earned.earnedAt) })
        : t('profile.badges.locked');
      return `
        <div class="badge-card ${cls}" aria-label="${escapeHtml(t(`profile.badges.${badge.id}.name`))} — ${escapeHtml(status)}">
          <span class="badge-card-icon" aria-hidden="true">${badge.icon}</span>
          <span class="badge-card-name">${escapeHtml(t(`profile.badges.${badge.id}.name`))}</span>
          <span class="badge-card-status">${escapeHtml(status)}</span>
        </div>
      `;
    }).join('');
  }

  function renderAvatars(summary) {
    const profile = summary.profile || global.ProfileService?.loadProfile?.() || {};
    const selected = summary.avatarId || 'default';
    return global.BadgeService.AVATAR_UNLOCKS.map((avatar) => {
      const isUnlocked = global.ProfileService?.isAvatarUnlocked?.(profile, avatar.id) ?? false;
      const isSelected = selected === avatar.id;
      return `
        <button type="button" class="avatar-option${isSelected ? ' selected' : ''}"
          data-avatar-id="${escapeHtml(avatar.id)}"
          ${isUnlocked ? '' : 'disabled'}
          aria-label="${escapeHtml(t(`profile.avatars.${avatar.id}`))}"
          aria-pressed="${isSelected}">
          ${avatar.icon}
        </button>
      `;
    }).join('');
  }

  function renderTitles(summary) {
    const profile = summary.profile || global.ProfileService?.loadProfile?.() || {};
    const selected = summary.titleId || global.ProfileService?.getDisplayTitleId?.(profile) || 'hangul-starter';
    const levelTitles = global.LevelUtils?.TITLE_RANGES?.map((r) => r.id).reverse() || [];
    const shopTitleIds = Object.keys(global.ShopService?.TITLES || {});
    const allTitles = [...levelTitles, ...shopTitleIds.filter((id) => !levelTitles.includes(id))];
    return allTitles.map((titleId) => {
      const isUnlocked = global.ProfileService?.isTitleUnlocked?.(profile, titleId) ?? false;
      const isSelected = selected === titleId;
      const shopTitle = global.ShopService?.TITLES?.[titleId];
      const label = shopTitle
        ? t(`shop.titles.${titleId}`)
        : t(`profile.levelTitles.${titleId}`);
      return `
        <button type="button" class="title-option${isSelected ? ' selected' : ''}"
          data-title-id="${escapeHtml(titleId)}"
          ${isUnlocked ? '' : 'disabled'}
          aria-label="${escapeHtml(label)}"
          aria-pressed="${isSelected}">
          ${global.ProfileUI?.renderTitleBanner?.(label) || escapeHtml(label)}
        </button>
      `;
    }).join('');
  }

  function renderFrames(summary) {
    const profile = summary.profile || global.ProfileService?.loadProfile?.() || {};
    const selected = summary.frameId || 'none';
    return global.BadgeService.FRAME_UNLOCKS.map((frame) => {
      const isUnlocked = global.ProfileService?.isFrameUnlocked?.(profile, frame.id) ?? false;
      const isSelected = selected === frame.id;
      const previewIcon = summary.avatarIcon || '🌸';
      return `
        <button type="button" class="frame-option${isSelected ? ' selected' : ''}"
          data-frame-id="${escapeHtml(frame.id)}"
          ${isUnlocked ? '' : 'disabled'}
          aria-label="${escapeHtml(t(`profile.frames.${frame.id}`))}"
          aria-pressed="${isSelected}">
          ${global.ProfileUI?.renderBadgeCard?.({
            avatarIcon: previewIcon,
            frameId: frame.id,
            level: summary.level,
            xpInLevel: 30,
            xpToNext: 100,
            displayTitle: '',
          }, { variant: 'menu' }) || previewIcon}
        </button>
      `;
    }).join('');
  }

  function renderMultiplayerStats(summary) {
    const played = summary.battleGamesPlayed || 0;
    if (!played) {
      return `<p class="profile-empty-note" data-i18n="profile.multiplayer.empty">${t('profile.multiplayer.empty')}</p>`;
    }

    const winRate = summary.battleWinRate != null ? `${summary.battleWinRate}%` : '—';
    const items = [
      { label: t('profile.multiplayer.winRate'), value: winRate },
      { label: t('profile.multiplayer.battles'), value: played },
      { label: t('profile.multiplayer.wins'), value: summary.battleWins || 0 },
      { label: t('profile.multiplayer.losses'), value: summary.battleLosses || 0 },
      { label: t('profile.multiplayer.draws'), value: summary.battleDraws || 0 },
    ];

    return `
      <div class="profile-stats-grid profile-stats-grid--multiplayer">
        ${items.map((item) => `
          <div class="profile-stat">
            <span class="profile-stat-label">${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(String(item.value))}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderStats(summary) {
    const hasActivity = summary.totalXp > 0
      || summary.wordsLearned > 0
      || summary.builderCompleted > 0
      || summary.totalLearningDays > 0;

    if (!hasActivity) {
      return `<p class="profile-empty-note" data-i18n="profile.stats.empty">${t('profile.stats.empty')}</p>`;
    }

    const items = [
      { label: t('profile.stats.totalXp'), value: summary.totalXp },
      { label: t('shop.coins'), value: summary.coins },
      { label: t('profile.stats.level'), value: summary.level },
      { label: t('profile.stats.wordsLearned'), value: summary.uniqueWords },
      { label: t('profile.stats.builder'), value: summary.builderCompleted },
      { label: t('profile.stats.match'), value: summary.matchCompleted },
      { label: t('profile.stats.daily'), value: summary.dailyChallengesCompleted },
      { label: t('profile.stats.currentStreak'), value: `${summary.currentStreak} 🔥` },
      { label: t('profile.stats.longestStreak'), value: summary.longestStreak },
      { label: t('profile.stats.learningDays'), value: summary.totalLearningDays },
    ];

    return `
      <div class="profile-stats-grid">
        ${items.map((item) => `
          <div class="profile-stat">
            <span class="profile-stat-label">${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(String(item.value))}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderRecentWords(summary) {
    if (!summary.recentWords?.length) {
      return `<p class="profile-empty-note">${t('profile.recent.empty')}</p>`;
    }
    return `
      <ul class="profile-recent-list" aria-label="${escapeHtml(t('profile.recent.title'))}">
        ${summary.recentWords.map((w) => `<li>${escapeHtml(w.word)}</li>`).join('')}
      </ul>
    `;
  }

  function renderFriendsPanel(summary) {
    return `
      <div class="profile-panel-block">
        <label class="profile-nickname-label" id="profile-nickname-label" for="profile-name-input" data-i18n="profile.nickname.title">${t('profile.nickname.title')}</label>
        <div class="profile-name-row">
          <input type="text" class="profile-name-input profile-name-input--panel" id="profile-name-input"
            maxlength="16" value="${escapeHtml(summary.displayName)}"
            aria-label="${escapeHtml(t('profile.displayName'))}">
          <button type="button" class="profile-nickname-save" id="profile-nickname-save-btn"
            data-social-action="save-nickname" hidden data-i18n="profile.nickname.save">${t('profile.nickname.save')}</button>
        </div>
        <p class="profile-nickname-hint" id="profile-nickname-hint" hidden data-i18n="profile.nickname.hint">${t('profile.nickname.hint')}</p>
        <div class="profile-social-msg" id="profile-nickname-msg" hidden></div>
      </div>
      <div id="profile-social-root">
        <p class="profile-social-hint" data-i18n="profile.social.loginHint">${t('profile.social.loginHint')}</p>
        <button type="button" class="profile-login-btn" data-social-action="login" data-i18n="profile.social.login">${t('profile.social.login')}</button>
      </div>
    `;
  }

  function renderCosmeticsPanel(summary) {
    return `
      <div class="profile-panel-block">
        <h3 class="profile-panel-subhead" data-i18n="profile.titles.title">${t('profile.titles.title')}</h3>
        <p class="profile-cosmetics-hint" data-i18n="profile.titles.hint">${t('profile.titles.hint')}</p>
        <div class="title-picker" id="title-picker">${renderTitles(summary)}</div>
      </div>
      <div class="profile-panel-block">
        <h3 class="profile-panel-subhead" data-i18n="profile.avatars.title">${t('profile.avatars.title')}</h3>
        <div class="avatar-picker" id="avatar-picker">${renderAvatars(summary)}</div>
      </div>
      <div class="profile-panel-block">
        <h3 class="profile-panel-subhead" data-i18n="profile.frames.title">${t('profile.frames.title')}</h3>
        <p class="profile-cosmetics-hint" data-i18n="profile.frames.hint">${t('profile.frames.hint')}</p>
        <div class="frame-picker" id="frame-picker">${renderFrames(summary)}</div>
      </div>
    `;
  }

  function renderStatsPanel(summary) {
    return `
      <div class="profile-panel-block profile-panel-summary">
        <p class="profile-level-line">${t('profile.levelLine', { level: summary.level, title: summary.displayTitle || summary.levelTitle })}</p>
        <p class="profile-coins-line">🪙 ${summary.coins} ${escapeHtml(t('shop.coins'))}</p>
        <p class="profile-streak-line">${summary.currentStreak > 0
          ? t('profile.streakLine', { days: summary.currentStreak })
          : t('profile.streakStart')}</p>
        <p class="profile-streak-line profile-streak-sub">${t('profile.longestStreak', { days: summary.longestStreak })}</p>
      </div>
      <div class="profile-panel-block">
        <h3 class="profile-panel-subhead" data-i18n="profile.multiplayer.title">${t('profile.multiplayer.title')}</h3>
        <div id="profile-multiplayer-stats-wrap">${renderMultiplayerStats(summary)}</div>
      </div>
      <div class="profile-panel-block">
        <h3 class="profile-panel-subhead" data-i18n="profile.stats.title">${t('profile.stats.title')}</h3>
        <div id="profile-stats-wrap">${renderStats(summary)}</div>
      </div>
      <div class="profile-panel-block">
        <h3 class="profile-panel-subhead" data-i18n="profile.recent.title">${t('profile.recent.title')}</h3>
        ${renderRecentWords(summary)}
      </div>
      <div class="profile-panel-block">
        <h3 class="profile-panel-subhead" data-i18n="profile.badges.title">${t('profile.badges.title')}</h3>
        <div class="badge-grid">${renderBadges(summary)}</div>
      </div>
    `;
  }

  function renderPanelContent(panel, summary) {
    if (panel === 'friends') return renderFriendsPanel(summary);
    if (panel === 'cosmetics') return renderCosmeticsPanel(summary);
    if (panel === 'stats') return renderStatsPanel(summary);
    return '';
  }

  function renderPage(root) {
    const summary = global.ProfileService?.getProfileSummary?.();
    if (!summary) {
      root.innerHTML = `<p>${t('profile.loadError')}</p>`;
      return;
    }

    const panelOpen = !!activePanel;
    const shellClass = activePanel ? ` profile-tabs-shell--${activePanel}` : '';

    root.innerHTML = `
      <header class="settings-header profile-header-nav">
        <a class="settings-back" href="index.html" data-i18n="nav.back">${t('nav.back')}</a>
        <h1 data-i18n="profile.title">${t('profile.title')}</h1>
      </header>

      <section class="profile-hero" aria-label="${escapeHtml(t('profile.headerLabel'))}">
        <div class="profile-hero-card" id="profile-hero-card">
          ${global.ProfileUI?.renderMenuProfileCard?.(summary, { variant: 'hero' }) || ''}
        </div>
        <p class="profile-display-name">${escapeHtml(summary.displayName)}</p>
      </section>

      <div class="profile-tabs-shell${shellClass}">
        <nav class="profile-nav-row" aria-label="${escapeHtml(t('profile.tabs.label'))}">
          <button type="button" class="profile-nav-btn${activePanel === 'friends' ? ' is-active' : ''}"
            data-profile-panel="friends" aria-pressed="${activePanel === 'friends'}">
            <span data-i18n="profile.tabs.friends">${t('profile.tabs.friends')}</span>
          </button>
          <button type="button" class="profile-nav-btn${activePanel === 'cosmetics' ? ' is-active' : ''}"
            data-profile-panel="cosmetics" aria-pressed="${activePanel === 'cosmetics'}">
            <span data-i18n="profile.tabs.cosmetics">${t('profile.tabs.cosmetics')}</span>
          </button>
          <button type="button" class="profile-nav-btn${activePanel === 'stats' ? ' is-active' : ''}"
            data-profile-panel="stats" aria-pressed="${activePanel === 'stats'}">
            <span data-i18n="profile.tabs.stats">${t('profile.tabs.stats')}</span>
          </button>
        </nav>

        <section class="profile-panel${panelOpen ? ' is-open' : ''}" id="profile-panel"
          ${panelOpen ? '' : 'hidden'} aria-live="polite">
          ${renderPanelContent(activePanel, summary)}
        </section>
      </div>
    `;

    bindEvents(root);
    global.I18n?.applyToDocument?.(root);
    if (activePanel === 'friends') {
      global.FirebaseSocial?.initProfile?.('profile-social-root');
    }
  }

  function setPanel(panel) {
    if (panel) activePanel = panel;
  }

  function refreshProfileHero(root, summary) {
    const hero = root.querySelector('#profile-hero-card');
    if (hero && global.ProfileUI?.renderMenuProfileCard) {
      hero.innerHTML = global.ProfileUI.renderMenuProfileCard(summary, { variant: 'hero' });
    }
  }

  function bindEvents(root) {
    root.querySelectorAll('[data-profile-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setPanel(btn.dataset.profilePanel);
        renderPage(root);
      });
    });

    const nameInput = root.querySelector('#profile-name-input');
    const syncNicknameIfOnline = async () => {
      if (!nameInput) return;
      global.ProfileService?.setDisplayName?.(nameInput.value);
      const displayName = root.querySelector('.profile-display-name');
      if (displayName) displayName.textContent = nameInput.value.trim() || t('profile.defaultName');
      if (!global.FirebaseSocial?.getCurrentNickname?.()) return;
      const result = await global.FirebaseSocial.setNickname(nameInput.value);
      const msgEl = document.getElementById('profile-nickname-msg');
      if (!msgEl || !result) return;
      msgEl.hidden = false;
      if (result.ok) {
        msgEl.textContent = t('profile.nickname.saved');
        msgEl.className = 'profile-social-msg ok';
      } else if (result.reason !== 'unchanged') {
        msgEl.textContent = t('profile.nickname.' + result.reason) || t('profile.nickname.error');
        msgEl.className = 'profile-social-msg error';
      }
    };
    nameInput?.addEventListener('change', syncNicknameIfOnline);
    nameInput?.addEventListener('blur', syncNicknameIfOnline);

    root.querySelectorAll('.avatar-option:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.avatarId;
        global.ProfileService?.setAvatarId?.(id);
        const summary = global.ProfileService?.getProfileSummary?.();
        refreshProfileHero(root, summary);
        root.querySelectorAll('.avatar-option').forEach((b) => {
          b.classList.toggle('selected', b.dataset.avatarId === id);
          b.setAttribute('aria-pressed', b.dataset.avatarId === id ? 'true' : 'false');
        });
        root.querySelectorAll('.frame-option').forEach((b) => {
          if (!global.ProfileUI?.renderBadgeCard || !summary) return;
          const fid = b.dataset.frameId;
          b.innerHTML = global.ProfileUI.renderBadgeCard({
            avatarIcon: summary.avatarIcon,
            frameId: fid,
            level: summary.level,
            xpInLevel: summary.xpInLevel,
            xpToNext: summary.xpToNext,
            displayTitle: '',
          }, { variant: 'menu' });
        });
        global.PlayerHud?.refreshMenuProfileNav?.();
      });
    });

    root.querySelectorAll('.frame-option:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const frameId = btn.dataset.frameId;
        global.ProfileService?.setFrameId?.(frameId);
        const summary = global.ProfileService?.getProfileSummary?.();
        refreshProfileHero(root, summary);
        root.querySelectorAll('.frame-option').forEach((b) => {
          b.classList.toggle('selected', b.dataset.frameId === frameId);
          b.setAttribute('aria-pressed', b.dataset.frameId === frameId ? 'true' : 'false');
        });
        global.PlayerHud?.refreshMenuProfileNav?.();
      });
    });

    root.querySelectorAll('.title-option:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const titleId = btn.dataset.titleId;
        global.ProfileService?.setTitleId?.(titleId);
        const summary = global.ProfileService?.getProfileSummary?.();
        refreshProfileHero(root, summary);
        root.querySelectorAll('.title-option').forEach((b) => {
          b.classList.toggle('selected', b.dataset.titleId === titleId);
          b.setAttribute('aria-pressed', b.dataset.titleId === titleId ? 'true' : 'false');
        });
        global.PlayerHud?.refreshMenuProfileNav?.();
      });
    });
  }

  function mount(rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;
    renderPage(root);
    global.I18n?.onChange?.(() => renderPage(root));
  }

  global.ProfileApp = { mount, renderPage };
})(typeof window !== 'undefined' ? window : globalThis);
