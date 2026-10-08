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
  speed_squares INTEGER,         -- parsed integer of `speed` (e.g. 6) when available
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

-- Structured racial traits derived from the race body HTML. These feed the
-- generator's "Racial Traits" fold and are applied to the matching character
-- sheet fields (Languages, Resistances, Special Senses, Speed). They are
-- best-effort parses; failures become normalize_warnings rather than missing UI.
DROP TABLE IF EXISTS race_language;
CREATE TABLE race_language (
  race_id TEXT NOT NULL,
  language TEXT NOT NULL,         -- a fixed language name, or 'choice' for a player pick
  is_choice INTEGER NOT NULL DEFAULT 0,
  choose_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_race_language ON race_language(race_id);

DROP TABLE IF EXISTS race_resistance;
CREATE TABLE race_resistance (
  race_id TEXT NOT NULL,
  damage_type TEXT NOT NULL,      -- 'fire' | 'cold' | 'necrotic' | ...
  amount INTEGER,                 -- flat resist value when fixed, else null
  scaling_json TEXT               -- optional tiered/level-scaling description
);
CREATE INDEX idx_race_resistance ON race_resistance(race_id);

DROP TABLE IF EXISTS race_sense;
CREATE TABLE race_sense (
  race_id TEXT NOT NULL,
  sense TEXT NOT NULL             -- 'Low-light vision' | 'Darkvision' | 'Tremorsense' | ...
);
CREATE INDEX idx_race_sense ON race_sense(race_id);

DROP TABLE IF EXISTS race_trait;
CREATE TABLE race_trait (
  race_id TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT                       -- the free-text trait body (may be empty)
);
CREATE INDEX idx_race_trait ON race_trait(race_id);

-- Subrace replacements: a subrace trait/power that replaces a base-race one
-- ("This trait replaces the dragonborn's X"). `race_id` is the subrace; the
-- combined base+subrace view suppresses the named base trait/power/feat so only
-- the subrace's version shows. Parsed from the subrace body + curated overrides.
DROP TABLE IF EXISTS race_replacement;
CREATE TABLE race_replacement (
  race_id TEXT NOT NULL,          -- the subrace doing the replacing
  replaces_name TEXT NOT NULL,    -- base trait/power/feat name (or entry id)
  replaces_kind TEXT              -- 'trait' | 'power' | 'feat'
);
CREATE INDEX idx_race_replacement ON race_replacement(race_id);

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

-- Powers that let the player choose which ability score the power uses (e.g.
-- "Attack: Strength, Dexterity, or Constitution vs. AC"). One row per offered
-- ability; the actual pick is a per-character selection, never stored here.
DROP TABLE IF EXISTS power_ability_option;
CREATE TABLE power_ability_option (
  power_id TEXT NOT NULL,
  choice_group TEXT NOT NULL,    -- groups options that belong to one decision
  ability TEXT NOT NULL,         -- 'str' | 'con' | 'dex' | 'int' | 'wis' | 'cha'
  role TEXT                      -- 'attack' | 'secondary' (context of the choice)
);
CREATE INDEX idx_power_ability_option ON power_ability_option(power_id);

-- Powers that let the player choose the power's damage type (e.g. Dragon Breath:
-- "choose the power's damage type: acid, cold, fire, lightning, or poison").
-- One row per offered type; the actual pick is a per-character selection.
DROP TABLE IF EXISTS power_damage_option;
CREATE TABLE power_damage_option (
  power_id TEXT NOT NULL,
  choice_group TEXT NOT NULL,    -- groups options that belong to one decision
  damage_type TEXT NOT NULL      -- 'acid' | 'cold' | 'fire' | 'lightning' | 'poison' | ...
);
CREATE INDEX idx_power_damage_option ON power_damage_option(power_id);

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

-- Monsters -----------------------------------------------------------------
DROP TABLE IF EXISTS monster;
CREATE TABLE monster (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER,
  combat_role TEXT,
  group_role TEXT,
  size TEXT,
  creature_type TEXT,
  source_book TEXT
);
CREATE INDEX idx_monster_level ON monster(level);

DROP TABLE IF EXISTS monster_combat_stats;
CREATE TABLE monster_combat_stats (
  monster_id TEXT PRIMARY KEY,
  hp INTEGER,
  bloodied_hp INTEGER,
  ac INTEGER,
  fort INTEGER,
  ref INTEGER,
  will INTEGER,
  initiative INTEGER,
  speed_squares INTEGER,
  perception INTEGER,
  xp INTEGER
);

DROP TABLE IF EXISTS monster_ability;
CREATE TABLE monster_ability (
  monster_id TEXT NOT NULL,
  ability TEXT NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (monster_id, ability)
);

DROP TABLE IF EXISTS monster_skill;
CREATE TABLE monster_skill (
  monster_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  bonus INTEGER NOT NULL
);
CREATE INDEX idx_monster_skill ON monster_skill(monster_id);

DROP TABLE IF EXISTS monster_resistance;
CREATE TABLE monster_resistance (
  monster_id TEXT NOT NULL,
  damage_type TEXT NOT NULL,
  amount INTEGER,
  is_immunity INTEGER NOT NULL DEFAULT 0,
  is_vulnerability INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_monster_resist ON monster_resistance(monster_id);

DROP TABLE IF EXISTS monster_power;
CREATE TABLE monster_power (
  monster_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  usage TEXT,
  action TEXT,
  attack_line TEXT,
  hit TEXT,
  effect TEXT,
  PRIMARY KEY (monster_id, sort_order)
);

DROP TABLE IF EXISTS monster_trait;
CREATE TABLE monster_trait (
  monster_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trait_type TEXT,
  text TEXT
);
CREATE INDEX idx_monster_trait ON monster_trait(monster_id);

-- Feats --------------------------------------------------------------------
DROP TABLE IF EXISTS feat;
CREATE TABLE feat (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  prerequisite_raw TEXT,
  source_book TEXT,
  benefit_text TEXT
);
CREATE INDEX idx_feat_tier ON feat(tier);

DROP TABLE IF EXISTS feat_prerequisite;
CREATE TABLE feat_prerequisite (
  feat_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT,
  min_value INTEGER,
  logic_group INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_feat_prereq ON feat_prerequisite(feat_id);

DROP TABLE IF EXISTS feat_skill_bonus;
CREATE TABLE feat_skill_bonus (
  feat_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  amount INTEGER NOT NULL,
  bonus_type TEXT
);
CREATE INDEX idx_feat_skill ON feat_skill_bonus(feat_id);

DROP TABLE IF EXISTS feat_ability_bonus;
CREATE TABLE feat_ability_bonus (
  feat_id TEXT NOT NULL,
  ability TEXT NOT NULL,
  amount INTEGER NOT NULL,
  choice_group TEXT,
  excludes_item_bonus INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_feat_ability ON feat_ability_bonus(feat_id);

DROP TABLE IF EXISTS feat_grant;
CREATE TABLE feat_grant (
  feat_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT
);
CREATE INDEX idx_feat_grant ON feat_grant(feat_id);

-- Rituals ------------------------------------------------------------------
DROP TABLE IF EXISTS ritual;
CREATE TABLE ritual (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER,
  component_cost TEXT,
  price TEXT,
  key_skill_description TEXT,
  source_book TEXT
);
CREATE INDEX idx_ritual_level ON ritual(level);

DROP TABLE IF EXISTS class_ritual_grant;
CREATE TABLE class_ritual_grant (
  class_id TEXT NOT NULL,
  ritual_id TEXT NOT NULL,
  PRIMARY KEY (class_id, ritual_id)
);

-- Glossary and cross-links ---------------------------------------------------
DROP TABLE IF EXISTS glossary;
CREATE TABLE glossary (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  type TEXT,
  source_book TEXT
);
CREATE INDEX idx_glossary_name ON glossary(name);

DROP TABLE IF EXISTS entry_links;
CREATE TABLE entry_links (
  from_entry_id TEXT NOT NULL,
  to_entry_id TEXT NOT NULL,
  link_text TEXT,
  link_type TEXT,
  PRIMARY KEY (from_entry_id, to_entry_id, link_text)
);
CREATE INDEX idx_entry_links_from ON entry_links(from_entry_id);

-- Paragon paths, epic destinies, themes ------------------------------------
DROP TABLE IF EXISTS paragonpath;
CREATE TABLE paragonpath (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prerequisite_raw TEXT,
  source_book TEXT
);

DROP TABLE IF EXISTS epicdestiny;
CREATE TABLE epicdestiny (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prerequisite_raw TEXT,
  source_book TEXT
);

DROP TABLE IF EXISTS theme;
CREATE TABLE theme (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prerequisite_raw TEXT,
  source_book TEXT
);

-- Reference categories (listing passthrough) ---------------------------------
DROP TABLE IF EXISTS trap;
CREATE TABLE trap (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  group_role TEXT,
  level INTEGER,
  source_book TEXT
);

DROP TABLE IF EXISTS companion;
CREATE TABLE companion (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  size TEXT,
  creature_type TEXT,
  source_book TEXT
);

DROP TABLE IF EXISTS deity;
CREATE TABLE deity (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domains TEXT,
  alignment TEXT,
  source_book TEXT
);

DROP TABLE IF EXISTS disease;
CREATE TABLE disease (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER,
  source_book TEXT
);

DROP TABLE IF EXISTS poison;
CREATE TABLE poison (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER,
  cost REAL,
  source_book TEXT
);
