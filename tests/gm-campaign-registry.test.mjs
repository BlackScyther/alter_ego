import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GM_CAMPAIGNS_STORAGE_KEY,
  listGmCampaigns,
  getGmCampaign,
  addGmCampaign,
  getGmCampaignStats
} from '../src/api/gm-campaign-registry.js';

function mockStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key)
  };
}

function sampleEntry(overrides = {}) {
  return {
    campaignId: '11111111-1111-1111-1111-111111111111',
    name: 'Our campaign',
    gmToken: 'gm-secret',
    playerToken: 'player-secret',
    inviteUrl: 'http://localhost/join?c=11111111-1111-1111-1111-111111111111&t=player-secret',
    createdAt: '2026-06-15T10:00:00.000Z',
    ...overrides
  };
}

describe('gm-campaign-registry', () => {
  /** @type {ReturnType<typeof mockStorage>} */
  let storage;

  beforeEach(() => {
    storage = mockStorage();
  });

  it('starts empty', () => {
    assert.deepEqual(listGmCampaigns(storage), []);
    assert.equal(getGmCampaign('missing', storage), null);
  });

  it('adds and lists campaigns newest first', () => {
    addGmCampaign(sampleEntry({ createdAt: '2026-06-14T10:00:00.000Z' }), storage);
    addGmCampaign(
      sampleEntry({
        campaignId: '22222222-2222-2222-2222-222222222222',
        name: 'Second',
        createdAt: '2026-06-15T12:00:00.000Z'
      }),
      storage
    );

    const list = listGmCampaigns(storage);
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'Second');
    assert.equal(list[1].name, 'Our campaign');
  });

  it('dedupes by campaignId on re-add', () => {
    addGmCampaign(sampleEntry(), storage);
    addGmCampaign(sampleEntry({ name: 'Renamed locally' }), storage);

    assert.equal(listGmCampaigns(storage).length, 1);
    assert.equal(getGmCampaign(sampleEntry().campaignId, storage)?.name, 'Renamed locally');
  });

  it('persists full create response fields', () => {
    const entry = sampleEntry();
    addGmCampaign(entry, storage);
    const raw = JSON.parse(storage.getItem(GM_CAMPAIGNS_STORAGE_KEY));
    assert.equal(raw.version, 1);
    assert.equal(raw.campaigns[0].gmToken, 'gm-secret');
    assert.equal(raw.campaigns[0].playerToken, 'player-secret');
    assert.ok(raw.campaigns[0].inviteUrl.includes('player-secret'));
  });

  it('reports campaign totals and active session flag', () => {
    addGmCampaign(sampleEntry(), storage);
    assert.deepEqual(getGmCampaignStats(storage, { activeGmSession: false }), { total: 1, active: 0 });
    assert.deepEqual(getGmCampaignStats(storage, { activeGmSession: true }), { total: 1, active: 1 });
  });

  it('ignores corrupt storage', () => {
    storage.setItem(GM_CAMPAIGNS_STORAGE_KEY, '{bad json');
    assert.deepEqual(listGmCampaigns(storage), []);
  });
});
