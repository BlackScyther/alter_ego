# File reference

One-line role for each tracked file. Update this table when the tree changes.

**Last updated:** 2026-06-17 (GM Workshop homebrew)

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
| `app-icon.png` | Source for `npx tauri icon` (desktop icons) |
| `package-lock.json` | Locked dependency versions (Playwright) |
| `dimensions.json` | US Letter layout in inches; regions, columns, `--scale` |
| `output/*.pdf` | Generated PDFs from `npm run pdf` (not source) |

## `metadata/`

| File | Role |
|------|------|
| `editor.json` | Character editor wizard: steps, compendium categories, `writesTo` paths |
| `race-subraces.json` | Parent race → subrace id map (Dragonborn, Dwarf, Eladrin, Elf, Gnome) |
| `race-build-options.json` | Dragonborn / Genasi build-choice definitions (power picks) |
| `starting-equipment.json` | Level-1 starting equipment kits by class/build (PHB Fighter kits; stub Fighter fallback) |
| `equipment-stats-overrides.json` | PHB mundane armor/weapon stats for sheet sync when compendium body lacks parseable fields |
| `catalog-counts.json` | Expected compendium entry counts per category (import validation) |
| `README.md` | Index of metadata files; points to Alter Ego `PROJECT.md` |

## `data/`

| File | Role |
|------|------|
| `README.md` | Where `alter_eger.db` lives after import |
| `samples/compendium-stub.json` | Stub races/classes/feats until DB exists |
| `alter_eger.db` | *(planned)* SQLite compendium after importer runs |
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

## `server/`

| File | Role |
|------|------|
| `index.mjs` | Express app: CORS, rate limit, `/api/campaigns`, `/api/homebrew` |
| `db.mjs` | SQLite schema and queries (includes `homebrew_entries`) |
| `auth.mjs` | Bearer token hashing and middleware (`requireAnyGmToken` for homebrew writes) |
| `validate-character.mjs` | API-side character JSON validation |
| `routes/campaigns.mjs` | Create campaign, list/sync characters, GM rewards |
| `routes/encounters.mjs` | Encounters + actors; phase PATCH |
| `routes/homebrew.mjs` | Shared homebrew CRUD (`GET` public; writes require GM token) |
| `homebrew.mjs` | Homebrew entry storage, `hbrw_{gm}` SourceBook, index text |
| `compendium.mjs` | Server compendium lookup (official + `hb_*` homebrew ids) |
| `apply-rewards.mjs` | GM reward application + compendium stub lookup |
| `spawn-actor.mjs` | Spawn party/compendium/duplicate/blank actors |

## `src/character/` (campaign sync)

| File | Role |
|------|------|
| `campaign-session.js` | `sessionStorage` for campaign id, role, token |
| `campaign-api.js` | Client for `/api/campaigns` |
| `homebrew-api.js` | Client for `/api/homebrew` (Workshop CRUD) |
| `gm-campaign-registry.js` | GM localStorage registry for multiple campaigns (tokens, invite URLs) |
| `encounter-api.js` | GM client for `/api/campaigns/:id/encounters` (phase, HP, initiative) |
| `rewards-api.js` | GM client for `POST …/characters/:id/rewards` |
| `actor-spawn.js` | Build NPC instance documents from party/compendium |

## `src/join/`

| File | Role |
|------|------|
| `index.html`, `join.js` | Player invite link handler (`?c=&t=`) |

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
| `alter-eger-player/` | Legacy `pack:player` output |

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
| `index.html` | Main sheet DOM + embedded level 1–30 table |
| `levels.html` | Level reference page only (for `pdf:levels`) |
| `app.js` | Binds inputs to `formulas.js`; recalculates on change |
| `formulas.js` | D&D 4e math: ½ level, defenses, skills, attacks, HP, XP table |
| `sheet.css` | Print layout; `@page { size: letter }` |

## `src/character/` — document model & persistence

| File | Role |
|------|------|
| `model.js` | `createCharacter`, schema version, identity/sheet/selections; point-buy cost model and `autoPointBuy` budget allocator (shared by quick-build and Attributes step) |
| `store.js` | `localStorage` multi-character list |
| `io.js` | Export/import `{Name}_{level}.json` filenames and parsing |
| `sheet-bridge.js` | Maps character document → sheet field IDs (incl. `racial-powers`) |
| `tutor.js` | Ability/skill bonuses, choice groups, race bonus choices, 4e stacking |
| `race-subraces.js` | Core/subrace map helpers and base-race filtering |
| `race-parse.js` | Parse race HTML → mechanics, flavor fold, compact notes, grants; ability bonus picker (combo `<select>` for "any one ability", buttons for limited choices) |
| `race-selections.js` | Race step validation, build/bonus choices, grant sync |
| `background-parse.js` | Parse background HTML (iws.mx inline skills + raw narrative), preview fold, skill picker, compact notes |
| `background-selections.js` | Background associated-skill +2/+1 choices and step validation |
| `background-effects.js` | HP substitute, initiative misc, and other composable background effects |
| `background-effect-selections.js` | Persist HP-substitute ability choice on character |
| `class-effects.js` | Static initiative bonuses from class features (curated override-first, conditional phrasing skipped); composes with background initiative |
| `class-parse.js` | Parse class HTML (traits, builds, italic class skills, build suggested skills and starter power names) |
| `class-selections.js` | Class build/trained-skill choices, suggested-skill seeding, recommended power resolution (metadata + compendium name lookup), recommended ability priorities from class Key Abilities, grants, sheet sync |
| `equipment-selections.js` | Equipment inventory instances, body-slot equip/unequip/swap, legacy `equipmentIds` migration, gold field shape, `clearAllEquipment`; shields equip to off hand |
| `equipment-stats.js` | Parse compendium equipment entries + PHB override table for AC, check penalty, weapon dice/prof |
| `equipment-sheet-sync.js` | Push equipped gear into sheet defenses, speed, armor check, and mirror attack lines |
| `starting-equipment.js` | Level-1 kit resolve/apply (`resolveStartingKit`, `applyStartingKit`, `getRecommendedStartingKitMeta`); auto-seed on create; force-apply for recommend button |
| `bonus-stacking.js` | Same-type bonus stacking (highest per type) |
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
| `editor.css` | Editor layout, race step, sheet-mirror tabs, compendium hover cards |
| `collapsible-chevron.js` | Shared SVG chevron for collapsible editor panels (sheet mirror, character collection) |
| `sheet-mirror.js` | Persistent wizard character-sheet mirror: tab UI, payload sync, collapse state |
| `sheet-mirror-fields.js` | Mirror field manifest grouped into tabs (Identity, Combat, Skills, Attacks, …) |
| `skills-table.js` | Shared skills table markup and handlers; class-skill trained checkboxes reflect build suggested skills |
| `steps/race-step.js` | 3-phase race picker, bonus/build choices (no source filter on build choices), grants, linked preview |
| `steps/background-step.js` | Background picker with structured preview, skill bonus choices, notes sync |
| `steps/power-step.js` | Class power slots + shared combobox (clear-on-focus search); compendium open link (↗) on filled slots; type badge on list rows; **Recommended powers for this class** button; source combo filter above picker |
| `steps/feat-step.js` | Feat slots grouped by tier + shared combobox; **Recommended feats for this class** button; compendium open link (↗) on filled slots; source combo filter above picker |
| `steps/equipment-step.js` | Equipment inventory + body-slot equip UI; auto-seeds level-1 starting kits on first visit during **create** flow; **Recommended equipment** button (level 1) force-applies build kit; syncs sheet/mirror on equip changes; category tabs; source combo + combobox picker; manual gold (gp) field |
| `picker/picker-source-combo.js` | All + source-book dropdown filter (race, class, power, feat, equipment) |
| `choice-guide.js` | Sequential pending-choice highlight, scroll, and focus (race + class steps) |
| `steps/race-grants-panel.js` | Racial power/feat tile cards on race step |

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
| `workshop/index.html` | GM Workshop: category dashboard + homebrew entry editor |
| `workshop/workshop.js` | Workshop page: GM slug, category list, entry CRUD |
| `workshop/workshop.css` | Workshop dashboard grid and editor dialog layout |
| `workshop/entry-editor-dialog.js` | Entry editor modal with live compendium-parity preview |
| `workshop/category-columns.js` | Listing column defs per compendium category (PROJECT.md §5.2) |
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
| `compendium.js` | `CompendiumProvider`: stub/SQLite + merged homebrew via `/api/homebrew` |

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
| `/src/game/` | Legacy game editor |
