#!/usr/bin/env node
/**
 * Copy static assets into dist/app so fetch paths (../../metadata, ../../data) work
 * when dist/app is served as the site root.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(projectRoot, 'dist/app');

function copyIntoApp(from, toRel) {
  const dest = resolve(appDir, toRel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(from, dest, { recursive: true });
}

mkdirSync(appDir, { recursive: true });

copyIntoApp(resolve(projectRoot, 'metadata'), 'metadata');

mkdirSync(resolve(appDir, 'data'), { recursive: true });
copyIntoApp(resolve(projectRoot, 'data/samples'), 'data/samples');

const db = resolve(projectRoot, 'data/alter_ego.db');
if (existsSync(db)) {
  cpSync(db, resolve(appDir, 'data/alter_ego.db'));
}

cpSync(resolve(projectRoot, 'dimensions.json'), resolve(appDir, 'dimensions.json'));
copyIntoApp(resolve(projectRoot, 'src/party'), 'party');

const favicon = resolve(projectRoot, 'src/assets/favicon.png');
if (existsSync(favicon)) {
  mkdirSync(resolve(appDir, 'assets'), { recursive: true });
  cpSync(favicon, resolve(appDir, 'assets/favicon.png'));
}

console.log('[post-build-app] Static assets copied into dist/app');
