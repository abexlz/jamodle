/**
 * Dedicated daily bonus wheel page.
 */
(function (global) {
  'use strict';

  async function init() {
    await global.AppBootstrap?.bootstrap?.();
    const root = document.getElementById('wheel-page-root');
    const autoSpin = new URLSearchParams(global.location.search).get('spin') === '1';
    global.WheelUI?.mountPage?.(root, { autoSpin });
    global.I18n?.applyToDocument?.();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
