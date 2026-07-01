/**
 * Quest tab — daily & weekly quest cards with progress.
 */
(function (global) {
  'use strict';

  const QS = () => global.QuestService;

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

  function questTitle(questId) {
    return t(`quests.defs.${questId}.title`) || questId;
  }

  function questDesc(questId, target) {
    return t(`quests.defs.${questId}.desc`, { count: target }) || '';
  }

  function renderQuestCard(entry) {
    const def = entry.def || QS()?.getQuestDef?.(entry.questId);
    if (!def) return '';
    const done = entry.claimed || entry.progress >= entry.target;
    const pct = Math.min(100, Math.round((entry.progress / entry.target) * 100));
    const tierClass = def.tier === 'weekly' ? ' quest-card--weekly' : '';

    return `
      <article class="quest-card${tierClass}${done ? ' is-complete' : ''}" data-quest-id="${escapeHtml(entry.questId)}">
        <span class="quest-card-icon" aria-hidden="true">${def.icon}</span>
        <div class="quest-card-body">
          <h3 class="quest-card-title">${escapeHtml(questTitle(entry.questId))}</h3>
          <p class="quest-card-desc">${escapeHtml(questDesc(entry.questId, entry.target))}</p>
          <div class="quest-progress" role="progressbar"
            aria-valuemin="0" aria-valuemax="${entry.target}" aria-valuenow="${Math.min(entry.progress, entry.target)}">
            <div class="quest-progress-fill" style="width:${pct}%"></div>
          </div>
          <p class="quest-progress-label">${escapeHtml(t('quests.progress', {
            current: Math.min(entry.progress, entry.target),
            target: entry.target,
          }))}</p>
        </div>
        <div class="quest-card-rewards">
          ${done
            ? `<span class="quest-done-badge">${escapeHtml(t('quests.complete'))}</span>`
            : `<span class="quest-reward">+${def.xp} XP</span>
               <span class="quest-reward">🪙 ${def.coins}</span>`}
        </div>
      </article>
    `;
  }

  function renderSection() {
    const snap = QS()?.getQuestSnapshot?.() || { daily: [], weekly: [] };
    const dailyCards = snap.daily.map(renderQuestCard).join('');
    const weeklyCards = snap.weekly.map(renderQuestCard).join('');

    return `
      <section class="quest-section" id="quest-section" aria-labelledby="quest-section-heading">
        <div class="quest-section-header">
          <h2 class="quest-section-title" id="quest-section-heading">🎯 ${escapeHtml(t('quests.title'))}</h2>
          <p class="quest-section-sub">${escapeHtml(t('quests.subtitle'))}</p>
        </div>

        <h3 class="quest-subsection-title">${escapeHtml(t('quests.dailyTitle'))}</h3>
        <p class="quest-subsection-hint">${escapeHtml(t('quests.dailyHint'))}</p>
        <div class="quest-list">${dailyCards || `<p class="quest-empty">${escapeHtml(t('quests.empty'))}</p>`}</div>

        <h3 class="quest-subsection-title quest-subsection-title--weekly">${escapeHtml(t('quests.weeklyTitle'))}</h3>
        <p class="quest-subsection-hint">${escapeHtml(t('quests.weeklyHint'))}</p>
        <div class="quest-list">${weeklyCards || `<p class="quest-empty">${escapeHtml(t('quests.empty'))}</p>`}</div>
      </section>
    `;
  }

  function refreshSection(root) {
    const section = root?.querySelector('#quest-section') || document.getElementById('quest-section');
    if (!section) return;
    const parent = section.parentElement;
    if (!parent) return;
    section.outerHTML = renderSection();
    global.I18n?.applyToDocument?.(parent);
    updateTabBadge();
  }

  function updateTabBadge() {
    const snap = QS()?.getQuestSnapshot?.();
    const incomplete = QS()?.countIncomplete?.(snap) ?? 0;
    const btn = document.querySelector('[data-home-tab="quests"]');
    if (!btn) return;
    let badge = btn.querySelector('.home-tab-badge');
    if (incomplete > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'home-tab-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.textContent = String(incomplete);
    } else if (badge) {
      badge.remove();
    }
  }

  function showQuestCompleteToast(rewards) {
    if (!rewards?.length) return;
    rewards.forEach((r, i) => {
      setTimeout(() => {
        const existing = document.getElementById('quest-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'quest-toast';
        toast.className = 'quest-toast';
        toast.setAttribute('role', 'status');
        toast.innerHTML = `
          <span class="quest-toast-icon">${r.icon || '🎯'}</span>
          <span class="quest-toast-text">${escapeHtml(t('quests.rewardToast', { xp: r.xp, coins: r.coins }))}</span>
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
          toast.classList.remove('visible');
          setTimeout(() => toast.remove(), 400);
        }, 2800);
      }, i * 900);
    });
  }

  function bindSection(root) {
    updateTabBadge();
  }

  function scrollToQuests() {
    if (global.MenuApp?.setHomeTab) {
      global.MenuApp.setHomeTab('quests');
    }
  }

  global.QuestUI = {
    renderSection,
    bindSection,
    refreshSection,
    updateTabBadge,
    showQuestCompleteToast,
    scrollToQuests,
  };
})(typeof window !== 'undefined' ? window : globalThis);
