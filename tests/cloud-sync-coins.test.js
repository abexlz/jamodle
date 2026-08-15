/**
 * Cloud profile merge must keep a later coin spend instead of restoring the
 * higher remote balance (Word Chain hint debit).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
  console,
  Date,
  setTimeout,
  clearTimeout,
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    get length() { return Object.keys(this._data).length; },
    key(i) { return Object.keys(this._data)[i] || null; },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../www/js/cloud-sync-service.js'), 'utf8'),
  sandbox,
  { filename: 'cloud-sync-service.js' },
);

const { mergeBundles } = sandbox.CloudSyncService;
assert.ok(mergeBundles, 'CloudSyncService.mergeBundles should be exposed');

const PROFILE_KEY = 'jamodeul-user-profile';
const local = {
  version: 1,
  updatedAt: 2000,
  kv: {
    [PROFILE_KEY]: { coins: 85, coinsUpdatedAt: 2000, totalXp: 10 },
  },
};
const remote = {
  version: 1,
  updatedAt: 1000,
  kv: {
    [PROFILE_KEY]: { coins: 100, coinsUpdatedAt: 1000, totalXp: 10 },
  },
};

const merged = mergeBundles(local, remote);
assert.strictEqual(merged.kv[PROFILE_KEY].coins, 85, 'newer spend wins over stale higher balance');
assert.strictEqual(merged.kv[PROFILE_KEY].coinsUpdatedAt, 2000);

console.log('cloud-sync-coins.test.js: ok');
