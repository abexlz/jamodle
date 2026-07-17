/**
 * Realtime Database transport for turn-by-turn live board sync.
 * Path: turnLive/{matchId}/live/{uid}
 */
(function (global) {
  'use strict';

  const ROOT = 'turnLive';
  const subscriptions = new Map();

  function getRtdb() {
    return global.FirebaseSocial?.getRtdb?.() || null;
  }

  function isEnabled() {
    return global.FirebaseSocial?.hasRtdb?.() === true;
  }

  function liveRef(matchId, uid) {
    const rtdb = getRtdb();
    if (!rtdb || !matchId || !uid) return null;
    return rtdb.ref(`${ROOT}/${matchId}/live/${uid}`);
  }

  function metaRef(matchId) {
    const rtdb = getRtdb();
    if (!rtdb || !matchId) return null;
    return rtdb.ref(`${ROOT}/${matchId}/meta`);
  }

  function matchRef(matchId) {
    const rtdb = getRtdb();
    if (!rtdb || !matchId) return null;
    return rtdb.ref(`${ROOT}/${matchId}`);
  }

  async function ensureMatchMeta(matchId, player1Uid, player2Uid) {
    if (!isEnabled() || !matchId || !player1Uid || !player2Uid) return;
    const ref = metaRef(matchId);
    if (!ref) return;
    try {
      await ref.transaction((current) => {
        if (current) return current;
        return { player1Uid, player2Uid };
      });
    } catch (err) {
      console.warn('[TurnLiveRtdb] ensure meta', err);
    }
  }

  async function writeLive(matchId, myUid, payload) {
    const ref = liveRef(matchId, myUid);
    if (!ref) return;
    await ref.set(payload);
  }

  async function readLiveOnce(matchId, uid) {
    const ref = liveRef(matchId, uid);
    if (!ref) return null;
    const snap = await ref.once('value');
    return snap.val() || null;
  }

  async function clearLive(matchId, uid) {
    const ref = liveRef(matchId, uid);
    if (!ref) return;
    try {
      await ref.remove();
    } catch (err) {
      console.warn('[TurnLiveRtdb] clear live', err);
    }
  }

  async function clearMatchLive(matchId) {
    const ref = matchRef(matchId);
    if (!ref) return;
    try {
      await ref.remove();
    } catch (err) {
      console.warn('[TurnLiveRtdb] clear match', err);
    }
  }

  function subscribeOpponentLive(matchId, opponentUid, onLive) {
    const key = `${matchId}:${opponentUid}`;
    unsubscribeOpponentLive(matchId, opponentUid);
    const ref = liveRef(matchId, opponentUid);
    if (!ref) return () => {};
    const handler = (snap) => {
      onLive(snap.val() || null);
    };
    ref.on('value', handler);
    subscriptions.set(key, { ref, handler });
    return () => unsubscribeOpponentLive(matchId, opponentUid);
  }

  function unsubscribeOpponentLive(matchId, opponentUid) {
    const key = `${matchId}:${opponentUid}`;
    const sub = subscriptions.get(key);
    if (!sub) return;
    sub.ref.off('value', sub.handler);
    subscriptions.delete(key);
  }

  function unsubscribeAll() {
    subscriptions.forEach((sub) => {
      sub.ref.off('value', sub.handler);
    });
    subscriptions.clear();
  }

  global.TurnLiveRtdb = {
    isEnabled,
    ensureMatchMeta,
    writeLive,
    readLiveOnce,
    clearLive,
    clearMatchLive,
    subscribeOpponentLive,
    unsubscribeOpponentLive,
    unsubscribeAll,
  };
})(typeof window !== 'undefined' ? window : globalThis);
