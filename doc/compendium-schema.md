# Normalized compendium schema

The compendium ships as a single SQLite file (`data/alter_ego.db`). The external
iws.mx importer writes the **denormalized** `entries` table (`id`,
`category_slug`, `listing_fields` JSON, `body_html`, `index_text`, `source`).
The normalizer adds **structured tables derived from `entries`**, so mechanics
are parsed once at build time instead of at runtime in the browser.

## Pipeline

```
iws.mx JSONP  ->  entries (denormalized)  ->  tools/normalize/normalize.mjs  ->  normalized tables (+ normalize_warnings)
```

- ETL: [tools/normalize/normalize.mjs](../tools/normalize/normalize.mjs) reuses
  the existing parser modules (`class-parse.js`, `equipment-stats.js`,
  `power-filter.js`, `tutor.js`, `race-parse.js`, `race-subraces.js`) so logic
  is not duplicated. A failed parse becomes a row in `normalize_warnings`
  (a data-quality item) instead of a live rendering bug.
- DDL: [tools/normalize/schema.sql](../tools/normalize/schema.sql).
- Normalized tables live in the **same file** as `entries`, so the in-browser
  `sql.js` load, the `better-sqlite3` server read, and the Tauri bundle keep
  working with one file. `entries` is untouched (display HTML + fallback).

## Commands

| Command | Effect |
|---------|--------|
| `npm run normalize` | Normalize `data/alter_ego.db` in place (run after the importer). |
| `npm run normalize:stub` | Build a dev DB from the JSON stub at `data/alter_ego.dev.db` and print a warnings report. |
| `node tools/normalize/normalize.mjs --src a.db --out b.db` | Read one DB, write normalized tables to another. |
| `node tools/normalize/normalize.mjs --report` | Print the warnings summary. |
| build:app | Runs `normalize --if-exists` before `post-build-app.mjs`, so the normalized DB ships in `dist/app`. |

## Tables (derived; regenerated wholesale)

| Table | Purpose |
|-------|---------|
| `source_books(code, title, release_date, edition_era)` | Date-ready source-book reference; `release_date` powers the GM's "filter source by date". Seeded from `metadata/source-books.json`; unknown dates are left null for the GM to fill in. |
| `race`, `race_ability_bonus`, `race_skill_bonus`, `race_grant`, `race_subrace` | Race traits, structured ability/skill bonuses, power/feat grants, and the parent->subrace map (replaces the hand-maintained `metadata/race-subraces.json`). `race.speed_squares` holds the parsed integer speed alongside the original `speed` string. |
| `race_language`, `race_resistance`, `race_sense`, `race_trait` | Structured racial traits parsed from the race body (`race-parse.js`): fixed/choice languages, damage resistances (type + amount + optional scaling), senses/vision, and free-text named traits. Feed the generator's "Racial Traits" fold and the character sheet (Languages / Resistances / Special Senses). |
| `race_replacement(race_id, replaces_name, replaces_kind)` | Subrace trait/power replacements: the base-race trait/power/feat (`replaces_name` = name or entry id, `replaces_kind` = trait/power/feat) that the subrace (`race_id`) replaces. Parsed from the subrace body (`parseRaceReplacements` in `race-parse.js`) merged with the curated overrides in `metadata/race-replacements.json`. The combined base+subrace preview, notes, grant tiles, and sheet suppress the named base item so only the subrace's version shows. A trait target that matches no base trait emits a `replacement-unmatched` warning. |
| `power_ability_option(power_id, choice_group, ability, role)` | Powers that let the player choose the attack ability (e.g. "Strength, Dexterity, or Constitution vs. AC", or a `Special:` clause such as Dragon Breath); one row per offered ability. The pick itself is a per-character selection (`selections.racePowerAbilityChoices`), never stored here. |
| `power_damage_option(power_id, choice_group, damage_type)` | Powers that let the player choose the power's damage type (e.g. Dragon Breath: "acid, cold, fire, lightning, or poison"); one row per offered type. The pick is a per-character selection (`selections.racePowerDamageChoices`), never stored here. |
| `class`, `class_defense_bonus`, `class_trained_skill`, `class_build_option`, `class_build_suggested`, `class_proficiency` | Class traits incl. `is_hybrid`/`hybrid_parent_class_id`, defense bonuses, trained-skill pools, build options + suggestions, and armor/weapon/implement/shield proficiencies (used by the hybrid merge). |
| `power(id, name, class_name, level, power_type, action, source_book)` | Normalized power filtering columns; `power_type` is the exact normalized value (At-Will/Encounter/Daily/Utility), retiring the `%enc.%`-style LIKE patterns. |
| `item`, `item_level`, `armor_stats`, `weapon_stats` | Equipment listing fields plus materialized armor/weapon stats (retires the runtime PHB fallback table). `item.slot` (head/neck/arms/hands/waist/feet/ring) is derived from the item body's "<X> Slot" line — the `Type` field is empty for most wondrous items — so e.g. amulets and cloaks resolve to the neck slot authoritatively. `getEntry` attaches it to item entries; `getEligibleSlotsForEntry` prefers it over name guesses. |
| `item_level(item_id, tier, level, cost_gp, enhancement)` | Per-level tiers for level-scaled items (e.g. Amulet of Protection's six +1..+6 versions). The source packs tiers into one entry's compound `Level`/`Cost` (a leading "1+" / "360+ gp" summary token then positionally-aligned, scrambled level/cost pairs); the ETL drops the summary, zips and sorts the pairs, and writes one row per tier. `enhancement` is the generic `1 + floor((level-1)/5)` (only meaningful for enhancement items). The parent `item.cost_gp` is set to the lowest tier (previously null for these). |
| `background`, `background_skill_bonus` | Background skill bonuses. |
| `norm_meta`, `normalize_warnings` | Generation metadata (counts, schema version) and per-entry parse warnings. |

## Read path (normalized-first, parse fallback)

`src/data/compendium.js` (browser) and `server/compendium.mjs` (server) expose
normalized read methods guarded by a table-exists check. When the normalized
tables are absent (older DB, stub, unavailable) every method returns
null/empty and callers transparently fall back to the runtime parse path:

- `usesNormalized()`, `getRaceSubraceMap()`, `getNormalizedClass(id)`,
  `listNormalizedPowers(opts)`, `getNormalizedItemStats(id)`,
  `getNormalizedRaceTraits(id)`, `getPowerAbilityOptions(id)`,
  `getPowerDamageOptions(id)`, `getRaceReplacements(id)`, `getSourceBookDates()`.
- Subrace replacements also have a runtime fallback: `race-parse.js`
  (`resolveReplacedBaseItems`) merges `parseRaceReplacements` with the curated
  `metadata/race-replacements.json` (loaded by `race-replacements.js`), so
  suppression works on the stub/older DBs without the `race_replacement` table.
- Monster-race lore is resolved at runtime (preview-only, no new table): the
  race step matches a flavor-less race to a Monster entry by exact name (or via
  `metadata/race-monster-fluff.json` overrides, loaded by `monster-fluff.js`),
  fetches it with `getEntry`, and `extractMonsterFlavorFolds` keeps prose while
  stripping statistics. Exact-name matching excludes named individuals/variants.
- Racial traits also have a synchronous runtime fallback: `race-selections.js`
  applies them to the sheet by parsing the race entry HTML directly
  (`getRaceStructuredTraits`), so the feature works on the stub/older DBs too.
- `listEntries('power', ...)` filters via the `power` table when present
  (exact `power_type`/`level`/`class_name`) instead of `json_extract` LIKE.
- `syncEquipmentToSheet` prefers `getNormalizedItemStats` over parsing.
- `race-subraces.js` is hydrated from `race_subrace` at editor bootstrap via
  `hydrateSubracesFromProvider(compendium)` (falls back to the static JSON).

## Source-date filtering and editing (GM)

`release_date` lives in `source_books` (seeded from `metadata/source-books.json`).
Because the browser loads the DB read-only via `sql.js`, the **writable** source
of truth for dates is `metadata/source-books.json`, exposed by a small server
route; the DB copy is the read-only fallback for static/Tauri builds.

- Server: `GET /api/source-books` returns the seed merged with every code the
  normalizer recorded (`server/source-books.mjs` + `server/compendium.mjs`
  `listSourceBookCodes()`), so the GM can date books the seed does not list yet.
  `PUT /api/source-books/:code` (GM token) validates and writes back the JSON.
- Client: `src/api/source-books-api.js` `getSourceBookDates()` reads the API and
  falls back to `compendium.getSourceBookDates()` (DB) when offline;
  `saveSourceBook(code, patch)` persists edits.
- Filter: `picker-source-combo.js` gains an opt-in "released on/before" date
  control; `resolveSourceBooksByDate(dateMap, cutoff)` turns a cutoff into the
  set of allowed codes, intersected with any single-source selection and fed
  into the existing `listEntries({ sourceBooks })` path. Wired into the GM
  Workshop duplicate picker; the Workshop "Source dates" dialog edits the dates.
- After editing dates, re-run `npm run normalize` to refresh the DB copy used by
  offline reads (the API/JSON is already live for the filter).

## Known ETL gaps (data-quality, surfaced by warnings)

Validated against the full production DB (≈9.4k powers, 3.7k items, 808 backgrounds, 77 classes, 55 races); 248 warnings:

- `source_books/missing-date` (199): the GM dates the remaining books in `metadata/source-books.json` (expected manual work).
- `class/missing-hp` (44): no complete structured class-HP source exists — `src/character/hp.js` itself relies on the partial `quick-build-presets.json`, which the normalizer reuses. Candidate for a future class-stats metadata table.
- `class/hybrid-no-parent` (5): a few `Hybrid X` entries whose base name does not exactly match a class entry; refine the name match later.
- `race_grant` is best-effort: it only captures inline `powerN`/`featN` id tokens, which the production race HTML largely does not use, so it is currently empty. Race powers/feats still load via the existing parse path.
- `background_skill_bonus` is empty by design for choice-based backgrounds (skills are picked at selection time, not fixed bonuses).
- `race_language`/`race_resistance`/`race_sense`/`race_trait`, `power_ability_option` and `power_damage_option` are best-effort text parses: races/powers whose wording does not match the patterns simply produce no rows (the runtime parse fallback still applies traits/options). `power_ability_option` fills for powers with an explicit attack-line ability "or"-list or a `Special:` "choose ... as the ability score" clause; `power_damage_option` fills for powers with a "damage type: ..." choice list.

## Hybrid characters (B-024)

`src/character/hybrid-merge.js` implements the PH3:134-135 combination from two
normalized class records: HP average + CON once, HP/level = sum of halves,
surges average, combined class skills (train any three), armor/shield
proficiency intersection, weapon/implement union, the "one power of each type
from both" coverage check, and `hybridPairAllowed` (no two subclasses of the
same class, enforced in the class step when the normalized DB is present).

`applyHybridClassStats` (`class-selections.js`, called from the class step)
persists the merge on `selections.hybridMerged` and writes the merged **HP,
HP/level, surges, and speed** to the sheet; `computeMaxHp`/`computeLevel1MaxHp`
prefer those values when hybrid mode is on. Remaining: surface the merged
trained-skill pool and proficiencies in the skill/equipment UI and enforce
`hybridPowerCoverage` in the power step.
