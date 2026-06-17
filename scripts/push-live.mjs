#!/usr/bin/env node
/**
 * Upload dist/app to the live site via SFTP using .env.deploy.local (gitignored).
 * Maps Vite output to production layout: app pages under src/, data/metadata at web root.
 *
 * Usage: node scripts/push-live.mjs
 */
import {
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
  writeFileSync,
  mkdirSync
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import SftpClient from 'ssh2-sftp-client';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(projectRoot, '.env.deploy.local');
const buildDir = resolve(projectRoot, 'dist/app');

const APP_SEGMENTS = [
  'editor',
  'game',
  'gm',
  'join',
  'launcher',
  'player',
  'playlist',
  'sheet',
  'compendium'
];

const SRC_ROOT_FILES = ['index.html', 'levels.html', 'dimensions.json'];

function loadEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

async function uploadDir(sftp, localDir, remoteDir) {
  mkdirSync(localDir, { recursive: true });
  await sftp.mkdir(remoteDir, true);
  for (const name of readdirSync(localDir)) {
    const localPath = join(localDir, name);
    const remotePath = `${remoteDir}/${name}`.replace(/\\/g, '/');
    if (statSync(localPath).isDirectory()) {
      await uploadDir(sftp, localPath, remotePath);
    } else {
      await sftp.fastPut(localPath, remotePath);
      const kb = Math.round(statSync(localPath).size / 1024);
      console.log(`  ${remotePath} (${kb} KB)`);
    }
  }
}

async function uploadIfExists(sftp, localPath, remotePath) {
  if (!existsSync(localPath)) return false;
  const remoteDir = remotePath.replace(/\/[^/]+$/, '');
  await sftp.mkdir(remoteDir, true);
  await sftp.fastPut(localPath, remotePath);
  const kb = Math.round(statSync(localPath).size / 1024);
  console.log(`  ${remotePath} (${kb} KB)`);
  return true;
}

async function main() {
  const skipData = process.argv.includes('--skip-data');
  if (!existsSync(envPath)) {
    console.error('Missing .env.deploy.local');
    process.exit(1);
  }
  if (!existsSync(buildDir)) {
    console.error('Missing dist/app — run npm run build:app first.');
    process.exit(1);
  }

  const dbPath = resolve(buildDir, 'data/alter_eger.db');
  if (!existsSync(dbPath)) {
    console.error('Missing dist/app/data/alter_eger.db — full compendium DB required.');
    process.exit(1);
  }

  const env = loadEnvFile(envPath);
  const host = env.DEPLOY_SSH_HOST;
  const user = env.DEPLOY_USER;
  const remoteRoot = (env.DEPLOY_PATH || 'public_html').replace(/\/+$/, '');
  const keyPath = env.SSH_KEY_PATH;
  const passphrase = env.SSH_KEY_PASSPHRASE;
  const publicUrl = env.DEPLOY_PUBLIC_URL || 'https://www.braincell.online';

  if (!host || !user || !keyPath) {
    console.error('.env.deploy.local is incomplete (host, user, key path).');
    process.exit(1);
  }

  const dbMb = (statSync(dbPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[push-live] Compendium DB: ${dbMb} MB`);

  const manifest = {
    builtAt: new Date().toISOString(),
    publicUrl,
    hasCompendiumDb: true
  };
  const manifestLocal = resolve(tmpdir(), `alter-ego-deploy-manifest-${Date.now()}.json`);
  writeFileSync(manifestLocal, `${JSON.stringify(manifest, null, 2)}\n`);

  const sftp = new SftpClient();
  console.log(`[push-live] Connecting to ${user}@${host} …`);
  await sftp.connect({
    host,
    username: user,
    privateKey: readFileSync(keyPath, 'utf8'),
    passphrase: passphrase || undefined
  });

  try {
    console.log('[push-live] Uploading app pages → src/ …');
    for (const seg of APP_SEGMENTS) {
      const local = resolve(buildDir, seg);
      if (!existsSync(local)) continue;
      await uploadDir(sftp, local, `${remoteRoot}/src/${seg}`);
    }

    console.log('[push-live] Uploading src root files …');
    for (const name of SRC_ROOT_FILES) {
      await uploadIfExists(sftp, resolve(buildDir, name), `${remoteRoot}/src/${name}`);
    }

    console.log('[push-live] Uploading assets …');
    await uploadDir(sftp, resolve(buildDir, 'assets'), `${remoteRoot}/assets`);

    const favicon = resolve(buildDir, 'assets/favicon.png');
    if (existsSync(favicon)) {
      console.log('[push-live] Uploading favicon for src-relative paths …');
      await uploadIfExists(sftp, favicon, `${remoteRoot}/src/assets/favicon.png`);
    }

    console.log('[push-live] Uploading data/ (full compendium DB) …');
    if (skipData) {
      console.log('[push-live] Skipping data/ (--skip-data)');
    } else {
      await uploadDir(sftp, resolve(buildDir, 'data'), `${remoteRoot}/data`);
    }

    console.log('[push-live] Uploading metadata/ …');
    await uploadDir(sftp, resolve(buildDir, 'metadata'), `${remoteRoot}/metadata`);

    const partyDir = resolve(buildDir, 'party');
    if (existsSync(partyDir)) {
      console.log('[push-live] Uploading party/ …');
      await uploadDir(sftp, partyDir, `${remoteRoot}/party`);
    }

    console.log('[push-live] Uploading deploy-manifest.json …');
    await uploadIfExists(sftp, manifestLocal, `${remoteRoot}/deploy-manifest.json`);

    const htaccess = resolve(projectRoot, 'deploy/.htaccess');
    if (existsSync(htaccess)) {
      console.log('[push-live] Uploading .htaccess …');
      await uploadIfExists(sftp, htaccess, `${remoteRoot}/.htaccess`);
    }
  } finally {
    await sftp.end();
  }

  console.log(`[push-live] Done. ${publicUrl}/src/launcher/`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
