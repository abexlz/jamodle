/**
 * Home screen battle mode — game pick, random matchmaking, custom friend challenges.
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
      || isOverlayOpen('battle-matchmaking-overlay')
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

      const game = overlay.dataset.selectedGame === 'word-chain' ? 'word-chain' : 'jamodle';
      const root = document.getElementById('menu-root');
      setSelectedBattleGame(root, game);
      closeBattleModeOverlay();

      if (actionBtn.dataset.battleAction === 'multiplayer') {
        openMatchmakingOverlay(game);
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

  function koreanLengthButtonsHtml() {
    const colors = ['mint', 'yellow', 'blue', 'pink', 'purple', 'peach'];
    const lengths = global.MatchWords?.LETTER_LENGTHS || [1, 2, 3, 4, 5, 6];
    return lengths.map((n, i) => {
      const label = t('match.modes.letterCount', { n }) || `${n} letters`;
      return `<button type="button" class="race-opt race-opt--${colors[i % colors.length]}" data-matchmaking-length="${n}" aria-label="${escapeHtml(label)}">${n}</button>`;
    }).join('');
  }

  function ensureMatchmakingOverlay() {
    let overlay = document.getElementById('battle-matchmaking-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'battle-matchmaking-overlay';
    overlay.className = 'multiplayer-overlay battle-matchmaking-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="multiplayer-modal battle-matchmaking-modal">
        <div class="multiplayer-modal-header">
          <h2 class="multiplayer-modal-title" data-i18n="menu.battle.multiplayerTitle">${escapeHtml(t('menu.battle.multiplayerTitle'))}</h2>
          <button type="button" class="multiplayer-close-btn" data-matchmaking-close
            data-i18n-aria="common.close" aria-label="Close">✕</button>
        </div>
        <div class="battle-matchmaking-step" data-matchmaking-step="pick">
          <p class="battle-matchmaking-lead" data-i18n="menu.battle.matchmakingPickLength">${escapeHtml(t('menu.battle.matchmakingPickLength'))}</p>
          <p class="battle-matchmaking-note" data-i18n="menu.battle.matchmakingTurnOnly">${escapeHtml(t('menu.battle.matchmakingTurnOnly'))}</p>
          <div class="race-length-options race-length-options--grid-3 battle-matchmaking-lengths">
            ${koreanLengthButtonsHtml()}
          </div>
        </div>
        <div class="battle-matchmaking-step hidden" data-matchmaking-step="searching">
          <p class="battle-matchmaking-picked" data-matchmaking-picked></p>
          <div class="battle-matchmaking-search" aria-live="polite">
            <div class="battle-matchmaking-spinner" aria-hidden="true"></div>
            <p class="battle-matchmaking-status" data-matchmaking-status data-i18n="menu.battle.matchmakingSearching">${escapeHtml(t('menu.battle.matchmakingSearching'))}</p>
          </div>
          <button type="button" class="race-btn race-btn--ghost battle-matchmaking-cancel" data-matchmaking-cancel data-i18n="menu.battle.matchmakingCancel">${escapeHtml(t('menu.battle.matchmakingCancel'))}</button>
        </div>
        <div class="battle-matchmaking-step hidden" data-matchmaking-step="unsupported">
          <p class="multiplayer-modal-sub" data-i18n="menu.battle.matchmakingTurnOnly">${escapeHtml(t('menu.battle.matchmakingTurnOnly'))}</p>
          <button type="button" class="race-btn race-btn--ghost battle-matchmaking-cancel" data-matchmaking-close data-i18n="common.close">${escapeHtml(t('common.close'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeMatchmakingOverlay();
    });
    overlay.querySelectorAll('[data-matchmaking-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeMatchmakingOverlay();
      });
    });
    overlay.querySelector('[data-matchmaking-cancel]')?.addEventListener('click', (e) => {
      e.preventDefault();
      cancelMatchmakingSearch({ returnToPick: true });
    });
    overlay.querySelector('.battle-matchmaking-lengths')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-matchmaking-length]');
      if (!btn) return;
      e.preventDefault();
      const wordLength = Number(btn.dataset.matchmakingLength);
      if (!wordLength) return;
      startMatchmakingSearch(wordLength);
    });

    return overlay;
  }

  function showMatchmakingStep(overlay, step) {
    overlay.dataset.matchmakingStep = step;
    const modal = overlay.querySelector('.battle-matchmaking-modal');
    modal?.classList.toggle('battle-matchmaking-modal--searching', step === 'searching');
    modal?.classList.toggle('battle-matchmaking-modal--pick', step === 'pick');
    overlay.querySelectorAll('[data-matchmaking-step]').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.matchmakingStep !== step);
    });
    const titleEl = overlay.querySelector('.multiplayer-modal-title');
    if (titleEl) {
      titleEl.textContent = step === 'searching'
        ? (t('menu.battle.matchmakingSearching') || t('menu.battle.multiplayerTitle'))
        : (t('menu.battle.multiplayerTitle') || 'Random Match');
    }
  }

  function resetMatchmakingOverlay(overlay) {
    if (!overlay) return;
    overlay.dataset.selectedLength = '';
    const pickedEl = overlay.querySelector('[data-matchmaking-picked]');
    if (pickedEl) pickedEl.textContent = '';
    showMatchmakingStep(overlay, overlay.dataset.selectedGame === 'word-chain' ? 'unsupported' : 'pick');
  }

  function openMatchmakingOverlay(game) {
    if (!global.FirebaseSocial?.getCurrentUid?.()) {
      alert(t('menu.battle.matchmakingLogin') || 'Sign in to play random matches.');
      global.FirebaseSocial?.whenAuthReady?.().then(() => {
        if (global.FirebaseSocial?.getCurrentUid?.()) openMatchmakingOverlay(game);
      });
      return;
    }

    const overlay = ensureMatchmakingOverlay();
    overlay.dataset.selectedGame = game === 'word-chain' ? 'word-chain' : 'jamodle';
    resetMatchmakingOverlay(overlay);
    overlay.classList.remove('hidden');
    syncMultiplayerOpenClass();
    global.I18n?.applyToDocument?.(overlay);
  }

  async function closeMatchmakingOverlay() {
    await cancelMatchmakingSearch();
    const overlay = document.getElementById('battle-matchmaking-overlay');
    overlay?.classList.add('hidden');
    if (overlay) resetMatchmakingOverlay(overlay);
    syncMultiplayerOpenClass();
  }

  async function cancelMatchmakingSearch(options = {}) {
    try {
      await global.MatchQueueService?.leaveQueue?.();
    } catch (_) { /* ignore */ }
    if (options.returnToPick) {
      const overlay = document.getElementById('battle-matchmaking-overlay');
      if (overlay) resetMatchmakingOverlay(overlay);
    }
  }

  function setMatchmakingStatus(overlay, key) {
    const statusEl = overlay.querySelector('[data-matchmaking-status]');
    if (!statusEl) return;
    statusEl.textContent = t(key);
  }

  async function startMatchmakingSearch(wordLength) {
    const overlay = ensureMatchmakingOverlay();
    const game = overlay.dataset.selectedGame === 'word-chain' ? 'word-chain' : 'jamodle';
    overlay.dataset.selectedLength = String(wordLength);
    const pickedEl = overlay.querySelector('[data-matchmaking-picked]');
    if (pickedEl) {
      pickedEl.textContent = t('match.modes.letterCount', { n: wordLength })
        || `${wordLength} letters`;
    }
    showMatchmakingStep(overlay, 'searching');
    setMatchmakingStatus(overlay, 'menu.battle.matchmakingSearching');
    syncMultiplayerOpenClass();

    if (!global.MatchQueueService?.joinQueue) {
      alert(t('menu.battle.matchmakingFailed'));
      resetMatchmakingOverlay(overlay);
      return;
    }

    try {
      await global.FirebaseSocial?.whenAuthReady?.();
      if (!global.FirebaseSocial?.getCurrentUid?.()) {
        alert(t('menu.battle.matchmakingLogin'));
        resetMatchmakingOverlay(overlay);
        return;
      }

      await global.MatchQueueService.joinQueue({
        game,
        wordLength,
        onMatched: (result) => {
          setMatchmakingStatus(overlay, 'menu.battle.matchmakingFound');
          const url = global.RaceService?.getMatchPageUrl?.(result.matchId, {
            gameType: 'korean-match',
            playMode: 'turn',
          });
          if (url) {
            global.location.href = url;
          }
        },
        onError: () => {
          alert(t('menu.battle.matchmakingFailed'));
          resetMatchmakingOverlay(overlay);
        },
      });
    } catch (err) {
      console.error('[Multiplayer] matchmaking failed', err);
      alert(t('menu.battle.matchmakingFailed'));
      resetMatchmakingOverlay(overlay);
    }
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
    global.addEventListener('pagehide', () => {
      global.MatchQueueService?.leaveQueue?.().catch(() => {});
    });
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
