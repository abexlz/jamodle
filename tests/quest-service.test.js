'use strict';

const assert = require('assert');

global.document = {
  getElementById: () => null,
};

global.LearningStreak = {
  loadStreak: () => ({ currentStreak: 4 }),
};

global.ProfileService = {
  getTodayKey: () => '2026-07-14',
  loadProfile: () => ({
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
    },
  }),
  saveProfile: () => {},
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
assert(QS.QUEST_DEFS['race-win']?.type === 'coop_win', 'race-win tracks 1v1 jamodle wins');
assert(QS.DAILY_POOL.includes('race-win'), 'race-win stays in daily pool');
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

console.log('quest-service.test.js: all passed');
