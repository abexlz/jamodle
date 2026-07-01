/**
 * Shared top navigation — settings link + theme toggle.
 */
(function (global) {
  'use strict';

  const DEV = '[Jamodeul]';

  function injectTopNav() {
    if (document.querySelector('.top-nav-actions')) return;

    const nav = document.createElement('div');
    nav.className = 'top-nav-actions';
    nav.innerHTML = `
      <a class="top-nav-btn" href="profile.html" id="nav-profile" data-i18n-aria="nav.profile">👤</a>
      <a class="top-nav-btn" href="settings.html" id="nav-settings" data-i18n-aria="nav.settings">⚙️</a>
      <button type="button" class="top-nav-btn" id="theme-toggle" data-i18n-aria="common.themeToggle">🌙</button>
    `;
    document.body.prepend(nav);
  }

  function initThemeToggle() {
    const UP = global.UserPreferences;
    if (!UP) {
      console.warn(`${DEV} UserPreferences unavailable — theme toggle disabled`);
      return;
    }

    UP.applyTheme();

    const btn = document.getElementById('theme-toggle');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', () => {
      const resolved = UP.resolveTheme();
      UP.save({ theme: resolved === 'dark' ? 'light' : 'dark' });
    });

    UP.onChange(() => UP.applyTheme());
  }

  async function initPage(options = {}) {
    if (options.topNav !== false) injectTopNav();
    initThemeToggle();

    if (global.AppBootstrap?.bootstrap) {
      await global.AppBootstrap.bootstrap();
    } else {
      console.error(`${DEV} AppBootstrap unavailable — check script order (storage → user-preferences → i18n → app-bootstrap)`);
    }

    global.I18n?.applyToDocument?.();
  }

  global.AppNav = { injectTopNav, initThemeToggle, initPage };
})(typeof window !== 'undefined' ? window : globalThis);
