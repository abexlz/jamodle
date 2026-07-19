#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* dotenv optional until installed */
}

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const searchHandler = require('../api/dictionary/search');
const validateHandler = require('../api/dictionary/validate');
const ttsHandler = require('../api/tts/speak');

function withQuery(req, res, handler) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  req.query = Object.fromEntries(url.searchParams.entries());
  return handler(req, res);
}

function serveStatic(req, res) {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(WWW, pathname));
  if (!filePath.startsWith(WWW)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (url.pathname === '/api/dictionary/search') {
    const word = url.searchParams.get('word') || url.searchParams.get('q') || '';
    console.log(`[dictionary] search → ${word}`);
    return withQuery(req, res, searchHandler);
  }
  if (url.pathname === '/api/dictionary/validate') {
    const word = url.searchParams.get('word') || '';
    console.log(`[dictionary] validate → ${word}`);
    return withQuery(req, res, validateHandler);
  }
  if (url.pathname === '/api/tts/speak') {
    const text = url.searchParams.get('text') || url.searchParams.get('q') || '';
    console.log(`[tts] speak → ${text}`);
    return withQuery(req, res, ttsHandler);
  }

  // Common mistake: ngrok/open-from-disk URLs include /www/ but dev-server root is already www/
  if (url.pathname === '/www' || url.pathname.startsWith('/www/')) {
    const stripped = url.pathname.replace(/^\/www/, '') || '/';
    const target = stripped + (url.search || '');
    res.writeHead(302, { Location: target });
    return res.end();
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`자모들 dev server → http://localhost:${PORT}`);
  console.log(`Dictionary proxy ready (example: /api/dictionary/validate?word=고양이)`);
  if (!process.env.KOREAN_DICTIONARY_API_KEY) {
    console.warn('Warning: KOREAN_DICTIONARY_API_KEY is not set in .env');
  }
});
