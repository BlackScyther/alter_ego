import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { normalizePowerType } from '../src/editor/power-filter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

let tmpDir;
let dbPath;
let db;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'alterego-norm-'));
  dbPath = join(tmpDir, 'normalized.db');
  execFileSync('node', ['tools/normalize/normalize.mjs', '--from-stub', '--out', dbPath], {
    cwd: projectRoot,
    stdio: 'pipe'
  });
  db = new Database(dbPath, { readonly: true });
});

after(() => {
  db?.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

test('normalizer creates the expected tables', () => {
  const names = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map((r) => r.name);
  for (const t of ['source_books', 'race', 'race_subrace', 'class', 'class_proficiency', 'power', 'item', 'armor_stats', 'weapon_stats', 'background', 'normalize_warnings', 'norm_meta']) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
});

test('race/subrace split mirrors the static map', () => {
  const sub = db.prepare(`SELECT parent_race_id FROM race_subrace WHERE subrace_race_id = 'race54'`).get();
  assert.equal(sub.parent_race_id, 'race2');
  const flag = db.prepare(`SELECT is_subrace FROM race WHERE id = 'race54'`).get();
  assert.equal(flag.is_subrace, 1);
  const base = db.prepare(`SELECT is_subrace FROM race WHERE id = 'race2'`).get();
  assert.equal(base.is_subrace, 0);
});

test('power_type is normalized exactly (no LIKE patterns needed)', () => {
  const stub = JSON.parse(readFileSync(resolve(projectRoot, 'data/samples/compendium-stub.json'), 'utf8'));
  for (const e of stub.categories.power.entries) {
    const row = db.prepare(`SELECT power_type, level FROM power WHERE id = ?`).get(e.id);
    assert.ok(row, `power ${e.id} normalized`);
    assert.equal(row.power_type, normalizePowerType(e.listing_fields.Type));
  }
});

test('worn-item slot is derived (neck for cloaks/amulets)', () => {
  // item2 in the stub is "Cloak of Resistance +1" -> neck slot
  const cloak = db.prepare(`SELECT slot FROM item WHERE id = 'item2'`).get();
  assert.equal(cloak.slot, 'neck');
});

test('armor and weapon stats are materialized', () => {
  const chain = db.prepare(`SELECT ac_bonus, is_heavy FROM armor_stats WHERE item_id = 'armor1'`).get();
  assert.ok(chain.ac_bonus > 0);
  assert.equal(chain.is_heavy, 1);
  const longsword = db.prepare(`SELECT damage_dice FROM weapon_stats WHERE item_id = 'weapon1'`).get();
  assert.equal(longsword.damage_dice, '1d8');
});

test('multi-tier items split into ascending item_level rows', () => {
  // item498 "Amulet of Protection": Level "1+,1,16,6,21,11,26" / Cost "360+ gp,...".
  const tiers = db
    .prepare(`SELECT tier, level, cost_gp, enhancement FROM item_level WHERE item_id = 'item498' ORDER BY tier`)
    .all();
  assert.equal(tiers.length, 6);
  assert.deepEqual(tiers.map((t) => t.level), [1, 6, 11, 16, 21, 26]);
  assert.deepEqual(tiers.map((t) => t.cost_gp), [360, 1800, 9000, 45000, 225000, 1125000]);
  assert.deepEqual(tiers.map((t) => t.enhancement), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(tiers.map((t) => t.tier), [1, 2, 3, 4, 5, 6]);
});

test('multi-tier parent item cost_gp is the lowest tier', () => {
  const item = db.prepare(`SELECT cost_gp FROM item WHERE id = 'item498'`).get();
  assert.equal(item.cost_gp, 360);
});

test('single-level items yield exactly one tier', () => {
  const tiers = db.prepare(`SELECT tier, level, cost_gp FROM item_level WHERE item_id = 'item2'`).all();
  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].level, 2);
  assert.equal(tiers[0].cost_gp, 520);
});

test('source_books carries known release dates (date-ready for GM filter)', () => {
  const phb = db.prepare(`SELECT release_date FROM source_books WHERE code = 'PHB'`).get();
  assert.equal(phb.release_date, '2008-06-06');
});

test('norm_meta records counts', () => {
  const meta = Object.fromEntries(db.prepare(`SELECT key, value FROM norm_meta`).all().map((r) => [r.key, r.value]));
  assert.equal(meta.count_power, '10');
  assert.equal(meta.schema_version, '1');
});
