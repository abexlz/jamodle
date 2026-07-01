/**
 * Daily Match calendar picker modal — choose a date before playing.
 */
(function (global) {
  'use strict';

  const SVC = () => global.DailyCalendarService;
  const BADGE_ICONS = { bronze: '🥉', silver: '🥈', gold: '🥇' };

  let overlayEl = null;
  let viewYear = null;
  let viewMonth = null;
  let selectedDate = null;
  let activeTab = 'puzzles';

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

  function ensureStyles() {
    if (document.getElementById('daily-cal-styles')) return;
    const link = document.createElement('link');
    link.id = 'daily-cal-styles';
    link.rel = 'stylesheet';
    link.href = 'css/daily-calendar.css';
    document.head.appendChild(link);
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

  function buildBadgesHtml() {
    const badges = SVC().getBadgeState(viewYear, viewMonth);
    const wins = SVC().getMonthWinCount(viewYear, viewMonth);
    const next = SVC().getNextBadgeThreshold(viewYear, viewMonth);
    const maxThreshold = SVC().BADGE_THRESHOLDS[SVC().BADGE_THRESHOLDS.length - 1];
    const progressPct = Math.min(100, Math.round((wins / maxThreshold) * 100));

    const badgesHtml = badges.map((b) => `
      <div class="daily-cal-badge${b.earned ? ' is-earned' : ''}" title="${escapeHtml(t('dailyCalendar.badgeAt', { count: b.threshold }))}">
        <span class="daily-cal-badge-icon" aria-hidden="true">${BADGE_ICONS[b.id] || '🏅'}</span>
        <span class="daily-cal-badge-label">${b.threshold}</span>
      </div>
    `).join('');

    const progressText = wins >= maxThreshold
      ? t('dailyCalendar.allBadgesEarned', { count: wins })
      : t('dailyCalendar.progressToNext', { count: wins, next });

    return `
      <section class="daily-cal-prizes" aria-label="${escapeHtml(t('dailyCalendar.monthlyPrizes'))}">
        <h3 class="daily-cal-prizes-title">${escapeHtml(t('dailyCalendar.monthlyPrizes'))}</h3>
        <div class="daily-cal-badges">${badgesHtml}</div>
        <div class="daily-cal-progress-wrap" aria-hidden="true">
          <div class="daily-cal-progress-bar" style="width:${progressPct}%"></div>
        </div>
        <p class="daily-cal-progress-text">${escapeHtml(progressText)}</p>
      </section>
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
      return `
        <button type="button" class="${dayClasses(dateKey)}"
          data-date="${escapeHtml(dateKey)}"
          ${selectable ? '' : 'disabled'}
          aria-label="${escapeHtml(t('dailyCalendar.dayLabel', { day, date: dateKey }))}"
          aria-pressed="${dateKey === selectedDate ? 'true' : 'false'}">
          ${day}
        </button>
      `;
    }).join('');

    return `
      <div class="daily-cal-month-nav">
        <button type="button" class="daily-cal-month-btn" data-cal-nav="prev" aria-label="${escapeHtml(t('dailyCalendar.prevMonth'))}" ${canGoPrevMonth() ? '' : 'disabled'}>‹</button>
        <div class="daily-cal-month-label">${escapeHtml(monthLabel(viewYear, viewMonth))}</div>
        <button type="button" class="daily-cal-month-btn" data-cal-nav="next" aria-label="${escapeHtml(t('dailyCalendar.nextMonth'))}" ${canGoNextMonth() ? '' : 'disabled'}>›</button>
      </div>
      <div class="daily-cal-weekdays">${weekdayHtml}</div>
      <div class="daily-cal-grid" role="grid">${daysHtml}</div>
    `;
  }

  function buildTrophiesHtml() {
    const badges = SVC().getBadgeState(viewYear, viewMonth);
    const cards = badges.map((b) => `
      <div class="daily-cal-trophy-card${b.earned ? ' is-earned' : ''}">
        <div class="daily-cal-badge-icon" aria-hidden="true">${BADGE_ICONS[b.id] || '🏅'}</div>
        <div class="daily-cal-badge-label">${escapeHtml(t('dailyCalendar.badgeAt', { count: b.threshold }))}</div>
      </div>
    `).join('');
    return `
      <div class="daily-cal-trophies">
        <h3 class="daily-cal-prizes-title">${escapeHtml(t('dailyCalendar.trophiesTitle'))}</h3>
        <p class="daily-cal-progress-text">${escapeHtml(t('dailyCalendar.trophiesHint'))}</p>
        <div class="daily-cal-trophy-grid">${cards}</div>
      </div>
    `;
  }

  function buildFooterHtml() {
    const svc = SVC();
    if (!selectedDate || !svc.canSelectDate(selectedDate)) {
      return `<button type="button" class="daily-cal-play-btn" disabled>${escapeHtml(t('dailyCalendar.selectDay'))}</button>`;
    }

    const dateLabel = formatPlayDate(selectedDate);
    const isFree = svc.isToday(selectedDate) || svc.getPlayCost(selectedDate) === 0;
    const canPlay = svc.canPlayDate(selectedDate);

    if (canPlay) {
      const freeTag = svc.isToday(selectedDate)
        ? `<span class="daily-cal-free-tag">${escapeHtml(t('dailyCalendar.free'))}</span>`
        : '';
      return `
        <div class="daily-cal-play-row">
          <button type="button" class="daily-cal-play-btn" data-cal-action="play">
            ${escapeHtml(t('dailyCalendar.playDate', { date: dateLabel }))}${freeTag}
          </button>
        </div>
      `;
    }

    const cost = svc.PAST_DAY_COST;
    return `
      <div class="daily-cal-play-row">
        <p class="daily-cal-progress-text">${escapeHtml(t('dailyCalendar.unlockPastHint', { date: dateLabel }))}</p>
        <div class="daily-cal-unlock-row">
          <button type="button" class="daily-cal-unlock-btn coins" data-cal-action="coins">
            ${escapeHtml(t('dailyCalendar.payCoins', { count: cost }))}
          </button>
          <button type="button" class="daily-cal-unlock-btn ad" data-cal-action="ad">
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
      : buildBadgesHtml() + buildCalendarHtml();
    footer.innerHTML = activeTab === 'puzzles' ? buildFooterHtml() : '';

    overlayEl.querySelectorAll('.daily-cal-tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.calTab === activeTab);
    });

    global.I18n?.applyToDocument?.(overlayEl);
  }

  function close() {
    if (!overlayEl) return;
    document.body.classList.remove('daily-cal-open');
    overlayEl.classList.remove('visible');
    const el = overlayEl;
    overlayEl = null;
    setTimeout(() => el.remove(), 280);
  }

  function onPlay() {
    if (!selectedDate || !SVC().canPlayDate(selectedDate)) return;
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
    overlayEl.querySelector('[data-cal-action="coins"]')?.addEventListener('click', onUnlockCoins);
    overlayEl.querySelector('[data-cal-action="ad"]')?.addEventListener('click', onUnlockAd);
  }

  function bindEvents() {
    if (!overlayEl) return;

    overlayEl.querySelector('.daily-cal-close')?.addEventListener('click', close);
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
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
        renderBody();
        bindFooterActions();
        bindCalendarEvents();
      });
    });
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
          <button type="button" class="daily-cal-close" aria-label="${escapeHtml(t('dailyCalendar.close'))}">×</button>
          <div class="daily-cal-tabs" role="tablist">
            <button type="button" class="daily-cal-tab is-active" role="tab" data-cal-tab="puzzles">${escapeHtml(t('dailyCalendar.tabPuzzles'))}</button>
            <button type="button" class="daily-cal-tab" role="tab" data-cal-tab="trophies">${escapeHtml(t('dailyCalendar.tabTrophies'))}</button>
          </div>
          <span style="width:36px" aria-hidden="true"></span>
        </header>
        <div class="daily-cal-body"></div>
        <footer class="daily-cal-footer"></footer>
      </div>
    `;

    document.body.appendChild(overlayEl);
    document.body.classList.add('daily-cal-open');
    renderBody();
    bindEvents();
    requestAnimationFrame(() => overlayEl.classList.add('visible'));
  }

  global.DailyCalendarModal = { open, close };
})(typeof window !== 'undefined' ? window : globalThis);
