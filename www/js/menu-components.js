/**
 * Reusable menu card renderers — return HTML strings from structured config + live status.
 */
(function (global) {
  'use strict';

  const DEV = '[Jamodeul]';

  const MP = () => {
    if (!global.MenuProgress) {
      console.warn(`${DEV} MenuProgress unavailable — using empty progress`);
      return {
        getDailyWordleProgress: () => '',
        isDailyWordleComplete: () => false,
        getDailyMatchProgress: () => '',
        isDailyMatchComplete: () => false,
        isHardModeUnlocked: () => false,
        getHardModeUnlockHint: () => '',
        getFeaturedProgress: () => ({
          progressLine: '',
          href: 'match.html',
        }),
      };
    }
    return global.MenuProgress;
  };

  const MC = () => {
    if (!global.MenuConfig?.MENU) {
      console.warn(`${DEV} MenuConfig unavailable — menu sections empty`);
      return {
        MENU: {
          dailyChallenges: [],
          sections: [],
        },
      };
    }
    return global.MenuConfig;
  };

  const t = (key, vars) => global.I18n?.t(key, vars) ?? '';

  function modeText(mode, field) {
    const key = `menu.modes.${mode.id}.${field}`;
    const val = t(key);
    if (val) return val;
    return mode[field] || '';
  }

  function showKoSupport() {
    return global.UserPreferences?.shouldShowKoreanSupport?.() !== false;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Section heading with optional Korean support line. */
  function SectionHeader({ title, titleKo, className = '' }) {
    return `
      <div class="section-header ${className}">
        <h2 class="section-title">${escapeHtml(title)}</h2>
        ${titleKo ? `<p class="section-subtitle">${escapeHtml(titleKo)}</p>` : ''}
      </div>
    `;
  }

  /** Largest hero card — Continue Learning with progress and primary CTA. */
  function FeaturedContinueCard({ title, subtitle, subtitleKo, progressLine, cta, href }) {
    return `
      <article class="featured-continue-card" id="featured-continue-card">
        <div class="featured-continue-body">
          <h2 class="featured-continue-title">${escapeHtml(title)}</h2>
          <p class="featured-continue-subtitle">${escapeHtml(subtitle)}</p>
          ${subtitleKo ? `<p class="featured-continue-ko">${escapeHtml(subtitleKo)}</p>` : ''}
          <p class="featured-continue-progress" id="featured-progress-line">${escapeHtml(progressLine)}</p>
          <a class="featured-continue-cta" id="featured-continue-cta" href="${escapeHtml(href)}">${escapeHtml(cta)}</a>
        </div>
      </article>
    `;
  }

  /** Learn Hangul mode card — optional Recommended highlight. */
  function LearningModeCard(mode) {
    const { id, icon, accent, href, recommended } = mode;
    const title = modeText(mode, 'title');
    const subtitle = modeText(mode, 'subtitle');
    const subtitleKo = showKoSupport() ? modeText(mode, 'subtitleKo') : '';
    const recClass = recommended ? ' is-recommended' : '';
    const label = recommended
      ? `<span class="mode-label mode-label-recommended">${escapeHtml(t('menu.recommended'))}</span>`
      : '';

    return `
      <a class="learning-mode-card accent-${accent}${recClass}" id="menu-${escapeHtml(id)}" href="${escapeHtml(href)}">
        ${label}
        <span class="mode-icon app-btn-icon" aria-hidden="true">${icon}</span>
        <span class="learning-mode-content">
          <span class="mode-name app-btn-title">${escapeHtml(title)}</span>
        </span>
      </a>
    `;
  }

  /** Full-width daily challenge bar — Wordle or Match. */
  function DailyChallengeCard(mode) {
    const { id, icon, accent, progress, href, action, isComplete } = mode;
    const title = modeText(mode, 'title');
    const tag = href ? 'a' : 'button';
    const hrefAttr = href ? ` href="${escapeHtml(href)}"` : '';
    const typeAttr = !href ? ' type="button"' : '';
    const actionAttr = action ? ` data-menu-action="${escapeHtml(action)}"` : '';
    const completeClass = isComplete ? ' is-complete' : '';

    return `
      <${tag} class="daily-challenge-card daily-challenge-bar accent-${accent}${completeClass}" id="menu-${escapeHtml(id)}"${hrefAttr}${typeAttr}${actionAttr}>
        <span class="mode-icon app-btn-icon" aria-hidden="true">${icon}</span>
        <span class="daily-challenge-content">
          <span class="mode-name app-btn-title">${escapeHtml(title)}</span>
          <span id="${escapeHtml(id)}-status" hidden>${escapeHtml(progress)}</span>
        </span>
      </${tag}>
    `;
  }

  /** Word game card — practice modes in the lower section. */
  function WordGameCard(mode) {
    const { id, icon, accent, action } = mode;
    const title = modeText(mode, 'title');
    const subtitle = modeText(mode, 'subtitle');
    const subtitleKo = showKoSupport() ? modeText(mode, 'subtitleKo') : '';
    return `
      <button class="learning-mode-card word-game-card accent-${accent}" id="menu-${escapeHtml(id)}" type="button" data-menu-action="${escapeHtml(action)}">
        <span class="mode-icon app-btn-icon" aria-hidden="true">${icon}</span>
        <span class="learning-mode-content">
          <span class="mode-name app-btn-title">${escapeHtml(title)}</span>
        </span>
      </button>
    `;
  }

  function LockedModeCard(mode) {
    const { id, icon, accent, action, locked, unlockHint } = mode;
    const title = modeText(mode, 'title');
    const subtitle = modeText(mode, 'subtitle');
    const subtitleKo = showKoSupport() ? modeText(mode, 'subtitleKo') : '';
    const lockLabel = modeText(mode, 'lockLabel') || mode.lockLabel || '';
    const lockedClass = locked ? ' is-locked' : '';
    const lockBadge = locked ? `<span class="mode-lock-badge">${escapeHtml(lockLabel)}</span>` : '';
    const hint = locked && unlockHint ? `<span class="mode-unlock-hint">${escapeHtml(unlockHint)}</span>` : '';
    const disabledAttr = locked ? ' aria-disabled="true" tabindex="-1"' : '';

    return `
      <button class="learning-mode-card word-game-card accent-${accent}${lockedClass}" id="menu-${escapeHtml(id)}" type="button" data-menu-action="${escapeHtml(action)}"${disabledAttr}>
        ${lockBadge}
        <span class="mode-icon app-btn-icon" aria-hidden="true">${locked ? '🔒' : icon}</span>
        <span class="learning-mode-content">
          <span class="mode-name app-btn-title">${escapeHtml(title)}</span>
        </span>
      </button>
    `;
  }

  function renderMenuTop() {
    const top = MC().MENU.menuTop || [];
    const classic = top.find((m) => m.id === 'classic');
    const daily = top.find((m) => m.id === 'daily-match');
    if (!classic && !daily) return '';

    const classicTitle = classic ? modeText(classic, 'title') : '';
    const dailyTitle = daily ? modeText(daily, 'title') : '';
    const dailyProgress = daily ? MP().getDailyMatchProgress() : '';
    const dailyComplete = daily ? MP().isDailyMatchComplete() : false;

  const classicHtml = classic ? `
      <a class="menu-top-classic daily-challenge-card daily-challenge-bar word-game-bar accent-${classic.accent}" id="menu-${escapeHtml(classic.id)}" href="${escapeHtml(classic.href)}">
        <span class="menu-top-icon-box" aria-hidden="true">${classic.icon}</span>
        <span class="menu-top-classic-label app-btn-title">${escapeHtml(classicTitle)}</span>
      </a>` : '';

    const dailyHtml = daily ? `
      <button type="button" class="menu-top-daily daily-challenge-card daily-challenge-bar word-game-bar accent-${daily.accent}${dailyComplete ? ' is-complete' : ''}" id="menu-${escapeHtml(daily.id)}" data-menu-action="daily-match">
        <span class="daily-challenge-content">
          <span class="mode-name app-btn-title">${escapeHtml(dailyTitle)}</span>
          <span id="daily-match-status" hidden>${escapeHtml(dailyProgress)}</span>
        </span>
      </button>` : '';

    const leaderboardLabel = escapeHtml(t('menu.leaderboard') || 'Leaderboard');

    return `
      <div class="menu-top-grid daily-challenges-grid">
        <div class="daily-challenge-row menu-top-daily-row">
          <a class="daily-leaderboard-btn" href="leaderboard.html?game=match" aria-label="${leaderboardLabel}">
            <svg class="daily-leaderboard-icon" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <rect x="3" y="13" width="5" height="8" rx="1.5" fill="currentColor"/>
              <rect x="9.5" y="9" width="5" height="12" rx="1.5" fill="currentColor"/>
              <rect x="16" y="5" width="5" height="16" rx="1.5" fill="currentColor"/>
            </svg>
          </a>
          ${dailyHtml}
        </div>
        ${classicHtml}
      </div>
    `;
  }

  /** @deprecated use renderMenuTop */
  function renderDailyChallenges() {
    return renderMenuTop();
  }

  function getRecommendedModeId() {
    const level = global.UserPreferences?.getLearningLevel?.() || 'beginner';
    const map = { beginner: 'hangul-builder', intermediate: 'korean-match', advanced: 'vowel-practice' };
    return map[level] || 'hangul-builder';
  }

  function renderLearnHangul() {
    const section = MC().MENU.sections.find((s) => s.id === 'learn');
    if (!section?.modes?.length) return '';
    const recId = getRecommendedModeId();
    const cards = section.modes.map((mode) => WordGameBar({
      ...mode,
      recommended: mode.id === recId,
    })).join('');
    return `
      <div class="menu-sections learn-tab-section">
        ${SectionHeader({
          title: t('menu.learnHangul'),
          titleKo: showKoSupport() ? section.titleKo : '',
        })}
        <div class="word-games-grid daily-challenges-grid">${cards}</div>
      </div>
    `;
  }

  function renderMainMenu() {
    return `
      <div class="menu-sections">
        ${renderMenuTop()}
        <div class="menu-section-divider" role="presentation" aria-hidden="true"></div>
        ${renderWordGames()}
      </div>
    `;
  }

  function renderShopTab() {
    const shopHtml = global.ShopUI?.renderSection?.() || '';
    return `<div class="menu-sections shop-tab-section">${shopHtml}</div>`;
  }

  /** Word game bar — same horizontal layout as daily challenges. */
  function WordGameBar(mode) {
    const { id, icon, accent, href, action } = mode;
    const title = modeText(mode, 'title');
    const tag = href ? 'a' : 'button';
    const hrefAttr = href ? ` href="${escapeHtml(href)}"` : '';
    const typeAttr = !href ? ' type="button"' : '';
    const actionAttr = action ? ` data-menu-action="${escapeHtml(action)}"` : '';

    return `
      <${tag} class="daily-challenge-card daily-challenge-bar word-game-bar accent-${accent}" id="menu-${escapeHtml(id)}"${hrefAttr}${typeAttr}${actionAttr}>
        <span class="mode-icon app-btn-icon" aria-hidden="true">${icon}</span>
        <span class="daily-challenge-content">
          <span class="mode-name app-btn-title">${escapeHtml(title)}</span>
        </span>
      </${tag}>
    `;
  }

  function renderMultiplayerBar() {
    return `
      <button type="button" class="daily-challenge-card daily-challenge-bar word-game-bar accent-lavender menu-multiplayer-btn" id="menu-multiplayer-btn">
        <span class="mode-icon app-btn-icon" aria-hidden="true">⚔️</span>
        <span class="daily-challenge-content">
          <span class="mode-name app-btn-title" data-i18n="nav.multiplayer">${escapeHtml(t('nav.multiplayer'))}</span>
        </span>
      </button>
    `;
  }

  function shouldShowTutorialMenuEntry() {
    const devAccess = global.DevBuild?.hasDevAccess?.() === true;
    const devMode = global.UserPreferences?.get?.()?.devMode === true;
    return devAccess && devMode;
  }

  function renderTutorialBar() {
    if (!shouldShowTutorialMenuEntry()) return '';
    return `
      <a class="daily-challenge-card daily-challenge-bar word-game-bar accent-yellow menu-tutorial-btn" id="menu-tutorial-btn" href="match-tutorial.html?replay=1">
        <span class="mode-icon app-btn-icon" aria-hidden="true">📘</span>
        <span class="daily-challenge-content">
          <span class="mode-name app-btn-title" data-i18n="menu.tutorialMode">${escapeHtml(t('menu.tutorialMode'))}</span>
        </span>
      </a>
    `;
  }

  function renderWordGames() {
    const section = MC().MENU.sections.find((s) => s.id === 'word-games');
    if (!section?.modes?.length) {
      return `${renderMultiplayerBar()}${renderTutorialBar()}`;
    }
    const cards = section.modes.map((mode) => WordGameBar(mode)).join('');
    return `
      <div class="word-games-grid daily-challenges-grid">
        ${cards}
        ${renderMultiplayerBar()}
        ${renderTutorialBar()}
      </div>
    `;
  }

  function renderFeatured() {
    const progress = MP().getFeaturedProgress();
    return FeaturedContinueCard({
      title: t('menu.continueLearning'),
      subtitle: t('menu.continueSubtitle'),
      subtitleKo: showKoSupport() ? t('app.taglineKo') : '',
      progressLine: progress.progressLine,
      cta: t('menu.continueCta'),
      href: progress.href,
    });
  }

  function renderQuestTab() {
    const questHtml = global.QuestUI?.renderSection?.() || '';
    return `<div class="menu-sections quest-tab-section">${questHtml}</div>`;
  }

  function renderMenu(tab = 'menu') {
    if (tab === 'learn') return renderLearnHangul();
    if (tab === 'shop') return renderShopTab();
    if (tab === 'quests') return renderQuestTab();
    return renderMainMenu();
  }

  /** Update dynamic status lines without full re-render. */
  function refreshStatus() {
    const matchStatus = document.getElementById('daily-match-status');
    if (matchStatus) matchStatus.textContent = MP().getDailyMatchProgress();
  }

  function rerenderMenu() {
    const root = document.getElementById('menu-root');
    const tab = global.MenuApp?.getHomeTab?.() || 'menu';
    if (root) root.innerHTML = renderMenu(tab);
    global.ShopUI?.bindSection?.(root);
    global.QuestUI?.bindSection?.(root);
    global.TutorialOnboardingUI?.mount?.();
    refreshMenuTaglines();
  }

  function refreshMenuTaglines() {
    const tagline = document.querySelector('.menu-tagline');
    const taglineKo = document.querySelector('.menu-tagline-ko');
    if (tagline) tagline.textContent = t('app.tagline');
    if (taglineKo) {
      taglineKo.textContent = showKoSupport() ? t('app.taglineKo') : '';
      taglineKo.style.display = showKoSupport() ? '' : 'none';
    }
  }

  global.MenuComponents = {
    SectionHeader,
    FeaturedContinueCard,
    DailyChallengeCard,
    LearningModeCard,
    WordGameCard,
    LockedModeCard,
    renderMenu,
    refreshStatus,
    rerenderMenu,
    refreshMenuTaglines,
  };
})(typeof window !== 'undefined' ? window : globalThis);
