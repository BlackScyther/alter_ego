# Project description — Alter Ego

**Last updated:** 2026-06-07

## What this is

**Alter Ego** is the umbrella project for a private D&D 4e campaign (3–7 players). This repository holds the specification ([PROJECT.md](../PROJECT.md)) and **character tools** — generator, sheet (page 1, US Letter), and GM party view. Numbers follow standard 4e formulas.

## Who it is for

| Audience | Value |
|----------|--------|
| **Players** | Open invite link → generator → **Save** (no JSON via chat/USB) |
| **DM** | Create campaign → share link → live party list (polling) |
| **Developer / host** | App + API on VPS ([deploy-online.md](deploy-online.md)) or locally `npm run dev:all` |

**Primary:** Online campaign (browser + small Node/SQLite API).  
**Optional:** Desktop app (Tauri), JSON export/import as backup.

## Requirements and planning (documentation)

| Document | Contents |
|----------|----------|
| [requirements.md](requirements.md) | Requirements with IDs (functional / non-functional) |
| [roadmap.md](roadmap.md) | Phases, completed online-campaign plan, backlog |
| [todos.md](todos.md) | Checklists for host, developer, agents |
| [architecture.md](architecture.md) | Technical overview (deliberately lean, no React) |

## Surfaces (online — recommended)

```text
┌─────────────────────────────────────────────────────────────┐
│  Host: dist/app/ + API /api                                  │
└─────────────────────────────────────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐  ┌──────────────────────────────────┐
│ Join    │  │ GM console                        │
│ ?c=&t=  │  │ Create campaign · live party      │
└────┬────┘  └──────────────────────────────────┘
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Player hub → generator → Save → API → SQLite               │
└─────────────────────────────────────────────────────────────┘
```

**Desktop (optional):** Launcher ([launcher](../src/launcher/)) → player or DM; sync only when the API is reachable.

## Technical approach

| Layer | Stack |
|-------|--------|
| UI | HTML, CSS, ES modules (`src/`) |
| Build | **Vite** → `dist/app/` |
| API | **Express** + **SQLite** (`server/`) |
| Desktop | **Tauri 2** (optional) |
| Data | `localStorage` + campaign API; compendium stub until `alter_eger.db` |

Details: [architecture.md](architecture.md).

## What already works

- Online campaign: create, invite, save sync, GM party (polling)
- Game editor: encounters, spawn monsters/party, editor bridge, combat tab
- Character generator, sheet, formulas, JSON export
- **Race step:** core/subrace pickers, ability “or” choices on race step, racial power/feat grant tiles, compendium hover links in preview and notes
- Vite build, launcher, player hub, GM JSON backup import
- Desktop (Tauri), CI builds Windows/Mac
- API smoke test: `npm run test:api`
- Security and input tests: `npm test` (51 tests: SQLi, auth, file import, XSS)

## Game editor

The **game editor** (`/src/game/`) combines **player PCs**, **monsters**, and creatures into an **encounter list** with **NPC instances** (multiple per template). The DM opens instances in the **character editor**; linked PCs are read-only, copies are editable. **Combat tab:** initiative and HP.

Specification: [game-editor.md](game-editor.md).

## Still open (summary)

- Full compendium (`alter_eger.db`) — phase 1 in [roadmap.md](roadmap.md)
- DM combat surface — phase 3 (uses encounter roster)
- Optional: SSE instead of polling, DELETE character via API

## Quick start (developer)

```bash
npm install
npm run dev:all    # Frontend + API
```

| URL (dev) | Page |
|-----------|--------|
| http://localhost:5173/src/launcher/ | Role picker |
| http://localhost:5173/src/gm/ | DM (campaign) |
| http://localhost:5173/src/join/ | Invite (with `?c=&t=`) |

## More documentation

| File | Contents |
|------|----------|
| [files.md](files.md) | File reference |
| [bugs.md](bugs.md) | Known limits |
| [tests.md](tests.md) | Test checklist |
| [deploy-online.md](deploy-online.md) | VPS deploy |
| [../README.md](../README.md) | Short guide (EN) |
