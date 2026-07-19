/**
 * Reusable Settings UI components.
 */
(function (global) {
  'use strict';

  const t = (key, vars) => global.I18n?.t(key, vars) ?? '';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function SettingsField({ labelKey, children, id }) {
    const labelId = id ? `${id}-label` : '';
    return `
      <div class="settings-field">
        <span class="settings-field-label" ${labelId ? `id="${escapeHtml(labelId)}"` : ''} data-i18n="${labelKey}">${escapeHtml(t(labelKey))}</span>
        ${children}
      </div>
    `;
  }

  function SettingsSection({ icon, titleKey, children }) {
    return `
      <section class="settings-section">
        <h2 class="settings-section-title"><span class="settings-icon" aria-hidden="true">${icon}</span> <span data-i18n="${titleKey}">${escapeHtml(t(titleKey))}</span></h2>
        <div class="settings-section-body">${children}</div>
      </section>
    `;
  }

  function ToggleSetting({ id, labelKey, checked, descriptionKey }) {
    return `
      <div class="settings-row">
        <div class="settings-row-label">
          <span data-i18n="${labelKey}">${escapeHtml(t(labelKey))}</span>
          ${descriptionKey ? `<span class="settings-hint" data-i18n="${descriptionKey}">${escapeHtml(t(descriptionKey))}</span>` : ''}
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="${escapeHtml(id)}" ${checked ? 'checked' : ''}>
          <span class="toggle-track" aria-hidden="true"></span>
        </label>
      </div>
    `;
  }

  function SelectSetting({ id, labelKey, options, value }) {
    const opts = options.map((o) =>
      `<option value="${escapeHtml(o.value)}" ${o.value === value ? 'selected' : ''} data-i18n="${o.labelKey}">${escapeHtml(t(o.labelKey))}</option>`
    ).join('');
    return `
      <div class="settings-row settings-row-stack">
        <label class="settings-field-label" for="${escapeHtml(id)}" data-i18n="${labelKey}">${escapeHtml(t(labelKey))}</label>
        <select class="settings-select" id="${escapeHtml(id)}">${opts}</select>
      </div>
    `;
  }

  function LanguageSelector({ current }) {
    const langs = [
      { code: 'en', labelKey: 'settings.language.english' },
      { code: 'ko', labelKey: 'settings.language.korean' },
    ];
    return `
      <div class="language-selector" role="radiogroup" aria-label="${escapeHtml(t('settings.language.title'))}">
        ${langs.map((l) => `
          <button type="button" class="language-option ${current === l.code ? 'selected' : ''}" data-lang="${l.code}" role="radio" aria-checked="${current === l.code}">
            <span data-i18n="${l.labelKey}">${escapeHtml(t(l.labelKey))}</span>
            ${current === l.code ? '<span class="language-check" aria-hidden="true">✓</span>' : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  function ThemeSelector({ current }) {
    const themes = [
      { value: 'light', labelKey: 'settings.appearance.themeLight' },
      { value: 'dark', labelKey: 'settings.appearance.themeDark' },
      { value: 'system', labelKey: 'settings.appearance.themeSystem' },
    ];
    return `
      <div class="theme-selector" role="radiogroup">
        ${themes.map((th) => `
          <button type="button" class="theme-option ${current === th.value ? 'selected' : ''}" data-theme="${th.value}" role="radio" aria-checked="${current === th.value}">
            <span data-i18n="${th.labelKey}">${escapeHtml(t(th.labelKey))}</span>
            ${current === th.value ? '<span class="language-check">✓</span>' : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  function ProgressSummary({ stats }) {
    return `
      <div class="progress-summary">
        <div class="progress-stat"><span class="progress-stat-label" data-i18n="settings.progress.currentStreak">${escapeHtml(t('settings.progress.currentStreak'))}</span><strong>${escapeHtml(String(stats.currentStreak))}</strong></div>
        <div class="progress-stat"><span class="progress-stat-label" data-i18n="settings.progress.longestStreak">${escapeHtml(t('settings.progress.longestStreak'))}</span><strong>${escapeHtml(String(stats.longestStreak))}</strong></div>
        <div class="progress-stat"><span class="progress-stat-label" data-i18n="settings.progress.wordsLearned">${escapeHtml(t('settings.progress.wordsLearned'))}</span><strong>${escapeHtml(String(stats.wordsLearned))}</strong></div>
        <div class="progress-stat"><span class="progress-stat-label" data-i18n="settings.progress.matchCompleted">${escapeHtml(t('settings.progress.matchCompleted'))}</span><strong>${escapeHtml(String(stats.matchCompleted))}</strong></div>
        <div class="progress-stat"><span class="progress-stat-label" data-i18n="settings.progress.builderCompleted">${escapeHtml(t('settings.progress.builderCompleted'))}</span><strong>${escapeHtml(String(stats.builderCompleted))}</strong></div>
      </div>
    `;
  }

  function ConfirmationModal({ id, titleKey, bodyKey, confirmKey, cancelKey, hidden = true }) {
    return `
      <div class="confirm-overlay ${hidden ? 'hidden' : ''}" id="${escapeHtml(id)}" role="dialog" aria-modal="true">
        <div class="confirm-card">
          <h3 data-i18n="${titleKey}">${escapeHtml(t(titleKey))}</h3>
          <p data-i18n="${bodyKey}">${escapeHtml(t(bodyKey))}</p>
          <div class="confirm-actions">
            <button type="button" class="btn-soft" data-action="cancel" data-i18n="${cancelKey}">${escapeHtml(t(cancelKey))}</button>
            <button type="button" class="btn-warn" data-action="confirm" data-i18n="${confirmKey}">${escapeHtml(t(confirmKey))}</button>
          </div>
        </div>
      </div>
    `;
  }

  global.SettingsComponents = {
    SettingsSection,
    SettingsField,
    ToggleSetting,
    SelectSetting,
    LanguageSelector,
    ThemeSelector,
    ProgressSummary,
    ConfirmationModal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
