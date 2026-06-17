import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApiServer, createTestCampaign, validCharacter } from './helpers/test-server.mjs';

describe('encounter rewards API', () => {
  /** @type {{ base: string, cleanup: () => void } | null} */
  let server = null;
  /** @type {{ campaignId: string, gmToken: string, playerToken: string }} */
  let created;

  after(() => {
    server?.cleanup();
  });

  it('setup server and campaign', async () => {
    server = await startTestApiServer();
    created = await createTestCampaign(server.base, 'Rewards test');
    assert.ok(created.campaignId);
  });

  it('GM can apply XP and gold rewards', async () => {
    const char = validCharacter({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      identity: { characterName: 'Reward Hero', level: 1, playerName: 'Bob', totalXp: 0 },
      sheet: { treasure: { goldGp: 10 } }
    });

    const put = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/${char.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.playerToken}`
        },
        body: JSON.stringify(char)
      }
    );
    assert.equal(put.status, 200);

    const reward = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/${char.id}/rewards`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.gmToken}`
        },
        body: JSON.stringify({ xp: 100, goldGp: 25 })
      }
    );
    assert.equal(reward.status, 200);
    const body = await reward.json();
    assert.equal(body.character.identity.totalXp, 100);
    assert.equal(body.character.sheet.treasure.goldGp, 35);
  });

  it('player token cannot apply rewards', async () => {
    const charId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/${charId}/rewards`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.playerToken}`
        },
        body: JSON.stringify({ xp: 50 })
      }
    );
    assert.equal(res.status, 403);
  });

  it('encounter phase can be patched', async () => {
    const enc = await fetch(`${server.base}/api/campaigns/${created.campaignId}/encounters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.gmToken}`
      },
      body: JSON.stringify({ name: 'Phase test' })
    }).then((r) => r.json());

    const patch = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/encounters/${enc.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.gmToken}`
        },
        body: JSON.stringify({ phase: 'initiative' })
      }
    );
    assert.equal(patch.status, 200);
    const body = await patch.json();
    assert.equal(body.phase, 'initiative');

    const get = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/encounters/${enc.id}`,
      { headers: { Authorization: `Bearer ${created.gmToken}` } }
    ).then((r) => r.json());
    assert.equal(get.phase, 'initiative');
  });
});
