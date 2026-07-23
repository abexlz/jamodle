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


  function questDesc(questId, target) {
    return t(`quests.defs.${questId}.desc`, { count: target }) || '';
  }

  function renderQuestCard(entry) {
    const def = entry.def || QS()?.getQuestDef?.(entry.questId);
    if (!def) return '';
    const claimable = !entry.claimed && entry.progress >= entry.target;
    const claimed = entry.claimed;
    const pct = Math.min(100, Math.round((entry.progress / entry.target) * 100));
    const tierClass = def.tier === 'weekly' ? ' quest-card--weekly' : '';
    const stateClass = claimable ? ' is-claimable' : (claimed ? ' is-complete' : '');
    const taskText = questDesc(entry.questId, entry.target);
    const progressCurrent = Math.min(entry.progress, entry.target);
    const progressLabel = t('quests.progress', {
      current: progressCurrent,
      target: entry.target,
    });

    let statusHtml = '';
    if (claimable) {
      statusHtml = `<button type="button" class="quest-claim-btn">${escapeHtml(t('quests.claim'))}</button>`;
    } else if (claimed) {
      statusHtml = `<span class="quest-done-badge">${escapeHtml(t('quests.complete'))}</span>`;
    } else {
      statusHtml = `<span class="quest-reward-compact">+${def.xp} XP · 🪙 ${def.coins}</span>`;
    }

    const progressHtml = claimed ? '' : `
          <div class="quest-card-meta">
            <div class="quest-progress" role="progressbar"
              aria-valuemin="0" aria-valuemax="${entry.target}" aria-valuenow="${progressCurrent}">
              <div class="quest-progress-fill" style="width:${pct}%"></div>
            </div>
            <span class="quest-progress-label">${escapeHtml(progressLabel)}</span>
          </div>`;

    return `
      <article class="quest-card${tierClass}${stateClass}" data-quest-id="${escapeHtml(entry.questId)}"${claimable ? ' data-claimable="true"' : ''} aria-label="${escapeHtml(taskText)}">
        <span class="quest-card-icon" aria-hidden="true">${def.icon}</span>
        <div class="quest-card-body">
          <p class="quest-card-task">${escapeHtml(taskText)}</p>
          ${progressHtml}
        </div>
        <div class="quest-card-status">
          ${statusHtml}
        </div>
      </article>
    `;
  }

  function renderQuestList(cardsHtml) {
    const inner = cardsHtml || `<p class="quest-empty">${escapeHtml(t('quests.empty'))}</p>`;
    return `
      <div class="quest-list-scroll">
        <div class="quest-list">${inner}</div>
      </div>
    `;
  }

  function renderWheelChip(snap) {
    const wheelReady = QS()?.isDailyWheelAvailable?.(global.ProfileService?.loadProfile?.());
    const wheelClaimed = snap.dailyWheelClaimed;
    const href = wheelReady ? 'wheel.html?spin=1' : 'wheel.html';
    const label = wheelClaimed
      ? t('wheel.claimed')
      : wheelReady
        ? t('wheel.spin')
        : t('wheel.spinShort');
    const stateClass = wheelClaimed ? ' is-claimed' : (wheelReady ? ' is-ready' : '');
    return `
      <a href="${escapeHtml(href)}" class="quest-wheel-chip${stateClass}" id="quest-wheel-chip">
        <span class="quest-wheel-chip-icon" aria-hidden="true">🎡</span>
        <span class="quest-wheel-chip-label">${escapeHtml(label)}</span>
      </a>
    `;
  }

  function renderRefreshTimer(scope) {
    const ms = QS()?.getRefreshMs?.(scope) ?? 0;
    const time = QS()?.formatRefreshCountdown?.(ms) ?? '00:00:00';
    return `
      <p class="quest-refresh-timer" id="quest-refresh-timer" data-quest-scope-timer="${scope}" aria-live="polite">
        <span class="quest-refresh-timer-icon" aria-hidden="true">⏱</span>
        <span class="quest-refresh-label">${escapeHtml(t('quests.refreshIn'))}</span>
        <time class="quest-refresh-time">${escapeHtml(time)}</time>
        <span class="quest-refresh-tz">${escapeHtml(t('quests.refreshKst'))}</span>
      </p>
    `;
  }

  function renderSection() {
    const snap = QS()?.getQuestSnapshot?.() || { daily: [], weekly: [], dailyWheelClaimed: false };
    const dailyCards = snap.daily.map(renderQuestCard).join('');
    const weeklyCards = snap.weekly.map(renderQuestCard).join('');
    const scope = activeQuestScope;

    return `
      <section class="quest-section" id="quest-section" aria-labelledby="quest-section-heading">
        <div class="quest-section-header">
          <h2 class="quest-section-title" id="quest-section-heading">🎯 ${escapeHtml(t('quests.title'))}</h2>
        </div>

        <div class="quest-scope-bar">
          <div class="quest-scope-switch" role="tablist" aria-label="${escapeHtml(t('quests.title'))}">
            <button type="button" class="quest-scope-btn${scope === 'daily' ? ' is-active' : ''}"
              role="tab" aria-selected="${scope === 'daily'}" data-quest-scope="daily">
              ${escapeHtml(t('quests.scopeDaily'))}
            </button>
            <button type="button" class="quest-scope-btn${scope === 'weekly' ? ' is-active' : ''}"
              role="tab" aria-selected="${scope === 'weekly'}" data-quest-scope="weekly">
              ${escapeHtml(t('quests.scopeWeekly'))}
            </button>
          </div>
          ${scope === 'daily' ? renderWheelChip(snap) : ''}
          ${renderRefreshTimer(scope)}
        </div>

        <div class="quest-scope-panel${scope === 'daily' ? '' : ' hidden'}" data-quest-scope-panel="daily"
          role="tabpanel" aria-labelledby="quest-scope-daily">
          ${renderQuestList(dailyCards)}
        </div>

        <div class="quest-scope-panel${scope === 'weekly' ? '' : ' hidden'}" data-quest-scope-panel="weekly"
          role="tabpanel" aria-labelledby="quest-scope-weekly">
          ${renderQuestList(weeklyCards)}
        </div>
      </section>
    `;
  }

  function refreshSection(root) {
    const section = root?.querySelector('#quest-section') || document.getElementById('quest-section');
    if (!section) return;
    const parent = section.parentElement;
    if (!parent) return;
    stopQuestTimer();
    section.outerHTML = renderSection();
    global.I18n?.applyToDocument?.(parent);
    bindSection(parent);
    updateTabBadge();
  }

  function updateTabBadge() {
    const snap = QS()?.getQuestSnapshot?.();
    const completed = QS()?.countCompleted?.(snap) ?? 0;
    const btn = document.querySelector('[data-home-tab="quests"]');
    if (!btn) return;
    let badge = btn.querySelector('.home-tab-badge');
    if (completed > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'home-tab-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.textContent = String(completed);
    } else if (badge) {
      badge.remove();
    }
    global.WheelUI?.updateMenuWheelNav?.();
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

  function handleQuestClaim(questId) {
    const result = QS()?.claimQuest?.(questId);
    if (!result?.ok) return;
    if (result.rewards?.length) showQuestCompleteToast(result.rewards);
    if (result.wheelAvailable) {
      setTimeout(() => global.WheelUI?.tryShow?.(), result.rewards?.length ? 1200 : 400);
    }
  }

  let activeQuestScope = 'daily';
  let questTimerInterval = null;

  function stopQuestTimer() {
    if (questTimerInterval) {
      clearInterval(questTimerInterval);
      questTimerInterval = null;
    }
  }

  function updateRefreshTimer(root, scope) {
    const section = root?.querySelector('#quest-section') || document.getElementById('quest-section');
    const timerEl = section?.querySelector('#quest-refresh-timer');
    if (!timerEl) return;

    const nextScope = scope || timerEl.dataset.questScopeTimer || activeQuestScope;
    timerEl.dataset.questScopeTimer = nextScope;

    const ms = QS()?.getRefreshMs?.(nextScope) ?? 0;
    const time = QS()?.formatRefreshCountdown?.(ms) ?? '00:00:00';
    const timeEl = timerEl.querySelector('.quest-refresh-time');
    if (timeEl) {
      timeEl.textContent = time;
    } else {
      timerEl.innerHTML = `
        <span class="quest-refresh-timer-icon" aria-hidden="true">⏱</span>
        <span class="quest-refresh-label">${escapeHtml(t('quests.refreshIn'))}</span>
        <time class="quest-refresh-time">${escapeHtml(time)}</time>
        <span class="quest-refresh-tz">${escapeHtml(t('quests.refreshKst'))}</span>
      `;
    }

    if (ms <= 0) {
      refreshSection(root || section?.parentElement);
    }
  }

  function startQuestTimer(root) {
    stopQuestTimer();
    updateRefreshTimer(root, activeQuestScope);
    questTimerInterval = setInterval(() => updateRefreshTimer(root, activeQuestScope), 1000);
  }

  function setQuestScope(scope, root) {
    if (scope !== 'daily' && scope !== 'weekly') return;
    activeQuestScope = scope;

    const section = root?.querySelector('#quest-section') || document.getElementById('quest-section');
    if (!section) return;

    section.querySelectorAll('[data-quest-scope]').forEach((btn) => {
      const active = btn.dataset.questScope === scope;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    section.querySelectorAll('[data-quest-scope-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.questScopePanel !== scope);
    });

    updateRefreshTimer(root || section.parentElement, scope);
  }

  function bindSection(root) {
    const section = root?.querySelector('#quest-section') || document.getElementById('quest-section');
    if (!section) {
      stopQuestTimer();
      updateTabBadge();
      return;
    }

    updateTabBadge();
    startQuestTimer(root);

    const scope = root || document;
    scope.querySelectorAll('[data-quest-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.questScope;
        if (next) setQuestScope(next, scope);
      });
    });

    scope.querySelectorAll('.quest-card[data-claimable="true"]').forEach((card) => {
      const questId = card.dataset.questId;
      card.addEventListener('click', (e) => {
        e.preventDefault();
        if (questId) handleQuestClaim(questId);
      });
    });
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
    stopQuestTimer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
