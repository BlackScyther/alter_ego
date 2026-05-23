# Projektbeschreibung — Alter Eger

**Letzte Aktualisierung:** 2026-05-23

## Worum es geht

**Alter Eger** ist das Gesamtprojekt für eine offline Spielrunde (3–7 Spieler, SL am Laptop). Dieses Repository enthält Spezifikation ([PROJECT.md](../PROJECT.md)) und die **lauffähige Web-App** — beginnend mit einem **spielbaren, selbst berechnenden Charakterblatt** für *Dungeons & Dragons 4th Edition* (Seite 1 des offiziellen PHB-Layouts). Zahlen auf dem Blatt folgen den üblichen 4e-Formeln (halbes Level, Verteidigungen, Fertigkeiten, Angriffe, passive Wahrnehmung, Trefferpunkte). Das Layout ist für **US Letter** (8,5″ × 11″) gedacht und kann gedruckt oder als PDF exportiert werden.

Es handelt sich um ein **funktionales Fan-Layout** mit den gleichen Rechenfeldern wie das offizielle Blatt — **kein** Scan des Wizards-of-the-Coast-Originals.

## Für wen ist das Projekt?

| Zielgruppe | Nutzen |
|------------|--------|
| **Spieler** | Blatt ausfüllen, Werte werden live berechnet; optional Charakter im Editor anlegen und aufs Blatt übernehmen |
| **Spielleiter** | GM-Konsole: mehrere exportierte Charaktere aus `src/party/` einsehen und Blatt/Editor öffnen |
| **Entwickler / Agenten** | Klare Modulgrenzen, Metadaten für den Editor, später Anbindung an ein Regelwerk-Compendium (SQLite) |

Es gibt **keine Cloud-Accounts**: Speicherung im Browser (`localStorage`) und Austausch über **JSON-Dateien** (`Charaktername_Stufe.json`).

## Oberflächen

```text
┌─────────────────────────────────────────────────────────────┐
│  Home (/src/)           Nur: Generator · Top of playlist      │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│  Generator (/src/editor/) │    │  Playlist top (/src/playlist/) │
│  Laden → Level up / Neu   │    │  Party-Reihenfolge, Top hervor │
│  Neu: Rasse→Hintergrund→  │    └─────────────────────────────┘
│  Klasse→Attribute→Ausr.   │
└──────────────────────────┘
         │ „Blatt öffnen“
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Charakterblatt (/src/sheet/)  Seite 1 + Stufen 1–30        │
│  Formeln in app.js ← formulas.js (eigenes Print-CSS)          │
└─────────────────────────────────────────────────────────────┘
         │ Spieler legt Export in src/party/ ab
         ▼
┌─────────────────────────────────────────────────────────────┐
│  GM-Konsole (/src/gm/)    Party-Liste aus index.json          │
└─────────────────────────────────────────────────────────────┘
```

UI-Vorgaben (Tailwind, Buttons, Flows): Ordner **`rules/`** (Englisch).

**Starten:** `npm start` → http://localhost:5173/src/ (Root leitet dorthin um)

## Technischer Ansatz

- **Frontend:** Statisches HTML, CSS und ES-Module; **Tailwind** auf App-Screens (Hub, Generator, Playlist); Blatt bleibt `sheet.css` für Druck.
- **Server:** Nur für Entwicklung (`serve` auf Port 5173) und PDF-Export (kurzlebiger HTTP-Server in Playwright).
- **Formeln:** Zentral in `src/formulas.js`, Anbindung ans DOM in `src/app.js`.
- **Charaktermodell:** `src/character/` (Dokument, Speicher, Export/Import, Brücke zum Blatt, Bonus-Stacking nach 4e-Regeln).
- **Compendium:** Aktuell **Stub-Daten** (`data/samples/compendium-stub.json`); geplant ist `data/alter_eger.db` nach JSONP-Import (Spezifikation in `metadata/import.json`).

## Module im Gesamtprojekt

| Modul | Pfad | Status |
|-------|------|--------|
| Spezifikation | `PROJECT.md` | Phase 0 erledigt |
| Charakterblatt + Formeln | `src/sheet/`, `src/app.js` | Nutzbar |
| Charaktergenerator | `src/editor/` | Wizard + Stub-Compendium |
| SL Party / GM | `src/gm/`, `src/party/` | Party-Liste, noch kein voller Kampf-Tracker |
| Compendium-Import | `tools/importer/`, `data/alter_eger.db` | Geplant (Phase 1) |

Metadaten (`metadata/`) und UI-Regeln (`rules/`) leiten sich direkt aus `PROJECT.md` ab.

## Was bereits funktioniert

- Live-Berechnung aller Hauptfelder auf dem Blatt
- Druck und PDF (Browser oder `npm run pdf`)
- Editor-Wizard mit Stub-Compendium
- JSON-Export/-Import und mehrere Charaktere pro Browser
- GM-Ansicht mit Party-Index (`npm run party:index`)

## Was noch aussteht (Kurz)

Details und IDs stehen in [bugs.md](bugs.md).

- Vollständiges Compendium (SQLite + Importer)
- Automatisierte Tests (siehe [tests.md](tests.md))
- sql.js-Anbindung im Browser für `alter_eger.db`

## Schnellstart

```bash
npm install
npx playwright install chromium
npm start
```

| URL | Seite |
|-----|--------|
| http://localhost:5173/src/ | Home (Generator / Playlist) |
| http://localhost:5173/src/sheet/ | Charakterblatt |
| http://localhost:5173/src/editor/ | Charakter-Generator |
| http://localhost:5173/src/playlist/ | Top of playlist |
| http://localhost:5173/src/gm/ | GM-Konsole |

PDF erzeugen: `npm run pdf` → `output/alter-eger-sheet-page1.pdf`

## Weitere Dokumentation

| Datei | Inhalt |
|-------|--------|
| [files.md](files.md) | Datei-für-Datei-Referenz |
| [bugs.md](bugs.md) | Bekannte Probleme und Limitierungen |
| [tests.md](tests.md) | Manuelle Test-Checkliste |
| [../README.md](../README.md) | Englische Kurzanleitung (Formeln, Druck) |
| [../PROMPT.md](../PROMPT.md) | Vorgaben für Cursor-Agenten |
