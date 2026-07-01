/**
 * Internationalization — loads en.json / ko.json and provides t() + DOM updates.
 * Built-in messages (i18n-messages.js) ensure translations work without network fetch.
 */
(function (global) {
  'use strict';

  const LOCALE_KEY = 'jamodeul-locale';
  const BUILTIN = global.I18nMessages || { en: {}, ko: {} };
  const cache = {
    en: cloneMessages(BUILTIN.en),
    ko: cloneMessages(BUILTIN.ko),
  };
  let currentLocale = 'en';
  let messages = cache.en;
  const listeners = new Set();

  function cloneMessages(obj) {
    if (!obj || typeof obj !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return { ...obj };
    }
  }

  function localePath(locale) {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].getAttribute('src') || '';
      if (src.includes('i18n.js')) {
        return src.replace(/i18n\.js(?:\?.*)?$/, `i18n/${locale}.json`);
      }
    }
    return `js/i18n/${locale}.json`;
  }

  function getNested(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), obj);
  }

  function isI18nKey(str) {
    return typeof str === 'string' && /^[\w-]+(\.[\w-]+)+$/.test(str);
  }

  function interpolate(str, vars) {
    if (!vars || typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, varKey) => {
      const v = vars[varKey];
      return v != null ? String(v) : '';
    });
  }

  function lookup(locale, key, vars) {
    const bag = cache[locale] || BUILTIN[locale];
    const val = getNested(bag, key);
    if (typeof val === 'string') return interpolate(val, vars);
    return null;
  }

  async function loadLocaleFile(locale) {
    const next = locale === 'ko' ? 'ko' : 'en';
    if (cache[next] && Object.keys(cache[next]).length > 0) return cache[next];

    try {
      const res = await fetch(localePath(next));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        cache[next] = data;
        return cache[next];
      }
      throw new Error('Empty locale file');
    } catch (err) {
      console.warn(`[Jamodeul] Using built-in ${next} locale (${err.message || err})`);
      cache[next] = cloneMessages(BUILTIN[next] || {});
      return cache[next];
    }
  }

  async function setLocale(locale) {
    const next = locale === 'ko' ? 'ko' : 'en';
    await loadLocaleFile('en');
    messages = await loadLocaleFile(next);
    currentLocale = next;
    document.documentElement.lang = next === 'ko' ? 'ko' : 'en';
    applyToDocument();
    listeners.forEach((fn) => fn(next));
    return next;
  }

  function getLocale() {
    return currentLocale;
  }

  function t(key, vars) {
    if (key == null || key === '') return '';

    let text = lookup(currentLocale, key, vars);
    if (text != null) return text;

    if (currentLocale !== 'en') {
      text = lookup('en', key, vars);
      if (text != null) return text;
    }

    if (isI18nKey(key)) {
      console.warn(`[Jamodeul] Missing translation: ${key}`);
      return '';
    }
    return String(key);
  }

  function applyToDocument(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const text = t(key);
      if (text) el.textContent = text;
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = t(key);
      if (text) el.placeholder = text;
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      const text = t(key);
      if (text) el.setAttribute('aria-label', text);
    });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  async function init(preferredLocale) {
    let locale = preferredLocale;
    if (!locale) {
      const store = global.AppStorage;
      const prefs = store
        ? store.get('jamodeul-preferences', {})
        : (() => {
            try {
              return JSON.parse(localStorage.getItem('jamodeul-preferences') || '{}');
            } catch {
              return {};
            }
          })();
      locale = prefs.language || global.AppStorage?.getString?.(LOCALE_KEY) || localStorage.getItem(LOCALE_KEY);
    }
    if (locale !== 'ko' && locale !== 'en') locale = 'en';
    await setLocale(locale);
  }

  // Synchronous boot so t() works before async init/fetch completes
  messages = cache.en;

  global.I18n = {
    init,
    setLocale,
    getLocale,
    t,
    applyToDocument,
    onChange,
    loadLocaleFile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
