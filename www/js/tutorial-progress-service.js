/**
 * Tutorial progress — tracks step completion; tutorial starts only from the menu.
 */
(function (global) {
  'use strict';

  const PROGRESS_KEY = 'jamodeul-tutorial-progress';
  const ONBOARDING_STEP_COUNT = global.TutorialProgram?.TOTAL_STEPS ?? 6;

  const DEFAULTS = {
    onboardingComplete: false,
    currentStep: 0,
    completedSteps: [],
  };

  function load() {
    const store = global.AppStorage;
    const raw = store ? store.get(PROGRESS_KEY, null) : null;
    let data = raw;
    if (!data) {
      try {
        const s = localStorage.getItem(PROGRESS_KEY);
        data = s ? JSON.parse(s) : null;
      } catch {
        data = null;
      }
    }
    if (!data || typeof data !== 'object') return { ...DEFAULTS };

    const completedSteps = Array.isArray(data.completedSteps)
      ? [...new Set(data.completedSteps.filter((id) => typeof id === 'string' && id))]
      : [];

    // Migrate legacy level-mode progress
    if (!completedSteps.length && Array.isArray(data.completedLevels) && data.completedLevels.length) {
      const legacy = global.TutorialProgram?.STEPS || [];
      data.completedLevels.forEach((lvl) => {
        const step = legacy[parseInt(lvl, 10) - 1];
        if (step?.id) completedSteps.push(step.id);
      });
    }

    return {
      ...DEFAULTS,
      onboardingComplete: !!data.onboardingComplete,
      currentStep: Math.max(0, parseInt(data.currentStep, 10) || 0),
      completedSteps,
    };
  }

  function save(patch) {
    const next = { ...load(), ...patch };
    if (global.AppStorage) {
      global.AppStorage.set(PROGRESS_KEY, next);
    } else {
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      } catch {}
    }
    return next;
  }

  function hasAnyGameProgress() {
    const mp = global.MenuProgress?.loadProgress?.();
    if (mp && (mp.wordsLearned > 0 || mp.builderWordsCompleted > 0)) return true;
    const p = load();
    return p.completedSteps.length > 0 || p.onboardingComplete;
  }

  function isNewPlayer() {
    if (hasAnyGameProgress()) return false;
    const p = load();
    return !p.onboardingComplete && p.completedSteps.length === 0;
  }

  function getCompletedCount() {
    return load().completedSteps.length;
  }

  function isStepCompleted(stepId) {
    return load().completedSteps.includes(stepId);
  }

  function getCurrentStepIndex() {
    const p = load();
    if (p.onboardingComplete) return ONBOARDING_STEP_COUNT;
    const steps = global.TutorialProgram?.STEPS || [];
    for (let i = 0; i < steps.length; i++) {
      if (!p.completedSteps.includes(steps[i].id)) return i;
    }
    return steps.length;
  }

  function isStepUnlocked(stepIndex) {
    return stepIndex <= getCurrentStepIndex();
  }

  /** Progress flag only — never used to auto-start or gate app entry. */
  function mustCompleteOnboarding() {
    const p = load();
    if (p.onboardingComplete) return false;
    if (!isNewPlayer() && getCompletedCount() >= ONBOARDING_STEP_COUNT) return false;
    return isNewPlayer() || getCompletedCount() < ONBOARDING_STEP_COUNT;
  }

  function canSkipTutorial() {
    return !mustCompleteOnboarding();
  }

  function completeStep(stepId) {
    const p = load();
    const completedSteps = [...new Set([...p.completedSteps, stepId])];
    const steps = global.TutorialProgram?.STEPS || [];
    const idx = steps.findIndex((s) => s.id === stepId);
    const nextStep = idx >= 0 ? Math.max(p.currentStep, idx + 1) : p.currentStep;
    const onboardingComplete = completedSteps.length >= ONBOARDING_STEP_COUNT
      || (steps.length > 0 && steps.every((s) => completedSteps.includes(s.id)));
    return save({
      completedSteps,
      currentStep: nextStep,
      onboardingComplete,
    });
  }

  function markOnboardingComplete() {
    return save({ onboardingComplete: true });
  }

  function resetProgress() {
    if (global.AppStorage) {
      global.AppStorage.remove(PROGRESS_KEY);
    } else {
      try {
        localStorage.removeItem(PROGRESS_KEY);
      } catch {}
    }
    return { ...DEFAULTS };
  }

  // Legacy aliases for older callers
  function isLevelCompleted(levelId) {
    const step = global.TutorialProgram?.getStep?.(levelId - 1);
    return step ? isStepCompleted(step.id) : false;
  }

  function isLevelUnlocked(levelId) {
    return isStepUnlocked(levelId - 1);
  }

  function completeLevel(levelId) {
    const step = global.TutorialProgram?.getStep?.(levelId - 1);
    return step ? completeStep(step.id) : load();
  }

  global.TutorialProgress = {
    PROGRESS_KEY,
    ONBOARDING_STEP_COUNT,
    load,
    save,
    isNewPlayer,
    mustCompleteOnboarding,
    canSkipTutorial,
    isStepCompleted,
    isStepUnlocked,
    getCurrentStepIndex,
    completeStep,
    markOnboardingComplete,
    resetProgress,
    getCompletedCount,
    isLevelCompleted,
    isLevelUnlocked,
    completeLevel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
