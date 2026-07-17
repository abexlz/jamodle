/**
 * Firestore 끝말잇기 (word chain) 1v1 matches — separate from `matches`.
 */
(function (global) {
  'use strict';

  const TURN_DURATION_MS = 20000;
  const COLLECTION = 'wordChainMatches';

  const HC = () => global.HangulCompose;

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
    return db ? db.collection(COLLECTION) : null;
  }

  function normalizeWord(raw) {
    return String(raw || '').trim();
  }

  /** Hangul syllables only — exact match for chain rules (no 두음법칇 in v2). */
  function hangulSyllables(word) {
    const isSyl = HC()?.isHangulSyllable || ((ch) => {
      const c = ch.codePointAt(0);
      return c >= 0xAC00 && c <= 0xD7A3;
    });
    return [...normalizeWord(word)].filter(isSyl);
  }

  function firstSyllable(word) {
    const syls = hangulSyllables(word);
    return syls[0] || '';
  }

  function lastSyllable(word) {
    const syls = hangulSyllables(word);
    return syls[syls.length - 1] || '';
  }

  function nextPlayerUid(data, uid) {
    return data.player1Uid === uid ? data.player2Uid : data.player1Uid;
  }

  function pickFirstPlayerUid(p1, p2) {
    return Math.random() < 0.5 ? p1 : p2;
  }

  function deadlineFromNowMs(offsetMs) {
    const ms = Date.now() + (offsetMs ?? TURN_DURATION_MS);
    return firebase.firestore.Timestamp.fromMillis(ms);
  }

  function turnDeadlineMs(data) {
    const ts = data?.turnDeadline;
    if (!ts) return null;
    return typeof ts.toMillis === 'function' ? ts.toMillis() : null;
  }

  function turnRemainingMs(data, nowMs) {
    const ends = turnDeadlineMs(data);
    if (!ends) return TURN_DURATION_MS;
    const now = nowMs ?? Date.now();
    return Math.max(0, ends - now);
  }

  function turnElapsedRatio(data, nowMs) {
    const remaining = turnRemainingMs(data, nowMs);
    return Math.max(0, Math.min(1, 1 - remaining / TURN_DURATION_MS));
  }

  function getOpponent(data, myUid) {
    if (!data || !myUid) return null;
    const isP1 = data.player1Uid === myUid;
    return {
      uid: isP1 ? data.player2Uid : data.player1Uid,
      name: isP1 ? data.player2Name : data.player1Name,
      isPlayer1: !isP1,
    };
  }

  function amPlayer1(data, myUid) {
    return data?.player1Uid === myUid;
  }

  function getWinnerUid(data) {
    if (!data?.loserUid) return null;
    return data.loserUid === data.player1Uid ? data.player2Uid : data.player1Uid;
  }

  function getMatchPageUrl(matchId) {
    return `word-chain.html?id=${encodeURIComponent(matchId)}`;
  }

  async function createMatch(opponentUid) {
    const uid = getUid();
    const db = getDb();
    if (!uid || !db) throw new Error('auth');

    const myName = getPublicName();
    let opponentName = '플레이어';
    try {
      const snap = await db.collection('users').doc(opponentUid).get();
      if (snap.exists) opponentName = global.FirebaseSocial.getPublicName(snap.data());
    } catch { /* fallback */ }

    const firstTurnUid = pickFirstPlayerUid(uid, opponentUid);
    const ref = matchesRef().doc();
    const data = {
      player1Uid: uid,
      player2Uid: opponentUid,
      player1Name: myName,
      player2Name: opponentName,
      status: 'waiting',
      currentTurnUid: firstTurnUid,
      usedWords: [],
      requiredStartSyllable: '',
      turnDeadline: null,
      loserUid: null,
      endReason: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await ref.set(data);
    return ref.id;
  }

  async function acceptMatch(matchId) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref) throw new Error('db');
    await ref.update({
      status: 'active',
      turnDeadline: deadlineFromNowMs(TURN_DURATION_MS),
      acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function declineMatch(matchId) {
    const ref = matchesRef()?.doc(matchId);
    if (!ref) throw new Error('db');
    await ref.delete();
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
      onError || ((err) => console.error('[WordChain] match listener', err))
    );
  }

  function subscribeIncomingChallenges(onMatch) {
    const uid = getUid();
    const col = matchesRef();
    if (!uid || !col) return () => {};

    const q = col.where('player2Uid', '==', uid).where('status', '==', 'waiting');
    return q.onSnapshot(
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          onMatch({ id: change.doc.id, ...change.doc.data() });
        });
      },
      (err) => console.error('[WordChain] incoming challenges', err)
    );
  }

  function localRejectReason(data, word) {
    const trimmed = normalizeWord(word);
    if (!trimmed) return 'empty';
    const syls = hangulSyllables(trimmed);
    if (!syls.length) return 'notHangul';

    const required = normalizeWord(data.requiredStartSyllable);
    if (required && firstSyllable(trimmed) !== required) {
      return 'syllable';
    }

    const used = data.usedWords || [];
    if (used.includes(trimmed)) {
      return 'repeat';
    }

    return null;
  }

  async function submitValidWord(matchId, myUid, word) {
    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref || !myUid) throw new Error('auth');

    const trimmed = normalizeWord(word);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('missing');
      const data = snap.data();
      if (data.status !== 'active') throw new Error('inactive');
      if (data.currentTurnUid !== myUid) throw new Error('not-your-turn');

      const reject = localRejectReason(data, trimmed);
      if (reject === 'syllable') throw new Error('syllable');
      if (reject === 'repeat') throw new Error('repeat');
      if (reject) throw new Error('invalid');

      const usedWords = [...(data.usedWords || []), trimmed];
      const nextUid = nextPlayerUid(data, myUid);
      tx.update(ref, {
        usedWords,
        requiredStartSyllable: lastSyllable(trimmed),
        currentTurnUid: nextUid,
        turnDeadline: deadlineFromNowMs(TURN_DURATION_MS),
      });
    });
  }

  async function failInvalidWord(matchId, myUid, word) {
    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref || !myUid) throw new Error('auth');

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      if (data.status !== 'active') return;
      if (data.currentTurnUid !== myUid) return;
      if (data.loserUid) return;

      tx.update(ref, {
        status: 'done',
        loserUid: myUid,
        endReason: 'invalid_word',
        lastSubmittedWord: normalizeWord(word),
      });
    });
  }

  async function completeTurnDeadline(matchId, data) {
    if (!data || data.status !== 'active') return false;
    const deadline = turnDeadlineMs(data);
    if (!deadline || Date.now() < deadline) return false;

    const db = getDb();
    const ref = matchesRef()?.doc(matchId);
    if (!db || !ref) return false;

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const d = snap.data();
        if (d.status !== 'active') return;
        const dl = turnDeadlineMs(d);
        if (!dl || Date.now() < dl) return;
        if (d.turnDeadline?.toMillis?.() !== deadline) return;
        if (d.loserUid) return;

        tx.update(ref, {
          status: 'done',
          loserUid: d.currentTurnUid,
          endReason: 'timeout',
        });
      });
      return true;
    } catch (err) {
      console.warn('[WordChain] complete turn deadline', err);
      return false;
    }
  }

  global.WordChainService = {
    TURN_DURATION_MS,
    COLLECTION,
    createMatch,
    acceptMatch,
    declineMatch,
    subscribeMatch,
    subscribeIncomingChallenges,
    submitValidWord,
    failInvalidWord,
    completeTurnDeadline,
    getOpponent,
    amPlayer1,
    getWinnerUid,
    getMatchPageUrl,
    turnDeadlineMs,
    turnRemainingMs,
    turnElapsedRatio,
    localRejectReason,
    firstSyllable,
    lastSyllable,
    hangulSyllables,
    normalizeWord,
  };
})(typeof window !== 'undefined' ? window : globalThis);
