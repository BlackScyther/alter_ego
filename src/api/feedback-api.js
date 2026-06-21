/**
 * Browser client for /api/feedback.
 *
 * Submitting is public (any player or GM). Reading stats and managing entries
 * requires a GM campaign session token.
 */

import { apiBase, getSessionCampaign } from './campaign-api.js';

async function feedbackFetch(path, options = {}) {
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
 * Submit a feedback entry (public, no auth).
 * @param {object} payload { category, title, message, area?, severity?, role?, contact?, appVersion? }
 */
export async function submitFeedback(payload) {
  return feedbackFetch('/api/feedback', {
    method: 'POST',
    body: JSON.stringify(payload ?? {})
  });
}

/**
 * List feedback entries (GM only).
 * @param {{ category?: string, status?: string, limit?: number, offset?: number }} [opts]
 */
export async function listFeedback(opts = {}) {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.status) params.set('status', opts.status);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const data = await feedbackFetch(`/api/feedback${qs ? `?${qs}` : ''}`, {
    headers: gmAuthHeaders()
  });
  return data.entries ?? [];
}

/** Aggregated feedback statistics (GM only). */
export async function getFeedbackStats() {
  return feedbackFetch('/api/feedback/stats', { headers: gmAuthHeaders() });
}

/**
 * Change an entry's status (GM only).
 * @param {string} id
 * @param {string} status open | triaged | resolved | wontfix
 */
export async function setFeedbackStatus(id, status) {
  return feedbackFetch(`/api/feedback/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: gmAuthHeaders(),
    body: JSON.stringify({ status })
  });
}

/**
 * Delete an entry (GM only).
 * @param {string} id
 */
export async function deleteFeedback(id) {
  return feedbackFetch(`/api/feedback/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: gmAuthHeaders()
  });
}
