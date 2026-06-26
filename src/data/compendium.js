/**
 * Compendium access layer — SQLite (alter_ego.db) with stub fallback.
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
    this.dbPath = options.dbPath ?? '/data/alter_ego.db';
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
      // Prefer the normalized `power` table for power filtering when present:
      // exact power_type and an indexed level/class_name column replace the
      // brittle json_extract LIKE patterns (e.g. '%enc.%'). Falls back to the
      // JSON path for older DBs without the normalized table.
      const useNormalizedPower = powerFilters && this._hasTable('power');
      if (useNormalizedPower) {
        const conds = [];
        if (className) {
          const patterns = classNameLikePatterns(className);
          if (patterns.length) {
            conds.push(`(${patterns.map(() => `lower(class_name) LIKE ?`).join(' OR ')})`);
            powerParams.push(...patterns);
          }
        }
        if (level != null && level !== '') {
          conds.push(`level = ?`);
          powerParams.push(parseInt(String(level), 10));
        }
        if (powerType) {
          conds.push(`power_type = ?`);
          powerParams.push(powerType);
        }
        if (conds.length) {
          powerClause = ` AND id IN (SELECT id FROM power WHERE ${conds.join(' AND ')})`;
        }
      } else {
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
      if (rows.length) {
        const entry = rowToEntry(rows[0]);
        // Attach the authoritative worn-item slot from the normalized table so
        // slot eligibility (getEligibleSlotsForEntry) doesn't have to guess from
        // the often-empty Type field or the item name.
        if (entry?.category_slug === 'item' && this._hasTable('item')) {
          const slotRow = this._queryAll(`SELECT slot FROM item WHERE id = ? LIMIT 1`, [id]);
          if (slotRow[0]?.slot) entry.slot = slotRow[0].slot;
        }
        return entry;
      }
    }
    return null;
  }

  // --- Normalized compendium read path ------------------------------------
  // These query the structured tables written by tools/normalize/normalize.mjs.
  // When those tables are absent (older DB, stub, or unavailable) every method
  // returns null/empty so callers transparently fall back to the parse path.

  /** @param {string} name */
  _hasTable(name) {
    if (!this._usesSqlite()) return false;
    if (!this._tableCache) this._tableCache = new Map();
    if (this._tableCache.has(name)) return this._tableCache.get(name);
    let exists = false;
    try {
      const rows = this._queryAll(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`,
        [name]
      );
      exists = rows.length > 0;
    } catch {
      exists = false;
    }
    this._tableCache.set(name, exists);
    return exists;
  }

  /** True when the normalized tables are present and should be preferred. */
  async usesNormalized() {
    await this.ready();
    return this._hasTable('race') || this._hasTable('class');
  }

  /**
   * Parent -> subrace id map from the normalized `race_subrace` table.
   * @returns {Promise<Record<string, string[]> | null>}
   */
  async getRaceSubraceMap() {
    await this.ready();
    if (!this._hasTable('race_subrace')) return null;
    const rows = this._queryAll(
      `SELECT parent_race_id, subrace_race_id FROM race_subrace`
    );
    /** @type {Record<string, string[]>} */
    const map = {};
    for (const r of rows) {
      (map[r.parent_race_id] ??= []).push(r.subrace_race_id);
    }
    return map;
  }

  /**
   * Normalized class record (traits + defense bonuses + trained skills + builds).
   * @param {string} id
   */
  async getNormalizedClass(id) {
    await this.ready();
    if (!this._hasTable('class')) return null;
    const rows = this._queryAll(`SELECT * FROM class WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return null;
    const cls = rows[0];
    cls.defenseBonuses = this._queryAll(
      `SELECT defense, amount FROM class_defense_bonus WHERE class_id = ?`,
      [id]
    );
    cls.trainedSkills = this._queryAll(
      `SELECT skill_id, kind, choose_count FROM class_trained_skill WHERE class_id = ?`,
      [id]
    );
    cls.buildOptions = this._queryAll(
      `SELECT id, label FROM class_build_option WHERE class_id = ?`,
      [id]
    );
    cls.proficiencies = this._hasTable('class_proficiency')
      ? this._queryAll(`SELECT kind, value FROM class_proficiency WHERE class_id = ?`, [id])
      : [];
    return cls;
  }

  /**
   * Structured racial traits (languages, resistances, senses, free-text traits,
   * and parsed speed in squares) for a race id, else null when absent.
   * @param {string} raceId
   */
  async getNormalizedRaceTraits(raceId) {
    await this.ready();
    if (!this._hasTable('race')) return null;
    const base = this._queryAll(`SELECT speed_squares FROM race WHERE id = ? LIMIT 1`, [raceId]);
    if (!base.length) return null;
    return {
      speedSquares: base[0].speed_squares ?? null,
      languages: this._hasTable('race_language')
        ? this._queryAll(
            `SELECT language, is_choice, choose_count FROM race_language WHERE race_id = ?`,
            [raceId]
          )
        : [],
      resistances: this._hasTable('race_resistance')
        ? this._queryAll(
            `SELECT damage_type, amount, scaling_json FROM race_resistance WHERE race_id = ?`,
            [raceId]
          )
        : [],
      senses: this._hasTable('race_sense')
        ? this._queryAll(`SELECT sense FROM race_sense WHERE race_id = ?`, [raceId]).map((r) => r.sense)
        : [],
      traits: this._hasTable('race_trait')
        ? this._queryAll(`SELECT name, text FROM race_trait WHERE race_id = ?`, [raceId])
        : []
    };
  }

  /**
   * Base-race traits/powers a subrace replaces, else null when the table is
   * absent (caller falls back to runtime parse + curated map).
   * @param {string} raceId — the subrace id
   * @returns {Promise<Array<{ replacesName: string, replacesKind: string }> | null>}
   */
  async getRaceReplacements(raceId) {
    await this.ready();
    if (!this._hasTable('race_replacement')) return null;
    const rows = this._queryAll(
      `SELECT replaces_name, replaces_kind FROM race_replacement WHERE race_id = ?`,
      [raceId]
    );
    return rows.map((r) => ({ replacesName: r.replaces_name, replacesKind: r.replaces_kind }));
  }

  /**
   * Per-power ability-score options (e.g. attack with Str/Dex/Con) for a power
   * id, else null when the power offers no choice or the table is absent.
   * @param {string} powerId
   */
  async getPowerAbilityOptions(powerId) {
    await this.ready();
    if (!this._hasTable('power_ability_option')) return null;
    const rows = this._queryAll(
      `SELECT choice_group, ability, role FROM power_ability_option WHERE power_id = ?`,
      [powerId]
    );
    if (!rows.length) return null;
    return {
      choiceGroup: rows[0].choice_group,
      options: rows.map((r) => ({ ability: r.ability, role: r.role }))
    };
  }

  /**
   * Per-power damage-type options (e.g. Dragon Breath: acid/cold/fire/lightning/
   * poison) for a power id, else null when the power offers no choice or the
   * table is absent.
   * @param {string} powerId
   */
  async getPowerDamageOptions(powerId) {
    await this.ready();
    if (!this._hasTable('power_damage_option')) return null;
    const rows = this._queryAll(
      `SELECT choice_group, damage_type FROM power_damage_option WHERE power_id = ?`,
      [powerId]
    );
    if (!rows.length) return null;
    return {
      choiceGroup: rows[0].choice_group,
      options: rows.map((r) => ({ damageType: r.damage_type }))
    };
  }

  /**
   * Normalized power rows (exact power_type/level/class_name columns), else null.
   * @param {{ className?: string, level?: number, powerType?: string, limit?: number }} [opts]
   */
  async listNormalizedPowers(opts = {}) {
    await this.ready();
    if (!this._hasTable('power')) return null;
    const conds = [];
    const params = [];
    if (opts.className) {
      conds.push(`lower(class_name) LIKE ?`);
      params.push(`%${String(opts.className).toLowerCase()}%`);
    }
    if (opts.level != null && opts.level !== '') {
      conds.push(`level = ?`);
      params.push(parseInt(String(opts.level), 10));
    }
    if (opts.powerType) {
      conds.push(`power_type = ?`);
      params.push(opts.powerType);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return this._queryAll(
      `SELECT id, name, class_name, level, power_type, action, source_book FROM power ${where} ORDER BY name COLLATE NOCASE LIMIT ?`,
      [...params, opts.limit ?? 500]
    );
  }

  /**
   * Normalized equipment stats for an item id (armor or weapon), else null.
   * @param {string} id
   */
  async getNormalizedItemStats(id) {
    await this.ready();
    const name = this._hasTable('item')
      ? this._queryAll(`SELECT name FROM item WHERE id = ? LIMIT 1`, [id])[0]?.name ?? id
      : id;
    if (this._hasTable('armor_stats')) {
      const a = this._queryAll(`SELECT * FROM armor_stats WHERE item_id = ? LIMIT 1`, [id]);
      if (a.length) {
        const r = a[0];
        return r.is_shield
          ? { kind: 'shield', name, acBonus: r.ac_bonus, refBonus: r.ref_bonus, checkPenalty: r.check_penalty }
          : {
              kind: 'armor',
              name,
              acBonus: r.ac_bonus,
              checkPenalty: r.check_penalty,
              speedPenalty: r.speed_penalty,
              isHeavy: !!r.is_heavy,
              armorCategory: r.armor_category
            };
      }
    }
    if (this._hasTable('weapon_stats')) {
      const w = this._queryAll(`SELECT * FROM weapon_stats WHERE item_id = ? LIMIT 1`, [id]);
      if (w.length) {
        const r = w[0];
        const stats = {
          kind: 'weapon',
          name,
          proficiencyBonus: r.proficiency_bonus,
          damageDice: r.damage_dice,
          weaponGroup: r.weapon_group,
          range: r.range,
          attackAbility: r.attack_ability
        };
        if (r.ranged_attack_ability) stats.rangedAttackAbility = r.ranged_attack_ability;
        return stats;
      }
    }
    return null;
  }

  /**
   * Source-book release dates for the GM's "filter source by date" feature.
   * @returns {Promise<Record<string, { title: string, release_date: string | null, edition_era: string | null }> | null>}
   */
  async getSourceBookDates() {
    await this.ready();
    if (!this._hasTable('source_books')) return null;
    const rows = this._queryAll(
      `SELECT code, title, release_date, edition_era FROM source_books`
    );
    /** @type {Record<string, object>} */
    const map = {};
    for (const r of rows) {
      map[r.code] = { title: r.title, release_date: r.release_date, edition_era: r.edition_era };
    }
    return map;
  }

  getStatus() {
    return { mode: this.mode, dbPath: this.dbPath, normalized: this._hasTable('class') };
  }
}

export const compendium = new CompendiumProvider();

export { SEARCH_MIN as COMPENDIUM_SEARCH_MIN };
