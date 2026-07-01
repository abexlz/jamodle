/**
 * New-player onboarding — redirect to interactive tutorial.
 */
(function (global) {
  'use strict';

  function shouldShow() {
    return global.TutorialProgress?.mustCompleteOnboarding?.() === true;
  }

  function mount() {
    if (!shouldShow()) return;
    const path = location.pathname || '';
    if (path.includes('match-tutorial')) return;
    location.href = 'match-tutorial.html?required=1';
  }

  global.TutorialOnboardingUI = { mount, shouldShow };
})(typeof window !== 'undefined' ? window : globalThis);
