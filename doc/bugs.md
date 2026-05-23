# Bugs and known limitations

Track open issues, workarounds, and deferred work. Move items to **Fixed** when resolved.

**Last updated:** 2026-05-23

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

## How to log a new bug

1. Add a row under **Open** with the next `B-###` id.  
2. Reference the file(s) involved.  
3. When fixed, move the row to **Fixed** with date and brief resolution.
