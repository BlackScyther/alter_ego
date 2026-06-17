/**
 * Persistent GM campaign list (localStorage). Tokens are secrets — same trust model as sessionStorage.
 */

export const GM_CAMPAIGNS_STORAGE_KEY = 'dnd4e.gm.campaigns';
const REGISTRY_VERSION = 1;

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function readRaw(storage) {
  if (!storage) return null;
  try {
    const text = storage.getItem(GM_CAMPAIGNS_STORAGE_KEY);
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeRaw(doc, storage) {
  if (!storage) return;
  storage.setItem(GM_CAMPAIGNS_STORAGE_KEY, JSON.stringify(doc));
}

function emptyDoc() {
  return { version: REGISTRY_VERSION, campaigns: [] };
}

function normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.campaigns)) {
    return emptyDoc();
  }
  return {
    version: REGISTRY_VERSION,
    campaigns: raw.campaigns.filter((c) => c && typeof c.campaignId === 'string')
  };
}

/**
 * @param {Storage | null} [storage]
 * @param {{ activeGmSession?: boolean }} [opts]
 */
export function getGmCampaignStats(storage = defaultStorage(), { activeGmSession = false } = {}) {
  const total = listGmCampaigns(storage).length;
  return { total, active: activeGmSession ? 1 : 0 };
}

/**
 * @param {Storage | null} [storage]
 */
export function listGmCampaigns(storage = defaultStorage()) {
  const doc = normalizeDoc(readRaw(storage));
  return [...doc.campaigns].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

/**
 * @param {string} campaignId
 * @param {Storage | null} [storage]
 */
export function getGmCampaign(campaignId, storage = defaultStorage()) {
  return listGmCampaigns(storage).find((c) => c.campaignId === campaignId) ?? null;
}

/**
 * @param {{
 *   campaignId: string,
 *   name: string,
 *   gmToken: string,
 *   playerToken: string,
 *   inviteUrl: string,
 *   createdAt?: string
 * }} entry
 * @param {Storage | null} [storage]
 */
export function addGmCampaign(entry, storage = defaultStorage()) {
  const doc = normalizeDoc(readRaw(storage));
  const createdAt = entry.createdAt || new Date().toISOString();
  const normalized = {
    campaignId: String(entry.campaignId),
    name: String(entry.name || 'Campaign').trim() || 'Campaign',
    gmToken: String(entry.gmToken),
    playerToken: String(entry.playerToken),
    inviteUrl: String(entry.inviteUrl || ''),
    createdAt
  };
  const idx = doc.campaigns.findIndex((c) => c.campaignId === normalized.campaignId);
  if (idx >= 0) {
    doc.campaigns[idx] = { ...doc.campaigns[idx], ...normalized };
  } else {
    doc.campaigns.push(normalized);
  }
  writeRaw(doc, storage);
  return normalized;
}
