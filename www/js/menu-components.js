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
          menuTop: [],
          menuPlay: [],
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

  function renderDailyCalendarBadge() {
    const now = new Date();
    const lang = global.I18n?.getLanguage?.() || document.documentElement.lang || 'en';
    const locale = lang === 'ko' ? 'ko-KR' : 'en-US';
    const month = now.toLocaleDateString(locale, { month: 'short' }).replace(/\./g, '').trim();
    const monthLabel = lang === 'ko' ? month : month.toUpperCase();
    const day = String(now.getDate());
    return `
      <span class="menu-daily-calendar" aria-hidden="true">
        <span class="menu-daily-calendar-sheet">
          <span class="menu-daily-calendar-month">${escapeHtml(monthLabel)}</span>
          <span class="menu-daily-calendar-day">${escapeHtml(day)}</span>
        </span>
      </span>
    `;
  }

  const MENU_MODE_ICONS = {
    jamoGame: 'assets/menu-jamo-game.png',
    wordChain: 'assets/menu-word-chain.png',
  };

  function renderMenuModeIcon(iconKey) {
    const src = MENU_MODE_ICONS[iconKey];
    if (!src) return '';
    return `<img class="menu-mode-icon-img" src="${escapeHtml(src)}" alt="" width="42" height="42" decoding="async" draggable="false">`;
  }

  const MENU_HEADING_BLOSSOM_SVG = `<svg class="menu-mode-heading-blossom-svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="2.2" fill="currentColor"/><ellipse cx="12" cy="6.5" rx="3.2" ry="4.2" fill="currentColor"/><ellipse cx="12" cy="17.5" rx="3.2" ry="4.2" fill="currentColor"/><ellipse cx="6.5" cy="12" rx="4.2" ry="3.2" fill="currentColor"/><ellipse cx="17.5" cy="12" rx="4.2" ry="3.2" fill="currentColor"/></svg>`;

  const MENU_HEADING_CLOUD_SVG = `<svg class="menu-mode-heading-cloud-svg" viewBox="0 0 40 16" width="34" height="14" aria-hidden="true"><path d="M2 10c2-4 6-6 10-5 2-3 7-4 11-1 3 2 4 5 3 8H2z" fill="currentColor" opacity="0.9"/><path d="M6 12c1.5-2.5 4.5-3.5 7-2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.55"/></svg>`;

  function renderMenuSectionHeading(headingId, title, { showClouds = true } = {}) {
    const cloudLeft = showClouds
      ? `<span class="menu-mode-heading-cloud menu-mode-heading-cloud--left" aria-hidden="true">${MENU_HEADING_CLOUD_SVG}</span>`
      : '';
    const cloudRight = showClouds
      ? `<span class="menu-mode-heading-cloud menu-mode-heading-cloud--right" aria-hidden="true">${MENU_HEADING_CLOUD_SVG}</span>`
      : '';
    return `
      <div class="menu-mode-heading-wrap">
        ${cloudLeft}
        <h2 class="menu-mode-heading" id="${escapeHtml(headingId)}">
          <span class="menu-mode-heading-badge">
            ${MENU_HEADING_BLOSSOM_SVG}
            <span class="menu-mode-heading-text">${title}</span>
            ${MENU_HEADING_BLOSSOM_SVG}
          </span>
        </h2>
        ${cloudRight}
      </div>
    `;
  }

  function renderMenuModePanel({ panelClass, headingId, title, bodyHtml, showHeadingClouds = true }) {
    return `
      <div class="menu-mode-panel ${panelClass} daily-challenges-grid">
        ${renderMenuSectionHeading(headingId, title, { showClouds: showHeadingClouds })}
        ${bodyHtml}
      </div>
    `;
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
    const daily = top.find((m) => m.id === 'daily-match');
    if (!daily) return '';

    const dailyTitle = modeText(daily, 'title');
    const dailyProgress = MP().getDailyMatchProgress();
    const dailyComplete = MP().isDailyMatchComplete();
    const leaderboardLabel = escapeHtml(t('menu.leaderboard') || 'Leaderboard');

    return `
      <div class="menu-mode-panel menu-top-panel daily-challenges-grid">
        <div class="daily-challenge-row menu-top-daily-row menu-daily-puzzle-bar${dailyComplete ? ' is-complete' : ''}">
          <a class="daily-leaderboard-btn menu-daily-leaderboard-slot" href="leaderboard.html?game=match" aria-label="${leaderboardLabel}">
            <svg class="daily-leaderboard-icon" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <rect x="3" y="13" width="5" height="8" rx="1.5" fill="currentColor"/>
              <rect x="9.5" y="9" width="5" height="12" rx="1.5" fill="currentColor"/>
              <rect x="16" y="5" width="5" height="16" rx="1.5" fill="currentColor"/>
            </svg>
          </a>
          <button type="button" class="menu-top-daily menu-daily-puzzle-trigger menu-btn-primary daily-challenge-card daily-challenge-bar word-game-bar accent-${daily.accent}" id="menu-${escapeHtml(daily.id)}" data-menu-action="daily-match">
            <span class="daily-challenge-content menu-daily-puzzle-main">
              <span class="mode-name app-btn-title">${escapeHtml(dailyTitle)}</span>
              <span id="daily-match-status" hidden>${escapeHtml(dailyProgress)}</span>
            </span>
          </button>
          ${renderDailyCalendarBadge()}
        </div>
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
        ${renderSinglePlayerSection()}
        ${renderMenuBottom()}
      </div>
    `;
  }

  function renderShopTab() {
    const shopHtml = global.ShopUI?.renderSection?.() || '';
    return `<div class="menu-sections shop-tab-section">${shopHtml}</div>`;
  }

  /** Word game bar — same horizontal layout as daily challenges. */
  function WordGameBar(mode, opts = {}) {
    const { id, icon, accent, href, action } = mode;
    const title = modeText(mode, 'title');
    const tag = href ? 'a' : 'button';
    const hrefAttr = href ? ` href="${escapeHtml(href)}"` : '';
    const typeAttr = !href ? ' type="button"' : '';
    const actionAttr = action ? ` data-menu-action="${escapeHtml(action)}"` : '';
    const categoryClass = opts.category === 'game'
      ? ' menu-btn-game'
      : opts.category === 'primary'
        ? ' menu-btn-primary'
        : '';
    const playClass = opts.playPair ? ' menu-play-game-btn' : '';

    return `
      <${tag} class="daily-challenge-card daily-challenge-bar word-game-bar accent-${accent}${categoryClass}${playClass}" id="menu-${escapeHtml(id)}"${hrefAttr}${typeAttr}${actionAttr}>
        <span class="mode-icon app-btn-icon" aria-hidden="true">${icon}</span>
        <span class="daily-challenge-content">
          <span class="mode-name app-btn-title">${escapeHtml(title)}</span>
        </span>
      </${tag}>
    `;
  }

  function renderWordChainTitle(text) {
    return escapeHtml(String(text || '').trim());
  }

  function renderMenuComboBadge(bestCombo, labelKey = 'match.bestCombo') {
    const count = Math.max(0, Number(bestCombo) || 0);
    const comboLabel = escapeHtml(t('relatedWords.comboLabel') || 'combo');
    return `
      <span class="menu-game-combo" aria-label="${escapeHtml(t(labelKey, { n: count, count }) || `Best combo: ${count}`)}">
        <span class="menu-game-combo-sheet">
          <span class="menu-game-combo-count">${escapeHtml(String(count))}</span>
          <span class="menu-game-combo-label">${comboLabel}</span>
        </span>
      </span>
    `;
  }

  function renderWordChainComboBadge(bestCombo) {
    return renderMenuComboBadge(bestCombo, 'relatedWords.bestCombo');
  }

  function renderSinglePlayerGameButton(mode) {
    const label = escapeHtml(modeText(mode, 'title'));
    const tag = mode.href ? 'a' : 'button';
    const hrefAttr = mode.href ? ` href="${escapeHtml(mode.href)}"` : '';
    const typeAttr = !mode.href ? ' type="button"' : '';
    const actionAttr = mode.action ? ` data-menu-action="${escapeHtml(mode.action)}"` : '';

    if (mode.id === 'related-words') {
      const bestCombo = MP().getWordChainBestCombo?.() || 0;
      return `
        <${tag} class="daily-challenge-card daily-challenge-bar word-game-bar accent-mint menu-single-player-game-btn menu-word-chain-bar menu-game-combo-bar" id="menu-${escapeHtml(mode.id)}"${hrefAttr}${typeAttr}${actionAttr} aria-label="${label}">
          ${renderWordChainComboBadge(bestCombo)}
          <span class="daily-challenge-content menu-word-chain-main">
            <span class="mode-name app-btn-title">${renderWordChainTitle(modeText(mode, 'title'))}</span>
          </span>
        </${tag}>
      `;
    }

    if (mode.id === 'classic') {
      const bestCombo = MP().getMatchBestCombo?.() || 0;
      return `
        <${tag} class="daily-challenge-card daily-challenge-bar word-game-bar accent-${mode.accent} menu-btn-primary menu-jamo-game-btn menu-jamo-game-bar menu-game-combo-bar menu-single-player-game-btn" id="menu-${escapeHtml(mode.id)}"${hrefAttr}${typeAttr}${actionAttr} aria-label="${label}">
          ${renderMenuComboBadge(bestCombo)}
          <span class="daily-challenge-content menu-jamo-game-main">
            <span class="mode-name app-btn-title">${renderWordChainTitle(modeText(mode, 'title'))}</span>
          </span>
        </${tag}>
      `;
    }

    const categoryClass = ' menu-btn-game';
    return `
      <${tag} class="daily-challenge-card daily-challenge-bar word-game-bar accent-${mode.accent}${categoryClass} menu-single-player-game-btn" id="menu-${escapeHtml(mode.id)}"${hrefAttr}${typeAttr}${actionAttr} aria-label="${label}">
        <span class="mode-icon app-btn-icon" aria-hidden="true">${mode.icon || '🎮'}</span>
        <span class="daily-challenge-content">
          <span class="mode-name app-btn-title">${label}</span>
        </span>
      </${tag}>
    `;
  }

  function renderSinglePlayerSection() {
    const playModes = MC().MENU.menuPlay || [];
    if (!playModes.length) return '';

    const title = escapeHtml(t('menu.singlePlayer.title') || 'Single Mode');
    const buttons = playModes.map((mode) => renderSinglePlayerGameButton(mode)).join('');

    return renderMenuModePanel({
      panelClass: 'menu-single-player-grid',
      headingId: 'menu-single-player-heading',
      title,
      bodyHtml: buttons,
    });
  }

  function renderBattleModeSection() {
    const jamodleLabel = escapeHtml(t('menu.battle.jamodle') || t('menu.modes.classic.title') || 'Jamo Game');
    const wordChainLabel = escapeHtml(t('menu.battle.wordChain') || t('menu.modes.related-words.title') || 'Word Chain');
    const title = escapeHtml(t('menu.battle.title') || t('nav.multiplayer') || 'Battle Mode');
    const buttons = `
      <button type="button" class="daily-challenge-card daily-challenge-bar word-game-bar menu-jamo-game-btn menu-battle-game-btn menu-battle-game-bar" data-battle-game="jamodle" aria-label="${jamodleLabel}">
        <span class="menu-battle-icon-slot" aria-hidden="true">
          ${renderMenuModeIcon('jamoGame')}
        </span>
        <span class="menu-battle-label daily-challenge-content">
          <span class="mode-name app-btn-title">${jamodleLabel}</span>
        </span>
      </button>
      <button type="button" class="daily-challenge-card daily-challenge-bar word-game-bar accent-mint menu-battle-game-btn menu-battle-game-bar menu-battle-word-chain-bar" data-battle-game="word-chain" aria-label="${wordChainLabel}">
        <span class="menu-battle-icon-slot" aria-hidden="true">
          ${renderMenuModeIcon('wordChain')}
        </span>
        <span class="menu-battle-label daily-challenge-content">
          <span class="mode-name app-btn-title">${wordChainLabel}</span>
        </span>
      </button>
    `;

    return renderMenuModePanel({
      panelClass: 'menu-battle-grid',
      headingId: 'menu-battle-heading',
      title,
      bodyHtml: buttons,
      showHeadingClouds: false,
    });
  }

  function renderMenuBottom() {
    return renderBattleModeSection();
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
    global.DailyCalendarModal?.updateMenuCalendarNav?.();
  }

  function rerenderMenu() {
    const root = document.getElementById('menu-root');
    const tab = global.MenuApp?.getHomeTab?.() || 'menu';
    if (root) root.innerHTML = renderMenu(tab);
    global.ShopUI?.bindSection?.(root);
    global.QuestUI?.bindSection?.(root);
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
