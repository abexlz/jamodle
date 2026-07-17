/**
 * 1v1 match emotes — picker UI + Firestore sync (matches/{matchId}.emotes.{uid}).
 */
(function (global) {
  'use strict';

  const EMOTE_DURATION_MS = 2000;
  const SEND_COOLDOWN_MS = 800;

  const EMOTES = [
    { id: 'happy', src: 'assets/emotes/emote-happy.png', labelKey: 'matchEmotes.happy' },
    { id: 'angry', src: 'assets/emotes/emote-angry.png', labelKey: 'matchEmotes.angry' },
    { id: 'sad', src: 'assets/emotes/emote-sad.png', labelKey: 'matchEmotes.sad' },
    { id: 'yawn', src: 'assets/emotes/emote-yawn.png', labelKey: 'matchEmotes.yawn' },
  ];

  const emoteSubscriptions = new Map();

  function t(key, vars) {
    return global.I18n?.t(key, vars) ?? '';
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function isEmoteSyncEnabled() {
    return !!global.FirebaseSocial?.getDb?.();
  }

  function matchDocRef(matchId) {
    const db = global.FirebaseSocial?.getDb?.();
    if (!db || !matchId) return null;
    return db.collection('matches').doc(matchId);
  }

  async function writeEmote(matchId, myUid, emoteId) {
    const ref = matchDocRef(matchId);
    if (!ref) return false;
    const payload = { emoteId, at: Date.now(), byUid: myUid };
    await ref.update({ [`emotes.${myUid}`]: payload });
    return true;
  }

  function subscribeOpponentEmotes(matchId, oppUid, onEmote) {
    const key = `${matchId}:${oppUid}`;
    unsubscribeOpponentEmotes(matchId, oppUid);
    const ref = matchDocRef(matchId);
    if (!ref) return () => {};
    let lastAt = 0;
    const unsub = ref.onSnapshot(
      (snap) => {
        const val = snap.data()?.emotes?.[oppUid];
        if (!val?.emoteId || !val?.at || val.at <= lastAt) return;
        lastAt = val.at;
        onEmote(val.emoteId, val);
      },
      (err) => console.warn('[MatchEmotes] subscribe', err)
    );
    emoteSubscriptions.set(key, { unsub });
    return () => unsubscribeOpponentEmotes(matchId, oppUid);
  }

  function unsubscribeOpponentEmotes(matchId, oppUid) {
    const key = `${matchId}:${oppUid}`;
    const sub = emoteSubscriptions.get(key);
    if (!sub) return;
    sub.unsub?.();
    emoteSubscriptions.delete(key);
  }

  function unsubscribeAllEmotes() {
    emoteSubscriptions.forEach((sub) => sub.unsub?.());
    emoteSubscriptions.clear();
  }

  function buildSummaryFromUserData(data) {
    if (!data) return null;
    const levelInfo = global.LevelUtils?.getLevelFromTotalXp?.(data.totalXp || 0) || {
      level: 1,
      xpInLevel: 0,
      xpToNext: 100,
    };
    const avatarId = typeof data.avatarId === 'string' ? data.avatarId : 'default';
    return {
      name: global.FirebaseSocial?.getPublicName?.(data) || t('matchRace.opponent'),
      displayName: global.FirebaseSocial?.getPublicName?.(data) || t('matchRace.opponent'),
      avatarId,
      avatarIcon: global.BadgeService?.getAvatarDef?.(avatarId)?.icon || '🌸',
      frameId: data.frameId === 'platinum' ? 'ruby' : (data.frameId || 'none'),
      level: levelInfo.level,
      xpInLevel: levelInfo.xpInLevel,
      xpToNext: levelInfo.xpToNext,
      totalXp: Math.max(0, parseInt(data.totalXp, 10) || 0),
    };
  }

  function buildLocalPlayerSummary() {
    const summary = global.ProfileService?.getProfileSummary?.();
    if (!summary) return null;
    const meLabel = t('relatedWordsRace.me');
    const name = summary.displayName || meLabel;
    return {
      name,
      displayName: name,
      avatarId: summary.avatarId || 'default',
      avatarIcon: summary.avatarIcon || '🌸',
      frameId: summary.frameId || 'none',
      level: summary.level || 1,
      xpInLevel: summary.xpInLevel || 0,
      xpToNext: summary.xpToNext || 100,
      totalXp: summary.totalXp || 0,
    };
  }

  async function fetchOpponentSummary(uid) {
    try {
      const db = global.FirebaseSocial?.getDb?.();
      if (!db || !uid) return null;
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) return null;
      return buildSummaryFromUserData(snap.data());
    } catch (err) {
      console.warn('[MatchEmotes] fetchOpponentSummary', err);
      return null;
    }
  }

  function renderOpponentBattleCard(cardEl, summary) {
    if (!cardEl || !summary) return;
    global.ProfileUI?.ensureStyles?.();
    if (global.ProfileUI?.renderBadgeCard) {
      cardEl.innerHTML = `
        <div class="race-opp-profile-card menu-profile-card">
          ${global.ProfileUI.renderBadgeCard(summary, { variant: 'menu' })}
        </div>
      `;
      return;
    }
    const icon = summary.avatarIcon || '👤';
    const level = summary.level || 1;
    cardEl.innerHTML = `
      <div class="race-opp-battle-card-inner">
        <span class="race-opp-battle-avatar" aria-hidden="true">${icon}</span>
        <span class="race-opp-battle-level">Lv.${level}</span>
      </div>
    `;
  }

  class MatchEmotesController {
    constructor(options) {
      this.matchId = options.matchId;
      this.myUid = options.myUid;
      this.oppUid = options.oppUid;
      this.mountEl = options.mountEl;
      this.displayEl = options.displayEl;
      this.selfDisplayEl = options.selfDisplayEl;
      this._unsub = null;
      this._hideTimer = null;
      this._selfHideTimer = null;
      this._open = false;
      this._destroyed = false;
      this._lastSentAt = 0;
      this._docClick = () => this.closePicker();
    }

    mount() {
      if (!this.mountEl || this._destroyed) return;
      const btnLabel = t('matchEmotes.open');
      this.mountEl.innerHTML = `
        <div class="match-emote-wrap">
          <button type="button" class="match-emote-btn" aria-label="${escapeAttr(btnLabel)}" aria-expanded="false" aria-haspopup="true">
            <img class="match-emote-btn-icon" src="assets/emotes/emote-btn.png" alt="" draggable="false">
          </button>
          <div class="match-emote-picker hidden" role="menu" aria-hidden="true">
            ${EMOTES.map((emote) => {
              const label = t(emote.labelKey);
              return `
              <button type="button" class="match-emote-option" role="menuitem" data-emote-id="${emote.id}" aria-label="${escapeAttr(label)}">
                <img src="${emote.src}" alt="" draggable="false">
              </button>`;
            }).join('')}
          </div>
        </div>
      `;
      this.btn = this.mountEl.querySelector('.match-emote-btn');
      this.picker = this.mountEl.querySelector('.match-emote-picker');
      this.btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePicker();
      });
      this.picker?.querySelectorAll('.match-emote-option').forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = opt.dataset.emoteId;
          if (id) this.send(id);
        });
      });
      setTimeout(() => document.addEventListener('click', this._docClick), 0);

      if (this.oppUid && isEmoteSyncEnabled()) {
        this._unsub = subscribeOpponentEmotes(this.matchId, this.oppUid, (id) => {
          this.showIncoming(id);
        });
      }
    }

    togglePicker() {
      if (this._open) this.closePicker();
      else this.openPicker();
    }

    openPicker() {
      if (!this.picker || this._destroyed) return;
      this._open = true;
      this.picker.classList.remove('hidden');
      this.picker.setAttribute('aria-hidden', 'false');
      this.btn?.setAttribute('aria-expanded', 'true');
      this.btn?.classList.add('is-open');
    }

    closePicker() {
      if (!this.picker) return;
      const active = document.activeElement;
      if (active && this.picker.contains(active)) active.blur();
      this._open = false;
      this.picker.classList.add('hidden');
      this.picker.setAttribute('aria-hidden', 'true');
      this.btn?.setAttribute('aria-expanded', 'false');
      this.btn?.classList.remove('is-open');
    }

    async send(emoteId) {
      if (!EMOTES.some((e) => e.id === emoteId)) return;
      const now = Date.now();
      if (now - this._lastSentAt < SEND_COOLDOWN_MS) return;
      this._lastSentAt = now;
      this.closePicker();
      this.showSelf(emoteId);
      try {
        if (isEmoteSyncEnabled()) {
          await writeEmote(this.matchId, this.myUid, emoteId);
        }
      } catch (err) {
        console.warn('[MatchEmotes] send', err);
      }
      global.SoundEffects?.tap?.();
    }

    showSelf(emoteId) {
      if (!this.selfDisplayEl || this._destroyed) return;
      const emote = EMOTES.find((e) => e.id === emoteId);
      if (!emote) return;
      if (this._selfHideTimer) clearTimeout(this._selfHideTimer);
      this.selfDisplayEl.innerHTML = `<img class="match-emote-self-img" src="${emote.src}" alt="">`;
      this.selfDisplayEl.classList.add('is-visible');
      this._selfHideTimer = setTimeout(() => {
        if (!this.selfDisplayEl) return;
        this.selfDisplayEl.classList.remove('is-visible');
        this.selfDisplayEl.innerHTML = '';
      }, EMOTE_DURATION_MS);
    }

    showIncoming(emoteId) {
      if (!this.displayEl || this._destroyed) return;
      const emote = EMOTES.find((e) => e.id === emoteId);
      if (!emote) return;
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this.displayEl.innerHTML = `<img class="race-opp-emote-img" src="${emote.src}" alt="">`;
      this.displayEl.classList.remove('hidden');
      this.displayEl.classList.add('is-visible');
      this._hideTimer = setTimeout(() => {
        if (!this.displayEl) return;
        this.displayEl.classList.remove('is-visible');
        this.displayEl.classList.add('hidden');
        this.displayEl.innerHTML = '';
      }, EMOTE_DURATION_MS);
    }

    destroy() {
      this._destroyed = true;
      this.closePicker();
      document.removeEventListener('click', this._docClick);
      if (this._hideTimer) clearTimeout(this._hideTimer);
      if (this._selfHideTimer) clearTimeout(this._selfHideTimer);
      this._hideTimer = null;
      this._selfHideTimer = null;
      this._unsub?.();
      this._unsub = null;
      if (this.mountEl) this.mountEl.innerHTML = '';
      if (this.selfDisplayEl) {
        this.selfDisplayEl.classList.remove('is-visible');
        this.selfDisplayEl.innerHTML = '';
      }
    }
  }

  global.MatchEmotes = {
    EMOTES,
    EMOTE_DURATION_MS,
    buildSummaryFromUserData,
    buildLocalPlayerSummary,
    writeEmote,
    subscribeOpponentEmotes,
    unsubscribeOpponentEmotes,
    unsubscribeAllEmotes,
    fetchOpponentSummary,
    renderOpponentBattleCard,
    MatchEmotesController,
  };
})(typeof window !== 'undefined' ? window : globalThis);
