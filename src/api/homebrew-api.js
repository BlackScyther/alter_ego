import { apiBase, getSessionCampaign } from './campaign-api.js';

async function homebrewFetch(path, options = {}) {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

function gmAuthHeaders() {
  const session = getSessionCampaign();
  if (!session || session.role !== 'gm') {
    throw new Error('GM campaign session required.');
  }
  return { Authorization: `Bearer ${session.token}` };
}

/**
 * @param {{ category?: string, search?: string, sourceBook?: string, limit?: number }} [opts]
 */
export async function listHomebrewEntries(opts = {}) {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.search) params.set('search', opts.search);
  if (opts.sourceBook) params.set('sourceBook', opts.sourceBook);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const data = await homebrewFetch(`/api/homebrew${qs ? `?${qs}` : ''}`);
  return data.entries ?? [];
}

/**
 * @param {string} entryId
 */
export async function getHomebrewEntry(entryId) {
  return homebrewFetch(`/api/homebrew/${encodeURIComponent(entryId)}`);
}

/**
 * @param {object} payload
 */
export async function createHomebrewEntry(payload) {
  return homebrewFetch('/api/homebrew', {
    method: 'POST',
    headers: gmAuthHeaders(),
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} entryId
 * @param {object} payload
 */
export async function updateHomebrewEntry(entryId, payload) {
  return homebrewFetch(`/api/homebrew/${encodeURIComponent(entryId)}`, {
    method: 'PUT',
    headers: gmAuthHeaders(),
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} entryId
 */
export async function deleteHomebrewEntry(entryId) {
  return homebrewFetch(`/api/homebrew/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
    headers: gmAuthHeaders()
  });
}

export const GM_SLUG_STORAGE_KEY = 'dnd4e.workshop.gmSlug';

export function getGmSlug() {
  try {
    return localStorage.getItem(GM_SLUG_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * @param {string} slug
 */
export function setGmSlug(slug) {
  localStorage.setItem(GM_SLUG_STORAGE_KEY, String(slug ?? '').trim());
}

export function homebrewSourceBook(gmSlug) {
  return `hbrw_${gmSlug}`;
}
