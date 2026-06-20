import { apiBase, getSessionCampaign } from './campaign-api.js';
import { compendium } from '../data/compendium.js';

function gmAuthHeaders() {
  const session = getSessionCampaign();
  if (!session || session.role !== 'gm') {
    throw new Error('GM campaign session required.');
  }
  return { Authorization: `Bearer ${session.token}` };
}

/**
 * Source-book metadata (title/release_date/edition_era) keyed by code.
 *
 * Reads the writable seed via the API when the server is reachable; otherwise
 * falls back to the normalized DB copy (`source_books`) exposed by the
 * compendium provider, so static/Tauri builds still get dates (read-only).
 *
 * @returns {Promise<Record<string, { title: string|null, release_date: string|null, edition_era: string|null }>>}
 */
export async function getSourceBookDates() {
  try {
    const res = await fetch(`${apiBase()}/api/source-books`);
    if (res.ok) {
      const data = await res.json();
      if (data?.books) return data.books;
    }
  } catch {
    /* fall through to the DB copy */
  }
  const fromDb = await compendium.getSourceBookDates();
  return fromDb ?? {};
}

/**
 * Persist one source book's editable fields (GM only). Throws when the API is
 * unreachable; the DB fallback above is read-only.
 * @param {string} code
 * @param {{ title?: string|null, release_date?: string|null, edition_era?: string|null }} patch
 */
export async function saveSourceBook(code, patch) {
  const res = await fetch(`${apiBase()}/api/source-books/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...gmAuthHeaders() },
    body: JSON.stringify(patch ?? {})
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
  return res.json();
}
