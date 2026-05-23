# Agent prompt — Alter Eger

Use this file as the primary context when working in this repository.

**Master spec:** [PROJECT.md](PROJECT.md) — compendium, party, DM combat surface, phases.

## Project goal

Build and maintain **Alter Eger**: offline D&D 4e tools for a private table. Current code focuses on a **formula-driven character sheet (page 1)** with:

- Live calculations (`src/formulas.js`, `src/app.js`)
- US Letter print/PDF (`dimensions.json`, `scripts/export-pdf.mjs`)
- Home hub, character generator, and playlist top (`src/index.html`, `src/editor/`, `src/playlist/`; UI rules in `rules/`)
- Local export/import and GM party view (`src/character/`, `src/party/`, `src/gm/`)

Spec alignment: [PROJECT.md](PROJECT.md) and `metadata/*.json`.

## Conventions

- **Stack**: Static HTML/CSS/ES modules; **Tailwind** on app screens (`rules/ui.md`); `npm start` serves the repo root on port 5173 (hub at `/src/`).
- **Minimize scope**: Match existing style; avoid unrelated refactors.
- **No commits** unless the user explicitly asks.
- **English only** — Agent replies, docs, and user-facing UI strings must be in English unless the user asks otherwise. Mixed languages make screen readers switch locale and are harder to read with low vision.

## Key paths

| Area | Path |
|------|------|
| Formulas | `src/formulas.js` |
| Home hub | `src/index.html` |
| Sheet UI | `src/sheet/index.html`, `src/app.js`, `src/sheet.css` |
| Character model | `src/character/` |
| Character generator | `src/editor/`, `metadata/editor.json`, `rules/character-generator.md` |
| Playlist top | `src/playlist/`, `rules/playlist.md` |
| UI rules | `rules/` |
| Compendium | `src/data/compendium.js`, `data/` |
| Documentation | `doc/` — start with `doc/project.md` |

## Required documentation updates

When you **finish** a task (implement, fix, or refactor), update these files before considering the work done:

1. **`doc/project.md`** — if scope, features, architecture, or goals changed  
2. **`doc/files.md`** — add/remove/rename files; change roles or dependencies  
3. **`doc/bugs.md`** — new bugs, fixed items, or limitation changes  
4. **`doc/tests.md`** — new manual steps, automation, or coverage notes  
5. **`doc/README.md`** — set **Last agent sync** to today’s date (YYYY-MM-DD)  
6. **`PROMPT.md`** — only if goals, workflows, or conventions changed  

Do not skip doc updates for “small” changes if behavior or file layout changed.

## Quick commands

```bash
npm install
npx playwright install chromium
npm start
npm run pdf
npm run party:index
```

## Current phase notes

- Compendium: stub JSON until `data/alter_eger.db` + importer complete  
- Tests: manual checklist in `doc/tests.md`; no unit runner yet  
