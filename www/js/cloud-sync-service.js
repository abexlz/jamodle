/**
 * Cloud save — merges local jamodeul-* storage with Firestore on login.
 */
(function (global) {
  'use strict';

  const SAVE_DOC_ID = 'gameState';
  const BUNDLE_VERSION = 1;
  const PROFILE_KEY = 'jamodeul-user-profile';

  const EXACT_SYNC_KEYS = [
    PROFILE_KEY,
    'jamodeul-learning-progress',
    'jamodeul-related-words-progress',
    'jamodeul-korean-learning-streak',
    'jamodeul-builder-progress',
    'jamodeul-tutorial-progress',
    'jamodeul-tokens',
    'jamodeul-match-best-streak',
    'jamodeul-daily-calendar',
    'jamodeul-preferences',
  ];

  const PREFIX_SYNC_PREFIXES = [
    'jamodeul-daily-',
    'jamodeul-match-daily-',
  ];

  let pushTimer = null;

  function readRaw(key) {
    if (global.AppStorage) {
      const parsed = global.AppStorage.get(key, undefined);
      if (parsed !== undefined) return parsed;
      const str = global.AppStorage.getString(key, null);
      if (str != null) return str;
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch {
      return null;
    }
  }

  function writeRaw(key, value) {
    const stringKeys = new Set(['jamodeul-tokens', 'jamodeul-match-best-streak']);
    if (stringKeys.has(key) || typeof value === 'string') {
      if (global.AppStorage) global.AppStorage.setString(key, String(value));
      else localStorage.setItem(key, String(value));
      return;
    }
    if (global.AppStorage) global.AppStorage.set(key, value);
    else localStorage.setItem(key, JSON.stringify(value));
  }

  function unionStrings(a, b) {
    return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
  }

  function maxInt(a, b) {
    return Math.max(parseInt(a, 10) || 0, parseInt(b, 10) || 0);
  }

  function mergeProfiles(a, b) {
    const normalize = global.ProfileService?.normalizeProfile;
    const left = normalize ? normalize(a || {}) : (a || {});
    const right = normalize ? normalize(b || {}) : (b || {});
    const badgeMap = new Map();
    [...(left.earnedBadges || []), ...(right.earnedBadges || [])].forEach((badge) => {
      if (badge && typeof badge.id === 'string') badgeMap.set(badge.id, badge);
    });
    const recentMap = new Map();
    [...(left.recentWords || []), ...(right.recentWords || [])].forEach((entry) => {
      if (entry && typeof entry.word === 'string') {
        const k = entry.word + '|' + (entry.mode || '');
        if (!recentMap.has(k)) recentMap.set(k, entry);
      }
    });
    const pickQuest = () => {
      const l = left.questState || {};
      const r = right.questState || {};
      const lScore = (l.daily?.length || 0) + (l.weekly?.length || 0);
      const rScore = (r.daily?.length || 0) + (r.weekly?.length || 0);
      if (l.dailyKey === r.dailyKey && l.weeklyKey === r.weeklyKey) {
        return lScore >= rScore ? l : r;
      }
      if ((l.dailyKey || '') >= (r.dailyKey || '') && (l.weeklyKey || '') >= (r.weeklyKey || '')) return l;
      return r;
    };
    const merged = {
      ...left,
      totalXp: maxInt(left.totalXp, right.totalXp),
      coins: maxInt(left.coins, right.coins),
      extraGuessTokens: maxInt(left.extraGuessTokens, right.extraGuessTokens),
      lastCelebratedLevel: maxInt(left.lastCelebratedLevel, right.lastCelebratedLevel),
      ownedThemes: unionStrings(left.ownedThemes, right.ownedThemes),
      purchasedTitleIds: unionStrings(left.purchasedTitleIds, right.purchasedTitleIds),
      completedWordsEver: unionStrings(left.completedWordsEver, right.completedWordsEver),
      celebratedBadgeIds: unionStrings(left.celebratedBadgeIds, right.celebratedBadgeIds),
      unlockedAvatarIds: unionStrings(left.unlockedAvatarIds, right.unlockedAvatarIds).length
        ? unionStrings(left.unlockedAvatarIds, right.unlockedAvatarIds)
        : ['default'],
      unlockedFrameIds: unionStrings(left.unlockedFrameIds, right.unlockedFrameIds),
      learningDayKeys: unionStrings(left.learningDayKeys, right.learningDayKeys),
      earnedBadges: [...badgeMap.values()],
      recentWords: [...recentMap.values()].slice(0, 8),
      questState: pickQuest(),
      completedWordsByMode: {
        hangulBuilder: unionStrings(left.completedWordsByMode?.hangulBuilder, right.completedWordsByMode?.hangulBuilder),
        koreanMatch: unionStrings(left.completedWordsByMode?.koreanMatch, right.completedWordsByMode?.koreanMatch),
        vowelPractice: !!(left.completedWordsByMode?.vowelPractice || right.completedWordsByMode?.vowelPractice),
        dailyMatch: unionStrings(left.completedWordsByMode?.dailyMatch, right.completedWordsByMode?.dailyMatch),
        dailyWordle: unionStrings(left.completedWordsByMode?.dailyWordle, right.completedWordsByMode?.dailyWordle),
      },
      dailyXpAwards: { ...(right.dailyXpAwards || {}), ...(left.dailyXpAwards || {}) },
      stats: {
        totalActivities: maxInt(left.stats?.totalActivities, right.stats?.totalActivities),
        dailyChallengesCompleted: maxInt(
          left.stats?.dailyChallengesCompleted,
          right.stats?.dailyChallengesCompleted
        ),
      },
    };
    delete merged._level;
    return merged;
  }

  function mergeLearningProgress(a, b) {
    return {
      wordsLearned: maxInt(a?.wordsLearned, b?.wordsLearned),
      builderWordsCompleted: maxInt(a?.builderWordsCompleted, b?.builderWordsCompleted),
    };
  }

  function mergeStreak(a, b) {
    return {
      currentStreak: maxInt(a?.currentStreak, b?.currentStreak),
      longestStreak: maxInt(a?.longestStreak, b?.longestStreak),
      lastActivityDate: [a?.lastActivityDate, b?.lastActivityDate].filter(Boolean).sort().pop() || null,
      todayCompleted: !!(a?.todayCompleted || b?.todayCompleted),
      todayDate: a?.todayDate || b?.todayDate || null,
      milestonesEarned: unionStrings(a?.milestonesEarned, b?.milestonesEarned),
    };
  }

  function mergeRwProgress(a, b) {
    const soloStreak = maxInt(a?.soloStreak, b?.soloStreak);
    const bestSoloStreak = maxInt(a?.bestSoloStreak, b?.bestSoloStreak);
    return {
      chainId: a?.chainId || b?.chainId || null,
      linkIndex: maxInt(a?.linkIndex, b?.linkIndex),
      completedChainIds: unionStrings(a?.completedChainIds, b?.completedChainIds),
      cycles: maxInt(a?.cycles, b?.cycles),
      globalLinkIndex: maxInt(a?.globalLinkIndex, b?.globalLinkIndex) || null,
      solvedInChain: unionStrings(a?.solvedInChain, b?.solvedInChain),
      soloStreak,
      bestSoloStreak: Math.max(bestSoloStreak, soloStreak),
    };
  }

  function mergeTutorial(a, b) {
    const steps = unionStrings(a?.completedSteps, b?.completedSteps)
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n));
    return {
      onboardingComplete: !!(a?.onboardingComplete || b?.onboardingComplete),
      currentStep: maxInt(a?.currentStep, b?.currentStep),
      completedSteps: [...new Set(steps)].sort((x, y) => x - y),
    };
  }

  function mergeDailyState(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (typeof a !== 'object' || typeof b !== 'object') return a;
    if (a.won && !b.won) return a;
    if (b.won && !a.won) return b;
    if (a.won && b.won) {
      const aGuesses = parseInt(a.guessCount, 10);
      const bGuesses = parseInt(b.guessCount, 10);
      if (Number.isFinite(aGuesses) && Number.isFinite(bGuesses) && aGuesses !== bGuesses) {
        return aGuesses <= bGuesses ? a : b;
      }
      const aMs = parseInt(a.elapsedMs, 10);
      const bMs = parseInt(b.elapsedMs, 10);
      if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
        return aMs <= bMs ? a : b;
      }
    }
    const aGuesses = Array.isArray(a.guesses) ? a.guesses.length : parseInt(a.guessCount, 10) || 0;
    const bGuesses = Array.isArray(b.guesses) ? b.guesses.length : parseInt(b.guessCount, 10) || 0;
    return aGuesses >= bGuesses ? a : b;
  }

  function mergeKv(key, left, right, localUpdatedAt, remoteUpdatedAt) {
    if (left == null) return right;
    if (right == null) return left;
    if (key === PROFILE_KEY) return mergeProfiles(left, right);
    if (key === 'jamodeul-learning-progress') return mergeLearningProgress(left, right);
    if (key === 'jamodeul-korean-learning-streak') return mergeStreak(left, right);
    if (key === 'jamodeul-related-words-progress') return mergeRwProgress(left, right);
    if (key === 'jamodeul-tutorial-progress') return mergeTutorial(left, right);
    if (key === 'jamodeul-tokens' || key === 'jamodeul-match-best-streak') {
      return String(maxInt(left, right));
    }
    if (key.startsWith('jamodeul-daily-') || key.startsWith('jamodeul-match-daily-')) {
      return mergeDailyState(left, right);
    }
    return localUpdatedAt >= remoteUpdatedAt ? left : right;
  }

  function collectLocalBundle() {
    const kv = {};
    EXACT_SYNC_KEYS.forEach((key) => {
      const val = readRaw(key);
      if (val != null) kv[key] = val;
    });
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (PREFIX_SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          const val = readRaw(key);
          if (val != null) kv[key] = val;
        }
      }
    } catch (_) { /* ignore */ }
    return {
      version: BUNDLE_VERSION,
      updatedAt: Date.now(),
      kv,
    };
  }

  function applyBundle(bundle) {
    if (!bundle?.kv) return;
    Object.entries(bundle.kv).forEach(([key, value]) => {
      writeRaw(key, value);
    });
  }

  function mergeBundles(local, remote) {
    if (!remote?.kv) return { ...local, updatedAt: Date.now() };
    if (!local?.kv) return { ...remote, updatedAt: Date.now() };
    const localUpdatedAt = local.updatedAt || 0;
    const remoteUpdatedAt = remote.updatedAt || 0;
    const keys = new Set([...Object.keys(local.kv), ...Object.keys(remote.kv)]);
    const kv = {};
    keys.forEach((key) => {
      kv[key] = mergeKv(
        key,
        local.kv[key],
        remote.kv[key],
        localUpdatedAt,
        remoteUpdatedAt
      );
    });
    return {
      version: BUNDLE_VERSION,
      updatedAt: Date.now(),
      kv,
    };
  }

  async function writeCloudBundle(uid, db, bundle) {
    const payload = { ...bundle, updatedAt: Date.now() };
    await db.collection('users').doc(uid).collection('private').doc(SAVE_DOC_ID).set({
      bundle: payload,
      updatedAt: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date(),
    }, { merge: true });
    return payload;
  }

  async function syncOnLogin(uid, db) {
    if (!uid || !db) return null;
    const local = collectLocalBundle();
    const ref = db.collection('users').doc(uid).collection('private').doc(SAVE_DOC_ID);
    const snap = await ref.get();
    const remote = snap.exists ? snap.data()?.bundle : null;
    const merged = mergeBundles(local, remote);
    applyBundle(merged);
    if (global.ProfileService?.loadProfile && global.ProfileService?.saveProfile) {
      const profile = global.ProfileService.loadProfile();
      global.ProfileService.saveProfile(profile);
    }
    await writeCloudBundle(uid, db, merged);
    try {
      global.dispatchEvent(new CustomEvent('jamodeul-cloud-sync'));
    } catch (_) { /* ignore */ }
    return merged;
  }

  async function pushToCloud() {
    const uid = global.FirebaseSocial?.getCurrentUid?.();
    const db = global.FirebaseSocial?.getDb?.();
    if (!uid || !db) return;
    const bundle = collectLocalBundle();
    await writeCloudBundle(uid, db, bundle);
  }

  function schedulePush() {
    if (!global.FirebaseSocial?.getCurrentUid?.()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushToCloud().catch((err) => {
        console.warn('[CloudSync] push failed', err);
      });
    }, 900);
  }

  global.CloudSyncService = {
    collectLocalBundle,
    mergeBundles,
    syncOnLogin,
    pushToCloud,
    schedulePush,
  };
})(typeof window !== 'undefined' ? window : globalThis);
