/**
 * Pause / quit confirmation for solo modes.
 */
(function (global) {
  'use strict';

  const t = (key, vars) => global.I18n?.t(`pauseQuit.${key}`, vars) ?? key;

  let overlay = null;
  let handlers = { onResume: null, onQuit: null, onSaveProgress: null };

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'pause-quit-overlay hidden';
    overlay.id = 'pause-quit-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pause-quit-title');
    overlay.innerHTML = `
      <div class="pause-quit-card">
        <h2 class="pause-quit-title" id="pause-quit-title"></h2>
        <p class="pause-quit-warning" id="pause-quit-warning"></p>
        <div class="pause-quit-actions" id="pause-quit-actions"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) handlers.onResume?.();
    });

    return overlay;
  }

  function renderActions(mode, hasSave) {
    const actions = overlay.querySelector('#pause-quit-actions');
    if (!actions) return;

    const parts = [
      `<button type="button" class="pause-quit-btn pause-quit-btn--resume" data-action="resume">${t('resume')}</button>`,
    ];

    if (hasSave) {
      parts.push(`<button type="button" class="pause-quit-btn pause-quit-btn--save" data-action="save">${t('saveProgress')}</button>`);
    }

    parts.push(`<button type="button" class="pause-quit-btn pause-quit-btn--quit" data-action="quit">${t('quit')}</button>`);
    actions.innerHTML = parts.join('');

    actions.querySelector('[data-action="resume"]')?.addEventListener('click', () => {
      close();
      handlers.onResume?.();
    });
    actions.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      handlers.onSaveProgress?.();
    });
    actions.querySelector('[data-action="quit"]')?.addEventListener('click', () => {
      close();
      handlers.onQuit?.();
    });
  }

  function show(opts = {}) {
    ensureOverlay();
    const onSave = typeof opts.onSaveProgress === 'function'
      ? opts.onSaveProgress
      : (typeof opts.onSaveProgressAd === 'function' ? opts.onSaveProgressAd : null);
    handlers = {
      onResume: typeof opts.onResume === 'function' ? opts.onResume : null,
      onQuit: typeof opts.onQuit === 'function' ? opts.onQuit : null,
      onSaveProgress: onSave,
    };

    const mode = opts.mode === 'wordChain' ? 'wordChain' : 'jamo';
    const streak = Math.max(0, Number(opts.streak) || 0);
    const hasSave = typeof handlers.onSaveProgress === 'function'
      || mode === 'wordChain'
      || opts.offerSave === true;
    const warningKey = typeof opts.warningKey === 'string' && opts.warningKey
      ? opts.warningKey
      : 'streakWarning';
    overlay.querySelector('#pause-quit-title').textContent = t('title');
    const warningEl = overlay.querySelector('#pause-quit-warning');
    if (streak > 0 && hasSave) {
      warningEl.textContent = t('quitLosesStreak', { count: streak });
      warningEl.classList.remove('hidden');
    } else if (streak > 0) {
      warningEl.textContent = t(warningKey, { count: streak });
      warningEl.classList.remove('hidden');
    } else {
      warningEl.textContent = '';
      warningEl.classList.add('hidden');
    }
    renderActions(mode, hasSave);
    overlay.classList.remove('hidden');
  }

  function close() {
    overlay?.classList.add('hidden');
  }

  function isOpen() {
    return overlay && !overlay.classList.contains('hidden');
  }

  function pauseButtonHtml(id, labelKey = 'pauseLabel') {
    const label = t(labelKey);
    return `<button type="button" class="pause-btn" id="${id}" aria-label="${label}">
      <span class="pause-btn-bars" aria-hidden="true"><span></span><span></span></span>
    </button>`;
  }

  global.PauseQuitUI = {
    show,
    close,
    isOpen,
    pauseButtonHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
