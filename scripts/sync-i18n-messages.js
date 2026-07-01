#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const i18nDir = path.join(__dirname, '..', 'www', 'js', 'i18n');
const outFile = path.join(__dirname, '..', 'www', 'js', 'i18n-messages.js');

const en = JSON.parse(fs.readFileSync(path.join(i18nDir, 'en.json'), 'utf8'));
const ko = JSON.parse(fs.readFileSync(path.join(i18nDir, 'ko.json'), 'utf8'));

const body = `// Auto-synced from js/i18n/en.json and ko.json — run: npm run sync-i18n
(function (global) {
  'use strict';
  global.I18nMessages = ${JSON.stringify({ en, ko }, null, 2)};
})(typeof window !== 'undefined' ? window : globalThis);
`;

fs.writeFileSync(outFile, body, 'utf8');
console.log('Wrote', outFile);
