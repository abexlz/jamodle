/**
 * Home screen battle mode — game pick, multiplayer placeholder, custom friend challenges.
 */
(function (global) {
  'use strict';

  const BATTLE_GAME_KEY = 'jamodeul-battle-game';

  function readStoredBattleGame() {
    try {
      const stored = sessionStorage.getItem(BATTLE_GAME_KEY);
      return stored === 'word-chain' ? 'word-chain' : 'jamodle';
    } catch {
      return 'jamodle';
    }
  }

  function storeBattleGame(game) {
    try {
      sessionStorage.setItem(BATTLE_GAME_KEY, game === 'word-chain' ? 'word-chain' : 'jamodle');
    } catch { /* ignore */ }
  }

  function getSelectedBattleGame() {
    return readStoredBattleGame();
  }

  function setSelectedBattleGame(_root, game) {
    const next = game === 'word-chain' ? 'word-chain' : 'jamodle';
    storeBattleGame(next);
    global.FirebaseSocial?.setMenuBattleGame?.(next);
  }

  function t(key) {
    return global.I18n?.t(key) ?? '';
  }

  function isOverlayOpen(id) {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  }

  function syncMultiplayerOpenClass() {
    const anyOpen = isOverlayOpen('battle-mode-overlay')
      || isOverlayOpen('battle-multiplayer-placeholder')
      || isOverlayOpen('multiplayer-overlay');
    document.body.classList.toggle('multiplayer-open', anyOpen);
  }

  function battleGameLabel(game) {
    if (game === 'word-chain') {
      return t('menu.battle.wordChain') || t('menu.modes.related-words.title') || 'Word Chain';
    }
    return t('menu.battle.jamodle') || t('menu.modes.classic.title') || 'Jamo Game';
  }

  function ensureBattleModeOverlay() {
    let overlay = document.getElementById('battle-mode-overlay');
    if (overlay) return overlay;

    const multiplayerLabel = escapeHtml(t('menu.battle.multiplayer') || 'Random Match');
    const customLabel = escapeHtml(t('menu.battle.custom') || 'Custom');
    const customSub = escapeHtml(t('menu.battle.customSub') || '(face your friends!)');

    overlay = document.createElement('div');
    overlay.id = 'battle-mode-overlay';
    overlay.className = 'multiplayer-overlay battle-mode-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="multiplayer-modal battle-mode-modal">
        <div class="multiplayer-modal-header">
          <h2 class="multiplayer-modal-title" data-battle-mode-title></h2>
          <button type="button" class="multiplayer-close-btn" data-battle-mode-close
            data-i18n-aria="common.close" aria-label="Close">✕</button>
        </div>
        <div class="battle-mode-actions">
          <button type="button" class="daily-challenge-card daily-challenge-bar accent-yellow battle-mode-action-btn" data-battle-action="multiplayer">
            <span class="daily-challenge-content">
              <span class="mode-name app-btn-title">${multiplayerLabel}</span>
            </span>
          </button>
          <button type="button" class="daily-challenge-card daily-challenge-bar accent-yellow battle-mode-action-btn battle-mode-action-btn--custom" data-battle-action="custom">
            <span class="daily-challenge-content">
              <span class="mode-name app-btn-title">${customLabel}</span>
              <span class="app-btn-desc">${customSub}</span>
            </span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeBattleModeOverlay();
    });
    overlay.querySelector('[data-battle-mode-close]')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeBattleModeOverlay();
    });
    overlay.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-battle-action]');
      if (!actionBtn) return;
      e.preventDefault();
      global.SoundEffects?.nav?.();

      const game = overlay.dataset.selectedGame === 'word-chain' ? 'word-chain' : 'jamodle';
      const root = document.getElementById('menu-root');
      setSelectedBattleGame(root, game);
      closeBattleModeOverlay();

      if (actionBtn.dataset.battleAction === 'multiplayer') {
        openPlaceholder();
        return;
      }

      if (actionBtn.dataset.battleAction === 'custom') {
        global.FirebaseSocial?.openBattleCustomPicker?.(game);
      }
    });

    return overlay;
  }

  function openBattleModeOverlay(game) {
    const overlay = ensureBattleModeOverlay();
    overlay.dataset.selectedGame = game === 'word-chain' ? 'word-chain' : 'jamodle';
    const titleEl = overlay.querySelector('[data-battle-mode-title]');
    if (titleEl) titleEl.textContent = battleGameLabel(overlay.dataset.selectedGame);
    overlay.classList.remove('hidden');
    syncMultiplayerOpenClass();
    global.I18n?.applyToDocument?.(overlay);
  }

  function closeBattleModeOverlay() {
    document.getElementById('battle-mode-overlay')?.classList.add('hidden');
    syncMultiplayerOpenClass();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensurePlaceholderOverlay() {
    let overlay = document.getElementById('battle-multiplayer-placeholder');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'battle-multiplayer-placeholder';
    overlay.className = 'multiplayer-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="multiplayer-modal battle-placeholder-modal">
        <div class="multiplayer-modal-header">
          <h2 class="multiplayer-modal-title" data-i18n="menu.battle.multiplayerTitle">${t('menu.battle.multiplayerTitle')}</h2>
          <button type="button" class="multiplayer-close-btn" data-battle-placeholder-close
            data-i18n-aria="common.close" aria-label="Close">✕</button>
        </div>
        <p class="multiplayer-modal-sub battle-placeholder-sub" data-i18n="menu.battle.multiplayerSoon">${t('menu.battle.multiplayerSoon')}</p>
        <button type="button" class="race-btn race-btn--ghost battle-placeholder-ok" data-battle-placeholder-close data-i18n="common.close">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePlaceholder();
    });
    overlay.querySelectorAll('[data-battle-placeholder-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closePlaceholder();
      });
    });
    return overlay;
  }

  function openPlaceholder() {
    const overlay = ensurePlaceholderOverlay();
    overlay.classList.remove('hidden');
    syncMultiplayerOpenClass();
    global.I18n?.applyToDocument?.(overlay);
  }

  function closePlaceholder() {
    document.getElementById('battle-multiplayer-placeholder')?.classList.add('hidden');
    syncMultiplayerOpenClass();
  }

  function bindBattleMode(root) {
    if (!root || root.dataset.battleBound === '1') return;
    root.dataset.battleBound = '1';

    setSelectedBattleGame(root, readStoredBattleGame());

    root.addEventListener('click', (e) => {
      const gameBtn = e.target.closest('[data-battle-game]');
      if (gameBtn) {
        e.preventDefault();
        setSelectedBattleGame(root, gameBtn.dataset.battleGame);
        openBattleModeOverlay(gameBtn.dataset.battleGame);
      }
    });
  }

  function bindMultiplayerAction() {
    const root = document.getElementById('menu-root');
    bindBattleMode(root);
  }

  function mount() {
    bindMultiplayerAction();
    const root = document.getElementById('menu-root');
    if (root) global.I18n?.applyToDocument?.(root);
  }

  global.MultiplayerUI = {
    mount,
    setVisible() { /* battle mode lives inside menu-root */ },
    getSelectedBattleGame: () => getSelectedBattleGame(document.getElementById('menu-root')),
  };
})(typeof window !== 'undefined' ? window : globalThis);
