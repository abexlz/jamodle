/**
 * Profile page controller.
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
    const unlocked = new Set(summary.unlockedAvatarIds || ['default']);
    const selected = summary.avatarId || 'default';
    return global.BadgeService.AVATAR_UNLOCKS.map((avatar) => {
      const isUnlocked = unlocked.has(avatar.id);
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

  function renderPage(root) {
    const summary = global.ProfileService?.getProfileSummary?.();
    if (!summary) {
      root.innerHTML = `<p>${t('profile.loadError')}</p>`;
      return;
    }

    root.innerHTML = `
      <header class="settings-header profile-header-nav">
        <a class="settings-back" href="index.html" data-i18n="nav.back">${t('nav.back')}</a>
        <h1 data-i18n="profile.title">${t('profile.title')}</h1>
      </header>

      <section class="profile-header-card" aria-label="${escapeHtml(t('profile.headerLabel'))}">
        <div class="profile-avatar-display" id="profile-avatar-display" aria-hidden="true">${summary.avatarIcon}</div>
        <label class="profile-nickname-label" id="profile-nickname-label" for="profile-name-input" hidden data-i18n="profile.nickname.title">${t('profile.nickname.title')}</label>
        <div class="profile-name-row">
          <input type="text" class="profile-name-input" id="profile-name-input"
            maxlength="16" value="${escapeHtml(summary.displayName)}"
            aria-label="${escapeHtml(t('profile.displayName'))}">
          <button type="button" class="profile-nickname-save" id="profile-nickname-save-btn"
            data-social-action="save-nickname" hidden data-i18n="profile.nickname.save">${t('profile.nickname.save')}</button>
        </div>
        <p class="profile-nickname-hint" id="profile-nickname-hint" hidden data-i18n="profile.nickname.hint">${t('profile.nickname.hint')}</p>
        <div class="profile-social-msg" id="profile-nickname-msg" hidden></div>
        <p class="profile-level-line">${t('profile.levelLine', { level: summary.level, title: summary.levelTitle })}</p>
        <p class="profile-coins-line">🪙 ${summary.coins} ${escapeHtml(t('shop.coins'))}</p>
        ${global.ProfileUI?.renderXpProgressBar?.({
          xpInLevel: summary.xpInLevel,
          xpToNext: summary.xpToNext,
          level: summary.level,
        }) || ''}
        <p class="profile-streak-line">${summary.currentStreak > 0
          ? t('profile.streakLine', { days: summary.currentStreak })
          : t('profile.streakStart')}</p>
        <p class="profile-streak-line profile-streak-sub">${t('profile.longestStreak', { days: summary.longestStreak })}</p>
      </section>

      <section class="profile-section" aria-labelledby="profile-social-heading">
        <h2 id="profile-social-heading">👥 <span data-i18n="profile.social.title">친구</span></h2>
        <div id="profile-social-root">
          <p class="profile-social-hint" data-i18n="profile.social.loginHint">Google 계정으로 로그인하고 친구와 Daily 순위를 비교하세요.</p>
          <button type="button" class="profile-login-btn" data-social-action="login" data-i18n="profile.social.login">Google 로그인</button>
        </div>
      </section>

      <section class="profile-section" aria-labelledby="profile-stats-heading">
        <h2 id="profile-stats-heading">📊 <span data-i18n="profile.stats.title">${t('profile.stats.title')}</span></h2>
        <div id="profile-stats-wrap">${renderStats(summary)}</div>
      </section>

      <section class="profile-section" aria-labelledby="profile-recent-heading">
        <h2 id="profile-recent-heading">📝 <span data-i18n="profile.recent.title">${t('profile.recent.title')}</span></h2>
        ${renderRecentWords(summary)}
      </section>

      <section class="profile-section" aria-labelledby="profile-badges-heading">
        <h2 id="profile-badges-heading">🏅 <span data-i18n="profile.badges.title">${t('profile.badges.title')}</span></h2>
        <div class="badge-grid">${renderBadges(summary)}</div>
      </section>

      <section class="profile-section" aria-labelledby="profile-avatars-heading">
        <h2 id="profile-avatars-heading">🌸 <span data-i18n="profile.avatars.title">${t('profile.avatars.title')}</span></h2>
        <div class="avatar-picker" id="avatar-picker">${renderAvatars(summary)}</div>
      </section>
    `;

    bindEvents(root);
    global.I18n?.applyToDocument?.(root);
    global.FirebaseSocial?.initProfile?.('profile-social-root');
  }

  function bindEvents(root) {
    const nameInput = root.querySelector('#profile-name-input');
    const syncNicknameIfOnline = async () => {
      if (!nameInput) return;
      global.ProfileService?.setDisplayName?.(nameInput.value);
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
        root.querySelector('#profile-avatar-display').textContent =
          global.BadgeService?.getAvatarDef(id)?.icon || '🌸';
        root.querySelectorAll('.avatar-option').forEach((b) => {
          b.classList.toggle('selected', b.dataset.avatarId === id);
          b.setAttribute('aria-pressed', b.dataset.avatarId === id ? 'true' : 'false');
        });
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
