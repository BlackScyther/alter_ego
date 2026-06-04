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
| [game-editor.md](game-editor.md) | GM encounter roster, NPC instances, editor bridge (planned) |
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

**Last agent sync:** 2026-06-04 — Documentation and agent rules: English-only (accessibility); German docs translated; see [project.md](project.md).
