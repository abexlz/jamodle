/**
 * Home screen multiplayer entry — opens friends picker without visiting profile.
 */
(function (global) {
  'use strict';

  function bindMultiplayerAction() {
    const root = document.getElementById('menu-root');
    if (!root || root.dataset.multiplayerBound === '1') return;
    root.dataset.multiplayerBound = '1';
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('#menu-multiplayer-btn');
      if (!btn) return;
      e.preventDefault();
      global.FirebaseSocial?.openMultiplayerPicker?.();
    });
  }

  function mount() {
    bindMultiplayerAction();
    const btn = document.getElementById('menu-multiplayer-btn');
    if (btn) global.I18n?.applyToDocument?.(btn);
  }

  global.MultiplayerUI = {
    mount,
    setVisible() { /* multiplayer lives inside menu-root word-games list */ },
  };
})(typeof window !== 'undefined' ? window : globalThis);
