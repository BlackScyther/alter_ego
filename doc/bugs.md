# Bugs and known limitations

Track open issues, workarounds, and deferred work. Move items to **Fixed** when resolved.

**Last updated:** 2026-06-13

## Open

| ID | Severity | Summary | Notes |
|----|----------|---------|-------|
| B-001 | Medium | Compendium uses stub data only | `CompendiumProvider` falls back to `data/samples/compendium-stub.json` until `data/alter_eger.db` exists |
| B-002 | Medium | SQLite not wired in browser | `compendium.js` documents sql.js integration as a later phase |
| B-003 | Low | iws.mx importer not in repo | Pipeline spec in `tools/importer/README.md`; implementation is external |
| B-006 | Low | GM party uses polling (~4 s) | No SSE/WebSocket yet; see [roadmap.md](roadmap.md) |
| B-007 | Low | No API DELETE for player campaign characters | GM can remove encounter actors; not party PCs |
| B-008 | Low | Lost GM invite URL | No recovery flow if `gmToken` not saved; create new campaign |

## Fixed

| ID | Fixed | Summary |
|----|-------|---------|
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

## How to log a new bug

1. Add a row under **Open** with the next `B-###` id.  
2. Reference the file(s) involved.  
3. When fixed, move the row to **Fixed** with date and brief resolution.
