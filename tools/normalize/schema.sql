-- Normalized compendium schema.
--
-- These tables are DERIVED from the denormalized `entries` table by
-- tools/normalize/normalize.mjs. They live in the same SQLite file
-- (data/alter_ego.db) so the in-browser sql.js load, the better-sqlite3
-- server read, and the Tauri bundle keep working with a single file. The
-- `entries` table is kept untouched for display HTML and as the fallback the
-- read path uses for any category not yet covered here.
--
-- Regenerated wholesale on every `npm run normalize`; do not hand-edit rows.

DROP TABLE IF EXISTS norm_meta;
CREATE TABLE norm_meta (key TEXT PRIMARY KEY, value TEXT);

DROP TABLE IF EXISTS normalize_warnings;
CREATE TABLE normalize_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  entry_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX idx_warn_category ON normalize_warnings(category);

-- Source-book reference. release_date powers the GM's "filter source by date".
DROP TABLE IF EXISTS source_books;
CREATE TABLE source_books (
  code TEXT PRIMARY KEY,
  title TEXT,
  release_date TEXT,
  edition_era TEXT
);

-- Races --------------------------------------------------------------------
DROP TABLE IF EXISTS race;
CREATE TABLE race (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  origin TEXT,
  size TEXT,
  speed TEXT,
  vision TEXT,
  source_book TEXT,
  is_subrace INTEGER NOT NULL DEFAULT 0
);

DROP TABLE IF EXISTS race_ability_bonus;
CREATE TABLE race_ability_bonus (
  race_id TEXT NOT NULL,
  ability TEXT NOT NULL,
  amount INTEGER NOT NULL,
  choice_group TEXT,
  alternatives_json TEXT,
  note TEXT
);
CREATE INDEX idx_race_ability ON race_ability_bonus(race_id);

DROP TABLE IF EXISTS race_skill_bonus;
CREATE TABLE race_skill_bonus (
  race_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  amount INTEGER NOT NULL
);
CREATE INDEX idx_race_skill ON race_skill_bonus(race_id);

DROP TABLE IF EXISTS race_grant;
CREATE TABLE race_grant (
  race_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- 'power' | 'feat'
  entry_id TEXT NOT NULL
);
CREATE INDEX idx_race_grant ON race_grant(race_id);

DROP TABLE IF EXISTS race_subrace;
CREATE TABLE race_subrace (
  parent_race_id TEXT NOT NULL,
  subrace_race_id TEXT NOT NULL,
  PRIMARY KEY (parent_race_id, subrace_race_id)
);

-- Classes ------------------------------------------------------------------
DROP TABLE IF EXISTS class;
CREATE TABLE class (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  power_source TEXT,
  key_abilities TEXT,
  hp_at1_base INTEGER,
  hp_per_level INTEGER,
  surges_base INTEGER,
  base_speed INTEGER,
  source_book TEXT,
  is_hybrid INTEGER NOT NULL DEFAULT 0,
  hybrid_parent_class_id TEXT
);

DROP TABLE IF EXISTS class_defense_bonus;
CREATE TABLE class_defense_bonus (
  class_id TEXT NOT NULL,
  defense TEXT NOT NULL,         -- 'ac' | 'fort' | 'ref' | 'will'
  amount INTEGER NOT NULL
);
CREATE INDEX idx_class_def ON class_defense_bonus(class_id);

DROP TABLE IF EXISTS class_trained_skill;
CREATE TABLE class_trained_skill (
  class_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- 'fixed' | 'pool'
  choose_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_class_skill ON class_trained_skill(class_id);

DROP TABLE IF EXISTS class_build_option;
CREATE TABLE class_build_option (
  id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (class_id, id)
);

DROP TABLE IF EXISTS class_build_suggested;
CREATE TABLE class_build_suggested (
  class_id TEXT NOT NULL,
  build_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- 'skill' | 'atwill' | 'encounter' | 'daily' | 'feat'
  value TEXT NOT NULL
);
CREATE INDEX idx_class_build_sugg ON class_build_suggested(class_id, build_id);

DROP TABLE IF EXISTS class_proficiency;
CREATE TABLE class_proficiency (
  class_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- 'armor' | 'weapon' | 'implement' | 'shield'
  value TEXT NOT NULL
);
CREATE INDEX idx_class_prof ON class_proficiency(class_id);

-- Powers -------------------------------------------------------------------
DROP TABLE IF EXISTS power;
CREATE TABLE power (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_name TEXT,
  level INTEGER,
  power_type TEXT,               -- normalized: At-Will | Encounter | Daily | Utility
  action TEXT,
  source_book TEXT
);
CREATE INDEX idx_power_class ON power(class_name);
CREATE INDEX idx_power_type ON power(power_type);
CREATE INDEX idx_power_level ON power(level);

-- Equipment ----------------------------------------------------------------
DROP TABLE IF EXISTS item;
CREATE TABLE item (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,                 -- compendium slug: weapon | armor | implement | item
  type TEXT,
  level TEXT,
  cost_gp REAL,
  rarity TEXT,
  source_book TEXT,
  slot TEXT
);
CREATE INDEX idx_item_category ON item(category);
CREATE INDEX idx_item_source ON item(source_book);

-- Per-level tiers for level-scaled items (e.g. Amulet of Protection). Many
-- items pack several level/price tiers into one entry; one row per tier here
-- keeps the parent `item` row a single picker entry while exposing structured
-- level/cost. `enhancement` is the generic 1 + floor((level-1)/5) and is only
-- meaningful for enhancement-bearing items.
DROP TABLE IF EXISTS item_level;
CREATE TABLE item_level (
  item_id TEXT NOT NULL,
  tier INTEGER NOT NULL,         -- 1-based, ascending by level
  level INTEGER NOT NULL,
  cost_gp REAL,
  enhancement INTEGER,
  PRIMARY KEY (item_id, tier)
);
CREATE INDEX idx_item_level_item ON item_level(item_id);

DROP TABLE IF EXISTS armor_stats;
CREATE TABLE armor_stats (
  item_id TEXT PRIMARY KEY,
  ac_bonus INTEGER NOT NULL DEFAULT 0,
  check_penalty INTEGER NOT NULL DEFAULT 0,
  speed_penalty INTEGER NOT NULL DEFAULT 0,
  ref_bonus INTEGER NOT NULL DEFAULT 0,
  is_heavy INTEGER NOT NULL DEFAULT 0,
  is_shield INTEGER NOT NULL DEFAULT 0,
  armor_category TEXT
);

DROP TABLE IF EXISTS weapon_stats;
CREATE TABLE weapon_stats (
  item_id TEXT PRIMARY KEY,
  proficiency_bonus INTEGER NOT NULL DEFAULT 0,
  damage_dice TEXT,
  weapon_group TEXT,
  range TEXT,
  attack_ability TEXT,
  ranged_attack_ability TEXT
);

-- Backgrounds --------------------------------------------------------------
DROP TABLE IF EXISTS background;
CREATE TABLE background (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  campaign TEXT,
  source_book TEXT
);

DROP TABLE IF EXISTS background_skill_bonus;
CREATE TABLE background_skill_bonus (
  background_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  amount INTEGER NOT NULL,
  bonus_type TEXT
);
CREATE INDEX idx_bg_skill ON background_skill_bonus(background_id);
