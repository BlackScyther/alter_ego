# Project documentation (`doc/`)

This folder is the **living documentation** for agents and humans. Keep it in sync with the codebase.

## Core documents

| File | Purpose |
|------|---------|
| [project.md](project.md) | **Readable project description** (goals, users, architecture, status) |
| [requirements.md](requirements.md) | Functional & non-functional requirements (IDs, status) |
| [roadmap.md](roadmap.md) | Phases, completed plans, near-term backlog |
| [todos.md](todos.md) | Host / developer / agent checklists |
| [architecture.md](architecture.md) | Stack overview, API, data flows (why it stays simple) |
| [game-editor.md](game-editor.md) | GM encounters: rest mode, initiative, rewards |
| [files.md](files.md) | What each project file does and how it connects |
| [bugs.md](bugs.md) | Known bugs, limitations, and fix backlog |
| [tests.md](tests.md) | Test strategy, manual checks, and automation status |

## Deployment & desktop

| File | Purpose |
|------|---------|
| [deploy-online.md](deploy-online.md) | VPS: static app + Node API + SQLite |
| [deploy-hosting.md](deploy-hosting.md) | Webhosting: SSH/SFTP/Git checklists, fill-in profile, timeline |
| [mac-build-without-mac.md](mac-build-without-mac.md) | macOS `.dmg` via GitHub Actions (no Mac required) |

## Maintenance rule

After **every completed agent task** (feature, fix, or refactor), update:

1. **project.md** — if scope, features, architecture, or user-facing goals changed  
2. **requirements.md** — if requirement IDs or status changed  
3. **roadmap.md** / **todos.md** — if phases or backlog changed  
4. **files.md** — if files were added, removed, renamed, or their role changed  
5. **bugs.md** — if bugs were fixed, found, or deferred  
6. **tests.md** — if test steps or coverage changed  
7. **architecture.md** — if stack or API shape changed  

Also update the root **[PROMPT.md](../PROMPT.md)** when project goals, workflows, or agent conventions change.

Set **Last agent sync** below when you finish a doc pass.

**Last agent sync:** 2026-06-18 — Fixed editor horizontal overflow at high zoom/narrow viewports (`.editor-nav`/`.editor-main` now use `min-width: 0`), so right-side controls like the equipment slot/inventory "open in compendium" ↗ link and ✕ clear button stay on-screen (B-020). Earlier: character collection panel now starts collapsed by default on first wizard open (state persists per session in `sessionStorage`, key `editor.characterCollection.collapsed`). Earlier: added Warlord (Marshal) starting-equipment kits (`class8` + name entry, all five build options) so the Equipment step "Recommended equipment for this class" button now enables for Warlords instead of staying disabled (B-019). Earlier: Attributes step gained a "Recommended ability scores for this class" button that auto-distributes the 22-point budget toward the class's Key Abilities; `autoPointBuy` moved to `model.js` and shared with quick-build; race ability "choose any one" bonus renders a compact combo `<select>`.
