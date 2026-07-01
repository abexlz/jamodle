/**
 * 1v1 race results — presentation only (tiles, panel markup, no game logic).
 */
(function (global) {
  'use strict';

  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const STACK_VOWELS = new Set(['ㅗ','ㅛ','ㅜ','ㅠ','ㅡ']);

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
      html += `<div class="syl${sylClass}">`;

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
      (ch) => `<span class="race-results-syl-tile race-results-syl-tile--win">${escapeHtml(ch)}</span>`
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
  }) {
    const kind = resultKind === 'win' || resultKind === 'loss' ? resultKind : 'draw';
    const sorted = [...(players || [])].sort((a, b) => {
      if (!winnerUid) return 0;
      if (a.uid === winnerUid) return -1;
      if (b.uid === winnerUid) return 1;
      return 0;
    });

    const rowsHtml = sorted.map((p) => {
      let rowClass = 'race-result-row';
      if (winnerUid && p.uid === winnerUid) rowClass += ' race-result-row--winner';
      else if (winnerUid) rowClass += ' race-result-row--loser';

      const crown = winnerUid && p.uid === winnerUid
        ? '<span class="race-result-crown" aria-hidden="true">👑</span>'
        : '';

      return `
        <div class="${rowClass}">
          <dt>${crown}${escapeHtml(p.name || '')}</dt>
          <dd>${p.statHtml || ''}</dd>
        </div>
      `;
    }).join('');

    const headingEmoji = kind === 'win' ? '🎉 ' : kind === 'loss' ? '💪 ' : '🤝 ';
    const heading = headingEmoji + (resultLine || (kind === 'win' ? 'Victory!' : kind === 'loss' ? 'Defeat' : 'Draw'));
    const rematchText = rematchLabel || 'Rematch';
    const homeText = profileLabel || 'Home';

    return `
      <div class="race-panel race-results race-results--ink race-results--${kind}">
        <h2 class="race-results-heading">${escapeHtml(heading)}</h2>
        ${subtitleHtml || ''}
        <dl class="race-results-stats">${rowsHtml}</dl>
        <div class="race-results-answer">
          <p class="race-results-answer-label">✨ ${escapeHtml(answerLabel || 'Answer')}</p>
          <div class="race-results-answer-tiles">${answerTilesHtml || ''}</div>
        </div>
        <div class="race-results-actions">
          <button type="button" class="race-btn race-results-btn race-btn--rematch" id="race-rematch">${escapeHtml(rematchText)}</button>
          <a class="race-btn race-results-btn race-btn--home" href="${escapeHtml(profileHref)}">${escapeHtml(homeText)}</a>
        </div>
      </div>
    `;
  }

  global.RaceResultsUI = {
    escapeHtml,
    buildWordleWinTiles,
    buildMatchWinTiles,
    buildWordChainHtml,
    renderResultsPanel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
