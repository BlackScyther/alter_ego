# Tests

**Last updated:** 2026-06-07

## Automation status

| Area | Status | Command / tool |
|------|--------|----------------|
| Security & input (online API, files, XSS) | **Automated** | `npm test` or `npm run test:security` |
| Campaign API smoke | **Script** | `npm run test:api` |
| Unit tests | **Node test runner** | `tests/*.test.mjs` (no extra devDependency) |
| Web build | **Script** | `npm run build:app` |
| Desktop app | **Manual** | `npm run tauri:dev`, `npm run tauri:build` (requires Rust) |
| PDF export | **Manual / script** | `npm run pdf`, `npm run pdf:levels` |
| Party index | **Dev script** | `npm run party:index` |
| Player pack | **Legacy dev** | `npm run pack:player` |

## Automated security suite (`npm test`)

Runs tests across `tests/*.test.mjs`. Spawns a temporary campaign API (isolated SQLite) for integration checks.

| File | Covers |
|------|--------|
| `tests/api-security.test.mjs` | SQL injection in names/IDs, auth (401/403/404), token roles, oversized body (512 KB), DB survives injection |
| `tests/validate-character.test.mjs` | Server + client validation, API requires `id` |
| `tests/character-io.test.mjs` | Export filename sanitization, import validation |
| `tests/party-loader.test.mjs` | GM **file picker** and **folder/text import**: bad JSON, malicious filenames, XSS in fields, `__proto__` |
| `tests/html-escape.test.mjs` | Shared `escapeHtml`, GM card markup simulation |
| `tests/race-subraces.test.mjs` | Subrace parent map, base-race filtering |
| `tests/race-parse.test.mjs` | Race mechanics parsing, metric conversion, notes text |
| `tests/compendium-links.test.mjs` | Compendium keyword linking in editor previews |

## Manual test checklist — race step (editor)

Requires `npm run dev:src` or `npm run dev:all`.

- [ ] Race list excludes subraces (Gold Dwarf not in base list)
- [ ] Pick **Dwarf** → subrace picker appears; choose **Gold Dwarf**
- [ ] Ability “or” choice (Wisdom vs Strength) blocks **Next** until selected
- [ ] Preview shows Average Height with `· cm` suffix; flavor is collapsed
- [ ] Racial powers appear as tiles; hover shows compendium card
- [ ] Notes linked preview highlights terms; saved JSON notes stay plain text

**Requirements:** Node 20+ (uses global `File` for file-picker tests). API tests need a free local port (~3100–3999).

```bash
npm test              # full suite
npm run test:security # same as npm test
npm run test:api      # quick smoke (existing script)
```

## Manual test checklist — game editor

Requires GM campaign session (`npm run dev:all`).

- [ ] GM console → **Game editor** → create encounter
- [ ] **Add monster** → goblin appears; add again → second instance (different name suffix)
- [ ] **Add from party** (link) → player PC appears; **Open editor** is read-only
- [ ] **Add from party** (copy) or **Duplicate** → editable in editor; **Save** returns to game editor
- [ ] **Combat** tab: change initiative/HP → persists after reload
- [ ] `npm run test:api` includes encounter spawn tests

## Manual test checklist — online campaign

Requires `npm run dev:all` or `dev:api` + `dev`.

- [ ] GM: **Create campaign** → invite URL shown → copy works
- [ ] Player: open invite link → lands on player hub → editor shows campaign in status
- [ ] Player: **Save** → no error; GM party list shows character within ~5 s
- [ ] GM: **Open sheet** / **Open in editor** on a party card
- [ ] `npm test` and `node scripts/test-campaign-api.mjs` pass

## Manual test checklist — GM file / folder import

- [ ] **Add character files** (browser): valid `.json` loads; broken file shows error (not a crash)
- [ ] Import JSON with odd character names (unicode, quotes) — party card shows escaped text, no script execution
- [ ] Desktop: **Choose party folder** loads only `*.json` from selected folder
- [ ] Dev: **Reload dev folder** loads `src/party/` when `party:index` was run

## Manual test checklist — desktop app (optional)

Requires Rust for `tauri:dev` / `tauri:build`. See [README.md](../README.md).

### Role launcher

- [ ] App opens to **I am a player** / **I am the GM**
- [ ] **Remember my choice** skips launcher on next start
- [ ] Works offline (no Tailwind CDN; bundled CSS)

### Player flow

- [ ] **Character generator** — full wizard (Race → … → Equipment)
- [ ] **Export JSON** — native save dialog (desktop) or download (browser dev)
- [ ] **Character sheet** — calculations update; no GM link in toolbar
- [ ] Send file workflow: exported `Name_level.json` is valid JSON

### GM flow

- [ ] Empty state explains JSON from players (no npm / party:index in main text)
- [ ] **Add character files** loads multiple JSONs into party grid
- [ ] **Choose party folder** (desktop) loads all `*.json` from folder
- [ ] **Open sheet** / **Open in editor** work for a loaded character

### Release build

- [ ] `npm run build:app` succeeds
- [ ] `npm run tauri:build` produces installer under `src-tauri/target/release/bundle/` (local OS only)
- [ ] GitHub Actions **Build desktop app** → artifacts: `alter-eger-macos-intel-x64`, `alter-eger-macos-apple-silicon`, `alter-eger-windows-x64`

## Manual test checklist — browser dev (`npm run dev`)

### Role launcher (`/src/launcher/`)

- [ ] Player and GM links work

### Player home (`/src/player/`)

- [ ] Generator + sheet only; handoff hint visible

### Character generator (`/src/editor/`)

- [ ] Creation flow: Race → Background → Class → Attributes → Equipment
- [ ] Export downloads `.json`

### Character sheet (`/src/sheet/`)

- [ ] Calculated fields populate; level/score changes recalc

### GM console (`/src/gm/`)

- [ ] **Add character files** (file input) loads exports
- [ ] **Reload dev folder** loads `src/party/` when `party:index` was run (dev only)

### Legacy (developers only)

- [ ] `npm run pack:player` — optional; not the primary distribution
- [ ] `npm run start:legacy` — static serve on 5173

### PDF (`npm run pdf`)

- [ ] `output/alter-eger-sheet-page1.pdf` created without error

## Recording test changes

When adding scripts or cases, update the **Automation status** table and list new `tests/*.test.mjs` files here.
