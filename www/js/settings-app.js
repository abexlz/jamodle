/**
 * Settings page controller.
 */
(function (global) {
  'use strict';

  const DEV = '[Jamodeul]';
  let mountedRoot = null;
  let i18nUnsub = null;

  const SC = () => global.SettingsComponents;
  const UP = () => global.UserPreferences;
  const I18n = () => global.I18n;
  const MP = () => global.MenuProgress;
  const LS = () => global.LearningStreak;

  function getProgressStats() {
    const progress = MP()?.loadProgress?.() || { wordsLearned: 0, builderWordsCompleted: 0 };
    const streak = LS()?.loadStreak?.() || { currentStreak: 0, longestStreak: 0 };
    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      wordsLearned: progress.wordsLearned,
      matchCompleted: progress.wordsLearned,
      builderCompleted: progress.builderWordsCompleted || 0,
    };
  }

  function renderPage(root) {
    if (!UP() || !I18n() || !SC()) {
      console.error(`${DEV} SettingsApp missing dependencies`);
      return;
    }

    const p = UP().get();
    const SCmp = SC();

    root.innerHTML = `
      <header class="settings-header">
        <a class="settings-back" href="index.html" data-i18n="nav.back">${I18n().t('nav.back')}</a>
        <h1 data-i18n="settings.title">${I18n().t('settings.title')}</h1>
      </header>

      ${SCmp.SettingsSection({
        icon: '🌐',
        titleKey: 'settings.language.title',
        children: SCmp.LanguageSelector({ current: p.language }),
      })}

      ${SCmp.SettingsSection({
        icon: '🎨',
        titleKey: 'settings.appearance.title',
        children: `
          <div class="settings-row settings-row-stack">
            <span class="settings-row-label" data-i18n="settings.appearance.theme">${I18n().t('settings.appearance.theme')}</span>
            ${SCmp.ThemeSelector({ current: p.theme })}
          </div>
          ${SCmp.ToggleSetting({ id: 'pref-reduce-motion', labelKey: 'settings.appearance.reduceMotion', checked: p.reduceMotion })}
        `,
      })}

      ${SCmp.SettingsSection({
        icon: '🔊',
        titleKey: 'settings.sound.title',
        children: `
          ${SCmp.ToggleSetting({ id: 'pref-sound-effects', labelKey: 'settings.sound.effects', checked: p.soundEffects })}
          ${SCmp.ToggleSetting({ id: 'pref-pronunciation', labelKey: 'settings.sound.pronunciation', checked: p.pronunciation })}
          <div class="settings-row settings-row-stack">
            <label class="settings-row-label" for="pref-volume" data-i18n="settings.sound.volume">${I18n().t('settings.sound.volume')}</label>
            <input type="range" id="pref-volume" class="settings-range" min="0" max="100" value="${Math.round(p.volume * 100)}">
          </div>
        `,
      })}

      ${SCmp.SettingsSection({
        icon: '📖',
        titleKey: 'settings.learning.title',
        children: `
          ${SCmp.ToggleSetting({ id: 'pref-english', labelKey: 'settings.learning.englishMeanings', checked: p.showEnglishMeanings })}
          ${SCmp.ToggleSetting({ id: 'pref-korean-support', labelKey: 'settings.learning.koreanSupport', checked: p.showKoreanSupport })}
          ${SCmp.ToggleSetting({ id: 'pref-pronunciation-btn', labelKey: 'settings.learning.pronunciationBtn', checked: p.pronunciationButton })}
          ${SCmp.ToggleSetting({ id: 'pref-beginner-hints', labelKey: 'settings.learning.beginnerHints', checked: p.beginnerHints })}
          ${SCmp.SelectSetting({
            id: 'pref-learning-level',
            labelKey: 'settings.learning.level',
            value: p.learningLevel,
            options: [
              { value: 'beginner', labelKey: 'settings.learning.levelBeginner' },
              { value: 'intermediate', labelKey: 'settings.learning.levelIntermediate' },
              { value: 'advanced', labelKey: 'settings.learning.levelAdvanced' },
            ],
          })}
        `,
      })}

      ${SCmp.SettingsSection({
        icon: '⚔️',
        titleKey: 'settings.multiplayer.title',
        children: `
          ${SCmp.ToggleSetting({
            id: 'pref-turn-autofill',
            labelKey: 'settings.multiplayer.turnAutofillCorrect',
            checked: p.turnAutofillCorrect !== false,
          })}
          <p class="settings-note" data-i18n="settings.multiplayer.turnAutofillHint">${I18n().t('settings.multiplayer.turnAutofillHint')}</p>
        `,
      })}

      ${SCmp.SettingsSection({
        icon: '♿',
        titleKey: 'settings.accessibility.title',
        children: `
          ${SCmp.ToggleSetting({ id: 'pref-reduce-motion-a11y', labelKey: 'settings.accessibility.reduceMotion', checked: p.reduceMotion })}
          ${SCmp.ToggleSetting({ id: 'pref-high-contrast', labelKey: 'settings.accessibility.highContrast', checked: p.highContrast })}
          ${SCmp.ToggleSetting({ id: 'pref-large-text', labelKey: 'settings.accessibility.largeText', checked: p.largeText })}
          ${SCmp.ToggleSetting({ id: 'pref-tap-to-place', labelKey: 'settings.accessibility.tapToPlace', checked: p.tapToPlace })}
        `,
      })}

      ${global.DevBuild?.hasDevAccess?.() ? SCmp.SettingsSection({
        icon: '🛠️',
        titleKey: 'settings.developer.title',
        children: `
          ${SCmp.ToggleSetting({ id: 'pref-dev-mode', labelKey: 'settings.developer.devMode', checked: !!p.devMode })}
          <p class="settings-note" data-i18n="settings.developer.devModeHint">${I18n().t('settings.developer.devModeHint')}</p>
          <div class="settings-actions">
            <a class="btn-soft" href="match-tutorial.html?replay=1" data-i18n="settings.developer.replayTutorial">${I18n().t('settings.developer.replayTutorial')}</a>
          </div>
        `,
      }) : SCmp.SettingsSection({
        icon: '🔐',
        titleKey: 'settings.developer.unlockTitle',
        children: `
          <p class="settings-note" data-i18n="settings.developer.unlockHint">${I18n().t('settings.developer.unlockHint')}</p>
          <div class="settings-row settings-row-stack">
            <label class="settings-row-label" for="dev-access-password" data-i18n="settings.developer.passwordLabel">${I18n().t('settings.developer.passwordLabel')}</label>
            <input type="password" id="dev-access-password" class="settings-select" autocomplete="off" inputmode="numeric">
            <button type="button" class="btn-soft" id="btn-dev-unlock" data-i18n="settings.developer.unlock">${I18n().t('settings.developer.unlock')}</button>
          </div>
          <p class="settings-toast hidden" id="dev-unlock-toast"></p>
        `,
      })}

      ${SCmp.SettingsSection({
        icon: '🔥',
        titleKey: 'settings.progress.title',
        children: `
          <div id="progress-summary-wrap">${SCmp.ProgressSummary({ stats: getProgressStats() })}</div>
          <div class="settings-actions">
            <a class="btn-soft" href="index.html" data-i18n="settings.progress.viewProgress">${I18n().t('settings.progress.viewProgress')}</a>
            <button type="button" class="btn-warn-outline" id="btn-reset-progress" data-i18n="settings.progress.resetProgress">${I18n().t('settings.progress.resetProgress')}</button>
          </div>
        `,
      })}

      ${SCmp.SettingsSection({
        icon: '🛡️',
        titleKey: 'settings.data.title',
        children: `
          <p class="settings-note" data-i18n="settings.data.localNote">${I18n().t('settings.data.localNote')}</p>
          <div class="settings-actions">
            <button type="button" class="btn-soft" id="btn-clear-dict" data-i18n="settings.data.clearDictionary">${I18n().t('settings.data.clearDictionary')}</button>
            <button type="button" class="btn-soft" id="btn-clear-game" data-i18n="settings.data.clearGame">${I18n().t('settings.data.clearGame')}</button>
          </div>
          <p class="settings-toast hidden" id="data-toast"></p>
        `,
      })}

      ${SCmp.SettingsSection({
        icon: 'ℹ️',
        titleKey: 'settings.about.title',
        children: `
          <p class="about-name">${I18n().t('app.name')}</p>
          <p class="about-desc" data-i18n="app.description">${I18n().t('app.description')}</p>
          <p class="about-version"><span data-i18n="settings.about.version">${I18n().t('settings.about.version')}</span>: ${UP().APP_VERSION}</p>
          <p class="about-credit" data-i18n="settings.about.dictionaryCredit">${I18n().t('settings.about.dictionaryCredit')}</p>
          <div class="about-links">
            <span class="about-link-placeholder" data-i18n="settings.about.privacy">${I18n().t('settings.about.privacy')}</span>
            <span class="about-link-placeholder" data-i18n="settings.about.terms">${I18n().t('settings.about.terms')}</span>
            <span class="about-link-placeholder" data-i18n="settings.about.feedback">${I18n().t('settings.about.feedback')}</span>
          </div>
        `,
      })}

      ${SCmp.ConfirmationModal({
        id: 'reset-confirm-modal',
        titleKey: 'settings.progress.resetTitle',
        bodyKey: 'settings.progress.resetBody',
        confirmKey: 'settings.progress.resetConfirm',
        cancelKey: 'settings.progress.resetCancel',
      })}
    `;

    bindEvents(root);
    I18n().applyToDocument(root);
  }

  function bindEvents(root) {
    root.querySelectorAll('.language-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lang = btn.dataset.lang;
        if (I18n()?.setLocale) await I18n().setLocale(lang);
        UP()?.save({ language: lang });
        renderPage(root);
      });
    });

    root.querySelectorAll('.theme-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        UP()?.save({ theme: btn.dataset.theme });
        renderPage(root);
      });
    });

    bindToggle(root, 'pref-reduce-motion', 'reduceMotion', syncReduceMotion);
    bindToggle(root, 'pref-reduce-motion-a11y', 'reduceMotion', syncReduceMotion);
    bindToggle(root, 'pref-sound-effects', 'soundEffects');
    bindToggle(root, 'pref-pronunciation', 'pronunciation');
    bindToggle(root, 'pref-english', 'showEnglishMeanings');
    bindToggle(root, 'pref-korean-support', 'showKoreanSupport');
    bindToggle(root, 'pref-pronunciation-btn', 'pronunciationButton');
    bindToggle(root, 'pref-beginner-hints', 'beginnerHints');
    bindToggle(root, 'pref-high-contrast', 'highContrast');
    bindToggle(root, 'pref-large-text', 'largeText');
    bindToggle(root, 'pref-tap-to-place', 'tapToPlace');
    bindToggle(root, 'pref-turn-autofill', 'turnAutofillCorrect');
    bindToggle(root, 'pref-dev-mode', 'devMode', () => {
      global.MenuComponents?.rerenderMenu?.();
    });

    root.querySelector('#btn-dev-unlock')?.addEventListener('click', () => {
      const input = root.querySelector('#dev-access-password');
      const toast = root.querySelector('#dev-unlock-toast');
      if (input?.value === '1111') {
        UP()?.save({ devAccessUnlocked: true });
        renderPage(root);
        return;
      }
      showToast(toast, I18n().t('settings.developer.wrongPassword'));
    });

    root.querySelector('#dev-access-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') root.querySelector('#btn-dev-unlock')?.click();
    });

    const volume = root.querySelector('#pref-volume');
    volume?.addEventListener('input', () => {
      UP()?.save({ volume: parseInt(volume.value, 10) / 100 });
    });

    const level = root.querySelector('#pref-learning-level');
    level?.addEventListener('change', () => {
      UP()?.save({ learningLevel: level.value });
    });

    const resetBtn = root.querySelector('#btn-reset-progress');
    const modal = root.querySelector('#reset-confirm-modal');
    resetBtn?.addEventListener('click', () => modal?.classList.remove('hidden'));
    modal?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      MP()?.resetAllProgress?.();
      global.TutorialProgress?.resetProgress?.();
      modal.classList.add('hidden');
      const wrap = root.querySelector('#progress-summary-wrap');
      if (wrap) wrap.innerHTML = SC().ProgressSummary({ stats: getProgressStats() });
      I18n()?.applyToDocument?.(wrap);
      showToast(root.querySelector('#data-toast'), I18n().t('settings.progress.resetDone'));
    });

    root.querySelector('#btn-clear-dict')?.addEventListener('click', () => {
      clearDictionaryCache();
      showToast(root.querySelector('#data-toast'), I18n().t('settings.data.clearedDictionary'));
    });

    root.querySelector('#btn-clear-game')?.addEventListener('click', () => {
      clearGameData();
      showToast(root.querySelector('#data-toast'), I18n().t('settings.data.clearedGame'));
    });
  }

  function syncReduceMotion(root, checked) {
    const a = root.querySelector('#pref-reduce-motion-a11y');
    const b = root.querySelector('#pref-reduce-motion');
    if (a) a.checked = checked;
    if (b) b.checked = checked;
  }

  function bindToggle(root, id, prefKey, onSync) {
    const el = root.querySelector(`#${id}`);
    el?.addEventListener('change', () => {
      UP()?.save({ [prefKey]: el.checked });
      onSync?.(root, el.checked);
    });
  }

  function showToast(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2800);
  }

  function clearDictionaryCache() {
    const keys = global.AppStorage
      ? global.AppStorage.getPrefixed('jamodeul-dict-cache-')
      : [];
    if (global.AppStorage) {
      keys.forEach((k) => global.AppStorage.remove(k));
      return;
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('jamodeul-dict-cache-')) localStorage.removeItem(k);
      }
    } catch {}
  }

  function clearGameData() {
    const keep = new Set(['jamodeul-preferences', 'jamodeul-theme']);
    if (global.AppStorage) {
      global.AppStorage.getPrefixed('jamodeul-').forEach((k) => {
        if (!keep.has(k)) global.AppStorage.remove(k);
      });
      return;
    }
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('jamodeul-') && !keep.has(k)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }

  function mount(rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;
    mountedRoot = root;

    if (!i18nUnsub && global.I18n?.onChange) {
      i18nUnsub = global.I18n.onChange(() => {
        if (mountedRoot) renderPage(mountedRoot);
      });
    }

    renderPage(root);
  }

  global.SettingsApp = { mount, getProgressStats };
})(typeof window !== 'undefined' ? window : globalThis);
