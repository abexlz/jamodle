/**
 * Level Mode UI — map, level detail, onboarding-required flow.
 */
(function (global) {
  'use strict';

  const t = (key, vars) => global.I18n?.t(key, vars) ?? key;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getQuery() {
    try {
      return new URLSearchParams(global.location.search);
    } catch {
      return new URLSearchParams();
    }
  }

  function isRequiredSession() {
    return getQuery().get('required') === '1';
  }

  function canLeavePage() {
    return !isRequiredSession();
  }

  function getLevelCopy(level) {
    const LP = global.LevelProgram;
    if (LP?.hasCustomCopy?.(level.id)) {
      const keys = LP.customCopyKeys(level.id);
      return {
        title: t(keys.titleKey),
        desc: t(keys.descKey),
      };
    }
    const mechanicName = t(`levelMode.mechanics.${level.mechanic}.name`);
    return {
      title: t('levelMode.levelTitle', { n: level.id, mechanic: mechanicName }),
      desc: t(`levelMode.mechanics.${level.mechanic}.lesson`),
    };
  }

  function renderLevelTile(level) {
    const TP = global.TutorialProgress;
    const LP = global.LevelProgram;
    const completed = TP?.isLevelCompleted?.(level.id);
    const unlocked = TP?.isLevelUnlocked?.(level.id);
    const copy = getLevelCopy(level);
    const icon = LP?.getMechanicIcon?.(level.mechanic) || '•';
    const stateClass = completed ? ' is-complete' : unlocked ? ' is-unlocked' : ' is-locked';
    const tag = unlocked ? 'button' : 'div';
    const typeAttr = unlocked ? ' type="button"' : '';
    const aria = unlocked
      ? ` aria-label="${escapeHtml(copy.title)}"`
      : ' aria-disabled="true"';

    return `
      <${tag} class="level-map-tile${stateClass}" data-level-id="${level.id}"${typeAttr}${aria}>
        <span class="level-map-num">${level.id}</span>
        <span class="level-map-icon" aria-hidden="true">${completed ? '✓' : icon}</span>
        <span class="level-map-title">${escapeHtml(copy.title)}</span>
      </${tag}>
    `;
  }

  function renderMap() {
    const levels = global.LevelProgram?.getAllLevels?.() || [];
    const progress = global.TutorialProgress?.load?.() || {};
    const completed = progress.completedLevels?.length || 0;
    const total = global.LevelProgram?.TOTAL_LEVELS || 30;

    return `
      <div class="level-mode-map">
        <p class="level-mode-progress">${escapeHtml(t('levelMode.progressLine', { done: completed, total }))}</p>
        <div class="level-map-grid" role="list">
          ${levels.map((l) => renderLevelTile(l)).join('')}
        </div>
      </div>
    `;
  }

  function renderLevelDetail(levelId) {
    const level = global.LevelProgram?.getLevel?.(levelId);
    if (!level) return renderMap();

    const copy = getLevelCopy(level);
    const LP = global.LevelProgram;
    const icon = LP?.getMechanicIcon?.(level.mechanic) || '•';
    const completed = global.TutorialProgress?.isLevelCompleted?.(levelId);
    const required = isRequiredSession() && !canLeavePage();
    const backHidden = required ? ' hidden' : '';

    return `
      <article class="level-mode-detail" data-level-id="${levelId}">
        <a class="level-mode-back${backHidden}" href="level-mode.html" data-i18n="levelMode.backToMap">${escapeHtml(t('levelMode.backToMap'))}</a>
        <header class="level-mode-detail-head">
          <span class="level-mode-detail-icon" aria-hidden="true">${icon}</span>
          <div>
            <p class="level-mode-detail-label">${escapeHtml(t('levelMode.levelLabel', { n: levelId }))}</p>
            <h2 class="level-mode-detail-title">${escapeHtml(copy.title)}</h2>
          </div>
        </header>
        <p class="level-mode-detail-desc">${escapeHtml(copy.desc)}</p>
        <div class="level-mode-practice-placeholder" aria-hidden="true">
          <p data-i18n="levelMode.practicePlaceholder">${escapeHtml(t('levelMode.practicePlaceholder'))}</p>
        </div>
        ${completed
          ? `<p class="level-mode-done" data-i18n="levelMode.alreadyComplete">${escapeHtml(t('levelMode.alreadyComplete'))}</p>`
          : `<button type="button" class="level-mode-complete-btn" id="level-complete-btn" data-i18n="levelMode.markComplete">${escapeHtml(t('levelMode.markComplete'))}</button>`}
        ${required && levelId < (global.TutorialProgress?.ONBOARDING_LEVEL_COUNT || 3)
          ? `<p class="level-mode-required-note" data-i18n="levelMode.requiredNote">${escapeHtml(t('levelMode.requiredNote'))}</p>`
          : ''}
      </article>
    `;
  }

  function renderPage() {
    const q = getQuery();
    const levelParam = q.get('level');
    const isTutorial = q.get('tutorial') === '1';
    const required = isRequiredSession();

    const backHref = canLeavePage() ? 'index.html' : undefined;
    const backLink = backHref
      ? `<a class="level-mode-home" href="${backHref}" data-i18n="nav.back">${escapeHtml(t('nav.back'))}</a>`
      : '';

    const subtitle = isTutorial
      ? t('levelMode.tutorialSubtitle')
      : t('levelMode.subtitle');

    const body = levelParam ? renderLevelDetail(parseInt(levelParam, 10)) : renderMap();

    const root = document.getElementById('level-mode-root');
    if (!root) return;

    root.innerHTML = `
      <header class="level-mode-header">
        ${backLink}
        <h1 data-i18n="levelMode.title">${escapeHtml(t('levelMode.title'))}</h1>
        <p class="level-mode-subtitle">${escapeHtml(subtitle)}</p>
        ${required ? `<p class="level-mode-banner" data-i18n="levelMode.onboardingBanner">${escapeHtml(t('levelMode.onboardingBanner'))}</p>` : ''}
      </header>
      ${body}
    `;

    global.I18n?.applyToDocument?.(root);
    bindEvents(root, levelParam);
  }

  function bindEvents(root, activeLevelId) {
    root.querySelectorAll('.level-map-tile.is-unlocked').forEach((tile) => {
      tile.addEventListener('click', () => {
        const id = tile.dataset.levelId;
        const q = isRequiredSession() ? '?required=1&' : '?';
        global.location.href = `level-mode.html${q}level=${id}`;
      });
    });

    root.querySelector('#level-complete-btn')?.addEventListener('click', () => {
      const id = parseInt(activeLevelId, 10);
      if (!id) return;
      global.TutorialProgress?.completeLevel?.(id);
      const onboardingCount = global.TutorialProgress?.ONBOARDING_LEVEL_COUNT || 3;
      const completed = global.TutorialProgress?.getCompletedCount?.() || 0;

      if (completed >= onboardingCount) {
        global.location.href = 'index.html';
        return;
      }
      const next = id + 1;
      const q = isRequiredSession() ? '?required=1&' : '?';
      global.location.href = `level-mode.html${q}level=${next}`;
    });

  }

  function mount() {
    renderPage();
    global.I18n?.onChange?.(() => renderPage());
  }

  global.LevelModeApp = { mount, renderPage, getLevelCopy };
})(typeof window !== 'undefined' ? window : globalThis);
