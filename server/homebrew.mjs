import crypto from 'crypto';
import { getDb } from './db.mjs';

const SLUG_RE = /^[a-zA-Z0-9_]+$/;
const MAX_NAME_LEN = 200;
const MAX_BODY_LEN = 512_000;
const LIST_LIMIT = 500;

/**
 * @param {object} row
 */
function rowToEntry(row) {
  const listing =
    typeof row.listing_fields === 'string'
      ? JSON.parse(row.listing_fields)
      : row.listing_fields;
  return {
    id: row.id,
    category_slug: row.category_slug,
    source: 'homebrew',
    listing_fields: listing,
    body_html: row.body_html ?? '',
    index_text: row.index_text ?? '',
    gm_slug: row.gm_slug ?? ''
  };
}

export function validateGmSlug(slug) {
  const s = String(slug ?? '').trim();
  if (!s || !SLUG_RE.test(s)) {
    return { ok: false, error: 'GM slug must contain only letters, numbers, and underscores.' };
  }
  if (s.length > 40) {
    return { ok: false, error: 'GM slug must be 40 characters or fewer.' };
  }
  return { ok: true, slug: s };
}

export function homebrewSourceBook(gmSlug) {
  return `hbrw_${gmSlug}`;
}

/**
 * @param {Record<string, string>} listingFields
 * @param {string} bodyHtml
 */
export function buildIndexText(listingFields, bodyHtml) {
  const parts = Object.values(listingFields ?? {})
    .filter(Boolean)
    .map((v) => String(v));
  const stripped = String(bodyHtml ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped) parts.push(stripped);
  return parts.join(' ').slice(0, 8000);
}

/**
 * @param {string} categorySlug
 */
export function newHomebrewId(categorySlug) {
  const cat = String(categorySlug || 'entry').trim() || 'entry';
  return `hb_${cat}_${crypto.randomUUID()}`;
}

/**
 * @param {{ category?: string, search?: string, sourceBook?: string, limit?: number }} opts
 */
export function listHomebrewEntries(opts = {}) {
  const category = opts.category ? String(opts.category).trim() : '';
  const search = String(opts.search ?? '').trim().toLowerCase();
  const sourceBook = opts.sourceBook ? String(opts.sourceBook).trim() : '';
  const limit = Math.min(opts.limit ?? LIST_LIMIT, LIST_LIMIT);

  const clauses = [];
  const params = [];

  if (category) {
    clauses.push('category_slug = ?');
    params.push(category);
  }

  if (sourceBook) {
    clauses.push(`json_extract(listing_fields, '$.SourceBook') = ?`);
    params.push(sourceBook);
  }

  if (search.length >= 3) {
    clauses.push(
      `(lower(json_extract(listing_fields, '$.Name')) LIKE ? OR lower(index_text) LIKE ? OR lower(id) LIKE ?)`
    );
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(
      `SELECT id, category_slug, listing_fields, body_html, index_text, gm_slug, created_at, updated_at
       FROM homebrew_entries
       ${where}
       ORDER BY lower(json_extract(listing_fields, '$.Name')) COLLATE NOCASE
       LIMIT ?`
    )
    .all(...params, limit);

  return rows.map(rowToEntry);
}

/**
 * @param {string} entryId
 */
export function getHomebrewEntry(entryId) {
  const id = String(entryId || '').trim();
  if (!id) return null;
  const row = getDb()
    .prepare(
      `SELECT id, category_slug, listing_fields, body_html, index_text, gm_slug, created_at, updated_at
       FROM homebrew_entries WHERE id = ? LIMIT 1`
    )
    .get(id);
  return row ? rowToEntry(row) : null;
}

/**
 * @param {string} categorySlug
 */
export function distinctHomebrewSourceBooks(categorySlug) {
  const cat = String(categorySlug || '').trim();
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT json_extract(listing_fields, '$.SourceBook') AS sb
       FROM homebrew_entries
       WHERE category_slug = ?
         AND json_extract(listing_fields, '$.SourceBook') IS NOT NULL
         AND json_extract(listing_fields, '$.SourceBook') != ''`
    )
    .all(cat);
  return rows.map((r) => r.sb).filter(Boolean).sort();
}

/**
 * @param {{
 *   category_slug: string,
 *   listing_fields: Record<string, string>,
 *   body_html?: string,
 *   gm_slug: string,
 *   id?: string
 * }} payload
 */
export function createHomebrewEntry(payload) {
  const categorySlug = String(payload.category_slug || '').trim();
  if (!categorySlug) {
    const err = new Error('category_slug is required.');
    err.status = 400;
    throw err;
  }

  const slugCheck = validateGmSlug(payload.gm_slug);
  if (!slugCheck.ok) {
    const err = new Error(slugCheck.error);
    err.status = 400;
    throw err;
  }

  const listing = { ...(payload.listing_fields ?? {}) };
  const name = String(listing.Name ?? '').trim().slice(0, MAX_NAME_LEN);
  if (!name) {
    const err = new Error('listing_fields.Name is required.');
    err.status = 400;
    throw err;
  }
  listing.Name = name;
  listing.SourceBook = homebrewSourceBook(slugCheck.slug);

  const bodyHtml = String(payload.body_html ?? '').slice(0, MAX_BODY_LEN);
  const id = payload.id && String(payload.id).startsWith('hb_')
    ? String(payload.id)
    : newHomebrewId(categorySlug);

  if (getHomebrewEntry(id)) {
    const err = new Error('Entry id already exists.');
    err.status = 409;
    throw err;
  }

  const now = new Date().toISOString();
  const indexText = buildIndexText(listing, bodyHtml);

  getDb()
    .prepare(
      `INSERT INTO homebrew_entries (
         id, category_slug, listing_fields, body_html, index_text, gm_slug, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      categorySlug,
      JSON.stringify(listing),
      bodyHtml,
      indexText,
      slugCheck.slug,
      now,
      now
    );

  return getHomebrewEntry(id);
}

/**
 * @param {string} entryId
 * @param {{
 *   listing_fields?: Record<string, string>,
 *   body_html?: string,
 *   gm_slug?: string
 * }} payload
 */
export function updateHomebrewEntry(entryId, payload) {
  const existing = getHomebrewEntry(entryId);
  if (!existing) {
    const err = new Error('Homebrew entry not found.');
    err.status = 404;
    throw err;
  }

  const gmSlug = payload.gm_slug ?? existing.gm_slug;
  const slugCheck = validateGmSlug(gmSlug);
  if (!slugCheck.ok) {
    const err = new Error(slugCheck.error);
    err.status = 400;
    throw err;
  }

  const listing = { ...existing.listing_fields, ...(payload.listing_fields ?? {}) };
  const name = String(listing.Name ?? '').trim().slice(0, MAX_NAME_LEN);
  if (!name) {
    const err = new Error('listing_fields.Name is required.');
    err.status = 400;
    throw err;
  }
  listing.Name = name;
  listing.SourceBook = homebrewSourceBook(slugCheck.slug);

  const bodyHtml =
    payload.body_html !== undefined
      ? String(payload.body_html).slice(0, MAX_BODY_LEN)
      : existing.body_html;

  const now = new Date().toISOString();
  const indexText = buildIndexText(listing, bodyHtml);

  getDb()
    .prepare(
      `UPDATE homebrew_entries SET
         listing_fields = ?,
         body_html = ?,
         index_text = ?,
         gm_slug = ?,
         updated_at = ?
       WHERE id = ?`
    )
    .run(JSON.stringify(listing), bodyHtml, indexText, slugCheck.slug, now, entryId);

  return getHomebrewEntry(entryId);
}

/**
 * @param {string} entryId
 */
export function deleteHomebrewEntry(entryId) {
  const info = getDb().prepare(`DELETE FROM homebrew_entries WHERE id = ?`).run(entryId);
  return info.changes > 0;
}
