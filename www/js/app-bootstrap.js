/**
 * Early boot — theme & accessibility from preferences (inline in <head> on each page).
 * Also used as full bootstrap after scripts load.
 */
(function (global) {
  'use strict';

  const DEV = '[Jamodeul]';

  function readPrefsRaw() {
    if (global.AppStorage) {
      return global.AppStorage.get('jamodeul-preferences', {});
    }
    try {
      const raw = localStorage.getItem('jamodeul-preferences');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /** Call from inline head script before paint */
  function applyEarly() {
    const p = readPrefsRaw();
    let theme = p.theme || localStorage.getItem('jamodeul-theme') || 'system';
    let resolved = theme;
    if (theme === 'system' || (theme !== 'light' && theme !== 'dark')) {
      resolved = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    if (p.reduceMotion) document.documentElement.classList.add('reduce-motion');
    if (p.highContrast) document.documentElement.classList.add('high-contrast');
    if (p.largeText) document.documentElement.classList.add('large-text');
    if (p.tapToPlace) document.documentElement.classList.add('tap-to-place');
    document.documentElement.lang = p.language === 'ko' ? 'ko' : 'en';
  }

  async function bootstrap() {
    const UP = global.UserPreferences;
    const I18n = global.I18n;
    if (!UP || !I18n) {
      console.error(`${DEV} Bootstrap skipped: missing ${!UP ? 'UserPreferences' : ''}${!UP && !I18n ? ' and ' : ''}${!I18n ? 'I18n' : ''}`);
      return;
    }

    const prefs = UP.get();
    await I18n.init(prefs.language);
    UP.applyAll();
    I18n.applyToDocument();

    UP.onChange(() => {
      I18n.setLocale(UP.get().language);
    });

    I18n.onChange(() => {
      if (global.MenuApp?.refreshMenu) global.MenuApp.refreshMenu();
      if (global.MenuComponents?.rerenderMenu) global.MenuComponents.rerenderMenu();
      if (global.MenuComponents?.refreshMenuTaglines) global.MenuComponents.refreshMenuTaglines();
      I18n.applyToDocument();
    });
  }

  global.AppBootstrap = { applyEarly, bootstrap };
})(typeof window !== 'undefined' ? window : globalThis);
