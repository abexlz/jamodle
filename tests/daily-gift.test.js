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
assert.equal(savedProfile.coins, 20, 'day 5 awards 20 coins');
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
  dailyLoginStreakDay: 7,
});
global._hintGranted = 0;
const weekFinale = DG.claimToday();
assert.equal(weekFinale.ok, true, 'day 7 claim succeeds');
assert.equal(weekFinale.claimDay, 7, 'claims day 7');
assert.equal(weekFinale.cycleComplete, true, 'marks week complete');
assert.equal(weekFinale.rewards.length, 3, 'day 7 grants multi rewards');
assert.equal(savedProfile.coins, 50, 'day 7 awards 50 coins');
assert.equal(savedProfile.totalXp, 30, 'day 7 awards 30 XP');
assert.equal(global._hintGranted, 1, 'day 7 grants hint token');
assert.equal(savedProfile.dailyLoginStreakDay, 8, 'continues into week 2 at day 8');

savedProfile = makeProfile({
  lastDailyGiftDayKey: yesterdayKey,
  dailyLoginStreakDay: 8,
});
const week2 = DG.claimToday();
assert.equal(week2.ok, true, 'week 2 day 8 claim succeeds');
assert.equal(week2.claimDay, 8, 'claims absolute day 8');
assert.equal(savedProfile.coins, 13, 'week 2 scales day-1 coins (10 * 1.25)');
assert.equal(savedProfile.dailyLoginStreakDay, 9, 'advances to day 9');

const week2Snap = DG.getTrackSnapshot();
assert.equal(week2Snap.days.length, 7, 'track shows 7 days');
assert.equal(week2Snap.weekStart, 8, 'week 2 starts at day 8');
assert.equal(week2Snap.weekEnd, 14, 'week 2 ends at day 14');
assert.equal(week2Snap.days[0].day, 8, 'first cell is day 8');
assert.equal(week2Snap.days[6].isJackpot, true, 'last cell is jackpot');
assert.equal(week2Snap.days.filter((d) => d.state === 'claimed').length, 1, 'day 8 claimed');

savedProfile = makeProfile({
  lastDailyGiftDayKey: yesterdayKey,
  dailyLoginStreakDay: 3,
});
const snap = DG.getTrackSnapshot();
assert.equal(snap.days.length, 7, 'track has 7 days');
assert.equal(snap.days.filter((d) => d.state === 'today').length, 1, 'exactly one today cell');
assert.equal(snap.days[6].rewards.length, 3, 'day 7 jackpot has 3 rewards');

console.log('daily-gift.test.js: all passed');
