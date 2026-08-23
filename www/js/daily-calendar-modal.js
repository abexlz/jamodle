/**
 * Daily Match calendar picker modal — choose a date before playing.
 */
(function (global) {
  'use strict';

  const SVC = () => global.DailyCalendarService;
  const BADGE_ASSETS = {
    bronze: 'assets/calendar/medal-bronze.png',
    silver: 'assets/calendar/medal-silver.png',
    gold: 'assets/calendar/medal-gold.png',
  };
  const LOCK_ASSET = 'assets/calendar/trophy-lock.png';
  const STREAK_ASSET = 'assets/rw-streak-fire.png';

  let overlayEl = null;
  let viewYear = null;
  let viewMonth = null;
  let selectedDate = null;
  let activeTab = 'puzzles';
  let scrollLockY = 0;

  function lockBodyScroll() {
    scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${scrollLockY}px`;
  }

  function unlockBodyScroll() {
    document.body.style.top = '';
    window.scrollTo(0, scrollLockY);
  }

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

  const CAL_STYLES_HREF = 'css/daily-calendar.css?v=17';

  function ensureStyles() {
    let link = document.getElementById('daily-cal-styles');
    if (!link) {
      link = document.createElement('link');
      link.id = 'daily-cal-styles';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== CAL_STYLES_HREF) {
      link.href = CAL_STYLES_HREF;
    }
  }

  function monthLabel(year, month) {
    try {
      const d = new Date(year, month - 1, 1);
      const locale = global.I18n?.getLocale?.() === 'ko' ? 'ko-KR' : 'en-US';
      return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(d);
    } catch {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  function formatPlayDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    try {
      const locale = global.I18n?.getLocale?.() === 'ko' ? 'ko-KR' : 'en-US';
      return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d));
    } catch {
      return dateKey;
    }
  }

  function initViewMonth() {
    const today = SVC().getTodayKey();
    const [y, m] = today.split('-').map(Number);
    const clamped = SVC().clampMonth(y, m);
    viewYear = clamped.year;
    viewMonth = clamped.month;
    selectedDate = today;
  }

  function canGoPrevMonth() {
    const prev = SVC().shiftMonth(viewYear, viewMonth, -1);
    return prev.year !== viewYear || prev.month !== viewMonth;
  }

  function canGoNextMonth() {
    const next = SVC().shiftMonth(viewYear, viewMonth, 1);
    return next.year !== viewYear || next.month !== viewMonth;
  }

  function milestoneClass(badge, badges) {
    if (badge.earned) return ' is-earned';
    const next = badges.find((b) => !b.earned);
    if (next && next.threshold === badge.threshold) return ' is-current';
    return ' is-locked';
  }

  function badgeArtHtml(badge, stateClass) {
    const src = BADGE_ASSETS[badge.id] || BADGE_ASSETS.bronze;
    const locked = stateClass.includes('is-locked');
    if (locked) {
      return `
        <span class="daily-cal-badge-art" aria-hidden="true">
          <img class="daily-cal-badge-img" src="${escapeHtml(src)}" alt="" width="64" height="64" decoding="async">
          <img class="daily-cal-badge-lock" src="${escapeHtml(LOCK_ASSET)}" alt="" width="40" height="40" decoding="async">
        </span>
      `;
    }
    return `
      <span class="daily-cal-badge-art" aria-hidden="true">
        <img class="daily-cal-badge-img" src="${escapeHtml(src)}" alt="" width="64" height="64" decoding="async">
      </span>
    `;
  }

  function buildStreakMilestoneTrack(snap) {
    const awarded = new Set(global.DailyQuizStreak?.loadState?.()?.milestonesAwarded || []);
    const streak = snap.currentStreak || 0;
    const milestones = global.DailyQuizStreak?.MILESTONES || [];
    const next = milestones.find((m) => streak < m.days);
    const icons = {
      3: '🔥',
      7: '🖼️',
      14: '👑',
      30: '🏆',
      100: '📜',
    };
    const items = milestones.map((m) => {
      const earned = awarded.has(m.days) || streak >= m.days;
      const state = earned ? 'is-earned' : (next && next.days === m.days ? 'is-next' : 'is-locked');
      return `
        <div class="dq-milestone-card ${state}" role="listitem">
          <span class="dq-milestone-days">${escapeHtml(t('dailyStreak.milestoneDays', { days: m.days }))}</span>
          <span class="dq-milestone-icon" aria-hidden="true">${icons[m.days] || '⭐'}</span>
          <span class="dq-milestone-reward">${escapeHtml(t(`dailyStreak.milestoneReward.${m.days}`))}</span>
        </div>`;
    }).join('');

    const nextHtml = next
      ? `<p class="dq-streak-next">${escapeHtml(t('dailyStreak.nextReward', {
        left: Math.max(0, next.days - streak),
        days: next.days,
        reward: t(`dailyStreak.milestoneReward.${next.days}`),
      }))}</p>`
      : `<p class="dq-streak-next">${escapeHtml(t('dailyStreak.allRewardsUnlocked'))}</p>`;

    return `
      <div class="dq-milestone-block">
        <h4 class="dq-milestone-heading">${escapeHtml(t('dailyStreak.milestonesTitle'))}</h4>
        <div class="dq-milestone-track" role="list">${items}</div>
        ${nextHtml}
      </div>`;
  }

  function buildBadgesHtml() {
    const snap = global.DailyQuizStreak?.getSnapshot?.() || {
      currentStreak: 0, freezeCount: 0, clearedToday: false, longestStreak: 0,
    };
    const days = snap.currentStreak || 0;
    const freeze = snap.freezeCount || 0;
    return `
      <section class="daily-cal-prizes daily-cal-streak-panel" aria-label="${escapeHtml(t('dailyStreak.title'))}">
        <h3 class="daily-cal-prizes-title">${escapeHtml(t('dailyStreak.title'))}</h3>
        <p class="dq-streak-how">${escapeHtml(t('dailyStreak.howItWorks'))}</p>
        <div class="dq-streak-status-row">
          <div class="dq-streak-stat dq-streak-stat--fire">
            <span class="dq-streak-stat-icon" aria-hidden="true">🔥</span>
            <div class="dq-streak-stat-text">
              <span class="dq-streak-stat-value">${days}</span>
              <span class="dq-streak-stat-label">${escapeHtml(t('dailyStreak.currentStreakLabel'))}</span>
            </div>
          </div>
          <div class="dq-streak-stat dq-streak-stat--freeze" title="${escapeHtml(t('dailyStreak.freezeExplain'))}">
            <span class="dq-streak-stat-icon" aria-hidden="true">❄️</span>
            <div class="dq-streak-stat-text">
              <span class="dq-streak-stat-value">${freeze}</span>
              <span class="dq-streak-stat-label">${escapeHtml(t('dailyStreak.freezeLabel'))}</span>
            </div>
          </div>
        </div>
        <p class="dq-streak-freeze-hint">${escapeHtml(t('dailyStreak.freezeExplain'))}</p>
        <p class="dq-streak-today">${escapeHtml(snap.clearedToday ? t('dailyStreak.savedToday') : t('dailyStreak.keepStreak'))}</p>
        ${buildStreakMilestoneTrack(snap)}
      </section>
    `;
  }

  function buildStatsHtml() {
    const streakInfo = global.LearningStreak?.getDisplayInfo?.();
    if (!streakInfo) return '';

    const wins = SVC().getMonthWinCount(viewYear, viewMonth);

    return `
      <div class="daily-cal-stats" aria-label="${escapeHtml(t('dailyCalendar.statsLabel'))}">
        <div class="daily-cal-stat">
          <img class="daily-cal-stat-icon" src="${escapeHtml(STREAK_ASSET)}" alt="" width="22" height="22" decoding="async" aria-hidden="true">
          <span class="daily-cal-stat-value">${streakInfo.streakDays}</span>
          <span class="daily-cal-stat-label">${escapeHtml(t('dailyCalendar.statStreak'))}</span>
        </div>
        <div class="daily-cal-stat">
          <img class="daily-cal-stat-icon" src="${escapeHtml(BADGE_ASSETS.silver)}" alt="" width="22" height="22" decoding="async" aria-hidden="true">
          <span class="daily-cal-stat-value">${wins}</span>
          <span class="daily-cal-stat-label">${escapeHtml(t('dailyCalendar.statMonthlyWins'))}</span>
        </div>
        <div class="daily-cal-stat">
          <img class="daily-cal-stat-icon" src="${escapeHtml(STREAK_ASSET)}" alt="" width="22" height="22" decoding="async" aria-hidden="true">
          <span class="daily-cal-stat-value">${streakInfo.longestStreak}</span>
          <span class="daily-cal-stat-label">${escapeHtml(t('dailyCalendar.statBestStreak'))}</span>
        </div>
      </div>
    `;
  }

  function dayClasses(dateKey) {
    const svc = SVC();
    const classes = ['daily-cal-day'];
    if (!svc.canSelectDate(dateKey)) classes.push('is-future');
    else if (svc.isFutureDate(dateKey)) classes.push('is-future');
    else if (svc.isToday(dateKey)) classes.push('is-today');
    else if (svc.isPastDate(dateKey)) classes.push('is-past');
    if (svc.isDateCompleted(dateKey)) classes.push('is-completed');
    if (svc.isPastDate(dateKey) && !svc.canPlayDate(dateKey)) classes.push('is-locked-past');
    if (dateKey === selectedDate) classes.push('is-selected');
    return classes.join(' ');
  }

  function buildCalendarHtml() {
    const weekdays = [
      t('dailyCalendar.weekdays.sun'),
      t('dailyCalendar.weekdays.mon'),
      t('dailyCalendar.weekdays.tue'),
      t('dailyCalendar.weekdays.wed'),
      t('dailyCalendar.weekdays.thu'),
      t('dailyCalendar.weekdays.fri'),
      t('dailyCalendar.weekdays.sat'),
    ];
    const weekdayHtml = weekdays.map((w) => `<div class="daily-cal-weekday">${escapeHtml(w)}</div>`).join('');
    const cells = SVC().getCalendarDays(viewYear, viewMonth);
    const daysHtml = cells.map((cell) => {
      if (!cell) return '<div class="daily-cal-day is-empty" aria-hidden="true"></div>';
      const { day, dateKey } = cell;
      const selectable = SVC().canSelectDate(dateKey);
      const completed = SVC().isDateCompleted(dateKey);
      const checkHtml = completed
        ? '<span class="daily-cal-day-check" aria-hidden="true">✓</span>'
        : '';
      return `
        <button type="button" class="${dayClasses(dateKey)} no-press"
          data-date="${escapeHtml(dateKey)}"
          ${selectable ? '' : 'disabled'}
          aria-label="${escapeHtml(t('dailyCalendar.dayLabel', { day, date: dateKey }))}"
          aria-pressed="${dateKey === selectedDate ? 'true' : 'false'}">
          <span class="daily-cal-day-num">${day}</span>${checkHtml}
        </button>
      `;
    }).join('');

    return `
      <div class="daily-cal-month-nav">
        <button type="button" class="daily-cal-month-btn no-press" data-cal-nav="prev" aria-label="${escapeHtml(t('dailyCalendar.prevMonth'))}" ${canGoPrevMonth() ? '' : 'disabled'}>‹</button>
        <div class="daily-cal-month-label">${escapeHtml(monthLabel(viewYear, viewMonth))}</div>
        <button type="button" class="daily-cal-month-btn no-press" data-cal-nav="next" aria-label="${escapeHtml(t('dailyCalendar.nextMonth'))}" ${canGoNextMonth() ? '' : 'disabled'}>›</button>
      </div>
      <div class="daily-cal-weekdays">${weekdayHtml}</div>
      <div class="daily-cal-grid" role="grid">${daysHtml}</div>
    `;
  }

  function buildTrophiesHtml() {
    const snap = global.DailyQuizStreak?.getSnapshot?.() || {
      currentStreak: 0, freezeCount: 0, clearedToday: false, milestonesAwarded: [],
    };
    return `
      <div class="daily-cal-trophies">
        <section class="daily-cal-prizes daily-cal-streak-panel" aria-label="${escapeHtml(t('dailyStreak.title'))}">
          <h3 class="daily-cal-prizes-title">${escapeHtml(t('dailyStreak.title'))}</h3>
          <p class="dq-streak-how">${escapeHtml(t('dailyStreak.howItWorks'))}</p>
          <div class="dq-streak-status-row">
            <div class="dq-streak-stat dq-streak-stat--fire">
              <span class="dq-streak-stat-icon" aria-hidden="true">🔥</span>
              <div class="dq-streak-stat-text">
                <span class="dq-streak-stat-value">${snap.currentStreak || 0}</span>
                <span class="dq-streak-stat-label">${escapeHtml(t('dailyStreak.currentStreakLabel'))}</span>
              </div>
            </div>
            <div class="dq-streak-stat dq-streak-stat--freeze">
              <span class="dq-streak-stat-icon" aria-hidden="true">❄️</span>
              <div class="dq-streak-stat-text">
                <span class="dq-streak-stat-value">${snap.freezeCount || 0}</span>
                <span class="dq-streak-stat-label">${escapeHtml(t('dailyStreak.freezeLabel'))}</span>
              </div>
            </div>
          </div>
          <p class="dq-streak-freeze-hint">${escapeHtml(t('dailyStreak.freezeExplain'))}</p>
          ${buildStreakMilestoneTrack(snap)}
        </section>
      </div>
    `;
  }

  function buildFooterHtml() {
    const svc = SVC();
    if (!selectedDate || !svc.canSelectDate(selectedDate)) {
      return `<button type="button" class="daily-cal-play-btn no-press" disabled>${escapeHtml(t('dailyCalendar.selectDay'))}</button>`;
    }

    const dateLabel = formatPlayDate(selectedDate);
    const completed = svc.isDateCompleted(selectedDate);
    const canPlay = svc.canPlayDate(selectedDate);

    if (completed) {
      const clearedLabel = svc.isToday(selectedDate)
        ? t('dailyCalendar.clearedToday')
        : t('dailyCalendar.clearedDate', { date: dateLabel });
      return `
        <div class="daily-cal-play-row">
          <button type="button" class="daily-cal-play-btn is-cleared no-press" data-cal-action="view" aria-label="${escapeHtml(t('dailyCalendar.viewResult'))}">
            <span class="daily-cal-play-check" aria-hidden="true">✓</span>
            <span class="daily-cal-play-label">${escapeHtml(clearedLabel)}</span>
            <span class="daily-cal-cleared-tag">${escapeHtml(t('dailyCalendar.viewResult'))}</span>
          </button>
        </div>
      `;
    }

    if (canPlay) {
      const playLabel = svc.isToday(selectedDate)
        ? t('dailyCalendar.playToday')
        : t('dailyCalendar.playDate', { date: dateLabel });
      const freeTag = svc.isToday(selectedDate)
        ? `<span class="daily-cal-free-tag">${escapeHtml(t('dailyCalendar.free'))}</span>`
        : '';
      return `
        <div class="daily-cal-play-row">
          <button type="button" class="daily-cal-play-btn no-press" data-cal-action="play">
            <span class="daily-cal-play-label">${escapeHtml(playLabel)}</span>${freeTag}
          </button>
        </div>
      `;
    }

    const cost = svc.PAST_DAY_COST;
    return `
      <div class="daily-cal-play-row">
        <p class="daily-cal-progress-text">${escapeHtml(t('dailyCalendar.unlockPastHint', { date: dateLabel }))}</p>
        <div class="daily-cal-unlock-row">
          <button type="button" class="daily-cal-unlock-btn coins no-press" data-cal-action="coins">
            ${global.CoinIcon?.format?.(t('dailyCalendar.payCoins', { count: cost }), 'coin-icon coin-icon--sm') || escapeHtml(t('dailyCalendar.payCoins', { count: cost }))}
          </button>
          <button type="button" class="daily-cal-unlock-btn ad no-press" data-cal-action="ad">
            ${escapeHtml(t('dailyCalendar.watchAd'))}
          </button>
        </div>
      </div>
    `;
  }

  function renderBody() {
    if (!overlayEl) return;
    const body = overlayEl.querySelector('.daily-cal-body');
    const footer = overlayEl.querySelector('.daily-cal-footer');
    if (!body || !footer) return;

    body.innerHTML = activeTab === 'trophies'
      ? buildTrophiesHtml()
      : buildBadgesHtml() + buildCalendarHtml() + buildStatsHtml();
    footer.innerHTML = activeTab === 'puzzles' ? buildFooterHtml() : '';

    overlayEl.querySelectorAll('.daily-cal-tab').forEach((tab) => {
      const isActive = tab.dataset.calTab === activeTab;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
    });

    global.I18n?.applyToDocument?.(overlayEl);
  }

  function close() {
    if (!overlayEl) return;
    document.body.classList.remove('daily-cal-open');
    unlockBodyScroll();
    overlayEl.classList.remove('visible');
    global.HomeNav?.show?.();
    const el = overlayEl;
    overlayEl = null;
    setTimeout(() => el.remove(), 280);
  }

  function onPlay() {
    if (!selectedDate || !SVC().canPlayDate(selectedDate)) return;
    if (SVC().isDateCompleted(selectedDate)) {
      onViewResult();
      return;
    }
    SVC().navigateToDaily(selectedDate);
    close();
  }

  function onViewResult() {
    if (!selectedDate || !SVC().isDateCompleted(selectedDate)) return;
    SVC().navigateToDaily(selectedDate);
    close();
  }

  function onUnlockCoins() {
    const result = SVC().unlockWithCoins(selectedDate);
    if (!result.ok) {
      if (result.reason === 'insufficient') {
        window.alert(t('dailyCalendar.notEnoughCoins', { count: SVC().PAST_DAY_COST }));
      }
      return;
    }
    renderBody();
    bindFooterActions();
  }

  function onUnlockAd() {
    const ok = window.confirm(t('dailyCalendar.adConfirm'));
    if (!ok) return;
    SVC().unlockWithAd(selectedDate);
    renderBody();
    bindFooterActions();
  }

  function bindFooterActions() {
    if (!overlayEl) return;
    overlayEl.querySelector('[data-cal-action="play"]')?.addEventListener('click', onPlay);
    overlayEl.querySelector('[data-cal-action="view"]')?.addEventListener('click', onViewResult);
    overlayEl.querySelector('[data-cal-action="coins"]')?.addEventListener('click', onUnlockCoins);
    overlayEl.querySelector('[data-cal-action="ad"]')?.addEventListener('click', onUnlockAd);
  }

  function bindEvents() {
    if (!overlayEl) return;

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl || e.target.closest('.daily-cal-close')) close();
    });

    overlayEl.querySelectorAll('.daily-cal-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.calTab || 'puzzles';
        renderBody();
        bindFooterActions();
        bindCalendarEvents();
      });
    });

    bindCalendarEvents();
    bindFooterActions();
  }

  function bindCalendarEvents() {
    if (!overlayEl) return;
    overlayEl.querySelector('[data-cal-nav="prev"]')?.addEventListener('click', () => {
      const prev = SVC().shiftMonth(viewYear, viewMonth, -1);
      viewYear = prev.year;
      viewMonth = prev.month;
      renderBody();
      bindFooterActions();
      bindCalendarEvents();
    });
    overlayEl.querySelector('[data-cal-nav="next"]')?.addEventListener('click', () => {
      const next = SVC().shiftMonth(viewYear, viewMonth, 1);
      viewYear = next.year;
      viewMonth = next.month;
      renderBody();
      bindFooterActions();
      bindCalendarEvents();
    });
    overlayEl.querySelectorAll('.daily-cal-day[data-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dateKey = btn.dataset.date;
        if (!dateKey || !SVC().canSelectDate(dateKey)) return;
        selectedDate = dateKey;
        overlayEl.querySelectorAll('.daily-cal-day[data-date]').forEach((dayBtn) => {
          const picked = dayBtn.dataset.date === selectedDate;
          dayBtn.classList.toggle('is-selected', picked);
          dayBtn.setAttribute('aria-pressed', picked ? 'true' : 'false');
        });
        if (SVC().isToday(dateKey) && SVC().canPlayDate(dateKey) && !SVC().isDateCompleted(dateKey)) {
          onPlay();
          return;
        }
        const footer = overlayEl.querySelector('.daily-cal-footer');
        if (footer && activeTab === 'puzzles') {
          footer.innerHTML = buildFooterHtml();
          bindFooterActions();
        }
      });
    });
  }

  function getCalendarNavLabels() {
    const now = new Date();
    const lang = global.I18n?.getLanguage?.() || document.documentElement.lang || 'en';
    const locale = lang === 'ko' ? 'ko-KR' : 'en-US';
    const month = now.toLocaleDateString(locale, { month: 'short' }).replace(/\./g, '').trim();
    const monthLabel = lang === 'ko' ? month : month.toUpperCase();
    return {
      month: monthLabel,
      day: String(now.getDate()),
    };
  }

  function updateMenuCalendarNav() {
    const btn = document.getElementById('menu-calendar-nav');
    if (!btn) return;

    const labels = getCalendarNavLabels();
    const monthEl = document.getElementById('menu-calendar-nav-month');
    const dayEl = document.getElementById('menu-calendar-nav-day');
    if (monthEl) monthEl.textContent = labels.month;
    if (dayEl) dayEl.textContent = labels.day;

    const pending = !SVC()?.isDateCompleted?.(SVC()?.getTodayKey?.());
    btn.classList.toggle('is-pending', !!pending);

    let badge = btn.querySelector('.menu-calendar-nav-badge');
    if (pending) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'menu-calendar-nav-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.textContent = '!';
    } else if (badge) {
      badge.remove();
    }
  }

  function open() {
    if (!SVC()) {
      console.warn('[Jamodeul] DailyCalendarService unavailable');
      global.location.href = 'match.html?daily=1';
      return;
    }

    ensureStyles();
    close();

    initViewMonth();
    activeTab = 'puzzles';

    overlayEl = document.createElement('div');
    overlayEl.id = 'daily-cal-overlay';
    overlayEl.className = 'daily-cal-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-label', t('dailyCalendar.title'));
    overlayEl.innerHTML = `
      <div class="daily-cal-modal">
        <header class="daily-cal-header">
          <button type="button" class="daily-cal-close no-press" aria-label="${escapeHtml(t('dailyCalendar.closeLabel'))}">
            <span class="daily-cal-close-icon" aria-hidden="true">×</span>
          </button>
          <div class="daily-cal-tabs" role="tablist" aria-label="${escapeHtml(t('dailyCalendar.title'))}">
            <button type="button" class="daily-cal-tab no-press is-active" role="tab" data-cal-tab="puzzles" aria-selected="true">${escapeHtml(t('dailyCalendar.tabPuzzles'))}</button>
            <button type="button" class="daily-cal-tab no-press" role="tab" data-cal-tab="trophies" aria-selected="false" tabindex="-1">${escapeHtml(t('dailyCalendar.tabTrophies'))}</button>
          </div>
          <div class="daily-cal-header-spacer" aria-hidden="true"></div>
        </header>
        <div class="daily-cal-body"></div>
        <footer class="daily-cal-footer"></footer>
      </div>
    `;

    document.body.appendChild(overlayEl);
    document.body.classList.add('daily-cal-open');
    lockBodyScroll();
    global.HomeNav?.show?.();
    renderBody();
    bindEvents();
    requestAnimationFrame(() => overlayEl.classList.add('visible'));
  }

  global.DailyCalendarModal = { open, close, updateMenuCalendarNav };
})(typeof window !== 'undefined' ? window : globalThis);
