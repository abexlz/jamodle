/**
 * 끝말잇기 1v1 — word chain multiplayer page.
 */
(function (global) {
  'use strict';

  const WCS = () => global.WordChainService;
  const KR = () => global.WordChainKrdict;

  function wc(key, vars) {
    return global.I18n?.t('wordChain.' + key, vars) ?? '';
  }

  function ct(key) {
    return global.I18n?.t('common.' + key) ?? '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatChain(words) {
    if (!words?.length) return wc('chainEmpty');
    return words.join(' → ');
  }

  class WordChainApp {
    constructor(rootEl) {
      this.root = rootEl;
      this.matchId = new URLSearchParams(global.location.search).get('id');
      this.myUid = null;
      this.matchUnsub = null;
      this.turnTimer = null;
      this.matchData = null;
      this.submitting = false;
      this.xpAwarded = false;
      this._localeOff = null;
    }

    async init() {
      this._localeOff = global.I18n?.onChange?.(() => this.onLocaleChange());

      if (!this.matchId) {
        this.renderError(wc('noMatchId'));
        return;
      }

      await global.FirebaseSocial?.whenAuthReady?.();
      this.myUid = global.FirebaseSocial?.getCurrentUid?.();
      if (!this.myUid) {
        this.renderError(wc('loginRequired'));
        return;
      }

      document.title = wc('pageTitle');
      this.renderShell();
      this.renderMain(`<div class="race-panel"><p class="race-panel-title">${escapeHtml(wc('loading'))}</p></div>`);

      this.matchUnsub = WCS().subscribeMatch(
        this.matchId,
        (data) => this.onMatchUpdate(data),
        (err) => {
          console.error('[WordChainApp]', err);
          this.renderError(err?.code === 'permission-denied' ? wc('permissionDenied') : wc('loadFailed'));
        }
      );
    }

    destroy() {
      this._localeOff?.();
      this.matchUnsub?.();
      if (this.turnTimer) clearInterval(this.turnTimer);
    }

    onLocaleChange() {
      document.title = wc('pageTitle');
      if (this.matchData) this.onMatchUpdate(this.matchData);
    }

    renderShell() {
      this.root.innerHTML = `
        <header class="race-header">
          <a class="race-back" href="index.html">${escapeHtml(wc('backHome'))}</a>
          <h1>${escapeHtml(wc('title'))}</h1>
        </header>
        <div id="wc-turn-bar" class="race-turn-bar hidden" aria-live="polite"></div>
        <div id="wc-chain" class="wc-chain-panel" aria-live="polite"></div>
        <div id="wc-main" class="race-main"></div>
      `;
      this.els = {
        turnBar: this.root.querySelector('#wc-turn-bar'),
        chain: this.root.querySelector('#wc-chain'),
        main: this.root.querySelector('#wc-main'),
      };
    }

    renderError(msg) {
      this.root.innerHTML = `
        <div class="race-panel">
          <p class="race-panel-msg">${escapeHtml(msg)}</p>
          <a class="race-btn" href="index.html">${escapeHtml(wc('backHome'))}</a>
        </div>
      `;
    }

    renderMain(html) {
      if (this.els?.main) this.els.main.innerHTML = html;
    }

    onMatchUpdate(data) {
      if (!data) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-msg">${escapeHtml(wc('matchCancelled'))}</p>
            <a class="race-btn" href="index.html">${escapeHtml(wc('backHome'))}</a>
          </div>
        `);
        return;
      }

      this.matchData = data;
      if (data.player1Uid !== this.myUid && data.player2Uid !== this.myUid) {
        this.renderError(wc('notParticipant'));
        return;
      }

      this.renderChainPanel(data);

      if (data.status === 'waiting') return this.handleWaiting(data);
      if (data.status === 'active') return this.handleActive(data);
      if (data.status === 'done') return this.handleDone(data);
    }

    renderChainPanel(data) {
      const el = this.els.chain;
      if (!el) return;

      const words = data.usedWords || [];
      const required = WCS().normalizeWord(data.requiredStartSyllable);
      const myTurn = data.status === 'active' && data.currentTurnUid === this.myUid;
      const opp = WCS().getOpponent(data, this.myUid);

      el.classList.remove('hidden');
      el.innerHTML = `
        <p class="wc-chain-label">${escapeHtml(wc('chainLabel'))}</p>
        <p class="wc-chain-text">${escapeHtml(formatChain(words))}</p>
        ${required
          ? `<p class="wc-required-syllable">${escapeHtml(wc('mustStartWith', { syl: required }))}</p>`
          : `<p class="wc-required-syllable wc-required-syllable--any">${escapeHtml(wc('anyWordFirst'))}</p>`}
        ${data.status === 'active'
          ? `<p class="wc-turn-hint ${myTurn ? 'wc-turn-hint--mine' : ''}">${escapeHtml(
            myTurn ? wc('yourTurn') : wc('oppTurn', { name: opp?.name || wc('opponent') })
          )}</p>`
          : ''}
      `;
    }

    handleWaiting(data) {
      const isP1 = WCS().amPlayer1(data, this.myUid);
      this.els.turnBar?.classList.add('hidden');
      if (this.turnTimer) clearInterval(this.turnTimer);

      if (isP1) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-title">${escapeHtml(wc('waitingFor', { name: data.player2Name }))}</p>
            <p class="race-panel-sub">${escapeHtml(wc('inviteSent'))}</p>
          </div>
        `);
      } else {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-title">${escapeHtml(wc('challengedYou', { name: data.player1Name }))}</p>
            <p class="race-panel-sub">${escapeHtml(wc('inviteBody'))}</p>
            <div class="race-panel-actions">
              <button type="button" class="race-btn race-btn--primary" id="wc-accept">${escapeHtml(ct('accept'))}</button>
              <button type="button" class="race-btn" id="wc-decline">${escapeHtml(ct('decline'))}</button>
            </div>
          </div>
        `);
        this.root.querySelector('#wc-accept')?.addEventListener('click', () => {
          WCS().acceptMatch(this.matchId).catch(() => alert(wc('acceptFailed')));
        });
        this.root.querySelector('#wc-decline')?.addEventListener('click', () => {
          WCS().declineMatch(this.matchId).then(() => { global.location.href = 'index.html'; })
            .catch(() => alert(wc('declineFailed')));
        });
      }
    }

    handleActive(data) {
      const myTurn = data.currentTurnUid === this.myUid;
      this.renderTurnBar(data, myTurn);
      this.startTurnTimer(data);

      if (!myTurn) {
        this.renderMain(`
          <div class="race-panel wc-wait-panel">
            <p class="race-panel-title">${escapeHtml(wc('waitingForTurn', {
              name: WCS().getOpponent(data, this.myUid)?.name || wc('opponent'),
            }))}</p>
          </div>
        `);
        return;
      }

      const msg = this._inputError || '';
      this.renderMain(`
        <div class="race-panel wc-play-panel">
          <label class="wc-input-label" for="wc-word-input">${escapeHtml(wc('enterWord'))}</label>
          <div class="wc-input-row">
            <input type="text" id="wc-word-input" class="wc-word-input" autocomplete="off"
              autocapitalize="none" spellcheck="false" maxlength="24"
              placeholder="${escapeHtml(wc('inputPlaceholder'))}">
            <button type="button" class="race-btn race-btn--primary" id="wc-submit">${escapeHtml(wc('submit'))}</button>
          </div>
          <p class="wc-input-msg ${msg ? 'wc-input-msg--error' : 'hidden'}" id="wc-input-msg">${escapeHtml(msg)}</p>
        </div>
      `);

      const input = this.root.querySelector('#wc-word-input');
      const submit = this.root.querySelector('#wc-submit');
      input?.focus();
      submit?.addEventListener('click', () => this.onSubmit());
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.onSubmit();
        }
      });
    }

    renderTurnBar(data, myTurn) {
      const bar = this.els.turnBar;
      if (!bar) return;
      const pct = Math.round((1 - WCS().turnElapsedRatio(data)) * 100);
      bar.classList.remove('hidden');
      bar.classList.toggle('is-my-turn', myTurn);
      bar.innerHTML = `
        <div class="race-turn-bar-top">
          <span class="race-turn-label">${escapeHtml(myTurn ? wc('yourTurn') : wc('oppTurnShort'))}</span>
          <span class="race-turn-round">${escapeHtml(wc('timeLeft', { s: Math.ceil(WCS().turnRemainingMs(data) / 1000) }))}</span>
        </div>
        <div class="race-turn-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="race-turn-progress-fill" style="width:${pct}%"></div>
        </div>
      `;
    }

    startTurnTimer(data) {
      if (this.turnTimer) clearInterval(this.turnTimer);
      this.turnTimer = setInterval(async () => {
        const live = this.matchData;
        if (!live || live.status !== 'active') return;

        if (live.currentTurnUid === this.myUid && WCS().turnRemainingMs(live) <= 0 && !this.submitting) {
          await WCS().completeTurnDeadline(this.matchId, live);
        } else {
          await WCS().completeTurnDeadline(this.matchId, live);
        }

        if (live.status === 'active') {
          this.renderTurnBar(live, live.currentTurnUid === this.myUid);
        }
      }, 200);
    }

    setInputError(msg) {
      this._inputError = msg || '';
      const el = this.root.querySelector('#wc-input-msg');
      if (el) {
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
        el.classList.toggle('wc-input-msg--error', !!msg);
      }
    }

    async onSubmit() {
      if (this.submitting || !this.matchData || this.matchData.status !== 'active') return;
      if (this.matchData.currentTurnUid !== this.myUid) return;

      const input = this.root.querySelector('#wc-word-input');
      const word = WCS().normalizeWord(input?.value);
      if (!word) {
        this.setInputError(wc('errEmpty'));
        return;
      }

      const localReason = WCS().localRejectReason(this.matchData, word);
      if (localReason === 'syllable') {
        this.setInputError(wc('errSyllable', {
          syl: WCS().normalizeWord(this.matchData.requiredStartSyllable),
        }));
        return;
      }
      if (localReason === 'repeat') {
        this.setInputError(wc('errRepeat'));
        return;
      }
      if (localReason === 'notHangul') {
        this.setInputError(wc('errNotHangul'));
        return;
      }

      this.setInputError('');
      this.submitting = true;
      const submitBtn = this.root.querySelector('#wc-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const validation = await KR().validateWord(word);
        if (validation.networkError) {
          this.setInputError(wc('errValidationFailed'));
          return;
        }
        if (!validation.valid) {
          await WCS().failInvalidWord(this.matchId, this.myUid, word);
          return;
        }
        await WCS().submitValidWord(this.matchId, this.myUid, word);
        if (input) input.value = '';
      } catch (err) {
        console.error('[WordChainApp] submit', err);
        if (err?.message === 'syllable') {
          this.setInputError(wc('errSyllable', {
            syl: WCS().normalizeWord(this.matchData.requiredStartSyllable),
          }));
        } else if (err?.message === 'repeat') {
          this.setInputError(wc('errRepeat'));
        } else if (err?.message === 'not-your-turn') {
          this.setInputError(wc('errNotYourTurn'));
        } else {
          this.setInputError(wc('errSubmitFailed'));
        }
      } finally {
        this.submitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    handleDone(data) {
      if (this.turnTimer) clearInterval(this.turnTimer);
      this.els.turnBar?.classList.add('hidden');

      const winnerUid = WCS().getWinnerUid(data);
      const iWon = winnerUid === this.myUid;
      const opp = WCS().getOpponent(data, this.myUid);
      const resultKind = iWon ? 'win' : 'loss';
      let resultLine = iWon ? wc('win') : wc('loss');

      const reasonKey = data.endReason ? `endReason_${data.endReason}` : null;
      const reasonText = reasonKey ? wc(reasonKey, {
        name: data.loserUid === this.myUid ? wc('me') : (opp?.name || wc('opponent')),
      }) : '';

      if (!this.xpAwarded && winnerUid) {
        this.xpAwarded = true;
        global.XpService?.awardAndCelebrate?.({
          mode: 'wordChain',
          wordId: `wc-${this.matchId}`,
        });
      }

      const chainHtml = global.RaceResultsUI?.buildWordChainHtml?.(data.usedWords || [])
        || `<p class="wc-chain-text">${escapeHtml(formatChain(data.usedWords || []))}</p>`;

      this.renderMain(global.RaceResultsUI.renderResultsPanel({
        resultLine,
        resultKind,
        winnerUid,
        players: [
          {
            uid: this.myUid,
            name: wc('me'),
            statHtml: iWon ? escapeHtml(wc('winner')) : escapeHtml(reasonText || wc('loser')),
          },
          {
            uid: opp?.uid,
            name: opp?.name || wc('opponent'),
            statHtml: !iWon ? escapeHtml(wc('winner')) : escapeHtml(reasonText || wc('loser')),
          },
        ],
        answerTilesHtml: chainHtml,
        answerLabel: wc('finalChain'),
        rematchLabel: wc('rematch'),
        profileLabel: wc('backHome'),
        profileHref: 'index.html',
        subtitleHtml: reasonText ? `<p class="wc-result-reason">${escapeHtml(reasonText)}</p>` : '',
      }));

      this.root.querySelector('#race-rematch')?.addEventListener('click', async () => {
        const oppUid = opp?.uid;
        if (!oppUid) return;
        try {
          const newId = await WCS().createMatch(oppUid);
          global.location.href = WCS().getMatchPageUrl(newId);
        } catch {
          alert(wc('rematchFailed'));
        }
      });
    }
  }

  global.WordChainApp = WordChainApp;
  global.addEventListener('pagehide', () => {
    if (global.__wordChainAppInstance) global.__wordChainAppInstance.destroy();
  });
})(typeof window !== 'undefined' ? window : globalThis);
