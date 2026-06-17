# GM encounters and initiative

**Last updated:** 2026-06-15

## Surfaces

| URL | Role |
|-----|------|
| `/src/gm/campaigns/encounters/` | **Primary** — rest mode, initiative mode, rewards |
| `/src/game/` | Legacy game editor (redirect hint in nav); shares encounter API |

Navigation: **GM Console → Campaigns → Encounters** (also linked from GM nav).

## Rest mode

Default encounter phase (`phase: rest` on server).

- Add **linked** or **copied** party PCs from the campaign
- Add **monsters** or **NPCs** from compendium (stub until full DB); **Monster source** filter (All + source book combo, same as feat/power pickers in the character editor)
- Add **blank NPC** shells
- Inline **compact** stat summary per actor: HP, defenses (AC · Fort · Ref · Will on one line), saves, initiative. Abilities and attack notes stay in **Edit** / **Sheet**.
- **Linked PCs** are read-only in the encounter (live stats from player saves); use **Sheet** or wait for player save
- **Edit full** opens the character editor; return path is stored in `sessionStorage` (`dnd4e.editorReturn`)

## Initiative mode

Switch with **Start initiative** (`PATCH` encounter `phase: initiative`).

- GM enters each participant's **d20 roll**
- **Total initiative** = roll + **static initiative**
  - PCs: Dex mod + half level + init misc + background initiative bonus (`formulas.js`)
  - Compendium monsters/NPCs: printed initiative stored in `sheet.initMisc`
- Sort order: total DESC, then static DESC, then name
- **HP current** editable during initiative (including linked PCs via `PATCH …/hp`)
- **Reset initiative** clears rolls; **Back to rest** keeps totals until reset

Logic: `src/encounter/combat-helpers.js`.

## Post-encounter rewards

**End encounter — rewards** opens the rewards dialog.

- Outcome label (informational): Victory, Fled, Party defeated, Other
- **XP** and **gold** split equally among selected linked PCs
- **Items** from compendium (`armor`, `weapon`, `item`, `implement`) assigned to selected linked PCs
- GM API: `POST /api/campaigns/:id/characters/:characterId/rewards`
- After apply: initiative cleared, phase returns to **rest**

Only actors with `linkedCharacterId` receive persistent rewards (copies are excluded).

## API and data

| Piece | Location |
|-------|----------|
| Encounter CRUD + actors | `server/routes/encounters.mjs` |
| Phase column | `encounters.phase` (`rest` \| `initiative`) in `server/db.mjs` |
| Rewards | `server/apply-rewards.mjs`, `server/routes/campaigns.mjs` |
| Client | `src/api/encounter-api.js`, `src/api/rewards-api.js` |
| Shared helpers | `src/encounter/` |

Actor documents reuse the character model; initiative stored in `sheet.combat.initiative` and `initiativeRoll`.

## Tests

- `tests/combat-helpers.test.mjs` — static/total initiative, tie-break sort
- `tests/encounter-rewards.test.mjs` — GM rewards + phase PATCH
- `scripts/test-campaign-api.mjs` — smoke includes phase and rewards
