'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadTutorialModules(storage = {}) {
  const context = {
    window: {},
    localStorage: {
      _data: { ...storage },
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = v; },
      removeItem(k) { delete this._data[k]; },
    },
  };
  context.window = context;
  context.globalThis = context;

  const base = path.join(__dirname, '../www/js');
  vm.runInNewContext(fs.readFileSync(path.join(base, 'tutorial-program.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(base, 'tutorial-progress-service.js'), 'utf8'), context);
  return { TP: context.TutorialProgress, Prog: context.TutorialProgram };
}

describe('TutorialProgress', () => {
  let TP;
  let Prog;

  beforeEach(() => {
    ({ TP, Prog } = loadTutorialModules());
  });

  it('treats empty profile as new player', () => {
    assert.equal(TP.isNewPlayer(), true);
    assert.equal(TP.mustCompleteOnboarding(), true);
    assert.equal(TP.canSkipTutorial(), false);
  });

  it('unlocks steps sequentially', () => {
    assert.equal(TP.isStepUnlocked(0), true);
    assert.equal(TP.isStepUnlocked(1), false);
    TP.completeStep('place-so');
    assert.equal(TP.isStepUnlocked(1), true);
    assert.equal(TP.isStepCompleted('place-so'), true);
  });

  it('finishes onboarding after all tutorial steps', () => {
    assert.equal(Prog.TOTAL_STEPS, 8);
    Prog.STEPS.forEach((step) => TP.completeStep(step.id));
    const state = TP.load();
    assert.equal(state.onboardingComplete, true);
    assert.equal(TP.mustCompleteOnboarding(), false);
    assert.equal(TP.canSkipTutorial(), true);
  });
});
