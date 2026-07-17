#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;
const devServer = spawn(process.execPath, [path.join(__dirname, 'dev-server.js')], {
  stdio: 'inherit',
  env: process.env,
});

const ngrok = spawn('ngrok', ['http', String(PORT)], { stdio: 'inherit' });

ngrok.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error(`\nngrok not found. Install it from https://ngrok.com then run:\n  ngrok http ${PORT}\n`);
    console.error(`Dev server is running at http://localhost:${PORT}`);
  } else {
    console.error('\nngrok failed:', err.message);
  }
});

function shutdown() {
  devServer.kill('SIGTERM');
  ngrok.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

devServer.on('exit', (code) => {
  ngrok.kill('SIGTERM');
  process.exit(code ?? 0);
});
