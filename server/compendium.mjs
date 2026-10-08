import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compendiumStub from '../data/samples/compendium-stub.json' with { type: 'json' };
import { getHomebrewEntry } from './homebrew.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB = path.join(__dirname, '..', 'data', 'alter_ego.db');

/** @type {import('better-sqlite3').Database | null} */
let db = null;
/** @type {boolean | null} */
let dbChecked = false;

function getCompendiumDb() {
  if (dbChecked && !db) return null;
  if (db) return db;

  const dbPath = process.env.COMPENDIUM_DB_PATH || DEFAULT_DB;
  if (!fs.existsSync(dbPath)) {
    dbChecked = true;
    return null;
  }

  try {
    db = new Database(dbPath, { readonly: true });
    dbChecked = true;
    return db;
  } catch {
    dbChecked = true;
    db = null;
    return null;
  }
}

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
    listing_fields: listing,
    body_html: row.body_html ?? '',
    index_text: row.index_text ?? ''
  };
}

/**
 * @param {string} category
 * @param {string} entryId
 */
function getFromStub(category, entryId) {
  const cat = compendiumStub.categories?.[category];
  const hit = cat?.entries?.find((e) => e.id === entryId);
  if (!hit) return null;
  return { ...hit, category_slug: category };
}

/**
 * @param {string} category
 * @param {string} entryId
 */
function getFromSqlite(category, entryId) {
  const database = getCompendiumDb();
  if (!database) return null;

  const row = database
    .prepare(
      `SELECT id, category_slug, listing_fields, body_html, index_text
       FROM entries WHERE id = ? LIMIT 1`
    )
    .get(entryId);

  if (!row) return null;
  if (category && row.category_slug !== category) return null;
  const entry = rowToEntry(row);
  if (row.category_slug === 'monster') {
    const stats = getNormalizedMonsterStats(entryId);
    if (stats) entry.normalizedCombatStats = stats;
  }
  return entry;
}

/**
 * @param {string} category
 * @param {string} entryId
 */
export function getCompendiumEntry(category, entryId) {
  const id = String(entryId || '').trim();
  const cat = String(category || '').trim();
  if (!id) return null;

  if (id.startsWith('hb_')) {
    const hb = getHomebrewEntry(id);
    if (hb) {
      if (cat && hb.category_slug !== cat) return null;
      return hb;
    }
    return null;
  }

  const fromSqlite = getFromSqlite(cat, id);
  if (fromSqlite) return fromSqlite;

  return getFromStub(cat, id);
}

export function compendiumUsesSqlite() {
  return Boolean(getCompendiumDb());
}

/**
 * @param {string} table
 */
function compendiumHasTable(table) {
  const database = getCompendiumDb();
  if (!database) return false;
  return Boolean(
    database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(table)
  );
}

/** True when the normalized compendium tables are present. */
export function compendiumUsesNormalized() {
  return compendiumHasTable('class') || compendiumHasTable('race');
}

/**
 * All distinct source-book codes the normalizer recorded (one row per code,
 * including those without a known date). Empty when the normalized DB is absent.
 * @returns {string[]}
 */
export function listSourceBookCodes() {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('source_books')) return [];
  return database
    .prepare(`SELECT code FROM source_books ORDER BY code`)
    .all()
    .map((r) => r.code)
    .filter(Boolean);
}

/**
 * Structured racial traits for a race id (languages, resistances, senses,
 * free-text traits, parsed speed). Mirrors the browser provider; null when the
 * normalized tables are absent.
 * @param {string} raceId
 */
export function getNormalizedRaceTraits(raceId) {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('race')) return null;
  const base = database.prepare(`SELECT speed_squares FROM race WHERE id = ? LIMIT 1`).get(raceId);
  if (!base) return null;
  return {
    speedSquares: base.speed_squares ?? null,
    languages: compendiumHasTable('race_language')
      ? database
          .prepare(`SELECT language, is_choice, choose_count FROM race_language WHERE race_id = ?`)
          .all(raceId)
      : [],
    resistances: compendiumHasTable('race_resistance')
      ? database
          .prepare(`SELECT damage_type, amount, scaling_json FROM race_resistance WHERE race_id = ?`)
          .all(raceId)
      : [],
    senses: compendiumHasTable('race_sense')
      ? database.prepare(`SELECT sense FROM race_sense WHERE race_id = ?`).all(raceId).map((r) => r.sense)
      : [],
    traits: compendiumHasTable('race_trait')
      ? database.prepare(`SELECT name, text FROM race_trait WHERE race_id = ?`).all(raceId)
      : []
  };
}

/**
 * Base-race traits/powers a subrace replaces, else null when the table is
 * absent. Mirrors the browser provider.
 * @param {string} raceId — the subrace id
 */
export function getRaceReplacements(raceId) {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('race_replacement')) return null;
  const rows = database
    .prepare(`SELECT replaces_name, replaces_kind FROM race_replacement WHERE race_id = ?`)
    .all(raceId);
  return rows.map((r) => ({ replacesName: r.replaces_name, replacesKind: r.replaces_kind }));
}

/**
 * Per-power ability-score options (e.g. attack with Str/Dex/Con) for a power id,
 * else null. Mirrors the browser provider.
 * @param {string} powerId
 */
export function getPowerAbilityOptions(powerId) {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('power_ability_option')) return null;
  const rows = database
    .prepare(`SELECT choice_group, ability, role FROM power_ability_option WHERE power_id = ?`)
    .all(powerId);
  if (!rows.length) return null;
  return {
    choiceGroup: rows[0].choice_group,
    options: rows.map((r) => ({ ability: r.ability, role: r.role }))
  };
}

/**
 * Per-power damage-type options (e.g. Dragon Breath) for a power id, else null.
 * Mirrors the browser provider.
 * @param {string} powerId
 */
export function getPowerDamageOptions(powerId) {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('power_damage_option')) return null;
  const rows = database
    .prepare(`SELECT choice_group, damage_type FROM power_damage_option WHERE power_id = ?`)
    .all(powerId);
  if (!rows.length) return null;
  return {
    choiceGroup: rows[0].choice_group,
    options: rows.map((r) => ({ damageType: r.damage_type }))
  };
}

/**
 * Normalized equipment stats for an item id (armor/weapon), else null. Mirrors
 * the browser provider so server-side spawn can use structured stats.
 * @param {string} entryId
 */
export function getNormalizedItemStats(entryId) {
  const database = getCompendiumDb();
  if (!database) return null;
  const name = compendiumHasTable('item')
    ? database.prepare(`SELECT name FROM item WHERE id = ? LIMIT 1`).get(entryId)?.name ?? entryId
    : entryId;
  if (compendiumHasTable('armor_stats')) {
    const a = database.prepare(`SELECT * FROM armor_stats WHERE item_id = ? LIMIT 1`).get(entryId);
    if (a) {
      return a.is_shield
        ? { kind: 'shield', name, acBonus: a.ac_bonus, refBonus: a.ref_bonus, checkPenalty: a.check_penalty }
        : {
            kind: 'armor',
            name,
            acBonus: a.ac_bonus,
            checkPenalty: a.check_penalty,
            speedPenalty: a.speed_penalty,
            isHeavy: !!a.is_heavy,
            armorCategory: a.armor_category
          };
    }
  }
  if (compendiumHasTable('weapon_stats')) {
    const w = database.prepare(`SELECT * FROM weapon_stats WHERE item_id = ? LIMIT 1`).get(entryId);
    if (w) {
      const stats = {
        kind: 'weapon',
        name,
        proficiencyBonus: w.proficiency_bonus,
        damageDice: w.damage_dice,
        weaponGroup: w.weapon_group,
        range: w.range,
        attackAbility: w.attack_ability
      };
      if (w.ranged_attack_ability) stats.rangedAttackAbility = w.ranged_attack_ability;
      return stats;
    }
  }
  return null;
}

/**
 * Normalized monster combat stats for spawn, else null.
 * @param {string} monsterId
 */
export function getNormalizedMonsterStats(monsterId) {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('monster_combat_stats')) return null;
  const r = database
    .prepare(`SELECT * FROM monster_combat_stats WHERE monster_id = ? LIMIT 1`)
    .get(monsterId);
  if (!r) return null;
  return {
    hp: r.hp,
    bloodiedHp: r.bloodied_hp,
    ac: r.ac,
    fort: r.fort,
    ref: r.ref,
    will: r.will,
    initiative: r.initiative,
    speedSquares: r.speed_squares,
    perception: r.perception,
    xp: r.xp
  };
}

/**
 * @returns {Map<string, Array<{ kind: string, target: string | null, min_value: number | null, logic_group: number }>> | null}
 */
export function getFeatPrerequisiteMap() {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('feat_prerequisite')) return null;
  const rows = database
    .prepare(`SELECT feat_id, kind, target, min_value, logic_group FROM feat_prerequisite ORDER BY feat_id, logic_group`)
    .all();
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const r of rows) {
    const list = map.get(r.feat_id) ?? [];
    list.push({
      kind: r.kind,
      target: r.target,
      min_value: r.min_value,
      logic_group: r.logic_group
    });
    map.set(r.feat_id, list);
  }
  return map;
}

/**
 * @param {string} featId
 */
export function getNormalizedFeat(featId) {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('feat')) return null;
  const row = database.prepare(`SELECT * FROM feat WHERE id = ? LIMIT 1`).get(featId);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    prerequisiteRaw: row.prerequisite_raw,
    sourceBook: row.source_book,
    benefitText: row.benefit_text,
    prerequisites: compendiumHasTable('feat_prerequisite')
      ? database
          .prepare(`SELECT kind, target, min_value, logic_group FROM feat_prerequisite WHERE feat_id = ?`)
          .all(featId)
      : [],
    skillBonuses: compendiumHasTable('feat_skill_bonus')
      ? database
          .prepare(`SELECT skill, amount, bonus_type FROM feat_skill_bonus WHERE feat_id = ?`)
          .all(featId)
      : [],
    abilityBonuses: compendiumHasTable('feat_ability_bonus')
      ? database
          .prepare(
            `SELECT ability, amount, choice_group, excludes_item_bonus FROM feat_ability_bonus WHERE feat_id = ?`
          )
          .all(featId)
      : [],
    grants: compendiumHasTable('feat_grant')
      ? database.prepare(`SELECT kind, value FROM feat_grant WHERE feat_id = ?`).all(featId)
      : []
  };
}

/**
 * @param {{ maxLevel?: number }} [opts]
 */
export function listNormalizedRituals(opts = {}) {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('ritual')) return [];
  const maxLevel = opts.maxLevel != null ? Number(opts.maxLevel) : null;
  if (maxLevel != null && !Number.isNaN(maxLevel)) {
    return database
      .prepare(`SELECT id, name, level, source_book FROM ritual WHERE level IS NULL OR level <= ? ORDER BY name`)
      .all(maxLevel);
  }
  return database.prepare(`SELECT id, name, level, source_book FROM ritual ORDER BY name`).all();
}

/**
 * Class ritual grants from normalized ETL.
 * @param {string} classId
 */
export function getClassRitualGrants(classId) {
  const database = getCompendiumDb();
  if (!database || !compendiumHasTable('class_ritual_grant')) return null;
  return database
    .prepare(`SELECT ritual_id FROM class_ritual_grant WHERE class_id = ?`)
    .all(classId)
    .map((r) => r.ritual_id);
}
