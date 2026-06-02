# Projektbeschreibung — Alter Ego

**Letzte Aktualisierung:** 2026-05-23

## Worum es geht

**Alter Ego** ist das Gesamtprojekt für eine private D&D-4e-Runde (3–7 Spieler). Dieses Repository enthält Spezifikation ([PROJECT.md](../PROJECT.md)) und **Charakterwerkzeuge** — Generator, Blatt (Seite 1, US Letter), GM-Party-Ansicht. Zahlen folgen den üblichen 4e-Formeln.

## Für wen ist das Projekt?

| Zielgruppe | Nutzen |
|------------|--------|
| **Spieler** | Einladungslink öffnen → Generator → **Save** (kein JSON per Chat/USB) |
| **Spielleiter** | Kampagne anlegen → Link teilen → Party-Liste live (Polling) |
| **Entwickler / Host** | App + API auf VPS ([deploy-online.md](deploy-online.md)) oder lokal `npm run dev:all` |

**Primär:** Online-Kampagne (Browser + kleine Node/SQLite-API).  
**Optional:** Desktop-App (Tauri), JSON-Export/Import als Backup.

## Anforderungen & Planung (Dokumentation)

| Dokument | Inhalt |
|----------|--------|
| [requirements.md](requirements.md) | Anforderungen mit IDs (funktional / nicht-funktional) |
| [roadmap.md](roadmap.md) | Phasen, erledigter Online-Kampagnen-Plan, Backlog |
| [todos.md](todos.md) | Checklisten für Host, Entwickler, Agenten |
| [architecture.md](architecture.md) | Technik-Überblick (bewusst schlank, kein React) |

## Oberflächen (Online — empfohlen)

```text
┌─────────────────────────────────────────────────────────────┐
│  Host: dist/app/ + API /api                                  │
└─────────────────────────────────────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐  ┌──────────────────────────────────┐
│ Join    │  │ GM-Konsole                        │
│ ?c=&t=  │  │ Kampagne erstellen · Party live   │
└────┬────┘  └──────────────────────────────────┘
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Spieler-Hub → Generator → Save → API → SQLite               │
└─────────────────────────────────────────────────────────────┘
```

**Desktop (optional):** Start ([launcher](../src/launcher/)) → Spieler oder SL; Sync nur mit erreichbarer API.

## Technischer Ansatz

| Schicht | Technik |
|---------|---------|
| UI | HTML, CSS, ES-Module (`src/`) |
| Build | **Vite** → `dist/app/` |
| API | **Express** + **SQLite** (`server/`) |
| Desktop | **Tauri 2** (optional) |
| Daten | `localStorage` + Kampagnen-API; Compendium-Stub bis `alter_eger.db` |

Details: [architecture.md](architecture.md).

## Was bereits funktioniert

- Online-Kampagne: erstellen, Einladung, Save-Sync, GM-Party (Polling)
- Game editor: Encounters, Monster/Party spawnen, Editor-Anbindung, Combat-Tab
- Charaktergenerator, Blatt, Formeln, JSON-Export
- Vite-Build, Launcher, Player-Hub, GM JSON-Backup-Import
- Desktop (Tauri), CI-Builds Windows/Mac
- API-Smoke-Test: `npm run test:api`
- Security & Input-Tests: `npm test` (51 Tests: SQLi, Auth, Datei-Import, XSS)

## Game editor

Der **Game Editor** (`/src/game/`) bündelt **Spieler-PCs**, **Monster** und Kreaturen zu einer **Encounter-Liste** mit **NPC-Instanzen** (mehrfach pro Vorlage). Der SL öffnet Instanzen im **Charaktereditor**; verknüpfte PCs sind schreibgeschützt, Kopien editierbar. **Combat-Tab:** Initiative und HP.

Spezifikation: [game-editor.md](game-editor.md).

## Noch offen (Auszug)

- Vollständiges Compendium (`alter_eger.db`) — Phase 1 in [roadmap.md](roadmap.md)
- SL-Kampf-Oberfläche — Phase 3 (nutzt Encounter-Roster)
- Optional: SSE statt Polling, DELETE Charakter per API

## Schnellstart (Entwickler)

```bash
npm install
npm run dev:all    # Frontend + API
```

| URL (Dev) | Seite |
|-----------|--------|
| http://localhost:5173/src/launcher/ | Rollenwahl |
| http://localhost:5173/src/gm/ | SL (Kampagne) |
| http://localhost:5173/src/join/ | Einladung (mit `?c=&t=`) |

## Weitere Dokumentation

| Datei | Inhalt |
|-------|--------|
| [files.md](files.md) | Dateireferenz |
| [bugs.md](bugs.md) | Bekannte Limits |
| [tests.md](tests.md) | Test-Checkliste |
| [deploy-online.md](deploy-online.md) | VPS-Deploy |
| [../README.md](../README.md) | Kurzanleitung (EN) |
