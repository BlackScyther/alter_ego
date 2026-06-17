/**
 * Compendium access layer — SQLite (alter_eger.db) with stub fallback.
 */

import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { classNameMatches, classNameLikePatterns, normalizePowerType, powerTypeLikePatterns } from '../editor/power-filter.js';
import { apiBase } from '../api/campaign-api.js';

const SEARCH_MIN = 3;

let _sqlInit = null;

async function getSQL() {
  if (!_sqlInit) {
    _sqlInit = await initSqlJs({ locateFile: () => wasmUrl });
  }
  return _sqlInit;
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

/** @typedef {{ id: string, category_slug: string, listing_fields: Record<string,string>, body_html?: string, index_text?: string, ability_bonuses?: unknown[], skill_bonuses?: unknown[] }} CompendiumEntry */

function splitSourceBooks(raw) {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function rowToEntry(row) {
  const listing =
    typeof row.listing_fields === 'string'
      ? JSON.parse(row.listing_fields)
      : row.listing_fields;
  return {
    id: row.id,
    category_slug: row.category_slug,
    listing_fields: listing,
    body_html: row.body_html ?? '',
    index_text: row.index_text ?? ''
  };
}

/**
 * @param {CompendiumEntry[]} entries
 * @param {string} query
 * @param {number} limit
 */
export function rankSearchResults(entries, query, limit = 100) {
  const q = query.trim().toLowerCase();
  if (q.length < SEARCH_MIN) return { kind: 'idle', entries: [] };

  const terms = q.split(/\s+/).filter(Boolean);
  const scored = [];

  for (const row of entries) {
    const name = (row.listing_fields?.Name ?? row.id).toLowerCase();
    const index = (row.index_text ?? '').toLowerCase();
    const id = row.id.toLowerCase();
    const hay = `${name} ${index} ${id}`;
    if (!terms.every((t) => hay.includes(t))) continue;

    let score = 0;
    const first = terms[0];
    if (name.startsWith(first)) score += 200;
    else if (name.split(/\s+/).some((w) => w.startsWith(first))) score += 130;
    else if (name.includes(first)) score += 80;
    else if (index.includes(first)) score += 40;

    const matched = terms.filter((t) => name.includes(t)).length;
    score += matched * 25;
    if (terms.length > 1 && matched === terms.length) score += 50;
    score -= Math.min(name.length, 40);

    scored.push({ row, score });
  }

  scored.sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) return diff;
    const an = a.row.listing_fields?.Name ?? '';
    const bn = b.row.listing_fields?.Name ?? '';
    return an.localeCompare(bn, undefined, { sensitivity: 'base' });
  });

  return { kind: 'results', entries: scored.slice(0, limit).map((s) => s.row) };
}

function sortEntriesByName(entries) {
  return [...entries].sort((a, b) => {
    const an = a.listing_fields?.Name ?? a.id;
    const bn = b.listing_fields?.Name ?? b.id;
    return an.localeCompare(bn, undefined, { sensitivity: 'base' });
  });
}

function mergeEntryLists(official, homebrew, limit) {
  const seen = new Set();
  const merged = [];
  for (const row of [...official, ...homebrew]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return sortEntriesByName(merged).slice(0, limit);
}

async function fetchHomebrewFromApi(opts = {}) {
  try {
    const params = new URLSearchParams();
    if (opts.category) params.set('category', opts.category);
    if (opts.search) params.set('search', opts.search);
    if (opts.sourceBook) params.set('sourceBook', opts.sourceBook);
    if (opts.limit != null) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const res = await fetch(`${apiBase()}/api/homebrew${qs ? `?${qs}` : ''}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.entries ?? []).map((e) => ({
      id: e.id,
      category_slug: e.category_slug,
      listing_fields: e.listing_fields ?? {},
      body_html: e.body_html ?? '',
      index_text: e.index_text ?? ''
    }));
  } catch {
    return [];
  }
}

export class CompendiumProvider {
  constructor(options = {}) {
    this.dbPath = options.dbPath ?? '/data/alter_eger.db';
    this.stubPath = options.stubPath ?? '/data/samples/compendium-stub.json';
    this.useStub = options.useStub ?? true;
    this._ready = null;
    this._db = null;
    this._stub = null;
    this._catalogCounts = null;
  }

  async ready() {
    if (!this._ready) {
      this._ready = this._init();
    }
    return this._ready;
  }

  async _init() {
    if (this.useStub) {
      try {
        this._stub = await fetchJson(this.stubPath);
      } catch {
        this._stub = null;
      }
    }

    if (await this._detectSqliteDb()) {
      try {
        const SQL = await getSQL();
        const res = await fetch(this.dbPath);
        if (!res.ok) throw new Error(`fetch ${this.dbPath}: ${res.status}`);
        const buf = await res.arrayBuffer();
        this._db = new SQL.Database(new Uint8Array(buf));
        this.mode = 'sqlite';
        return;
      } catch (err) {
        console.warn('[compendium] Failed to load SQLite DB, using stub:', err);
      }
    }

    if (this._stub) {
      this.mode = 'stub';
    } else {
      this.mode = 'unavailable';
    }
  }

  _usesStubData() {
    return !!this._stub && this.mode === 'stub';
  }

  _usesSqlite() {
    return this.mode === 'sqlite' && this._db != null;
  }

  async _detectSqliteDb() {
    try {
      const res = await fetch(this.dbPath, { headers: { Range: 'bytes=0-15' } });
      if (!res.ok) return false;
      if ((res.headers.get('content-type') ?? '').includes('text/html')) return false;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 15) return false;
      return new TextDecoder().decode(new Uint8Array(buf).slice(0, 15)) === 'SQLite format 3';
    } catch {
      return false;
    }
  }

  /**
   * @param {string} sql
   * @param {unknown[]} params
   */
  _queryAll(sql, params = []) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  async _getCatalogCounts() {
    if (!this._catalogCounts) {
      this._catalogCounts = await fetchJson('/metadata/catalog-counts.json');
    }
    return this._catalogCounts;
  }

  async getCategories() {
    await this.ready();
    if (this._usesStubData()) {
      return Object.entries(this._stub.categories).map(([slug, meta]) => ({
        slug,
        display_name: meta.displayName,
        entry_count: meta.entries?.length ?? 0
      }));
    }
    if (this._usesSqlite()) {
      const rows = this._queryAll(
        'SELECT slug, display_name, entry_count FROM categories ORDER BY display_name'
      );
      if (rows.length) return rows;
    }
    const counts = await this._getCatalogCounts();
    return Object.entries(counts.categories).map(([slug, meta]) => ({
      slug,
      display_name: meta.displayName,
      entry_count: meta.entryCount
    }));
  }

  /**
   * @param {import('../editor/power-filter.js').PowerType} [powerType]
   */
  _passesPowerListingFilters(listing_fields, { className, level, powerType }) {
    if (className != null && className !== '') {
      if (!classNameMatches(listing_fields?.ClassName, className)) return false;
    }
    if (level != null && level !== '') {
      const pl = parseInt(String(listing_fields?.Level ?? ''), 10);
      const want = parseInt(String(level), 10);
      if (Number.isNaN(pl) || Number.isNaN(want) || pl !== want) return false;
    }
    if (powerType) {
      if (normalizePowerType(listing_fields?.Type) !== powerType) return false;
    }
    return true;
  }

  /**
   * @param {string} categorySlug
   * @param {{ search?: string, limit?: number, sourceBooks?: string[], className?: string, level?: number, powerType?: import('../editor/power-filter.js').PowerType, includeHomebrew?: boolean }} opts
   * @returns {Promise<CompendiumEntry[]>}
   */
  async listEntries(categorySlug, opts = {}) {
    await this.ready();
    const limit = opts.limit ?? 200;
    const q = (opts.search ?? '').trim().toLowerCase();
    const sourceBooks = Array.isArray(opts.sourceBooks) && opts.sourceBooks.length ? opts.sourceBooks : null;
    const bookSet = sourceBooks ? new Set(sourceBooks) : null;
    const className = opts.className ?? null;
    const level = opts.level ?? null;
    const powerType = opts.powerType ?? null;
    const powerFilters = className != null || level != null || powerType != null;
    const includeHomebrew = opts.includeHomebrew !== false;
    const homebrewOnly =
      bookSet && [...bookSet].every((b) => String(b).startsWith('hbrw_'));

    const passesSource = (entry) => {
      if (!bookSet) return true;
      return splitSourceBooks(entry.listing_fields?.SourceBook).some((b) => bookSet.has(b));
    };

    async function attachHomebrew(officialRows) {
      if (!includeHomebrew) return officialRows;
      const hbSourceBook =
        bookSet && bookSet.size === 1 ? [...bookSet][0] : undefined;
      const homebrewRows = await fetchHomebrewFromApi({
        category: categorySlug,
        search: q.length >= SEARCH_MIN ? q : undefined,
        sourceBook: hbSourceBook,
        limit: limit
      });
      const filteredHb = homebrewRows.filter((e) => {
        if (!passesSource(e)) return false;
        return passesPowerFilters(e.listing_fields);
      });
      if (homebrewOnly) return sortEntriesByName(filteredHb).slice(0, limit);
      return mergeEntryLists(officialRows, filteredHb, limit);
    }

    const passesPowerFilters = (listing_fields) =>
      !powerFilters ||
      this._passesPowerListingFilters(listing_fields, { className, level, powerType });

    if (this._usesStubData()) {
      let rows = this._stub.categories[categorySlug]?.entries ?? [];
      if (bookSet) rows = rows.filter((e) => passesSource({ listing_fields: e.listing_fields }));
      if (powerFilters) rows = rows.filter((e) => passesPowerFilters(e.listing_fields));
      if (q.length >= SEARCH_MIN) {
        const mapped = rows.map((e) => ({
          id: e.id,
          category_slug: categorySlug,
          listing_fields: e.listing_fields,
          body_html: e.body_html ?? '',
          index_text: e.index_text ?? ''
        }));
        const { entries } = rankSearchResults(mapped, q, limit);
        return attachHomebrew(entries);
      }
      const official = rows.slice(0, limit).map((e) => ({
        id: e.id,
        category_slug: categorySlug,
        listing_fields: e.listing_fields,
        body_html: e.body_html ?? '',
        index_text: e.index_text ?? '',
        ability_bonuses: e.ability_bonuses,
        skill_bonuses: e.skill_bonuses
      }));
      return attachHomebrew(official);
    }

    if (this._usesSqlite()) {
      const bookClause = bookSet
        ? ` AND (${[...bookSet]
            .map(
              () =>
                "(',' || replace(json_extract(listing_fields, '$.SourceBook'), ' ', '') || ',') LIKE ?"
            )
            .join(' OR ')})`
        : '';
      const bookParams = bookSet ? [...bookSet].map((b) => `%,${b.replace(/ /g, '')},%`) : [];

      let powerClause = '';
      const powerParams = [];
      if (className) {
        const patterns = classNameLikePatterns(className);
        if (patterns.length) {
          powerClause += ` AND (${patterns.map(() => `lower(json_extract(listing_fields, '$.ClassName')) LIKE ?`).join(' OR ')})`;
          powerParams.push(...patterns);
        }
      }
      if (level != null && level !== '') {
        powerClause += ` AND cast(json_extract(listing_fields, '$.Level') as integer) = ?`;
        powerParams.push(parseInt(String(level), 10));
      }
      if (powerType) {
        const patterns = powerTypeLikePatterns(powerType);
        if (patterns.length) {
          powerClause += ` AND (${patterns.map(() => `lower(json_extract(listing_fields, '$.Type')) LIKE ?`).join(' OR ')})`;
          powerParams.push(...patterns);
        }
      }

      let rawRows;
      if (q.length >= SEARCH_MIN) {
        const like = `%${q}%`;
        rawRows = this._queryAll(
          `SELECT id, category_slug, listing_fields, body_html, index_text
           FROM entries
           WHERE category_slug = ? AND source = 'compendium'${bookClause}${powerClause}
             AND (
               lower(json_extract(listing_fields, '$.Name')) LIKE ?
               OR lower(index_text) LIKE ?
               OR lower(id) LIKE ?
             )
           ORDER BY json_extract(listing_fields, '$.Name') COLLATE NOCASE
           LIMIT ?`,
          [
            categorySlug,
            ...bookParams,
            ...powerParams,
            like,
            like,
            like,
            Math.min(limit * 3, 600)
          ]
        );
        const mapped = rawRows.map(rowToEntry);
        const { entries } = rankSearchResults(mapped, q, limit);
        return attachHomebrew(entries);
      }

      const fetchLimit =
        categorySlug === 'feat' || categorySlug === 'power' ? Math.max(limit, 500) : limit;
      rawRows = this._queryAll(
        `SELECT id, category_slug, listing_fields, body_html, index_text
         FROM entries
         WHERE category_slug = ? AND source = 'compendium'${bookClause}${powerClause}
         ORDER BY json_extract(listing_fields, '$.Name') COLLATE NOCASE
         LIMIT ?`,
        [categorySlug, ...bookParams, ...powerParams, fetchLimit]
      );
      return attachHomebrew(rawRows.map(rowToEntry).slice(0, limit));
    }

    if (includeHomebrew) {
      const homebrewRows = await fetchHomebrewFromApi({
        category: categorySlug,
        search: q.length >= SEARCH_MIN ? q : undefined,
        limit
      });
      return sortEntriesByName(homebrewRows).slice(0, limit);
    }

    return [];
  }

  /**
   * @param {string} categorySlug
   * @param {{ includeHomebrew?: boolean }} [opts]
   */
  async distinctSourceBooks(categorySlug, opts = {}) {
    await this.ready();
    const includeHomebrew = opts.includeHomebrew !== false;
    const collect = (values) => {
      const set = new Set();
      for (const v of values) {
        for (const b of splitSourceBooks(v)) set.add(b);
      }
      return [...set].sort();
    };

    if (this._usesStubData()) {
      const rows = this._stub.categories[categorySlug]?.entries ?? [];
      const official = collect(rows.map((e) => e.listing_fields?.SourceBook));
      if (!includeHomebrew) return official;
      const hb = await fetchHomebrewFromApi({ category: categorySlug, limit: 500 });
      return collect([...official, ...hb.map((e) => e.listing_fields?.SourceBook)]);
    }

    if (this._usesSqlite()) {
      const rows = this._queryAll(
        `SELECT DISTINCT json_extract(listing_fields, '$.SourceBook') AS sb
         FROM entries
         WHERE category_slug = ? AND source = 'compendium'
           AND json_extract(listing_fields, '$.SourceBook') IS NOT NULL
           AND json_extract(listing_fields, '$.SourceBook') != ''`,
        [categorySlug]
      );
      const official = collect(rows.map((r) => r.sb));
      if (!includeHomebrew) return official;
      const hb = await fetchHomebrewFromApi({ category: categorySlug, limit: 500 });
      return collect([...official, ...hb.map((e) => e.listing_fields?.SourceBook)]);
    }

    if (includeHomebrew) {
      const hb = await fetchHomebrewFromApi({ category: categorySlug, limit: 500 });
      return collect(hb.map((e) => e.listing_fields?.SourceBook));
    }

    return [];
  }

  async getEntry(id) {
    await this.ready();
    if (String(id).startsWith('hb_')) {
      try {
        const res = await fetch(`${apiBase()}/api/homebrew/${encodeURIComponent(id)}`);
        if (res.ok) {
          const e = await res.json();
          return {
            id: e.id,
            category_slug: e.category_slug,
            listing_fields: e.listing_fields ?? {},
            body_html: e.body_html ?? '',
            index_text: e.index_text ?? ''
          };
        }
      } catch {
        /* fall through */
      }
    }
    if (this._usesStubData()) {
      for (const [slug, cat] of Object.entries(this._stub.categories)) {
        const hit = cat.entries?.find((e) => e.id === id);
        if (hit) {
          return {
            id: hit.id,
            category_slug: slug,
            listing_fields: hit.listing_fields,
            body_html: hit.body_html ?? '',
            index_text: hit.index_text ?? '',
            ability_bonuses: hit.ability_bonuses,
            skill_bonuses: hit.skill_bonuses
          };
        }
      }
    }
    if (this._usesSqlite()) {
      const rows = this._queryAll(
        `SELECT id, category_slug, listing_fields, body_html, index_text
         FROM entries WHERE id = ? LIMIT 1`,
        [id]
      );
      if (rows.length) return rowToEntry(rows[0]);
    }
    return null;
  }

  getStatus() {
    return { mode: this.mode, dbPath: this.dbPath };
  }
}

export const compendium = new CompendiumProvider();

export { SEARCH_MIN as COMPENDIUM_SEARCH_MIN };
