/**
 * Dictionary detail modal — shows Korean Basic Dictionary enrichment.
 */
(function (global) {
  'use strict';

  const DS = () => global.DictionaryService;
  const LWM = () => global.LearningWordModel;

  let overlayEl = null;

  function ensureStyles() {
    if (document.getElementById('dict-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'dict-modal-styles';
    style.textContent = `
      .dict-overlay {
        position: fixed; inset: 0; z-index: 200;
        background: rgba(255, 248, 245, 0.92);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
      }
      [data-theme="dark"] .dict-overlay { background: rgba(18, 20, 28, 0.92); }
      .dict-overlay.hidden { display: none; }
      .dict-card {
        background: var(--card, #fff);
        border: 2px solid var(--border, #E8E4E0);
        border-radius: 24px;
        padding: 28px 24px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 4px 14px rgba(93, 100, 112, 0.12);
        animation: dictPopIn .35s ease;
      }
      @keyframes dictPopIn {
        from { opacity: 0; transform: scale(.94) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .dict-card h2 {
        font-family: 'Junegull', sans-serif;
        font-size: 36px;
        margin: 0 0 4px;
        color: var(--text, #5D6470);
        text-align: center;
      }
      .dict-pronounce {
        text-align: center;
        color: var(--text-soft, #9AA3AD);
        font-size: 15px;
        margin: 0 0 12px;
      }
      .dict-meaning {
        font-size: 18px;
        color: var(--heading, #7B8FD4);
        font-family: 'Junegull', sans-serif;
        text-align: center;
        margin: 0 0 16px;
        line-height: 1.45;
      }
      .dict-meta {
        display: grid;
        gap: 10px;
        margin-bottom: 16px;
      }
      .dict-row {
        background: var(--bg, #FFF8F5);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 14px;
        line-height: 1.45;
      }
      .dict-row dt {
        font-weight: 700;
        color: var(--heading, #7B8FD4);
        font-size: 12px;
        margin-bottom: 2px;
      }
      .dict-row dd { margin: 0; color: var(--text, #5D6470); }
      .dict-example {
        font-style: italic;
        border-left: 3px solid var(--lavender-btn, #CFC0F5);
        padding-left: 10px;
      }
      .dict-source {
        font-size: 11px;
        color: var(--text-soft, #9AA3AD);
        text-align: center;
        margin: 12px 0 16px;
        line-height: 1.4;
      }
      .dict-source a { color: var(--heading, #7B8FD4); }
      .dict-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }
      .dict-btn {
        font-family: 'Junegull', sans-serif;
        font-size: 15px;
        padding: 12px 22px;
        border-radius: 999px;
        border: 2px solid var(--lavender-btn, #CFC0F5);
        background: var(--lavender, #E8DEFF);
        color: var(--heading, #7B8FD4);
        cursor: pointer;
      }
      .dict-btn.secondary {
        background: var(--card, #fff);
        border-color: var(--border, #E8E4E0);
        color: var(--text, #5D6470);
      }
      .dict-loading, .dict-error {
        text-align: center;
        padding: 20px;
        color: var(--text-soft, #9AA3AD);
        font-size: 15px;
      }
      .dict-open-btn {
        font-family: 'Junegull', sans-serif;
        font-size: 15px;
        padding: 10px 20px;
        border-radius: 999px;
        border: 2px solid var(--blue-btn, #A8D4F5);
        background: var(--blue, #C8E6FF);
        color: var(--heading, #7B8FD4);
        cursor: pointer;
        margin-top: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    ensureStyles();
    overlayEl = document.createElement('div');
    overlayEl.className = 'dict-overlay hidden';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.innerHTML = '<div class="dict-card" id="dict-card"></div>';
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function renderContent(card, { word, curatedEntry, result, loading, error }) {
    if (loading) {
      card.innerHTML = '<div class="dict-loading">Looking up dictionary… · 사전 검색 중</div>';
      return;
    }

    if (error || !result?.found) {
      const fallback = LWM()?.getDisplayMeaning(curatedEntry) || '';
      card.innerHTML = `
        <h2>${word}</h2>
        ${fallback ? `<p class="dict-meaning">${fallback}</p>` : ''}
        <div class="dict-error">${error || 'Dictionary details are unavailable right now.'}</div>
        <div class="dict-actions">
          <button type="button" class="dict-btn secondary" data-action="close">Close</button>
        </div>
      `;
      bindActions(card);
      return;
    }

    const entry = result.entry;
    const meaning = LWM()?.getDisplayMeaning(curatedEntry) || entry.definition || entry.englishWord || '';
    const pos = entry.partOfSpeech
      ? `${entry.partOfSpeech}${entry.partOfSpeechEn ? ` (${entry.partOfSpeechEn})` : ''}`
      : '';

    card.innerHTML = `
      <h2>${entry.word || word}</h2>
      ${entry.pronunciation ? `<p class="dict-pronounce">[${entry.pronunciation}]</p>` : ''}
      <p class="dict-meaning">${meaning}</p>
      <dl class="dict-meta">
        ${entry.definition && entry.definition !== meaning ? `
          <div class="dict-row"><dt>Dictionary definition</dt><dd>${entry.definition}</dd></div>
        ` : ''}
        ${pos ? `<div class="dict-row"><dt>Part of speech</dt><dd>${pos}</dd></div>` : ''}
        ${entry.wordGrade ? `<div class="dict-row"><dt>Level</dt><dd>${entry.wordGrade}</dd></div>` : ''}
        ${entry.example ? `<div class="dict-row dict-example"><dt>Example</dt><dd>${entry.example}</dd></div>` : ''}
      </dl>
      <p class="dict-source">
        Source: <a href="${entry.sourceUrl || 'https://krdict.korean.go.kr'}" target="_blank" rel="noopener">${result.source || 'Korean Basic Dictionary'}</a>
        ${result.cached ? ' · cached' : ''}
      </p>
      <div class="dict-actions">
        <button type="button" class="dict-btn" data-action="speak">🔊 Hear it</button>
        <button type="button" class="dict-btn secondary" data-action="close">Close</button>
      </div>
    `;
    bindActions(card, word);
  }

  function bindActions(card, word) {
    card.querySelector('[data-action="close"]')?.addEventListener('click', close);
    card.querySelector('[data-action="speak"]')?.addEventListener('click', () => {
      if (!word || !global.speechSynthesis) return;
      global.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'ko-KR';
      u.rate = 0.85;
      global.speechSynthesis.speak(u);
    });
  }

  function close() {
    if (overlayEl) overlayEl.classList.add('hidden');
  }

  async function open(word, curatedEntry = null) {
    const overlay = ensureOverlay();
    const card = overlay.querySelector('#dict-card');
    overlay.classList.remove('hidden');
    renderContent(card, { word, curatedEntry, loading: true });

    const result = await DS().lookupWord(word);
    const error = result.error || (!result.found ? 'No dictionary entry found for this word.' : null);
    renderContent(card, { word, curatedEntry, result, error });
  }

  function createButton(label = '📖 Dictionary') {
    ensureStyles();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dict-open-btn';
    btn.textContent = label;
    return btn;
  }

  global.DictionaryModal = {
    open,
    close,
    createButton,
  };
})(typeof window !== 'undefined' ? window : globalThis);
