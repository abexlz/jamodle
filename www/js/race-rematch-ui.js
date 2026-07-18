/**
 * Instant rematch on 1v1 battle results — one tap starts the next match for both players.
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  let active = null;

  function getBtn(root) {
    return root?.querySelector?.('#race-rematch') || null;
  }

  function applyButton(btn, state, t) {
    if (!btn) return;
    const disabled = state.opponentLeft || state.busy || state.redirecting;
    btn.disabled = disabled;
    btn.classList.toggle('race-btn--rematch-muted', disabled);
    btn.classList.toggle('race-btn--rematch-waiting', !disabled && state.busy);
    btn.textContent = t('rematch');
  }

  function redirect(ctx, matchId) {
    if (ctx.redirecting || !matchId) return;
    ctx.redirecting = true;
    const href = ctx.getMatchPageUrl?.(matchId);
    if (href) global.location.href = href;
  }

  async function tryFinalizeRematch(ctx) {
    if (ctx.busy || ctx.redirecting) return;
    const data = ctx.getMatchData?.();
    if (!data || data.status !== 'done') return;

    const state = RS().getRematchLobbyState(data, ctx.myUid);
    if (state.rematchMatchId) {
      redirect(ctx, state.rematchMatchId);
      return;
    }
    if (state.opponentLeft || !state.bothPresent || !state.myReady) return;

    const claimed = await RS().claimRematchCreation(ctx.matchId, ctx.myUid);
    if (!claimed) return;

    ctx.busy = true;
    applyButton(getBtn(ctx.root), { ...state, busy: true, redirecting: false }, ctx.t);

    try {
      const oppUid = RS().getOpponent(data, ctx.myUid)?.uid;
      if (!oppUid) return;
      const newId = await ctx.createRematch(oppUid, data, ctx.matchId);
      await RS().publishRematchMatchId(ctx.matchId, newId);
      redirect(ctx, newId);
    } catch {
      alert(ctx.t('rematchFailed'));
      ctx.busy = false;
      sync(ctx);
    }
  }

  async function onRematchClick(ctx) {
    const data = ctx.getMatchData?.();
    if (!data || data.status !== 'done' || ctx.busy || ctx.redirecting) return;

    const state = RS().getRematchLobbyState(data, ctx.myUid);
    if (state.opponentLeft || state.myReady) return;

    ctx.busy = true;
    applyButton(getBtn(ctx.root), { ...state, busy: true, redirecting: false }, ctx.t);

    try {
      await RS().setRematchReady(ctx.matchId, ctx.myUid);
      await tryFinalizeRematch(ctx);
    } catch {
      alert(ctx.t('rematchFailed'));
    } finally {
      ctx.busy = false;
      sync(ctx);
    }
  }

  function sync(ctx) {
    if (!ctx) return;
    const data = ctx.getMatchData?.();
    if (!data || data.status !== 'done') return;

    const state = RS().getRematchLobbyState(data, ctx.myUid);
    if (state.rematchMatchId) {
      redirect(ctx, state.rematchMatchId);
      return;
    }

    applyButton(getBtn(ctx.root), {
      ...state,
      busy: ctx.busy,
      redirecting: ctx.redirecting,
    }, ctx.t);

    if (state.myReady && state.bothPresent && !state.opponentLeft && !ctx.busy && !ctx.redirecting) {
      tryFinalizeRematch(ctx);
    }
  }

  function markLeft(ctx) {
    if (!ctx || ctx._leftResults) return;
    ctx._leftResults = true;
    RS().setResultsPresent(ctx.matchId, ctx.myUid, false).catch(() => {});
  }

  function teardown() {
    if (!active) return;
    markLeft(active);
    const btn = getBtn(active.root);
    if (btn && active._clickHandler) {
      btn.removeEventListener('click', active._clickHandler);
    }
    active.root?.querySelectorAll?.('.race-btn--home')?.forEach((el) => {
      if (active._homeHandler) el.removeEventListener('click', active._homeHandler, true);
    });
    const backLink = active.root?.closest?.('.race-app')?.querySelector?.('.race-back')
      || active.root?.querySelector?.('.race-back');
    if (backLink && active._backHandler) {
      backLink.removeEventListener('click', active._backHandler, true);
    }
  }

  function mount(ctx) {
    teardown();
    active = {
      ...ctx,
      busy: false,
      redirecting: false,
      _leftResults: false,
    };

    RS().setResultsPresent(ctx.matchId, ctx.myUid, true).catch(() => {});

    const btn = getBtn(ctx.root);
    if (btn) {
      active._clickHandler = (e) => {
        e.preventDefault();
        onRematchClick(active);
      };
      btn.addEventListener('click', active._clickHandler);
    }

    active.root?.querySelectorAll?.('.race-btn--home')?.forEach((el) => {
      active._homeHandler = () => markLeft(active);
      el.addEventListener('click', active._homeHandler, true);
    });

    const backLink = active.root?.closest?.('.race-app')?.querySelector?.('.race-back')
      || active.root?.querySelector?.('.race-back');
    if (backLink) {
      active._backHandler = () => markLeft(active);
      backLink.addEventListener('click', active._backHandler, true);
    }

    sync(active);
  }

  global.RaceRematchUI = {
    mount,
    sync: (ctx) => sync(ctx || active),
    teardown,
  };
})(typeof window !== 'undefined' ? window : globalThis);
