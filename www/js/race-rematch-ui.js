/**
 * Rematch on 1v1 battle results — both players tap Rematch (1/2 → 2/2) to start the next match.
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  let active = null;

  function getBtn(root) {
    return root?.querySelector?.('#race-rematch') || null;
  }

  function rematchLabel(state, t) {
    if (state.count > 0) return t('rematchProgress', { ready: state.count });
    return t('rematch');
  }

  function effectiveLobbyState(ctx, state) {
    if (!ctx.pendingReady) return state;
    return {
      ...state,
      myReady: state.myReady || true,
      count: Math.max(state.count, 1),
    };
  }

  function applyButton(btn, state, t) {
    if (!btn) return;
    const disabled = state.opponentLeft || state.redirecting || state.myReady || state.busy;
    btn.disabled = disabled;
    btn.classList.toggle('race-btn--rematch-muted', disabled);
    btn.classList.toggle('race-btn--rematch-waiting', !disabled && state.busy);
    btn.textContent = rematchLabel(state, t);
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
    if (state.opponentLeft || !state.bothPresent || !state.bothReady) return;

    ctx.busy = true;
    applyButton(getBtn(ctx.root), { ...state, busy: true, redirecting: false }, ctx.t);

    const claimed = await RS().claimRematchCreation(ctx.matchId, ctx.myUid);
    if (!claimed) {
      ctx.busy = false;
      sync(ctx);
      return;
    }

    try {
      const oppUid = RS().getOpponent(data, ctx.myUid)?.uid;
      if (!oppUid) throw new Error('no-opponent');
      const newId = await ctx.createRematch(oppUid, data, ctx.matchId);
      const published = await RS().publishRematchMatchId(ctx.matchId, newId);
      if (!published) throw new Error('publish-failed');
      redirect(ctx, newId);
    } catch {
      await RS().releaseRematchClaim(ctx.matchId);
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

    ctx.pendingReady = true;
    ctx.busy = true;
    applyButton(getBtn(ctx.root), effectiveLobbyState(ctx, {
      ...state,
      busy: true,
      redirecting: false,
    }), ctx.t);

    try {
      await RS().setRematchReady(ctx.matchId, ctx.myUid);
    } catch {
      ctx.pendingReady = false;
      alert(ctx.t('rematchFailed'));
    } finally {
      if (!ctx.redirecting) {
        ctx.busy = false;
        sync(ctx);
      }
    }
  }

  function sync(ctx) {
    if (!ctx) return;
    const data = ctx.getMatchData?.();
    if (!data || data.status !== 'done') return;

    const state = effectiveLobbyState(ctx, RS().getRematchLobbyState(data, ctx.myUid));
    if (state.myReady) ctx.pendingReady = false;
    if (state.rematchMatchId) {
      redirect(ctx, state.rematchMatchId);
      return;
    }

    applyButton(getBtn(ctx.root), {
      ...state,
      busy: ctx.busy,
      redirecting: ctx.redirecting,
    }, ctx.t);

    if (state.bothReady && state.bothPresent && !state.opponentLeft && !ctx.busy && !ctx.redirecting) {
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
      pendingReady: false,
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
