import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApiServer, createTestCampaign } from './helpers/test-server.mjs';

describe('Homebrew API', () => {
  /** @type {{ base: string, cleanup: () => void }} */
  let server;
  /** @type {{ campaignId: string, gmToken: string, playerToken: string }} */
  let campaign;

  before(async () => {
    server = await startTestApiServer();
    campaign = await createTestCampaign(server.base, 'Homebrew test');
  });

  after(() => {
    server.cleanup();
  });

  it('lists empty homebrew without auth', async () => {
    const res = await fetch(`${server.base}/api/homebrew?category=monster`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.entries));
  });

  it('rejects create without GM token', async () => {
    const res = await fetch(`${server.base}/api/homebrew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_slug: 'monster',
        gm_slug: 'testgm',
        listing_fields: { Name: 'Test Goblin' },
        body_html: '<p>A goblin.</p>'
      })
    });
    assert.equal(res.status, 401);
  });

  it('rejects create with player token', async () => {
    const res = await fetch(`${server.base}/api/homebrew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${campaign.playerToken}`
      },
      body: JSON.stringify({
        category_slug: 'monster',
        gm_slug: 'testgm',
        listing_fields: { Name: 'Test Goblin' },
        body_html: '<p>A goblin.</p>'
      })
    });
    assert.equal(res.status, 403);
  });

  it('creates, reads, updates, and deletes homebrew entry', async () => {
    const createRes = await fetch(`${server.base}/api/homebrew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${campaign.gmToken}`
      },
      body: JSON.stringify({
        category_slug: 'monster',
        gm_slug: 'testgm',
        listing_fields: { Name: 'Workshop Goblin', Level: '1' },
        body_html: '<p>Custom monster.</p>'
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.match(created.id, /^hb_monster_/);
    assert.equal(created.listing_fields.SourceBook, 'hbrw_testgm');
    assert.equal(created.listing_fields.Name, 'Workshop Goblin');

    const getRes = await fetch(`${server.base}/api/homebrew/${created.id}`);
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.equal(fetched.id, created.id);

    const listRes = await fetch(`${server.base}/api/homebrew?category=monster`);
    const listBody = await listRes.json();
    assert.ok(listBody.entries.some((e) => e.id === created.id));

    const updateRes = await fetch(`${server.base}/api/homebrew/${created.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${campaign.gmToken}`
      },
      body: JSON.stringify({
        gm_slug: 'testgm',
        listing_fields: { Name: 'Renamed Goblin', Level: '2' }
      })
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.listing_fields.Name, 'Renamed Goblin');
    assert.equal(updated.listing_fields.Level, '2');

    const deleteRes = await fetch(`${server.base}/api/homebrew/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${campaign.gmToken}` }
    });
    assert.equal(deleteRes.status, 204);

    const missingRes = await fetch(`${server.base}/api/homebrew/${created.id}`);
    assert.equal(missingRes.status, 404);
  });

  it('forces SourceBook to hbrw_{gm_slug} on save', async () => {
    const res = await fetch(`${server.base}/api/homebrew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${campaign.gmToken}`
      },
      body: JSON.stringify({
        category_slug: 'feat',
        gm_slug: 'con_gm',
        listing_fields: { Name: 'Custom Feat', SourceBook: 'PHB' },
        body_html: '<p>Should override source.</p>'
      })
    });
    assert.equal(res.status, 201);
    const entry = await res.json();
    assert.equal(entry.listing_fields.SourceBook, 'hbrw_con_gm');

    await fetch(`${server.base}/api/homebrew/${entry.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${campaign.gmToken}` }
    });
  });
});
