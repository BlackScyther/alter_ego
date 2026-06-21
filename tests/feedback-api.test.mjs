import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApiServer, createTestCampaign } from './helpers/test-server.mjs';

describe('Feedback API', () => {
  /** @type {{ base: string, cleanup: () => void }} */
  let server;
  /** @type {{ campaignId: string, gmToken: string, playerToken: string }} */
  let campaign;

  before(async () => {
    server = await startTestApiServer();
    campaign = await createTestCampaign(server.base, 'Feedback test');
  });

  after(() => {
    server.cleanup();
  });

  const post = (body) =>
    fetch(`${server.base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

  it('accepts a public submission with no auth', async () => {
    const res = await post({
      category: 'bug',
      title: 'Sheet shows wrong AC',
      message: 'AC total ignores my armor.',
      area: 'sheet',
      severity: 'high',
      role: 'player'
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.id);
    assert.equal(body.status, 'open');
    assert.equal(body.category, 'bug');
  });

  it('rejects missing required fields', async () => {
    const res = await post({ category: 'bug', title: '' });
    assert.equal(res.status, 400);
  });

  it('rejects an invalid category', async () => {
    const res = await post({
      category: 'nonsense',
      title: 'Hi',
      message: 'Body text'
    });
    assert.equal(res.status, 400);
  });

  it('rejects an oversized title', async () => {
    const res = await post({
      category: 'feature',
      title: 'x'.repeat(201),
      message: 'Body text'
    });
    assert.equal(res.status, 400);
  });

  it('rejects an invalid area', async () => {
    const res = await post({
      category: 'feature',
      title: 'Add dark mode',
      message: 'Please',
      area: 'space-station'
    });
    assert.equal(res.status, 400);
  });

  it('requires a GM token to list entries', async () => {
    const noAuth = await fetch(`${server.base}/api/feedback`);
    assert.equal(noAuth.status, 401);

    const playerAuth = await fetch(`${server.base}/api/feedback`, {
      headers: { Authorization: `Bearer ${campaign.playerToken}` }
    });
    assert.equal(playerAuth.status, 403);
  });

  it('requires a GM token to read stats', async () => {
    const res = await fetch(`${server.base}/api/feedback/stats`);
    assert.equal(res.status, 401);
  });

  it('lists, aggregates stats, updates status, and deletes (GM)', async () => {
    await post({ category: 'stuck', title: 'Stuck on race step', message: 'No next button.', area: 'editor' });
    await post({ category: 'stuck', title: 'Stuck again', message: 'Same place.', area: 'editor' });

    const gmHeaders = { Authorization: `Bearer ${campaign.gmToken}` };

    const listRes = await fetch(`${server.base}/api/feedback`, { headers: gmHeaders });
    assert.equal(listRes.status, 200);
    const { entries } = await listRes.json();
    assert.ok(entries.length >= 3);

    const filtered = await fetch(`${server.base}/api/feedback?category=stuck`, {
      headers: gmHeaders
    });
    const filteredBody = await filtered.json();
    assert.ok(filteredBody.entries.every((e) => e.category === 'stuck'));
    assert.ok(filteredBody.entries.length >= 2);

    const statsRes = await fetch(`${server.base}/api/feedback/stats`, { headers: gmHeaders });
    assert.equal(statsRes.status, 200);
    const stats = await statsRes.json();
    assert.ok(stats.total >= 3);
    assert.ok(stats.byCategory.some((row) => row.category === 'stuck' && row.count >= 2));
    assert.ok(stats.topRecurring.some((row) => row.category === 'stuck' && row.area === 'editor'));

    const target = filteredBody.entries[0];
    const patchRes = await fetch(`${server.base}/api/feedback/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...gmHeaders },
      body: JSON.stringify({ status: 'resolved' })
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.status, 'resolved');

    const badPatch = await fetch(`${server.base}/api/feedback/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...gmHeaders },
      body: JSON.stringify({ status: 'banana' })
    });
    assert.equal(badPatch.status, 400);

    const delRes = await fetch(`${server.base}/api/feedback/${target.id}`, {
      method: 'DELETE',
      headers: gmHeaders
    });
    assert.equal(delRes.status, 204);

    const delAgain = await fetch(`${server.base}/api/feedback/${target.id}`, {
      method: 'DELETE',
      headers: gmHeaders
    });
    assert.equal(delAgain.status, 404);
  });
});
