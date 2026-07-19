/**
 * 1v1 race results — presentation only (tiles, panel markup, no game logic).
 */
(function (global) {
  'use strict';

  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const STACK_VOWELS = new Set(['ㅗ','ㅛ','ㅜ','ㅠ','ㅡ']);
  const CONFETTI_COLORS = ['#FFD743', '#5FD68A', '#7BCFFF', '#FFB8D0', '#ffffff', '#FF8A9B', '#98DDB8'];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function decompose(syllable) {
    const code = syllable.codePointAt(0) - 0xAC00;
    const choIdx = Math.floor(code / (21 * 28));
    const jungIdx = Math.floor((code % (21 * 28)) / 28);
    const jongIdx = code % 28;
    return { cho: CHO[choIdx], jung: JUNG[jungIdx], jong: JONG[jongIdx] };
  }

  function isHangulSyllable(ch) {
    const c = ch.codePointAt(0);
    return c >= 0xAC00 && c <= 0xD7A3;
  }

  function wordToSlots(word) {
    const cho = [];
    const jung = [];
    const jong = [];
    for (const ch of word) {
      if (!isHangulSyllable(ch)) continue;
      const d = decompose(ch);
      cho.push(d.cho);
      jung.push(d.jung);
      jong.push(d.jong);
    }
    return { cho, jung, jong };
  }

  function buildWordleWinTiles(word) {
    if (!word) return '';
    const slots = wordToSlots(word);
    const len = slots.cho.length;
    if (!len) return '';

    const layout = slots.cho.map((_, s) => ({
      hasJong: slots.jong[s] !== '',
      vowelType: STACK_VOWELS.has(slots.jung[s]) ? 'stack' : 'side',
    }));

    let html = '<div class="race-results-wordle-row">';
    for (let s = 0; s < len; s++) {
      const { hasJong, vowelType } = layout[s];
      const sylClass = hasJong ? ' syl-triple' : ' syl-dual';
      const delay = (s * 0.08).toFixed(2);
      html += `<div class="syl race-results-syl-reveal${sylClass}" style="--reveal-delay:${delay}s">`;

      const cho = escapeHtml(slots.cho[s]);
      const jung = escapeHtml(slots.jung[s]);
      const jong = escapeHtml(slots.jong[s]);

      if (vowelType === 'stack') {
        html += `<div class="syl-row"><div class="jamo correct">${cho}</div></div>`;
        html += `<div class="syl-row"><div class="jamo correct">${jung}</div></div>`;
      } else {
        html += `<div class="syl-row"><div class="jamo correct">${cho}</div><div class="jamo correct">${jung}</div></div>`;
      }

      if (hasJong) {
        html += `<div class="syl-row syl-row-jong"><div class="jamo correct">${jong}</div></div>`;
      }

      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function buildMatchWinTiles(word) {
    if (!word) return '';
    const HC = global.HangulCompose;
    const isSyl = HC?.isHangulSyllable || isHangulSyllable;
    const syllables = [...word].filter(isSyl);
    if (!syllables.length) return '';

    return `<div class="race-results-match-row">${syllables.map(
      (ch, i) => `<span class="race-results-syl-tile race-results-syl-tile--win race-results-syl-tile--reveal" style="--reveal-delay:${(i * 0.08).toFixed(2)}s">${escapeHtml(ch)}</span>`
    ).join('')}</div>`;
  }

  function buildWordChainHtml(words) {
    const list = (words || []).filter(Boolean);
    if (!list.length) return '';
    return `<div class="wc-results-chain-inline">${list.map((w, i) => {
      const arrow = i > 0 ? '<span class="wc-chain-arrow" aria-hidden="true">→</span>' : '';
      return `${arrow}<span class="wc-chain-word-pill">${escapeHtml(w)}</span>`;
    }).join('')}</div>`;
  }

  function stripHeadingEmojis(text) {
    return String(text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildHeadingHtml(resultLine, kind) {
    const defaults = { win: 'Victory!', loss: 'Defeat', draw: 'Draw' };
    const text = stripHeadingEmojis(resultLine) || defaults[kind] || defaults.draw;
    const emoji = kind === 'win' ? '🎉' : kind === 'loss' ? '💪' : '🤝';

    if (kind === 'win') {
      const letters = [...text].map((ch, i) => {
        if (ch === ' ') {
          return '<span class="race-results-heading-letter is-space" aria-hidden="true">&nbsp;</span>';
        }
        const delay = (0.08 * i + 0.12).toFixed(2);
        return `<span class="race-results-heading-letter" style="--letter-delay:${delay}s" aria-hidden="true">${escapeHtml(ch)}</span>`;
      }).join('');
      return `
        <h2 class="race-results-heading race-results-heading--pop" aria-label="${escapeHtml(text)}">
          <span class="race-results-heading-letters" aria-hidden="true">${letters}</span>
        </h2>`;
    }

    return `<h2 class="race-results-heading"><span class="race-results-heading-emoji" aria-hidden="true">${emoji} </span>${escapeHtml(text)}</h2>`;
  }

  function buildRewardsPillHtml(rewards) {
    if (!rewards) return '';
    const parts = [];
    if (rewards.xp > 0) parts.push(`<span class="race-results-reward race-results-reward--xp">+${rewards.xp} XP</span>`);
    if (rewards.coins > 0) {
      parts.push(`<span class="race-results-reward-sep" aria-hidden="true">|</span>`);
      parts.push(`<span class="race-results-reward race-results-reward--coins">🪙 ${rewards.coins} coins</span>`);
    }
    if (!parts.length) return '';
    return `<div class="race-results-rewards-pill">${parts.join('')}</div>`;
  }

  function buildSparkleMarkup(count, prefix = 'sparkle') {
    return Array.from({ length: count }, (_, i) => {
      const x = (6 + Math.random() * 88).toFixed(1);
      const y = (8 + Math.random() * 72).toFixed(1);
      const delay = (Math.random() * 1.8).toFixed(2);
      const dur = (1.2 + Math.random() * 1.4).toFixed(2);
      const scale = (0.6 + Math.random() * 0.8).toFixed(2);
      return `<span class="race-results-sparkle" style="--sx:${x}%;--sy:${y}%;--sd:${delay}s;--ss:${dur}s;--sscale:${scale}"></span>`;
    }).join('');
  }

  function buildVictoryBannerHtml(headingHtml, rewardsHtml = '') {
    const sparkles = buildSparkleMarkup(14);
    return `
      <div class="race-results-victory-banner">
        <div class="race-results-victory-shine" aria-hidden="true"></div>
        <div class="race-results-victory-sparkles" aria-hidden="true">${sparkles}</div>
        <span class="race-results-victory-floral race-results-victory-floral--left" aria-hidden="true">🌸</span>
        <span class="race-results-victory-floral race-results-victory-floral--right" aria-hidden="true">🌿</span>
        <span class="race-results-victory-petal race-results-victory-petal--1" aria-hidden="true">🌸</span>
        <span class="race-results-victory-petal race-results-victory-petal--2" aria-hidden="true">🌸</span>
        <span class="race-results-victory-crown" aria-hidden="true">👑</span>
        ${headingHtml}
        ${rewardsHtml}
      </div>`;
  }

  function buildResultHeroHtml(kind, headingHtml, rewardsHtml = '') {
    if (kind !== 'win' && kind !== 'loss' && kind !== 'draw') return headingHtml;

    const assets = {
      win: 'assets/results/victory-result-banner.png',
      loss: 'assets/results/defeat-result-banner.png',
      draw: 'assets/results/draw-result-banner.png',
    };
    const alts = {
      win: 'Victory!',
      loss: 'Defeat. Better luck next time!',
      draw: "Draw. It's a tie!",
    };
    const sparkleCounts = { win: 18, loss: 10, draw: 14 };
    const asset = assets[kind];
    const sparkles = buildSparkleMarkup(sparkleCounts[kind] || 14);
    const alt = alts[kind] || alts.draw;

    return `
      <div class="race-results-hero race-results-hero--${kind}">
        <div class="race-results-hero-aura" aria-hidden="true"></div>
        <div class="race-results-hero-sparkles" aria-hidden="true">${sparkles}</div>
        <img class="race-results-hero-img" src="${asset}" alt="${alt}" decoding="async">
        <span class="race-results-hero-shine" aria-hidden="true"></span>
        <span class="race-results-hero-petal race-results-hero-petal--1" aria-hidden="true"></span>
        <span class="race-results-hero-petal race-results-hero-petal--2" aria-hidden="true"></span>
        <span class="race-results-heading-fallback">${headingHtml}</span>
        ${rewardsHtml}
      </div>`;
  }

  function buildVictoryVfxMarkup() {
    const pieces = Array.from({ length: 24 }, (_, i) => {
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const x = (8 + Math.random() * 84).toFixed(1);
      const delay = (Math.random() * 0.7).toFixed(2);
      const dur = (1.8 + Math.random() * 1.1).toFixed(2);
      const spin = (Math.random() * 360).toFixed(0);
      return `<span class="race-results-confetti" style="--x:${x}%;--delay:${delay}s;--dur:${dur}s;--spin:${spin}deg;--confetti-color:${color}"></span>`;
    }).join('');
    return `<div class="race-results-vfx" aria-hidden="true">${pieces}<span class="race-results-glow" aria-hidden="true"></span></div>`;
  }

  function spawnVictoryConfetti() {
    if (global.UserPreferences?.shouldReduceMotion?.()) return;
    for (let i = 0; i < 64; i++) {
      const piece = document.createElement('div');
      piece.className = 'race-results-confetti-fall';
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      piece.style.animationDuration = `${1.6 + Math.random() * 1.8}s`;
      piece.style.animationDelay = `${Math.random() * 0.65}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      if (Math.random() > 0.45) piece.style.borderRadius = '50%';
      if (Math.random() > 0.7) piece.style.width = '7px';
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 4500);
    }
  }

  function addWinnerDuelSparkles(root) {
    const wrap = root.querySelector('.race-results-duel-side--winner .race-results-duel-card-wrap');
    if (!wrap || wrap.querySelector('.race-results-row-sparkle')) return;
    for (let i = 0; i < 10; i++) {
      const sparkle = document.createElement('span');
      sparkle.className = 'race-results-row-sparkle';
      sparkle.style.setProperty('--rs-delay', `${(i * 0.32).toFixed(2)}s`);
      sparkle.style.setProperty('--rs-x', `${(6 + i * 9) % 94}%`);
      sparkle.style.setProperty('--rs-y', `${(12 + (i * 17) % 76)}%`);
      wrap.appendChild(sparkle);
    }
  }

  function buildPlayerDuelSideHtml(player, role) {
    const roleClass = role === 'winner'
      ? 'race-results-duel-side--winner'
      : role === 'loser'
        ? 'race-results-duel-side--loser'
        : 'race-results-duel-side--draw';
    const crown = role === 'winner'
      ? '<span class="race-results-duel-crown" aria-hidden="true">👑</span>'
      : '';

    return `
      <div class="race-results-duel-side ${roleClass}" data-battle-uid="${escapeHtml(player.uid || '')}">
        <div class="race-results-duel-card-wrap">
          ${crown}
          <div class="race-results-duel-side-aura" aria-hidden="true"></div>
          <div class="race-results-duel-card race-opp-battle-card" data-battle-card-slot aria-hidden="true"></div>
        </div>
        <p class="race-results-duel-name">${escapeHtml(player.name || '')}</p>
        <p class="race-results-duel-stat">${player.statHtml || ''}</p>
      </div>
    `;
  }

  function buildPlayersDuelHtml(players, winnerUid, kind) {
    const statsClass = kind === 'win'
      ? 'race-results-stats race-results-stats--victory'
      : kind === 'loss'
        ? 'race-results-stats race-results-stats--defeat'
        : 'race-results-stats';

    const sides = (players || []).map((p) => {
      let role = 'draw';
      if (winnerUid) role = p.uid === winnerUid ? 'winner' : 'loser';
      return buildPlayerDuelSideHtml(p, role);
    }).join('');

    return `<div class="race-results-duel ${statsClass}" role="group">${sides}</div>`;
  }

  function buildFallbackBattleSummary(name) {
    return {
      name: name || '?',
      avatarIcon: '👤',
      level: 1,
      frameId: 'none',
      xpInLevel: 0,
      xpToNext: 100,
    };
  }

  function buildLocalBattleSummary() {
    const fromEmotes = global.MatchEmotes?.buildLocalPlayerSummary?.();
    if (fromEmotes) return fromEmotes;

    const summary = global.ProfileService?.getProfileSummary?.();
    if (!summary) return null;
    return {
      name: summary.displayName || summary.name || 'Player',
      displayName: summary.displayName || summary.name || 'Player',
      avatarId: summary.avatarId || 'default',
      avatarIcon: summary.avatarIcon || '🌸',
      frameId: summary.frameId || 'none',
      level: summary.level || 1,
      xpInLevel: summary.xpInLevel || 0,
      xpToNext: summary.xpToNext || 100,
      totalXp: summary.totalXp || 0,
    };
  }

  async function fetchRemoteBattleSummary(uid) {
    if (global.MatchEmotes?.fetchOpponentSummary) {
      return global.MatchEmotes.fetchOpponentSummary(uid);
    }

    try {
      const db = global.FirebaseSocial?.getDb?.();
      if (!db || !uid) return null;
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) return null;
      const data = snap.data();
      const levelInfo = global.LevelUtils?.getLevelFromTotalXp?.(data.totalXp || 0) || {
        level: 1,
        xpInLevel: 0,
        xpToNext: 100,
      };
      const avatarId = typeof data.avatarId === 'string' ? data.avatarId : 'default';
      return {
        name: global.FirebaseSocial?.getPublicName?.(data) || '?',
        displayName: global.FirebaseSocial?.getPublicName?.(data) || '?',
        avatarId,
        avatarIcon: global.BadgeService?.getAvatarDef?.(avatarId)?.icon || '🌸',
        frameId: data.frameId === 'platinum' ? 'ruby' : (data.frameId || 'none'),
        level: levelInfo.level,
        xpInLevel: levelInfo.xpInLevel,
        xpToNext: levelInfo.xpToNext,
        totalXp: Math.max(0, parseInt(data.totalXp, 10) || 0),
      };
    } catch (err) {
      console.warn('[RaceResults] fetch battle summary failed', err);
      return null;
    }
  }

  function renderBattleCardSlot(slot, summary) {
    if (!slot || !summary) return;
    if (global.MatchEmotes?.renderOpponentBattleCard) {
      global.MatchEmotes.renderOpponentBattleCard(slot, summary);
      return;
    }

    global.ProfileUI?.ensureStyles?.();
    if (global.ProfileUI?.renderBadgeCard) {
      slot.innerHTML = `
        <div class="race-opp-profile-card menu-profile-card">
          ${global.ProfileUI.renderBadgeCard(summary, { variant: 'menu' })}
        </div>
      `;
      return;
    }

    const icon = summary.avatarIcon || '👤';
    const level = summary.level || 1;
    slot.innerHTML = `
      <div class="race-opp-battle-card-inner">
        <span class="race-opp-battle-avatar" aria-hidden="true">${icon}</span>
        <span class="race-opp-battle-level">Lv.${level}</span>
      </div>
    `;
  }

  async function hydrateResultsBattleCards(root) {
    const duel = root?.querySelector?.('.race-results-duel');
    if (!duel) return;

    global.ProfileUI?.ensureStyles?.();
    const myUid = global.FirebaseSocial?.getCurrentUid?.() || '';

    await Promise.all([...duel.querySelectorAll('.race-results-duel-side')].map(async (side) => {
      const uid = side.dataset.battleUid;
      const slot = side.querySelector('[data-battle-card-slot]');
      if (!slot) return;

      const fallbackName = side.querySelector('.race-results-duel-name')?.textContent || '?';
      let summary = null;
      if (uid && uid === myUid) {
        summary = buildLocalBattleSummary();
      } else if (uid) {
        summary = await fetchRemoteBattleSummary(uid);
      }

      renderBattleCardSlot(slot, summary || buildFallbackBattleSummary(fallbackName));
      slot.removeAttribute('aria-hidden');
    }));
  }

  function tryRecordBattleStats(root) {
    const panel = root.querySelector('.race-results--win, .race-results--loss, .race-results--draw');
    if (!panel || panel.dataset.battleStatsRecorded === '1') return;

    const matchId = panel.dataset.battleMatchId || '';
    if (matchId.startsWith('bot-')) {
      panel.dataset.battleStatsRecorded = '1';
      return;
    }

    let result = 'draw';
    if (panel.classList.contains('race-results--win')) result = 'win';
    else if (panel.classList.contains('race-results--loss')) result = 'loss';

    try {
      global.ProfileService?.recordBattleResult?.(result);
    } catch (err) {
      console.warn('[RaceResults] battle stats failed', err);
    }
    panel.dataset.battleStatsRecorded = '1';
  }

  function tryRecordBattleQuests(root) {
    const panel = root.querySelector('.race-results--win, .race-results--loss, .race-results--draw');
    if (!panel || panel.dataset.questRecorded === '1') return;

    const battleMode = panel.dataset.battleQuestMode || '';
    const isFriend = panel.dataset.battleFriend === '1';
    const iWon = panel.classList.contains('race-results--win');

    try {
      global.QuestService?.recordActivity?.('battle', {
        won: iWon,
        friendBattle: isFriend,
        coopWin: iWon && battleMode === 'turn',
      });
    } catch (err) {
      console.warn('[RaceResults] quest progress failed', err);
    }
    panel.dataset.questRecorded = '1';
  }

  function tryAwardBattleRewards(panel) {
    const mode = panel?.dataset?.battleXpMode;
    const matchId = panel?.dataset?.battleMatchId || 'battle';
    if (!mode || panel.dataset.xpAwarded === '1') return null;

    const result = global.XpService?.awardLearningXp?.({
      mode,
      wordId: `${mode}-pvp-${matchId}`,
    });
    if (!result?.awarded) return null;

    panel.dataset.xpAwarded = '1';
    global.XpService?.handleRewards?.(result);
    const coins = result.coinsGranted || 0;
    return {
      xp: result.xpEarned || 0,
      coins,
    };
  }

  function injectRewardsPill(panel, rewards) {
    if (!rewards) return;
    const banner = panel.querySelector('.race-results-victory-banner');
    if (!banner || banner.querySelector('.race-results-rewards-pill')) return;
    banner.insertAdjacentHTML('beforeend', buildRewardsPillHtml(rewards));
  }

  function afterResultsMount(root) {
    if (!root) return;
    tryRecordBattleQuests(root);
    tryRecordBattleStats(root);
    const winPanel = root.querySelector('.race-results--win');
    const lossPanel = root.querySelector('.race-results--loss');

    if (winPanel) {
      global.SoundEffects?.battleVictory?.();
      spawnVictoryConfetti();
      addWinnerDuelSparkles(root);
      void hydrateResultsBattleCards(root);

      const rewards = tryAwardBattleRewards(winPanel);
      if (rewards) injectRewardsPill(winPanel, rewards);

      requestAnimationFrame(() => {
        winPanel.classList.add('race-results--mounted');
      });
      return;
    }

    if (lossPanel) {
      global.SoundEffects?.battleDefeat?.();
      addWinnerDuelSparkles(root);
      void hydrateResultsBattleCards(root);
      requestAnimationFrame(() => {
        lossPanel.classList.add('race-results--mounted');
      });
      return;
    }

    const drawPanel = root.querySelector('.race-results--draw');
    if (drawPanel) {
      global.SoundEffects?.battleDraw?.();
      void hydrateResultsBattleCards(root);
      requestAnimationFrame(() => {
        drawPanel.classList.add('race-results--mounted');
      });
    }
  }

  function renderResultsPanel({
    resultLine,
    resultKind,
    winnerUid,
    players,
    answerTilesHtml,
    answerLabel,
    rematchLabel,
    profileLabel,
    profileHref = 'profile.html',
    subtitleHtml = '',
    battleXpMode = '',
    battleMatchId = '',
    battleQuestMode = '',
    battleFriend = false,
    rewardsHtml = '',
  }) {
    const kind = resultKind === 'win' || resultKind === 'loss' ? resultKind : 'draw';
    const duelHtml = buildPlayersDuelHtml(players, winnerUid, kind);

    const headingHtml = buildHeadingHtml(resultLine, kind);
    const rematchText = rematchLabel || 'Rematch';
    const homeText = profileLabel || 'Home';
    const vfxHtml = kind === 'win' ? buildVictoryVfxMarkup() : '';
    const headingBlock = (kind === 'win' || kind === 'loss' || kind === 'draw')
      ? buildResultHeroHtml(kind, headingHtml, rewardsHtml)
      : headingHtml;
    const answerHtml = answerTilesHtml
      ? `<div class="race-results-answer">
          <p class="race-results-answer-label">✨ ${escapeHtml(answerLabel || 'Answer')}</p>
          <div class="race-results-answer-tiles">${answerTilesHtml}</div>
          <p class="race-results-answer-meaning" aria-live="polite"></p>
        </div>`
      : '';

    return `
      <div class="race-panel race-results race-results--ink race-results--${kind}"
        ${battleXpMode ? `data-battle-xp-mode="${escapeHtml(battleXpMode)}"` : ''}
        ${battleMatchId ? `data-battle-match-id="${escapeHtml(battleMatchId)}"` : ''}
        ${battleQuestMode ? `data-battle-quest-mode="${escapeHtml(battleQuestMode)}"` : ''}
        ${battleFriend ? 'data-battle-friend="1"' : ''}>
        ${vfxHtml}
        ${headingBlock}
        ${subtitleHtml || ''}
        ${duelHtml}
        ${answerHtml}
        <div class="race-results-actions">
          <button type="button" class="race-btn race-results-btn race-btn--rematch" id="race-rematch">${escapeHtml(rematchText)}</button>
          <a class="race-btn race-results-btn race-btn--home" href="${escapeHtml(profileHref)}">${escapeHtml(homeText)}</a>
        </div>
      </div>
    `;
  }

  async function fillAnswerMeaning(root, word, options = {}) {
    const el = root?.querySelector?.('.race-results-answer-meaning');
    if (!el || !word) return;
    const ttsOptions = { autoplay: options.autoplay !== false, autoplayRepeats: options.autoplayRepeats };
    const dictText = await global.DictionaryService?.resolveEnglishMeaning?.(word);
    if (dictText) {
      el.textContent = dictText;
      global.AnswerTTS?.setupResultsAnswer?.(root, word, ttsOptions);
      return;
    }
    const gloss = global.MatchWordMeanings?.[word]
      || global.LearningWords?.getWordMeaning?.(word);
    if (gloss) {
      el.textContent = gloss;
      global.AnswerTTS?.setupResultsAnswer?.(root, word, ttsOptions);
      return;
    }
    const entry = global.LearningWords?.findWordEntry?.(word);
    if (entry) {
      const normalized = global.LearningWords?.getNormalizedWord?.(word)
        || global.LearningWordModel?.normalizeLearningWord?.(entry);
      const curated = global.LearningWordModel?.getDisplayMeaning?.(normalized);
      if (curated) el.textContent = curated;
    }
    global.AnswerTTS?.setupResultsAnswer?.(root, word, ttsOptions);
  }

  global.RaceResultsUI = {
    escapeHtml,
    buildWordleWinTiles,
    buildMatchWinTiles,
    buildWordChainHtml,
    buildRewardsPillHtml,
    renderResultsPanel,
    afterResultsMount,
    hydrateResultsBattleCards,
    fillAnswerMeaning,
  };
})(typeof window !== 'undefined' ? window : globalThis);
