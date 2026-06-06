/**
 * Browser client for /api/campaigns (online campaign flow).
 */

const KEYS = {
  id: 'dnd4e.campaign.id',
  name: 'dnd4e.campaign.name',
  role: 'dnd4e.campaign.role',
  token: 'dnd4e.campaign.token',
  inviteUrl: 'dnd4e.campaign.inviteUrl'
};

export function apiBase() {
  return import.meta.env.VITE_API_BASE ?? '';
}

export function getSessionCampaign() {
  try {
    const campaignId = sessionStorage.getItem(KEYS.id);
    const token = sessionStorage.getItem(KEYS.token);
    const role = sessionStorage.getItem(KEYS.role);
    if (!campaignId || !token || (role !== 'gm' && role !== 'player')) return null;
    return {
      campaignId,
      name: sessionStorage.getItem(KEYS.name) || 'Campaign',
      role,
      token,
      inviteUrl: sessionStorage.getItem(KEYS.inviteUrl) || ''
    };
  } catch {
    return null;
  }
}

export function setSessionCampaign({ campaignId, name, role, token, inviteUrl = '' }) {
  sessionStorage.setItem(KEYS.id, campaignId);
  sessionStorage.setItem(KEYS.name, name || 'Campaign');
  sessionStorage.setItem(KEYS.role, role);
  sessionStorage.setItem(KEYS.token, token);
  if (inviteUrl) sessionStorage.setItem(KEYS.inviteUrl, inviteUrl);
}

export function clearSessionCampaign() {
  for (const key of Object.values(KEYS)) sessionStorage.removeItem(key);
}

export function isGmSession() {
  return getSessionCampaign()?.role === 'gm';
}

export function isPlayerSession() {
  return getSessionCampaign()?.role === 'player';
}

async function apiFetch(path, options = {}) {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

export async function createCampaign(name = 'Our campaign') {
  const data = await apiFetch('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  setSessionCampaign({
    campaignId: data.campaignId,
    name: data.name,
    role: 'gm',
    token: data.gmToken,
    inviteUrl: data.inviteUrl
  });
  return data;
}

export function joinCampaign(campaignId, playerToken, name = 'Campaign') {
  setSessionCampaign({
    campaignId,
    name,
    role: 'player',
    token: playerToken
  });
}

export async function saveCharacterToCampaign(character) {
  const session = getSessionCampaign();
  if (!session || session.role !== 'player') return { skipped: true };

  const doc = {
    ...character,
    meta: {
      ...character.meta,
      campaignId: session.campaignId,
      source: 'editor'
    }
  };

  return apiFetch(
    `/api/campaigns/${encodeURIComponent(session.campaignId)}/characters/${encodeURIComponent(doc.id)}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify(doc)
    }
  );
}

export async function listCampaignCharacters() {
  const session = getSessionCampaign();
  if (!session || session.role !== 'gm') {
    throw new Error('GM campaign session required.');
  }
  return apiFetch(`/api/campaigns/${encodeURIComponent(session.campaignId)}/characters`, {
    headers: { Authorization: `Bearer ${session.token}` }
  });
}
