/**
 * Force 4-letter battle empty slots to fill 97% of the scoreboard↔dock gap.
 * Injected stylesheet + measured pixels — avoids flex/% and aspect-ratio traps.
 */
(function initFourLetterBoardLayout(global) {
  const STYLE_ID = 'jamodle-four-letter-board-style';

  function ensureStyleEl() {
    let el = document.getElementById(STYLE_ID);
    if (el) return el;
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
    return el;
  }

  function clearStyle() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.textContent = '';
  }

  function measureGap(app) {
    const hud = document.getElementById('race-battle-hud');
    const dock = app?.querySelector?.('.bank-section--turn, .bank-section');
    const area = app?.querySelector?.('.blocks-area.match-play-surface, .blocks-area');
    if (!dock) return null;

    const dockTop = dock.getBoundingClientRect().top;
    let top = area?.getBoundingClientRect?.().top || 0;
    if (hud && !hud.classList.contains('hidden')) {
      const hb = hud.getBoundingClientRect().bottom;
      if (Number.isFinite(hb) && hb > 0) top = hb;
    }
    const gap = Math.floor(dockTop - top);
    const width = Math.floor(
      area?.getBoundingClientRect?.().width
      || app?.getBoundingClientRect?.().width
      || window.innerWidth
    );
    if (gap < 60 || width < 60) return null;
    return { gap, width, top, dockTop };
  }

  function applyToRow(row, app) {
    if (!row || String(row.dataset.sylCount) !== '4') {
      clearStyle();
      return false;
    }
    const measured = measureGap(app || row.closest('#match-app') || document.getElementById('match-app'));
    if (!measured) return false;

    const h = Math.max(64, Math.floor(measured.gap * 0.97));
    const w = Math.max(64, Math.floor(measured.width * 0.97));

    const styleEl = ensureStyleEl();
    styleEl.textContent = `
#match-blocks.syllable-blocks-row[data-syl-count="4"],
.blocks-area .syllable-blocks-row[data-syl-count="4"] {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  grid-template-rows: 1fr 1fr !important;
  align-content: stretch !important;
  align-items: stretch !important;
  justify-content: stretch !important;
  justify-items: stretch !important;
  box-sizing: border-box !important;
  width: ${w}px !important;
  max-width: ${w}px !important;
  min-width: 0 !important;
  height: ${h}px !important;
  max-height: ${h}px !important;
  min-height: ${h}px !important;
  aspect-ratio: unset !important;
  padding: 4px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  gap: clamp(4px, 1.2vw, 8px) !important;
}
#match-blocks.syllable-blocks-row[data-syl-count="4"] > .syllable-block,
.blocks-area .syllable-blocks-row[data-syl-count="4"] > .syllable-block {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  min-width: 0 !important;
  min-height: 0 !important;
  aspect-ratio: unset !important;
  contain: none !important;
  padding: 2px !important;
}
#match-blocks.syllable-blocks-row[data-syl-count="4"] .syllable-grid,
.blocks-area .syllable-blocks-row[data-syl-count="4"] .syllable-grid {
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  aspect-ratio: unset !important;
}
body.match-turn-page .blocks-area:has(.syllable-blocks-row[data-syl-count="4"]),
body.match-race-page .blocks-area:has(.syllable-blocks-row[data-syl-count="4"]) {
  flex: 1 1 0 !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
  overflow: hidden !important;
}
`;

    row.dataset.fourBoardSynced = '1';
    return true;
  }

  function schedule(row, app) {
    const run = () => applyToRow(row, app);
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    setTimeout(run, 50);
    setTimeout(run, 200);
    setTimeout(run, 600);
  }

  global.FourLetterBoardLayout = {
    apply: applyToRow,
    schedule,
    clear: clearStyle,
    measureGap,
  };
})(typeof window !== 'undefined' ? window : globalThis);
