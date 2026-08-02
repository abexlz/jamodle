'use strict';

const assert = require('assert');

global.document = {
  getElementById: () => null,
};

global.LearningStreak = {
  loadStreak: () => ({ currentStreak: 4 }),
};

let savedProfile = null;
function makeProfile(overrides = {}) {
  return {
    totalXp: 0,
    coins: 0,
    questState: {
      dailyKey: '2026-07-14',
      daily: [
        { questId: 'daily-jamodle', progress: 0, claimed: false, target: 1 },
        { questId: 'daily-match', progress: 1, claimed: false, target: 1 },
        { questId: 'daily-related-chain', progress: 0, claimed: false, target: 1 },
      ],
      weeklyKey: '2026-07-07',
      weekly: [
        { questId: 'weekly-builder-5', progress: 0, claimed: false, target: 5 },
        { questId: 'weekly-vowel', progress: 0, claimed: false, target: 1 },
        { questId: 'weekly-match-8', progress: 2, claimed: false, target: 8 },
      ],
      weeklyPlayDays: [],
      dailyWheelClaimed: false,
      ...overrides.questState,
    },
    ...overrides,
  };
}

global.ProfileService = {
  getTodayKey: () => '2026-07-14',
  loadProfile: () => savedProfile || makeProfile(),
  saveProfile: (profile) => {
    savedProfile = profile;
  },
};

require('../www/js/quest-service.js');

const QS = global.QuestService;

assert(!QS.QUEST_DEFS['daily-jamodle'], 'daily-jamodle removed');
assert(!QS.QUEST_DEFS['daily-match'], 'daily-match removed');
assert(QS.QUEST_DEFS['daily-play']?.type === 'daily_match_play', 'daily-play quest added');
assert(QS.QUEST_DEFS['classic-play-3']?.target === 3, 'classic-play-3 requires 3 plays');
assert(QS.QUEST_DEFS['total-5-wins']?.target === 5, 'total-5-wins requires 5 wins');
assert(!QS.QUEST_DEFS['weekly-builder-5'], 'builder weekly quest removed');
assert(!QS.QUEST_DEFS['weekly-vowel'], 'vowel weekly quest removed');
assert(QS.QUEST_DEFS['weekly-word-chain-2']?.type === 'word_chain_win', 'word chain quest added');
assert(QS.QUEST_DEFS['weekly-jamodle-5']?.type === 'korean_match_win', 'weekly jamodle uses match wins');
assert(QS.QUEST_DEFS['race-win']?.type === 'jamodle_pvp_win', 'race-win tracks 1v1 jamodle wins');
assert(QS.DAILY_POOL.includes('race-win'), 'race-win stays in daily pool');
assert(!QS.DAILY_POOL.includes('login-streak-3'), 'login-streak removed from daily pool');
assert(!QS.DAILY_POOL.includes('coop-win'), 'coop-win removed from daily pool');

const snap = QS.getQuestSnapshot();
assert.equal(snap.daily.length, QS.DAILY_COUNT, 'daily quest count stays at 3');
assert(!snap.daily.some((q) => q.questId === 'daily-jamodle'), 'retired daily-jamodle purged');
assert(!snap.daily.some((q) => q.questId === 'daily-match'), 'retired daily-match purged');
assert(snap.daily.every((q) => QS.DAILY_POOL.includes(q.questId)), 'daily quests come from pool');
assert(!snap.weekly.some((q) => q.questId === 'weekly-builder-5'), 'retired builder quest purged');
assert.equal(snap.weekly.length, QS.WEEKLY_COUNT, 'weekly quest list stays full after migration');

const dailyPlay = snap.daily.find((q) => q.questId === 'daily-play');
if (dailyPlay) {
  QS.recordActivity('dailyMatch', { won: false });
  const snap2 = QS.getQuestSnapshot();
  const updated = snap2.daily.find((q) => q.questId === 'daily-play');
  assert(updated && updated.progress >= 1, 'daily play counts before win');
}

let raceWinDay = null;
for (let offset = 0; offset < 500; offset += 1) {
  const d = new Date(Date.UTC(2026, 0, 1 + offset));
  const key = d.toISOString().slice(0, 10);
  if (QS.buildDailyQuestIds(key).includes('race-win')) {
    raceWinDay = key;
    break;
  }
}
assert(raceWinDay, 'found a day with race-win quest');
global.ProfileService.getTodayKey = () => raceWinDay;
savedProfile = makeProfile({
  questState: {
    dailyKey: raceWinDay,
    daily: QS.buildDailyQuestIds(raceWinDay).map((questId) => ({
      questId,
      progress: 0,
      claimed: false,
      target: QS.QUEST_DEFS[questId].target,
    })),
    weeklyKey: '2026-07-07',
    weekly: [],
    weeklyPlayDays: [],
    dailyWheelClaimed: false,
  },
});
const raceResult = QS.recordActivity('battle', { won: true, jamodlePvpWin: true });
assert(raceResult.readyToClaim?.some((q) => q.questId === 'race-win'), 'race win counts jamodle pvp wins');
assert(raceResult.rewards?.some((q) => q.questId === 'race-win'), 'race win auto-claims rewards');
assert(
  savedProfile.questState.daily.find((q) => q.questId === 'race-win')?.claimed,
  'race-win marked claimed after auto-claim',
);

let friendBattleDay = null;
for (let offset = 0; offset < 500; offset += 1) {
  const d = new Date(Date.UTC(2026, 0, 1 + offset));
  const key = d.toISOString().slice(0, 10);
  if (QS.buildDailyQuestIds(key).includes('friend-battle')) {
    friendBattleDay = key;
    break;
  }
}
assert(friendBattleDay, 'found a day with friend-battle quest');
global.ProfileService.getTodayKey = () => friendBattleDay;
savedProfile = makeProfile({
  questState: {
    dailyKey: friendBattleDay,
    daily: QS.buildDailyQuestIds(friendBattleDay).map((questId) => ({
      questId,
      progress: 0,
      claimed: false,
      target: QS.QUEST_DEFS[questId].target,
    })),
    weeklyKey: '2026-07-07',
    weekly: [{ questId: 'weekly-word-chain-2', progress: 0, claimed: false, target: 2 }],
    weeklyPlayDays: [],
    dailyWheelClaimed: false,
  },
});
QS.recordActivity('battle', {
  won: false,
  friendBattle: true,
});
assert.equal(
  QS.getQuestSnapshot().daily.find((q) => q.questId === 'friend-battle')?.progress,
  1,
  'friend battle play counts from 1v1 meta even on loss',
);

QS.recordActivity('battle', { won: true, wordChainWin: true });
assert.equal(
  QS.getQuestSnapshot().weekly.find((q) => q.questId === 'weekly-word-chain-2')?.progress,
  1,
  'word chain win via battle results meta counts',
);

QS.recordActivity('wordChain', { won: true });
assert.equal(
  QS.getQuestSnapshot().weekly.find((q) => q.questId === 'weekly-word-chain-2')?.progress,
  2,
  'word chain mode win still counts',
);
QS.recordActivity('wordChain', { won: false });
assert.equal(
  QS.getQuestSnapshot().weekly.find((q) => q.questId === 'weekly-word-chain-2')?.progress,
  2,
  'word chain loss does not advance win quest',
);

assert.equal(QS.countCompleted({
  daily: [{ progress: 1, target: 1, claimed: false }],
  weekly: [{ progress: 0, target: 2, claimed: false }],
}), 1, 'completed count tracks beaten quests only');
assert.equal(QS.countIncomplete({
  daily: [{ progress: 1, target: 1, claimed: true }],
  weekly: [{ progress: 0, target: 2, claimed: false }],
}), 1, 'incomplete count tracks unfinished quests only');

assert(QS.questHasChest('race-win'), 'medium daily quests award chests');
assert(QS.questHasChest('weekly-match-8'), 'weekly quests award chests');
assert(!QS.questHasChest('play-2'), 'small daily quests stay toast-only');

global.ProfileService.getTodayKey = () => raceWinDay;
savedProfile = makeProfile({
  coins: 10,
  questState: {
    dailyKey: raceWinDay,
    daily: QS.buildDailyQuestIds(raceWinDay).map((questId) => ({
      questId,
      progress: questId === 'race-win' ? QS.QUEST_DEFS[questId].target : 0,
      claimed: false,
      target: QS.QUEST_DEFS[questId].target,
    })),
    weeklyKey: '2026-07-07',
    weekly: [],
    weeklyPlayDays: [],
    dailyWheelClaimed: false,
  },
});
const chestClaim = QS.claimQuest('race-win', { deferHud: true });
assert(chestClaim.ok, 'chest quest claim succeeds');
assert(chestClaim.rewards?.[0]?.chest, 'claim result marks chest reward');
assert.equal(chestClaim.coinsBefore, 10, 'claim reports coins before reward');
assert.equal(savedProfile.coins, 10 + QS.QUEST_DEFS['race-win'].coins, 'coins granted on claim');

// Auto-claim via recordActivity when a quest crosses the finish line
global.ProfileService.getTodayKey = () => raceWinDay;
savedProfile = makeProfile({
  coins: 5,
  totalXp: 0,
  questState: {
    dailyKey: raceWinDay,
    daily: QS.buildDailyQuestIds(raceWinDay).map((questId) => ({
      questId,
      progress: 0,
      claimed: false,
      target: QS.QUEST_DEFS[questId].target,
    })),
    weeklyKey: '2026-07-07',
    weekly: [],
    weeklyPlayDays: [],
    dailyWheelClaimed: false,
  },
});
const auto = QS.recordActivity('battle', { won: true, jamodlePvpWin: true });
const raceDef = QS.QUEST_DEFS['race-win'];
assert(auto.rewards?.some((r) => r.questId === 'race-win' && r.chest), 'auto-claim returns chest reward');
assert.equal(auto.coinsBefore, 5, 'auto-claim reports pre-reward coin balance');
assert.equal(savedProfile.coins, 5 + raceDef.coins, 'auto-claim grants coins');
assert.equal(savedProfile.totalXp, raceDef.xp, 'auto-claim grants xp');

console.log('quest-service.test.js: all passed');
