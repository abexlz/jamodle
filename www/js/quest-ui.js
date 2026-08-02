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
    const claimed = entry.claimed || entry.progress >= entry.target;
    const pct = Math.min(100, Math.round((entry.progress / entry.target) * 100));
    const tierClass = def.tier === 'weekly' ? ' quest-card--weekly' : '';
    const stateClass = claimed ? ' is-complete' : '';
    const taskText = questDesc(entry.questId, entry.target);
    const progressCurrent = Math.min(entry.progress, entry.target);
    const progressLabel = t('quests.progress', {
      current: progressCurrent,
      target: entry.target,
    });
    const displayPct = claimed ? 100 : pct;

    const statusHtml = claimed
      ? `<span class="quest-done-check" aria-label="${escapeHtml(t('quests.complete'))}">✓</span>`
      : `<span class="quest-status-idle" aria-hidden="true"></span>`;

    const hasChest = !!QS()?.questHasChest?.(def);
    const coinIcon = global.CoinIcon?.html?.('coin-icon coin-icon--md') || '🪙';
    const rewardIcon = hasChest
      ? `<img class="quest-reward-chest" src="assets/chests/chest-closed.png" alt="" draggable="false">`
      : coinIcon;
    const chestClass = hasChest ? ' quest-card--chest' : '';
    const rewardAria = hasChest
      ? `${t('quests.chestReward')} · +${def.xp} XP · ${def.coins} ${t('shop.coins')}`
      : `+${def.xp} XP · ${def.coins} ${t('shop.coins')}`;

    return `
      <article class="quest-card${tierClass}${stateClass}${chestClass}" data-quest-id="${escapeHtml(entry.questId)}"${hasChest ? ' data-chest="true"' : ''} aria-label="${escapeHtml(taskText)}">
        <div class="quest-card-quest">
          <p class="quest-card-task">${escapeHtml(taskText)}</p>
          <div class="quest-progress" role="progressbar"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="${displayPct}"
            aria-label="${escapeHtml(progressLabel)}">
            <div class="quest-progress-fill" style="width:${displayPct}%"></div>
            <span class="quest-progress-text">${displayPct}%</span>
          </div>
        </div>
        <div class="quest-card-status">${statusHtml}</div>
        <div class="quest-card-reward" aria-label="${escapeHtml(rewardAria)}">
          <span class="quest-reward-icon" aria-hidden="true">${rewardIcon}</span>
          <span class="quest-reward-amount" aria-hidden="true">${def.coins}</span>
          <span class="quest-reward-xp" aria-hidden="true">+${def.xp} XP</span>
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
      <section class="quest-section" id="quest-section" aria-label="${escapeHtml(t('quests.title'))}">
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
          role="tabpanel">
          ${renderQuestList(dailyCards)}
        </div>

        <div class="quest-scope-panel${scope === 'weekly' ? '' : ' hidden'}" data-quest-scope-panel="weekly"
          role="tabpanel">
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
    const remaining = QS()?.countIncomplete?.(snap) ?? 0;
    const btn = document.querySelector('[data-home-tab="quests"]');
    if (!btn) return;
    let badge = btn.querySelector('.home-tab-badge');
    if (remaining > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'home-tab-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.textContent = String(remaining);
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
          <span class="quest-toast-text">${global.CoinIcon?.format?.(t('quests.rewardToast', { xp: r.xp, coins: r.coins }), 'coin-icon coin-icon--sm') || escapeHtml(t('quests.rewardToast', { xp: r.xp, coins: r.coins }))}</span>
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

  let rewardQueue = Promise.resolve();

  function showChestReward(reward, coinsBefore) {
    return new Promise((resolve) => {
      if (!global.ChestRewardUI?.show) {
        showQuestCompleteToast([reward]);
        resolve();
        return;
      }
      global.ChestRewardUI.show({
        coins: reward.coins,
        xp: reward.xp,
        coinsBefore,
        autoOpen: true,
        onComplete: () => {
          global.PlayerHud?.refresh?.();
          resolve();
        },
      });
    });
  }

  /**
   * Present auto-claimed quest rewards (toasts + auto-opening chests).
   * @param {{ rewards?: Array, coinsBefore?: number, wheelAvailable?: boolean }} result
   */
  function presentAutoRewards(result) {
    if (!result) return;
    const rewards = Array.isArray(result.rewards) ? result.rewards : [];
    const toastRewards = rewards.filter((r) => !r.chest);
    const chestRewards = rewards.filter((r) => r.chest);
    let runningBefore = result.coinsBefore != null
      ? result.coinsBefore
      : Math.max(0, (global.ProfileService?.loadProfile?.()?.coins || 0)
        - rewards.reduce((sum, r) => sum + (r.coins || 0), 0));

    if (toastRewards.length) showQuestCompleteToast(toastRewards);

    rewardQueue = rewardQueue.then(async () => {
      for (const reward of chestRewards) {
        await showChestReward(reward, runningBefore);
        runningBefore += reward.coins || 0;
      }
      global.PlayerHud?.refresh?.();
      if (result.wheelAvailable) {
        await new Promise((r) => setTimeout(r, chestRewards.length || toastRewards.length ? 500 : 350));
        global.WheelUI?.tryShow?.();
      }
    }).catch((err) => {
      console.warn('[QuestUI] presentAutoRewards failed', err);
    });
  }

  let pendingFlushDone = false;

  function flushPendingClaims() {
    if (pendingFlushDone) return null;
    pendingFlushDone = true;
    return QS()?.claimAllPending?.({ deferHud: true, present: true });
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

    // Migrate any old completed-but-unclaimed quests.
    flushPendingClaims();

    updateTabBadge();
    startQuestTimer(root);

    const scope = root || document;
    scope.querySelectorAll('[data-quest-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.questScope;
        if (next) setQuestScope(next, scope);
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
    presentAutoRewards,
    flushPendingClaims,
    scrollToQuests,
    stopQuestTimer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
