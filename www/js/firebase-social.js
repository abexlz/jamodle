/**
 * Firebase Auth + Firestore friends & daily leaderboard (CDN compat, no build step).
 */
(function (global) {
  'use strict';

  const firebaseConfig = {
    apiKey: 'AIzaSyAf2sMQ_0-qfF8188Zo9RXQMe5mvu8KA6w',
    authDomain: 'korean-wordle-d30a3.firebaseapp.com',
    projectId: 'korean-wordle-d30a3',
    storageBucket: 'korean-wordle-d30a3.firebasestorage.app',
    messagingSenderId: '736210860951',
    appId: '1:736210860951:web:07cee34d068953e21f22d2',
    // Set after creating Realtime Database in Firebase Console (Build → Realtime Database).
    // Example: https://korean-wordle-d30a3-default-rtdb.asia-southeast1.firebasedatabase.app
    databaseURL: 'https://korean-wordle-d30a3-default-rtdb.asia-southeast1.firebasedatabase.app',
  };

  const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const DAILY_LAUNCH = '2024-01-01';
  const DAILY_TZ = 'Asia/Seoul';
  const NICKNAME_MIN = 2;
  const NICKNAME_MAX = 16;
  const DEFAULT_NICKNAME = '플레이어';
  const DEFAULT_LOCAL_NAMES = new Set(['Learner', '학습자', DEFAULT_NICKNAME]);

  function commonT(key) {
    return global.I18n?.t('common.' + key) ?? '';
  }

  function raceT(key, vars) {
    return global.I18n?.t('race.' + key, vars) ?? '';
  }

  function defaultNickname() {
    return socialT('social.defaultPlayer') || DEFAULT_NICKNAME;
  }

  let auth = null;
  let db = null;
  let rtdb = null;
  let currentUser = null;
  let userProfile = null;
  let gameHooks = {};
  let profileSocialRoot = null;
  let leaderboardPageRoot = null;
  let coreReady = false;
  let authReady = false;
  let incomingChallengeUnsub = null;
  let incomingFriendRequestUnsub = null;
  let acceptedFriendSyncUnsub = null;
  let pendingChallengeFriendUid = null;
  let pendingChallengeFriendName = '';
  let pendingChallengeIsTurn = false;
  let pendingChallengeFlow = 'legacy';
  let pendingMenuBattleGame = 'jamodle';
  let pendingWordChainBackStep = 'game';
  const shownChallengeIds = new Set();
  const syncedAcceptedRequestIds = new Set();
  let authReadyWaiters = [];
  let idleListenersPaused = false;

  function runAfterUserGesture(task) {
    const run = () => {
      global.removeEventListener('pointerdown', run);
      global.removeEventListener('keydown', run);
      global.removeEventListener('touchstart', run);
      Promise.resolve().then(task).catch(() => {});
    };
    global.addEventListener('pointerdown', run, { once: true, passive: true });
    global.addEventListener('keydown', run, { once: true, passive: true });
    global.addEventListener('touchstart', run, { once: true, passive: true });
  }

  function getTodayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function getDayNumber() {
    const today = getTodayKey();
    const launchMs = new Date(DAILY_LAUNCH + 'T00:00:00+09:00').getTime();
    const todayMs = new Date(today + 'T00:00:00+09:00').getTime();
    return Math.floor((todayMs - launchMs) / 86400000) + 1;
  }

  function generateFriendCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += FRIEND_CODE_CHARS[Math.floor(Math.random() * FRIEND_CODE_CHARS.length)];
    }
    return code;
  }

  function socialT(key, vars) {
    return global.I18n?.t('profile.' + key, vars) ?? '';
  }

  function normalizeNickname(raw) {
    if (typeof raw !== 'string') return '';
    return raw.trim().replace(/\s+/g, ' ').slice(0, NICKNAME_MAX);
  }

  function validateNickname(raw) {
    const nickname = normalizeNickname(raw);
    if (nickname.length < NICKNAME_MIN) return { ok: false, reason: 'tooShort' };
    if (nickname.length > NICKNAME_MAX) return { ok: false, reason: 'tooLong' };
    if (!/[\p{L}\p{N}]/u.test(nickname)) return { ok: false, reason: 'invalid' };
    return { ok: true, nickname };
  }

  function getPublicName(data) {
    if (!data) return defaultNickname();
    return data.nickname || data.displayName || defaultNickname();
  }

  function pickInitialNickname(user) {
    const local = global.ProfileService?.loadProfile?.()?.displayName;
    if (local && !DEFAULT_LOCAL_NAMES.has(local)) {
      const localValid = validateNickname(local);
      if (localValid.ok) return localValid.nickname;
    }
    const googleValid = validateNickname(user.displayName || '');
    if (googleValid.ok) return googleValid.nickname;
    return DEFAULT_NICKNAME;
  }

  function nicknameErrorMessage(reason) {
    const key = 'nickname.' + reason;
    const msg = socialT(key);
    if (msg && msg !== key) return msg;
    const fallbacks = {
      tooShort: '2자 이상 입력해주세요.',
      tooLong: '16자 이하로 입력해주세요.',
      invalid: '글자, 숫자, 공백만 사용할 수 있어요.',
      unchanged: '이미 사용 중인 닉네임이에요.',
      error: '닉네임을 저장하지 못했어요.',
    };
    return fallbacks[reason] || fallbacks.error;
  }

  function updateProfileAuthChrome(loggedIn) {
    const saveBtn = document.getElementById('profile-nickname-save-btn');
    const hint = document.getElementById('profile-nickname-hint');
    const label = document.getElementById('profile-nickname-label');
    const msg = document.getElementById('profile-nickname-msg');
    [saveBtn, hint, label].forEach((el) => {
      if (el) el.hidden = !loggedIn;
    });
    if (msg && !loggedIn) {
      msg.hidden = true;
      msg.textContent = '';
      msg.className = 'profile-social-msg';
    }
  }

  function syncLocalDisplayName(nickname) {
    global.ProfileService?.setDisplayName?.(nickname);
    const nameInput = document.getElementById('profile-name-input');
    if (nameInput) nameInput.value = nickname;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureCore() {
    if (coreReady) return true;
    if (typeof firebase === 'undefined') {
      console.error('[Firebase] compat SDK not loaded');
      return false;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    if (firebaseConfig.databaseURL && typeof firebase.database === 'function') {
      rtdb = firebase.database();
    } else if (firebaseConfig.databaseURL) {
      console.warn('[Firebase] Realtime Database SDK not loaded — RTDB features disabled');
    }
    try {
      firebase.firestore.setLogLevel('error');
      db.settings({
        experimentalForceLongPolling: true,
        experimentalAutoDetectLongPolling: false,
        merge: true,
      });
    } catch (err) {
      console.warn('[Firebase] Firestore transport settings skipped', err);
    }
    coreReady = true;

    auth.getRedirectResult().catch((err) => {
      if (err?.code === 'auth/unauthorized-domain') {
        alert(loginErrorMessage(err));
        return;
      }
      if (err && err.code !== 'auth/popup-closed-by-user') {
        console.error('[Firebase] redirect sign-in failed', err);
      }
    });

    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      authReady = true;
      if (user) {
        try {
          userProfile = await ensureUserDoc(user);
          if (global.CloudSyncService?.syncOnLogin) {
            runAfterUserGesture(() => global.CloudSyncService.syncOnLogin(user.uid, db));
          }
          runAfterUserGesture(async () => {
            await pushLocalPublicProfile();
            await pushLocalWordChainBestStreak();
          });
        } catch (err) {
          console.error('[Firebase] user profile load failed', err);
          userProfile = null;
        }
      } else {
        userProfile = null;
      }
      if (!profileSocialRoot) {
        profileSocialRoot = document.getElementById('profile-social-root');
      }
      updateProfileAuthChrome(!!user);
      renderProfileSocial();
      refreshMultiplayerOverlay().catch((err) => {
        console.error('[Firebase] multiplayer overlay refresh failed', err);
      });
      if (leaderboardPageRoot) {
        updateLeaderboardLoginState();
        refreshLeaderboardPage().catch((err) => {
          console.error('[Firebase] leaderboard page refresh failed', err);
        });
      }
      authReadyWaiters.splice(0).forEach((resolve) => resolve(user));
      if (user) {
        idleListenersPaused = false;
        if (isActiveMatchPage()) {
          pauseIdleFirestoreListeners();
        } else {
          startIncomingChallengeListener();
          startFriendRequestListeners();
        }
      } else {
        idleListenersPaused = false;
        stopIncomingChallengeListener();
        stopFriendRequestListeners();
        removeChallengeBanner();
        shownChallengeIds.clear();
        syncedAcceptedRequestIds.clear();
      }
    });

    return true;
  }

  async function ensureUserDoc(user) {
    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      let friendCode = generateFriendCode();
      for (let attempt = 0; attempt < 12; attempt++) {
        const dup = await db.collection('users').where('friendCode', '==', friendCode).limit(1).get();
        if (dup.empty) break;
        friendCode = generateFriendCode();
      }
      const nickname = pickInitialNickname(user);
      const data = {
        nickname,
        displayName: nickname,
        friendCode,
        friends: [],
      };
      await ref.set(data);
      syncLocalDisplayName(nickname);
      return data;
    }

    const data = snap.data();
    if (!data.nickname) {
      const fromDisplay = data.displayName ? validateNickname(data.displayName) : { ok: false };
      const nickname = fromDisplay.ok ? fromDisplay.nickname : pickInitialNickname(user);
      const patch = { nickname, displayName: nickname };
      await ref.update(patch);
      syncLocalDisplayName(nickname);
      return { ...data, ...patch };
    }
    syncLocalDisplayName(getPublicName(data));
    return data;
  }

  async function setNickname(raw) {
    const validated = validateNickname(raw);
    if (!validated.ok) {
      return { ok: false, reason: validated.reason };
    }
    if (!currentUser) {
      return { ok: false, reason: 'error' };
    }
    if (!userProfile) {
      try {
        await refreshUserProfile();
      } catch {
        return { ok: false, reason: 'error' };
      }
    }
    if (getPublicName(userProfile) === validated.nickname) {
      return { ok: false, reason: 'unchanged' };
    }

    try {
      await db.collection('users').doc(currentUser.uid).update({
        nickname: validated.nickname,
        displayName: validated.nickname,
        nicknameUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      userProfile = {
        ...userProfile,
        nickname: validated.nickname,
        displayName: validated.nickname,
      };
      syncLocalDisplayName(validated.nickname);
      return { ok: true, nickname: validated.nickname };
    } catch (err) {
      console.error('[Firebase] set nickname failed', err);
      return { ok: false, reason: 'error' };
    }
  }

  async function refreshUserProfile() {
    if (!currentUser) return null;
    userProfile = await ensureUserDoc(currentUser);
    return userProfile;
  }

  async function syncPublicProfile(fields) {
    if (!currentUser || !db || !fields || typeof fields !== 'object') return;
    const patch = {};
    if (typeof fields.avatarId === 'string') patch.avatarId = fields.avatarId;
    if (typeof fields.frameId === 'string') {
      patch.frameId = fields.frameId === 'platinum' ? 'ruby' : fields.frameId;
    }
    if (typeof fields.totalXp === 'number' && Number.isFinite(fields.totalXp)) {
      patch.totalXp = Math.max(0, Math.floor(fields.totalXp));
    }
    if (!Object.keys(patch).length) return;
    try {
      await db.collection('users').doc(currentUser.uid).update(patch);
    } catch (err) {
      console.warn('[Firebase] sync public profile', err);
    }
  }

  function pushLocalPublicProfile() {
    let payload = null;
    if (global.ProfileService?.getPublicProfilePayload) {
      payload = global.ProfileService.getPublicProfilePayload();
    } else {
      try {
        const raw = global.AppStorage?.get?.('jamodeul-user-profile', null)
          || JSON.parse(localStorage.getItem('jamodeul-user-profile') || 'null');
        if (raw && typeof raw === 'object') {
          payload = {
            avatarId: typeof raw.avatarId === 'string' ? raw.avatarId : 'default',
            frameId: raw.frameId === 'platinum' ? 'ruby' : (raw.frameId || 'none'),
            totalXp: Math.max(0, parseInt(raw.totalXp, 10) || 0),
          };
        }
      } catch (_) { /* ignore */ }
    }
    if (!payload) return Promise.resolve();
    return syncPublicProfile(payload);
  }

  function requireAuthMessage() {
    alert(socialT('social.loginRequired'));
  }

  function preferRedirectSignIn() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
    try {
      return global.matchMedia?.('(display-mode: standalone)')?.matches === true;
    } catch {
      return false;
    }
  }

  function loginErrorMessage(err) {
    if (err?.code === 'auth/unauthorized-domain') {
      const host = global.location?.hostname || 'this site';
      return socialT('social.unauthorizedDomain', { host })
        || `Add "${host}" to Firebase Authentication → Authorized domains, then try again.`;
    }
    return socialT('social.loginFailed') || 'Sign-in failed. Please try again.';
  }

  async function signInWithGoogle() {
    if (!ensureCore()) {
      alert(socialT('social.loginLoadFailed'));
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    if (preferRedirectSignIn()) {
      try {
        await auth.signInWithRedirect(provider);
      } catch (err) {
        console.error('[Firebase] redirect sign-in failed', err);
        alert(loginErrorMessage(err));
      }
      return;
    }
    try {
      await auth.signInWithPopup(provider);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') return;
      const redirectCodes = new Set([
        'auth/popup-blocked',
        'auth/unauthorized-domain',
        'auth/operation-not-supported-in-this-environment',
        'auth/web-storage-unsupported',
      ]);
      if (redirectCodes.has(err.code)) {
        try {
          await auth.signInWithRedirect(provider);
          return;
        } catch (redirectErr) {
          console.error('[Firebase] redirect fallback failed', redirectErr);
          alert(loginErrorMessage(redirectErr));
          return;
        }
      }
      console.error('[Firebase] popup sign-in failed', err);
      alert(loginErrorMessage(err));
    }
  }

  async function signOut() {
    if (!auth) return;
    await auth.signOut();
  }

  function onDocumentClick(e) {
    const el = e.target.closest('[data-social-action]');
    if (!el) return;

    const action = el.dataset.socialAction;
    if (action === 'login') {
      e.preventDefault();
      signInWithGoogle();
    } else if (action === 'logout') {
      e.preventDefault();
      signOut();
    } else if (action === 'save-nickname') {
      e.preventDefault();
      saveNickname();
    } else if (action === 'copy-code') {
      e.preventDefault();
      copyFriendCode();
    } else if (action === 'add-friend') {
      e.preventDefault();
      sendFriendRequestByCode();
    } else if (action === 'accept-friend-request') {
      e.preventDefault();
      acceptFriendRequest(el.dataset.requestId);
    } else if (action === 'decline-friend-request') {
      e.preventDefault();
      declineFriendRequest(el.dataset.requestId);
    } else if (action === 'cancel-friend-request') {
      e.preventDefault();
      cancelFriendRequest(el.dataset.requestId);
    } else if (action === 'open-leaderboard') {
      e.preventDefault();
      openLeaderboard(el.dataset.leaderboardGame || 'match');
    } else if (action === 'leaderboard-tab') {
      e.preventDefault();
      const game = el.dataset.leaderboardTab;
      if (game && game !== activeLeaderboardGame) {
        activeLeaderboardGame = game === 'streak' ? 'streak' : 'match';
        updateLeaderboardPageTabs();
        updateLeaderboardPageHeader();
        refreshLeaderboardPage().catch((err) => {
          console.error('[Firebase] leaderboard tab failed', err);
        });
      }
    } else if (action === 'leaderboard-scope') {
      e.preventDefault();
      const scope = el.dataset.leaderboardScope;
      if (scope && scope !== activeLeaderboardScope) {
        activeLeaderboardScope = scope === 'friends' ? 'friends' : 'global';
        updateLeaderboardPageTabs();
        refreshLeaderboardPage().catch((err) => {
          console.error('[Firebase] leaderboard scope failed', err);
        });
      }
    } else if (action === 'close-leaderboard') {
      e.preventDefault();
      closeLeaderboard();
    } else if (action === 'challenge-friend') {
      e.preventDefault();
      pendingChallengeIsTurn = false;
      openChallengeGamePicker(el.dataset.friendUid, el.dataset.friendName || '');
    } else if (action === 'challenge-friend-menu') {
      e.preventDefault();
      if (pendingChallengeFlow === 'menu-battle-custom') {
        openBattleCustomFriendFlow(el.dataset.friendUid, el.dataset.friendName || '');
      } else {
        openChallengeMenuFlow(el.dataset.friendUid, el.dataset.friendName || '');
      }
    } else if (action === 'challenge-friend-turn') {
      e.preventDefault();
      openTurnChallengePicker(el.dataset.friendUid, el.dataset.friendName || '');
    } else if (action === 'challenge-friend-wordchain') {
      e.preventDefault();
      startWordChainChallenge(el.dataset.friendUid);
    } else if (action === 'challenge-game-wordle') {
      e.preventDefault();
      showChallengeWordleStep();
    } else if (action === 'challenge-game-match') {
      e.preventDefault();
      pendingChallengeIsTurn = true;
      showChallengeTurnMatchStep();
    } else if (action === 'challenge-mode-jamodle') {
      e.preventDefault();
      pendingChallengeIsTurn = true;
      showChallengeTurnMatchStep();
    } else if (action === 'challenge-related-words-race') {
      e.preventDefault();
      if (pendingChallengeFlow === 'menu-battle-custom' && pendingMenuBattleGame === 'word-chain') {
        startRelatedWordsRaceChallenge(pendingChallengeFriendUid);
      } else {
        showWordChainPickStep();
      }
    } else if (action === 'challenge-word-chain-pick') {
      e.preventDefault();
      const chainId = el.dataset.chainId;
      if (chainId) startRelatedWordsRaceChallenge(pendingChallengeFriendUid, chainId);
    } else if (action === 'challenge-length') {
      e.preventDefault();
      const len = Number(el.dataset.wordLength);
      if (len === 2 || len === 3) startWordleChallenge(pendingChallengeFriendUid, len);
    } else if (action === 'challenge-korean-length') {
      e.preventDefault();
      const len = Number(el.dataset.wordLength);
      const lengths = global.MatchWords?.LETTER_LENGTHS || [1, 2, 3, 4, 5, 6];
      if (lengths.includes(len)) {
        startTurnChallenge(pendingChallengeFriendUid, len);
      }
    } else if (action === 'challenge-back') {
      e.preventDefault();
      const wordChainVisible = !document.querySelector('#challenge-step-word-chain')?.classList.contains('hidden');
      if (wordChainVisible) {
        showChallengeStep(pendingWordChainBackStep);
        return;
      }
      if (pendingChallengeFlow === 'menu-user-first') {
        const battleGameVisible = !document.querySelector('#challenge-step-battle-game')?.classList.contains('hidden');
        const lengthVisible = !document.querySelector('#challenge-step-korean-length')?.classList.contains('hidden');
        if (lengthVisible) {
          showChallengeBattleGameStep();
          return;
        }
        if (battleGameVisible) {
          closeChallengeLengthPicker();
          openMultiplayerPicker();
          return;
        }
        showChallengeBattleGameStep();
      } else if (pendingChallengeFlow === 'menu-battle-custom') {
        const lengthVisible = !document.querySelector('#challenge-step-korean-length')?.classList.contains('hidden');
        if (lengthVisible) {
          pendingChallengeFriendUid = null;
          pendingChallengeFriendName = '';
          pendingChallengeIsTurn = true;
          document.getElementById('race-length-overlay')?.classList.add('hidden');
          document.body.classList.remove('challenge-open');
          openMultiplayerPicker();
          return;
        }
        closeChallengeLengthPicker();
      } else if (pendingChallengeIsTurn) showChallengeTurnMatchStep();
      else showChallengeGameStep();
    } else if (action === 'challenge-cancel') {
      e.preventDefault();
      closeChallengeLengthPicker();
    } else if (action === 'challenge-accept') {
      e.preventDefault();
      acceptIncomingChallenge(
        el.dataset.matchId,
        el.dataset.gameType,
        el.dataset.playMode,
        el.dataset.challengeKind
      );
    } else if (action === 'challenge-decline') {
      e.preventDefault();
      declineIncomingChallenge(el.dataset.matchId, el.dataset.challengeKind);
    } else if (action === 'multiplayer-close') {
      e.preventDefault();
      closeMultiplayerPicker();
    } else if (action === 'bot-fight-related-words') {
      e.preventDefault();
      startRelatedWordsBotFight();
    } else if (action === 'bot-fight-jamo') {
      e.preventDefault();
      startMatchTurnBotFight();
    }
  }

  /** Temporary dev-only shortcut: local Related Words match vs a simulated bot. */
  function startRelatedWordsBotFight() {
    if (global.DevBuild?.isDevModeActive?.() !== true) return;
    const overlay = document.getElementById('multiplayer-overlay');
    const slider = overlay?.querySelector('[data-bot-winrate]');
    const winrate = Number(slider?.value);
    const wr = Number.isFinite(winrate) ? Math.min(100, Math.max(0, winrate)) : 50;
    const speed = overlay?.querySelector('[data-multiplayer-bot-section]')?.dataset.selectedSpeed || 'medium';
    const chainId = overlay?.querySelector('[data-bot-chain]')?.value || '';
    const safeSpeed = ['slow', 'medium', 'fast'].includes(speed) ? speed : 'medium';
    closeMultiplayerPicker();
    const chainParam = chainId ? `&chain=${encodeURIComponent(chainId)}` : '';
    global.location.href = `related-words-race.html?bot=1&winrate=${wr}&speed=${safeSpeed}${chainParam}`;
  }

  /** Temporary dev-only shortcut: local Jamo turn-based match vs a simulated bot. */
  function startMatchTurnBotFight() {
    if (global.DevBuild?.isDevModeActive?.() !== true) return;
    const overlay = document.getElementById('multiplayer-overlay');
    const slider = overlay?.querySelector('[data-bot-winrate]');
    const winrate = Number(slider?.value);
    const wr = Number.isFinite(winrate) ? Math.min(100, Math.max(0, winrate)) : 50;
    const speed = overlay?.querySelector('[data-multiplayer-bot-section]')?.dataset.selectedSpeed || 'medium';
    const wordLength = Number(overlay?.querySelector('[data-bot-jamo-length]')?.value);
    const wl = global.MatchWords?.normalizeWordLength?.(wordLength) ?? 4;
    const safeSpeed = ['slow', 'medium', 'fast'].includes(speed) ? speed : 'medium';
    closeMultiplayerPicker();
    global.location.href = `match-turn.html?bot=1&winrate=${wr}&speed=${safeSpeed}&wordLength=${wl}`;
  }

  function onDocumentKeydown(e) {
    if (e.key !== 'Enter') return;
    if (e.target.matches('[data-social-input="friend-code"]')) {
      e.preventDefault();
      sendFriendRequestByCode();
      return;
    }
    if (e.target.matches('[data-social-input="nickname"]')) {
      e.preventDefault();
      saveNickname();
    }
  }

  const LOGGED_OUT_HTML = `
    <p class="profile-social-hint">${escapeHtml(socialT('social.loginHint') || 'Google 계정으로 로그인하고 친구와 Daily 순위를 비교하세요.')}</p>
    <button type="button" class="profile-login-btn" data-social-action="login">${escapeHtml(socialT('social.login') || 'Google 로그인')}</button>
  `;

  function showLoggedOutUI() {
    if (!profileSocialRoot) return;
    profileSocialRoot.innerHTML = LOGGED_OUT_HTML;
  }

  function renderProfileSocial() {
    if (!profileSocialRoot) return;

    if (!authReady || !currentUser) {
      showLoggedOutUI();
      return;
    }

    const code = userProfile?.friendCode || '------';

    profileSocialRoot.innerHTML = `
      <div class="profile-social-signed-in">
        <button type="button" class="profile-login-btn profile-login-btn--out" data-social-action="logout">${escapeHtml(socialT('social.logout') || '로그아웃')}</button>
      </div>
      <div class="profile-social-block">
        <div class="profile-social-label">${escapeHtml(socialT('social.friendCode') || '내 친구 코드')}</div>
        <div class="profile-friend-code-row">
          <div class="profile-friend-code">${escapeHtml(code)}</div>
          <button type="button" class="profile-social-btn" data-social-action="copy-code">${escapeHtml(commonT('copy'))}</button>
        </div>
      </div>
      <div class="profile-social-block">
        <div class="profile-social-label">${escapeHtml(socialT('social.addFriend') || '친구 추가')}</div>
        <div class="profile-friend-code-row">
          <input type="text" class="profile-social-input" data-social-input="friend-code"
            maxlength="6" data-i18n-placeholder="profile.social.friendCodePlaceholder" placeholder="Friend code" autocomplete="off">
          <button type="button" class="profile-social-btn" data-social-action="add-friend">${escapeHtml(socialT('social.sendRequest') || '요청')}</button>
        </div>
        <div class="profile-social-msg" data-social-msg></div>
      </div>
      <div class="profile-social-block" data-social-incoming-requests hidden>
        <div class="profile-social-label">${escapeHtml(socialT('social.incomingRequests') || '받은 친구 요청')}</div>
        <ul class="profile-friend-requests-list" data-social-incoming-list></ul>
      </div>
      <div class="profile-social-block" data-social-outgoing-requests hidden>
        <div class="profile-social-label">${escapeHtml(socialT('social.outgoingRequests') || '보낸 요청')}</div>
        <ul class="profile-friend-requests-list" data-social-outgoing-list></ul>
      </div>
      <div class="profile-social-block">
        <div class="profile-social-label">${escapeHtml(socialT('social.friendsList') || '친구 목록')}</div>
        <ul class="profile-friends-list" data-social-friends-list>
          <li class="profile-friends-empty">${escapeHtml(socialT('social.loading'))}</li>
        </ul>
      </div>
    `;

    global.I18n?.applyToDocument?.(profileSocialRoot);

    renderFriendsList();
    renderIncomingFriendRequests();
    renderOutgoingFriendRequests();
  }

  function friendRequestDocId(fromUid, toUid) {
    return fromUid + '_' + toUid;
  }

  async function addFriendToOwnProfile(friendUid) {
    if (!currentUser || !friendUid || friendUid === currentUser.uid) return false;
    const meRef = db.collection('users').doc(currentUser.uid);
    let added = false;
    await db.runTransaction(async (tx) => {
      const meSnap = await tx.get(meRef);
      if (!meSnap.exists) return;
      const friends = meSnap.data().friends || [];
      if (friends.includes(friendUid)) return;
      tx.update(meRef, { friends: [...friends, friendUid] });
      added = true;
    });
    if (added) {
      await refreshUserProfile();
      renderFriendsList();
    }
    return added;
  }

  function renderIncomingFriendRequestsFromSnap(snap) {
    const block = profileSocialRoot?.querySelector('[data-social-incoming-requests]');
    const listEl = profileSocialRoot?.querySelector('[data-social-incoming-list]');
    if (!block || !listEl || !currentUser) return;

    if (!snap || snap.empty) {
      block.hidden = true;
      listEl.innerHTML = '';
      return;
    }
    block.hidden = false;
    listEl.innerHTML = '';
    snap.forEach((doc) => {
      const data = doc.data();
      const li = document.createElement('li');
      li.className = 'profile-friend-request-row';
      li.innerHTML = `
        <span class="friend-request-name">${escapeHtml(data.fromName || socialT('social.unknown') || '알 수 없음')}</span>
        <div class="friend-request-actions">
          <button type="button" class="profile-social-btn" data-social-action="accept-friend-request"
            data-request-id="${escapeHtml(doc.id)}">${escapeHtml(commonT('accept'))}</button>
          <button type="button" class="profile-social-btn profile-social-btn--muted" data-social-action="decline-friend-request"
            data-request-id="${escapeHtml(doc.id)}">${escapeHtml(commonT('decline'))}</button>
        </div>
      `;
      listEl.appendChild(li);
    });
  }

  async function renderIncomingFriendRequests() {
    const block = profileSocialRoot?.querySelector('[data-social-incoming-requests]');
    const listEl = profileSocialRoot?.querySelector('[data-social-incoming-list]');
    if (!block || !listEl || !currentUser) return;

    try {
      const snap = await db.collection('friendRequests')
        .where('toUid', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .get();
      renderIncomingFriendRequestsFromSnap(snap);
    } catch (err) {
      console.error('[Firebase] incoming friend requests failed', err);
    }
  }

  async function renderOutgoingFriendRequests() {
    const block = profileSocialRoot?.querySelector('[data-social-outgoing-requests]');
    const listEl = profileSocialRoot?.querySelector('[data-social-outgoing-list]');
    if (!block || !listEl || !currentUser) return;

    try {
      const snap = await db.collection('friendRequests')
        .where('fromUid', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .get();
      if (snap.empty) {
        block.hidden = true;
        listEl.innerHTML = '';
        return;
      }
      block.hidden = false;
      listEl.innerHTML = '';
      snap.forEach((doc) => {
        const data = doc.data();
        const li = document.createElement('li');
        li.className = 'profile-friend-request-row';
        li.innerHTML = `
          <span class="friend-request-name">${escapeHtml(data.toName || socialT('social.unknown') || '알 수 없음')}</span>
          <button type="button" class="profile-social-btn profile-social-btn--muted" data-social-action="cancel-friend-request"
            data-request-id="${escapeHtml(doc.id)}">${escapeHtml(commonT('cancel'))}</button>
        `;
        listEl.appendChild(li);
      });
    } catch (err) {
      console.error('[Firebase] outgoing friend requests failed', err);
    }
  }

  async function acceptFriendRequest(requestId) {
    if (!requestId || !currentUser) return;
    const reqRef = db.collection('friendRequests').doc(requestId);
    try {
      await db.runTransaction(async (tx) => {
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists) throw new Error('missing');
        const data = reqSnap.data();
        if (data.status !== 'pending' || data.toUid !== currentUser.uid) throw new Error('invalid');
        const meRef = db.collection('users').doc(currentUser.uid);
        const meSnap = await tx.get(meRef);
        const friends = meSnap.exists ? (meSnap.data().friends || []) : [];
        tx.update(reqRef, {
          status: 'accepted',
          respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        if (!friends.includes(data.fromUid)) {
          tx.update(meRef, { friends: [...friends, data.fromUid] });
        }
      });
      await refreshUserProfile();
      renderFriendsList();
      renderIncomingFriendRequests();
      renderOutgoingFriendRequests();
      const msgEl = getSocialMsgEl();
      if (msgEl) {
        msgEl.textContent = socialT('social.requestAccepted');
        msgEl.className = 'profile-social-msg ok';
      }
    } catch (err) {
      console.error('[Firebase] accept friend request failed', err);
      alert(socialT('social.acceptRequestFailed'));
    }
  }

  async function declineFriendRequest(requestId) {
    if (!requestId) return;
    try {
      await db.collection('friendRequests').doc(requestId).delete();
      renderIncomingFriendRequests();
    } catch (err) {
      console.error('[Firebase] decline friend request failed', err);
      alert(socialT('social.declineRequestFailed'));
    }
  }

  async function cancelFriendRequest(requestId) {
    if (!requestId) return;
    try {
      await db.collection('friendRequests').doc(requestId).delete();
      renderOutgoingFriendRequests();
    } catch (err) {
      console.error('[Firebase] cancel friend request failed', err);
    }
  }

  function startFriendRequestListeners() {
    stopFriendRequestListeners();
    if (!currentUser || !db) return;

    incomingFriendRequestUnsub = db.collection('friendRequests')
      .where('toUid', '==', currentUser.uid)
      .where('status', '==', 'pending')
      .onSnapshot(
        (snap) => {
          renderIncomingFriendRequestsFromSnap(snap);
        },
        (err) => console.error('[Firebase] incoming friend request listener', err)
      );

    acceptedFriendSyncUnsub = db.collection('friendRequests')
      .where('fromUid', '==', currentUser.uid)
      .where('status', '==', 'accepted')
      .onSnapshot(
        (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type !== 'added') return;
            if (syncedAcceptedRequestIds.has(change.doc.id)) return;
            syncedAcceptedRequestIds.add(change.doc.id);
            const toUid = change.doc.data()?.toUid;
            if (toUid) addFriendToOwnProfile(toUid);
          });
        },
        (err) => console.error('[Firebase] accepted friend sync listener', err)
      );
  }

  function pauseIdleFirestoreListeners() {
    if (idleListenersPaused) return;
    idleListenersPaused = true;
    stopIncomingChallengeListener();
    stopFriendRequestListeners();
  }

  function resumeIdleFirestoreListeners() {
    if (!idleListenersPaused || !currentUser) return;
    idleListenersPaused = false;
    startIncomingChallengeListener();
    startFriendRequestListeners();
  }

  function isActiveMatchPage() {
    const path = String(global.location?.pathname || '');
    if (!/(?:^|\/)(?:match-turn|match-race|race)\.html$/i.test(path)) return false;
    return Boolean(new URLSearchParams(global.location?.search || '').get('match'));
  }

  function syncIdleListenerVisibility() {
    if (!currentUser) return;
    if (isActiveMatchPage() || global.document?.hidden) pauseIdleFirestoreListeners();
    else resumeIdleFirestoreListeners();
  }

  function stopFriendRequestListeners() {
    if (incomingFriendRequestUnsub) {
      incomingFriendRequestUnsub();
      incomingFriendRequestUnsub = null;
    }
    if (acceptedFriendSyncUnsub) {
      acceptedFriendSyncUnsub();
      acceptedFriendSyncUnsub = null;
    }
  }

  function isCustomBattleDevBotFlow() {
    return pendingChallengeFlow === 'menu-battle-custom'
      && global.DevBuild?.isDevModeActive?.() === true;
  }

  function botCustomListItemHtml() {
    const isJamo = pendingMenuBattleGame === 'jamodle';
    const action = isJamo ? 'bot-fight-jamo' : 'bot-fight-related-words';
    const label = isJamo
      ? (global.I18n?.t('menu.battle.jamodle') || 'Jamo Game')
      : (global.I18n?.t('menu.battle.wordChain') || 'Word Chain');
    return `
      <li class="profile-friend-row profile-friend-row--bot">
        <span class="friend-name">🤖 Bot · ${escapeHtml(label)}</span>
        <button type="button" class="profile-challenge-btn profile-challenge-btn--bot" data-social-action="${action}">Play</button>
      </li>`;
  }

  function updateBotSectionForFlow(botSection) {
    if (!botSection) return;
    const isDev = global.DevBuild?.isDevModeActive?.() === true;
    const isCustom = pendingChallengeFlow === 'menu-battle-custom';
    botSection.classList.toggle('hidden', !isDev);

    const showJamo = !isCustom || pendingMenuBattleGame === 'jamodle';
    const showWordChain = !isCustom || pendingMenuBattleGame === 'word-chain';
    botSection.querySelectorAll('[data-bot-game-block="jamodle"]').forEach((el) => {
      el.classList.toggle('hidden', !showJamo);
    });
    botSection.querySelectorAll('[data-bot-game-block="word-chain"]').forEach((el) => {
      el.classList.toggle('hidden', !showWordChain);
    });
  }

  async function populateFriendsList(listEl, mode) {
    if (!listEl) return;
    const listMode = mode === 'turn' ? 'turn' : mode === 'wordchain' ? 'wordchain' : mode === 'menu-user' ? 'menu-user' : 'race';
    const action = listMode === 'turn'
      ? 'challenge-friend-turn'
      : listMode === 'wordchain'
        ? 'challenge-friend-wordchain'
        : listMode === 'menu-user'
          ? 'challenge-friend-menu'
          : 'challenge-friend';
    const btnLabel = listMode === 'turn'
      ? (global.I18n?.t('multiplayer.inviteTurn') || 'Invite')
      : listMode === 'wordchain'
        ? (global.I18n?.t('multiplayer.inviteWordChain') || 'Invite')
        : listMode === 'menu-user'
          ? (socialT('social.challengeChooseUser') || socialT('social.challenge'))
          : socialT('social.challenge');
    const btnClass = listMode === 'turn'
      ? 'profile-challenge-btn profile-challenge-btn--turn'
      : listMode === 'wordchain'
        ? 'profile-challenge-btn profile-challenge-btn--wordchain'
        : 'profile-challenge-btn';

    if (!currentUser) {
      if (isCustomBattleDevBotFlow()) {
        listEl.innerHTML = botCustomListItemHtml();
        return;
      }
      listEl.innerHTML = `<li class="profile-friends-empty">${escapeHtml(socialT('social.loginRequiredList'))}</li>`;
      return;
    }

    listEl.innerHTML = `<li class="profile-friends-empty">${escapeHtml(socialT('social.loading'))}</li>`;

    try {
      await refreshUserProfile();
    } catch (err) {
      console.error('[Firebase] refresh profile failed', err);
      listEl.innerHTML = `<li class="profile-friends-empty">${escapeHtml(socialT('social.friendsLoadFailed'))}</li>`;
      return;
    }

    const friendUids = userProfile?.friends || [];
    if (!friendUids.length) {
      listEl.innerHTML = isCustomBattleDevBotFlow() ? botCustomListItemHtml() : '';
      if (!listEl.innerHTML) {
        listEl.innerHTML = `<li class="profile-friends-empty">${escapeHtml(socialT('social.noFriendsYet'))}</li>`;
      }
      return;
    }

    try {
      const snaps = await Promise.all(friendUids.map((uid) => db.collection('users').doc(uid).get()));
      listEl.innerHTML = '';
      if (isCustomBattleDevBotFlow()) {
        listEl.insertAdjacentHTML('afterbegin', botCustomListItemHtml());
      }
      snaps.forEach((snap, i) => {
        const uid = friendUids[i];
        const name = snap.exists ? getPublicName(snap.data()) : (socialT('social.unknown') || '알 수 없음');
        const li = document.createElement('li');
        li.className = 'profile-friend-row';
        li.innerHTML = `
          <span class="friend-name">${escapeHtml(name)}</span>
          <button type="button" class="${btnClass}" data-social-action="${action}"
            data-friend-uid="${escapeHtml(uid)}" data-friend-name="${escapeHtml(name)}">${escapeHtml(btnLabel)}</button>
        `;
        listEl.appendChild(li);
      });
    } catch (err) {
      console.error('[Firebase] friends list failed', err);
      listEl.innerHTML = `<li class="profile-friends-empty">${escapeHtml(socialT('social.friendsLoadFailed'))}</li>`;
    }
  }

  async function renderFriendsList() {
    const listEl = profileSocialRoot?.querySelector('[data-social-friends-list]');
    await populateFriendsList(listEl, 'race');
  }

  function getNicknameMsgEl() {
    return document.getElementById('profile-nickname-msg')
      || profileSocialRoot?.querySelector('[data-social-nickname-msg]');
  }

  function getNicknameInput() {
    return document.getElementById('profile-name-input')
      || profileSocialRoot?.querySelector('[data-social-input="nickname"]');
  }

  async function saveNickname() {
    const msgEl = getNicknameMsgEl();
    const input = getNicknameInput();
    const saveBtn = document.getElementById('profile-nickname-save-btn')
      || profileSocialRoot?.querySelector('[data-social-action="save-nickname"]');
    if (!input) return;

    if (msgEl) {
      msgEl.hidden = false;
      msgEl.textContent = '';
      msgEl.className = 'profile-social-msg';
    }
    if (saveBtn) saveBtn.disabled = true;

    const result = await setNickname(input.value);
    if (msgEl) {
      if (result.ok) {
        msgEl.textContent = socialT('nickname.saved') || '닉네임이 저장됐어요!';
        msgEl.classList.add('ok');
        input.value = result.nickname;
      } else if (result.reason !== 'unchanged') {
        msgEl.textContent = nicknameErrorMessage(result.reason);
        msgEl.classList.add('error');
      } else {
        msgEl.hidden = true;
      }
    }

    if (saveBtn) saveBtn.disabled = false;
  }

  function getSocialMsgEl() {
    return profileSocialRoot?.querySelector('[data-social-msg]');
  }

  function getFriendCodeInput() {
    return profileSocialRoot?.querySelector('[data-social-input="friend-code"]');
  }

  async function sendFriendRequestByCode() {
    const msgEl = getSocialMsgEl();
    const input = getFriendCodeInput();
    if (!msgEl || !input) return;

    const code = input.value.trim().toUpperCase();
    msgEl.textContent = '';
    msgEl.className = 'profile-social-msg';

    if (!currentUser) {
      requireAuthMessage();
      return;
    }

    if (!userProfile) {
      try {
        await refreshUserProfile();
      } catch (err) {
        msgEl.textContent = socialT('social.profileLoadFailed');
        msgEl.classList.add('error');
        return;
      }
    }

    if (code.length !== 6) {
      msgEl.textContent = socialT('social.codeLength');
      msgEl.classList.add('error');
      return;
    }
    if (code === userProfile.friendCode) {
      msgEl.textContent = socialT('social.ownCode');
      msgEl.classList.add('error');
      return;
    }

    const addBtn = profileSocialRoot?.querySelector('[data-social-action="add-friend"]');
    if (addBtn) addBtn.disabled = true;

    try {
      const q = await db.collection('users').where('friendCode', '==', code).limit(1).get();
      if (q.empty) {
        msgEl.textContent = socialT('social.codeNotFound');
        msgEl.classList.add('error');
        return;
      }
      const friendUid = q.docs[0].id;
      const friendName = getPublicName(q.docs[0].data());

      if ((userProfile.friends || []).includes(friendUid)) {
        msgEl.textContent = socialT('social.alreadyFriends');
        msgEl.classList.add('error');
        return;
      }

      const outboundId = friendRequestDocId(currentUser.uid, friendUid);
      const inboundId = friendRequestDocId(friendUid, currentUser.uid);
      const [outboundSnap, inboundSnap] = await Promise.all([
        db.collection('friendRequests').doc(outboundId).get(),
        db.collection('friendRequests').doc(inboundId).get(),
      ]);

      if (inboundSnap.exists && inboundSnap.data()?.status === 'pending') {
        msgEl.textContent = socialT('social.theySentFirst');
        msgEl.classList.add('info');
        renderIncomingFriendRequests();
        return;
      }

      if (outboundSnap.exists) {
        const status = outboundSnap.data()?.status;
        if (status === 'pending') {
          msgEl.textContent = socialT('social.requestAlreadySent');
          msgEl.classList.add('info');
          return;
        }
        if (status === 'accepted') {
          msgEl.textContent = socialT('social.alreadyFriends');
          msgEl.classList.add('error');
          return;
        }
      }

      await db.collection('friendRequests').doc(outboundId).set({
        fromUid: currentUser.uid,
        toUid: friendUid,
        fromName: getPublicName(userProfile),
        toName: friendName,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      input.value = '';
      msgEl.textContent = socialT('social.requestSent');
      msgEl.classList.add('ok');
      renderOutgoingFriendRequests();
    } catch (err) {
      console.error('[Firebase] send friend request failed', err);
      msgEl.textContent = socialT('social.requestSendFailed');
      msgEl.classList.add('error');
    } finally {
      if (addBtn) addBtn.disabled = false;
    }
  }

  async function copyFriendCode() {
    if (!userProfile?.friendCode) {
      try {
        await refreshUserProfile();
      } catch {
        return;
      }
    }
    const code = userProfile?.friendCode;
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    const btn = profileSocialRoot?.querySelector('[data-social-action="copy-code"]');
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = commonT('copied');
    setTimeout(() => { btn.textContent = prev; }, 1500);
  }

  function formatElapsed(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const totalCs = Math.max(0, Math.floor(ms / 10));
    const cs = totalCs % 100;
    const totalSec = Math.floor(totalCs / 100);
    const s = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const m = totalMin % 60;
    const h = Math.floor(totalMin / 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  function extractGameResult(data, gameType) {
    if (!data) return null;
    if (gameType === 'wordle') {
      if (data.wordle) return data.wordle;
      if ('won' in data || data.guessCount != null) {
        return {
          won: !!data.won,
          guessCount: data.guessCount,
          elapsedMs: data.elapsedMs ?? null,
        };
      }
    }
    if (gameType === 'match' && data.match) return data.match;
    return null;
  }

  let activeLeaderboardGame = 'match';
  let activeLeaderboardScope = 'global';

  function leaderboardT(key) {
    return global.I18n?.t('leaderboard.' + key) ?? '';
  }

  async function fetchUserNamesMap(uids) {
    const map = {};
    const unique = [...new Set(uids.filter(Boolean))];
    await Promise.all(unique.map(async (uid) => {
      try {
        const snap = await db.collection('users').doc(uid).get();
        map[uid] = snap.exists ? getPublicName(snap.data()) : (socialT('social.unknown') || DEFAULT_NICKNAME);
      } catch {
        map[uid] = socialT('social.unknown') || DEFAULT_NICKNAME;
      }
    }));
    return map;
  }

  const RW_PROGRESS_KEY = 'jamodeul-related-words-progress';

  function readLocalWordChainBestStreak() {
    try {
      const data = global.AppStorage
        ? global.AppStorage.get(RW_PROGRESS_KEY, {})
        : JSON.parse(localStorage.getItem(RW_PROGRESS_KEY) || '{}');
      const solo = Math.max(0, parseInt(data.soloStreak, 10) || 0);
      const hasBest = data.bestSoloStreak != null && data.bestSoloStreak !== '';
      const best = hasBest
        ? Math.max(0, parseInt(data.bestSoloStreak, 10) || 0)
        : solo;
      return Math.max(best, solo);
    } catch {
      return 0;
    }
  }

  async function syncWordChainBestStreak(streak) {
    if (!currentUser || !db) return;
    const next = Math.max(0, Math.floor(Number(streak) || 0));
    if (!next) return;
    try {
      const ref = db.collection('users').doc(currentUser.uid);
      const snap = await ref.get();
      const remote = snap.exists
        ? Math.max(0, parseInt(snap.data().wordChainBestStreak, 10) || 0)
        : 0;
      const merged = Math.max(remote, next);
      if (merged > remote) {
        await ref.set({ wordChainBestStreak: merged }, { merge: true });
      }
      if (userProfile) {
        userProfile = { ...userProfile, wordChainBestStreak: merged };
      }
    } catch (err) {
      console.warn('[Firebase] sync word chain streak failed', err);
    }
  }

  async function pushLocalWordChainBestStreak() {
    const local = readLocalWordChainBestStreak();
    if (local > 0) {
      await syncWordChainBestStreak(local);
    }
  }

  async function fetchFriendsLeaderboardEntries(gameType) {
    if (gameType === 'streak') {
      const uids = [currentUser.uid, ...(userProfile.friends || [])];
      const userSnaps = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));
      return uids.map((uid, i) => {
        const data = userSnaps[i].exists ? userSnaps[i].data() : null;
        const name = data
          ? getPublicName(data)
          : (socialT('social.unknown') || '알 수 없음');
        const streak = data
          ? Math.max(0, parseInt(data.wordChainBestStreak, 10) || 0)
          : 0;
        return {
          uid,
          displayName: name,
          streak,
          won: streak > 0,
          notPlayed: streak <= 0,
        };
      });
    }

    const today = getTodayKey();
    const uids = [currentUser.uid, ...(userProfile.friends || [])];
    const userSnaps = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));
    const resultSnaps = await Promise.all(
      uids.map((uid) => db.collection('dailyResults').doc(today + '_' + uid).get())
    );

    return uids.map((uid, i) => {
      const name = userSnaps[i].exists
        ? getPublicName(userSnaps[i].data())
        : (socialT('social.unknown') || '알 수 없음');
      if (!resultSnaps[i].exists) {
        return { uid, displayName: name, notPlayed: true };
      }
      const result = extractGameResult(resultSnaps[i].data(), gameType);
      if (!result) {
        return { uid, displayName: name, notPlayed: true };
      }
      return {
        uid,
        displayName: name,
        won: !!result.won,
        guessCount: result.guessCount,
        elapsedMs: result.elapsedMs ?? null,
      };
    });
  }

  async function fetchGlobalLeaderboardEntries(gameType) {
    if (gameType === 'streak') {
      const snap = await db.collection('users')
        .orderBy('wordChainBestStreak', 'desc')
        .limit(100)
        .get();
      const raw = [];
      snap.forEach((doc) => {
        const data = doc.data();
        const streak = Math.max(0, parseInt(data.wordChainBestStreak, 10) || 0);
        if (streak <= 0) return;
        raw.push({
          uid: doc.id,
          displayName: getPublicName(data),
          streak,
          won: true,
          notPlayed: false,
        });
      });
      return raw;
    }

    const today = getTodayKey();
    const snap = await db.collection('dailyResults').where('date', '==', today).limit(100).get();
    const raw = [];

    snap.forEach((doc) => {
      const data = doc.data();
      const uid = data.uid || doc.id.slice(today.length + 1);
      const result = extractGameResult(data, gameType);
      if (!result || !result.won) return;

      const nestedName = gameType === 'wordle'
        ? (data.wordle?.publicName || data.publicName)
        : (data.match?.publicName || data.publicName);

      raw.push({
        uid,
        displayName: nestedName || null,
        won: true,
        guessCount: result.guessCount,
        elapsedMs: result.elapsedMs ?? null,
        notPlayed: false,
      });
    });

    const missing = raw.filter((entry) => !entry.displayName).map((entry) => entry.uid);
    const nameMap = missing.length ? await fetchUserNamesMap(missing) : {};

    return raw.map((entry) => ({
      ...entry,
      displayName: entry.displayName || nameMap[entry.uid] || DEFAULT_NICKNAME,
    }));
  }

  function renderLeaderboardList(listEl, entries, { friendsMode, gameType }) {
    if (!listEl) return;

    const isStreak = gameType === 'streak';
    const rankedEntries = isStreak
      ? entries.filter((entry) => entry.streak > 0)
      : entries.filter((entry) => entry.won && !entry.notPlayed);

    if (!rankedEntries.length) {
      listEl.innerHTML = '<li class="leaderboard-empty">' + escapeHtml(
        friendsMode
          ? (isStreak
            ? (leaderboardT('emptyFriendsStreak') || '아직 기록이 있는 친구가 없어요.')
            : (leaderboardT('emptyFriends') || '아직 순위에 올라온 친구가 없어요.'))
          : (isStreak
            ? (leaderboardT('emptyGlobalStreak') || '아직 연속 기록이 없어요. 첫 번째로 도전해 보세요!')
            : (leaderboardT('emptyGlobal') || '아직 오늘 기록이 없어요. 첫 번째로 도전해 보세요!'))
      ) + '</li>';
      return;
    }

    sortLeaderboardEntries(entries, gameType);
    listEl.innerHTML = '';
    let rank = 0;

    entries.forEach((entry) => {
      const isRanked = isStreak
        ? entry.streak > 0
        : (entry.won && !entry.notPlayed);
      if (isRanked) rank += 1;
      const li = document.createElement('li');
      if (currentUser && entry.uid === currentUser.uid) li.classList.add('me');

      const rankSpan = document.createElement('span');
      rankSpan.className = 'leaderboard-rank';
      rankSpan.textContent = isRanked ? String(rank) : '—';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'leaderboard-name';
      const meSuffix = currentUser && entry.uid === currentUser.uid
        ? (' ' + (leaderboardT('me') || '(me)'))
        : '';
      nameSpan.textContent = entry.displayName + meSuffix;

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'leaderboard-score';
      if (!isStreak && Number.isFinite(entry.elapsedMs)) {
        scoreSpan.classList.add('leaderboard-score--time');
      }
      if (entry.notPlayed) scoreSpan.classList.add('pending');
      scoreSpan.textContent = formatLeaderboardScore(entry, gameType);

      li.appendChild(rankSpan);
      li.appendChild(nameSpan);
      li.appendChild(scoreSpan);
      listEl.appendChild(li);
    });
  }

  function updateLeaderboardPageTabs() {
    document.querySelectorAll('[data-leaderboard-tab]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.leaderboardTab === activeLeaderboardGame);
    });
    document.querySelectorAll('[data-leaderboard-scope]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.leaderboardScope === activeLeaderboardScope);
    });
  }

  function updateLeaderboardLoginState() {
    const loginCard = document.getElementById('leaderboard-login-card');
    const listEl = document.getElementById('leaderboard-list');
    if (!loginCard) return;
    const loggedIn = !!currentUser;
    loginCard.hidden = loggedIn;
    if (!loggedIn && listEl) {
      listEl.innerHTML = '<li class="leaderboard-empty">' + escapeHtml(
        leaderboardT('loginToView') || '순위를 보려면 로그인해 주세요.'
      ) + '</li>';
    }
  }

  async function refreshLeaderboardPage() {
    if (!leaderboardPageRoot) return;

    updateLeaderboardLoginState();
    if (!currentUser || !db) return;

    const listEl = document.getElementById('leaderboard-list');
    const dateEl = document.getElementById('leaderboard-date');
    if (!listEl || !dateEl) return;

    if (activeLeaderboardScope === 'friends' && !userProfile) {
      try {
        userProfile = await ensureUserDoc(currentUser);
      } catch {
        listEl.innerHTML = '<li class="leaderboard-empty">' + escapeHtml(
          leaderboardT('loadError') || '순위를 불러오지 못했어요.'
        ) + '</li>';
        return;
      }
    }

    const today = getTodayKey();
    const isStreak = activeLeaderboardGame === 'streak';
    const gameLabel = isStreak
      ? (leaderboardT('wordChainStreak') || 'Word Chain Streak')
      : (leaderboardT('dailyMatch') || socialT('social.dailyMatch') || 'Daily Match');
    const scopeLabel = activeLeaderboardScope === 'friends'
      ? (leaderboardT('friends') || 'Friends')
      : (leaderboardT('global') || 'Global');
    dateEl.textContent = isStreak
      ? scopeLabel + ' · ' + gameLabel + ' · ' + (leaderboardT('allTime') || 'All-time best')
      : scopeLabel + ' · ' + gameLabel + ' · Day ' + getDayNumber() + ' · ' + today;
    listEl.innerHTML = '<li class="leaderboard-empty">' + escapeHtml(
      socialT('social.loading') || '불러오는 중…'
    ) + '</li>';

    try {
      const entries = activeLeaderboardScope === 'friends'
        ? await fetchFriendsLeaderboardEntries(activeLeaderboardGame)
        : await fetchGlobalLeaderboardEntries(activeLeaderboardGame);
      renderLeaderboardList(listEl, entries, {
        friendsMode: activeLeaderboardScope === 'friends',
        gameType: activeLeaderboardGame,
      });
    } catch (err) {
      console.error('[Firebase] leaderboard page failed', err);
      listEl.innerHTML = '<li class="leaderboard-empty">' + escapeHtml(
        leaderboardT('loadError') || '순위를 불러오지 못했어요.'
      ) + '</li>';
    }
  }

  function initLeaderboardPage(opts) {
    leaderboardPageRoot = document.getElementById('leaderboard-page');
    if (!leaderboardPageRoot) return;

    const initialGame = opts?.initialGame === 'streak' ? 'streak' : 'match';
    activeLeaderboardGame = initialGame;
    activeLeaderboardScope = 'global';
    ensureCore();
    updateLeaderboardPageTabs();
    updateLeaderboardPageHeader();
    updateLeaderboardLoginState();

    if (authReady) {
      refreshLeaderboardPage().catch((err) => {
        console.error('[Firebase] leaderboard init failed', err);
      });
    }
  }

  function updateLeaderboardPageHeader() {
    const subEl = leaderboardPageRoot?.querySelector('.leaderboard-page-sub');
    if (!subEl) return;
    const key = activeLeaderboardGame === 'streak' ? 'subtitleStreak' : 'subtitleMatch';
    subEl.setAttribute('data-i18n', 'leaderboard.' + key);
    subEl.textContent = leaderboardT(key) || subEl.textContent;
  }

  function sortLeaderboardEntries(entries, gameType) {
    if (gameType === 'streak') {
      return entries.sort((a, b) => {
        const aStreak = a.streak || 0;
        const bStreak = b.streak || 0;
        if (aStreak > 0 && bStreak <= 0) return -1;
        if (aStreak <= 0 && bStreak > 0) return 1;
        if (aStreak !== bStreak) return bStreak - aStreak;
        return a.displayName.localeCompare(b.displayName, 'ko');
      });
    }
    return entries.sort((a, b) => {
      if (a.notPlayed && !b.notPlayed) return 1;
      if (!a.notPlayed && b.notPlayed) return -1;
      if (a.notPlayed && b.notPlayed) return a.displayName.localeCompare(b.displayName, 'ko');
      if (a.won && !b.won) return -1;
      if (!a.won && b.won) return 1;
      if (a.won && b.won) {
        const aTime = Number.isFinite(a.elapsedMs) ? a.elapsedMs : null;
        const bTime = Number.isFinite(b.elapsedMs) ? b.elapsedMs : null;
        if (aTime != null && bTime != null) return aTime - bTime;
        if (aTime != null && bTime == null) return -1;
        if (aTime == null && bTime != null) return 1;
        return (a.guessCount || 99) - (b.guessCount || 99);
      }
      return a.displayName.localeCompare(b.displayName, 'ko');
    });
  }

  function formatLeaderboardScore(entry, gameType) {
    if (gameType === 'streak') {
      if (entry.notPlayed || !(entry.streak > 0)) {
        return leaderboardT('noStreak') || '—';
      }
      return String(entry.streak);
    }
    if (entry.notPlayed) return socialT('social.notPlayed') || '아직 안 함';
    if (entry.won) {
      if (Number.isFinite(entry.elapsedMs)) return formatElapsed(entry.elapsedMs);
      if (entry.guessCount != null) return entry.guessCount + '/6';
      return socialT('social.completed') || '완료';
    }
    return socialT('social.failed') || '실패';
  }

  function openLeaderboard(game) {
    const nextGame = game === 'streak' ? 'streak' : 'match';
    if (global.location.pathname.endsWith('leaderboard.html')) {
      activeLeaderboardGame = nextGame;
      updateLeaderboardPageTabs();
      updateLeaderboardPageHeader();
      refreshLeaderboardPage().catch((err) => {
        console.error('[Firebase] leaderboard refresh failed', err);
      });
      return;
    }
    global.location.href = 'leaderboard.html?game=' + encodeURIComponent(nextGame);
  }

  function closeLeaderboard() {
    /* overlay removed — leaderboard lives on leaderboard.html */
  }

  function maybePanelClose() {
    const ids = ['overlay', 'length-overlay'];
    if (!ids.some((id) => document.getElementById(id)?.classList.contains('show'))) {
      document.body.classList.remove('overlay-open');
    }
  }

  async function onDailyGameEnd(won) {
    const state = gameHooks.getState?.();
    if (!state || state.gameMode !== 'daily' || !currentUser || !db) return;
    const today = getTodayKey();
    const docId = today + '_' + currentUser.uid;
    const elapsedMs = gameHooks.getDailyElapsedMs?.() ?? state.elapsedMs ?? null;
    const publicName = getPublicName(userProfile);
    try {
      await db.collection('dailyResults').doc(docId).set({
        uid: currentUser.uid,
        date: today,
        wordle: {
          won,
          guessCount: won ? state.guesses.length : null,
          elapsedMs: won ? elapsedMs : null,
          wordLength: state.wordLength,
          guessGrid: gameHooks.buildGuessGrid?.() || [],
          publicName: won ? publicName : null,
        },
      }, { merge: true });
    } catch (err) {
      console.error('[Firebase] daily result save failed', err);
    }
  }

  async function onDailyMatchEnd(won, elapsedMs, guessCount) {
    if (!won || !currentUser || !db) return;
    if (!userProfile) {
      try {
        userProfile = await ensureUserDoc(currentUser);
      } catch {
        userProfile = null;
      }
    }
    const today = getTodayKey();
    const docId = today + '_' + currentUser.uid;
    const publicName = getPublicName(userProfile);
    try {
      await db.collection('dailyResults').doc(docId).set({
        uid: currentUser.uid,
        date: today,
        match: {
          won: true,
          elapsedMs: elapsedMs ?? null,
          guessCount: guessCount ?? null,
          publicName,
        },
      }, { merge: true });
    } catch (err) {
      console.error('[Firebase] daily match result save failed', err);
    }
  }

  function whenAuthReady() {
    return new Promise((resolve) => {
      if (authReady) {
        resolve(currentUser);
        return;
      }
      authReadyWaiters.push(resolve);
      ensureCore();
    });
  }

  function getDb() {
    ensureCore();
    return db;
  }

  function getRtdb() {
    ensureCore();
    return rtdb;
  }

  function hasRtdb() {
    ensureCore();
    return !!rtdb;
  }

  function getCurrentUid() {
    return currentUser?.uid || null;
  }

  function getUserProfile() {
    return userProfile;
  }

  function disableChallengeButtons() {
    document.querySelectorAll('[data-social-action="challenge-friend"]').forEach((btn) => {
      btn.disabled = true;
    });
  }

  function ensureMultiplayerOverlay() {
    let overlay = document.getElementById('multiplayer-overlay');
    if (overlay && !overlay.querySelector('[data-bot-game-block="jamodle"]')) {
      overlay.remove();
      overlay = null;
    }
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'multiplayer-overlay';
    overlay.className = 'multiplayer-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="multiplayer-modal">
        <div class="multiplayer-modal-header">
          <h2 class="multiplayer-modal-title" data-i18n="multiplayer.title">Jamo Game Battle</h2>
          <button type="button" class="multiplayer-close-btn" data-social-action="multiplayer-close"
            data-i18n-aria="common.close" aria-label="Close">✕</button>
        </div>
        <p class="multiplayer-modal-sub" data-i18n="multiplayer.subtitle">Pick a friend to play.</p>
        <div class="multiplayer-login-panel hidden" data-multiplayer-login-panel>
          <p class="multiplayer-login-hint">${escapeHtml(socialT('social.loginHint'))}</p>
          <button type="button" class="profile-login-btn" data-social-action="login">${escapeHtml(socialT('social.login'))}</button>
        </div>
        <div class="multiplayer-sections hidden" data-multiplayer-sections>
          <section class="multiplayer-section">
            <h3 class="multiplayer-section-title" data-i18n="multiplayer.pickUserTitle">Pick a user to verse!</h3>
            <p class="multiplayer-section-desc" data-i18n="multiplayer.pickUserDesc">User first, then mode and letters.</p>
            <ul class="multiplayer-friends-list profile-friends-list" data-multiplayer-friends></ul>
          </section>
        </div>
        <p class="multiplayer-add-hint" data-multiplayer-add-hint data-i18n="multiplayer.addFriendsHint"></p>
        <section class="multiplayer-section multiplayer-bot-section hidden" data-multiplayer-bot-section data-selected-speed="medium">
          <h3 class="multiplayer-section-title">🤖 Bot fight (dev)</h3>
          <div class="multiplayer-bot-row">
            <label class="multiplayer-bot-label" for="bot-winrate-slider">
              Bot win rate: <strong data-bot-winrate-value>50</strong>%
            </label>
            <input type="range" id="bot-winrate-slider" min="0" max="100" step="5" value="50" data-bot-winrate>
          </div>
          <div class="multiplayer-bot-row" data-bot-game-block="shared">
            <span class="multiplayer-bot-label">Bot speed</span>
            <div class="multiplayer-bot-speed" data-bot-speed-group role="group" aria-label="Bot speed">
              <button type="button" class="multiplayer-bot-speed-btn" data-bot-speed="slow">Slow</button>
              <button type="button" class="multiplayer-bot-speed-btn is-active" data-bot-speed="medium">Medium</button>
              <button type="button" class="multiplayer-bot-speed-btn" data-bot-speed="fast">Fast</button>
            </div>
          </div>
          <div data-bot-game-block="word-chain">
            ${botChainSelectHtml()}
            <button type="button" class="race-opt race-opt--purple" data-social-action="bot-fight-related-words">Word Chain vs Bot</button>
          </div>
          <div data-bot-game-block="jamodle">
            ${botJamoLengthSelectHtml()}
            <button type="button" class="race-opt race-opt--mint" data-social-action="bot-fight-jamo">Jamo Game vs Bot</button>
          </div>
        </section>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeMultiplayerPicker();
    });
    overlay.querySelector('[data-bot-winrate]')?.addEventListener('input', (e) => {
      const label = overlay.querySelector('[data-bot-winrate-value]');
      if (label) label.textContent = String(e.target.value);
    });
    overlay.querySelector('[data-bot-speed-group]')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bot-speed]');
      if (!btn || !btn.closest('[data-bot-speed-group]')) return;
      overlay.querySelectorAll('[data-bot-speed-group] [data-bot-speed]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      const section = overlay.querySelector('[data-multiplayer-bot-section]');
      if (section) section.dataset.selectedSpeed = btn.dataset.botSpeed;
    });
    return overlay;
  }

  async function refreshMultiplayerOverlay() {
    const overlay = document.getElementById('multiplayer-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;

    const loginPanel = overlay.querySelector('[data-multiplayer-login-panel]');
    const sections = overlay.querySelector('[data-multiplayer-sections]');
    const friendsList = overlay.querySelector('[data-multiplayer-friends]');
    const addHint = overlay.querySelector('[data-multiplayer-add-hint]');
    const botSection = overlay.querySelector('[data-multiplayer-bot-section]');
    const loggedIn = !!currentUser;
    const customDevBot = isCustomBattleDevBotFlow();

    loginPanel?.classList.toggle('hidden', loggedIn || customDevBot);
    sections?.classList.toggle('hidden', !loggedIn && !customDevBot);
    addHint?.classList.toggle('hidden', !loggedIn || customDevBot);
    updateBotSectionForFlow(botSection);

    if (!loggedIn && !customDevBot) return;
    if (customDevBot || loggedIn) {
      await populateFriendsList(friendsList, 'menu-user');
    }
  }

  async function openMultiplayerPicker() {
    if (!ensureCore()) return;
    await whenAuthReady();
    const overlay = ensureMultiplayerOverlay();
    const sub = overlay.querySelector('.multiplayer-modal-sub');
    if (sub) {
      sub.textContent = pendingChallengeFlow === 'menu-battle-custom'
        ? (global.I18n?.t('menu.battle.pickFriend') || socialT('social.challengeChooseUser') || 'Pick a friend to play.')
        : (global.I18n?.t('multiplayer.subtitle') || 'Pick a friend to play.');
    }
    overlay.classList.remove('hidden');
    document.body.classList.add('multiplayer-open');
    global.I18n?.applyToDocument?.(overlay);
    await refreshMultiplayerOverlay();
  }

  function closeMultiplayerPicker() {
    document.getElementById('multiplayer-overlay')?.classList.add('hidden');
    document.body.classList.remove('multiplayer-open');
    if (pendingChallengeFlow === 'menu-battle-custom' && !pendingChallengeFriendUid) {
      pendingChallengeFlow = 'legacy';
    }
  }

  function wordChainPickButtonsHtml() {
    const chains = global.RelatedWordsChains?.getAllChains?.() || [];
    const colors = ['purple', 'yellow', 'peach', 'blue', 'mint', 'peach'];
    const labelFn = global.RelatedWordsChains?.chainLabel;
    const randomLabel = global.I18n?.t('social.challengePickWordChainRandom')
      || global.I18n?.t('social.challengePickWordChain')
      || 'Random chain';
    const randomBtn = `<button type="button" class="race-opt race-opt--purple" data-social-action="challenge-word-chain-pick" data-chain-id="">${escapeHtml(randomLabel)}</button>`;
    if (chains.length > 24) {
      return randomBtn;
    }
    return randomBtn + chains.map((chain, i) => {
      const label = labelFn ? labelFn(chain) : (global.I18n?.t(chain.titleKey) || chain.id);
      return `<button type="button" class="race-opt race-opt--${colors[i % colors.length]}" data-social-action="challenge-word-chain-pick" data-chain-id="${escapeHtml(chain.id)}">${escapeHtml(label)}</button>`;
    }).join('');
  }

  function botChainSelectHtml() {
    const chains = global.RelatedWordsChains?.getAllChains?.() || [];
    if (!chains.length) return '';
    const labelFn = global.RelatedWordsChains?.chainLabel;
    const options = chains.map((chain) => {
      const label = labelFn ? labelFn(chain) : (global.I18n?.t(chain.titleKey) || chain.id);
      return `<option value="${escapeHtml(chain.id)}">${escapeHtml(label)}</option>`;
    }).join('');
    return `
      <div class="multiplayer-bot-row">
        <label class="multiplayer-bot-label" for="bot-chain-select">Word chain</label>
        <select id="bot-chain-select" class="multiplayer-bot-chain" data-bot-chain>${options}</select>
      </div>`;
  }

  function botJamoLengthSelectHtml() {
    const lengths = global.MatchWords?.LETTER_LENGTHS || [1, 2, 3, 4, 5, 6];
    const options = lengths.map((n) => {
      const label = global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
      const selected = n === 4 ? ' selected' : '';
      return `<option value="${n}"${selected}>${escapeHtml(label)}</option>`;
    }).join('');
    return `
      <div class="multiplayer-bot-row">
        <label class="multiplayer-bot-label" for="bot-jamo-length-select">Jamo word length</label>
        <select id="bot-jamo-length-select" class="multiplayer-bot-chain" data-bot-jamo-length>${options}</select>
      </div>`;
  }

  function koreanLetterLengthButtonsHtml() {
    const colors = ['mint', 'yellow', 'blue', 'pink', 'purple', 'peach'];
    const lengths = global.MatchWords?.LETTER_LENGTHS || [1, 2, 3, 4, 5, 6];
    return lengths.map((n, i) => {
      const label = global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
      return `<button type="button" class="race-opt race-opt--${colors[i % colors.length]}" data-social-action="challenge-korean-length" data-word-length="${n}" aria-label="${escapeHtml(label)}">${n}</button>`;
    }).join('');
  }

  function challengeActionsHtml() {
    return `
      <div class="race-length-actions">
        <button type="button" class="race-btn race-btn--ghost" id="challenge-back-btn" data-social-action="challenge-back">${escapeHtml(commonT('back'))}</button>
        <button type="button" class="race-btn race-btn--ghost" id="challenge-cancel-btn" data-social-action="challenge-cancel">${escapeHtml(commonT('cancel'))}</button>
      </div>`;
  }

  function ensureChallengeOverlay() {
    let overlay = document.getElementById('race-length-overlay');
    if (overlay && (
      !overlay.querySelector('[data-social-action="challenge-korean-length"]')
      || !overlay.querySelector('#challenge-step-battle-game')
      || !overlay.querySelector('#challenge-step-word-chain')
      || overlay.querySelector('#challenge-step-menu-mode')
      || overlay.querySelector('#challenge-step-jamodle-playmode')
      || !overlay.querySelector('.race-length-actions')
      || !overlay.querySelector('.race-length-options--grid-3')
      || overlay.querySelector('#challenge-step-korean-length [data-social-action="challenge-back"]')
    )) {
      overlay.remove();
      overlay = null;
    }
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'race-length-overlay';
    overlay.className = 'race-length-overlay hidden';
    overlay.innerHTML = `
      <div class="race-length-card">
        <h3 id="race-length-title"></h3>
        <p id="race-length-sub"></p>
        <div id="challenge-step-battle-game" class="challenge-step hidden">
          <div class="race-length-options race-length-options--stack">
            <button type="button" class="race-opt race-opt--peach" data-social-action="challenge-mode-jamodle">${escapeHtml(socialT('social.challengeBattleJamodle'))}</button>
            <button type="button" class="race-opt race-opt--purple" data-social-action="challenge-related-words-race">${escapeHtml(socialT('social.challengeBattleRelatedWords'))}</button>
          </div>
        </div>
        <div id="challenge-step-game" class="challenge-step">
          <div class="race-length-options race-length-options--stack">
            <button type="button" class="race-opt race-opt--blue" data-social-action="challenge-game-wordle">${escapeHtml(socialT('social.challengeGameWordle'))}</button>
            <button type="button" class="race-opt race-opt--peach" data-social-action="challenge-game-match">${escapeHtml(socialT('social.challengeGameMatch'))}</button>
            <button type="button" class="race-opt race-opt--purple" data-social-action="challenge-related-words-race">${escapeHtml(socialT('social.challengeGameRelatedWords'))}</button>
          </div>
        </div>
        <div id="challenge-step-word-chain" class="challenge-step hidden">
          <div class="race-length-options race-length-options--grid race-length-options--word-chain">
            ${wordChainPickButtonsHtml()}
          </div>
        </div>
        <div id="challenge-step-wordle" class="challenge-step hidden">
          <div class="race-length-options">
            <button type="button" class="race-opt race-opt--mint" data-social-action="challenge-length" data-word-length="2">${escapeHtml(global.I18n?.t('wordle.twoLetters') || '2 letters')}</button>
            <button type="button" class="race-opt race-opt--yellow" data-social-action="challenge-length" data-word-length="3">${escapeHtml(global.I18n?.t('wordle.threeLetters') || '3 letters')}</button>
          </div>
        </div>
        <div id="challenge-step-korean-length" class="challenge-step hidden">
          <div class="race-length-options race-length-options--grid-3">
            ${koreanLetterLengthButtonsHtml()}
          </div>
        </div>
        ${challengeActionsHtml()}
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showChallengeStep(step) {
    const overlay = ensureChallengeOverlay();
    overlay.querySelectorAll('.challenge-step').forEach((el) => el.classList.add('hidden'));
    const panel = overlay.querySelector(`#challenge-step-${step}`);
    if (panel) panel.classList.remove('hidden');
    const backBtn = overlay.querySelector('#challenge-back-btn');
    const cancelBtn = overlay.querySelector('#challenge-cancel-btn');
    if (backBtn) backBtn.classList.toggle('hidden', step === 'game');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
  }

  function showChallengeBattleGameStep() {
    const overlay = ensureChallengeOverlay();
    const title = overlay.querySelector('#race-length-title');
    const sub = overlay.querySelector('#race-length-sub');
    if (title) title.textContent = socialT('social.challengeTitle', { name: pendingChallengeFriendName || socialT('social.friend') });
    if (sub) sub.textContent = socialT('social.challengePickBattleGame');
    showChallengeStep('battle-game');
  }

  function showWordChainPickStep() {
    const overlay = ensureChallengeOverlay();
    const visible = ['battle-game', 'game'].find(
      (step) => !overlay.querySelector(`#challenge-step-${step}`)?.classList.contains('hidden')
    );
    pendingWordChainBackStep = visible || 'game';
    const title = overlay.querySelector('#race-length-title');
    const sub = overlay.querySelector('#race-length-sub');
    if (title) title.textContent = socialT('social.challengeTitle', { name: pendingChallengeFriendName || socialT('social.friend') });
    if (sub) sub.textContent = socialT('social.challengePickWordChain');
    const grid = overlay.querySelector('#challenge-step-word-chain .race-length-options--word-chain');
    if (grid) grid.innerHTML = wordChainPickButtonsHtml();
    showChallengeStep('word-chain');
  }

  function showChallengeGameStep() {
    const overlay = ensureChallengeOverlay();
    const title = overlay.querySelector('#race-length-title');
    const sub = overlay.querySelector('#race-length-sub');
    if (title) title.textContent = socialT('social.challengeTitle', { name: pendingChallengeFriendName || socialT('social.friend') });
    if (sub) sub.textContent = socialT('social.challengePickGame');
    showChallengeStep('game');
  }

  function showChallengeWordleStep() {
    const overlay = ensureChallengeOverlay();
    const sub = overlay.querySelector('#race-length-sub');
    if (sub) sub.textContent = socialT('social.challengePickLength');
    showChallengeStep('wordle');
  }

  function showChallengeMatchStep() {
    const overlay = ensureChallengeOverlay();
    const title = overlay.querySelector('#race-length-title');
    const sub = overlay.querySelector('#race-length-sub');
    if (title && (pendingChallengeFlow === 'menu-user-first' || pendingChallengeFlow === 'menu-battle-custom')) {
      title.textContent = socialT('social.challengeTitle', { name: pendingChallengeFriendName || socialT('social.friend') });
    }
    if (sub) sub.textContent = socialT('social.challengePickLength');
    showChallengeStep('korean-length');
  }

  function showChallengeTurnMatchStep() {
    const overlay = ensureChallengeOverlay();
    const title = overlay.querySelector('#race-length-title');
    const sub = overlay.querySelector('#race-length-sub');
    if (title) title.textContent = socialT('social.turnChallengeTitle', { name: pendingChallengeFriendName || socialT('social.friend') });
    if (sub) sub.textContent = socialT('social.challengePickLength');
    showChallengeStep('korean-length');
  }

  function openTurnChallengePicker(friendUid, friendName) {
    if (!currentUser) {
      requireAuthMessage();
      return;
    }
    if (!friendUid) return;
    closeMultiplayerPicker();
    pendingChallengeFriendUid = friendUid;
    pendingChallengeFriendName = friendName || '';
    pendingChallengeIsTurn = true;
    pendingChallengeFlow = 'legacy';
    const overlay = ensureChallengeOverlay();
    overlay.classList.remove('hidden');
    openChallengeOverlay();
    showChallengeTurnMatchStep();
  }

  function openChallengeGamePicker(friendUid, friendName) {
    if (!currentUser) {
      requireAuthMessage();
      return;
    }
    if (!friendUid) return;
    closeMultiplayerPicker();
    pendingChallengeFriendUid = friendUid;
    pendingChallengeFriendName = friendName || '';
    pendingChallengeIsTurn = false;
    pendingChallengeFlow = 'legacy';
    const overlay = ensureChallengeOverlay();
    overlay.classList.remove('hidden');
    openChallengeOverlay();
    showChallengeGameStep();
  }

  function setMenuBattleGame(game) {
    pendingMenuBattleGame = game === 'word-chain' ? 'word-chain' : 'jamodle';
  }

  function openBattleCustomPicker(game) {
    if (!ensureCore()) return;
    setMenuBattleGame(game);
    pendingChallengeFlow = 'menu-battle-custom';
    openMultiplayerPicker();
  }

  function openBattleCustomFriendFlow(friendUid, friendName) {
    if (!currentUser) {
      requireAuthMessage();
      return;
    }
    if (!friendUid) return;
    closeMultiplayerPicker();
    pendingChallengeFriendUid = friendUid;
    pendingChallengeFriendName = friendName || '';
    pendingChallengeIsTurn = true;

    if (pendingMenuBattleGame === 'word-chain') {
      startRelatedWordsRaceChallenge(friendUid);
      return;
    }

    pendingChallengeFlow = 'menu-battle-custom';
    const overlay = ensureChallengeOverlay();
    overlay.classList.remove('hidden');
    openChallengeOverlay();
    showChallengeTurnMatchStep();
  }

  function openChallengeMenuFlow(friendUid, friendName) {
    if (!currentUser) {
      requireAuthMessage();
      return;
    }
    if (!friendUid) return;
    closeMultiplayerPicker();
    pendingChallengeFriendUid = friendUid;
    pendingChallengeFriendName = friendName || '';
    pendingChallengeIsTurn = false;
    pendingChallengeFlow = 'menu-user-first';
    const overlay = ensureChallengeOverlay();
    overlay.classList.remove('hidden');
    openChallengeOverlay();
    showChallengeBattleGameStep();
  }

  function openChallengeOverlay() {
    document.body.classList.add('challenge-open');
  }

  function closeChallengeLengthPicker() {
    pendingChallengeFriendUid = null;
    pendingChallengeFriendName = '';
    pendingChallengeIsTurn = false;
    pendingChallengeFlow = 'legacy';
    document.getElementById('race-length-overlay')?.classList.add('hidden');
    document.body.classList.remove('challenge-open');
  }

  async function startTurnChallenge(friendUid, wordLength) {
    closeChallengeLengthPicker();
    if (!friendUid || !global.RaceService) {
      alert(socialT('social.challengeLoadFailed'));
      return;
    }
    disableChallengeButtons();
    try {
      await refreshUserProfile();
      const matchId = await global.RaceService.createMatch(friendUid, {
        gameType: global.RaceService.GAME_TYPES.koreanMatch,
        wordLength: global.MatchWords?.normalizeWordLength?.(wordLength) || 4,
        playMode: global.RaceService.PLAY_MODES.turn,
      });
      global.location.href = global.RaceService.getMatchPageUrl(matchId, {
        gameType: 'korean-match',
        playMode: 'turn',
      });
    } catch (err) {
      console.error('[Firebase] turn challenge failed', err);
      const msg = err?.code === 'permission-denied'
        ? socialT('social.challengeRulesFailed')
        : socialT('social.challengeSendFailed');
      alert(msg);
      document.querySelectorAll('[data-social-action="challenge-friend-turn"]').forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  async function startWordleChallenge(friendUid, wordLength) {
    closeChallengeLengthPicker();
    if (!friendUid || !global.RaceService) {
      alert(socialT('social.challengeLoadFailed'));
      return;
    }
    const buttons = profileSocialRoot?.querySelectorAll('[data-social-action="challenge-friend"]');
    buttons?.forEach((btn) => { btn.disabled = true; });
    disableChallengeButtons();
    try {
      await refreshUserProfile();
      const matchId = await global.RaceService.createMatch(friendUid, {
        gameType: global.RaceService.GAME_TYPES.wordle,
        wordLength,
      });
      global.location.href = global.RaceService.getMatchPageUrl(matchId, { gameType: 'wordle' });
    } catch (err) {
      console.error('[Firebase] challenge failed', err);
      const msg = err?.code === 'permission-denied'
        ? socialT('social.challengeRulesFailed')
        : socialT('social.challengeSendFailed');
      alert(msg);
      buttons?.forEach((btn) => { btn.disabled = false; });
      document.querySelectorAll('[data-social-action="challenge-friend"]').forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  async function startWordChainChallenge(friendUid) {
    closeMultiplayerPicker();
    if (!friendUid || !global.WordChainService) {
      alert(socialT('social.challengeLoadFailed'));
      return;
    }
    const buttons = document.querySelectorAll('[data-social-action="challenge-friend-wordchain"]');
    buttons.forEach((btn) => { btn.disabled = true; });
    try {
      await refreshUserProfile();
      const matchId = await global.WordChainService.createMatch(friendUid);
      global.location.href = global.WordChainService.getMatchPageUrl(matchId);
    } catch (err) {
      console.error('[Firebase] word chain challenge failed', err);
      const msg = err?.code === 'permission-denied'
        ? socialT('social.challengeRulesFailed')
        : socialT('social.challengeSendFailed');
      alert(msg);
      buttons.forEach((btn) => { btn.disabled = false; });
    }
  }

  async function startRelatedWordsRaceChallenge(friendUid, chainId) {
    closeChallengeLengthPicker();
    if (!friendUid || !global.RaceService) {
      alert(socialT('social.challengeLoadFailed'));
      return;
    }
    disableChallengeButtons();
    try {
      await refreshUserProfile();
      const matchOpts = {
        gameType: global.RaceService.GAME_TYPES.relatedWords,
      };
      if (chainId && global.RelatedWordsChains?.getChain?.(chainId)) {
        matchOpts.chainId = chainId;
      }
      const matchId = await global.RaceService.createMatch(friendUid, matchOpts);
      global.location.href = global.RaceService.getMatchPageUrl(matchId, {
        gameType: global.RaceService.GAME_TYPES.relatedWords,
      });
    } catch (err) {
      console.error('[Firebase] related words race challenge failed', err);
      const msg = err?.code === 'permission-denied'
        ? socialT('social.challengeRulesFailed')
        : socialT('social.challengeSendFailed');
      alert(msg);
    }
  }

  async function startMatchChallenge(friendUid, wordLength) {
    closeChallengeLengthPicker();
    if (!friendUid || !global.RaceService) {
      alert(socialT('social.challengeLoadFailed'));
      return;
    }
    const buttons = profileSocialRoot?.querySelectorAll('[data-social-action="challenge-friend"]');
    buttons?.forEach((btn) => { btn.disabled = true; });
    disableChallengeButtons();
    try {
      await refreshUserProfile();
      const matchId = await global.RaceService.createMatch(friendUid, {
        gameType: global.RaceService.GAME_TYPES.koreanMatch,
        wordLength: global.MatchWords?.normalizeWordLength?.(wordLength) || 4,
      });
      global.location.href = global.RaceService.getMatchPageUrl(matchId, { gameType: 'korean-match' });
    } catch (err) {
      console.error('[Firebase] match challenge failed', err);
      const msg = err?.code === 'permission-denied'
        ? socialT('social.challengeRulesFailed')
        : socialT('social.challengeSendFailed');
      alert(msg);
      buttons?.forEach((btn) => { btn.disabled = false; });
      document.querySelectorAll('[data-social-action="challenge-friend"]').forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  function removeChallengeBanner() {
    document.getElementById('race-challenge-overlay')?.remove();
    document.querySelectorAll('.race-challenge-banner').forEach((el) => el.remove());
    document.body.classList.remove('challenge-modal-open');
  }

  function challengeBannerText(match) {
    const name = match.player1Name || socialT('social.friend');
    if (match._challengeKind === 'wordchain') {
      return socialT('social.challengeBannerWordChain', { name });
    }
    if (global.RaceService?.isTurnBased?.(match)) {
      const n = global.RaceService.getMatchWordLength?.(match) ?? 4;
      const mode = global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
      return socialT('social.challengeBannerTurn', { name, mode });
    }
    if (global.RaceService?.isRelatedWords?.(match)) {
      return socialT('social.challengeBannerRelatedWords', { name });
    }
    if (global.RaceService?.isKoreanMatch?.(match)) {
      const n = global.RaceService.getMatchWordLength?.(match) ?? 4;
      const mode = global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
      return socialT('social.challengeBannerMatch', { name, mode });
    }
    return socialT('social.challengeBannerWordle', {
      name,
      n: match.wordLength || 3,
    });
  }

  function showChallengeBanner(match) {
    if (!match?.id || shownChallengeIds.has(match.id)) return;
    shownChallengeIds.add(match.id);
    removeChallengeBanner();

    const challengeKind = match._challengeKind || 'race';
    const overlay = document.createElement('div');
    overlay.id = 'race-challenge-overlay';
    overlay.className = 'race-challenge-overlay';
    overlay.innerHTML = `
      <div class="race-challenge-modal" role="dialog" aria-modal="true" aria-labelledby="race-challenge-title">
        <p id="race-challenge-title" class="race-challenge-modal-text">${escapeHtml(challengeBannerText(match))}</p>
        <div class="race-challenge-modal-actions">
          <button type="button" class="race-challenge-btn race-challenge-btn--accept" data-social-action="challenge-accept"
            data-match-id="${escapeHtml(match.id)}"
            data-game-type="${escapeHtml(match.gameType || (challengeKind === 'wordchain' ? 'wordchain' : 'wordle'))}"
            data-play-mode="${escapeHtml(match.playMode || 'race')}"
            data-challenge-kind="${escapeHtml(challengeKind)}">${escapeHtml(commonT('accept'))}</button>
          <button type="button" class="race-challenge-btn race-challenge-btn--decline" data-social-action="challenge-decline"
            data-match-id="${escapeHtml(match.id)}"
            data-challenge-kind="${escapeHtml(challengeKind)}">${escapeHtml(commonT('decline'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add('challenge-modal-open');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { /* keep open until explicit choice */ }
    });
  }

  async function acceptIncomingChallenge(matchId, gameType, playMode, challengeKind) {
    if (!matchId) return;
    try {
      if (challengeKind === 'wordchain') {
        if (!global.WordChainService) return;
        await global.WordChainService.acceptMatch(matchId);
        removeChallengeBanner();
        global.location.href = global.WordChainService.getMatchPageUrl(matchId);
        return;
      }
      if (!global.RaceService) return;
      await global.RaceService.acceptMatch(matchId);
      removeChallengeBanner();
      const gt = gameType || 'wordle';
      global.location.href = global.RaceService.getMatchPageUrl(matchId, {
        gameType: gt,
        playMode: playMode || 'race',
      });
    } catch (err) {
      console.error('[Firebase] accept challenge failed', err);
      alert(socialT('social.acceptChallengeFailed'));
    }
  }

  async function declineIncomingChallenge(matchId, challengeKind) {
    if (!matchId) return;
    try {
      if (challengeKind === 'wordchain') {
        await global.WordChainService?.declineMatch?.(matchId);
      } else {
        await global.RaceService?.declineMatch?.(matchId);
      }
      shownChallengeIds.delete(matchId);
      document.getElementById('race-challenge-overlay')?.remove();
      document.body.classList.remove('challenge-modal-open');
    } catch (err) {
      console.error('[Firebase] decline challenge failed', err);
    }
  }

  function startIncomingChallengeListener() {
    stopIncomingChallengeListener();
    const unsubs = [];
    if (global.RaceService?.subscribeIncomingChallenges) {
      unsubs.push(global.RaceService.subscribeIncomingChallenges((match) => {
        showChallengeBanner({ ...match, _challengeKind: 'race' });
      }));
    }
    if (global.WordChainService?.subscribeIncomingChallenges) {
      unsubs.push(global.WordChainService.subscribeIncomingChallenges((match) => {
        showChallengeBanner({ ...match, _challengeKind: 'wordchain' });
      }));
    }
    if (!unsubs.length) return;
    incomingChallengeUnsub = () => unsubs.forEach((fn) => fn());
  }

  function stopIncomingChallengeListener() {
    if (incomingChallengeUnsub) {
      incomingChallengeUnsub();
      incomingChallengeUnsub = null;
    }
  }

  function init(hookFns) {
    if (!ensureCore()) return;
    gameHooks = hookFns || {};
  }

  function initProfile(rootId) {
    profileSocialRoot = document.getElementById(rootId);
    if (!profileSocialRoot) return;
    if (!profileSocialRoot.querySelector('[data-social-action="login"]')) {
      showLoggedOutUI();
    }
    ensureCore();
    updateProfileAuthChrome(!!currentUser);
    renderProfileSocial();
  }

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
  global.document?.addEventListener('visibilitychange', syncIdleListenerVisibility);
  global.addEventListener('pagehide', pauseIdleFirestoreListeners);

  global.I18n?.onChange?.(() => {
    if (profileSocialRoot) {
      renderProfileSocial();
    }
    if (leaderboardPageRoot) {
      updateLeaderboardPageHeader();
      global.I18n?.applyToDocument?.(leaderboardPageRoot);
    }
    const challengeOverlay = document.getElementById('race-length-overlay');
    if (challengeOverlay && !challengeOverlay.classList.contains('hidden') && pendingChallengeFriendUid) {
      const friendBtn = profileSocialRoot?.querySelector(
        `[data-social-action="challenge-friend"][data-friend-uid="${pendingChallengeFriendUid}"]`
      );
      if (pendingChallengeFlow === 'menu-user-first') {
        openChallengeMenuFlow(pendingChallengeFriendUid, friendBtn?.dataset.friendName || pendingChallengeFriendName);
      } else {
        openChallengeGamePicker(pendingChallengeFriendUid, friendBtn?.dataset.friendName || pendingChallengeFriendName);
      }
    }
  });

  global.FirebaseSocial = {
    init,
    initProfile,
    onDailyGameEnd,
    onDailyMatchEnd,
    initLeaderboardPage,
    openLeaderboard,
    getPublicName,
    getDb,
    getRtdb,
    hasRtdb,
    getCurrentUid,
    getUserProfile,
    syncWordChainBestStreak,
    syncLocalWordChainBestStreak: pushLocalWordChainBestStreak,
    syncPublicProfile,
    syncLocalPublicProfile: pushLocalPublicProfile,
    whenAuthReady,
    getCurrentNickname() {
      return currentUser ? getPublicName(userProfile) : null;
    },
    setNickname,
    closePanels() {
      closeLeaderboard();
      closeMultiplayerPicker();
    },
    openMultiplayerPicker,
    closeMultiplayerPicker,
    setMenuBattleGame,
    openBattleCustomPicker,
  };
})(typeof window !== 'undefined' ? window : globalThis);
