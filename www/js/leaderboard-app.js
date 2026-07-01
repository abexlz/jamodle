/**
 * Leaderboard page bootstrap.
 */
(function (global) {
  'use strict';

  global.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(global.location.search);
    const initialGame = params.get('game') === 'match' ? 'match' : 'wordle';

    (async function init() {
      if (global.AppNav?.initPage) {
        await global.AppNav.initPage({ topNav: false });
      }
      global.I18n?.applyToDocument?.(document.getElementById('leaderboard-page'));
      global.FirebaseSocial?.initLeaderboardPage?.({ initialGame });
    })();
  });
})(typeof window !== 'undefined' ? window : globalThis);
