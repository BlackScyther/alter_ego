# Bugs and known limitations

Track open issues, workarounds, and deferred work. Move items to **Fixed** when resolved.

**Last updated:** 2026-05-22

## Open

| ID | Severity | Summary | Notes |
|----|----------|---------|-------|
| B-001 | Medium | Compendium uses stub data only | `CompendiumProvider` falls back to `data/samples/compendium-stub.json` until `data/alter_eger.db` exists |
| B-002 | Medium | SQLite not wired in browser | `compendium.js` documents sql.js integration as a later phase |
| B-003 | Low | iws.mx importer not in repo | Pipeline spec in `tools/importer/README.md`; implementation is external |
| B-004 | Low | No automated test suite | See [tests.md](tests.md); regressions caught manually |

## Fixed

| ID | Fixed | Summary |
|----|-------|---------|
| B-005 | 2026-05-22 | Sheet live calculations broken on clean URLs (`/src/sheet`): relative `../app.js` resolved to `/app.js` (404). Fixed with root-absolute `/src/app.js`, `/src/formulas.js`, `/src/sheet.css`; `initSheet()` runs after inline DOM build. |

## How to log a new bug

1. Add a row under **Open** with the next `B-###` id.  
2. Reference the file(s) involved.  
3. When fixed, move the row to **Fixed** with date and brief resolution.
