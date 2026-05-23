import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestApiServer,
  createTestCampaign,
  validCharacter,
  INJECTION_PAYLOADS
} from './helpers/test-server.mjs';

describe('Campaign API security', () => {
  /** @type {{ base: string, cleanup: () => void }} */
  let server;

  before(async () => {
    server = await startTestApiServer();
  });

  after(() => {
    server.cleanup();
  });

  it('health endpoint responds', async () => {
    const res = await fetch(`${server.base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  it('creates campaign with SQL injection in name without error', async () => {
    const data = await createTestCampaign(server.base, INJECTION_PAYLOADS.sqlCampaignName);
    assert.ok(data.campaignId);
    assert.match(data.name, /DROP TABLE/);
    assert.ok(data.gmToken);
    assert.ok(data.playerToken);
  });

  it('truncates very long campaign names', async () => {
    const longName = 'A'.repeat(200);
    const data = await createTestCampaign(server.base, longName);
    assert.equal(data.name.length, 120);
  });

  it('rejects list characters without auth', async () => {
    const created = await createTestCampaign(server.base);
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters`
    );
    assert.equal(res.status, 401);
  });

  it('rejects invalid GM token', async () => {
    const created = await createTestCampaign(server.base);
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters`,
      { headers: { Authorization: 'Bearer totally-wrong-token' } }
    );
    assert.equal(res.status, 403);
  });

  it('rejects player token on GM list endpoint', async () => {
    const created = await createTestCampaign(server.base);
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters`,
      { headers: { Authorization: `Bearer ${created.playerToken}` } }
    );
    assert.equal(res.status, 403);
  });

  it('returns 404 for unknown campaign id', async () => {
    const created = await createTestCampaign(server.base);
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${server.base}/api/campaigns/${fakeId}/characters`, {
      headers: { Authorization: `Bearer ${created.gmToken}` }
    });
    assert.equal(res.status, 404);
  });

  it('resists SQL injection in campaign URL id', async () => {
    const created = await createTestCampaign(server.base);
    const maliciousId = encodeURIComponent("1' OR '1'='1");
    const res = await fetch(
      `${server.base}/api/campaigns/${maliciousId}/characters`,
      { headers: { Authorization: `Bearer ${created.gmToken}` } }
    );
    assert.equal(res.status, 404);
  });

  it('stores and retrieves character with injection payloads in fields', async () => {
    const created = await createTestCampaign(server.base);
    const charId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const char = validCharacter({
      id: charId,
      identity: {
        characterName: INJECTION_PAYLOADS.xssScript,
        level: 2,
        playerName: INJECTION_PAYLOADS.sqlUnion,
        race: INJECTION_PAYLOADS.xssImg
      }
    });

    const putRes = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/${charId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.playerToken}`
        },
        body: JSON.stringify(char)
      }
    );
    assert.equal(putRes.status, 200);

    const listRes = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters`,
      { headers: { Authorization: `Bearer ${created.gmToken}` } }
    );
    const list = await listRes.json();
    assert.equal(list.characters.length, 1);
    assert.equal(list.characters[0].character.identity.characterName, INJECTION_PAYLOADS.xssScript);
  });

  it('rejects PUT when body id mismatches URL characterId', async () => {
    const created = await createTestCampaign(server.base);
    const char = validCharacter({ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' });
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/${char.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.playerToken}`
        },
        body: JSON.stringify({ ...char, id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' })
      }
    );
    assert.equal(res.status, 400);
  });

  it('rejects invalid character documents', async () => {
    const created = await createTestCampaign(server.base);
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/bad-id`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.playerToken}`
        },
        body: JSON.stringify({ identity: { characterName: '', level: 99 } })
      }
    );
    assert.equal(res.status, 400);
  });

  it('rejects GM token on player PUT endpoint', async () => {
    const created = await createTestCampaign(server.base);
    const char = validCharacter();
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/${char.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.gmToken}`
        },
        body: JSON.stringify(char)
      }
    );
    assert.equal(res.status, 403);
  });

  it('handles SQL injection attempt in characterId path segment', async () => {
    const created = await createTestCampaign(server.base);
    const maliciousCharId = encodeURIComponent("x' OR 1=1 --");
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/${maliciousCharId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.playerToken}`
        },
        body: JSON.stringify(validCharacter({ id: "x' OR 1=1 --" }))
      }
    );
    assert.ok([400, 200].includes(res.status) || res.status >= 400);
    if (res.status === 200) {
      const list = await fetch(
        `${server.base}/api/campaigns/${created.campaignId}/characters`,
        { headers: { Authorization: `Bearer ${created.gmToken}` } }
      ).then((r) => r.json());
      assert.equal(list.characters.length, 1);
    }
  });

  it('rejects oversized JSON body', async () => {
    const created = await createTestCampaign(server.base);
    const char = validCharacter();
    const hugeNotes = 'x'.repeat(600 * 1024);
    const res = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters/${char.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.playerToken}`
        },
        body: JSON.stringify({ ...char, notes: { raceFeatures: hugeNotes } })
      }
    );
    assert.ok(res.status >= 400);
  });

  it('database remains intact after injection attempts', async () => {
    const created = await createTestCampaign(server.base, INJECTION_PAYLOADS.sqlCampaignName);
    const char = validCharacter({
      identity: {
        characterName: 'Survivor',
        level: 1,
        playerName: INJECTION_PAYLOADS.sqlUnion
      }
    });
    await fetch(
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

    const health = await fetch(`${server.base}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);

    const list = await fetch(
      `${server.base}/api/campaigns/${created.campaignId}/characters`,
      { headers: { Authorization: `Bearer ${created.gmToken}` } }
    ).then((r) => r.json());
    assert.ok(Array.isArray(list.characters));
  });
});

describe('auth token hashing', () => {
  it('hashToken is deterministic with same pepper', async () => {
    const { hashToken } = await import('../server/auth.mjs');
    const a = hashToken('same-token');
    const b = hashToken('same-token');
    assert.equal(a, b);
    assert.notEqual(a, hashToken('other-token'));
  });

  it('timingSafeEqual rejects length mismatch', async () => {
    const { timingSafeEqual } = await import('../server/auth.mjs');
    assert.equal(timingSafeEqual('abc', 'abcd'), false);
    assert.equal(timingSafeEqual('abc', 'abc'), true);
  });
});
