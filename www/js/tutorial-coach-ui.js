/**
 * Tutorial coach — drag finger pointer only (instructions live in the match UI).
 */
(function (global) {
  'use strict';

  class TutorialCoachUI {
    constructor() {
      this.fingerEl = null;
      this.fingerAnim = null;
      this.fingerStart = null;
    }

    mount() {
      if (this.fingerEl) return;
      const el = document.createElement('div');
      el.className = 'tutorial-coach-finger';
      el.setAttribute('aria-hidden', 'true');
      el.textContent = '👆';
      document.body.appendChild(el);
      this.fingerEl = el;
    }

    destroy() {
      this.stopFinger();
      this.fingerEl?.remove();
      this.fingerEl = null;
    }

    pointFinger(fromEl, toEl) {
      this.stopFinger();
      if (!fromEl || !toEl || !this.fingerEl) return;

      const animate = (ts) => {
        if (!this.fingerStart) this.fingerStart = ts;
        const progress = ((ts - this.fingerStart) % 1800) / 1800;
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const from = fromEl.getBoundingClientRect();
        const to = toEl.getBoundingClientRect();
        const x = from.left + from.width / 2
          + (to.left + to.width / 2 - from.left - from.width / 2) * eased;
        const y = from.top + from.height / 2
          + (to.top + to.height / 2 - from.top - from.height / 2) * eased;

        this.fingerEl.style.transform = `translate(${x - 16}px, ${y - 8}px)`;
        this.fingerEl.style.opacity = '1';
        this.fingerAnim = requestAnimationFrame(animate);
      };

      this.fingerStart = null;
      this.fingerAnim = requestAnimationFrame(animate);
    }

    stopFinger() {
      if (this.fingerAnim) cancelAnimationFrame(this.fingerAnim);
      this.fingerAnim = null;
      if (this.fingerEl) this.fingerEl.style.opacity = '0';
    }
  }

  global.TutorialCoachUI = TutorialCoachUI;
})(typeof window !== 'undefined' ? window : globalThis);
