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

  function showResult(overlay, result) {
    const modal = overlay.querySelector('.wheel-modal');
    const prize = result.prize;
    modal.innerHTML = `
      <div class="wheel-reveal">
        <span class="wheel-reveal-icon" aria-hidden="true">${prize.icon}</span>
        <h2 class="wheel-reveal-title">${escapeHtml(t('wheel.wonTitle'))}</h2>
        <p class="wheel-reveal-prize">${escapeHtml(prizeLabel(prize))}</p>
        <button type="button" class="wheel-done-btn">${escapeHtml(t('wheel.continue'))}</button>
      </div>
    `;
    global.I18n?.applyToDocument?.(modal);
    modal.querySelector('.wheel-done-btn')?.addEventListener('click', () => closeOverlay(overlay));
  }

  function runSpin(overlay, wheelEl, btn) {
    if (overlay.dataset.spinning === '1') return;
    overlay.dataset.spinning = '1';
    btn.disabled = true;

    const result = WS()?.claimSpin?.();
    if (!result?.ok) {
      overlay.dataset.spinning = '0';
      btn.disabled = false;
      closeOverlay(overlay);
      return;
    }

    const rotation = result.rotation || 1800;
    wheelEl.style.transition = 'transform 4.2s cubic-bezier(0.15, 0.85, 0.25, 1)';
    wheelEl.style.transform = `rotate(${rotation}deg)`;

    setTimeout(() => {
      showResult(overlay, result);
      global.PlayerHud?.refresh?.();
      const menuRoot = document.getElementById('menu-root');
      if (menuRoot) global.QuestUI?.refreshSection?.(menuRoot);
    }, 4400);
  }

  function show(options) {
    global.QuestService?.getQuestSnapshot?.();
    const profile = global.ProfileService?.loadProfile?.();
    if (!WS()?.isDailyWheelAvailable?.(profile)) return false;

    const existing = document.getElementById('wheel-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wheel-overlay';
    overlay.className = 'wheel-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="wheel-modal">
        <h2 class="wheel-title">${escapeHtml(t('wheel.title'))}</h2>
        <p class="wheel-sub">${escapeHtml(t('wheel.subtitle'))}</p>
        <div class="wheel-stage">
          <div class="wheel-pointer" aria-hidden="true">▼</div>
          <div class="wheel-disc" id="wheel-disc">${buildWheelSvg()}</div>
        </div>
        <button type="button" class="wheel-spin-btn" id="wheel-spin-btn">${escapeHtml(t('wheel.spin'))}</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('wheel-open');
    global.I18n?.applyToDocument?.(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const wheelEl = overlay.querySelector('#wheel-disc');
    const spinBtn = overlay.querySelector('#wheel-spin-btn');
    spinBtn?.addEventListener('click', () => runSpin(overlay, wheelEl, spinBtn));

    if (options?.autoSpin) {
      setTimeout(() => runSpin(overlay, wheelEl, spinBtn), 380);
    }

    return true;
  }

  function tryShow() {
    return show({ autoSpin: false });
  }

  global.WheelUI = { show, tryShow };
})(typeof window !== 'undefined' ? window : globalThis);
