#!/usr/bin/env node
/**
 * Run Vite dev server (5173) and campaign API (3000) together.
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const api = spawn('node', ['server/index.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: process.env.PORT || '3000',
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || 'http://localhost:5173'
  },
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

const vite = spawn('npm', ['run', 'dev:src'], {
  cwd: root,
  stdio: 'inherit',
  shell: true
});

function shutdown() {
  api.kill();
  vite.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

api.on('exit', (code) => {
  if (code && code !== 0) shutdown();
});
vite.on('exit', (code) => {
  if (code && code !== 0) shutdown();
});
