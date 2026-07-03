#!/usr/bin/env node
/**
 * Fail if Git tracks compendium databases or sync-from-live artifacts.
 * Run: npm run check:legal
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function gitLsFiles() {
  try {
    return execSync('git ls-files', { cwd: projectRoot, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    console.warn('check-no-db-tracked: not a git repository — skipping');
    process.exit(0);
  }
}

const blocked = [];
const patterns = [
  /\.db$/i,
  /\.db-wal$/i,
  /\.db-shm$/i,
  /^sync-from-live\//,
  /^data\/import-cache\//,
  /^data\/iws-mx\//,
];

for (const file of gitLsFiles()) {
  const normalized = file.replace(/\\/g, '/');
  if (patterns.some((re) => re.test(normalized))) {
    blocked.push(normalized);
  }
}

if (blocked.length > 0) {
  console.error('check-no-db-tracked: tracked files must not include compendium DBs or live mirrors:\n');
  for (const f of blocked) {
    console.error(`  - ${f}`);
  }
  console.error('\nSee doc/data.md. Remove from the index with git rm --cached <path>.');
  process.exit(1);
}

console.log('check-no-db-tracked: OK (no tracked .db or sync-from-live files)');
