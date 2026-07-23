'use strict';

const assert = require('assert');

let savedProfile = null;

global.ProfileService = {
  getTodayKey: () => '2026-07-23',
  loadProfile: () => savedProfile,
  saveProfile: (profile) => {
    savedProfile = profile;
  },
};

global.PlayerHud = { refresh: () => {} };
global.HintTokens = { grant: () => {} };
global.document = { getElementById: () => null };

require('../www/js/quest-service.js');
require('../www/js/wheel-service.js');

const QS = global.QuestService;
const WS = global.WheelService;

function makeProfile(dailyEntries) {
  return {
    displayName: 'wheel-tester',
    coins: 0,
    totalXp: 0,
    questState: {
      dailyKey: '2026-07-23',
      daily: dailyEntries,
      weeklyKey: '2026-07-21',
      weekly: [],
      weeklyPlayDays: [],
      dailyWheelClaimed: false,
    },
  };
}

const questIds = QS.buildDailyQuestIds('2026-07-23');
savedProfile = makeProfile(questIds.map((questId) => ({
  questId,
  progress: QS.QUEST_DEFS[questId].target,
  claimed: false,
  target: QS.QUEST_DEFS[questId].target,
})));

assert.equal(QS.isDailyWheelAvailable(savedProfile), true, 'wheel unlocks when daily objectives are complete');
assert.equal(WS.isDailyWheelAvailable(savedProfile), true, 'wheel service delegates availability to quest service');

const spin = WS.claimSpin();
assert.equal(spin.ok, true, 'claimSpin succeeds after syncing quest state');
assert.equal(savedProfile.questState.dailyWheelClaimed, true, 'wheel marks claimed after spin');
assert(savedProfile.questState.daily.every((q) => q.claimed), 'spin auto-claims completed daily quests');
assert.equal(WS.claimSpin().ok, false, 'second spin same day is blocked');

savedProfile.questState.dailyWheelClaimed = false;
savedProfile.questState.daily[0].claimed = true;
savedProfile.questState.daily[0].progress = 0;
assert.equal(QS.isDailyWheelAvailable(savedProfile), false, 'wheel stays locked until all objectives are complete');

console.log('wheel-service.test.js: all passed');
