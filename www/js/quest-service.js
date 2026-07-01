/**
 * Daily & weekly quests — deterministic rotation, progress, XP + coin rewards.
 */
(function (global) {
  'use strict';

  const DAILY_COUNT = 3;
  const WEEKLY_COUNT = 5;

  const QUEST_DEFS = {
    'daily-wordle': {
      id: 'daily-wordle',
      scope: 'daily',
      type: 'complete_daily_wordle',
      target: 1,
      xp: 15,
      coins: 8,
      icon: '📝',
      tier: 'daily',
    },
    'daily-match': {
      id: 'daily-match',
      scope: 'daily',
      type: 'complete_daily_match',
      target: 1,
      xp: 20,
      coins: 10,
      icon: '🧩',
      tier: 'daily',
    },
    'match-1': {
      id: 'match-1',
      scope: 'daily',
      type: 'korean_match_win',
      target: 1,
      xp: 12,
      coins: 6,
      icon: '🎯',
      tier: 'daily',
    },
    'builder-1': {
      id: 'builder-1',
      scope: 'daily',
      type: 'hangul_builder_win',
      target: 1,
      xp: 10,
      coins: 5,
      icon: '🔤',
      tier: 'daily',
    },
    'wordle-1': {
      id: 'wordle-1',
      scope: 'daily',
      type: 'wordle_practice_win',
      target: 1,
      xp: 12,
      coins: 6,
      icon: '✏️',
      tier: 'daily',
    },
    'play-2': {
      id: 'play-2',
      scope: 'daily',
      type: 'any_activity',
      target: 2,
      xp: 10,
      coins: 5,
      icon: '⭐',
      tier: 'daily',
    },
    'weekly-match-8': {
      id: 'weekly-match-8',
      scope: 'weekly',
      type: 'korean_match_win',
      target: 8,
      xp: 80,
      coins: 40,
      icon: '🏆',
      tier: 'weekly',
    },
    'weekly-builder-5': {
      id: 'weekly-builder-5',
      scope: 'weekly',
      type: 'hangul_builder_win',
      target: 5,
      xp: 60,
      coins: 30,
      icon: '🔤',
      tier: 'weekly',
    },
    'weekly-wordle-5': {
      id: 'weekly-wordle-5',
      scope: 'weekly',
      type: 'wordle_any_win',
      target: 5,
      xp: 70,
      coins: 35,
      icon: '📝',
      tier: 'weekly',
    },
    'weekly-daily-4': {
      id: 'weekly-daily-4',
      scope: 'weekly',
      type: 'complete_daily_any',
      target: 4,
      xp: 90,
      coins: 45,
      icon: '📅',
      tier: 'weekly',
    },
    'weekly-days-4': {
      id: 'weekly-days-4',
      scope: 'weekly',
      type: 'learning_days',
      target: 4,
      xp: 85,
      coins: 40,
      icon: '🔥',
      tier: 'weekly',
    },
    'weekly-play-12': {
      id: 'weekly-play-12',
      scope: 'weekly',
      type: 'any_activity',
      target: 12,
      xp: 75,
      coins: 38,
      icon: '⭐',
      tier: 'weekly',
    },
    'weekly-vowel': {
      id: 'weekly-vowel',
      scope: 'weekly',
      type: 'vowel_practice_complete',
      target: 1,
      xp: 50,
      coins: 25,
      icon: '🔀',
      tier: 'weekly',
    },
  };

  const DAILY_POOL = [
    'daily-wordle', 'daily-match', 'match-1', 'builder-1', 'wordle-1', 'play-2',
  ];

  const WEEKLY_POOL = [
    'weekly-match-8', 'weekly-builder-5', 'weekly-wordle-5',
    'weekly-daily-4', 'weekly-days-4', 'weekly-play-12', 'weekly-vowel',
  ];

  const EVENT_TYPES = {
    hangulBuilder: ['hangul_builder_win', 'any_activity'],
    koreanMatch: ['korean_match_win', 'any_activity'],
    vowelPractice: ['vowel_practice_complete', 'any_activity'],
    dailyMatch: ['complete_daily_match', 'complete_daily_any', 'any_activity'],
    dailyWordle: ['complete_daily_wordle', 'complete_daily_any', 'wordle_any_win', 'any_activity'],
    wordlePractice: ['wordle_practice_win', 'wordle_any_win', 'any_activity'],
  };

  function getTodayKey() {
    return global.ProfileService?.getTodayKey?.()
      || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  }

  function getWeekKey() {
    const today = getTodayKey();
    const d = new Date(`${today}T12:00:00+09:00`);
    const day = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function pickFromPool(pool, count, seedKey) {
    const items = [...pool];
    let seed = hashString(seedKey);
    for (let i = items.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items.slice(0, count);
  }

  function emptyQuestState() {
    return {
      dailyKey: '',
      daily: [],
      weeklyKey: '',
      weekly: [],
      weeklyPlayDays: [],
    };
  }

  function normalizeQuestEntry(raw, questId) {
    const def = QUEST_DEFS[questId];
    if (!def) return null;
    return {
      questId,
      progress: Math.max(0, parseInt(raw?.progress, 10) || 0),
      claimed: !!raw?.claimed,
      target: def.target,
    };
  }

  function ensureQuestState(profile) {
    if (!profile.questState || typeof profile.questState !== 'object') {
      profile.questState = emptyQuestState();
    }
    const qs = profile.questState;
    if (!Array.isArray(qs.daily)) qs.daily = [];
    if (!Array.isArray(qs.weekly)) qs.weekly = [];
    if (!Array.isArray(qs.weeklyPlayDays)) qs.weeklyPlayDays = [];

    const today = getTodayKey();
    const week = getWeekKey();

    if (qs.dailyKey !== today) {
      qs.dailyKey = today;
      qs.daily = pickFromPool(DAILY_POOL, DAILY_COUNT, `daily:${today}`).map((id) => ({
        questId: id,
        progress: 0,
        claimed: false,
        target: QUEST_DEFS[id].target,
      }));
    }

    if (qs.weeklyKey !== week) {
      qs.weeklyKey = week;
      qs.weeklyPlayDays = [];
      qs.weekly = pickFromPool(WEEKLY_POOL, WEEKLY_COUNT, `weekly:${week}`).map((id) => ({
        questId: id,
        progress: 0,
        claimed: false,
        target: QUEST_DEFS[id].target,
      }));
    }

    return qs;
  }

  function getQuestDef(questId) {
    return QUEST_DEFS[questId] || null;
  }

  function getQuestSnapshot() {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) {
      return { daily: [], weekly: [], dailyKey: '', weeklyKey: '' };
    }
    const qs = ensureQuestState(profile);
    global.ProfileService?.saveProfile?.(profile);
    return {
      dailyKey: qs.dailyKey,
      weeklyKey: qs.weeklyKey,
      daily: qs.daily.map((q) => ({ ...q, def: getQuestDef(q.questId) })),
      weekly: qs.weekly.map((q) => ({ ...q, def: getQuestDef(q.questId) })),
    };
  }

  function incrementQuestList(list, types, amount) {
    const completed = [];
    list.forEach((entry) => {
      if (entry.claimed) return;
      const def = QUEST_DEFS[entry.questId];
      if (!def || !types.includes(def.type)) return;
      entry.progress = Math.min(entry.target, entry.progress + amount);
      if (entry.progress >= entry.target) completed.push(entry);
    });
    return completed;
  }

  function claimQuestRewards(profile, entries) {
    const results = [];
    entries.forEach((entry) => {
      if (entry.claimed) return;
      const def = QUEST_DEFS[entry.questId];
      if (!def || entry.progress < entry.target) return;
      entry.claimed = true;
      profile.totalXp = (profile.totalXp || 0) + def.xp;
      profile.coins = (profile.coins || 0) + def.coins;
      results.push({
        questId: entry.questId,
        xp: def.xp,
        coins: def.coins,
        icon: def.icon,
      });
    });
    return results;
  }

  /**
   * Record game activity for quest progress.
   * @param {'hangulBuilder'|'koreanMatch'|'vowelPractice'|'dailyMatch'|'dailyWordle'|'wordlePractice'} mode
   */
  function recordActivity(mode) {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return [];

    const qs = ensureQuestState(profile);
    const types = EVENT_TYPES[mode];
    if (!types?.length) {
      global.ProfileService?.saveProfile?.(profile);
      return [];
    }

    const today = getTodayKey();
    if (!qs.weeklyPlayDays.includes(today)) {
      qs.weeklyPlayDays.push(today);
      incrementQuestList(qs.weekly, ['learning_days'], 1);
    }

    const readyDaily = incrementQuestList(qs.daily, types, 1);
    const readyWeekly = incrementQuestList(qs.weekly, types, 1);
    const toClaim = [...readyDaily, ...readyWeekly];
    const rewards = claimQuestRewards(profile, toClaim);

    global.ProfileService?.saveProfile?.(profile);

    if (rewards.length) {
      global.PlayerHud?.refresh?.();
      const menuRoot = document.getElementById('menu-root');
      if (menuRoot) global.QuestUI?.refreshSection?.(menuRoot);
    }

    return rewards;
  }

  function countIncomplete(snapshot) {
    const all = [...(snapshot?.daily || []), ...(snapshot?.weekly || [])];
    return all.filter((q) => !q.claimed && q.progress < q.target).length;
  }

  global.QuestService = {
    DAILY_COUNT,
    WEEKLY_COUNT,
    QUEST_DEFS,
    getTodayKey,
    getWeekKey,
    getQuestDef,
    getQuestSnapshot,
    recordActivity,
    countIncomplete,
  };
})(typeof window !== 'undefined' ? window : globalThis);
