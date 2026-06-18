# Bugs and known limitations

Track open issues, workarounds, and deferred work. Move items to **Fixed** when resolved.

**Last updated:** 2026-06-15

## Open

| ID | Severity | Summary | Notes |
|----|----------|---------|-------|
| B-001 | Medium | Compendium uses stub data only (client) | Browser `CompendiumProvider` still falls back to stub when `alter_eger.db` missing; **server spawn** now reads SQLite when DB present (`server/compendium.mjs`) |
| B-002 | Medium | SQLite not wired in browser | `compendium.js` documents sql.js integration as a later phase |
| B-003 | Low | iws.mx importer not in repo | Pipeline spec in `tools/importer/README.md`; implementation is external |
| B-006 | Low | GM party uses polling (~4 s) | No SSE/WebSocket yet; see [roadmap.md](roadmap.md) |
| B-007 | Low | No API DELETE for player campaign characters | GM can remove encounter actors; not party PCs |
| B-008 | Low | Lost GM invite URL | GM-created campaigns persist tokens in `gm-campaign-registry.js` (localStorage). Switch active campaign, import recovery, and regenerate invite still open |
| B-016 | Low | Real compendium monsters lack listing HP/AC/Init | Spawn uses fallbacks until import extracts stat-block fields; stub entries work for smoke tests |

## Fixed

| ID | Fixed | Summary |
|----|-------|---------|
| B-020 | 2026-06-18 | Editor overflowed horizontally at high zoom / narrow viewports, pushing right-side action controls off-screen (e.g. the equipment slot/inventory "open in compendium" ↗ link and ✕ clear button were unreachable without horizontal scroll). Root cause: `.editor-shell` grid items defaulted to `min-width:auto`, so the `1fr` track grew to content min-content (464px at a 312px viewport). Fixed: added `min-width: 0` to `.editor-nav` and `.editor-main` so the column shrinks to the viewport. |
| B-019 | 2026-06-18 | Equipment step "Recommended equipment for this class" button stayed disabled for Warlord (Marshal): `metadata/starting-equipment.json` only defined kits for `class3`/`class1`/`Fighter (Weaponmaster)`, so `resolveStartingKit` returned `null`. Fixed: added `class8` and `Warlord (Marshal)` kits covering all five build options using verified compendium IDs (Chainmail, Light Shield, Longsword, Adventurer's Kit, Javelins; Hide + Short sword for Skirmishing). |
| B-005 | 2026-05-22 | Sheet live calculations broken on clean URLs (`/src/sheet`): relative `../app.js` resolved to `/app.js` (404). Fixed with root-absolute `/src/app.js`, `/src/formulas.js`, `/src/sheet.css`; `initSheet()` runs after inline DOM build. |
| B-004 | 2026-05-23 | No automated test suite → `npm test` (51 security/input tests). See [tests.md](tests.md). |
| B-009 | 2026-05-23 | Editor `showErrors` did not escape imported filenames (XSS via malicious `.json` name). Fixed: errors use `esc()`. |
| B-010 | 2026-06-11 | Racial powers (race step, e.g. Swiftcurrent) duplicated into the sheet "Class Powers" field. Fixed: `syncCollectionNotes` excludes `source: 'Racial'` items from `notes.powers`; they remain in "Racial Powers". |
| B-011 | 2026-06-11 | Race preview leaked embedded power-card stat lines (Attack / Level 11 / Level 21 / Trigger) into the benefits list (Genasi). Fixed: `stripPowerBlocks` also removes `<h1 class=…power>` cards; decision-tied powers (manifestations) are shown/granted only after the build choice; Genasi metadata extended to all 13 manifestations. |
| B-013 | 2026-06-12 | Racial ability bonuses missing after subrace pick (Elf, Dwarf, etc.): bonus sync loaded only the subrace compendium entry, which has no ability-score block; parent race bonuses were ignored. Fixed: `refreshBonusesFromSelections` resolves `raceBonusEntryId()` to the parent race entry. |
| B-014 | 2026-06-13 | Ardent (and similar psionic classes): trained-skill checkboxes on Ability Scores stayed disabled because compendium HTML uses `<i>Class Skills</i>:` instead of bold, leaving an empty class-skill pool. Fixed: `class-parse.js` matches italic/bold Class Skills labels and strips a leading colon from skill lists. |
| B-012 | 2026-06-11 | Background preview showed only campaign metadata for most compendium entries (e.g. Cult Survivor): iws.mx HTML uses raw `<br>` narrative and `<i>Associated Skills:</i>` lines, not `<p><b>…</b></p>` blocks. Fixed: `background-parse.js` extracts inline skills, narrative fold content, and default +2/+1 skill choice; sheet mirror notes sync on step load and skill picks. |
| B-015 | 2026-06-13 | Power picker list empty after clearing slots (Essentials classes): SQLite class filter used full name `Warlord (Marshal)` while compendium stores `Warlord`; encounter Type is `Enc. Attack`, not `Encounter`. Fixed: `classNameLikePatterns()` and `%enc.%` type patterns in `power-filter.js` / `compendium.js`; picker refreshes after any slot clear. |
| B-016 | 2026-06-13 | Character generator sidebar listed Feats before Powers during edit/retrain (`builderFlow`), while new-character flow (`creationFlow`) already had Powers first. Fixed: `builderFlow` order aligned; retraining opens at Powers. |
| B-017 | 2026-06-13 | Level 2+ utility power slot showed "No eligible powers" despite compendium matches: `Enc. Utility` / `Daily Utility` / `At-Will Utility` were normalized to Encounter/Daily/At-Will before Utility. Fixed: `normalizePowerType()` checks `utility` first. |
| B-018 | 2026-06-13 | Live server redirect loop Player → Character generator: deployed player page used absolute `/editor/` links; Apache `.htaccess` fallback served launcher instead of editor (launcher auto-redirect back to player when role remembered). Fixed: relative `../editor/index.html` links in player UI; `.htaccess` maps bare `/editor` etc. to `/src/...` before fallback. |

## How to log a new bug

1. Add a row under **Open** with the next `B-###` id.  
2. Reference the file(s) involved.  
3. When fixed, move the row to **Fixed** with date and brief resolution.
