/**
 * Daily & weekly quests — deterministic rotation, progress, XP + coin rewards.
 */
(function (global) {
  'use strict';

  const DAILY_COUNT = 3;
  const WEEKLY_COUNT = 5;

  const QUEST_DEFS = {
    'daily-play': {
      id: 'daily-play',
      scope: 'daily',
      type: 'daily_match_play',
      target: 1,
      xp: 15,
      coins: 8,
      icon: '📅',
      tier: 'daily',
    },
    'daily-related-chain': {
      id: 'daily-related-chain',
      scope: 'daily',
      type: 'related_words_link',
      target: 1,
      xp: 18,
      coins: 10,
      icon: '🔗',
      tier: 'daily',
    },
    'classic-play-3': {
      id: 'classic-play-3',
      scope: 'daily',
      type: 'korean_match_play',
      target: 3,
      xp: 15,
      coins: 8,
      icon: '🎯',
      tier: 'daily',
    },
    'friend-battle': {
      id: 'friend-battle',
      scope: 'daily',
      type: 'friend_battle_play',
      target: 1,
      xp: 15,
      coins: 8,
      icon: '⚔️',
      tier: 'daily',
    },
    'login-streak-3': {
      id: 'login-streak-3',
      scope: 'daily',
      type: 'login_streak',
      target: 3,
      xp: 15,
      coins: 8,
      icon: '🔥',
      tier: 'daily',
    },
    'daily-under-3': {
      id: 'daily-under-3',
      scope: 'daily',
      type: 'daily_match_under_3',
      target: 1,
      xp: 50,
      coins: 25,
      icon: '⚡',
      tier: 'daily-medium',
    },
    'classic-first-try': {
      id: 'classic-first-try',
      scope: 'daily',
      type: 'korean_match_first_try',
      target: 1,
      xp: 50,
      coins: 25,
      icon: '💫',
      tier: 'daily-medium',
    },
    'race-win': {
      id: 'race-win',
      scope: 'daily',
      type: 'jamodle_pvp_win',
      target: 1,
      xp: 50,
      coins: 25,
      icon: '⚔️',
      tier: 'daily-medium',
    },
    'coop-win': {
      id: 'coop-win',
      scope: 'daily',
      type: 'coop_win',
      target: 1,
      xp: 50,
      coins: 25,
      icon: '🤝',
      tier: 'daily-medium',
    },
    'total-5-wins': {
      id: 'total-5-wins',
      scope: 'daily',
      type: 'total_wins_today',
      target: 5,
      xp: 50,
      coins: 25,
      icon: '🏆',
      tier: 'daily-medium',
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
    'weekly-match-3': {
      id: 'weekly-match-3',
      scope: 'weekly',
      type: 'korean_match_win',
      target: 3,
      xp: 45,
      coins: 22,
      icon: '🎯',
      tier: 'weekly',
    },
    'weekly-jamodle-5': {
      id: 'weekly-jamodle-5',
      scope: 'weekly',
      type: 'korean_match_win',
      target: 5,
      xp: 70,
      coins: 35,
      icon: '📝',
      tier: 'weekly',
    },
    'weekly-related-3': {
      id: 'weekly-related-3',
      scope: 'weekly',
      type: 'complete_related_chain',
      target: 3,
      xp: 75,
      coins: 38,
      icon: '🔗',
      tier: 'weekly',
    },
    'weekly-related-links-5': {
      id: 'weekly-related-links-5',
      scope: 'weekly',
      type: 'related_words_link',
      target: 5,
      xp: 65,
      coins: 32,
      icon: '🧩',
      tier: 'weekly',
    },
    'weekly-word-chain-2': {
      id: 'weekly-word-chain-2',
      scope: 'weekly',
      type: 'word_chain_win',
      target: 2,
      xp: 55,
      coins: 28,
      icon: '⛓️',
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
  };

  const RETIRED_WEEKLY_QUEST_IDS = new Set([
    'weekly-builder-5',
    'weekly-vowel',
  ]);

  const RETIRED_DAILY_QUEST_IDS = new Set([
    'daily-jamodle',
    'daily-match',
    'classic-jamodle-3',
    'login-streak-3',
  ]);

  const DAILY_POOL = [
    'daily-play',
    'classic-play-3',
    'friend-battle',
    'daily-under-3',
    'classic-first-try',
    'race-win',
    'total-5-wins',
    'daily-related-chain',
    'match-1',
    'play-2',
  ];

  const WEEKLY_POOL = [
    'weekly-match-8', 'weekly-match-3', 'weekly-jamodle-5', 'weekly-related-3',
    'weekly-related-links-5', 'weekly-word-chain-2', 'weekly-daily-4',
    'weekly-days-4', 'weekly-play-12',
  ];

  const EVENT_TYPES = {
    hangulBuilder: ['any_activity'],
    koreanMatch: ['korean_match_play', 'korean_match_win', 'any_activity'],
    vowelPractice: ['any_activity'],
    dailyMatch: ['daily_match_play', 'complete_daily_match', 'complete_daily_any', 'any_activity'],
    relatedWords: ['related_words_link', 'any_activity'],
    relatedWordsChain: ['complete_related_chain', 'any_activity'],
    wordChain: ['any_activity'],
    tutorial: ['any_activity'],
    battle: [],
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

  function resolveQuestEvents(mode, meta) {
    const events = [];
    const add = (type, amount = 1) => {
      if (!type || amount <= 0) return;
      events.push({ type, amount });
    };

    const won = !!meta?.won;
    const guessCount = meta?.guessCount != null ? meta.guessCount : null;

    (EVENT_TYPES[mode] || []).forEach((type) => add(type));

    if (mode === 'dailyMatch') {
      if (won) {
        add('total_wins_today');
        if (guessCount != null && guessCount <= 3) add('daily_match_under_3');
      }
    } else if (mode === 'koreanMatch') {
      if (won) {
        add('total_wins_today');
        if (guessCount === 1) add('korean_match_first_try');
      }
    } else if (mode === 'wordChain') {
      if (won) {
        add('word_chain_win');
        add('total_wins_today');
      }
    } else if (mode === 'relatedWords' && won) {
      add('total_wins_today');
    }

    if (meta?.friendBattle) add('friend_battle_play');
    if (meta?.coopWin) add('coop_win');
    if (meta?.jamodlePvpWin) add('jamodle_pvp_win');

    return events;
  }

  function syncLoginStreakQuests(list) {
    const streak = global.LearningStreak?.loadStreak?.()?.currentStreak || 0;
    list.forEach((entry) => {
      const def = QUEST_DEFS[entry.questId];
      if (!def || def.type !== 'login_streak' || entry.claimed) return;
      entry.progress = Math.min(def.target, streak);
    });
  }

  function purgeRetiredWeeklyQuests(qs, week) {
    const kept = (qs.weekly || []).filter((entry) => !RETIRED_WEEKLY_QUEST_IDS.has(entry.questId));
    const have = new Set(kept.map((entry) => entry.questId));
    const replacements = WEEKLY_POOL.filter((id) => !have.has(id));
    let seed = hashString(`weekly-migrate:${week}:${kept.map((q) => q.questId).join(',')}`);
    while (kept.length < WEEKLY_COUNT && replacements.length) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const idx = seed % replacements.length;
      const questId = replacements.splice(idx, 1)[0];
      const def = QUEST_DEFS[questId];
      if (!def) continue;
      kept.push({
        questId,
        progress: 0,
        claimed: false,
        target: def.target,
      });
      have.add(questId);
    }
    qs.weekly = kept.slice(0, WEEKLY_COUNT);
  }

  function buildDailyQuestIds(today) {
    return pickFromPool(DAILY_POOL, DAILY_COUNT, `daily:${today}`);
  }

  function syncDailyQuestList(qs, today) {
    const expectedIds = buildDailyQuestIds(today);
    const byId = Object.fromEntries((qs.daily || []).map((q) => [q.questId, q]));
    qs.daily = expectedIds.map((id) => {
      const def = QUEST_DEFS[id];
      const existing = byId[id];
      if (!def) return null;
      if (existing) {
        return {
          questId: id,
          progress: Math.min(def.target, existing.progress || 0),
          claimed: !!existing.claimed,
          target: def.target,
        };
      }
      return {
        questId: id,
        progress: 0,
        claimed: false,
        target: def.target,
      };
    }).filter(Boolean);
    syncLoginStreakQuests(qs.daily);
  }

  function emptyQuestState() {
    return {
      dailyKey: '',
      daily: [],
      weeklyKey: '',
      weekly: [],
      weeklyPlayDays: [],
      dailyWheelClaimed: false,
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
    if (typeof qs.dailyWheelClaimed !== 'boolean') qs.dailyWheelClaimed = false;

    const today = getTodayKey();
    const week = getWeekKey();

    if (qs.dailyKey !== today) {
      qs.dailyKey = today;
      qs.dailyWheelClaimed = false;
      qs.daily = buildDailyQuestIds(today).map((id) => ({
        questId: id,
        progress: 0,
        claimed: false,
        target: QUEST_DEFS[id].target,
      }));
      syncLoginStreakQuests(qs.daily);
    } else {
      const expected = buildDailyQuestIds(today);
      const currentIds = qs.daily.map((q) => q.questId);
      const hasRetired = qs.daily.some((q) => RETIRED_DAILY_QUEST_IDS.has(q.questId));
      if (hasRetired || currentIds.length !== expected.length || expected.some((id) => !currentIds.includes(id))) {
        syncDailyQuestList(qs, today);
      } else {
        syncLoginStreakQuests(qs.daily);
      }
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
    } else {
      purgeRetiredWeeklyQuests(qs, week);
    }

    return qs;
  }

  function getQuestDef(questId) {
    return QUEST_DEFS[questId] || null;
  }

  function getQuestSnapshot() {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) {
      return { daily: [], weekly: [], dailyKey: '', weeklyKey: '', dailyWheelClaimed: false };
    }
    const qs = ensureQuestState(profile);
    global.ProfileService?.saveProfile?.(profile);
    return {
      dailyKey: qs.dailyKey,
      weeklyKey: qs.weeklyKey,
      dailyWheelClaimed: qs.dailyWheelClaimed,
      daily: qs.daily.map((q) => ({ ...q, def: getQuestDef(q.questId) })),
      weekly: qs.weekly.map((q) => ({ ...q, def: getQuestDef(q.questId) })),
    };
  }

  function allDailyComplete(qs) {
    const daily = qs.daily || [];
    if (!daily.length) return false;
    return daily.every((q) => q.claimed && q.progress >= q.target);
  }

  function allDailyObjectivesComplete(qs) {
    const daily = qs.daily || [];
    if (!daily.length) return false;
    return daily.every((q) => {
      const target = q.target ?? QUEST_DEFS[q.questId]?.target ?? 1;
      return q.progress >= target;
    });
  }

  function claimCompletedDailies(profile) {
    if (!profile) return [];
    const qs = ensureQuestState(profile);
    const pending = qs.daily.filter((q) => {
      const target = q.target ?? QUEST_DEFS[q.questId]?.target ?? 1;
      return !q.claimed && q.progress >= target;
    });
    if (!pending.length) return [];
    const rewards = claimQuestRewards(profile, pending);
    global.ProfileService?.saveProfile?.(profile);
    return rewards;
  }

  function isDailyWheelAvailable(profile) {
    if (!profile) return false;
    const qs = ensureQuestState(profile);
    return allDailyObjectivesComplete(qs) && !qs.dailyWheelClaimed;
  }

  function incrementQuestList(list, events) {
    const completed = [];
    const counts = {};
    events.forEach(({ type, amount }) => {
      counts[type] = (counts[type] || 0) + amount;
    });

    list.forEach((entry) => {
      if (entry.claimed) return;
      const def = QUEST_DEFS[entry.questId];
      if (!def) return;
      const amount = counts[def.type];
      if (!amount) return;
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

  function refreshQuestUi() {
    global.PlayerHud?.refresh?.();
    const menuRoot = document.getElementById('menu-root');
    if (menuRoot) global.QuestUI?.refreshSection?.(menuRoot);
  }

  /**
   * Record game activity for quest progress.
   * @param {string} mode
   * @param {{ won?: boolean, guessCount?: number, friendBattle?: boolean, coopWin?: boolean }} [meta]
   */
  function recordActivity(mode, meta) {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return { rewards: [], wheelAvailable: false };

    const qs = ensureQuestState(profile);
    const events = resolveQuestEvents(mode, meta || {});
    if (!events.length) {
      global.ProfileService?.saveProfile?.(profile);
      return { rewards: [], wheelAvailable: false };
    }

    const today = getTodayKey();
    if (!qs.weeklyPlayDays.includes(today)) {
      qs.weeklyPlayDays.push(today);
      events.push({ type: 'learning_days', amount: 1 });
    }

    syncLoginStreakQuests(qs.daily);

    const readyDaily = incrementQuestList(qs.daily, events);
    const readyWeekly = incrementQuestList(qs.weekly, events);
    const readyToClaim = [...readyDaily, ...readyWeekly];

    global.ProfileService?.saveProfile?.(profile);

    if (readyToClaim.length) refreshQuestUi();

    return { rewards: [], readyToClaim, wheelAvailable: false };
  }

  function claimQuest(questId) {
    const profile = global.ProfileService?.loadProfile?.();
    if (!profile) return { ok: false, rewards: [], wheelAvailable: false };

    const qs = ensureQuestState(profile);
    const entry = [...qs.daily, ...qs.weekly].find((q) => q.questId === questId);
    if (!entry || entry.claimed || entry.progress < entry.target) {
      global.ProfileService?.saveProfile?.(profile);
      return { ok: false, rewards: [], wheelAvailable: false };
    }

    const rewards = claimQuestRewards(profile, [entry]);
    global.ProfileService?.saveProfile?.(profile);
    global.PlayerHud?.refresh?.();

    const wheelAvailable = isDailyWheelAvailable(profile);
    const menuRoot = document.getElementById('menu-root');
    if (menuRoot) global.QuestUI?.refreshSection?.(menuRoot);

    return { ok: true, rewards, wheelAvailable };
  }

  function countCompleted(snapshot) {
    const all = [...(snapshot?.daily || []), ...(snapshot?.weekly || [])];
    return all.filter((q) => q.progress >= q.target).length;
  }

  function countIncomplete(snapshot) {
    const all = [...(snapshot?.daily || []), ...(snapshot?.weekly || [])];
    let count = all.filter((q) => !q.claimed).length;
    if (global.WheelService?.isDailyWheelAvailable?.(global.ProfileService?.loadProfile?.())) {
      count += 1;
    }
    return count;
  }

  function msUntilDailyReset() {
    const today = getTodayKey();
    const anchor = new Date(`${today}T12:00:00+09:00`);
    anchor.setUTCDate(anchor.getUTCDate() + 1);
    const nextKey = anchor.toISOString().slice(0, 10);
    const resetAt = new Date(`${nextKey}T00:00:00+09:00`);
    return Math.max(0, resetAt.getTime() - Date.now());
  }

  function msUntilWeeklyReset() {
    const weekKey = getWeekKey();
    const nextMonday = new Date(`${weekKey}T12:00:00+09:00`);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    const resetKey = nextMonday.toISOString().slice(0, 10);
    const resetAt = new Date(`${resetKey}T00:00:00+09:00`);
    return Math.max(0, resetAt.getTime() - Date.now());
  }

  function formatRefreshCountdown(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function getRefreshMs(scope) {
    return scope === 'weekly' ? msUntilWeeklyReset() : msUntilDailyReset();
  }

  global.QuestService = {
    DAILY_COUNT,
    WEEKLY_COUNT,
    QUEST_DEFS,
    DAILY_POOL,
    buildDailyQuestIds,
    getTodayKey,
    getWeekKey,
    getQuestDef,
    getQuestSnapshot,
    recordActivity,
    claimQuest,
    countIncomplete,
    countCompleted,
    isDailyWheelAvailable,
    allDailyComplete,
    allDailyObjectivesComplete,
    claimCompletedDailies,
    msUntilDailyReset,
    msUntilWeeklyReset,
    formatRefreshCountdown,
    getRefreshMs,
  };
})(typeof window !== 'undefined' ? window : globalThis);
