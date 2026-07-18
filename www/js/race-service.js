/**
 * Firestore 1v1 race match operations — Wordle and Korean Match.
 */
(function (global) {
  'use strict';

  const MAX_GUESSES = 6;
  const TURN_DURATION_MS = 60000;
  const TURN_DURATION_NORMAL_MS = 90000;
  const INSPECT_DURATION_MS = 15000;
  const GAME_TYPES = { wordle: 'wordle', koreanMatch: 'korean-match', relatedWords: 'related-words' };
  const RELATED_WORDS_RACE_TARGET = 25;
  const RELATED_WORDS_STREAK_FIRE_MIN = 4;
  const PLAY_MODES = { race: 'race', turn: 'turn' };
  const TURN_PHASES = { inspect: 'inspect', playing: 'playing', review: 'review' };
  const LETTER_LENGTHS = [1, 2, 3, 4, 5, 6];
  const TURN_LIVE_MIN_INTERVAL_MS = 400;
  const RW_LIVE_MIN_INTERVAL_MS = 300;
  const WRITE_COOLDOWN_MS = 30000;
  const QUOTA_HALT_MS = 10 * 60 * 1000;
  const ACTIVATE_MIN_INTERVAL_MS = 10000;
  const TURN_LIVE_LOCK_TTL_MS = 5000;
  const TAB_ID = `tab-${Math.random().toString(36).slice(2, 10)}`;
  const turnLiveTracks = new Map();
  const rwLiveTracks = new Map();
  const activateLastAttemptAt = new Map();
  let writeCooldownUntil = 0;
  let quotaHaltedUntil = 0;
  /** @deprecated legacy mode strings */
  const MATCH_MODES = ['easy', 'medium', 'hard'];
  /** @deprecated legacy mode strings */
  const TURN_MODES = ['easy', 'normal', 'hardcore'];
  const DEBUG_TURN = (() => {
    try {
      const qs = new URLSearchParams(global.location?.search || '');
      return qs.has('debugTurn') || global.localStorage?.getItem('jamodeul-debug-turn') === '1';
    } catch (_) {
      return false;
    }
  })();

  function debugTurn(event, meta) {
    if (!DEBUG_TURN) return;
    try {
      console.log('[TurnDebug][RaceService]', event, meta || {});
    } catch (_) {}
  }

  function isQuotaError(err) {
    const code = String(err?.code || '').toLowerCase();
    if (code === 'resource-exhausted') return true;
    return String(err?.message || '').toLowerCase().includes('quota exceeded');
  }

  function clearAllTurnLiveTracks() {
    turnLiveTracks.forEach((track) => {
      if (track.timer) clearTimeout(track.timer);
      track.timer = null;
      track.pending = null;
      track.inFlight = false;
    });
  }

  function haltAutomaticWrites(err, source) {
    if (!isQuotaError(err)) return;
    const until = Date.now() + QUOTA_HALT_MS;
    if (until > quotaHaltedUntil) quotaHaltedUntil = until;
    if (until > writeCooldownUntil) writeCooldownUntil = until;
    clearAllTurnLiveTracks();
    debugTurn('quota:halt-automatic-writes', {
      source,
      haltMs: QUOTA_HALT_MS,
      until: quotaHaltedUntil,
      code: err?.code || null,
      message: err?.message || String(err),
    });
  }

  function registerWriteError(err, source) {
    haltAutomaticWrites(err, source);
  }

  function isQuotaHalted() {
    return Date.now() < quotaHaltedUntil;
  }

  function inWriteCooldown() {
    return isQuotaHalted() || Date.now() < writeCooldownUntil;
  }

  function turnLiveKey(matchId, myUid) {
    return `${matchId || ''}:${myUid || ''}`;
  }

  function getTurnLiveTrack(matchId, myUid) {
    const key = turnLiveKey(matchId, myUid);
    if (!turnLiveTracks.has(key)) {
      turnLiveTracks.set(key, {
        timer: null,
        inFlight: false,
        pending: null,
        lastSentAt: 0,
        lastFingerprint: null,
      });
    }
    return turnLiveTracks.get(key);
  }

  function canThisTabWriteTurnLive(matchId, myUid) {
    try {
      const storage = global.localStorage;
      if (!storage) return true;
      const key = `jamodeul-turnlive-lock:${matchId}:${myUid}`;
      const now = Date.now();
      const raw = storage.getItem(key);
      if (!raw) {
        storage.setItem(key, JSON.stringify({ owner: TAB_ID, ts: now }));
        return true;
      }
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.ts) || 0;
      if (now - ts > TURN_LIVE_LOCK_TTL_MS) {
        storage.setItem(key, JSON.stringify({ owner: TAB_ID, ts: now }));
        return true;
      }
      if (parsed?.owner !== TAB_ID) return false;
      // Refresh timestamp to keep ownership in the active tab.
      storage.setItem(key, JSON.stringify({ owner: TAB_ID, ts: now }));
      return true;
    } catch (_) {
      return true;
    }
  }

  function clearPendingTurnLive(matchId, myUid) {
    const key = turnLiveKey(matchId, myUid);
    const track = turnLiveTracks.get(key);
    if (!track) return;
    if (track.timer) clearTimeout(track.timer);
    track.timer = null;
    track.pending = null;
  }

  function buildTurnLivePayload(myUid, turnNumber, state) {
    return {
      byUid: myUid,
      turnNumber: turnNumber || 1,
      placements: state?.placements || [],
      merge: state?.merge || { slots: [null, null], slotIds: [null, null], result: null, resultId: null },
      bank: state?.bank || [],
      selected: state?.selected || null,
      removed: state?.removed || [],
      action: state?.action || null,
      updatedAt: Date.now(),
    };
  }

  function usesTurnLiveRtdb() {
    return global.TurnLiveRtdb?.isEnabled?.() === true;
  }

  function turnLiveFingerprint(turnNumber, state) {
    try {
      return JSON.stringify({
        t: turnNumber || 1,
        p: state?.placements || [],
        m: state?.merge || { slots: [null, null], slotIds: [null, null], result: null, resultId: null },
        b: state?.bank || [],
        s: state?.selected || null,
        r: state?.removed || [],
        a: state?.action || null,
      });
    } catch (_) {
      return `${turnNumber || 1}:${Date.now()}`;
    }
  }

  async function flushTurnLive(matchId, myUid) {
    const track = getTurnLiveTrack(matchId, myUid);
    if (track.inFlight || !track.pending) return;
    const useRtdb = usesTurnLiveRtdb();
    if (!useRtdb && inWriteCooldown()) return;

    const entry = track.pending;
    track.pending = null;
    track.inFlight = true;
    if (!myUid) {
      track.inFlight = false;
      return;
    }

    debugTurn('updateTurnLive:start', {
      matchId,
      myUid,
      turnNumber: entry.turnNumber,
      transport: useRtdb ? 'rtdb' : 'firestore',
      placements: entry.payload.placements?.length || 0,
      mergeSlots: entry.payload.merge?.slots || [null, null],
      mergeResult: entry.payload.merge?.result || null,
    });
    try {
      if (useRtdb) {
        await global.TurnLiveRtdb.writeLive(matchId, myUid, entry.payload);
      } else {
        const ref = matchesRef()?.doc(matchId);
        if (!ref) return;
        await ref.update({ turnLive: entry.payload });
      }
      track.lastSentAt = Date.now();
      track.lastFingerprint = entry.fingerprint;
      debugTurn('updateTurnLive:ok', { matchId, myUid, turnNumber: entry.turnNumber });
    } catch (err) {
      if (!useRtdb) registerWriteError(err, 'updateTurnLive');
      debugTurn('updateTurnLive:error', {
        matchId,
        myUid,
        turnNumber: entry.turnNumber,
        code: err?.code || null,
        message: err?.message || String(err),
      });
      console.warn('[Race] turn live update', err);
    } finally {
      track.inFlight = false;
      if (track.pending) {
        const elapsed = Date.now() - track.lastSentAt;
        const wait = Math.max(0, TURN_LIVE_MIN_INTERVAL_MS - elapsed);
        if (track.timer) clearTimeout(track.timer);
        track.timer = setTimeout(() => {
          track.timer = null;
          flushTurnLive(matchId, myUid);
        }, wait);
      }
    }
  }

  function defaultProgress() {
    return { guessCount: 0, finished: false, winStreak: 0 };
  }

  function defaultSharedState() {
    return { guessCount: 0, locked: [], over: false, winnerUid: null };
  }

  function defaultRelatedWordsSharedState() {
    return { linkIndex: 0, roundId: 0, lastWinnerUid: null };
  }

  function placementKey(p) {
    return `${p.syl}:${p.zone}:${p.subIndex ?? 0}`;
  }

  /** Cumulative correct slots visible on the shared turn board. */
  function mergeSharedLocked(existing, payload) {
    const map = new Map();
    (existing || []).forEach((p) => {
      if (p?.char != null) map.set(placementKey(p), p);
    });
    const add = (p) => {
      if (!p?.correct || p?.char == null) return;
      const key = placementKey(p);
      const prev = map.get(key);
      map.set(key, {
        syl: p.syl,
        zone: p.zone,
        subIndex: p.subIndex ?? 0,
        char: p.char,
        tileId: p.tileId || prev?.tileId || null,
      });
    };
    (payload?.locked || []).forEach((p) => {
      if (p?.char != null) map.set(placementKey(p), p);
    });
    (payload?.placements || []).forEach(add);
    return [...map.values()];
  }

  function getDb() {
    return global.FirebaseSocial?.getDb?.();
  }

  function getUid() {
    return global.FirebaseSocial?.getCurrentUid?.();
  }

  function getProfile() {
    return global.FirebaseSocial?.getUserProfile?.();
  }

  function getPublicName() {
    return global.FirebaseSocial?.getPublicName?.(getProfile()) || '플레이어';
  }

  function matchesRef() {
    const db = getDb();
    return db ? db.collection('matches') : null;
  }

  function normalizeOptions(optionsOrWordLength) {
    if (typeof optionsOrWordLength === 'number') {
      return { gameType: GAME_TYPES.wordle, wordLength: optionsOrWordLength };
    }
    const opts = optionsOrWordLength && typeof optionsOrWordLength === 'object'
      ? { ...optionsOrWordLength }
      : {};
    if (opts.gameType === GAME_TYPES.koreanMatch) {
      const fromLength = opts.wordLength;
      const fromLegacy = opts.turnMode || opts.matchMode;
      opts.wordLength = global.MatchWords?.normalizeWordLength?.(fromLength ?? fromLegacy) ?? 4;
      if (opts.playMode === PLAY_MODES.turn) {
        opts.playMode = PLAY_MODES.turn;
      } else {
        opts.playMode = PLAY_MODES.race;
      }
      return opts;
    }
    if (opts.gameType === GAME_TYPES.relatedWords) {
      opts.playMode = PLAY_MODES.race;
      opts.raceTarget = RELATED_WORDS_RACE_TARGET;
      return opts;
    }
    return {
      gameType: GAME_TYPES.wordle,
      wordLength: opts.wordLength === 2 ? 2 : 3,
      ...opts,
    };
  }

  function isKoreanMatch(data) {
    return data?.gameType === GAME_TYPES.koreanMatch;
  }

  function isRelatedWords(data) {
    return data?.gameType === GAME_TYPES.relatedWords;
  }

  function getRelatedWordsLinkCount(data) {
    const chainId = data?.chainId;
    if (chainId) {
      const fromChain = global.RelatedWordsChains?.getLinkCount?.(chainId);
      if (Number.isFinite(fromChain) && fromChain > 0) return fromChain;
    }
    const raceTarget = Number(data?.raceTarget);
    if (Number.isFinite(raceTarget) && raceTarget > 0) return raceTarget;
    return RELATED_WORDS_RACE_TARGET;
  }

  function isRelatedWordsChainComplete(data) {
    if (!isRelatedWords(data)) return false;
    const shared = data.sharedState || defaultRelatedWordsSharedState();
    const linkIndex = Number(shared.linkIndex) || 0;
    return linkIndex >= getRelatedWordsLinkCount(data);
  }

  function computeRelatedWordsWinner(data) {
    const p1 = data.player1Progress || defaultProgress();
    const p2 = data.player2Progress || defaultProgress();
    const p1Score = p1.guessCount || 0;
    const p2Score = p2.guessCount || 0;
    if (p1Score > p2Score) return data.player1Uid;
    if (p2Score > p1Score) return data.player2Uid;
    return null;
  }

  function relatedWordsMatchOverAt(nextLinkIndex, data) {
    return nextLinkIndex >= getRelatedWordsLinkCount(data);
  }

  function pickRelatedWordsChain(seed) {
    const chains = global.RelatedWordsChains?.getAllChains?.() || [];
    const minWords = global.RelatedWordsChains?.RACE_CHAIN_WORDS || 10;
    const eligible = chains.filter((c) => (c.words?.length || 0) >= minWords);
    const pool = eligible.length ? eligible : chains;
    if (!pool.length) return 'rw-food-cooking';
    let h = 0;
    const str = String(seed || '');
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return pool[Math.abs(h) % pool.length].id;
  }

  function pickRandomRelatedWordsChain(excludeId) {
    const chains = global.RelatedWordsChains?.getAllChains?.() || [];
    const minWords = global.RelatedWordsChains?.RACE_CHAIN_WORDS || 10;
    let pool = chains.filter((c) => (c.words?.length || 0) >= minWords);
    if (!pool.length) pool = chains;
    if (excludeId && pool.length > 1) {
      const without = pool.filter((c) => c.id !== excludeId);
      if (without.length) pool = without;
    }
    if (!pool.length) return 'rw-food-cooking';
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  function syllableCount(word) {
    if (!word || typeof word !== 'string') return 0;
    const HC = global.HangulCompose;
    if (HC?.isHangulSyllable) {
      return [...word].filter(HC.isHangulSyllable).length;
    }
    return [...word].length;
  }

  function pickWordleTarget(wordLength) {
    return global.WordleWords?.pickRandomWord?.(wordLength)
      || (wordLength === 2 ? '사랑' : '자전거');
  }

  function pickRandomFromPool(pool, excludeWord) {
    const list = (pool || []).filter(Boolean);
    if (!list.length) return null;
    const exclude = typeof excludeWord === 'string' ? excludeWord.trim() : '';
    let candidates = exclude
      ? list.filter((w) => (typeof w === 'string' ? w : w.word) !== exclude)
      : list;
    if (!candidates.length) candidates = list;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return typeof pick === 'string' ? pick : pick.word || null;
  }

  const FALLBACK_BY_LENGTH = {
    1: ['책', '곰', '개', '물', '밥', '빵', '문', '말', '소', '해', '달', '꽃'],
    2: ['사과', '바다', '학교', '친구', '연필', '나무', '구름', '바람'],
    3: ['고양이', '강아지', '자전거', '바나나', '컴퓨터', '축구공', '비행기', '자동차'],
    4: ['대학교', '도서관', '냉장고', '세탁기', '운동장', '지하철', '초콜릿', '햄버거'],
    5: ['김치찌개', '된장찌개', '스마트폰', '아이스크림', '운동선수', '할아버지', '어린이집'],
    6: ['대한민국', '국립박물관', '서울특별시', '인공지능', '환경오염', '세계문화유산'],
  };

  function normalizeWordLength(value) {
    return global.MatchWords?.normalizeWordLength?.(value) ?? 4;
  }

  function pickKoreanMatchTarget(wordLength, excludeWord) {
    const len = normalizeWordLength(wordLength);
    const pool = global.MatchWords?.getWordsForLength?.(len) || [];
    const word = pickRandomFromPool(pool, excludeWord);
    if (word) return word;
    const fallback = pickRandomFromPool(FALLBACK_BY_LENGTH[len] || FALLBACK_BY_LENGTH[4], excludeWord);
    if (fallback) return fallback;
    return len === 1 ? '책' : len === 2 ? '사과' : len === 6 ? '대한민국' : '고양이';
  }

  function pickTarget(options) {
    const opts = normalizeOptions(options);
    const exclude = opts.excludeTarget || opts.excludeWord || null;
    if (opts.gameType === GAME_TYPES.koreanMatch) {
      return pickKoreanMatchTarget(opts.wordLength, exclude);
    }
    return pickWordleTarget(opts.wordLength);
  }

  function turnDurationForLength(wordLength) {
    const len = normalizeWordLength(wordLength);
    if (len >= 4) return TURN_DURATION_NORMAL_MS;
    return TURN_DURATION_MS;
  }

  /** @deprecated use turnDurationForLength */
  function turnDurationForMode(turnMode) {
    return turnDurationForLength(turnMode);
  }

  function getMatchWordLength(data) {
    if (!data) return 4;
    const stored = Number(data.wordLength);
    if (LETTER_LENGTHS.includes(stored)) return stored;
    return normalizeWordLength(data.turnMode || data.matchMode);
  }

  /** @deprecated use getMatchWordLength */
  function getTurnMode(data) {
    if (!isTurnBased(data)) return null;
    return getMatchWordLength(data);
  }

  /** @deprecated use normalizeWordLength */
  function normalizeTurnMode(mode) {
    return normalizeWordLength(mode);
  }

  function isTurnBased(data) {
    return data?.playMode === PLAY_MODES.turn;
  }

  function getMatchPageUrl(matchId, data) {
    if (isRelatedWords(data)) {
      return `related-words-race.html?id=${encodeURIComponent(matchId)}`;
    }
    if (isTurnBased(data) && isKoreanMatch(data)) {
      return `match-turn.html?id=${encodeURIComponent(matchId)}`;
    }
    const page = isKoreanMatch(data) ? 'match-race.html' : 'race.html';
    return `${page}?id=${encodeURIComponent(matchId)}`;
  }

  async function createMatch(opponentUid, optionsOrWordLength) {
    const uid = getUid();
    const db = getDb();
    if (!uid || !db) throw new Error('auth');
    if (inWriteCooldown()) throw new Error('write-cooldown');

    const opts = normalizeOptions(optionsOrWordLength);
    const isMatch = opts.gameType === GAME_TYPES.koreanMatch;
    const isRelatedWordsGame = opts.gameType === GAME_TYPES.relatedWords;

    const myName = getPublicName();
    let opponentName = '플레이어';
    try {
      const snap = await db.collection('users').doc(opponentUid).get();
      if (snap.exists) opponentName = global.FirebaseSocial.getPublicName(snap.data());
    } catch { /* fallback name */ }

    const ref = matchesRef().doc();
    const relatedChainId = isRelatedWordsGame
      ? (opts.chainId && global.RelatedWordsChains?.getChain?.(opts.chainId)
        ? opts.chainId
        : pickRelatedWordsChain(ref.id))
      : null;
    const target = isRelatedWordsGame
      ? relatedChainId
      : pickTarget(opts);
    const wordLength = isRelatedWordsGame
      ? RELATED_WORDS_RACE_TARGET
      : (isMatch ? syllableCount(target) : Number(opts.wordLength));

    const data = {
      gameType: isRelatedWordsGame
        ? GAME_TYPES.relatedWords
        : (isMatch ? GAME_TYPES.koreanMatch : GAME_TYPES.wordle),
      player1Uid: uid,
      player2Uid: opponentUid,
      player1Name: myName,
      player2Name: opponentName,
      status: 'pending',
      target,
      wordLength,
      player1Ready: true,
      player2Ready: false,
      player1Progress: defaultProgress(),
      player2Progress: defaultProgress(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (isRelatedWordsGame) {
      data.chainId = relatedChainId;
      data.raceTarget = getRelatedWordsLinkCount({ chainId: relatedChainId });
      data.sharedState = defaultRelatedWordsSharedState();
    }

    if (isMatch) {
      data.wordLength = normalizeWordLength(opts.wordLength);
      if (opts.playMode === PLAY_MODES.turn) {
        data.playMode = PLAY_MODES.turn;
        data.turnDurationMs = turnDurationForLength(data.wordLength);
        data.turnPhase = TURN_PHASES.playing;
        data.sharedState = defaultSharedState();
        data.turnHistory = [];
      }
    }

    try {
      await ref.set(data);
    } catch (err) {
      registerWriteError(err, 'createMatch');
      throw err;
    }
    return ref.id;
  }

  function normalizeWordleLength(value) {
    const n = Number(value);
    return n === 3 ? 3 : 2;
  }

  async function createRematchMatch(opponentUid, optionsOrWordLength, rematchFromMatchId, forcedMatchId) {
    const uid = getUid();
    const db = getDb();
    if (!uid || !db) throw new Error('auth');
    if (inWriteCooldown()) throw new Error('write-cooldown');
    if (!rematchFromMatchId) throw new Error('rematch-from');

    const opts = normalizeOptions(optionsOrWordLength);
    const isMatch = opts.gameType === GAME_TYPES.koreanMatch;
    const isRelatedWordsGame = opts.gameType === GAME_TYPES.relatedWords;

    const myName = getPublicName();
    let opponentName = '플레이어';
    try {
      const snap = await db.collection('users').doc(opponentUid).get();
      if (snap.exists) opponentName = global.FirebaseSocial.getPublicName(snap.data());
    } catch { /* fallback name */ }

    const ref = forcedMatchId ? matchesRef().doc(forcedMatchId) : matchesRef().doc();
    const relatedChainId = isRelatedWordsGame
      ? (opts.chainId && global.RelatedWordsChains?.getChain?.(opts.chainId)
        ? opts.chainId
        : pickRelatedWordsChain(ref.id))
      : null;
    const target = isRelatedWordsGame
      ? relatedChainId
      : pickTarget(opts);
    const wordLength = isRelatedWordsGame
      ? RELATED_WORDS_RACE_TARGET
      : (isMatch ? normalizeWordLength(opts.wordLength) : normalizeWordleLength(opts.wordLength));

    const data = {
      gameType: isRelatedWordsGame
        ? GAME_TYPES.relatedWords
        : (isMatch ? GAME_TYPES.koreanMatch : GAME_TYPES.wordle),
      player1Uid: uid,
      player2Uid: opponentUid,
      player1Name: myName,
      player2Name: opponentName,
      status: 'ready',
      target,
      wordLength,
      player1Ready: true,
      player2Ready: true,
      player1Progress: defaultProgress(),
      player2Progress: defaultProgress(),
      rematchFrom: rematchFromMatchId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (isRelatedWordsGame) {
      data.chainId = relatedChainId;
      data.raceTarget = getRelatedWordsLinkCount({ chainId: relatedChainId });
      data.sharedState = defaultRelatedWordsSharedState();
    }

    if (isMatch) {
      data.wordLength = normalizeWordLength(opts.wordLength);
      if (opts.playMode === PLAY_MODES.turn) {
        data.playMode = PLAY_MODES.turn;
        data.turnDurationMs = turnDurationForLength(data.wordLength);
        data.turnPhase = TURN_PHASES.playing;
        data.sharedState = defaultSharedState();
        data.turnHistory = [];
      }
    }

    try {
      if (forcedMatchId) {
        const existing = await ref.get();
        if (existing.exists) return ref.id;
      }
      await ref.set(data);
    } catch (err) {
      registerWriteError(err, 'createRematchMatch');
      throw err;
    }
    return ref.id;
  }

  async function acceptMatch(matchId) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref) throw new Error('db');
    if (inWriteCooldown()) throw new Error('write-cooldown');
    try {
      await ref.update({
        status: 'ready',
        player2Ready: true,
      });
    } catch (err) {
      registerWriteError(err, 'acceptMatch');
      throw err;
    }
  }

  async function declineMatch(matchId) {
    const uid = getUid();
    const ref = matchesRef()?.doc(matchId);
    if (!ref || !uid) throw new Error('auth');
    if (inWriteCooldown()) throw new Error('write-cooldown');
    try {
      await ref.update({
        status: 'declined',
        declinedByUid: uid,
        declinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      registerWriteError(err, 'declineMatch');
      throw err;
    }
  }

  /** Reset an active Related Words race to the beginning (scores, shared round, live state). */
  async function resetRelatedWordsMatch(matchId, myUid) {
    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref || !myUid) return false;

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        if (!isRelatedWords(data)) return;
        if (data.player1Uid !== myUid && data.player2Uid !== myUid) return;
        if (data.status !== 'active' && data.status !== 'ready') return;

        const updates = {
          chainId: pickRandomRelatedWordsChain(data.chainId),
          raceTarget: null,
          player1Progress: defaultProgress(),
          player2Progress: defaultProgress(),
          sharedState: defaultRelatedWordsSharedState(),
          player1RwLive: firebase.firestore.FieldValue.delete(),
          player2RwLive: firebase.firestore.FieldValue.delete(),
          matchResetAt: firebase.firestore.FieldValue.serverTimestamp(),
          matchResetByUid: myUid,
        };
        updates.raceTarget = getRelatedWordsLinkCount({ chainId: updates.chainId });
        if (data.status === 'ready') {
          updates.status = 'active';
          updates.startedAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        tx.update(ref, updates);
      });
      if (usesTurnLiveRtdb()) {
        await global.TurnLiveRtdb.clearMatchLive(matchId);
      }
      return true;
    } catch (err) {
      console.warn('[Race] reset related words match', err);
      return false;
    }
  }

  /** Mark match abandoned when a player leaves mid-game; remaining player wins. */
  async function abandonMatch(matchId, myUid) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref || !myUid) return false;

    try {
      const snap = await ref.get();
      if (!snap.exists) return false;
      const data = snap.data();
      if (!data) return false;
      if (data.status === 'done' || data.status === 'declined' || data.status === 'abandoned') {
        return false;
      }
      if (data.player1Uid !== myUid && data.player2Uid !== myUid) return false;

      const winnerUid = data.player1Uid === myUid ? data.player2Uid : data.player1Uid;
      const updates = {
        status: 'abandoned',
        abandonedByUid: myUid,
        abandonedAt: firebase.firestore.FieldValue.serverTimestamp(),
        winnerUid,
      };
      if (!usesTurnLiveRtdb()) {
        updates.turnLive = firebase.firestore.FieldValue.delete();
      }
      await ref.update(updates);
      if (usesTurnLiveRtdb()) {
        await global.TurnLiveRtdb.clearMatchLive(matchId);
      }
      return true;
    } catch (err) {
      console.warn('[Race] abandon match', err);
      return false;
    }
  }

  function rwLiveTrackKey(matchId, isPlayer1) {
    return `${matchId}:${isPlayer1 ? 'p1' : 'p2'}`;
  }

  function buildRwLivePayload(state) {
    return {
      linkIndex: Number(state?.linkIndex) || 0,
      roundId: Number(state?.roundId) || 0,
      slots: Array.isArray(state?.slots)
        ? state.slots.map((char) => (char ? String(char) : null))
        : [],
      wrongCount: Math.max(0, Number(state?.wrongCount) || 0),
      stunnedUntil: Math.max(0, Number(state?.stunnedUntil) || 0),
      revealPressed: state?.revealPressed === true,
      updatedAt: Date.now(),
    };
  }

  function rwLiveFingerprint(state) {
    const payload = buildRwLivePayload(state);
    return `${payload.linkIndex}:${payload.roundId}:${payload.slots.join('|')}:${payload.wrongCount}:${payload.stunnedUntil}:${payload.revealPressed}`;
  }

  async function flushRwLive(matchId, trackKey) {
    const track = rwLiveTracks.get(trackKey);
    if (!track?.pending) return;

    track.inFlight = true;
    const entry = track.pending;
    track.pending = null;
    track.timer = null;

    try {
      const ref = matchesRef()?.doc(matchId);
      if (!ref) return;
      await ref.update({ [entry.field]: entry.payload });
      track.lastSentAt = Date.now();
      track.lastFingerprint = entry.fingerprint;
    } catch (err) {
      registerWriteError(err, 'updateRelatedWordsLive');
    } finally {
      track.inFlight = false;
      if (track.pending) {
        const elapsed = Date.now() - track.lastSentAt;
        const wait = Math.max(0, RW_LIVE_MIN_INTERVAL_MS - elapsed);
        track.timer = setTimeout(() => flushRwLive(matchId, trackKey), wait);
      }
    }
  }

  function updateRelatedWordsLive(matchId, isPlayer1, state) {
    if (!matchId || !state) return;
    if (inWriteCooldown()) return;

    const trackKey = rwLiveTrackKey(matchId, isPlayer1);
    const field = isPlayer1 ? 'player1RwLive' : 'player2RwLive';
    let track = rwLiveTracks.get(trackKey);
    if (!track) {
      track = {
        timer: null,
        inFlight: false,
        lastSentAt: 0,
        pending: null,
        lastFingerprint: '',
      };
      rwLiveTracks.set(trackKey, track);
    }

    const fingerprint = rwLiveFingerprint(state);
    if (fingerprint === track.lastFingerprint && !track.pending && !track.inFlight) {
      return;
    }

    track.pending = {
      field,
      fingerprint,
      payload: buildRwLivePayload(state),
    };

    if (track.inFlight) return;
    const elapsed = Date.now() - track.lastSentAt;
    const wait = Math.max(0, RW_LIVE_MIN_INTERVAL_MS - elapsed);
    if (track.timer) clearTimeout(track.timer);
    track.timer = setTimeout(() => {
      track.timer = null;
      flushRwLive(matchId, trackKey);
    }, wait);
  }

  function updateTurnLive(matchId, myUid, turnNumber, state, opts = {}) {
    if (!matchId || !myUid) return;
    if (!canThisTabWriteTurnLive(matchId, myUid)) return;
    const normalizedTurn = turnNumber || 1;
    const track = getTurnLiveTrack(matchId, myUid);
    const fingerprint = turnLiveFingerprint(normalizedTurn, state);
    const immediate = opts.immediate === true || state?.action?.kind === 'checking';
    if (!immediate && fingerprint === track.lastFingerprint && !track.pending && !track.inFlight) {
      return;
    }

    track.pending = {
      turnNumber: normalizedTurn,
      fingerprint,
      payload: buildTurnLivePayload(myUid, normalizedTurn, state),
    };

    if (track.inFlight) return;
    if (track.timer) clearTimeout(track.timer);
    track.timer = null;
    if (immediate) {
      void flushTurnLive(matchId, myUid);
      return;
    }
    const elapsed = Date.now() - track.lastSentAt;
    const wait = Math.max(0, TURN_LIVE_MIN_INTERVAL_MS - elapsed);
    track.timer = setTimeout(() => {
      track.timer = null;
      flushTurnLive(matchId, myUid);
    }, wait);
  }

  async function setPlayerReady(matchId, isPlayer1) {
    const field = isPlayer1 ? 'player1Ready' : 'player2Ready';
    await matchesRef()?.doc(matchId).update({ [field]: true });
  }

  async function tryActivateMatch(matchId, data) {
    if (!data || data.status !== 'ready') return;
    if (!data.player1Ready || !data.player2Ready) return;
    if (data.startedAt) return;
    if (inWriteCooldown()) return;

    const now = Date.now();
    const lastAttempt = activateLastAttemptAt.get(matchId) || 0;
    if (now - lastAttempt < ACTIVATE_MIN_INTERVAL_MS) return;
    activateLastAttemptAt.set(matchId, now);

    const ref = matchesRef()?.doc(matchId);
    if (!ref) return;

    try {
      const updates = {
        status: 'active',
        startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (isTurnBased(data)) {
        updates.turnNumber = 1;
        updates.turnPhase = TURN_PHASES.playing;
        updates.currentTurnUid = data.player1Uid;
        updates.turnStartedAt = firebase.firestore.FieldValue.serverTimestamp();
        updates.turnDurationMs = data.turnDurationMs || TURN_DURATION_MS;
        updates.sharedState = data.sharedState || defaultSharedState();
      } else if (isRelatedWords(data)) {
        updates.sharedState = data.sharedState || defaultRelatedWordsSharedState();
      }
      await ref.update(updates);
      if (isTurnBased(data)) {
        await global.TurnLiveRtdb?.ensureMatchMeta?.(
          matchId,
          data.player1Uid,
          data.player2Uid
        );
      }
    } catch (err) {
      registerWriteError(err, 'tryActivateMatch');
      console.warn('[Race] activate match (may be duplicate)', err);
    }
  }

  async function updateMyProgress(matchId, isPlayer1, patch) {
    const key = isPlayer1 ? 'player1Progress' : 'player2Progress';
    const ref = matchesRef()?.doc(matchId);
    if (!ref) return;

    const updates = {};
    Object.keys(patch).forEach((k) => {
      updates[`${key}.${k}`] = patch[k];
    });
    await ref.update(updates);
  }

  async function markFinished(matchId, isPlayer1, won) {
    const key = isPlayer1 ? 'player1Progress' : 'player2Progress';
    await matchesRef()?.doc(matchId).update({
      [`${key}.finished`]: true,
      [`${key}.won`]: won,
      [`${key}.finishedAt`]: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  function verifyRelatedWordsAnswer(chainId, linkIndex, answer) {
    const link = global.RelatedWordsChains?.getLink?.(chainId, linkIndex);
    if (!link?.answer) return false;
    return String(answer || '').trim() === link.answer;
  }

  function verifyRelatedWordsRound(globalLinkIndex, answer) {
    const resolved = global.RelatedWordsChains?.resolveRoundPuzzle?.(globalLinkIndex);
    if (!resolved) return false;
    return verifyRelatedWordsAnswer(resolved.chainId, resolved.linkIndex, answer);
  }

  async function submitRelatedWordsRound(matchId, myUid, payload, attempt = 0) {
    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref || !myUid) return { applied: false };

    const linkIndex = Number(payload?.linkIndex);
    const answer = String(payload?.answer || '').trim();
    if (!Number.isFinite(linkIndex) || linkIndex < 0 || !answer) {
      return { applied: false };
    }

    let result = { applied: false };
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        if (!isRelatedWords(data) || data.status !== 'active') return;

        const shared = data.sharedState || defaultRelatedWordsSharedState();
        const currentLink = Number(shared.linkIndex) || 0;
        if (currentLink !== linkIndex) return;
        if (!verifyRelatedWordsAnswer(data.chainId, linkIndex, answer)) return;

        const roundPoints = global.RelatedWordsChains?.relatedWordsRoundPoints?.(answer) ?? 1;
        const isP1 = data.player1Uid === myUid;
        const progKey = isP1 ? 'player1Progress' : 'player2Progress';
        const oppProgKey = isP1 ? 'player2Progress' : 'player1Progress';
        const prog = data[progKey] || defaultProgress();
        const oppProg = data[oppProgKey] || defaultProgress();
        const newScore = (prog.guessCount || 0) + roundPoints;
        const newStreak = (prog.winStreak || 0) + 1;
        const nextLinkIndex = linkIndex + 1;
        const matchOver = relatedWordsMatchOverAt(nextLinkIndex, data);
        const oppScore = oppProg.guessCount || 0;
        let winnerUid = null;
        if (matchOver) {
          const scoringData = {
            ...data,
            player1Progress: isP1
              ? { ...prog, guessCount: newScore }
              : { ...oppProg, guessCount: oppScore },
            player2Progress: isP1
              ? { ...oppProg, guessCount: oppScore }
              : { ...prog, guessCount: newScore },
          };
          winnerUid = computeRelatedWordsWinner(scoringData);
        }
        const nextRoundId = (Number(shared.roundId) || 0) + 1;
        const now = Date.now();

        function clearedLiveFor(prevLive) {
          const stunnedUntil = Math.max(0, Number(prevLive?.stunnedUntil) || 0);
          return {
            linkIndex: nextLinkIndex,
            roundId: nextRoundId,
            slots: [],
            wrongCount: 0,
            stunnedUntil: stunnedUntil > now ? stunnedUntil : 0,
            revealPressed: false,
            updatedAt: now,
          };
        }

        const p1Live = data.player1RwLive || {};
        const p2Live = data.player2RwLive || {};

        const updates = {
          sharedState: {
            linkIndex: nextLinkIndex,
            roundId: nextRoundId,
            lastWinnerUid: myUid,
          },
          player1RwLive: clearedLiveFor(p1Live),
          player2RwLive: clearedLiveFor(p2Live),
          [progKey]: {
            guessCount: newScore,
            winStreak: newStreak,
            finished: matchOver,
            won: matchOver && winnerUid === myUid,
            elapsedMs: payload.elapsedMs ?? prog.elapsedMs ?? null,
            ...(matchOver ? {
              finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
            } : {}),
          },
        };

        if (!matchOver) {
          updates[oppProgKey] = {
            guessCount: oppProg.guessCount || 0,
            finished: false,
            won: false,
            winStreak: 0,
            ...(oppProg.elapsedMs != null ? { elapsedMs: oppProg.elapsedMs } : {}),
          };
        }

        if (matchOver) {
          updates.status = 'done';
          updates.winnerUid = winnerUid;
        }

        tx.update(ref, updates);
        result = {
          applied: true,
          nextLinkIndex,
          matchOver,
          myScore: newScore,
        };
      });
    } catch (err) {
      const code = String(err?.code || '');
      const retryable = code === 'failed-precondition' || code === 'aborted';
      if (retryable && attempt < 4) {
        await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        return submitRelatedWordsRound(matchId, myUid, payload, attempt + 1);
      }
      registerWriteError(err, 'submitRelatedWordsRound');
      throw err;
    }
    return result;
  }

  async function pressRelatedWordsReveal(matchId, myUid, payload, attempt = 0) {
    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref || !myUid) return { applied: false };

    const linkIndex = Number(payload?.linkIndex);
    const roundId = Number(payload?.roundId);
    if (!Number.isFinite(linkIndex) || linkIndex < 0 || !Number.isFinite(roundId)) {
      return { applied: false };
    }

    let result = { applied: false };
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        if (!isRelatedWords(data) || data.status !== 'active') return;

        const shared = data.sharedState || defaultRelatedWordsSharedState();
        const currentLink = Number(shared.linkIndex) || 0;
        const currentRound = Number(shared.roundId) || 0;
        if (currentLink !== linkIndex || currentRound !== roundId) return;

        const now = Date.now();
        const nextLinkIndex = linkIndex + 1;
        const matchOver = relatedWordsMatchOverAt(nextLinkIndex, data);
        const isP1 = data.player1Uid === myUid;
        const p1Score = (data.player1Progress || defaultProgress()).guessCount || 0;
        const p2Score = (data.player2Progress || defaultProgress()).guessCount || 0;
        const winnerUid = matchOver ? computeRelatedWordsWinner(data) : null;

        const nextRoundId = roundId + 1;

        function clearedLiveFor(prevLive) {
          const stunnedUntil = Math.max(0, Number(prevLive?.stunnedUntil) || 0);
          return {
            linkIndex: nextLinkIndex,
            roundId: nextRoundId,
            slots: [],
            wrongCount: 0,
            stunnedUntil: stunnedUntil > now ? stunnedUntil : 0,
            revealPressed: false,
            updatedAt: now,
          };
        }

        const updates = {
          sharedState: {
            linkIndex: nextLinkIndex,
            roundId: nextRoundId,
            lastWinnerUid: null,
          },
          player1RwLive: clearedLiveFor(data.player1RwLive),
          player2RwLive: clearedLiveFor(data.player2RwLive),
        };

        if (matchOver) {
          updates.status = 'done';
          updates.winnerUid = winnerUid;
        }

        tx.update(ref, updates);
        result = {
          applied: true,
          skipped: true,
          nextLinkIndex,
          matchOver,
          myScore: isP1 ? p1Score : p2Score,
        };
      });
    } catch (err) {
      const code = String(err?.code || '');
      const retryable = code === 'failed-precondition' || code === 'aborted';
      if (retryable && attempt < 4) {
        await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        return pressRelatedWordsReveal(matchId, myUid, payload, attempt + 1);
      }
      registerWriteError(err, 'pressRelatedWordsReveal');
      throw err;
    }
    return result;
  }

  function shouldFinalize(data) {
    if (!data) return false;
    if (isRelatedWords(data)) {
      if (data.status === 'done' || data.winnerUid != null) return true;
      return isRelatedWordsChainComplete(data);
    }
    if (isTurnBased(data)) {
      return data.status === 'done' || data.sharedState?.over === true;
    }
    const p1 = data.player1Progress || defaultProgress();
    const p2 = data.player2Progress || defaultProgress();
    if (p1.won === true || p2.won === true) return true;
    return p1.finished && p2.finished;
  }

  function computeWinner(data) {
    if (isRelatedWords(data)) {
      if (data.winnerUid) return data.winnerUid;
      if (isRelatedWordsChainComplete(data)) return computeRelatedWordsWinner(data);
      return null;
    }
    if (isTurnBased(data)) {
      return data.winnerUid || data.sharedState?.winnerUid || null;
    }
    const p1 = data.player1Progress || defaultProgress();
    const p2 = data.player2Progress || defaultProgress();
    if (p1.won === true && p2.won !== true) return data.player1Uid;
    if (p2.won === true && p1.won !== true) return data.player2Uid;
    if (p1.won === true && p2.won === true) {
      const t1 = p1.finishedAt?.toMillis?.() ?? Infinity;
      const t2 = p2.finishedAt?.toMillis?.() ?? Infinity;
      if (t1 < t2) return data.player1Uid;
      if (t2 < t1) return data.player2Uid;
    }
    return null;
  }

  async function tryFinalizeMatch(matchId, data) {
    if (!data || data.status === 'done') return;
    if (!shouldFinalize(data)) return;
    if (inWriteCooldown()) return;

    const winnerUid = computeWinner(data);
    const ref = matchesRef()?.doc(matchId);
    if (!ref) return;

    const updates = {
      status: 'done',
      winnerUid,
    };

    if (isRelatedWords(data)) {
      const p1 = data.player1Progress || defaultProgress();
      const p2 = data.player2Progress || defaultProgress();
      updates.player1Progress = {
        ...p1,
        finished: true,
        won: winnerUid === data.player1Uid,
        ...(!p1.finishedAt ? {
          finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
        } : {}),
      };
      updates.player2Progress = {
        ...p2,
        finished: true,
        won: winnerUid === data.player2Uid,
        ...(!p2.finishedAt ? {
          finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
        } : {}),
      };
    }

    try {
      await ref.update(updates);
    } catch (err) {
      registerWriteError(err, 'tryFinalizeMatch');
      console.warn('[Race] finalize match (may be duplicate)', err);
    }
  }

  function subscribeMatch(matchId, onData, onError) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref) return () => {};
    return ref.onSnapshot(
      (snap) => {
        if (!snap.exists) {
          onData(null);
          return;
        }
        onData({ id: snap.id, ...snap.data() });
      },
      onError || ((err) => console.error('[Race] match listener', err))
    );
  }

  function subscribeIncomingChallenges(onMatch) {
    const uid = getUid();
    const col = matchesRef();
    if (!uid || !col) return () => {};

    const q = col.where('player2Uid', '==', uid).where('status', '==', 'pending');
    return q.onSnapshot(
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          onMatch({ id: change.doc.id, ...change.doc.data() });
        });
      },
      (err) => {
        if (isQuotaError(err)) haltAutomaticWrites(err, 'subscribeIncomingChallenges');
        console.error('[Race] incoming challenges', err);
      }
    );
  }

  function getOpponent(data, myUid) {
    if (!data || !myUid) return null;
    const isP1 = data.player1Uid === myUid;
    return {
      uid: isP1 ? data.player2Uid : data.player1Uid,
      name: isP1 ? data.player2Name : data.player1Name,
      progress: isP1 ? data.player2Progress : data.player1Progress,
      isPlayer1: !isP1,
    };
  }

  function amPlayer1(data, myUid) {
    return data?.player1Uid === myUid;
  }

  function turnDurationMs(data) {
    const ms = data?.turnDurationMs;
    return Number.isFinite(ms) && ms > 0 ? ms : TURN_DURATION_MS;
  }

  function turnStartedAtMs(data) {
    const ts = data?.turnStartedAt;
    if (!ts) return null;
    return typeof ts.toMillis === 'function' ? ts.toMillis() : null;
  }

  function turnRemainingMs(data, nowMs) {
    const started = turnStartedAtMs(data);
    if (!started) return turnDurationMs(data);
    const now = nowMs ?? Date.now();
    return Math.max(0, started + turnDurationMs(data) - now);
  }

  function turnElapsedRatio(data, nowMs) {
    const duration = turnDurationMs(data);
    const remaining = turnRemainingMs(data, nowMs);
    return Math.max(0, Math.min(1, 1 - remaining / duration));
  }

  function isTurnReview(data) {
    return isTurnBased(data) && data.turnPhase === TURN_PHASES.review;
  }

  function isInspectPhase(data) {
    return isTurnBased(data) && data.turnPhase === TURN_PHASES.inspect;
  }

  function inspectEndsAtMs(data) {
    const started = startedAtMs(data);
    if (!started) return null;
    return started + INSPECT_DURATION_MS;
  }

  function inspectRemainingMs(data, nowMs) {
    const ends = inspectEndsAtMs(data);
    if (!ends) return INSPECT_DURATION_MS;
    const now = nowMs ?? Date.now();
    return Math.max(0, ends - now);
  }

  function inspectElapsedRatio(data, nowMs) {
    const remaining = inspectRemainingMs(data, nowMs);
    return Math.max(0, Math.min(1, 1 - remaining / INSPECT_DURATION_MS));
  }

  function isRushPhase(data) {
    return isTurnBased(data)
      && data.status === 'active'
      && data.turnPhase === TURN_PHASES.playing
      && !data.currentTurnUid;
  }

  async function completeInspectPhase(matchId, data) {
    if (!isInspectPhase(data) || data.status !== 'active') return false;
    if (inspectRemainingMs(data) > 0) return false;
    if (inWriteCooldown()) return false;

    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref) return false;

    const started = startedAtMs(data);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const d = snap.data();
        if (!isInspectPhase(d) || d.status !== 'active') return;
        if (inspectRemainingMs(d) > 0) return;
        if (started && startedAtMs(d) !== started) return;
        tx.update(ref, {
          turnPhase: TURN_PHASES.playing,
          currentTurnUid: null,
        });
      });
      return true;
    } catch (err) {
      registerWriteError(err, 'completeInspectPhase');
      console.warn('[Race] complete inspect phase', err);
      return false;
    }
  }

  async function buildExpiredTurnReveal(data, matchId) {
    const uid = data.currentTurnUid;
    const isP1 = data.player1Uid === uid;
    const syllableTotal = (data.target || '').length || 0;
    let live = data.turnLive;
    if (usesTurnLiveRtdb() && matchId && uid) {
      try {
        const rtdbLive = await global.TurnLiveRtdb.readLiveOnce(matchId, uid);
        if (rtdbLive?.byUid === uid && rtdbLive?.turnNumber === data.turnNumber) {
          live = rtdbLive;
        }
      } catch (_) {}
    }
    const liveOk = live?.byUid === uid && live?.turnNumber === data.turnNumber;
    const placements = liveOk
      ? (live.placements || []).map((p) => ({ ...p, correct: false, locked: false }))
      : [];
    return {
      byUid: uid,
      byName: isP1 ? data.player1Name : data.player2Name,
      timedOut: true,
      placements,
      correctCount: 0,
      totalPlaced: placements.length,
      syllableCorrect: [],
      syllableCorrectCount: 0,
      syllableTotal,
      locked: [],
    };
  }

  function buildTurnHistoryEntry(data, myUid, payload, turnNumber) {
    const isP1 = data.player1Uid === myUid;
    return {
      turnNumber: turnNumber || data.turnNumber || 1,
      byUid: myUid,
      byName: isP1 ? data.player1Name : data.player2Name,
      timedOut: false,
      placements: payload.placements || [],
      correctCount: payload.correctCount || 0,
      totalPlaced: payload.totalPlaced || 0,
      syllableCorrect: payload.syllableCorrect || [],
      syllableCorrectCount: payload.syllableCorrectCount ?? 0,
      syllableTotal: payload.syllableTotal ?? 0,
      locked: payload.locked || [],
    };
  }

  async function submitTurn(matchId, myUid, payload, attempt = 0) {
    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref || !myUid) throw new Error('auth');
    if (isQuotaHalted()) throw new Error('quota-halted');
    clearPendingTurnLive(matchId, myUid);
    debugTurn('submitTurn:start', {
      matchId,
      myUid,
      attempt,
      won: !!payload?.won,
      placements: payload?.placements?.length || 0,
      locked: payload?.locked?.length || 0,
      correctCount: payload?.correctCount || 0,
      totalPlaced: payload?.totalPlaced || 0,
    });

    let applied = false;
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        if (!isTurnBased(data) || data.status !== 'active') return;
        if (data.turnPhase === TURN_PHASES.inspect) return;
        if (data.currentTurnUid && data.currentTurnUid !== myUid) return;

        const claimingFirst = !data.currentTurnUid;
        const activeTurnUid = claimingFirst ? myUid : data.currentTurnUid;

        const shared = {
          guessCount: (data.sharedState?.guessCount || 0) + 1,
          locked: mergeSharedLocked(data.sharedState?.locked, payload),
          over: !!payload.won,
          winnerUid: payload.won ? myUid : null,
          ...(payload.solvedWord ? { solvedWord: payload.solvedWord } : {}),
        };
        const isP1 = data.player1Uid === myUid;
        const progKey = isP1 ? 'player1Progress' : 'player2Progress';
        const turnNum = data.turnNumber || 1;
        const historyEntry = buildTurnHistoryEntry(data, myUid, payload, turnNum);
        const history = [...(data.turnHistory || []), historyEntry];

        if (payload.won) {
          const wonUpdates = {
            sharedState: shared,
            status: 'done',
            winnerUid: myUid,
            turnPhase: TURN_PHASES.playing,
            currentTurnUid: myUid,
            lastTurnReveal: historyEntry,
            turnHistory: history,
            [progKey]: {
              guessCount: shared.guessCount,
              finished: true,
              won: true,
              finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
              ...(payload.solvedWord ? { solvedWord: payload.solvedWord } : {}),
            },
          };
          if (!usesTurnLiveRtdb()) {
            wonUpdates.turnLive = firebase.firestore.FieldValue.delete();
          }
          tx.update(ref, wonUpdates);
          applied = true;
          return;
        }

        const nextUid = activeTurnUid === data.player1Uid ? data.player2Uid : data.player1Uid;
        const turnUpdates = {
          sharedState: shared,
          turnPhase: TURN_PHASES.playing,
          currentTurnUid: nextUid,
          turnNumber: turnNum + 1,
          turnStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastTurnReveal: historyEntry,
          turnHistory: history,
        };
        if (!usesTurnLiveRtdb()) {
          turnUpdates.turnLive = firebase.firestore.FieldValue.delete();
        }
        tx.update(ref, turnUpdates);
        applied = true;
      });
      if (applied && usesTurnLiveRtdb()) {
        await global.TurnLiveRtdb.clearLive(matchId, myUid);
      }
      debugTurn('submitTurn:tx-finished', { matchId, myUid, attempt, applied });
    } catch (err) {
      registerWriteError(err, 'submitTurn');
      const code = err?.code || '';
      const retryable = code === 'failed-precondition' || code === 'aborted';
      debugTurn('submitTurn:error', {
        matchId,
        myUid,
        attempt,
        code: code || null,
        retryable,
        message: err?.message || String(err),
      });
      if (retryable && attempt < 4) {
        debugTurn('submitTurn:retrying', { matchId, myUid, nextAttempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        return submitTurn(matchId, myUid, payload, attempt + 1);
      }
      throw err;
    }
    debugTurn('submitTurn:result', { matchId, myUid, attempt, applied });
    return applied;
  }

  async function completeTurnWindow(matchId, data, attempt = 0, opts = {}) {
    if (!isTurnBased(data) || data.status !== 'active') return false;
    if (isInspectPhase(data) || !data.currentTurnUid) return false;
    if (inWriteCooldown()) return false;
    // Caller observed the full turn window elapse on its own clock; trust it
    // instead of comparing the (possibly skewed) local clock to server time.
    const localExpired = opts.localExpired === true;
    const started = turnStartedAtMs(data);
    const turnNum = data.turnNumber || 1;
    const duration = turnDurationMs(data);
    debugTurn('completeTurnWindow:start', {
      matchId,
      attempt,
      currentTurnUid: data.currentTurnUid || null,
      turnNum,
      started,
      duration,
      localExpired,
      now: Date.now(),
    });
    if (!started) return false;
    if (!localExpired && Date.now() < started + duration) return false;

    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref) return false;

    const expiredUid = data.currentTurnUid;
    const reveal = await buildExpiredTurnReveal(data, matchId);

    let applied = false;
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const d = snap.data();
        if (!isTurnBased(d) || d.status !== 'active') return;
        const s = turnStartedAtMs(d);
        if (!s || s !== started) return;
        if (!localExpired && Date.now() < s + turnDurationMs(d)) return;
        if ((d.turnNumber || 1) !== turnNum) return;
        if (d.turnPhase !== TURN_PHASES.playing) return;
        if (d.currentTurnUid !== data.currentTurnUid) return;

        const historyEntry = {
          ...reveal,
          turnNumber: d.turnNumber || 1,
        };
        const history = [...(d.turnHistory || []), historyEntry];
        const nextUid = d.currentTurnUid === d.player1Uid ? d.player2Uid : d.player1Uid;
        const shared = {
          ...(d.sharedState || defaultSharedState()),
          guessCount: (d.sharedState?.guessCount || 0) + 1,
          locked: mergeSharedLocked(d.sharedState?.locked, reveal),
        };
        const windowUpdates = {
          sharedState: shared,
          turnPhase: TURN_PHASES.playing,
          currentTurnUid: nextUid,
          turnNumber: (d.turnNumber || 1) + 1,
          turnStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastTurnReveal: historyEntry,
          turnHistory: history,
        };
        if (!usesTurnLiveRtdb()) {
          windowUpdates.turnLive = firebase.firestore.FieldValue.delete();
        }
        tx.update(ref, windowUpdates);
        applied = true;
      });
      if (applied && usesTurnLiveRtdb() && expiredUid) {
        await global.TurnLiveRtdb.clearLive(matchId, expiredUid);
      }
      debugTurn('completeTurnWindow:tx-finished', {
        matchId,
        attempt,
        currentTurnUid: data.currentTurnUid || null,
        turnNum,
        applied,
      });
    } catch (err) {
      registerWriteError(err, 'completeTurnWindow');
      const code = err?.code || '';
      const retryable = code === 'failed-precondition' || code === 'aborted';
      debugTurn('completeTurnWindow:error', {
        matchId,
        attempt,
        code: code || null,
        retryable,
        message: err?.message || String(err),
      });
      if (retryable && attempt < 4) {
        debugTurn('completeTurnWindow:retrying', { matchId, nextAttempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        return completeTurnWindow(matchId, data, attempt + 1, opts);
      }
      console.warn('[Race] complete turn window', err);
      return false;
    }
    debugTurn('completeTurnWindow:result', { matchId, attempt, applied });
    return applied;
  }

  async function expireTurnIfNeeded(matchId, data) {
    return completeTurnWindow(matchId, data);
  }

  function startedAtMs(data) {
    const ts = data?.startedAt;
    if (!ts) return null;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    return null;
  }

  function rematchLobbyKeys(myUid, data) {
    const p1 = data?.player1Uid === myUid;
    return {
      myReady: p1 ? 'player1RematchReady' : 'player2RematchReady',
      oppReady: p1 ? 'player2RematchReady' : 'player1RematchReady',
      myPresent: p1 ? 'player1ResultsPresent' : 'player2ResultsPresent',
      oppPresent: p1 ? 'player2ResultsPresent' : 'player1ResultsPresent',
    };
  }

  function getRematchLobbyState(data, myUid) {
    if (!data || !myUid) {
      return {
        myReady: false,
        oppReady: false,
        opponentOnResults: true,
        opponentLeft: false,
        count: 0,
        bothReady: false,
        bothPresent: false,
        rematchMatchId: null,
        rematchClaimedByUid: null,
      };
    }
    const keys = rematchLobbyKeys(myUid, data);
    const myReady = data[keys.myReady] === true;
    const oppReady = data[keys.oppReady] === true;
    const myPresent = data[keys.myPresent] === true;
    const oppPresent = data[keys.oppPresent] === true;
    const opponentLeft = data[keys.oppPresent] === false;
    const count = (myReady ? 1 : 0) + (oppReady ? 1 : 0);
    return {
      myReady,
      oppReady,
      myPresent,
      opponentOnResults: !opponentLeft,
      opponentLeft,
      count,
      bothReady: myReady && oppReady,
      bothPresent: myPresent && oppPresent,
      rematchMatchId: data.rematchMatchId || null,
      rematchClaimedByUid: data.rematchClaimedByUid || null,
    };
  }

  async function setResultsPresent(matchId, myUid, present) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref || !myUid) return false;
    if (inWriteCooldown()) return false;

    try {
      const snap = await ref.get();
      if (!snap.exists) return false;
      const data = snap.data();
      if (data.status !== 'done') return false;
      if (data.player1Uid !== myUid && data.player2Uid !== myUid) return false;

      const keys = rematchLobbyKeys(myUid, data);
      const updates = { [keys.myPresent]: present === true };
      if (!present) updates[keys.myReady] = false;
      await ref.update(updates);
      return true;
    } catch (err) {
      console.warn('[Race] set results present', err);
      return false;
    }
  }

  async function setRematchReady(matchId, myUid) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref || !myUid) return false;
    if (inWriteCooldown()) throw new Error('write-cooldown');

    try {
      const snap = await ref.get();
      if (!snap.exists) return false;
      const data = snap.data();
      if (data.status !== 'done') return false;
      if (data.player1Uid !== myUid && data.player2Uid !== myUid) return false;

      const keys = rematchLobbyKeys(myUid, data);
      await ref.update({
        [keys.myReady]: true,
        [keys.myPresent]: true,
      });
      return true;
    } catch (err) {
      registerWriteError(err, 'setRematchReady');
      throw err;
    }
  }

  async function claimRematchCreation(matchId, myUid) {
    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref || !myUid) return false;
    if (inWriteCooldown()) return false;

    try {
      let claimed = false;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        if (!data || data.status !== 'done') return;
        if (data.rematchMatchId || data.rematchClaimedByUid) return;
        if (data.player1Uid !== myUid && data.player2Uid !== myUid) return;

        const p1Ready = data.player1RematchReady === true;
        const p2Ready = data.player2RematchReady === true;
        if (!p1Ready || !p2Ready) return;

        tx.update(ref, { rematchClaimedByUid: myUid });
        claimed = true;
      });
      return claimed;
    } catch (err) {
      console.warn('[Race] claim rematch creation', err);
      return false;
    }
  }

  async function publishRematchMatchId(matchId, newMatchId) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref || !newMatchId) return false;
    if (inWriteCooldown()) return false;
    try {
      await ref.update({ rematchMatchId: newMatchId });
      return true;
    } catch (err) {
      console.warn('[Race] publish rematch match id', err);
      return false;
    }
  }

  async function publishRematchMatchIdWithRetry(matchId, newMatchId, attempts = 4) {
    for (let i = 0; i < attempts; i++) {
      const ok = await publishRematchMatchId(matchId, newMatchId);
      if (ok) return true;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (i + 1)));
      }
    }
    return false;
  }

  async function releaseRematchClaim(matchId) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref) return false;
    if (inWriteCooldown()) return false;
    try {
      const snap = await ref.get();
      if (!snap.exists) return false;
      const data = snap.data();
      if (!data || data.status !== 'done' || data.rematchMatchId) return false;
      await ref.update({ rematchClaimedByUid: firebase.firestore.FieldValue.delete() });
      return true;
    } catch (err) {
      console.warn('[Race] release rematch claim', err);
      return false;
    }
  }

  global.RaceService = {
    MAX_GUESSES,
    TURN_DURATION_MS,
    TURN_DURATION_NORMAL_MS,
    INSPECT_DURATION_MS,
    GAME_TYPES,
    PLAY_MODES,
    TURN_PHASES,
    MATCH_MODES,
    TURN_MODES,
    defaultProgress,
    defaultSharedState,
    defaultRelatedWordsSharedState,
    createMatch,
    createRematchMatch,
    acceptMatch,
    declineMatch,
    abandonMatch,
    resetRelatedWordsMatch,
    usesTurnLiveRtdb,
    updateTurnLive,
    updateRelatedWordsLive,
    setPlayerReady,
    tryActivateMatch,
    updateMyProgress,
    markFinished,
    submitRelatedWordsRound,
    pressRelatedWordsReveal,
    submitTurn,
    completeInspectPhase,
    completeTurnWindow,
    expireTurnIfNeeded,
    tryFinalizeMatch,
    subscribeMatch,
    subscribeIncomingChallenges,
    getOpponent,
    amPlayer1,
    startedAtMs,
    getRematchLobbyState,
    setResultsPresent,
    setRematchReady,
    claimRematchCreation,
    publishRematchMatchId,
    publishRematchMatchIdWithRetry,
    releaseRematchClaim,
    turnStartedAtMs,
    turnRemainingMs,
    turnElapsedRatio,
    turnDurationMs,
    LETTER_LENGTHS,
    turnDurationForLength,
    turnDurationForMode,
    isTurnReview,
    isInspectPhase,
    isRushPhase,
    inspectEndsAtMs,
    inspectRemainingMs,
    inspectElapsedRatio,
    getMatchWordLength,
    normalizeWordLength,
    getTurnMode,
    normalizeTurnMode,
    inWriteCooldown,
    haltOnQuotaError: haltAutomaticWrites,
    isQuotaError,
    isQuotaHalted,
    shouldFinalize,
    computeWinner,
    isKoreanMatch,
    isRelatedWords,
    isRelatedWordsChainComplete,
    computeRelatedWordsWinner,
    getRelatedWordsLinkCount,
    RELATED_WORDS_RACE_TARGET,
    RELATED_WORDS_STREAK_FIRE_MIN,
    pickRelatedWordsChain,
    pickRandomRelatedWordsChain,
    isTurnBased,
    getMatchPageUrl,
    syllableCount,
  };
})(typeof window !== 'undefined' ? window : globalThis);
