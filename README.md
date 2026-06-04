# Alter Ego

Offline-capable **D&D 4th Edition** toolkit for a private group: character sheet, character generator, party/GM views, and (planned) a local compendium.

- **Master spec**: [PROJECT.md](PROJECT.md)
- **Project description (German)**: [doc/project.md](doc/project.md)

## Quick start

```bash
cd D:\Projects\web\4e\Alter_Ego
npm install
npx playwright install chromium
npm start
```

Open `http://localhost:5173/` — **Character generator** or **Top of playlist**.

| Page | URL |
|------|-----|
| Home | http://localhost:5173/ |
| Character sheet | http://localhost:5173/sheet/ |
| Generator | http://localhost:5173/editor/ |
| GM | http://localhost:5173/gm/ |
| Playlist | http://localhost:5173/playlist/ |

The generator uses stub compendium data until `data/alter_ego.db` is imported (phase 1, see `metadata/import.json`).

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
