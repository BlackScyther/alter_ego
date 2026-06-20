import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSourceBookCodes } from './compendium.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_BOOKS_PATH = resolve(__dirname, '..', 'metadata', 'source-books.json');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ERAS = new Set(['core', 'heroic', 'paragon', 'epic', 'setting', 'dragon', 'other']);
const MAX_TITLE_LEN = 200;

/** Read the raw source-books document (keeps `$comment` and any other keys). */
function readDoc() {
  return JSON.parse(readFileSync(SOURCE_BOOKS_PATH, 'utf8'));
}

/**
 * Editable source-book metadata, keyed by code. Merges the seed file with every
 * code the normalizer recorded so the GM can date books that the seed does not
 * list yet (those come back with a null date to fill in).
 * @returns {Record<string, { title: string|null, release_date: string|null, edition_era: string|null }>}
 */
export function getSourceBooks() {
  const doc = readDoc();
  const books = { ...(doc.books ?? {}) };
  for (const code of listSourceBookCodes()) {
    if (!books[code]) books[code] = { title: code, release_date: null, edition_era: null };
  }
  return books;
}

/**
 * Validate a release date: null/empty clears it, otherwise ISO YYYY-MM-DD that
 * is a real calendar date.
 * @param {unknown} value
 */
function normalizeReleaseDate(value) {
  if (value == null || value === '') return { ok: true, value: null };
  const s = String(value).trim();
  if (!ISO_DATE_RE.test(s)) return { ok: false, error: 'release_date must be ISO YYYY-MM-DD or empty.' };
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    return { ok: false, error: 'release_date is not a valid calendar date.' };
  }
  return { ok: true, value: s };
}

/**
 * Update one source book's editable fields and persist back to the seed file.
 * @param {string} code
 * @param {{ title?: string|null, release_date?: string|null, edition_era?: string|null }} patch
 */
export function updateSourceBook(code, patch = {}) {
  const key = String(code ?? '').trim();
  if (!key) {
    const err = new Error('Source book code is required.');
    err.status = 400;
    throw err;
  }

  const doc = readDoc();
  if (!doc.books) doc.books = {};
  const existing = doc.books[key] ?? { title: key, release_date: null, edition_era: null };
  const next = { ...existing };

  if (patch.title !== undefined) {
    next.title = patch.title == null ? null : String(patch.title).trim().slice(0, MAX_TITLE_LEN);
  }

  if (patch.release_date !== undefined) {
    const check = normalizeReleaseDate(patch.release_date);
    if (!check.ok) {
      const err = new Error(check.error);
      err.status = 400;
      throw err;
    }
    next.release_date = check.value;
  }

  if (patch.edition_era !== undefined) {
    if (patch.edition_era == null || patch.edition_era === '') {
      next.edition_era = null;
    } else if (ERAS.has(String(patch.edition_era))) {
      next.edition_era = String(patch.edition_era);
    } else {
      const err = new Error(`edition_era must be one of: ${[...ERAS].join(', ')}.`);
      err.status = 400;
      throw err;
    }
  }

  doc.books[key] = next;
  writeFileSync(SOURCE_BOOKS_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return next;
}
