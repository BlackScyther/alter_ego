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

function activeEncounterKey(campaignId) {
  return `dnd4e.activeEncounter.${campaignId}`;
}

export function getActiveEncounterId(campaignId) {
  return sessionStorage.getItem(activeEncounterKey(campaignId));
}

export function setActiveEncounterId(campaignId, encounterId) {
  if (encounterId) sessionStorage.setItem(activeEncounterKey(campaignId), encounterId);
  else sessionStorage.removeItem(activeEncounterKey(campaignId));
}

export async function listEncounters() {
  const session = getSessionCampaign();
  const data = await gmFetch(`/api/campaigns/${encodeURIComponent(session.campaignId)}/encounters`);
  return data.encounters || [];
}

export async function createEncounter(name = 'Encounter') {
  const session = getSessionCampaign();
  const enc = await gmFetch(`/api/campaigns/${encodeURIComponent(session.campaignId)}/encounters`, {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  setActiveEncounterId(session.campaignId, enc.id);
  return enc;
}

export async function getEncounter(encounterId) {
  const session = getSessionCampaign();
  return gmFetch(
    `/api/campaigns/${encodeURIComponent(session.campaignId)}/encounters/${encodeURIComponent(encounterId)}`
  );
}

export async function deleteEncounter(encounterId) {
  const session = getSessionCampaign();
  await gmFetch(
    `/api/campaigns/${encodeURIComponent(session.campaignId)}/encounters/${encodeURIComponent(encounterId)}`,
    { method: 'DELETE' }
  );
  if (getActiveEncounterId(session.campaignId) === encounterId) {
    setActiveEncounterId(session.campaignId, null);
  }
}

export async function spawnActor(encounterId, body) {
  const session = getSessionCampaign();
  return gmFetch(
    `/api/campaigns/${encodeURIComponent(session.campaignId)}/encounters/${encodeURIComponent(encounterId)}/actors`,
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export async function updateActor(encounterId, actorId, character) {
  const session = getSessionCampaign();
  const doc = {
    ...character,
    meta: {
      ...character.meta,
      encounterId,
      campaignId: session.campaignId,
      owner: 'gm'
    }
  };
  return gmFetch(
    `/api/campaigns/${encodeURIComponent(session.campaignId)}/encounters/${encodeURIComponent(encounterId)}/actors/${encodeURIComponent(actorId)}`,
    { method: 'PUT', body: JSON.stringify(doc) }
  );
}

export async function patchActorInitiative(encounterId, actorId, payload) {
  const session = getSessionCampaign();
  return gmFetch(
    `/api/campaigns/${encodeURIComponent(session.campaignId)}/encounters/${encodeURIComponent(encounterId)}/actors/${encodeURIComponent(actorId)}/initiative`,
    { method: 'PATCH', body: JSON.stringify(payload) }
  );
}

export async function deleteActor(encounterId, actorId) {
  const session = getSessionCampaign();
  return gmFetch(
    `/api/campaigns/${encodeURIComponent(session.campaignId)}/encounters/${encodeURIComponent(encounterId)}/actors/${encodeURIComponent(actorId)}`,
    { method: 'DELETE' }
  );
}
