/**
 * Dev build detection — localhost / explicit ?dev=1 flag / settings unlock.
 */
(function (global) {
  'use strict';

  function isDevBuild() {
    try {
      if (global.location?.search?.includes('dev=1')) return true;
      const host = global.location?.hostname || '';
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch {
      return false;
    }
  }

  function hasDevAccess() {
    if (isDevBuild()) return true;
    try {
      const prefs = global.UserPreferences?.get?.();
      return !!prefs?.devAccessUnlocked;
    } catch {
      return false;
    }
  }

  global.DevBuild = { isDevBuild, hasDevAccess };
})(typeof window !== 'undefined' ? window : globalThis);
