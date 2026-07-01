/**
 * Cosmetic color themes — swaps palette CSS variables on load / selection.
 */
(function (global) {
  'use strict';

  const PROFILE_KEY = 'jamodeul-user-profile';

  function readStoredThemeId() {
    try {
      if (global.AppStorage) {
        const raw = global.AppStorage.get(PROFILE_KEY, null);
        if (raw?.selectedCosmeticTheme) return raw.selectedCosmeticTheme;
      }
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.selectedCosmeticTheme || 'default';
      }
    } catch { /* ignore */ }
    return 'default';
  }

  function apply(themeId) {
    const id = themeId || 'default';
    const root = document.documentElement;
    if (!id || id === 'default') {
      root.removeAttribute('data-cosmetic-theme');
    } else {
      root.setAttribute('data-cosmetic-theme', id);
    }
  }

  function applyStored() {
    apply(readStoredThemeId());
  }

  function getAvailableThemes(inventory) {
    const owned = new Set(['default', ...(inventory?.ownedThemes || [])]);
    return ['default', 'cherry', 'deep-sea', 'dark-hanji'].filter((id) => owned.has(id));
  }

  global.CosmeticThemes = {
    apply,
    applyStored,
    getAvailableThemes,
    readStoredThemeId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
