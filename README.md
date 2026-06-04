# Alter Ego

Offline-capable **D&D 4th Edition** toolkit for a private group: character sheet, character generator, party/GM views, and (planned) a local compendium.

- **Master spec**: [PROJECT.md](PROJECT.md)
- **Project description**: [doc/project.md](doc/project.md)

## Quick start

```bash
cd D:\Projects\web\4e\Alter_Ego
npm install
npx playwright install chromium
npm run pull:live
npm start
```

`npm start` serves the **same files as** https://www.braincell.online/ (folder `sync-from-live/`).

Open **http://localhost:5173/src/launcher/** — Player / GM, version stamp, full compendium.

| Page (live mirror) | URL |
|------|-----|
| Launcher | http://localhost:5173/src/launcher/ |
| Player | http://localhost:5173/src/player/ |
| GM | http://localhost:5173/src/gm/ |
| Generator | http://localhost:5173/src/editor/ |

To edit Git source (not production parity): `npm run dev:src`.

## Repo structure (short)

| Path | What |
|------|------|
| `PROJECT.md` | Master specification |
| `src/` | Web app (sheet, editor, GM, party) |
| `metadata/` | Editor steps, import URLs, catalog counts |
| `doc/` | Docs: files, bugs, tests, project write-up |
| `rules/` | UI/flow rules |
| `tools/importer/` | Compendium importer (phase 1) |

## Migration note

Older work lived in `C:\Users\masch\Projects\dnd4e-character-sheet`. This repo is the **single** project root now; you can archive/delete the old folder once you no longer need it.

## Print / PDF

See [doc/project.md](doc/project.md). `npm run pdf` generates `output/alter-ego-sheet-page1.pdf`.
