# File reference

One-line role for each tracked file. Update this table when the tree changes.

**Last updated:** 2026-05-23

**Project root:** `D:\Projects\web\4e\Alter_Eger` (Alter Eger). Master spec: [PROJECT.md](../PROJECT.md).

## `doc/`

| File | Role |
|------|------|
| `README.md` | Index of documentation; maintenance rules |
| `project.md` | Readable project description (German) |
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
| `package.json` | npm scripts: `start`, `pdf`, `pdf:levels`, `party:index` |
| `package-lock.json` | Locked dependency versions (Playwright) |
| `dimensions.json` | US Letter layout in inches; regions, columns, `--scale` |
| `output/*.pdf` | Generated PDFs from `npm run pdf` (not source) |

## `metadata/`

| File | Role |
|------|------|
| `editor.json` | Character editor wizard: steps, compendium categories, `writesTo` paths |
| `import.json` | iws.mx JSONP import URLs and SQLite target spec |
| `catalog-counts.json` | Expected compendium entry counts per category (import validation) |
| `README.md` | Index of metadata files; points to Alter Eger `PROJECT.md` |

## `data/`

| File | Role |
|------|------|
| `README.md` | Where `alter_eger.db` lives after import |
| `samples/compendium-stub.json` | Stub races/classes/feats until DB exists |
| `alter_eger.db` | *(planned)* SQLite compendium after importer runs |

## `scripts/`

| File | Role |
|------|------|
| `export-pdf.mjs` | Playwright: local HTTP server → Letter PDF in `output/` |
| `build-party-index.mjs` | Scans `src/party/*.json` → writes `src/party/index.json` |

## `src/` — app shell

| File | Role |
|------|------|
| `index.html` | Home hub: Character generator vs Top of playlist (Tailwind, centered) |
| `ui/tailwind.html` | Shared Tailwind CDN snippet reference for app screens |

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
| `model.js` | `createCharacter`, schema version, identity/sheet/selections |
| `store.js` | `localStorage` multi-character list |
| `io.js` | Export/import `{Name}_{level}.json` filenames and parsing |
| `sheet-bridge.js` | Maps character document → sheet field IDs |
| `tutor.js` | Ability/skill bonuses, choice groups, 4e stacking rules |
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
| `index.html` | Generator: gate (load) → post-load → wizard (Tailwind + editor.css) |
| `editor.js` | Gate modes, `creationFlow` / `builderFlow`, compendium pickers |
| `editor.css` | Editor layout and components (complements Tailwind) |

## `src/gm/`

| File | Role |
|------|------|
| `index.html` | GM console shell |
| `gm.js` | Lists `src/party/` via `index.json`; open sheet/editor |
| `gm.css` | GM console styles |

## `src/data/`

| File | Role |
|------|------|
| `compendium.js` | `CompendiumProvider`: stub JSON now; `alter_eger.db` later |

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
