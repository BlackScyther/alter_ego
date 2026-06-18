# Project description — Alter Ego

**Last updated:** 2026-06-17

## What this is

**Alter Ego** is the umbrella project for a private D&D 4e campaign (3–7 players). This repository holds the specification ([PROJECT.md](../PROJECT.md)) and **character tools** — generator, sheet (page 1, US Letter), and GM party view. Numbers follow standard 4e formulas.

## Who it is for

| Audience | Value |
|----------|--------|
| **Players** | Open invite link → generator → **Save** (no JSON via chat/USB) |
| **DM** | Create campaign → share link → game editor party picker (polling) |
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
│ ?c=&t=  │  │ Create campaign · quick-build · game editor │
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

- **Campaigns** (`/src/gm/campaigns/`): create campaigns; **Use this campaign** sets the active GM session for Encounters and Workshop
- **Workshop** (`/src/gm/workshop/`): GMs create shared homebrew compendium entries (`SourceBook = hbrw_{GM}`); visible in Character Generator and Encounters pickers
- Game editor (`/src/game/`): legacy encounter UI; primary surface is Encounters under Campaigns
- Character generator, sheet, formulas, JSON export
- **Race step:** core/subrace pickers, ability “or” choices on race step, racial power/feat grant tiles, compendium hover links in preview and notes
- **Class step:** static initiative bonuses from class features apply to the character's own initiative (curated `data/class-effect-overrides.json`, seeded with Warlord (Marshal) Combat Leader +2; composes with background initiative; conditional initiative effects intentionally ignored)
- **Attributes step:** live 22-point point-buy status, plus a **Recommended ability scores for this class** button (same pattern as powers/feats/equipment) that auto-distributes the budget toward the class's Key Abilities; shares the `autoPointBuy` allocator with quick-build
- **Equipment step:** inventory list, body-slot equip UI (armor, weapons, implement, worn items), compendium picker with category tabs and source filter, manual gold (gp) field. On **new level-1 character creation** (not edit), auto-applies curated starting kits (Fighter Great Weapon / Guardian), sets leftover gold, and syncs AC, armor check, speed, and basic attack lines to the sheet mirror; gear remains editable afterward. Level-1 characters also get a **Recommended equipment for this class** button (same pattern as powers/feats) to force-reapply the build kit and refresh sheet stats.
- Vite build, launcher, player hub
- Desktop (Tauri), CI builds Windows/Mac
- API smoke test: `npm run test:api`
- Security and input tests: `npm test` (51 tests: SQLi, auth, file import, XSS)

## Game editor / encounters

The **Encounters** page (`/src/gm/campaigns/encounters/`) is the GM combat-prep surface: roster in **rest mode**, **initiative mode** (d20 + static, sorted turn order), and post-encounter **rewards** (XP, gold, compendium items to linked PCs). Legacy **game editor** (`/src/game/`) remains for compatibility.

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
