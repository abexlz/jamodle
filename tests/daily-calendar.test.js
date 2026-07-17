/**
 * Unit tests for Daily Match calendar service.
 * Run: node tests/daily-calendar.test.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const store = new Map();

const sandbox = {
  globalThis: {},
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] || null,
  },
  Date,
  Intl,
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js/match-daily.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js/daily-calendar-service.js'), 'utf8'), sandbox);

const MD = sandbox.globalThis.MatchDaily;
const DCS = sandbox.globalThis.DailyCalendarService;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) passed += 1;
  else { failed += 1; console.error('FAIL:', message); }
}

function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}

const TODAY = '2026-06-30';
const origToday = MD.getTodayKey;
MD.getTodayKey = () => TODAY;
DCS.getTodayKey = () => TODAY;

assert(DCS.isValidDateKey('2026-06-15'), 'valid date key');
assert(!DCS.isValidDateKey('2026-13-01'), 'invalid month');
assertEqual(DCS.compareDateKeys('2026-06-01', TODAY), -1, 'past compare');
assert(DCS.isToday(TODAY), 'is today');
assert(DCS.isPastDate('2026-06-15'), 'is past');
assert(DCS.isFutureDate('2026-07-01'), 'is future');

assert(DCS.canPlayDate(TODAY), 'today playable free');
assert(!DCS.canPlayDate('2026-06-15'), 'past locked initially');
assertEqual(DCS.getPlayCost(TODAY), 0, 'today cost 0');
assertEqual(DCS.getPlayCost('2026-06-15'), DCS.PAST_DAY_COST, 'past cost');

const unlocked = DCS.unlockWithAd('2026-06-15');
assert(unlocked.ok, 'ad unlock ok');
assert(DCS.canPlayDate('2026-06-15'), 'past playable after unlock');

store.set('jamodeul-match-daily-2026-06-01', JSON.stringify({ over: true, won: true, guessCount: 3 }));
store.set('jamodeul-match-daily-2026-06-02', JSON.stringify({ over: true, won: true, guessCount: 2 }));
store.set('jamodeul-match-daily-2026-06-03', JSON.stringify({ over: true, won: true, guessCount: 4 }));

assertEqual(DCS.getMonthWinCount(2026, 6), 3, 'month win count');

sandbox.globalThis.AppStorage = {
  getPrefixed(prefix) {
    return [...store.keys()].filter((k) => k.startsWith(prefix));
  },
  get(key, fallback) {
    const raw = store.get(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) {
    store.set(key, JSON.stringify(value));
    return true;
  },
};
vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js/daily-calendar-service.js'), 'utf8'), sandbox);
const DCS2 = sandbox.globalThis.DailyCalendarService;
DCS2.getTodayKey = () => TODAY;
assertEqual(DCS2.getMonthWinCount(2026, 6), 3, 'month win count via AppStorage');
const badges = DCS2.onDailyWin('2026-06-03');
assert(badges.length >= 1 && badges[0].threshold === 3, 'bronze badge on 3 wins');

assertEqual(DCS.buildPlayUrl('2026-06-15'), 'match.html?daily=1&date=2026-06-15', 'play url');

const cells = DCS.getCalendarDays(2026, 6);
assert(cells.filter(Boolean).length === 30, 'june has 30 day cells');

const clamped = DCS.clampMonth(2026, 7);
assertEqual(clamped.month, 6, 'cannot view future month');

MD.getTodayKey = origToday;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
