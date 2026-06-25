#!/usr/bin/env node
/**
 * Compendium normalizer (ETL).
 *
 * Reads the denormalized `entries` table produced by the external iws.mx
 * importer and writes structured, normalized tables into the SAME SQLite file
 * (see tools/normalize/schema.sql). Parsing happens here, once, at build time
 * instead of at runtime in the browser -- a failed parse becomes a row in
 * `normalize_warnings` (a data-quality item) rather than a live rendering bug.
 *
 * Usage:
 *   node tools/normalize/normalize.mjs                  # normalize data/alter_ego.db in place
 *   node tools/normalize/normalize.mjs --src path.db    # read a different denormalized DB
 *   node tools/normalize/normalize.mjs --out other.db   # write normalized tables elsewhere
 *   node tools/normalize/normalize.mjs --from-stub      # build a dev DB from the JSON stub, then normalize
 *   node tools/normalize/normalize.mjs --report         # print the warnings summary
 *
 * The existing parser modules are reused (not duplicated); over time their
 * logic migrates here and the runtime callers are retired.
 */
import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseClassEntry, parseBuildSuggestedSkills, parseBuildSuggestedPowerNames, parseBuildSuggestedFeatNames } from '../../src/character/class-parse.js';
import { getEquipmentStats } from '../../src/character/equipment-stats.js';
import { normalizePowerType } from '../../src/editor/power-filter.js';
import { bonusesFromEntry } from '../../src/character/tutor.js';
import { parseRaceMechanics, extractPowerIdsFromRaceHtml, extractFeatIdsFromRaceHtml } from '../../src/character/race-parse.js';
import { getParentRaceId, inferParentFromName, isSubraceId } from '../../src/character/race-subraces.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');
const DEFAULT_DB = resolve(projectRoot, 'data/alter_ego.db');
const STUB_PATH = resolve(projectRoot, 'data/samples/compendium-stub.json');
const SCHEMA_PATH = resolve(__dirname, 'schema.sql');
const SOURCE_BOOKS_PATH = resolve(projectRoot, 'metadata/source-books.json');
const PRESETS_PATH = resolve(projectRoot, 'metadata/quick-build-presets.json');

/**
 * Authoritative class HP/surge/speed by classId, mirroring src/character/hp.js
 * (which reads the same preset table). The class HTML rarely carries the HP
 * prose, so this is the real source the app uses; the normalizer prefers it and
 * falls back to the HTML parse.
 */
function loadClassPresets() {
  try {
    const presets = JSON.parse(readFileSync(PRESETS_PATH, 'utf8'));
    /** @type {Record<string, { hpAt1: number|null, hpPerLevel: number|null, surges: number|null, speed: number|null }>} */
    const map = {};
    for (const cls of Object.values(presets.classes ?? {})) {
      if (!cls.classId) continue;
      map[cls.classId] = {
        hpAt1: cls.sheet?.maxHpAt1 ?? null,
        hpPerLevel: cls.sheet?.hpPerLevel ?? null,
        surges: cls.sheet?.surgesPerDay ?? null,
        speed: cls.sheet?.baseSpeed ?? null
      };
    }
    return map;
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const args = { src: null, out: null, fromStub: false, report: false, ifExists: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from-stub') args.fromStub = true;
    else if (a === '--report') args.report = true;
    else if (a === '--if-exists') args.ifExists = true;
    else if (a === '--src') args.src = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function hasColumn(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  } catch {
    return false;
  }
}

function hasTable(db, table) {
  return Boolean(
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table)
  );
}

/** Flatten the JSON stub into entry objects and seed a denormalized `entries` table. */
function seedEntriesFromStub(db) {
  const stub = JSON.parse(readFileSync(STUB_PATH, 'utf8'));
  db.exec(`
    DROP TABLE IF EXISTS entries;
    CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      category_slug TEXT NOT NULL,
      listing_fields TEXT NOT NULL,
      body_html TEXT,
      index_text TEXT,
      source TEXT NOT NULL DEFAULT 'compendium',
      ability_bonuses_json TEXT,
      skill_bonuses_json TEXT
    );
    DROP TABLE IF EXISTS categories;
    CREATE TABLE categories (slug TEXT PRIMARY KEY, display_name TEXT, entry_count INTEGER);
  `);
  const insEntry = db.prepare(
    `INSERT OR REPLACE INTO entries
       (id, category_slug, listing_fields, body_html, index_text, source, ability_bonuses_json, skill_bonuses_json)
     VALUES (@id, @category_slug, @listing_fields, @body_html, @index_text, 'compendium', @ability_bonuses_json, @skill_bonuses_json)`
  );
  const insCat = db.prepare(`INSERT OR REPLACE INTO categories (slug, display_name, entry_count) VALUES (?, ?, ?)`);
  const tx = db.transaction(() => {
    for (const [slug, cat] of Object.entries(stub.categories ?? {})) {
      const entries = cat.entries ?? [];
      insCat.run(slug, cat.displayName ?? slug, entries.length);
      for (const e of entries) {
        insEntry.run({
          id: e.id,
          category_slug: slug,
          listing_fields: JSON.stringify(e.listing_fields ?? {}),
          body_html: e.body_html ?? '',
          index_text: e.index_text ?? '',
          ability_bonuses_json: e.ability_bonuses ? JSON.stringify(e.ability_bonuses) : null,
          skill_bonuses_json: e.skill_bonuses ? JSON.stringify(e.skill_bonuses) : null
        });
      }
    }
  });
  tx();
}

/** Read denormalized entries into parser-shaped objects, grouped by category slug. */
function readEntries(db) {
  if (!hasTable(db, 'entries')) {
    throw new Error('Source database has no `entries` table. Run the importer first, or pass --from-stub.');
  }
  const hasSource = hasColumn(db, 'entries', 'source');
  const hasAbility = hasColumn(db, 'entries', 'ability_bonuses_json');
  const hasSkill = hasColumn(db, 'entries', 'skill_bonuses_json');
  const where = hasSource ? `WHERE source = 'compendium'` : '';
  const rows = db
    .prepare(`SELECT id, category_slug, listing_fields, body_html, index_text${hasAbility ? ', ability_bonuses_json' : ''}${hasSkill ? ', skill_bonuses_json' : ''} FROM entries ${where}`)
    .all();

  /** @type {Map<string, Array<object>>} */
  const byCategory = new Map();
  for (const row of rows) {
    const entry = {
      id: row.id,
      category_slug: row.category_slug,
      listing_fields:
        typeof row.listing_fields === 'string' ? JSON.parse(row.listing_fields || '{}') : row.listing_fields ?? {},
      body_html: row.body_html ?? '',
      index_text: row.index_text ?? ''
    };
    if (row.ability_bonuses_json) entry.ability_bonuses = JSON.parse(row.ability_bonuses_json);
    if (row.skill_bonuses_json) entry.skill_bonuses = JSON.parse(row.skill_bonuses_json);
    if (!byCategory.has(row.category_slug)) byCategory.set(row.category_slug, []);
    byCategory.get(row.category_slug).push(entry);
  }
  return byCategory;
}

class Warnings {
  constructor(db) {
    this.stmt = db.prepare(
      `INSERT INTO normalize_warnings (category, entry_id, kind, message) VALUES (?, ?, ?, ?)`
    );
    this.count = 0;
  }
  add(category, entryId, kind, message) {
    this.stmt.run(category, entryId ?? null, kind, message);
    this.count += 1;
  }
}

function splitBooks(raw) {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function costToGp(raw) {
  const m = String(raw ?? '').match(/([\d,]+(?:\.\d+)?)\s*gp/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Parse a single integer gp amount from a token (digits only, no thousands commas). */
function tokenToGp(raw) {
  const digits = String(raw ?? '').replace(/[^\d.]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * Split an item's compound Level/Cost listing fields into ascending tiers.
 *
 * Level/Cost are encoded as comma lists where element [0] is a "starting at"
 * summary (e.g. "1+" / "360+ gp") and the remaining elements are positionally
 * aligned level<->cost pairs in a scrambled order (e.g. "1,16,6,21,11,26").
 * Thousands separators only appear in the summary token, so we drop [0] first.
 *
 * @param {string|null|undefined} levelRaw
 * @param {string|null|undefined} costRaw
 * @returns {{ tiers: Array<{ level: number, costGp: number|null, enhancement: number }>, mismatch: boolean }}
 */
function parseItemTiers(levelRaw, costRaw) {
  const levelStr = String(levelRaw ?? '').trim();
  const costStr = String(costRaw ?? '').trim();
  if (!levelStr) return { tiers: [], mismatch: false };

  const isCompound = levelStr.includes(',');
  if (!isCompound) {
    const level = Number((levelStr.match(/\d+/) ?? [])[0]);
    if (!Number.isFinite(level)) return { tiers: [], mismatch: false };
    return {
      tiers: [{ tier: 1, level, costGp: costToGp(costStr), enhancement: 1 + Math.floor((level - 1) / 5) }],
      mismatch: false
    };
  }

  // Drop the leading "starting at" summary from each list. The level summary
  // ("5+") never has an internal comma, so slice(1) is safe. The cost summary
  // ("1,000+ gp") can contain a thousands comma, so strip everything up to and
  // including the first "gp," boundary instead of a naive comma split.
  const levelTokens = levelStr.split(',').slice(1);
  const gpIdx = costStr.search(/gp/i);
  let costRest = '';
  if (gpIdx >= 0) {
    const comma = costStr.indexOf(',', gpIdx);
    costRest = comma >= 0 ? costStr.slice(comma + 1) : '';
  } else {
    costRest = costStr.split(',').slice(1).join(',');
  }
  const costTokens = costRest.split(',').map((t) => t.trim()).filter(Boolean);

  const levels = levelTokens.map((t) => Number((t.match(/\d+/) ?? [])[0])).filter((n) => Number.isFinite(n));
  if (!levels.length) return { tiers: [], mismatch: true };

  const mismatch = costTokens.length !== levelTokens.length;
  const tiers = levels
    .map((level, i) => ({
      level,
      costGp: mismatch ? null : tokenToGp(costTokens[i]),
      enhancement: 1 + Math.floor((level - 1) / 5)
    }))
    .sort((a, b) => a.level - b.level)
    .map((t, i) => ({ tier: i + 1, ...t }));

  return { tiers, mismatch };
}

function findMechanicPair(entry, norms) {
  const { pairs } = parseRaceMechanics(entry);
  for (const p of pairs) {
    if (norms.includes(p.norm)) return p.displayValue ?? p.value;
  }
  return null;
}

// --- Per-category normalizers --------------------------------------------

function normalizeSourceBooks(db, byCategory, warnings) {
  const seed = JSON.parse(readFileSync(SOURCE_BOOKS_PATH, 'utf8')).books ?? {};
  const codes = new Set(Object.keys(seed));
  for (const entries of byCategory.values()) {
    for (const e of entries) {
      for (const b of splitBooks(e.listing_fields?.SourceBook)) codes.add(b);
    }
  }
  const ins = db.prepare(
    `INSERT OR REPLACE INTO source_books (code, title, release_date, edition_era) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const code of [...codes].sort()) {
      const meta = seed[code] ?? {};
      ins.run(code, meta.title ?? code, meta.release_date ?? null, meta.edition_era ?? null);
      if (!meta.release_date) warnings.add('source_books', code, 'missing-date', `No release_date for source book "${code}" (GM to fill in).`);
    }
  });
  tx();
  return codes.size;
}

function normalizeRaces(db, byCategory, warnings) {
  const races = byCategory.get('race') ?? [];
  const insRace = db.prepare(
    `INSERT OR REPLACE INTO race (id, name, origin, size, speed, vision, source_book, is_subrace) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insAbil = db.prepare(
    `INSERT INTO race_ability_bonus (race_id, ability, amount, choice_group, alternatives_json, note) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insSkill = db.prepare(`INSERT INTO race_skill_bonus (race_id, skill, amount) VALUES (?, ?, ?)`);
  const insGrant = db.prepare(`INSERT INTO race_grant (race_id, kind, entry_id) VALUES (?, ?, ?)`);
  const insSub = db.prepare(`INSERT OR REPLACE INTO race_subrace (parent_race_id, subrace_race_id) VALUES (?, ?)`);

  const tx = db.transaction(() => {
    for (const e of races) {
      const lf = e.listing_fields ?? {};
      const subraceFlag = isSubraceId(e.id) ? 1 : 0;
      insRace.run(
        e.id,
        lf.Name ?? e.id,
        lf.Origin ?? null,
        lf.Size ?? findMechanicPair(e, ['size']),
        findMechanicPair(e, ['speed']),
        findMechanicPair(e, ['vision']),
        lf.SourceBook ?? null,
        subraceFlag
      );

      const { ability, skill } = bonusesFromEntry(e, 'race');
      for (const b of ability) {
        insAbil.run(
          e.id,
          b.ability,
          b.amount,
          b.choiceGroup ?? null,
          b.alternatives?.length ? JSON.stringify(b.alternatives) : null,
          b.note ?? null
        );
      }
      for (const b of skill) insSkill.run(e.id, b.skill, b.amount);

      if (!ability.length && !subraceFlag) {
        warnings.add('race', e.id, 'no-ability-bonus', `Race "${lf.Name ?? e.id}" produced no ability bonuses.`);
      }

      for (const pid of extractPowerIdsFromRaceHtml(e.body_html)) insGrant.run(e.id, 'power', pid);
      for (const fid of extractFeatIdsFromRaceHtml(e.body_html)) insGrant.run(e.id, 'feat', fid);

      // Subrace -> parent mapping (static map first, then name inference).
      const parent = getParentRaceId(e.id) ?? inferParentFromName(e, races);
      if (parent && parent !== e.id) insSub.run(parent, e.id);
    }
  });
  tx();
  return races.length;
}

function resolveHybridParent(entry, classEntries) {
  const name = String(entry.listing_fields?.Name ?? '');
  if (!/^hybrid\s+/i.test(name)) return null;
  const base = name.replace(/^hybrid\s+/i, '').trim().toLowerCase();
  if (!base) return null;
  const hit = classEntries.find(
    (c) => String(c.listing_fields?.Name ?? '').trim().toLowerCase() === base
  );
  return hit?.id ?? null;
}

function normalizeClasses(db, byCategory, warnings) {
  const classes = byCategory.get('class') ?? [];
  const insClass = db.prepare(
    `INSERT OR REPLACE INTO class
       (id, name, role, power_source, key_abilities, hp_at1_base, hp_per_level, surges_base, base_speed, source_book, is_hybrid, hybrid_parent_class_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insDef = db.prepare(`INSERT INTO class_defense_bonus (class_id, defense, amount) VALUES (?, ?, ?)`);
  const insSkill = db.prepare(`INSERT INTO class_trained_skill (class_id, skill_id, kind, choose_count) VALUES (?, ?, ?, ?)`);
  const insBuild = db.prepare(`INSERT OR REPLACE INTO class_build_option (id, class_id, label) VALUES (?, ?, ?)`);
  const insSugg = db.prepare(`INSERT INTO class_build_suggested (class_id, build_id, kind, value) VALUES (?, ?, ?, ?)`);
  const insProf = db.prepare(`INSERT INTO class_proficiency (class_id, kind, value) VALUES (?, ?, ?)`);
  const presets = loadClassPresets();

  const tx = db.transaction(() => {
    for (const e of classes) {
      const lf = e.listing_fields ?? {};
      const parsed = parseClassEntry(e);
      const isHybrid = /^hybrid\s+/i.test(String(lf.Name ?? '')) ? 1 : 0;
      const hybridParent = isHybrid ? resolveHybridParent(e, classes) : null;

      // Prefer the preset HP/surge/speed table (the runtime source); fall back
      // to whatever the HTML parse produced.
      const preset = presets[e.id] ?? {};
      const hpAt1 = parsed.hpAt1Base ?? preset.hpAt1 ?? null;
      const hpPerLevel = parsed.hpPerLevel ?? preset.hpPerLevel ?? null;
      const surges = parsed.surgesBase ?? preset.surges ?? null;
      const speed = parsed.baseSpeed ?? preset.speed ?? null;

      insClass.run(
        e.id,
        parsed.title || lf.Name || e.id,
        parsed.role || null,
        parsed.powerSource || null,
        parsed.keyAbilities || null,
        hpAt1,
        hpPerLevel,
        surges,
        speed,
        lf.SourceBook ?? null,
        isHybrid,
        hybridParent
      );

      for (const def of ['ac', 'fort', 'ref', 'will']) {
        const amt = parsed.defenseBonuses?.[def] ?? 0;
        if (amt) insDef.run(e.id, def, amt);
      }

      const ts = parsed.trainedSkills;
      if (ts.kind === 'fixed') {
        for (const s of ts.fixedSkills) insSkill.run(e.id, s, 'fixed', 0);
      } else if (ts.kind === 'choice') {
        for (const s of ts.fixedSkills) insSkill.run(e.id, s, 'fixed', 0);
        const pool = ts.classSkills.length ? ts.classSkills : ts.fixedSkills;
        for (const s of pool) insSkill.run(e.id, s, 'pool', ts.chooseCount);
      }

      for (const pair of parsed.traitPairs ?? []) {
        const label = String(pair.label ?? '').toLowerCase();
        let kind = null;
        if (/armor\s*prof/.test(label)) kind = 'armor';
        else if (/shield/.test(label)) kind = 'shield';
        else if (/weapon\s*prof/.test(label)) kind = 'weapon';
        else if (/implement/.test(label)) kind = 'implement';
        if (!kind) continue;
        for (const v of String(pair.value ?? '').split(/,|\band\b/i).map((s) => s.trim().replace(/\.$/, '')).filter(Boolean)) {
          insProf.run(e.id, kind, v);
        }
      }

      const suggSkills = parseBuildSuggestedSkills(e.body_html, parsed.buildOptions);
      const suggPowers = parseBuildSuggestedPowerNames(e.body_html, parsed.buildOptions);
      const suggFeats = parseBuildSuggestedFeatNames(e.body_html, parsed.buildOptions);
      for (const opt of parsed.buildOptions) {
        insBuild.run(opt.id, e.id, opt.label);
        for (const s of suggSkills[opt.id] ?? []) insSugg.run(e.id, opt.id, 'skill', s);
        const p = suggPowers[opt.id];
        if (p) {
          for (const v of p.atWill ?? []) insSugg.run(e.id, opt.id, 'atwill', v);
          for (const v of p.encounter ?? []) insSugg.run(e.id, opt.id, 'encounter', v);
          for (const v of p.daily ?? []) insSugg.run(e.id, opt.id, 'daily', v);
        }
        if (suggFeats[opt.id]) insSugg.run(e.id, opt.id, 'feat', suggFeats[opt.id]);
      }

      if (!isHybrid && (hpAt1 == null || hpPerLevel == null)) {
        warnings.add('class', e.id, 'missing-hp', `Class "${parsed.title || e.id}" missing HP base/per-level (hp1=${hpAt1}, perLevel=${hpPerLevel}).`);
      }
      if (isHybrid && !hybridParent) {
        warnings.add('class', e.id, 'hybrid-no-parent', `Hybrid class "${lf.Name}" could not be matched to a parent class entry.`);
      }
    }
  });
  tx();
  return classes.length;
}

function normalizePowers(db, byCategory, warnings) {
  const powers = byCategory.get('power') ?? [];
  const ins = db.prepare(
    `INSERT OR REPLACE INTO power (id, name, class_name, level, power_type, action, source_book) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const e of powers) {
      const lf = e.listing_fields ?? {};
      const lvl = parseInt(String(lf.Level ?? ''), 10);
      const ptype = normalizePowerType(lf.Type);
      ins.run(
        e.id,
        lf.Name ?? e.id,
        lf.ClassName ?? null,
        Number.isNaN(lvl) ? null : lvl,
        ptype,
        lf.Action ?? null,
        lf.SourceBook ?? null
      );
      if (!ptype) warnings.add('power', e.id, 'unknown-type', `Power "${lf.Name ?? e.id}" has unrecognized Type "${lf.Type ?? ''}".`);
    }
  });
  tx();
  return powers.length;
}

const SLOT_KEYWORDS = ['Head', 'Neck', 'Arms', 'Hands', 'Waist', 'Feet', 'Ring'];

/**
 * Derive the worn-item slot from the entry. 4e items state their slot in the
 * body as "<X> Slot" (e.g. "Neck Slot") rather than in the Type field, which is
 * usually empty for wondrous items. Falls back to a few unambiguous name cues
 * so slot-less bodies (cloak, periapt, medallion, bracers, ...) still resolve.
 * @param {string} html
 * @param {string} name
 * @returns {string|null} canonical slot: head|neck|arms|hands|waist|feet|ring
 */
function deriveItemSlot(html, name) {
  const text = String(html ?? '');
  const slotRe = new RegExp(`\\b(${SLOT_KEYWORDS.join('|')})\\s+Slot\\b`, 'i');
  const m = text.match(slotRe) || text.match(new RegExp(`Item\\s*Slot\\s*:?\\s*(${SLOT_KEYWORDS.join('|')})`, 'i'));
  if (m) return m[1].toLowerCase();

  const n = String(name ?? '');
  if (/\b(amulet|cloak|periapt|medallion|necklace|torc|brooch|scarab|talisman)\b/i.test(n)) return 'neck';
  if (/\b(bracers?|armbands?|vambraces?)\b/i.test(n)) return 'arms';
  if (/\b(gloves?|gauntlets?)\b/i.test(n)) return 'hands';
  if (/\b(boots?|sandals?|greaves?)\b/i.test(n)) return 'feet';
  if (/\b(belt|girdle|sash)\b/i.test(n)) return 'waist';
  if (/\b(helm|helmet|circlet|crown|diadem|coif|mask|goggles?)\b/i.test(n)) return 'head';
  if (/\bring\b/i.test(n)) return 'ring';
  return null;
}

function normalizeEquipment(db, byCategory, warnings) {
  const slugs = ['weapon', 'armor', 'implement', 'item'];
  const insItem = db.prepare(
    `INSERT OR REPLACE INTO item (id, name, category, type, level, cost_gp, rarity, source_book, slot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insArmor = db.prepare(
    `INSERT OR REPLACE INTO armor_stats (item_id, ac_bonus, check_penalty, speed_penalty, ref_bonus, is_heavy, is_shield, armor_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insWeapon = db.prepare(
    `INSERT OR REPLACE INTO weapon_stats (item_id, proficiency_bonus, damage_dice, weapon_group, range, attack_ability, ranged_attack_ability) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insLevel = db.prepare(
    `INSERT OR REPLACE INTO item_level (item_id, tier, level, cost_gp, enhancement) VALUES (?, ?, ?, ?, ?)`
  );
  let count = 0;
  const tx = db.transaction(() => {
    for (const slug of slugs) {
      for (const e of byCategory.get(slug) ?? []) {
        const lf = e.listing_fields ?? {};
        const slot = slug === 'item' ? deriveItemSlot(e.body_html, lf.Name) : null;

        const { tiers, mismatch } = parseItemTiers(lf.Level, lf.Cost);
        for (const t of tiers) insLevel.run(e.id, t.tier, t.level, t.costGp, t.enhancement);
        if (mismatch) {
          warnings.add('item', e.id, 'tier-mismatch', `Item "${lf.Name ?? e.id}" has mismatched Level/Cost tiers (Level="${lf.Level ?? ''}", Cost="${lf.Cost ?? ''}"); costs left null.`);
        }
        // Parent item cost: the lowest tier's cost, falling back to the single-cost parse.
        const baseCost = tiers.find((t) => t.costGp != null)?.costGp ?? costToGp(lf.Cost);

        insItem.run(
          e.id,
          lf.Name ?? e.id,
          slug,
          lf.Type ?? null,
          lf.Level ?? null,
          baseCost,
          lf.Rarity ?? null,
          lf.SourceBook ?? null,
          slot
        );
        count += 1;

        const stats = getEquipmentStats({ ...e, category_slug: slug });
        if (stats?.kind === 'armor') {
          const heavy = /plate|scale|chain/i.test(`${stats.armorCategory ?? ''} ${lf.Type ?? ''}`) ? 1 : 0;
          insArmor.run(e.id, stats.acBonus ?? 0, stats.checkPenalty ?? 0, stats.speedPenalty ?? 0, 0, heavy, 0, stats.armorCategory ?? null);
        } else if (stats?.kind === 'shield') {
          insArmor.run(e.id, stats.acBonus ?? 0, stats.checkPenalty ?? 0, 0, stats.refBonus ?? 0, 0, 1, 'shield');
        } else if (stats?.kind === 'weapon') {
          insWeapon.run(e.id, stats.proficiencyBonus ?? 0, stats.damageDice ?? null, stats.weaponGroup ?? null, stats.range ?? null, stats.attackAbility ?? null, stats.rangedAttackAbility ?? null);
        }
      }
    }
  });
  tx();
  return count;
}

function normalizeBackgrounds(db, byCategory) {
  const backgrounds = byCategory.get('background') ?? [];
  const insBg = db.prepare(`INSERT OR REPLACE INTO background (id, name, type, campaign, source_book) VALUES (?, ?, ?, ?, ?)`);
  const insSkill = db.prepare(`INSERT INTO background_skill_bonus (background_id, skill, amount, bonus_type) VALUES (?, ?, ?, ?)`);
  const tx = db.transaction(() => {
    for (const e of backgrounds) {
      const lf = e.listing_fields ?? {};
      insBg.run(e.id, lf.Name ?? e.id, lf.Type ?? null, lf.Campaign ?? null, lf.SourceBook ?? null);
      const { skill } = bonusesFromEntry(e, 'background');
      for (const b of skill) insSkill.run(e.id, b.skill, b.amount, b.bonusType ?? null);
    }
  });
  tx();
  return backgrounds.length;
}

function writeMeta(db, meta) {
  const ins = db.prepare(`INSERT OR REPLACE INTO norm_meta (key, value) VALUES (?, ?)`);
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(meta)) ins.run(k, String(v));
  });
  tx();
}

function main() {
  const args = parseArgs(process.argv);
  const srcPath = resolve(projectRoot, args.src ?? DEFAULT_DB);
  const outPath = resolve(projectRoot, args.out ?? args.src ?? DEFAULT_DB);

  if (!args.fromStub && !existsSync(srcPath)) {
    if (args.ifExists) {
      console.log(`[normalize] Source DB not found (${srcPath}); skipping (--if-exists).`);
      return;
    }
    console.error(`[normalize] Source DB not found: ${srcPath}`);
    console.error('[normalize] Run the importer first, or pass --from-stub to build a dev DB from the JSON stub.');
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });

  // When the source and output are the same file we normalize in place;
  // otherwise we copy entries across by reading src and writing out.
  const inPlace = srcPath === outPath && !args.fromStub;
  const db = new Database(outPath);

  if (args.fromStub) {
    seedEntriesFromStub(db);
  } else if (!inPlace) {
    // Attach the source and copy its entries/categories into the output file.
    const srcDb = new Database(srcPath, { readonly: true });
    const rows = srcDb.prepare(`SELECT * FROM entries`).all();
    const cols = rows.length ? Object.keys(rows[0]) : ['id', 'category_slug', 'listing_fields', 'body_html', 'index_text'];
    db.exec(`DROP TABLE IF EXISTS entries; CREATE TABLE entries (${cols.map((c) => `${c} TEXT`).join(', ')});`);
    const ins = db.prepare(`INSERT INTO entries (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    const tx = db.transaction(() => {
      for (const r of rows) ins.run(cols.map((c) => r[c]));
    });
    tx();
    srcDb.close();
  }

  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));

  const byCategory = readEntries(db);
  const warnings = new Warnings(db);

  const counts = {
    source_books: normalizeSourceBooks(db, byCategory, warnings),
    race: normalizeRaces(db, byCategory, warnings),
    class: normalizeClasses(db, byCategory, warnings),
    power: normalizePowers(db, byCategory, warnings),
    item: normalizeEquipment(db, byCategory, warnings),
    background: normalizeBackgrounds(db, byCategory)
  };

  writeMeta(db, {
    generated_at: new Date().toISOString(),
    source: args.fromStub ? 'stub' : srcPath,
    schema_version: 1,
    ...Object.fromEntries(Object.entries(counts).map(([k, v]) => [`count_${k}`, v])),
    warnings: warnings.count
  });

  console.log('[normalize] Wrote normalized tables to', outPath);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`  warnings: ${warnings.count}`);

  if (args.report && warnings.count) {
    const rows = db
      .prepare(`SELECT category, kind, COUNT(*) AS n FROM normalize_warnings GROUP BY category, kind ORDER BY n DESC`)
      .all();
    console.log('\n[normalize] Warnings by category/kind:');
    for (const r of rows) console.log(`  ${r.category}/${r.kind}: ${r.n}`);
  }

  // Fold any WAL frames back into the main file so the WAL-unaware sql.js
  // browser reader sees a self-contained .db.
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    /* default journal mode: nothing to checkpoint */
  }
  db.close();
}

main();
