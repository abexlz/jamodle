/**
 * Dedicated Chest Room page.
 */
(function (global) {
  'use strict';

  async function init() {
    await global.AppBootstrap?.bootstrap?.();
    const root = document.getElementById('chest-room-root');
    const params = new URLSearchParams(global.location.search);
    const autoClaim = params.get('claim') === '1' || params.get('spin') === '1';
    global.ChestRoomUI?.mountPage?.(root, { autoClaim });
    global.I18n?.applyToDocument?.();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
