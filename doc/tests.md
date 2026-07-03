# Tests

**Last updated:** 2026-07-03

## Automation status

| Area | Status | Command / tool |
|------|--------|----------------|
| Security & input (online API, files, XSS) | **Automated** | `npm test` or `npm run test:security` |
| Campaign API smoke | **Script** | `npm run test:api` |
| Unit tests | **Node test runner** | `tests/*.test.mjs` (no extra devDependency) |
| Web build | **Script** | `npm run build:app` (runs `normalize --if-exists` then post-build) |
| Compendium normalize | **Script** | `npm run normalize` (real DB), `npm run normalize:stub` (dev DB from JSON stub) |
| Compendium not in Git | **Script** | `npm run check:legal` |
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
| `tests/gm-campaign-registry.test.mjs` | GM localStorage campaign registry: add, list, dedupe, corrupt storage |
| `tests/html-escape.test.mjs` | Shared `escapeHtml`, GM card markup simulation |
| `tests/race-subraces.test.mjs` | Subrace parent map, base-race filtering |
| `tests/race-parse.test.mjs` | Race mechanics parsing, metric conversion, notes text |
| `tests/post-load.test.mjs` | Post-load: XP threshold for level up, tooltip copy, retraining builder start step |
| `tests/character-collection.test.mjs` | Class grant collection; racial powers stay out of the class-powers sheet note |
| `tests/power-card-values.test.mjs` | Printable power-card math: ability-name mapping, signed formatting, full to-hit (half level + ability + weapon proficiency + enhancement + inline bonus), implement omits proficiency, weapon/implement enhancement folded into attack+damage per source, damage modifier, proficiency defaults to 0 when unsynced |
| `tests/race-selections.test.mjs` | Race build decisions: powers granted only after the choice; all 13 Genasi manifestations |
| `tests/ritual-selections.test.mjs` | Ritual caster detection, slots, granted rituals |
| `tests/tutor-bonus-table.test.mjs` | Tutor bonus table rendering |
| `tests/compendium-entry-url.test.mjs` | Compendium entry URL building/parsing |
| `tests/background-parse.test.mjs` | Background iws.mx HTML parsing, skill +2/+1 picker preview, Cult Survivor fixture |
| `tests/background-effects.test.mjs` | HP substitute, initiative misc, effect validation and sheet sync |
| `tests/class-effects.test.mjs` | Class-feature static initiative (Warlord +2), additive class+background composition, conditional exclusion |
| `tests/background-prerequisite.test.mjs` | Background race prerequisite filter modes |
| `tests/equipment-selections.test.mjs` | Equipment inventory, equip/unequip/swap, slot eligibility (shields → off hand), legacy migration |
| `tests/starting-equipment.test.mjs` | Level-1 kit resolve/seed; create-only gate; `getRecommendedStartingKitMeta`; `clearAllEquipment`; `applyStartingKit` force re-apply; sheet fields after seed |
| `tests/equipment-sheet-sync.test.mjs` | Equipment stats overrides; name/type armor fallback; armor/shield/weapon → defenses and attacks; level→enhancement mapping; Amulet of Protection → Fort/Ref/Will enh by item level; magic weapon → atk/dmg enh and magic armor → AC enh; magic implement → its bonus on the attack lines + `implement-enh` card field, melee line uses max(weapon, implement); `isEnhanceableEntry` (incl. implements)/`magicDisplayName`/`magicTierForBonus`/`magicTotalCostGp` + enhancement clamping |
| `tests/defense-formulas.test.mjs` | `defenseAbilityMod` (higher of two ability mods per defense); feeds defense total (FORT level-3 example = 18) |
| `tests/combat-helpers.test.mjs` | Encounter initiative: static, total, tie-break sort |
| `tests/encounter-rewards.test.mjs` | GM rewards POST; encounter phase PATCH; player token rejected |
| `tests/homebrew-api.test.mjs` | Homebrew CRUD API; GM auth; `hbrw_{slug}` SourceBook |
| `tests/feedback-api.test.mjs` | Feedback API: public `POST` + validation (required fields, category/area enums, length caps), GM-only `GET`/`GET /stats`/`PATCH`/`DELETE` (401/403 without GM token), stats aggregation by category/area |
| `tests/homebrew-store.test.mjs` | Homebrew slug validation, id generation, index text |
| `tests/point-buy.test.mjs` | `autoPointBuy` budget allocation: 22-point cap, priority ordering, one-dump-stat rule, unknown-key fallback |
| `tests/normalize.test.mjs` | Runs the normalizer ETL into a temp DB: tables created, race/subrace split, exact `power_type`, materialized armor/weapon stats, multi-tier `item_level` split (Amulet of Protection → 6 ascending tiers, parent `cost_gp` = lowest tier) + single-level items → one tier, source-book release dates, `norm_meta` counts |
| `tests/hybrid-merge.test.mjs` | PH3 hybrid merge: HP/surge math, skills (any three), armor/shield intersection + weapon/implement union, `hybridPairAllowed`, `hybridPowerCoverage` |
| `tests/subrace-hydrate.test.mjs` | `race-subraces.js` static default plus DB hydration via `setSubraceMap`/`hydrateSubracesFromProvider` |

## Manual test checklist — background step (editor)

Requires `npm run dev:src` or `npm run dev:all` and imported compendium (`data/alter_ego.db`).

- [ ] Pick **Cult Survivor** — preview shows narrative fold, Associated Skills (Arcana, Athletics, Religion), and +2/+1 skill picker
- [ ] Choose **+2 to one skill** and pick a skill — status line and **Background Features** sheet mirror field update
- [ ] Re-open the background step — prior skill choice is restored in preview and mirror
- [ ] Pick **Airspur** — fixed +2 Acrobatics and +2 Diplomacy (no picker); Benefit row visible

## Manual test checklist — race step (editor)

Requires `npm run dev:src` or `npm run dev:all`.

- [ ] Race list excludes subraces (Gold Dwarf, Bozak Draconian not in base list)
- [ ] Pick **Dwarf** → subrace picker appears; choose **Gold Dwarf**
- [ ] Pick **Dragonborn** → subrace picker offers **Bozak Draconian** / **Kapak Draconian**; preview title shows `Dragonborn — …`
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

- [ ] GM console shows campaign stats (created / active) and **Manage campaigns** link
- [ ] **Campaigns** page (`/src/gm/campaigns/`): create several; names persist; active row shows invite + **Copy link**
- [ ] GM: **Create campaign** → invite URL shown → copy works; character count updates after player **Save**
- [ ] Player: open invite link → lands on player hub → editor shows campaign in status
- [ ] Player: **Save** → no error; GM campaign panel shows character count within ~5 s
- [ ] GM: **Quick-create character** opens the editor
- [ ] `npm test` and `node scripts/test-campaign-api.mjs` pass

## Manual test checklist — character JSON import (editor)

- [ ] Editor: import valid `.json`; broken file shows error (not a crash)
- [ ] Import JSON with odd character names (unicode, quotes) — no script execution in UI

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

- [ ] Campaign create/invite and quick-build work
- [ ] Game editor **Add from party** lists saved campaign characters

### Release build

- [ ] `npm run build:app` succeeds
- [ ] `npm run tauri:build` produces installer under `src-tauri/target/release/bundle/` (local OS only)
- [ ] GitHub Actions **Build desktop app** → artifacts: `alter-ego-macos-intel-x64`, `alter-ego-macos-apple-silicon`, `alter-ego-windows-x64`

## Manual test checklist — browser dev (`npm run dev`)

### Role launcher (`/src/launcher/`)

- [ ] Player and GM links work

### Player home (`/src/player/`)

- [ ] Generator + sheet only; handoff hint visible

### Character generator (`/src/editor/`)

- [ ] Post-load: **Edit character** opens full builder at current level (feats onward)
- [ ] Post-load: **Level up** disabled until sheet Total XP meets next-level threshold; tooltip on hover when disabled
- [ ] Creation flow: Race → Background → Class → Attributes → Powers → Feats → Equipment
- [ ] **Equipment step** — add item from compendium to inventory; equip to body slot; unequip (×); swap via occupied slot; gold (gp) field persists
- [ ] Export downloads `.json`

### Character sheet (`/src/sheet/`)

- [ ] Calculated fields populate; level/score changes recalc

### GM console (`/src/gm/`)

- [ ] Campaign stats line (e.g. `2 campaigns created · 1 active`)
- [ ] **Manage campaigns** opens `/src/gm/campaigns/`
- [ ] **Quick-create character** opens editor

### Campaigns (`/src/gm/campaigns/`)

- [ ] **Online campaigns** — expand list; create multiple; active campaign shows invite and character count

### Feedback (`/src/feedback/` and `/src/gm/feedback/`)

- [ ] **Feedback** link present on player hub, launcher, home hub, GM console nav, and the character generator sidebar
- [ ] Submit form: choosing a category + title + details and clicking **Send feedback** shows a thank-you (server running)
- [ ] With the API offline, submit shows a clear "server may be offline" notice
- [ ] GM stats page: without a GM session shows the "GM session required" panel; with one, shows totals + by category/area/status + most recurring, and entries can be filtered, status-changed, and deleted

### Legacy (developers only)

- [ ] `npm run pack:player` — optional; not the primary distribution
- [ ] `npm run start:legacy` — static serve on 5173

### PDF (`npm run pdf`)

- [ ] `output/alter-ego-sheet-page1.pdf` created without error

## Recording test changes

When adding scripts or cases, update the **Automation status** table and list new `tests/*.test.mjs` files here.
