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
global.BuffService = {
  scaleCoins: (n) => n,
  scaleXp: (n) => n,
  activate: () => {},
};
global.document = { getElementById: () => null };

require('../www/js/quest-service.js');
require('../www/js/chest-room-service.js');

const QS = global.QuestService;
const CRS = global.ChestRoomService;
const WS = global.WheelService;

function makeProfile(dailyEntries) {
  return {
    displayName: 'chest-tester',
    coins: 200,
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

assert.equal(QS.isDailyWheelAvailable(savedProfile), true, 'mega unlocks when daily objectives are complete');
assert.equal(CRS.isDailyMegaAvailable(savedProfile), true, 'chest room delegates availability to quest service');
assert.equal(WS.isDailyWheelAvailable(savedProfile), true, 'WheelService alias still works');

const free = CRS.claimFreeMega();
assert.equal(free.ok, true, 'claimFreeMega succeeds after syncing quest state');
assert.equal(free.tierId, 'mega', 'free claim is mega tier');
assert.equal(savedProfile.questState.dailyWheelClaimed, true, 'marks claimed after free mega');
assert(savedProfile.questState.daily.every((q) => q.claimed), 'free mega auto-claims completed daily quests');
assert.equal(CRS.claimFreeMega().ok, false, 'second free mega same day is blocked');

savedProfile.questState.dailyWheelClaimed = false;
savedProfile.questState.daily[0].claimed = true;
savedProfile.questState.daily[0].progress = 0;
assert.equal(QS.isDailyWheelAvailable(savedProfile), false, 'mega stays locked until all objectives are complete');

savedProfile.coins = 200;
const buyWooden = CRS.buyChest('wooden');
assert.equal(buyWooden.ok, true, 'can buy wooden chest');
assert.equal(buyWooden.tierId, 'wooden', 'wooden tier id');
assert.equal(savedProfile.coins < 200, true, 'buying deducts coins');

savedProfile.coins = 5;
assert.equal(CRS.buyChest('original').ok, false, 'cannot buy without enough coins');
assert.equal(CRS.buyChest('original').reason, 'insufficient', 'insufficient reason');

const tiers = CRS.listTiers();
assert.deepEqual(tiers.map((t) => t.id), ['wooden', 'original', 'mega'], 'tier order wooden → original → mega');

console.log('chest-room-service.test.js: all passed');
