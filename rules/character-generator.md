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

Once a character is active, show **two** large actions (no other primary actions):

| Action | Behavior |
|--------|----------|
| **Level up** | Increase level by 1 (cap 30), persist, then open the **full** builder flow from the first step that applies at the new level (feats, paragon, etc.). |
| **Generate new character** | Create a blank document (new id), then start the **creation** flow below. |

## Phase 3 — New character (creation flow)

Order is fixed — do not reorder without updating `metadata/editor.json` → `creationFlow`:

1. **Race**
2. **Background**
3. **Class**
4. **Attributes** (ability scores / point-buy tutor)
5. **Equipment**

Optional steps (theme, feats, powers, paragon, epic, review) remain in `builderFlow` for level-up and advanced editing.

## Phase 4 — Level up (builder flow)

Use `builderFlow` from metadata. Skip steps disabled for the current level (`isStepEnabled`). Basics (name, level) remain editable in the **Basics** step when leveling.

## Sheet handoff

- **Open character sheet** remains available in the wizard; target is `src/sheet/index.html`.
- Require race + class (and valid basics) before opening the sheet.

## Implementation map

| UI area | File |
|---------|------|
| Gate + mode buttons | `src/editor/index.html`, `src/editor/editor.js` |
| Step definitions | `metadata/editor.json` |
| Compendium pickers | `src/editor/editor.js` (`renderCompendiumStep`) |
| Feats (level slots, eligibility filter) | `src/editor/steps/feat-step.js`, `src/editor/feat-prerequisite.js` |
| Powers (single picker, prerequisite filter, collection panel) | `src/editor/steps/power-step.js`, `src/editor/steps/power-collection-panel.js`, `src/editor/power-filter.js`, `src/editor/power-prerequisite.js`, `metadata/universal-actions.json`, `src/character/power-selections.js` |
