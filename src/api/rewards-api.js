import { apiBase, getSessionCampaign } from './campaign-api.js';

async function gmFetch(path, options = {}) {
  const session = getSessionCampaign();
  if (!session || session.role !== 'gm') {
    throw new Error('GM campaign session required.');
  }
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
      ...options.headers
    }
  });
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Apply XP, gold, and/or compendium items to a campaign character (GM only).
 * @param {string} characterId
 * @param {{ xp?: number, goldGp?: number, items?: Array<{ compendiumId: string, categorySlug?: string }> }} rewards
 */
export async function applyCharacterRewards(characterId, rewards) {
  const session = getSessionCampaign();
  return gmFetch(
    `/api/campaigns/${encodeURIComponent(session.campaignId)}/characters/${encodeURIComponent(characterId)}/rewards`,
    { method: 'POST', body: JSON.stringify(rewards) }
  );
}
