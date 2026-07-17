/**
 * Odometer-style score display — digits roll downward when the value increases.
 */
(function (global) {
  'use strict';

  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const BASE_MS = 420;
  const STEP_MS = 55;
  const ROLL_MS = 680;

  function reduceMotion() {
    return global.UserPreferences?.shouldReduceMotion?.() === true;
  }

  function clampScore(n) {
    return Math.max(0, Math.floor(Number(n) || 0));
  }

  function buildStrip() {
    const strip = document.createElement('span');
    strip.className = 'rw-odometer-strip';
    // 0–9 plus a trailing 0 for 9→0 carry rolls.
    for (let i = 0; i <= 10; i++) {
      const cell = document.createElement('span');
      cell.className = 'rw-odometer-cell';
      cell.textContent = String(i % 10);
      strip.appendChild(cell);
    }
    return strip;
  }

  function setStripY(strip, digit, { animate = false, durationMs = BASE_MS } = {}) {
    const d = Math.max(0, Math.min(10, digit));
    const y = `translate3d(0, calc(-1em * ${d}), 0)`;
    if (!animate || reduceMotion()) {
      strip.style.transition = 'none';
      strip.style.transform = y;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        strip.removeEventListener('transitionend', done);
        resolve();
      };
      strip.addEventListener('transitionend', done, { once: true });
      strip.style.transition = `transform ${durationMs}ms ${EASE}`;
      strip.style.transform = y;
      setTimeout(done, durationMs + 40);
    });
  }

  function createDigitColumn(digit) {
    const col = document.createElement('span');
    col.className = 'rw-odometer-digit';
    col.appendChild(buildStrip());
    const strip = col.querySelector('.rw-odometer-strip');
    setStripY(strip, digit, { animate: false });
    return col;
  }

  /** Wrap a plain score span in odometer markup (id / classes preserved). */
  function mount(el) {
    if (!el) return el;
    if (el.classList.contains('rw-odometer')) return el;

    const initial = clampScore(el.textContent);
    const wrapper = document.createElement('span');
    wrapper.className = el.className;
    wrapper.classList.add('rw-odometer');
    if (el.id) wrapper.id = el.id;
    wrapper.dataset.value = String(initial);
    wrapper.setAttribute('aria-live', 'polite');
    wrapper.setAttribute('aria-label', String(initial));

    const digits = String(initial || 0).split('');
    digits.forEach((ch) => {
      wrapper.appendChild(createDigitColumn(parseInt(ch, 10) || 0));
    });

    el.replaceWith(wrapper);
    return wrapper;
  }

  function padDigits(str, len) {
    return str.padStart(len, '0').split('').map((c) => parseInt(c, 10) || 0);
  }

  async function rollDigit(strip, prevD, nextD, speedBoost = 1) {
    if (prevD === nextD) {
      setStripY(strip, nextD, { animate: false });
      return;
    }

    if (nextD > prevD) {
      const dist = nextD - prevD;
      const boost = Math.max(1, Number(speedBoost) || 1);
      await setStripY(strip, nextD, {
        animate: true,
        durationMs: Math.max(180, (BASE_MS + dist * STEP_MS) / boost),
      });
      return;
    }

    // Carry roll (e.g. 9 → 0): spin through the extra cell at the bottom.
    await setStripY(strip, prevD, { animate: false });
    await setStripY(strip, 10, {
      animate: true,
      durationMs: ROLL_MS,
    });
    setStripY(strip, nextD, { animate: false });
  }

  async function applyScore(odo, nextScore, prevScore, { animate = true } = {}) {
    const next = clampScore(nextScore);
    const prev = clampScore(prevScore);
    const nextStr = String(next);
    const prevStr = String(prev);
    const shouldAnimate = animate && next !== prev && !reduceMotion();

    const maxLen = Math.max(nextStr.length, prevStr.length, 1);
    let cols = [...odo.querySelectorAll('.rw-odometer-digit')];

    while (cols.length < maxLen) {
      odo.insertBefore(createDigitColumn(0), odo.firstChild);
      cols = [...odo.querySelectorAll('.rw-odometer-digit')];
    }
    while (cols.length > maxLen) {
      cols[0].remove();
      cols = [...odo.querySelectorAll('.rw-odometer-digit')];
    }

    const nextDigits = padDigits(nextStr, maxLen);
    const prevDigits = padDigits(prevStr, maxLen);
    const scoreDelta = Math.max(0, next - prev);
    const speedBoost = scoreDelta > 1 ? 1.55 + scoreDelta * 0.42 : 1;

    if (shouldAnimate) {
      await Promise.all(cols.map((col, i) => {
        const strip = col.querySelector('.rw-odometer-strip');
        return strip ? rollDigit(strip, prevDigits[i], nextDigits[i], speedBoost) : Promise.resolve();
      }));
    } else {
      cols.forEach((col, i) => {
        const strip = col.querySelector('.rw-odometer-strip');
        if (strip) setStripY(strip, nextDigits[i], { animate: false });
      });
    }

    odo.dataset.value = nextStr;
    odo.setAttribute('aria-label', nextStr);
    return odo;
  }

  /**
   * Update score with odometer roll. Returns the odometer element (may replace el on first call).
   */
  async function update(el, nextScore, prevScore, { animate = true } = {}) {
    if (!el) return el;

    const odo = mount(el);
    const next = clampScore(nextScore);
    const prev = clampScore(prevScore);
    const shouldAnimate = animate && next !== prev && !reduceMotion();

    return applyScore(odo, next, prev, { animate: shouldAnimate });
  }

  /** Sync update for callers that don't await (fire-and-forget animation). */
  function set(el, nextScore, prevScore, options) {
    const odo = mount(el);
    void update(odo, nextScore, prevScore, options);
    return odo;
  }

  /** Mount if needed and return the live odometer element. */
  function ensure(el) {
    return mount(el);
  }

  global.RwScoreOdometer = { mount, ensure, update, set };
})(typeof window !== 'undefined' ? window : globalThis);
