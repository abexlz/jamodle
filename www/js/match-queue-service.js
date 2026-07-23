/**
 * Random matchmaking queue — pairs strangers for Jamo turn 1v1 and Word Chain race.
 */
(function (global) {
  'use strict';

  const QUEUE_STATUS = { searching: 'searching', matched: 'matched', cancelled: 'cancelled' };
  const QUEUE_STALE_MS = 3 * 60 * 1000;
  const PAIR_RETRY_MS = 1500;
  const BOT_FALLBACK_MS = global.BotProfileService?.BOT_FALLBACK_MS ?? 25_000;

  let activeSession = null;

  function getDb() {
    return global.FirebaseSocial?.getDb?.();
  }

  function getUid() {
    return global.FirebaseSocial?.getCurrentUid?.();
  }

  function queueRef() {
    const db = getDb();
    return db ? db.collection('matchQueue') : null;
  }

  function isStale(entry) {
    if (!entry?.createdAt) return false;
    const createdMs = entry.createdAt.toMillis ? entry.createdAt.toMillis() : Number(entry.createdAt);
    if (!createdMs) return false;
    return Date.now() - createdMs > QUEUE_STALE_MS;
  }

  function stopSession() {
    if (!activeSession) return;
    const session = activeSession;
    activeSession = null;
    if (session.ownUnsub) session.ownUnsub();
    if (session.opponentsUnsub) session.opponentsUnsub();
    if (session.pairTimer) clearInterval(session.pairTimer);
    if (session.botTimeoutTimer) clearTimeout(session.botTimeoutTimer);
    session.onStatus?.({ phase: 'idle' });
  }

  async function cleanupQueueEntry(uid) {
    const ref = queueRef()?.doc(uid);
    if (!ref) return;
    try {
      await ref.delete();
    } catch (_) { /* ignore */ }
  }

  async function leaveQueue() {
    const uid = getUid();
    stopSession();
    if (uid) await cleanupQueueEntry(uid);
  }

  function buildMatchData(player1Uid, player2Uid, player1Name, player2Name, entry, matchId) {
    const RS = global.RaceService;
    if (!RS) throw new Error('race-service');
    if (entry.game === 'word-chain') {
      if (!RS.buildWordChainMatchmakingMatchData) throw new Error('race-service');
      return RS.buildWordChainMatchmakingMatchData(player1Uid, player2Uid, player1Name, player2Name, matchId);
    }
    if (!RS.buildMatchmakingMatchData) throw new Error('race-service');
    return RS.buildMatchmakingMatchData(player1Uid, player2Uid, player1Name, player2Name, entry.wordLength);
  }

  async function tryPairWith(myUid, myEntry, opponentUid, opponentEntry) {
    if (!myEntry || !opponentEntry) return false;
    if (myUid === opponentUid) return false;
    if (myEntry.status !== QUEUE_STATUS.searching || opponentEntry.status !== QUEUE_STATUS.searching) {
      return false;
    }
    if (myEntry.game !== opponentEntry.game
      || myEntry.playMode !== opponentEntry.playMode
      || myEntry.wordLength !== opponentEntry.wordLength) {
      return false;
    }
    if (isStale(myEntry) || isStale(opponentEntry)) return false;

    const db = getDb();
    const qRef = queueRef();
    const mRef = global.RaceService?.matchesRef?.() || db?.collection('matches');
    if (!db || !qRef || !mRef) return false;

    const player1Uid = myUid < opponentUid ? myUid : opponentUid;
    const player2Uid = myUid < opponentUid ? opponentUid : myUid;
    const player1Name = myUid < opponentUid ? myEntry.displayName : opponentEntry.displayName;
    const player2Name = myUid < opponentUid ? opponentEntry.displayName : myEntry.displayName;

    if (myUid !== player1Uid) return false;

    const myRef = qRef.doc(myUid);
    const oppRef = qRef.doc(opponentUid);
    const matchRef = mRef.doc();

    try {
      await db.runTransaction(async (tx) => {
        const mySnap = await tx.get(myRef);
        const oppSnap = await tx.get(oppRef);
        if (!mySnap.exists || !oppSnap.exists) return;

        const mine = mySnap.data();
        const theirs = oppSnap.data();
        if (mine.status !== QUEUE_STATUS.searching || theirs.status !== QUEUE_STATUS.searching) return;
        if (mine.game !== theirs.game || mine.playMode !== theirs.playMode) return;
        if (mine.wordLength !== theirs.wordLength) return;

        const matchData = buildMatchData(player1Uid, player2Uid, player1Name, player2Name, mine, matchRef.id);
        tx.set(matchRef, matchData);
        const matchedPatch = {
          status: QUEUE_STATUS.matched,
          matchId: matchRef.id,
          matchedAt: firebase.firestore.FieldValue.serverTimestamp(),
          matchedByUid: myUid,
        };
        tx.update(myRef, matchedPatch);
        tx.update(oppRef, matchedPatch);
      });
      return true;
    } catch (err) {
      console.warn('[MatchQueue] pair failed', err);
      return false;
    }
  }

  async function scanForOpponents(session) {
    const uid = session.uid;
    const ref = queueRef();
    if (!ref || !uid) return;

    let mySnap;
    try {
      mySnap = await ref.doc(uid).get();
    } catch (_) {
      return;
    }
    if (!mySnap.exists) return;
    const myEntry = mySnap.data();
    if (!myEntry || myEntry.status !== QUEUE_STATUS.searching) return;
    if (isStale(myEntry)) {
      await cleanupQueueEntry(uid);
      session.onError?.({ code: 'stale' });
      stopSession();
      return;
    }

    let querySnap;
    try {
      querySnap = await ref
        .where('game', '==', myEntry.game)
        .where('playMode', '==', myEntry.playMode)
        .where('wordLength', '==', myEntry.wordLength)
        .where('status', '==', QUEUE_STATUS.searching)
        .orderBy('createdAt', 'asc')
        .limit(12)
        .get();
    } catch (err) {
      console.warn('[MatchQueue] opponent query failed', err);
      return;
    }

    for (const doc of querySnap.docs) {
      if (doc.id === uid) continue;
      const opponentEntry = doc.data();
      if (isStale(opponentEntry)) {
        cleanupQueueEntry(doc.id).catch(() => {});
        continue;
      }
      const paired = await tryPairWith(uid, myEntry, doc.id, opponentEntry);
      if (paired) return;
    }
  }

  function handleOwnQueueUpdate(session, snap) {
    if (!snap.exists) return;
    const data = snap.data();
    if (!data) return;

    if (data.status === QUEUE_STATUS.matched && data.matchId) {
      session.onMatched?.({
        matchId: data.matchId,
        game: data.game,
        playMode: data.playMode,
        wordLength: data.wordLength,
      });
      stopSession();
    }
  }

  async function joinQueue(options) {
    const uid = getUid();
    const db = getDb();
    const ref = queueRef();
    if (!uid || !db || !ref) throw new Error('auth');

    await leaveQueue();

    const RS = global.RaceService;
    if (!RS) throw new Error('race-service');

    const game = options.game === 'word-chain' ? 'word-chain' : 'korean-match';
    const playMode = game === 'word-chain' ? RS.PLAY_MODES.race : RS.PLAY_MODES.turn;
    const wordLength = game === 'word-chain' ? 0 : RS.normalizeWordLength(options.wordLength);

    const displayName = global.FirebaseSocial?.getPublicName?.(
      global.FirebaseSocial?.getUserProfile?.()
    ) || '플레이어';

    const entry = {
      uid,
      displayName: String(displayName || '플레이어'),
      game,
      playMode,
      wordLength: Number(wordLength),
      status: QUEUE_STATUS.searching,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = ref.doc(uid);
    try {
      await docRef.delete();
    } catch (_) { /* ok if missing */ }
    await docRef.set(entry);

    const session = {
      uid,
      onStatus: options.onStatus || null,
      onMatched: options.onMatched || null,
      onBotFallback: options.onBotFallback || null,
      onError: options.onError || null,
      ownUnsub: null,
      opponentsUnsub: null,
      pairTimer: null,
      botTimeoutTimer: null,
    };
    activeSession = session;

    session.onStatus?.({ phase: 'searching', wordLength });

    session.ownUnsub = ref.doc(uid).onSnapshot(
      (snap) => handleOwnQueueUpdate(session, snap),
      (err) => {
        console.warn('[MatchQueue] own listener failed', err);
        session.onError?.({ code: 'listener' });
      }
    );

    session.opponentsUnsub = ref
      .where('game', '==', game)
      .where('playMode', '==', playMode)
      .where('wordLength', '==', wordLength)
      .where('status', '==', QUEUE_STATUS.searching)
      .orderBy('createdAt', 'asc')
      .limit(12)
      .onSnapshot(
        () => { scanForOpponents(session).catch(() => {}); },
        (err) => console.warn('[MatchQueue] opponents listener failed', err)
      );

    await scanForOpponents(session);
    session.pairTimer = setInterval(() => {
      scanForOpponents(session).catch(() => {});
    }, PAIR_RETRY_MS);

    session.botTimeoutTimer = setTimeout(async () => {
      if (activeSession !== session) return;
      const fallback = session.onBotFallback;
      await leaveQueue();
      fallback?.({ wordLength, game, playMode });
    }, BOT_FALLBACK_MS);

    return session;
  }

  global.MatchQueueService = {
    QUEUE_STATUS,
    joinQueue,
    leaveQueue,
    isSearching: () => !!activeSession,
  };
})(typeof window !== 'undefined' ? window : globalThis);
