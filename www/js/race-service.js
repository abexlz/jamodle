/**
 * Firestore 1v1 race match operations — Wordle and Korean Match.
 */
(function (global) {
  'use strict';

  const MAX_GUESSES = 6;
  const TURN_DURATION_MS = 30000;
  const TURN_DURATION_NORMAL_MS = 60000;
  const INSPECT_DURATION_MS = 15000;
  const GAME_TYPES = { wordle: 'wordle', koreanMatch: 'korean-match' };
  const PLAY_MODES = { race: 'race', turn: 'turn' };
  const TURN_PHASES = { inspect: 'inspect', playing: 'playing', review: 'review' };
  const LETTER_LENGTHS = [1, 2, 3, 4, 5, 6];
  /** @deprecated legacy mode strings */
  const MATCH_MODES = ['easy', 'medium', 'hard'];
  /** @deprecated legacy mode strings */
  const TURN_MODES = ['easy', 'normal', 'hardcore'];

  function defaultProgress() {
    return { guessCount: 0, finished: false };
  }

  function defaultSharedState() {
    return { guessCount: 0, locked: [], over: false, winnerUid: null };
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
    return {
      gameType: GAME_TYPES.wordle,
      wordLength: opts.wordLength === 2 ? 2 : 3,
      ...opts,
    };
  }

  function isKoreanMatch(data) {
    return data?.gameType === GAME_TYPES.koreanMatch;
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

    const opts = normalizeOptions(optionsOrWordLength);
    const isMatch = opts.gameType === GAME_TYPES.koreanMatch;

    const myName = getPublicName();
    let opponentName = '플레이어';
    try {
      const snap = await db.collection('users').doc(opponentUid).get();
      if (snap.exists) opponentName = global.FirebaseSocial.getPublicName(snap.data());
    } catch { /* fallback name */ }

    const target = pickTarget(opts);
    const wordLength = isMatch ? syllableCount(target) : Number(opts.wordLength);

    const ref = matchesRef().doc();
    const data = {
      gameType: isMatch ? GAME_TYPES.koreanMatch : GAME_TYPES.wordle,
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

    await ref.set(data);
    return ref.id;
  }

  async function acceptMatch(matchId) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref) throw new Error('db');
    await ref.update({
      status: 'ready',
      player2Ready: true,
    });
  }

  async function declineMatch(matchId) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref) throw new Error('db');
    await ref.delete();
  }

  async function setPlayerReady(matchId, isPlayer1) {
    const field = isPlayer1 ? 'player1Ready' : 'player2Ready';
    await matchesRef()?.doc(matchId).update({ [field]: true });
  }

  async function tryActivateMatch(matchId, data) {
    if (!data || data.status !== 'ready') return;
    if (!data.player1Ready || !data.player2Ready) return;
    if (data.startedAt) return;

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
      }
      await ref.update(updates);
    } catch (err) {
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

  function shouldFinalize(data) {
    if (!data) return false;
    if (isTurnBased(data)) {
      return data.status === 'done' || data.sharedState?.over === true;
    }
    const p1 = data.player1Progress || defaultProgress();
    const p2 = data.player2Progress || defaultProgress();
    if (p1.won === true || p2.won === true) return true;
    return p1.finished && p2.finished;
  }

  function computeWinner(data) {
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

    const winnerUid = computeWinner(data);
    const ref = matchesRef()?.doc(matchId);
    if (!ref) return;

    try {
      await ref.update({
        status: 'done',
        winnerUid,
      });
    } catch (err) {
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
        snap.docs.forEach((doc) => {
          onMatch({ id: doc.id, ...doc.data() });
        });
      },
      (err) => console.error('[Race] incoming challenges', err)
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
      console.warn('[Race] complete inspect phase', err);
      return false;
    }
  }

  function buildExpiredTurnReveal(data) {
    const uid = data.currentTurnUid;
    const isP1 = data.player1Uid === uid;
    const syllableTotal = (data.target || '').length || 0;
    return {
      byUid: uid,
      byName: isP1 ? data.player1Name : data.player2Name,
      placements: [],
      correctCount: 0,
      totalPlaced: 0,
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

  async function submitTurn(matchId, myUid, payload) {
    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref || !myUid) throw new Error('auth');

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('missing');
      const data = snap.data();
      if (!isTurnBased(data) || data.status !== 'active') throw new Error('inactive');
      if (data.turnPhase === TURN_PHASES.inspect) throw new Error('inspect');
      if (data.currentTurnUid && data.currentTurnUid !== myUid) throw new Error('not-your-turn');

      const claimingFirst = !data.currentTurnUid;
      const activeTurnUid = claimingFirst ? myUid : data.currentTurnUid;

      const shared = {
        guessCount: (data.sharedState?.guessCount || 0) + 1,
        locked: [],
        over: !!payload.won,
        winnerUid: payload.won ? myUid : null,
      };
      const isP1 = data.player1Uid === myUid;
      const progKey = isP1 ? 'player1Progress' : 'player2Progress';
      const turnNum = data.turnNumber || 1;
      const historyEntry = buildTurnHistoryEntry(data, myUid, payload, turnNum);
      const history = [...(data.turnHistory || []), historyEntry];

      if (payload.won) {
        tx.update(ref, {
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
          },
        });
        return;
      }

      const nextUid = activeTurnUid === data.player1Uid ? data.player2Uid : data.player1Uid;
      tx.update(ref, {
        sharedState: shared,
        turnPhase: TURN_PHASES.playing,
        currentTurnUid: nextUid,
        turnNumber: turnNum + 1,
        turnStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastTurnReveal: historyEntry,
        turnHistory: history,
      });
    });
  }

  async function completeTurnWindow(matchId, data) {
    if (!isTurnBased(data) || data.status !== 'active') return false;
    if (isInspectPhase(data) || !data.currentTurnUid) return false;
    const started = turnStartedAtMs(data);
    const duration = turnDurationMs(data);
    if (!started || Date.now() < started + duration) return false;

    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref) return false;

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const d = snap.data();
        if (!isTurnBased(d) || d.status !== 'active') return;
        const s = turnStartedAtMs(d);
        if (!s || Date.now() < s + turnDurationMs(d)) return;
        if (d.turnStartedAt?.toMillis?.() !== started) return;

        if (d.turnPhase !== TURN_PHASES.playing) return;

        const reveal = buildExpiredTurnReveal(d);
        const historyEntry = {
          ...reveal,
          turnNumber: d.turnNumber || 1,
        };
        const history = [...(d.turnHistory || []), historyEntry];
        const nextUid = d.currentTurnUid === d.player1Uid ? d.player2Uid : d.player1Uid;
        const shared = {
          ...(d.sharedState || defaultSharedState()),
          guessCount: (d.sharedState?.guessCount || 0) + 1,
        };
        tx.update(ref, {
          sharedState: shared,
          turnPhase: TURN_PHASES.playing,
          currentTurnUid: nextUid,
          turnNumber: (d.turnNumber || 1) + 1,
          turnStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastTurnReveal: historyEntry,
          turnHistory: history,
        });
      });
      return true;
    } catch (err) {
      console.warn('[Race] complete turn window', err);
      return false;
    }
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
    createMatch,
    acceptMatch,
    declineMatch,
    setPlayerReady,
    tryActivateMatch,
    updateMyProgress,
    markFinished,
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
    shouldFinalize,
    computeWinner,
    isKoreanMatch,
    isTurnBased,
    getMatchPageUrl,
    syllableCount,
  };
})(typeof window !== 'undefined' ? window : globalThis);
