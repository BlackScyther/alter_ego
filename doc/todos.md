# Todo lists — Alter Ego

**Last updated:** 2026-05-24

Actionable tasks for **hosts**, **developers**, and **agents**. Long-term product phases: [roadmap.md](roadmap.md). Requirement IDs: [requirements.md](requirements.md).

**Deployment (web hosting with SSH / SFTP / Git from next week):** full checklists and fill-in profile → [deploy-hosting.md](deploy-hosting.md). VPS detail → [deploy-online.md](deploy-online.md).

> **Reminder — compendium on production:** All **compendium** entries must be **live** when deployed (full `data/alter_ego.db`, not `compendium-stub.json`). Stub data (3 sample races, etc.) is for local usability testing only. See [§ Deployment — compendium must be live](#deployment--compendium-must-be-live).

---

## Hosting profile (fill in — copy to your password manager)

| Field | Your value |
|-------|------------|
| SSH available from | `____-__-__` |
| Domain | `https://________________` |
| SSH | `user@host` port `____` |
| Web root | `________________` |
| App path on server | `________________` |
| Node on host? | Yes `v____` / No |
| Deploy method | Git / SFTP / panel Git / build-local-upload |
| `TOKEN_PEPPER` | (stored securely, not in Git) |

Details and all server env vars: [deploy-hosting.md#hosting-profile-fill-in-once](deploy-hosting.md#hosting-profile-fill-in-once).

---

## For the host — now (before SSH/SFTP/Git)

- [ ] Read [deploy-hosting.md §1](deploy-hosting.md#1-now--before-ssh-sftp-git)
- [ ] Panel: confirm date SSH/SFTP/Git go live: `____-__-__`
- [ ] Panel: Node.js available? Version: `____` / plan upgrade if No
- [ ] Panel: document root path: `________________`
- [ ] Local: `npm install` && `npm run build:app` && `npm run test:api`
- [ ] Generate `TOKEN_PEPPER`; save in password manager
- [ ] Choose deploy method A/B/C/D — [deploy-hosting.md §1.3](deploy-hosting.md#13-choose-deploy-method-decide-before-week-1)

---

## For the host — week 1 (SSH access)

- [ ] Complete [hosting profile](deploy-hosting.md#hosting-profile-fill-in-once)
- [ ] SSH login; record `node -v`, paths, disk space
- [ ] Create `~/data/alter-ego` (writable, outside web root)
- [ ] HTTPS works on your domain
- [ ] Plan `/api` → `localhost:3000` (proxy or subdomain)
- [ ] SFTP test upload to web root
- [ ] Git clone/pull on server (if using Git)

Guide: [deploy-hosting.md §2–3](deploy-hosting.md#2-day-1--hosting-inventory-ssh).

---

## For the host — first production deploy

- [ ] `npm install --omit=dev` on server (or upload `dist/app` from PC)
- [ ] Set env: `DATABASE_PATH`, `CORS_ORIGIN`, `PUBLIC_APP_URL`, `TOKEN_PEPPER`, `PORT`
- [ ] `dist/app` served at `https://<domain>/`
- [ ] **Compendium:** ship `alter_ego.db` with static files; verify editor does **not** show “sample data” ([§ below](#deployment--compendium-must-be-live))
- [ ] `npm run server` under PM2/systemd/panel Node app
- [ ] Reverse proxy: `/api` → Node port 3000
- [ ] Smoke test: GM create campaign → player Save → GM sees character ([tests.md](tests.md))
- [ ] Smoke test: character generator race picker has full catalog (not 3 stub races only)

Guide: [deploy-hosting.md §4](deploy-hosting.md#4-first-production-deploy) · VPS variant: [deploy-online.md](deploy-online.md).

---

## For the host — go-live (your table)

- [ ] GM bookmark: `https://<domain>/src/gm/`
- [ ] Create campaign; share invite link in group chat
- [ ] One test player Save → GM party updates
- [ ] Optional: full group dry run before session
- [ ] Backup: download `campaigns.db` weekly ([deploy-hosting.md §6](deploy-hosting.md#6-ongoing--updates--backups))

---

## For developers (local)

- [ ] `npm install`
- [ ] `npm run dev:all` (Vite + API)
- [ ] `npm run test:api`
- [ ] Before release: `npm run build:app`
- [ ] Before host deploy: `npm test`
- [ ] Before host deploy: compendium importer run; `alter_ego.db` in build output; `CompendiumProvider` not in stub mode ([§ below](#deployment--compendium-must-be-live))

Optional:

- [ ] `npm run tauri:build` (Windows installer)
- [ ] GitHub Actions **Build desktop app** for Mac `.dmg` ([mac-build-without-mac.md](mac-build-without-mac.md))

---

## Completed — Online campaign sync (2026-05-23)

All items from the online campaign plan:

- [x] `server/` Express + SQLite + campaign routes
- [x] Token auth (GM / player Bearer)
- [x] `src/character/campaign-api.js` + `campaign-session.js`
- [x] `src/join/` invite flow
- [x] Editor Save → sync to campaign
- [x] GM live party polling
- [x] Vite `/api` proxy; `npm run dev:all`
- [x] `doc/deploy-online.md`, `scripts/test-campaign-api.mjs`
- [x] Documentation pass (requirements, roadmap, architecture, todos)

---

## Completed — Desktop encapsulation (2026-05-23)

- [x] Vite multi-page build + bundled Tailwind
- [x] `src/launcher/` role picker
- [x] Tauri 2 project `src-tauri/`
- [x] GitHub Actions `build-desktop.yml` (Windows + Mac artifacts)
- [x] `doc/mac-build-without-mac.md`

---

## Completed — Game editor (2026-05-23)

- [x] G2–G6: [game-editor.md](game-editor.md) — `src/game/`, encounter API, editor bridge, combat tab

---

## Open — Character generator player UX (P2)

**Status:** Implemented 2026-05-24 (gate CTA, player import hidden, guided wizard).

### 1. Prominent “Create new character” (primary path)

- [x] Add **Create new character** as the main CTA on the gate screen — no saved character or import required first
- [x] Style as primary action (amber button, above the fold, larger than secondary controls)
- [x] Keep **Load saved character** as secondary (dropdown below or smaller)
- [x] Post-load screen: keep **Level up** vs **Create new character**; align labels with gate CTA
- [x] Player mode (`?mode=player`): gate copy explains “Start here if this is your first character”
- [ ] Manual test: fresh browser → player invite → create character without touching Import JSON

### 2. De-emphasize file import (player backup only)

- [x] Move **Import JSON** out of the top status bar on the gate screen (player mode)
- [x] Place import under **Advanced** / overflow / collapsed “Backup & restore” section
- [x] Gate screen: hide or demote “Import JSON file…” — not equal visual weight to Create new
- [x] Status bar: keep **Export JSON** for backup; import only in advanced area (player mode)
- [x] GM / non-player mode: import may stay more visible (GM backup path — FR-31)
- [x] Update player handoff hint: focus on **Save** to campaign, not “send JSON to GM”
- [x] Update [rules/character-generator.md](../rules/character-generator.md) Phase 1 when UX lands

### 3. Intuitive guided flow (reduce overwhelm)

- [x] Show clear progress: e.g. **Step 2 of 5 — Class** in wizard header (creation flow)
- [x] One short “what to do here” line per step (plain language, not rules jargon)
- [x] Sidebar: show only creation-flow steps for new builds; hide level-up-only steps until relevant
- [x] Empty compendium picker: helper text (“Pick your race — search or scroll the list”)
- [x] Ability Scores: collapse tutor detail by default; expand “How bonuses work” on demand
- [x] **Next** disabled state + inline hint when step validation fails (not only error list)
- [x] After last creation step: clear “You’re done — Save and open your sheet” summary
- [x] Optional: first-run tooltip or single intro panel before step 1 (dismissible)
- [ ] Manual test with a non-technical player: can they finish L1 without asking the GM?

---

## Deployment — compendium must be live

**Rule:** Production must not rely on `data/samples/compendium-stub.json`. The character generator, GM monster spawn, and any compendium picker need the full iws.mx mirror in `data/alter_ego.db` (see [catalog-counts.json](../metadata/catalog-counts.json) — e.g. **55** races, not 3).

Stub data stays valid for **local usability testing** only.

### Before any production deploy

- [ ] Run Phase 1 importer → `data/alter_ego.db` ([tools/importer/README.md](../tools/importer/README.md), [import.json](../metadata/import.json))
- [ ] Validate import counts against `metadata/catalog-counts.json`
- [ ] Include `alter_ego.db` in the static deploy artifact (path must match `CompendiumProvider` / Vite `fetch` URL)
- [ ] Wire browser SQLite in `src/data/compendium.js` (resolve B-001, B-002 — no `mode: stub` or `sqlite-pending` with empty lists)
- [ ] `npm run build:app` after DB is in place; redeploy static bundle

### After deploy (smoke)

- [ ] Character editor status line is **not** “Compendium: sample data (import DB for full rules)”
- [ ] Race step: search/list shows full catalog (spot-check: well over 3 races; target ~55)
- [ ] Class / background / feat pickers return entries where the wizard expects them
- [ ] GM: spawn NPC from monster list uses compendium rows (not empty picker)

### Blockers (track until done)

| ID | Task | Ref |
|----|------|-----|
| — | Phase 1 importer → `alter_ego.db` | PROJECT.md §11, B-003 |
| — | Wire sql.js / full compendium in `compendium.js` | B-001, B-002 |

---

## Open — product / code (backlog)

| Priority | Task | Ref |
|----------|------|-----|
| P1 | **Compendium live on production deploy** (DB + browser wire; no stub) | [§ Deployment — compendium](#deployment--compendium-must-be-live) |
| P1 | Production deploy online campaign (hosting checklists) | [deploy-hosting.md](deploy-hosting.md) |
| P1 | Fill hosting profile + first SSH inventory | [deploy-hosting.md §2](deploy-hosting.md#2-day-1--hosting-inventory-ssh) |
| P2 | **Character generator player UX** (Create new, hide import, guided flow) | Section above |
| P2 | Phase 1: compendium importer → `alter_ego.db` | PROJECT.md §11 |
| P2 | Wire sql.js / full compendium in `compendium.js` | B-001, B-002 |
| P3 | API: DELETE character (GM) | FR-43 |
| P3 | SSE for GM party updates | FR-42 |
| P4 | GM combat tracker | PROJECT.md §9 |
| Low | Commit `package-lock.json`; use `npm ci` in CI | |
| Low | Unit tests for `formulas.js` | [tests.md](tests.md) |

---

## Open — documentation maintenance

When changing behavior, update:

1. [project.md](project.md)
2. [files.md](files.md)
3. [bugs.md](bugs.md)
4. [tests.md](tests.md)
5. [doc/README.md](README.md) — **Last agent sync** date
6. This file if backlog shifts
7. [PROMPT.md](../PROMPT.md) only if agent conventions change

---

## Agent session checklist

Before marking work **done**:

- [ ] Code matches [requirements.md](requirements.md) IDs if applicable
- [ ] Manual steps added to [tests.md](tests.md) if new behavior
- [ ] [files.md](files.md) updated for new/moved files
- [ ] [doc/README.md](README.md) sync date updated
- [ ] Hosting/deploy docs updated if deploy process changed
- [ ] If deploy-related: compendium checklist in [§ Deployment — compendium](#deployment--compendium-must-be-live) still accurate
