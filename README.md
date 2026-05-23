# Alter Eger

Offline-fähiges **D&D 4th Edition**-Werkzeug für eine private Spielrunde: lokales Compendium (geplant), Charakterblatt, Charaktergenerator, Party- und SL-Ansichten.

**Gesamtspezifikation:** [PROJECT.md](PROJECT.md)  
**Projektbeschreibung (Deutsch):** [doc/project.md](doc/project.md)

## Schnellstart

```bash
cd D:\Projects\web\4e\Alter_Eger
npm install
npx playwright install chromium
npm start
```

Öffnen: http://localhost:5173/src/ — **Character generator** oder **Top of playlist**.

| Oberfläche | URL |
|------------|-----|
| Home | http://localhost:5173/src/ |
| Charakterblatt | http://localhost:5173/src/sheet/ |
| Generator | http://localhost:5173/src/editor/ |
| SL / GM | http://localhost:5173/src/gm/ |
| Playlist | http://localhost:5173/src/playlist/ |

Der Generator nutzt Stub-Compendium-Daten, bis `data/alter_eger.db` importiert ist (Phase 1, siehe `metadata/import.json`).

## Repo-Struktur (Kurz)

| Ordner | Inhalt |
|--------|--------|
| `PROJECT.md` | Master-Spezifikation Alter Eger |
| `src/` | Web-App (Blatt, Editor, GM, Party) |
| `metadata/` | Editor-Schritte, Import-URLs, Katalog-Counts |
| `doc/` | Dateien, Bugs, Tests, Projektbeschreibung |
| `rules/` | UI- und Flow-Regeln |
| `tools/importer/` | Compendium-Importer (Phase 1) |

## Migration

Früherer Entwicklungsstand lag unter `C:\Users\masch\Projects\dnd4e-character-sheet`. Dieses Verzeichnis ist die **einzige** Projektroot für Alter Eger; der alte Ordner kann archiviert oder gelöscht werden, sobald du nichts mehr davon brauchst.

## Druck / PDF

Siehe [doc/project.md](doc/project.md) — `npm run pdf` erzeugt `output/alter-eger-sheet-page1.pdf`.
