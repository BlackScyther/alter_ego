# Project documentation (`doc/`)

This folder is the **living documentation** for agents and humans. Keep it in sync with the codebase.

| File | Purpose |
|------|---------|
| [project.md](project.md) | **Readable project description** (goals, users, architecture, status) |
| [files.md](files.md) | What each project file does and how it connects |
| [bugs.md](bugs.md) | Known bugs, limitations, and fix backlog |
| [tests.md](tests.md) | Test strategy, manual checks, and automation status |

## Maintenance rule

After **every completed agent task** (feature, fix, or refactor), update:

1. **project.md** — if scope, features, architecture, or user-facing goals changed  
2. **files.md** — if files were added, removed, renamed, or their role changed  
3. **bugs.md** — if bugs were fixed, found, or deferred  
4. **tests.md** — if test steps or coverage changed  

Also update the root **[PROMPT.md](../PROMPT.md)** when project goals, workflows, or agent conventions change.

Last agent sync: **2026-05-22** — `/verify`: sheet calc path fix (B-005); Playwright PDF export OK.
