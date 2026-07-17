/**
 * Shared top navigation — settings link with return-url memory.
 */
(function (global) {
  'use strict';

  const DEV = '[Jamodeul]';
  const RETURN_KEY = 'jamodeul-settings-return';

  function currentReturnUrl() {
    const path = global.location.pathname || '';
    const file = path.slice(path.lastIndexOf('/') + 1) || 'index.html';
    return file + (global.location.search || '') + (global.location.hash || '');
  }

  function saveSettingsReturn() {
    try {
      const url = currentReturnUrl();
      if (!url.includes('settings.html')) {
        sessionStorage.setItem(RETURN_KEY, url);
      }
    } catch (e) { /* ignore */ }
  }

  function getSettingsReturnUrl() {
    try {
      const saved = sessionStorage.getItem(RETURN_KEY);
      if (saved && !saved.includes('settings.html')) return saved;
    } catch (e) { /* ignore */ }
    return 'index.html';
  }

  function isSettingsPage() {
    return (global.location.pathname || '').includes('settings.html');
  }

  function wireSettingsLinks(root) {
    const scope = root || document;
    scope.querySelectorAll('a[href="settings.html"], a[href$="/settings.html"]').forEach((link) => {
      if (link.dataset.settingsReturnWired === '1') return;
      link.dataset.settingsReturnWired = '1';
      link.addEventListener('click', () => saveSettingsReturn());
    });
  }

  function wireSettingsBack(root) {
    const scope = root || document;
    const backUrl = getSettingsReturnUrl();
    scope.querySelectorAll('#nav-back, .settings-back').forEach((link) => {
      link.setAttribute('href', backUrl);
    });
  }

  function injectTopNav() {
    if (document.querySelector('.top-nav-actions')) return;

    const nav = document.createElement('div');
    nav.className = 'top-nav-actions';
    nav.innerHTML = `
      <a class="top-nav-btn" href="settings.html" id="nav-settings" data-i18n-aria="nav.settings">⚙️</a>
    `;
    document.body.prepend(nav);
  }

  function initThemeToggle() {
    const UP = global.UserPreferences;
    if (!UP) return;
    UP.applyTheme();
    UP.onChange(() => UP.applyTheme());
  }

  async function initPage(options = {}) {
    if (options.topNav !== false) injectTopNav();
    wireSettingsLinks();
    if (isSettingsPage()) wireSettingsBack();
    initThemeToggle();

    if (global.AppBootstrap?.bootstrap) {
      await global.AppBootstrap.bootstrap();
    } else {
      console.error(`${DEV} AppBootstrap unavailable — check script order (storage → user-preferences → i18n → app-bootstrap)`);
    }

    global.I18n?.applyToDocument?.();
  }

  global.AppNav = {
    injectTopNav,
    initThemeToggle,
    initPage,
    saveSettingsReturn,
    getSettingsReturnUrl,
    wireSettingsLinks,
    wireSettingsBack,
  };
})(typeof window !== 'undefined' ? window : globalThis);
