#!/usr/bin/env node
/**
 * Download live site from helloly via SFTP using .env.deploy.local (gitignored).
 * Usage: node scripts/pull-live.mjs
 */
import { readFileSync, mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import SftpClient from 'ssh2-sftp-client';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(projectRoot, '.env.deploy.local');
const outDir = resolve(projectRoot, 'sync-from-live');

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

async function downloadDir(sftp, remoteDir, localDir) {
  mkdirSync(localDir, { recursive: true });
  const entries = await sftp.list(remoteDir);
  for (const entry of entries) {
    const remotePath = `${remoteDir}/${entry.name}`.replace(/\/+/g, '/');
    const localPath = join(localDir, entry.name);
    if (entry.name === '.' || entry.name === '..') continue;
    if (entry.type === 'd') {
      await downloadDir(sftp, remotePath, localPath);
    } else {
      await sftp.fastGet(remotePath, localPath);
      process.stdout.write(`.\n`);
    }
  }
}

async function main() {
  if (!existsSync(envPath)) {
    console.error('Missing .env.deploy.local');
    process.exit(1);
  }
  const env = loadEnvFile(envPath);
  const host = env.DEPLOY_SSH_HOST;
  const user = env.DEPLOY_USER;
  const remotePath = env.DEPLOY_PATH || 'public_html';
  const keyPath = env.SSH_KEY_PATH;
  const passphrase = env.SSH_KEY_PASSPHRASE;

  if (!host || !user || !keyPath) {
    console.error('.env.deploy.local is incomplete (host, user, key path).');
    process.exit(1);
  }

  const sftp = new SftpClient();
  console.log(`Connecting to ${user}@${host} …`);
  await sftp.connect({
    host,
    username: user,
    privateKey: readFileSync(keyPath, 'utf8'),
    passphrase: passphrase || undefined
  });

  console.log(`Downloading /${remotePath} → ${outDir}`);
  mkdirSync(outDir, { recursive: true });
  await downloadDir(sftp, remotePath, outDir);
  await sftp.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
