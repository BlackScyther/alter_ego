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
- **Class step:** static initiative bonuses from class features apply to the character's own initiative (curated `data/class-effect-overrides.json`, seeded with Warlord (Marshal) Combat Leader +2; composes with background initiative; conditional initiative effects intentionally ignored). A **Hybrid class** checkbox (off by default) hides hybrid classes from the normal list; when on, only hybrid classes are listed and a second class picker appears so two hybrid classes can be chosen. Both pickers share the one source filter and are stacked full-width so revealing the second never resizes the first. Hybrid is detected by class name prefix ("Hybrid …"). UI/storage only for now (`selections.classHybrid`, `selections.hybridClassIds`); merging two classes into HP/skills/powers/sheet is deferred.
- **Attributes step:** live 22-point point-buy status, plus a **Recommended ability scores for this class** button (same pattern as powers/feats/equipment) that auto-distributes the budget toward the class's Key Abilities; shares the `autoPointBuy` allocator with quick-build. Also handles **4e ability score increases (ASI)**: at levels 4/8/14/18/24/28 the player raises two different abilities by +1 (per-level dropdowns), and at levels 11/21 all six abilities gain +1 automatically. Increases stack with each other and racial/base bonuses and may exceed 18; the level-up flow routes here whenever an ASI choice is pending.
- **Equipment step:** inventory list, body-slot equip UI (armor, weapons, implement, worn items), compendium picker with category tabs and source filter, manual gold (gp) field. On **new level-1 character creation** (not edit), auto-applies curated starting kits (Fighter Great Weapon / Guardian), sets leftover gold, and syncs AC, armor check, speed, and basic attack lines to the sheet mirror; gear remains editable afterward. Level-1 characters also get a **Recommended equipment for this class** button (same pattern as powers/feats) to force-reapply the build kit and refresh sheet stats. Any equipped **base weapon, armor, or implement can be made magic** via an inline **Magic bonus** selector (None/+1/+2/+3): the chosen bonus drives attack+damage enhancement (weapons), AC enhancement (armor), or implement-power enhancement (implements), a derived display name ("+2 Chainmail"), and a derived item level + price. The melee/ranged attack lines show the higher of the equipped weapon's and implement's bonus, and the **printable power cards** fold the correct enhancement into each power (weapon powers use the weapon's bonus, implement powers the implement's). The bonus→level→price rules live in a GM-editable config (`metadata/magic-equipment-tiers.json`, defaults +1@L3, +2@L11, +3@L22; price = base item cost + per-tier increment).
- **Printable rule cards:** a **Print cards** button in the wizard's character-collection panel opens `src/print/cards.html`, which renders one condensed tile per power, feat, and ritual the character has (universal actions are not printed here — they live on the shared Resources page). Each tile keeps the mechanical rule text (action/keywords, Attack/Hit/Effect, feat benefit, ritual stat block) and strips flavor/publishing decoration via `src/ui/condense-rule-text.js`. Power tiles are **personalized to the character** (`src/character/power-card-values.js`): an attack like "Strength vs. AC" gains the actual to-hit (half level + ability modifier + equipped weapon proficiency, e.g. "Strength +9"), and "Strength modifier" damage terms show the modifier value (weapon enhancement and feat bonuses are not modeled yet). Clicking **Print cards** first opens a small dialog to choose which categories to include (Powers/Feats/Rituals; the choice is remembered for the session). The page prints on **A4** as a **two-column grid of large cards** with **at most four per page**: each card is at least a quarter-page tall, but a card with long rule text **grows past that minimum instead of clipping** and moves to the next page when its row no longer fits (nothing is ever cut off, since print can't scroll). The on-screen preview is not paginated; use Print / Save as PDF to see the four-per-page result. Print-optimized for Ctrl+P / Save as PDF
- **Printable character sheet:** a **Print sheet** button in the top-right of the wizard's character-sheet mirror header opens the scalable page-1 sheet (`src/sheet/index.html`) in a new tab, populated with all of the character's values (identity, abilities, defenses, skills, HP, attacks, movement, traits, feats/powers/rituals, racial powers). The sheet has a Scale slider and its own Print / Save as PDF button for US-Letter output. The static level 1–30 reference no longer prints with the sheet (it never changes per character); it now lives on the Resources page.
- **Player resources page:** a shared, character-independent reference at `src/resources/index.html` (linked from the Player hub and GM console), holding the **Values by Level (1–30)** table, a **formula key**, and the **Universal actions** every character can use (hydrated from `metadata/universal-actions.json` via the compendium). A **Print** button opens a pop-up dialog to choose which sections to print, then prints only those (toggling `.no-print` on the rest).
- **Feedback and tracking** (`/src/feedback/` + `/src/gm/feedback/`): a shared **Feedback** menu item (player hub, launcher, home hub, GM console, character generator sidebar) opens a categorized submission form for both players and GMs — categories are problem/bug, got stuck, wrong (per 4e rules), missing, feature wish, and do differently, plus optional area/severity/contact and auto-captured app version/role. Entries POST to a public `/api/feedback` endpoint (no auth, rate-limited) and are stored in SQLite. A GM-only statistics page (`/src/gm/feedback/`) aggregates entries (totals, last 30 days, by category/area/status, most recurring category+area) and lets the GM filter, change status (open/triaged/resolved/wontfix), and delete; reading/managing requires a GM campaign token.
- Vite build, launcher, player hub
- Desktop (Tauri), CI builds Windows/Mac
- API smoke test: `npm run test:api`
- Security and input tests: `npm test` (51 tests: SQLi, auth, file import, XSS)

## Game editor / encounters

The **Encounters** page (`/src/gm/campaigns/encounters/`) is the GM combat-prep surface: roster in **rest mode**, **initiative mode** (d20 + static, sorted turn order), and post-encounter **rewards** (XP, gold, compendium items to linked PCs). Legacy **game editor** (`/src/game/`) remains for compatibility.

Specification: [game-editor.md](game-editor.md).

## Compendium normalization

The compendium is moving from runtime HTML parsing to a **normalized SQLite** schema built once at import time. `tools/normalize/normalize.mjs` (`npm run normalize`) reads the denormalized `entries` table and writes structured tables (races/subraces, classes incl. hybrid links, powers with exact types, equipment stats incl. per-level `item_level` tiers for level-scaled items, source books with release dates) into the same DB file, reusing the existing parsers and recording parse failures in `normalize_warnings`. The app reads normalized-first with a parse fallback per category, so the migration is incremental and non-breaking. The GM can edit source-book release dates and filter compendium pickers by publication date (Workshop "Source dates" + the duplicate picker's "released on/before" control). Details: [compendium-schema.md](compendium-schema.md).

## Still open (summary)

- Full compendium (`alter_eger.db`) — phase 1 in [roadmap.md](roadmap.md)
- Finish the hybrid (B-024) merge UI (trained-skill pool + proficiencies in the skill/equipment step, enforce `hybridPowerCoverage`); the GM still fills in the remaining `source_books.release_date` values (UI shipped)
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
