# File reference

One-line role for each tracked file. Update this table when the tree changes.

**Last updated:** 2026-06-20 (item_level tiers + GM source-date filter/editor)

**Project root:** `D:\Projects\web\4e\Alter_Ego` (Alter Ego). Master spec: [PROJECT.md](../PROJECT.md).

## `doc/`

| File | Role |
|------|------|
| `README.md` | Index of documentation; maintenance rules; last agent sync |
| `project.md` | Readable project description (English) |
| `requirements.md` | Functional/non-functional requirements with IDs |
| `roadmap.md` | Phases, completed online-campaign plan, backlog |
| `todos.md` | Host, developer, and agent checklists |
| `architecture.md` | Stack, API, data flows |
| `compendium-schema.md` | Normalized compendium schema + ETL pipeline (tools/normalize), read path, hybrid (B-024) rules |
| `game-editor.md` | GM encounters: rest mode, initiative, rewards ([game-editor.md](game-editor.md)) |
| `deploy-online.md` | VPS deploy: static app + Node API |
| `mac-build-ohne-mac.md` | macOS CI builds without a Mac |
| `files.md` | This file reference |
| `bugs.md` | Bug and limitation tracker |
| `tests.md` | Test strategy and manual checklist |

## `rules/`

| File | Role |
|------|------|
| `README.md` | Index of UI / frontend rules for agents |
| `ui.md` | Tailwind, hub layout, readable dynamic choice buttons |
| `character-generator.md` | Load → level-up / new-character → creation step order |
| `playlist.md` | Top-of-playlist screen behavior |

## Root

| File | Role |
|------|------|
| `index.html` | Redirect to `/src/` (dev entry when serving repo root) |
| `README.md` | User-facing quick start, formulas summary, print/PDF |
| `PROMPT.md` | Agent instructions and doc-maintenance contract |
| `package.json` | npm scripts: `dev`, `build:app`, `deploy:live`, `pull:live`, `tauri:dev`, `tauri:build`, `pdf`, `party:index` |
| `vite.config.js` | Vite multi-page build → `dist/app/` |
| `Dockerfile` | Multi-stage single-container build (frontend + API); runtime stage copies `src/`, `metadata/`, `data/` (the API imports them at runtime), compendium DB provided via volume |
| `.dockerignore` | Keeps the Docker build context small and secret-free (excludes `data/*.db*`) |
| `.gitattributes` | Line-ending normalization: LF for `*.sh`/`ops/**` so shell scripts run on Linux from a Windows checkout; CRLF for `*.ps1`/`*.bat`/`*.cmd`; marks binaries |
| `docker-compose.yml` | Standalone single-host run (localhost:3000 + two data volumes) |
| `app-icon.png` | Source for `npx tauri icon` (desktop icons) |
| `package-lock.json` | Locked dependency versions (Playwright) |
| `dimensions.json` | US Letter layout in inches; regions, columns, `--scale` |
| `output/*.pdf` | Generated PDFs from `npm run pdf` (not source) |

## `ops/` (VPS hosting)

| File | Role |
|------|------|
| `ops/env.example` | Server env template; copy to gitignored `ops/server.env` |
| `ops/vps/bootstrap.sh` | Fresh Ubuntu 26.04 hardening + Docker + Coolify install |
| `ops/vps/harden-ssh.sh` | Disable SSH passwords / root-password login (run after key login works) |

## `metadata/`

| File | Role |
|------|------|
| `editor.json` | Character editor wizard: steps, compendium categories, `writesTo` paths |
| `race-subraces.json` | Parent race → subrace id map (Dragonborn, Dwarf, Eladrin, Elf, Gnome) |
| `race-replacements.json` | Curated subrace→base trait/power replacement overrides (keyed by subrace id; merged with auto-parsed replacements) |
| `race-monster-fluff.json` | Curated race→monster flavor overrides (keyed by race id/name): `monsterIds`/`monsterNames` to source lore from, or `disabled` to suppress; default is exact race-name → monster-name match |
| `race-build-options.json` | Dragonborn / Genasi build-choice definitions (power picks) |
| `starting-equipment.json` | Level-1 starting equipment kits by class/build (PHB Fighter kits; stub Fighter fallback) |
| `equipment-stats-overrides.json` | PHB mundane armor/weapon stats for sheet sync when compendium body lacks parseable fields |
| `magic-equipment-tiers.json` | GM-editable magic enhancement tiers for base weapons/armor: bonus (+1/+2/+3) → item level + enhancement price (`magicCostGp`); total price = base item cost + tier price |
| `catalog-counts.json` | Expected compendium entry counts per category (import validation) |
| `source-books.json` | Source-book reference (title/release_date/edition_era) seeding the normalized `source_books` table; the **writable** source of truth for the GM's "filter source by date" (edited via `PUT /api/source-books/:code`) |
| `README.md` | Index of metadata files; points to Alter Ego `PROJECT.md` |

## `data/`

| File | Role |
|------|------|
| `README.md` | Where `alter_ego.db` lives after import |
| `samples/compendium-stub.json` | Stub races/classes/feats until DB exists |
| `alter_ego.db` | *(planned)* SQLite compendium after importer runs |
| `background-effect-overrides.json` | Curated background effects (HP substitute, initiative) keyed by id/name |
| `class-effect-overrides.json` | Curated class-feature effects (static initiative) keyed by class id/name |

## `scripts/`

| File | Role |
|------|------|
| `export-pdf.mjs` | Playwright: local HTTP server → Letter PDF in `output/` |
| `build-party-index.mjs` | Scans `src/party/*.json` → writes `src/party/index.json` |
| `pack-player.mjs` | Legacy: browser player zip with start scripts |
| `post-build-app.mjs` | Copies metadata, party, favicon, and DB into `dist/app/` after Vite build |
| `pull-live.mjs` | SFTP download of live `public_html` → `sync-from-live/` (`.env.deploy.local`) |
| `pull-live-data.mjs` | SFTP download of live `data/` → local `data/` |
| `push-live.mjs` | SFTP upload of `dist/app/` to live site (`npm run deploy:live`) |
| `test-campaign-api.mjs` | Smoke test: campaign + encounters + spawn actors (port 3099) |
| `audit-background-parse.mjs` | Dev audit: background HTML patterns vs parser coverage |
| `audit-race-subraces.mjs` | Dev audit: benefit-only race entries vs `race-subraces.json` (exit 1 if unmapped) |
| `bump-version.mjs` | Increments the `package.json` patch version by 1 (run by the `pre-commit` hook; skip with `ALTER_EGO_SKIP_BUMP=1`) |

## `tests/`

| File | Role |
|------|------|
| `helpers/test-server.mjs` | Spawns temp API + SQLite; shared fixtures and injection payloads |
| `api-security.test.mjs` | SQL injection, auth, payload limits (online API) |
| `validate-character.test.mjs` | Server/client character JSON validation |
| `character-io.test.mjs` | Export filename sanitization, import |
| `party-loader.test.mjs` | GM file picker, folder/text import |
| `html-escape.test.mjs` | XSS escaping for GM/party UI |
| `race-subraces.test.mjs` | Subrace map and base-race filter |
| `race-parse.test.mjs` | Race HTML parsing, metric helpers, notes compaction, power-card stripping |
| `race-selections.test.mjs` | Race build decisions: powers gated behind manifestation choice |
| `compendium-links.test.mjs` | Compendium term linking (longest-first, boundaries) |
| `normalize.test.mjs` | Normalizer ETL: tables created, race/subrace split, exact `power_type`, armor/weapon stats, multi-tier `item_level` split + parent cost, source-book dates, meta counts |
| `hybrid-merge.test.mjs` | PH3 hybrid merge math, proficiency intersection/union, pairing rule, power coverage |
| `subrace-hydrate.test.mjs` | `race-subraces.js` static default + DB hydration (`setSubraceMap`/`hydrateSubracesFromProvider`) |
| `race-replacements.test.mjs` | Subrace replacement parsing + suppression: `parseRaceReplacements`, `resolveReplacedBaseItems`, preview/grant/notes suppression |
| `monster-fluff.test.mjs` | Monster-race lore: `extractMonsterFlavorFolds` keeps prose/drops stats, combined preview appends a collapsed fold, curated `getCuratedMonsterRefs` overrides |
| `hybrid-sheet.test.mjs` | Hybrid HP/surge wiring: `computeMaxHp` prefers `selections.hybridMerged` when hybrid; `applyHybridClassStats` merges both classes onto the sheet |
| `equipment-slot.test.mjs` | Worn-item slot eligibility prefers the normalized `item.slot` (amulet/cloak → neck, ring → ring1/ring2), with name-heuristic fallback |
| `feedback-api.test.mjs` | Feedback API: public POST + validation (required/enum/length), GM-only list/stats/PATCH/DELETE, stats aggregation |

## `server/`

| File | Role |
|------|------|
| `index.mjs` | Express app: CORS, rate limit, `/api/campaigns`, `/api/homebrew`, `/api/source-books`, `/api/feedback` |
| `db.mjs` | SQLite schema and queries (includes `homebrew_entries`, `feedback`) |
| `auth.mjs` | Bearer token hashing and middleware (`requireAnyGmToken` for homebrew writes) |
| `validate-character.mjs` | API-side character JSON validation |
| `validate-feedback.mjs` | API-side feedback validation (category/area/severity enums, length caps, `prepareFeedback`) |
| `routes/campaigns.mjs` | Create campaign, list/sync characters, GM rewards |
| `routes/encounters.mjs` | Encounters + actors; phase PATCH |
| `routes/homebrew.mjs` | Shared homebrew CRUD (`GET` public; writes require GM token) |
| `routes/source-books.mjs` | Source-book dates: `GET` public, `PUT /:code` requires GM token |
| `routes/feedback.mjs` | Feedback: `POST` public submit; `GET` list/`GET /stats`/`PATCH :id`/`DELETE :id` require GM token |
| `homebrew.mjs` | Homebrew entry storage, `hbrw_{gm}` SourceBook, index text |
| `source-books.mjs` | Read/write `metadata/source-books.json`; `getSourceBooks` merges the seed with all normalizer-discovered codes; validates date/era on `updateSourceBook` |
| `compendium.mjs` | Server compendium lookup (official + `hb_*` homebrew ids); `listSourceBookCodes()` for the date editor |
| `apply-rewards.mjs` | GM reward application + compendium stub lookup |
| `spawn-actor.mjs` | Spawn party/compendium/duplicate/blank actors |

## `src/character/` (campaign sync)

| File | Role |
|------|------|
| `campaign-session.js` | `sessionStorage` for campaign id, role, token |
| `campaign-api.js` | Client for `/api/campaigns` |
| `homebrew-api.js` | Client for `/api/homebrew` (Workshop CRUD) |
| `feedback-api.js` | Client for `/api/feedback` (`submitFeedback` public; `listFeedback`/`getFeedbackStats`/`setFeedbackStatus`/`deleteFeedback` GM) |
| `source-books-api.js` | Client for `/api/source-books` (`getSourceBookDates` with DB fallback, `saveSourceBook`) |
| `gm-campaign-registry.js` | GM localStorage registry for multiple campaigns (tokens, invite URLs) |
| `encounter-api.js` | GM client for `/api/campaigns/:id/encounters` (phase, HP, initiative) |
| `rewards-api.js` | GM client for `POST …/characters/:id/rewards` |
| `actor-spawn.js` | Build NPC instance documents from party/compendium |

## `src/join/`

| File | Role |
|------|------|
| `index.html`, `join.js` | Player invite link handler (`?c=&t=`) |

## `.githooks/` (tracked git hooks)

| File | Role |
|------|------|
| `pre-commit` | Runs `scripts/bump-version.mjs` then stages `package.json`, so every commit auto-bumps the patch version. Enabled via `git config core.hooksPath .githooks` |

## `.github/workflows/`

| File | Role |
|------|------|
| `build-desktop.yml` | CI: Windows + macOS (Intel + Apple Silicon) installers; `workflow_dispatch` or tag `v*` |

## `src-tauri/` (desktop)

| Path | Role |
|------|------|
| `tauri.conf.json` | Tauri app config; `frontendDist` = `dist/app` |
| `src/lib.rs` | Registers dialog + fs plugins |
| `capabilities/default.json` | FS and dialog permissions |
| `icons/` | App icons (from `npx tauri icon`) |

## `dist/` (generated)

| Path | Role |
|------|------|
| `app/` | Vite production build (bundled into desktop app) |
| `alter-ego-player/` | Legacy `pack:player` output |

## `src/` — app shell

| File | Role |
|------|------|
| `index.html` | Home hub: logo header, Character generator vs Top of playlist (Tailwind, centered) |
| `assets/alter-ego-logo.png` | Placeholder homepage logo (4E Alter Ego wordmark, transparent background) |
| `assets/favicon.png` | Browser tab icon (4E Alter Ego mark, transparent background) |
| `app.css` | Shared hub/launcher shell styles (imports editor.css); includes `.nav-github` icon link |
| `launcher/` | Role picker (Player / GM) — desktop app entry; logo header |
| `player/index.html` | Player hub: generator + sheet only |
| `desktop/tauri-bridge.js` | Native save/open dialogs and party folder (Tauri) |
| `ui/app.css` | Tailwind build input (`@import tailwindcss`) |
| `ui/player-mode.js` | Hides GM nav when `mode=player` or session flag set |
| `ui/tailwind.html` | Legacy CDN snippet reference (prefer `app.css`) |
| `sheet/sheet-entry.js` | Sheet DOM bootstrap + `initSheet()` |

## `src/sheet/` — character sheet (page 1)

| File | Role |
|------|------|
| `index.html` | Main sheet DOM (character page only — the static level 1–30 table was moved to the Resources page so printing the sheet emits just the character); includes a dedicated **Racial Powers** textarea (`racial-powers`) so racial powers from the editor mirror print on the sheet |
| `levels.html` | Level reference page only (for `pdf:levels`) |
| `app.js` | Binds inputs to `formulas.js`; recalculates on change |
| `formulas.js` | D&D 4e math: ½ level, defenses (incl. `defenseAbilityMod` = higher of the two relevant ability mods), skills, attacks, HP, XP table |
| `sheet.css` | Print layout; `@page { size: letter }` |

## `src/resources/` — shared player reference (character-independent)

| File | Role |
|------|------|
| `index.html` | Player Resources page: Values by Level (1–30) table, formula key, and Universal actions; each section tagged `data-section` for selective printing. Reuses `sheet.css` table styles |
| `resources.js` | Fills the level table via `buildLevelTable(30)`, hydrates universal actions from `metadata/universal-actions.json` (`loadUniversalActionsMeta` + `compendium.getEntry` + `condenseRuleHtml`), and wires the Print button (toggles `.no-print` on unselected sections, then `window.print()`) |
| `print-resources-dialog.js` | Pop-up `<dialog>` to choose which sections (Level values / Formula key / Universal actions) to print; remembers the choice in `sessionStorage` (`resources.print.sections`) |
| `resources.css` | Universal-action layout and the local print-sections dialog styles |

## `src/feedback/` — feedback submission (players + GMs)

| File | Role |
|------|------|
| `index.html` | Categorized feedback form (problem/stuck/wrong/missing/feature/different) with optional area/severity/contact; links to GM stats when a GM session exists |
| `feedback.js` | Reads session role + app version, validates, and POSTs via `submitFeedback`; `aria-live` status + offline notice |
| `feedback.css` | Form layout reusing hub shell + editor variables |

## `src/character/` — document model & persistence

| File | Role |
|------|------|
| `model.js` | `createCharacter`, schema version, identity/sheet/selections; point-buy cost model and `autoPointBuy` budget allocator (shared by quick-build and Attributes step) |
| `store.js` | `localStorage` multi-character list |
| `io.js` | Export/import `{Name}_{level}.json` filenames and parsing |
| `sheet-bridge.js` | Maps character document → sheet field IDs (incl. `racial-powers`) |
| `tutor.js` | Ability/skill bonuses, choice groups, race bonus choices, 4e stacking, and level-up ability score increases (`ASI_PAIR_LEVELS`/`ASI_ALL_LEVELS`, `abilityLevelIncreases`, `setLevelIncrease`, `pendingAbilityIncreaseLevels`) |
| `race-subraces.js` | Core/subrace map helpers and base-race filtering; runtime map is hydratable from the normalized `race_subrace` table (`setSubraceMap`/`hydrateSubracesFromProvider`), defaulting to `metadata/race-subraces.json` |
| `race-replacements.js` | Curated subrace→base trait/power replacement overrides (`getCuratedReplacements`), loaded from `metadata/race-replacements.json`; merged with the auto-parsed replacements and hydratable from the `race_replacement` table |
| `monster-fluff.js` | Curated race→monster flavor map (`getCuratedMonsterRefs`), loaded from `metadata/race-monster-fluff.json`; drives the monster-races lore lookup (supports `monsterIds`/`monsterNames`/`disabled`) |
| `race-parse.js` | Parse race HTML → mechanics, flavor fold, compact notes, grants; ability bonus picker (combo `<select>` for "any one ability", buttons for limited choices); structured trait parsers (`parseRaceLanguages`/`parseRaceResistances`/`parseRaceSenses`/`parseRaceTraits`/`parseSpeedSquares`, `getRaceStructuredTraits`) + formatters; subrace replacement parsing (`parseRaceReplacements`, `resolveReplacedBaseItems`) that suppresses replaced base trait rows + grant folds in the combined preview; `extractMonsterFlavorFolds` pulls lore-only prose (strips stats/powers/tables) from a related Monster entry into a collapsed fold; renders descriptive traits in one collapsed "Racial Traits" fold (ability choice stays visible) and a per-power ability `<select>` inside racial-power grant folds |
| `power-ability-parse.js` | `parsePowerAbilityOptions(entry)` — detects an attack-line ability "or"-list (e.g. "Strength, Dexterity, or Constitution vs. AC") or a `Special:` "choose ... as the ability score" clause (Dragon Breath); `parsePowerDamageOptions(entry)` — detects a "damage type: acid, cold, fire, lightning, or poison" choice list. Both return the offered keys/types |
| `race-selections.js` | Race step validation, build/bonus choices, grant sync; subraces are optional (`validateRaceStep`/`raceSubraceComplete` treat any set `raceId` — a subrace or the base race chosen via "None" — as complete), `setRacePowerAbilityChoice`/`setRacePowerDamageChoice` (per-power ability + damage picks, recorded as required reqs and annotated in notes e.g. `Dragon Breath (Dexterity, fire)`, enforced by `validateRaceStep`), `applyRaceTraitsToSheet`/`clearRaceTraitsFromSheet` (write Languages/Resistances/Special Senses/Speed with manual-vs-derived precedence); drops base power/feat grants and trait note lines a subrace replaces (`collectRaceGrantIds`/`syncRaceNotesAndGrants` honor the replacement set) |
| `background-parse.js` | Parse background HTML (iws.mx inline skills + raw narrative), preview fold, skill picker, compact notes |
| `background-selections.js` | Background associated-skill +2/+1 choices and step validation |
| `background-effects.js` | HP substitute, initiative misc, and other composable background effects |
| `background-effect-selections.js` | Persist HP-substitute ability choice on character |
| `class-effects.js` | Static initiative bonuses from class features (curated override-first, conditional phrasing skipped); composes with background initiative |
| `class-parse.js` | Parse class HTML (traits, builds, italic class skills, build suggested skills and starter power names) |
| `class-selections.js` | Class build/trained-skill choices, suggested-skill seeding, recommended power resolution (metadata + compendium name lookup), recommended ability priorities from class Key Abilities, grants, sheet sync; persists class HP params and recomputes Max HP for the current level; `applyHybridClassStats` merges two normalized classes (PH3) into sheet HP/surges/speed and persists `selections.hybridMerged` |
| `hp.js` | Max HP helpers: `computeMaxHp` (`classBase + CON/substitute + (level − 1) × hpPerLevel`), `computeLevel1MaxHp`, `getClassMaxHpAt1`, `getClassHpPerLevel`, derived-bonus shape, HP-substitute tutor hint; HP resolution prefers `selections.hybridMerged` when hybrid mode is on |
| `equipment-selections.js` | Equipment inventory instances, body-slot equip/unequip/swap, legacy `equipmentIds` migration, gold field shape, `clearAllEquipment`; per-instance `level` and magic `enhancement` (`setEquipmentItemEnhancement`, +1/+2/+3); shields equip to off hand; `getEligibleSlotsForEntry` prefers the normalized `item.slot` (neck/head/arms/…) and falls back to name/type heuristics |
| `equipment-stats.js` | Parse compendium equipment entries + PHB override table for AC, check penalty, weapon dice/prof; implements resolve to a `kind: 'implement'` stat (no AC/dice, enhancement only); falls back to a name/category armor table (Plate/Scale/Chainmail/Hide/Leather/Cloth) when no override or inline AC text; `getDefenseEnhancementInfo`/`enhancementFromLevel`/`levelFromEntry` drive level-scaled defense items (Amulet of Protection → Fort/Ref/Will); magic-item helpers `getMagicTiers`/`magicTierForBonus`/`isEnhanceableEntry` (weapon/armor/implement)/`magicDisplayName`/`baseCostGpFromEntry`/`magicTotalCostGp` (config-driven +1/+2/+3) |
| `equipment-sheet-sync.js` | Push equipped gear into sheet defenses, speed, armor check, and mirror attack lines; applies level-scaled neck enhancement items (Amulet of Protection → Fort/Ref/Will `enh`) and magic weapon/armor/implement enhancement (weapon → melee/ranged atk+dmg `enh`; armor → AC `enh`; implement → its bonus). The melee/ranged line `enh` shows the higher of the weapon's and the implement's bonus; per-source values (`weapon-melee-enh`/`weapon-ranged-enh`/`implement-enh`) are also stored for the power cards |
| `starting-equipment.js` | Level-1 kit resolve/apply (`resolveStartingKit`, `applyStartingKit`, `getRecommendedStartingKitMeta`); auto-seed on create; force-apply for recommend button |
| `bonus-stacking.js` | Same-type bonus stacking (highest per type) |
| `power-card-values.js` | Per-character attack/damage math for printable power cards: `buildPowerCardContext` (ability mods, half level, synced weapon proficiency, and per-source magic enhancement: `weapon-melee-enh`/`weapon-ranged-enh`/`implement-enh`), `attackTotalFor` (half + ability + weapon proficiency + enhancement + inline bonus), `damageModFor` (ability + enhancement), `abilityKeyFromName`, `formatSigned`. Weapon powers use the weapon's enhancement (per line), implement powers use the implement's |
| `hybrid-merge.js` | PH3 hybrid-character combination from two normalized class records: HP/surge math, combined skills (any three), armor/shield proficiency intersection + weapon/implement union, `hybridPairAllowed` (no two subclasses of one class), `hybridPowerCoverage` (one power of each type from both) |
| `party-loader.js` | Loads party JSON for GM console |

## `src/playlist/`

| File | Role |
|------|------|
| `index.html` | Top of playlist UI (Tailwind) |
| `playlist.js` | Loads `src/party/`, sorts, highlights top row, opens sheet |

## `src/editor/`

| File | Role |
|------|------|
| `index.html` | Generator: gate (load) → post-load (Edit character, Level up, Create new) → wizard (Tailwind + editor.css) |
| `editor.js` | Gate modes, `creationFlow` / `builderFlow`, post-load actions, compendium pickers, link index init |
| `post-load.js` | Level-up XP gate (`canLevelUp`, tooltip text) and retraining builder entry index |
| `editor.css` | Editor layout, race step, sheet-mirror tabs (resizable body: `height: max(40vh, 220px)`, `resize: vertical`), `.sheet-mirror-print` header button, compendium hover cards |
| `collapsible-chevron.js` | Shared SVG chevron for collapsible editor panels (sheet mirror, character collection) |
| `sheet-mirror.js` | Persistent wizard character-sheet mirror: tab UI, payload sync, collapse state; adds `sheet-mirror-field--total` class for flagged result fields; renders a top-right **Print sheet** button in the mirror header (via the `onPrintSheet` callback) that opens the populated scalable sheet in a new tab |
| `sheet-mirror-fields.js` | Mirror field manifest grouped into tabs (Identity, Combat, Skills, Attacks, …); `total` flag marks summed result fields (AC/FORT/REF/WILL Total, Initiative, Max HP, attack/damage bonus, passive senses, speed, action points); the `${def}-abil` parts and all four `${def}-enh` parts are readonly (auto-derived from ability scores / equipped enhancement items: magic armor → AC enh, neck items → Fort/Ref/Will enh) |
| `skills-table.js` | Shared skills table markup and handlers; class-skill trained checkboxes reflect build suggested skills |
| `print-cards-dialog.js` | Native `<dialog>` shown when clicking "Print cards": per-category checkboxes (Powers/Feats/Rituals — universal actions are excluded; they live on the Resources page) limited to categories the character has; remembers the last selection in `sessionStorage` (`editor.printCards.categories`); resolves to the chosen keys or `null` on cancel |
| `steps/race-step.js` | 3-phase race picker, bonus/build choices (no source filter on build choices), grants, linked preview; the subrace list shows a "None (play the base race)" option first so subrace-bearing races can be played without one (subraces are optional); build decisions with >6 options render as a compact combo `<select>` with a tracking ↗ link; for monster races with no own flavor, pulls lore-only folds from the matching Monster entry (exact name match + `metadata/race-monster-fluff.json` overrides) |
| `steps/class-step.js` | Class picker with structured preview, build/trained-skill choices, notes/sheet sync; **Hybrid class** checkbox hides hybrids by default, lists only hybrids when on, and reveals a second full-width picker (shared source filter) so two hybrid classes can be stored (`selections.classHybrid`, `selections.hybridClassIds`); second-class rule merging deferred |
| `steps/background-step.js` | Background picker with structured preview, skill bonus choices, notes sync |
| `steps/power-step.js` | Class power slots + shared combobox (clear-on-focus search); compendium open link (↗) on filled slots; type badge on list rows; **Recommended powers for this class** button; source combo filter above picker |
| `steps/feat-step.js` | Feat slots grouped by tier + shared combobox; **Recommended feats for this class** button; compendium open link (↗) on filled slots; source combo filter above picker |
| `steps/equipment-step.js` | Equipment inventory + body-slot equip UI; auto-seeds level-1 starting kits on first visit during **create** flow; **Recommended equipment** button (level 1) force-applies build kit; syncs sheet/mirror on equip changes; category tabs; source combo + combobox picker; manual gold (gp) field; inline **Item level** control on equipped level-scaled defense items (Amulet of Protection) and inline **Magic bonus** selector (None/+1/+2/+3) on equipped base weapons/armor/implements (shows derived name "+2 Chainmail", item level, and price) |
| `picker/picker-source-combo.js` | All + source-book dropdown filter (race, class, power, feat, equipment); opt-in "released on/before" date filter (`showDate`) with `resolveSourceBooksByDate(dateMap, cutoff)` (used by the GM Workshop duplicate picker) |
| `choice-guide.js` | Sequential pending-choice highlight, scroll, and focus (race + class steps) |
| `steps/race-grants-panel.js` | Racial power/feat tile cards on race step; per-power ability `<select>` for powers offering an ability-score choice and a per-power damage-type `<select>` for powers offering a damage choice (persist `selections.racePowerAbilityChoices` / `selections.racePowerDamageChoices`) |

## `src/shared/`

| File | Role |
|------|------|
| `escape-html.js` | Shared HTML escaping for GM/party cards |
| `imperial-metric.js` | Height/weight metric helpers for race preview |

## `src/data/`

| File | Role |
|------|------|
| `compendium.js` | SQLite/stub compendium provider |
| `compendium-link-index.js` | Longest-first compendium name index for editor tooltips |

## `src/ui/`

| File | Role |
|------|------|
| `compendium-links.js` | Link compendium terms in plain text and HTML previews |
| `compendium-hover-card.js` | Floating hover card for `.comp-link` terms |
| `compendium-entry-url.js` | Build the standalone compendium entry-viewer URL (`entry.html?id=`) |
| `condense-rule-text.js` | `condenseRuleHtml(entry)` strips flavor/`publishedIn`/title-duplicate nodes, keeps the mechanical core (powerstat lines, feat benefit, ritual stat block) for printable rule cards |

## `src/print/`

| File | Role |
|------|------|
| `cards.html` | Printable rule-cards page shell (toolbar + grid; links `cards.css`) |
| `cards.js` | Renders one condensed tile per power/universal action/feat/ritual the character has; reads the `editor.printCards` localStorage handoff (`{ character, categories }`; falls back to the active stored character + all categories), rendering only the chosen categories, reusing `collectAllCollectionItems` + `condenseRuleHtml`. Power tiles are personalized via `power-card-values.js`: Attack ability terms gain this character's full to-hit (e.g. `Strength +9`) and `<ability> modifier` damage terms gain the modifier value (e.g. `(+5)`), styled `.rule-card-calc`. Weapon vs implement vs ranged is detected from the rule text so the correct magic enhancement is folded in (weapon powers use the equipped weapon's bonus, implement powers the implement's). The A4 layout is a two-column grid with at most four large cards per page; long cards grow past the minimum height instead of clipping |
| `cards.css` | Self-contained card grid + frequency accents (at-will/encounter/daily); `@page { size: A4 }`, a 2-column grid with a `--card-h` per-card minimum height and `--card-gap` so at most four cards print per page yet long cards grow past the minimum (`break-inside: avoid`, no clipping), and `@media print` rules |

## `src/encounter/`

| File | Role |
|------|------|
| `combat-helpers.js` | Static/total initiative, sort combatants, apply roll |
| `actor-stats.js` | Inline HP/defenses/abilities read-write for encounter cards |
| `rewards.js` | Apply XP/gold/items to character documents (client + server) |

## `src/gm/`

| File | Role |
|------|------|
| `index.html` | GM console shell (stats + quick-build) |
| `gm.js` | GM console entry: campaign stats, quick-build → editor |
| `campaigns/index.html` | Online campaign management page |
| `campaigns/campaigns.js` | Campaigns page entry |
| `campaigns/encounters/index.html` | Encounter tracker (rest, initiative, rewards) |
| `campaigns/encounters/encounters.js` | Encounters page logic |
| `campaigns/encounters/encounters.css` | Encounters layout |
| `campaigns-panel.js` | Expandable multi-campaign list, create, invite copy, party polling |
| `workshop/index.html` | GM Workshop: category dashboard + homebrew entry editor + Source-dates dialog |
| `workshop/workshop.js` | Workshop page: GM slug, category list, entry CRUD, Source-dates editor (`getSourceBookDates`/`saveSourceBook`) |
| `workshop/workshop.css` | Workshop dashboard grid, editor + source-dates dialog layout |
| `workshop/entry-editor-dialog.js` | Entry editor modal with live compendium-parity preview; duplicate picker has the source + "released on/before" date filter |
| `workshop/category-columns.js` | Listing column defs per compendium category (PROJECT.md §5.2) |
| `feedback/index.html` | GM feedback statistics + management page (gated on a GM session) |
| `feedback/feedback-admin.js` | Loads stats + entries via `feedback-api.js`; filter, change status, delete (GM only) |
| `feedback/feedback-admin.css` | Stats grid + entry list/card styles with per-category accent |
| `workshop/render-entry-preview.js` | Shared preview renderer for Workshop and compendium detail |
| `gm.css` | GM console styles |

## `src/game/`

| File | Role |
|------|------|
| `index.html` | Game editor shell (roster + combat tabs) |
| `game.js` | Legacy encounters UI; imports `src/encounter/combat-helpers.js` |
| `game.css` | Game editor layout |

## `src/data/`

| File | Role |
|------|------|
| `compendium.js` | `CompendiumProvider`: stub/SQLite + merged homebrew via `/api/homebrew`; normalized-first read methods (`usesNormalized`, `getRaceSubraceMap`, `getNormalizedClass`, `listNormalizedPowers`, `getNormalizedItemStats`, `getNormalizedRaceTraits`, `getPowerAbilityOptions`, `getPowerDamageOptions`, `getSourceBookDates`) with parse fallback; power filtering uses the normalized `power` table when present |

## `src/party/`

| File | Role |
|------|------|
| `README.md` | How players export and GM copies files here |
| `index.json` | Auto-generated file list (`npm run party:index`) |
| `Sample_Fighter_1.json` | Example party character export |
| `*.json` | Player character exports (excluded from git index except samples) |

## `tools/importer/`

| File | Role |
|------|------|
| `README.md` | JSONP → SQLite pipeline spec (implementation external) |

## `tools/normalize/`

| File | Role |
|------|------|
| `normalize.mjs` | Compendium ETL: reads denormalized `entries`, writes normalized tables into the same SQLite file; reuses existing parsers; emits `normalize_warnings`. `parseItemTiers` splits level-scaled items into `item_level` rows and sets the parent `item.cost_gp` to the lowest tier. Flags `--src`/`--out`/`--from-stub`/`--report`/`--if-exists`. Scripts: `npm run normalize`, `npm run normalize:stub` |
| `schema.sql` | Normalized table DDL (`source_books`, `race*`, `class*`, `power`, `item`/`item_level`/`armor_stats`/`weapon_stats`, `background*`, `norm_meta`, `normalize_warnings`) |

## URLs (dev server `npm start`)

| Path | Page |
|------|------|
| `/src/` | Home hub |
| `/src/sheet/` | Character sheet |
| `/src/editor/` | Character generator |
| `/src/playlist/` | Top of playlist |
| `/src/gm/` | GM console |
| `/src/gm/campaigns/` | Online campaign management |
| `/src/gm/campaigns/encounters/` | Encounter tracker (initiative, rewards) |
| `/src/gm/workshop/` | GM Workshop (shared homebrew compendium entries) |
| `/src/gm/feedback/` | GM feedback statistics + management |
| `/src/feedback/` | Feedback submission form (players + GMs) |
| `/src/game/` | Legacy game editor |
