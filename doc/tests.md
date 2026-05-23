# Tests

**Last updated:** 2026-05-22

## Automation status

| Area | Status | Command / tool |
|------|--------|----------------|
| Unit tests | **Not implemented** | No test runner in `package.json` |
| PDF export | **Manual / script** | `npm run pdf`, `npm run pdf:levels` |
| Party index | **Script** | `npm run party:index` |

Planned: formula unit tests in `src/formulas.js` (pure functions, easy to test in Node).

## Manual test checklist

Run after changes to formulas, sheet DOM, editor, or GM flow.

### Home hub (`http://localhost:5173/src/`)

- [ ] Only **Character generator** and **Top of playlist** — centered, no extra nav  
- [ ] Both links open the correct screens  

### Character generator (`/src/editor/`)

- [ ] Gate: load saved character or import JSON → **Level up** / **Generate new character**  
- [ ] **Generate new character** → steps **Race → Background → Class → Attributes → Equipment**  
- [ ] Compendium choice buttons are large and readable (Tailwind `picker-btn`)  
- [ ] **Level up** increases level and opens full builder flow  
- [ ] **Change character** returns to gate  

### Character sheet (`/src/sheet/`)

- [ ] Open `/src/sheet` (no trailing slash) — calculated fields populate (AC, ability mods, skills)
- [ ] Change **level** → ½ level, defenses, skills, attacks update  
- [ ] Change ability **scores** → mods and dependent skills update  
- [ ] **Initiative**, **AC**, **Fort / Ref / Will** match README formula table  
- [ ] **Passive Insight / Perception** = 10 + skill bonus  
- [ ] **Bloodied** and **surge** values track max HP  
- [ ] **Print** / scale control: layout readable at 75%–125%  
- [ ] Level 1–30 table on second page renders in print preview  

### Top of playlist (`/src/playlist/`)

- [ ] With `src/party/index.json` populated, list loads; first row highlighted  
- [ ] **Open sheet** opens `/src/sheet/` with character data  

### GM console (`/src/gm/`)

- [ ] After `npm run party:index`, party list shows `src/party/*.json`  
- [ ] Open sheet and editor links work for a sample character  

### PDF (`npm run pdf`)

- [ ] `output/alter-eger-sheet-page1.pdf` created without error  
- [ ] `npm run pdf:levels` → `output/dnd4e-levels-1-30.pdf`  

## Recording test changes

When adding scripts or a test runner, update the **Automation status** table and note new commands here.
