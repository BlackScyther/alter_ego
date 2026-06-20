import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compendiumStub from '../data/samples/compendium-stub.json' with { type: 'json' };
import { getHomebrewEntry } from './homebrew.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB = path.join(__dirname, '..', 'data', 'alter_eger.db');

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
  return rowToEntry(row);
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
