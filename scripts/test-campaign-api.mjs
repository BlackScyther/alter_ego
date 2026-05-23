import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const proc = spawn('node', ['server/index.mjs'], {
  cwd: root,
  env: { ...process.env, PUBLIC_APP_URL: 'http://localhost:5173', PORT: '3099' },
  stdio: 'pipe'
});

await new Promise((r) => setTimeout(r, 1500));

const base = 'http://localhost:3099';

const health = await fetch(`${base}/api/health`).then((r) => r.json());
console.log('health', health);

const created = await fetch(`${base}/api/campaigns`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Test table' })
}).then((r) => r.json());
console.log('created', created.campaignId ? 'ok' : created);

const char = {
  id: '11111111-1111-1111-1111-111111111111',
  version: 1,
  identity: { characterName: 'Test Hero', level: 1, playerName: 'Alice' },
  meta: {},
  selections: {},
  abilities: { baseScores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 }, scores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 }, bonuses: [] },
  sheet: { hp: { max: 30, current: 30 } }
};

const put = await fetch(
  `${base}/api/campaigns/${created.campaignId}/characters/${char.id}`,
  {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${created.playerToken}`
    },
    body: JSON.stringify(char)
  }
).then((r) => r.json());
console.log('put', put.ok ? 'ok' : put);

const list = await fetch(`${base}/api/campaigns/${created.campaignId}/characters`, {
  headers: { Authorization: `Bearer ${created.gmToken}` }
}).then((r) => r.json());
console.log('list count', list.characters?.length);

const enc = await fetch(`${base}/api/campaigns/${created.campaignId}/encounters`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${created.gmToken}`
  },
  body: JSON.stringify({ name: 'Goblin ambush' })
}).then((r) => r.json());
console.log('encounter', enc.id ? 'ok' : enc);

const spawnMonster = await fetch(
  `${base}/api/campaigns/${created.campaignId}/encounters/${enc.id}/actors`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${created.gmToken}`
    },
    body: JSON.stringify({
      source: 'compendium',
      category: 'monster',
      entryId: 'monster_goblin_cutthroat'
    })
  }
).then((r) => r.json());
console.log('spawn monster', spawnMonster.actorId ? 'ok' : spawnMonster);

const spawnParty = await fetch(
  `${base}/api/campaigns/${created.campaignId}/encounters/${enc.id}/actors`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${created.gmToken}`
    },
    body: JSON.stringify({
      source: 'party',
      characterId: char.id,
      mode: 'link'
    })
  }
).then((r) => r.json());
console.log('spawn party link', spawnParty.actorId ? 'ok' : spawnParty);

const dup = await fetch(
  `${base}/api/campaigns/${created.campaignId}/encounters/${enc.id}/actors`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${created.gmToken}`
    },
    body: JSON.stringify({
      source: 'duplicate',
      actorId: spawnMonster.actorId
    })
  }
).then((r) => r.json());
console.log('duplicate', dup.actorId ? 'ok' : dup);

const getEnc = await fetch(
  `${base}/api/campaigns/${created.campaignId}/encounters/${enc.id}`,
  { headers: { Authorization: `Bearer ${created.gmToken}` } }
).then((r) => r.json());
console.log('encounter actors', getEnc.actors?.length);

const putLinked = await fetch(
  `${base}/api/campaigns/${created.campaignId}/encounters/${enc.id}/actors/${spawnParty.actorId}`,
  {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${created.gmToken}`
    },
    body: JSON.stringify({ ...spawnParty.character, identity: { characterName: 'Hack' } })
  }
);
console.log('linked put blocked', putLinked.status === 403 ? 'ok' : putLinked.status);

proc.kill();
console.log('done');
