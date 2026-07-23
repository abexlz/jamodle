/**
 * Daily quest bonus wheel modal — spin animation and prize reveal.
 */
(function (global) {
  'use strict';

  const WS = () => global.WheelService;

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function prizeLabel(prize) {
    if (!prize) return '';
    return t(`wheel.prizes.${prize.id}`);
  }

  function buildWheelSvg() {
    const prizes = WS()?.PRIZES || [];
    const n = prizes.length;
    const slice = 360 / n;
    const r = 100;
    const cx = 110;
    const cy = 110;

    const segments = prizes.map((prize, i) => {
      const start = (i * slice - 90) * (Math.PI / 180);
      const end = ((i + 1) * slice - 90) * (Math.PI / 180);
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = slice > 180 ? 1 : 0;
      const mid = ((i + 0.5) * slice - 90) * (Math.PI / 180);
      const tx = cx + r * 0.62 * Math.cos(mid);
      const ty = cy + r * 0.62 * Math.sin(mid);
      return `
        <path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z"
          fill="${prize.color}" stroke="#fff" stroke-width="2"/>
        <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle"
          font-size="16" transform="rotate(${i * slice + slice / 2}, ${tx}, ${ty})">${prize.icon}</text>
      `;
    }).join('');

    return `
      <svg class="wheel-svg" viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="var(--heading, #7B8FD4)" opacity="0.15"/>
        ${segments}
        <circle cx="${cx}" cy="${cy}" r="18" fill="var(--card, #fff)" stroke="var(--heading, #7B8FD4)" stroke-width="3"/>
      </svg>
    `;
  }

  function closeOverlay(overlay) {
    overlay.classList.remove('visible');
    document.body.classList.remove('wheel-open');
    setTimeout(() => overlay.remove(), 320);
  }

  function getWheelStatus() {
    const snap = global.QuestService?.getQuestSnapshot?.() || { daily: [], dailyWheelClaimed: false };
    const profile = global.ProfileService?.loadProfile?.();
    if (snap.dailyWheelClaimed) {
      return { status: 'claimed', snap, profile };
    }
    if (WS()?.isDailyWheelAvailable?.(profile)) {
      return { status: 'ready', snap, profile };
    }
    const doneCount = (snap.daily || []).filter((q) => q.progress >= q.target).length;
    return {
      status: 'locked',
      snap,
      profile,
      doneCount,
      total: (snap.daily || []).length,
    };
  }

  function statusMessage(statusInfo) {
    if (statusInfo.status === 'claimed') return t('wheel.claimedDesc');
    if (statusInfo.status === 'ready') return t('wheel.readyDesc');
    return t('wheel.lockedDesc', {
      done: statusInfo.doneCount || 0,
      total: statusInfo.total || 0,
    });
  }

  function showResultInRoot(root, result, options) {
    const panel = root.classList?.contains('wheel-panel') ? root : (root.querySelector?.('.wheel-panel') || root);
    const prize = result.prize;
    panel.innerHTML = `
      <div class="wheel-reveal">
        <span class="wheel-reveal-icon" aria-hidden="true">${prize.icon}</span>
        <h2 class="wheel-reveal-title">${escapeHtml(t('wheel.wonTitle'))}</h2>
        <p class="wheel-reveal-prize">${escapeHtml(prizeLabel(prize))}</p>
        <button type="button" class="wheel-done-btn" id="wheel-done-btn">${escapeHtml(t('wheel.continue'))}</button>
      </div>
    `;
    global.I18n?.applyToDocument?.(panel);
    panel.querySelector('#wheel-done-btn')?.addEventListener('click', () => {
      const pageRoot = options?.pageRoot || document.getElementById('wheel-page-root');
      if (pageRoot) mountPage(pageRoot);
      else if (options?.overlay) closeOverlay(options.overlay);
    });
  }

  function runSpin(root, wheelEl, btn, options) {
    if (options?.overlay?.dataset.spinning === '1' || root.dataset.spinning === '1') return;
    if (options?.overlay) options.overlay.dataset.spinning = '1';
    root.dataset.spinning = '1';
    btn.disabled = true;

    const result = WS()?.claimSpin?.();
    if (!result?.ok) {
      if (options?.overlay) options.overlay.dataset.spinning = '0';
      root.dataset.spinning = '0';
      btn.disabled = false;
      if (options?.overlay) closeOverlay(options.overlay);
      else if (options?.pageRoot) mountPage(options.pageRoot);
      return;
    }

    const rotation = result.rotation || 1800;
    wheelEl.style.transition = 'transform 4.2s cubic-bezier(0.15, 0.85, 0.25, 1)';
    wheelEl.style.transform = `rotate(${rotation}deg)`;

    setTimeout(() => {
      root.dataset.spinning = '0';
      showResultInRoot(root, result, options);
      global.PlayerHud?.refresh?.();
      updateMenuWheelNav();
      const menuRoot = document.getElementById('menu-root');
      if (menuRoot) global.QuestUI?.refreshSection?.(menuRoot);
    }, 4400);
  }

  function renderWheelPanel(statusInfo, { compact } = {}) {
    const claimed = statusInfo.status === 'claimed';
    const ready = statusInfo.status === 'ready';
    const spinLabel = claimed ? t('wheel.claimed') : ready ? t('wheel.spin') : t('wheel.locked');
    const spinDisabled = !ready;
    const stateClass = claimed ? ' is-claimed' : ready ? ' is-ready' : ' is-locked';

    return `
      <div class="wheel-panel${stateClass}${compact ? ' wheel-panel--compact' : ''}">
        <h2 class="wheel-title">${escapeHtml(compact ? t('wheel.title') : t('wheel.pageTitle'))}</h2>
        <p class="wheel-sub" id="wheel-status-msg">${escapeHtml(statusMessage(statusInfo))}</p>
        <div class="wheel-stage${claimed ? ' wheel-stage--claimed' : ''}">
          <div class="wheel-pointer" aria-hidden="true">▼</div>
          <div class="wheel-disc" id="wheel-disc">${buildWheelSvg()}</div>
        </div>
        <button type="button" class="wheel-spin-btn" id="wheel-spin-btn"${spinDisabled ? ' disabled' : ''}>${escapeHtml(spinLabel)}</button>
        ${!compact ? `<a class="wheel-quests-link" href="index.html?tab=quests">${escapeHtml(t('wheel.goQuests'))}</a>` : ''}
      </div>
    `;
  }

  function bindWheelPanel(root, options) {
    const wheelEl = root.querySelector('#wheel-disc');
    const spinBtn = root.querySelector('#wheel-spin-btn');
    spinBtn?.addEventListener('click', () => {
      if (spinBtn.disabled) return;
      runSpin(root, wheelEl, spinBtn, options);
    });
  }

  function mountPage(rootEl, options) {
    if (!rootEl) return false;
    global.QuestService?.getQuestSnapshot?.();
    const statusInfo = getWheelStatus();
    rootEl.innerHTML = renderWheelPanel(statusInfo);
    global.I18n?.applyToDocument?.(rootEl);
    const panel = rootEl.querySelector('.wheel-panel');
    const spinOptions = { pageRoot: rootEl };
    bindWheelPanel(panel || rootEl, spinOptions);
    if (options?.autoSpin) {
      const spinBtn = panel?.querySelector('#wheel-spin-btn');
      const wheelEl = panel?.querySelector('#wheel-disc');
      setTimeout(() => {
        if (spinBtn && !spinBtn.disabled) runSpin(panel, wheelEl, spinBtn, spinOptions);
      }, 420);
    }
    return true;
  }

  function updateMenuWheelNav() {
    const btn = document.getElementById('menu-wheel-nav');
    if (!btn) return;
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    const ready = WS()?.isDailyWheelAvailable?.(profile);
    const snap = global.QuestService?.getQuestSnapshot?.();
    const claimed = snap?.dailyWheelClaimed;
    btn.classList.toggle('is-ready', !!ready);
    btn.classList.toggle('is-claimed', !!claimed && !ready);
    let badge = btn.querySelector('.menu-wheel-nav-badge');
    if (ready) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'menu-wheel-nav-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.textContent = '!';
    } else if (badge) {
      badge.remove();
    }
  }

  function show(options) {
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    const ready = WS()?.isDailyWheelAvailable?.(profile);
    const suffix = options?.autoSpin && ready ? '?spin=1' : '';
    window.location.href = `wheel.html${suffix}`;
    return true;
  }

  function tryShow() {
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    if (!WS()?.isDailyWheelAvailable?.(profile)) return false;
    window.location.href = 'wheel.html?spin=1';
    return true;
  }

  global.WheelUI = { show, tryShow, mountPage, updateMenuWheelNav };
})(typeof window !== 'undefined' ? window : globalThis);
