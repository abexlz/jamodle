'use strict';

const assert = require('assert');

let savedProfile = null;
let todayKey = '2026-07-23';
let yesterdayKey = '2026-07-22';

global.ProfileService = {
  getTodayKey: () => todayKey,
  loadProfile: () => savedProfile,
  saveProfile: (profile) => {
    savedProfile = profile;
  },
};

global.PlayerHud = { refresh: () => {} };
global.HintTokens = { grant: (n) => { global._hintGranted = (global._hintGranted || 0) + n; } };
global.document = { getElementById: () => null };

require('../www/js/daily-gift-service.js');

const DG = global.DailyGiftService;

function makeProfile(overrides = {}) {
  return {
    coins: 0,
    totalXp: 0,
    extraGuessTokens: 0,
    lastDailyGiftDayKey: '',
    dailyLoginStreakDay: 1,
    ...overrides,
  };
}

savedProfile = makeProfile();
assert.equal(DG.canClaimToday(), true, 'new player can claim');
assert.equal(DG.resolveClaimDay(savedProfile).claimDay, 1, 'new player starts at day 1');

const first = DG.claimToday();
assert.equal(first.ok, true, 'first claim succeeds');
assert.equal(first.claimDay, 1, 'first claim is day 1');
assert.equal(savedProfile.coins, 10, 'day 1 awards 10 coins');
assert.equal(savedProfile.dailyLoginStreakDay, 2, 'streak advances to day 2');
assert.equal(savedProfile.lastDailyGiftDayKey, todayKey, 'last claim day saved');
assert.equal(DG.canClaimToday(), false, 'cannot claim twice same day');

savedProfile = makeProfile({
  lastDailyGiftDayKey: yesterdayKey,
  dailyLoginStreakDay: 5,
});
const consecutive = DG.claimToday();
assert.equal(consecutive.ok, true, 'consecutive claim succeeds');
assert.equal(consecutive.claimDay, 5, 'claims current streak day');
assert.equal(savedProfile.coins, 15, 'day 5 awards 15 coins');
assert.equal(savedProfile.dailyLoginStreakDay, 6, 'streak advances to day 6');

savedProfile = makeProfile({
  lastDailyGiftDayKey: '2026-07-20',
  dailyLoginStreakDay: 8,
});
assert.equal(DG.getTrackSnapshot().streakBroken, true, 'snapshot flags broken streak');
const broken = DG.claimToday();
assert.equal(broken.ok, true, 'broken streak claim succeeds');
assert.equal(broken.claimDay, 1, 'broken streak resets to day 1');

savedProfile = makeProfile({
  lastDailyGiftDayKey: yesterdayKey,
  dailyLoginStreakDay: 30,
});
const finale = DG.claimToday();
assert.equal(finale.ok, true, 'day 30 claim succeeds');
assert.equal(finale.claimDay, 30, 'claims day 30');
assert.equal(finale.cycleComplete, true, 'marks cycle complete');
assert.equal(savedProfile.coins, 100, 'day 30 awards 100 coins');
assert.equal(savedProfile.dailyLoginStreakDay, 1, 'cycle restarts at day 1');

savedProfile = makeProfile({
  lastDailyGiftDayKey: yesterdayKey,
  dailyLoginStreakDay: 7,
});
global._hintGranted = 0;
const hintDay = DG.claimToday();
assert.equal(hintDay.ok, true, 'hint day claim succeeds');
assert.equal(hintDay.reward.type, 'hintToken', 'day 7 is hint token');
assert.equal(global._hintGranted, 1, 'hint token granted');

savedProfile = makeProfile({
  lastDailyGiftDayKey: yesterdayKey,
  dailyLoginStreakDay: 3,
});
const snap = DG.getTrackSnapshot();
assert.equal(snap.days.length, 30, 'track has 30 days');
assert.equal(snap.days.filter((d) => d.state === 'today').length, 1, 'exactly one today cell');

console.log('daily-gift.test.js: all passed');
