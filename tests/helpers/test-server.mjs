import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.join(__dirname, '..', '..');

/** @returns {Promise<{ base: string, cleanup: () => void }>} */
export async function startTestApiServer() {
  const tmpDb = path.join(
    os.tmpdir(),
    `alter-ego-test-${crypto.randomUUID()}.db`
  );
  const port = 3100 + Math.floor(Math.random() * 900);
  const base = `http://127.0.0.1:${port}`;

  const proc = spawn('node', ['server/index.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: tmpDb,
      PUBLIC_APP_URL: 'http://localhost:5173',
      TOKEN_PEPPER: 'test-pepper-for-security-suite'
    },
    stdio: 'pipe'
  });

  const cleanup = () => {
    proc.kill();
    try {
      fs.unlinkSync(tmpDb);
    } catch {
      /* already removed */
    }
  };

  proc.stderr?.on('data', (chunk) => {
    const text = String(chunk);
    if (!text.includes('listening')) {
      console.error('[test-api]', text.trim());
    }
  });

  await waitForHealth(base, 8000);
  return { base, cleanup, port, dbPath: tmpDb };
}

async function waitForHealth(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`API did not become healthy at ${base}`);
}

/** @param {string} base */
export async function createTestCampaign(base, name = 'Security test campaign') {
  const res = await fetch(`${base}/api/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    throw new Error(`create campaign failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export function validCharacter(overrides = {}) {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    version: 1,
    identity: {
      characterName: 'Test Hero',
      level: 1,
      playerName: 'Alice',
      race: 'Human',
      class: 'Fighter'
    },
    meta: {},
    selections: {},
    abilities: {},
    sheet: {},
    ...overrides
  };
}

export const INJECTION_PAYLOADS = {
  sqlCampaignName: "'; DROP TABLE campaigns; --",
  sqlCharacterId: "1' OR '1'='1",
  sqlUnion: "' UNION SELECT id,name,gm_token_hash,player_token_hash,created_at FROM campaigns --",
  xssScript: '<script>alert("xss")</script>',
  xssImg: '<img src=x onerror=alert(1)>',
  xssQuote: '"><svg/onload=alert(1)>',
  pathTraversal: '../../../etc/passwd',
  nullByte: 'Hero\x00.json',
  prototypePollution: '{"__proto__":{"polluted":true}}'
};
