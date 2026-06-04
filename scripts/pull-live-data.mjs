#!/usr/bin/env node
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import SftpClient from 'ssh2-sftp-client';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(projectRoot, '.env.deploy.local');

function loadEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnvFile(envPath);
const sftp = new SftpClient();
await sftp.connect({
  host: env.DEPLOY_SSH_HOST,
  username: env.DEPLOY_USER,
  privateKey: readFileSync(env.SSH_KEY_PATH, 'utf8'),
  passphrase: env.SSH_KEY_PASSPHRASE || undefined
});

const remote = `${env.DEPLOY_PATH || 'public_html'}/data`;
const local = resolve(projectRoot, 'data');
mkdirSync(local, { recursive: true });

try {
  const list = await sftp.list(remote);
  for (const e of list) {
    if (e.type === 'd') continue;
    const dest = join(local, e.name);
    console.log(`Downloading ${e.name} (${e.size} bytes)`);
    await sftp.fastGet(`${remote}/${e.name}`, dest);
  }
} catch (err) {
  console.error('Remote data folder:', err.message);
}

await sftp.end();
console.log('Done.');
