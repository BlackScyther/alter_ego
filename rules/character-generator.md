# Character generator rules

Entry point: **Character generator** on the home hub → `src/editor/`.

## Phase 1 — Load (gate)

Before any wizard step:

1. User can **load an existing character** via:
   - Saved-character dropdown (`localStorage`)
   - Import JSON file
2. Until a character is loaded (or user explicitly starts fresh), the step wizard stays hidden.
3. Show only load controls and short instructions.

## Phase 2 — After load

Once a character is active, show **three** large actions (no other primary actions):

| Action | Behavior |
|--------|----------|
| **Edit character** | Open the **full** `builderFlow` at the **current** level (retraining), starting at powers and later steps — same entry as level up, without increasing level. |
| **Level up** | Enabled only when **Total XP** on the character sheet is at least the threshold for the next level (`xpForLevel(currentLevel + 1)`). Increases level by 1 (cap 30), sets sheet XP to the new level threshold, persist, then open the **full** builder flow from powers onward. Disabled state shows a hover tooltip explaining required XP. |
| **Generate new character** | Create a blank document (new id), then start the **creation** flow below. |

## Phase 3 — New character (creation flow)

Order is fixed — do not reorder without updating `metadata/editor.json` → `creationFlow`:

1. **Race**
2. **Background**
3. **Class**
4. **Attributes** (ability scores / point-buy tutor, skills table)
5. **Powers** (class slots by type — At-Will, Encounter, Daily, Utility; **Recommended powers for this class** button when build metadata includes starter picks; source filters; prerequisite filter)
6. **Feats** (level slots; source filters; prerequisite filter by level and ability scores)
7. **Equipment**

Optional steps (paragon, epic, review) remain in `builderFlow` for level-up and advanced editing. Themes are omitted in this version.

## Phase 4 — Level up (builder flow)

Use `builderFlow` from metadata. Skip steps disabled for the current level (`isStepEnabled`). Basics (name, level) remain editable in the **Basics** step when leveling.

## Sheet handoff

- **Open character sheet** remains available in the wizard; target is `src/sheet/index.html`.
- Require race + class (and valid basics) before opening the sheet.

## Race step — core races and subraces

The compendium lists some races as **separate entries** that are played on top of a **parent race** (shared ability scores, size, speed; variant benefits replace specific parent traits).

Alter Ego does **not** infer parent/child from the race parser. Subraces are wired in `metadata/race-subraces.json` and enforced in `src/editor/steps/race-step.js`.

### Convention (compendium HTML)

| Kind | HTML signal | Example |
|------|-------------|---------|
| **Core race** | `<b>RACIAL TRAITS</b>` block with ability scores, size, speed | Dragonborn, Elf, Dwarf |
| **Typical subrace** | No RACIAL TRAITS; `<h3>…Benefits</h3>` with lines like *"replaces Dragonborn Fury"* | Bozak Draconian, Wild Elf, Gold Dwarf |
| **Exception** | Full RACIAL TRAITS entry still treated as subrace in rules/metadata | Drow (Elf), Tinker Gnome (Gnome) |

### Current parent map

| Parent | Subraces |
|--------|----------|
| Dragonborn (`race1`) | Bozak Draconian, Kapak Draconian |
| Dwarf (`race2`) | Gold Dwarf, Shield Dwarf |
| Eladrin (`race3`) | Moon Elf (Eladrin), Sun Elf (Eladrin) |
| Elf (`race4`) | Drow, Wild Elf, Wood Elf, Llewyrr Elf |
| Gnome (`race20`) | Tinker Gnome |

After a compendium re-import, audit coverage:

```bash
node scripts/audit-race-subraces.mjs
```

The script fails if any **benefit-only** race entry is missing from `race-subraces.json`.

### UI behavior

1. Base picker lists only **core** races (`filterBaseRaces`).
2. Choosing a parent with subraces opens the **subrace** picker.
3. Preview merges parent + variant (`renderCombinedRacePreviewHtml`).
4. Ability/skill bonuses resolve from the **parent** entry (`raceBonusEntryId`).

## Implementation map

| UI area | File |
|---------|------|
| Gate + mode buttons | `src/editor/index.html`, `src/editor/editor.js` |
| Step definitions | `metadata/editor.json` |
| Compendium pickers | `src/editor/editor.js` (`renderCompendiumStep`) |
| Feats (level slots, eligibility filter) | `src/editor/steps/feat-step.js`, `src/editor/feat-prerequisite.js` |
| Powers (single picker, prerequisite filter, collection panel) | `src/editor/steps/power-step.js`, `src/editor/steps/power-collection-panel.js`, `src/editor/power-filter.js`, `src/editor/power-prerequisite.js`, `metadata/universal-actions.json`, `src/character/power-selections.js` |
