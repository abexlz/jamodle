/**
 * Central user preferences — persisted in localStorage.
 */
(function (global) {
  'use strict';

  const PREFS_KEY = 'jamodeul-preferences';
  const LEGACY_THEME_KEY = 'jamodeul-theme';
  const APP_VERSION = '1.0.0';
  const CACHE_STAMP = '20260706n';

  const DEFAULTS = {
    language: 'en',
    theme: 'system',
    reduceMotion: false,
    soundEffects: true,
    pronunciation: true,
    volume: 0.85,
    showEnglishMeanings: true,
    showKoreanSupport: true,
    pronunciationButton: true,
    beginnerHints: true,
    learningLevel: 'beginner',
    highContrast: false,
    largeText: false,
    tapToPlace: false,
    turnHistoryView: 'arrows',
    turnAutofillCorrect: true,
    devMode: false,
    devAccessUnlocked: false,
    devFontPack: 'junegull',
  };

  let prefs = { ...DEFAULTS };
  const listeners = new Set();

  function load() {
    const store = global.AppStorage;
    let parsed = store ? store.get(PREFS_KEY, null) : null;
    if (parsed == null) {
      try {
        const raw = localStorage.getItem(PREFS_KEY);
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
    }
    if (parsed && typeof parsed === 'object') {
      prefs = { ...DEFAULTS, ...parsed };
    } else {
      prefs = { ...DEFAULTS };
      const legacyTheme = store
        ? store.getString(LEGACY_THEME_KEY)
        : localStorage.getItem(LEGACY_THEME_KEY);
      if (legacyTheme === 'light' || legacyTheme === 'dark') {
        prefs.theme = legacyTheme;
      }
    }
    return { ...prefs };
  }

  function save(next) {
    prefs = { ...prefs, ...next };
    const saved = global.AppStorage
      ? global.AppStorage.set(PREFS_KEY, prefs)
      : (() => {
          try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
            return true;
          } catch {
            return false;
          }
        })();
    if (saved && (prefs.theme === 'light' || prefs.theme === 'dark')) {
      if (global.AppStorage) {
        global.AppStorage.setString(LEGACY_THEME_KEY, prefs.theme);
      } else {
        try {
          localStorage.setItem(LEGACY_THEME_KEY, prefs.theme);
        } catch {}
      }
    }
    applyAll();
    listeners.forEach((fn) => fn(get()));
    return get();
  }

  function get() {
    return { ...prefs };
  }

  function resolveTheme() {
    if (prefs.theme === 'dark' || prefs.theme === 'light') return prefs.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    const resolved = resolveTheme();
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'dark' ? '#1A1D28' : '#FFF8F5';
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent = resolved === 'dark' ? '☀️' : '🌙';
      const label = global.I18n?.t?.('common.themeToggle') || 'Toggle theme';
      btn.setAttribute('aria-label', label);
    }
  }

  function applyAccessibility() {
    const html = document.documentElement;
    html.classList.toggle('reduce-motion', !!prefs.reduceMotion);
    html.classList.toggle('high-contrast', !!prefs.highContrast);
    html.classList.toggle('large-text', !!prefs.largeText);
    html.classList.toggle('tap-to-place', !!prefs.tapToPlace);
  }

  function applyFontPack() {
    const pack = prefs.devFontPack === 'jua' ? 'jua' : 'junegull';
    document.documentElement.setAttribute('data-font-pack', pack);
  }

  function applyAll() {
    applyTheme();
    applyAccessibility();
    applyFontPack();
    if (global.I18n && prefs.language !== global.I18n.getLocale()) {
      global.I18n.setLocale(prefs.language);
    }
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /** Play pronunciation if enabled — never autoplay without user action */
  function speakKorean(text) {
    if (!prefs.pronunciation || !text) return;
    if (global.KoreanTTS?.speak) {
      global.KoreanTTS.speak(text, { repeats: 1 });
      return;
    }
    if (!global.speechSynthesis) return;
    global.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.78;
    u.volume = Math.max(0, Math.min(1, prefs.volume));
    global.speechSynthesis.speak(u);
  }

  function shouldReduceMotion() {
    return !!prefs.reduceMotion;
  }

  function shouldShowEnglish() {
    return prefs.showEnglishMeanings !== false;
  }

  function shouldShowKoreanSupport() {
    return prefs.showKoreanSupport !== false;
  }

  function shouldShowPronunciationButton() {
    return prefs.pronunciationButton !== false;
  }

  function shouldUseTapToPlace() {
    return !!prefs.tapToPlace;
  }

  function getLearningLevel() {
    return prefs.learningLevel || 'beginner';
  }

  function getTurnHistoryView() {
    const v = prefs.turnHistoryView;
    if (v === 'scroll' || v === 'grid') return 'scroll';
    return 'arrows';
  }

  function shouldTurnAutofillCorrect() {
    return prefs.turnAutofillCorrect !== false;
  }

  load();
  applyAccessibility();
  applyFontPack();

  if (global.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (prefs.theme === 'system') applyTheme();
    });
  }

  global.UserPreferences = {
    DEFAULTS,
    APP_VERSION,
    CACHE_STAMP,
    PREFS_KEY,
    load,
    save,
    get,
    applyTheme,
    applyAccessibility,
    applyFontPack,
    applyAll,
    onChange,
    speakKorean,
    shouldReduceMotion,
    shouldShowEnglish,
    shouldShowKoreanSupport,
    shouldShowPronunciationButton,
    shouldUseTapToPlace,
    getLearningLevel,
    getTurnHistoryView,
    shouldTurnAutofillCorrect,
    resolveTheme,
  };
})(typeof window !== 'undefined' ? window : globalThis);
