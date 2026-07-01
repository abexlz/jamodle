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
};

const searchHandler = require('../api/dictionary/search');
const validateHandler = require('../api/dictionary/validate');

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
    return withQuery(req, res, searchHandler);
  }
  if (url.pathname === '/api/dictionary/validate') {
    return withQuery(req, res, validateHandler);
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`자모들 dev server → http://localhost:${PORT}`);
  console.log(`Dictionary API → http://localhost:${PORT}/api/dictionary/search?word=고양이`);
  if (!process.env.KOREAN_DICTIONARY_API_KEY) {
    console.warn('Warning: KOREAN_DICTIONARY_API_KEY is not set in .env');
  }
});
