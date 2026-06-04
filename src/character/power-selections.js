/**
 * PHB-style power gain slots by type and character level when gained.
 * v1: universal chart; per-class Essentials / paragon power slots deferred.
 */

/** @typedef {'At-Will' | 'Encounter' | 'Daily' | 'Utility'} PowerType */

/** @typedef {{ id: string, slotLevel: number, powerType: PowerType, label: string }} PowerSlot */

/** UI section order */
export const POWER_TYPE_ORDER = ['At-Will', 'Encounter', 'Daily', 'Utility'];

/**
 * Static slots: character level when the power is gained (power card Level matches slotLevel).
 * @type {PowerSlot[]}
 */
export const POWER_GAIN_SLOTS = [
  { id: 'power-atwill-1-a', slotLevel: 1, powerType: 'At-Will', label: 'Level 1 at-will (1 of 2)' },
  { id: 'power-atwill-1-b', slotLevel: 1, powerType: 'At-Will', label: 'Level 1 at-will (2 of 2)' },
  { id: 'power-atwill-5', slotLevel: 5, powerType: 'At-Will', label: 'Level 5 at-will' },
  { id: 'power-atwill-9', slotLevel: 9, powerType: 'At-Will', label: 'Level 9 at-will' },
  { id: 'power-atwill-13', slotLevel: 13, powerType: 'At-Will', label: 'Level 13 at-will' },
  { id: 'power-atwill-17', slotLevel: 17, powerType: 'At-Will', label: 'Level 17 at-will' },
  { id: 'power-atwill-21', slotLevel: 21, powerType: 'At-Will', label: 'Level 21 at-will' },
  { id: 'power-atwill-25', slotLevel: 25, powerType: 'At-Will', label: 'Level 25 at-will' },
  { id: 'power-atwill-29', slotLevel: 29, powerType: 'At-Will', label: 'Level 29 at-will' },

  { id: 'power-encounter-1', slotLevel: 1, powerType: 'Encounter', label: 'Level 1 encounter' },
  { id: 'power-encounter-3', slotLevel: 3, powerType: 'Encounter', label: 'Level 3 encounter' },
  { id: 'power-encounter-7', slotLevel: 7, powerType: 'Encounter', label: 'Level 7 encounter' },
  { id: 'power-encounter-11', slotLevel: 11, powerType: 'Encounter', label: 'Level 11 encounter' },
  { id: 'power-encounter-15', slotLevel: 15, powerType: 'Encounter', label: 'Level 15 encounter' },
  { id: 'power-encounter-19', slotLevel: 19, powerType: 'Encounter', label: 'Level 19 encounter' },
  { id: 'power-encounter-23', slotLevel: 23, powerType: 'Encounter', label: 'Level 23 encounter' },
  { id: 'power-encounter-27', slotLevel: 27, powerType: 'Encounter', label: 'Level 27 encounter' },

  { id: 'power-daily-1', slotLevel: 1, powerType: 'Daily', label: 'Level 1 daily' },
  { id: 'power-daily-5', slotLevel: 5, powerType: 'Daily', label: 'Level 5 daily' },
  { id: 'power-daily-9', slotLevel: 9, powerType: 'Daily', label: 'Level 9 daily' },
  { id: 'power-daily-13', slotLevel: 13, powerType: 'Daily', label: 'Level 13 daily' },
  { id: 'power-daily-17', slotLevel: 17, powerType: 'Daily', label: 'Level 17 daily' },
  { id: 'power-daily-21', slotLevel: 21, powerType: 'Daily', label: 'Level 21 daily' },
  { id: 'power-daily-25', slotLevel: 25, powerType: 'Daily', label: 'Level 25 daily' },
  { id: 'power-daily-29', slotLevel: 29, powerType: 'Daily', label: 'Level 29 daily' },

  { id: 'power-utility-2', slotLevel: 2, powerType: 'Utility', label: 'Level 2 utility' },
  { id: 'power-utility-6', slotLevel: 6, powerType: 'Utility', label: 'Level 6 utility' },
  { id: 'power-utility-10', slotLevel: 10, powerType: 'Utility', label: 'Level 10 utility' },
  { id: 'power-utility-14', slotLevel: 14, powerType: 'Utility', label: 'Level 14 utility' },
  { id: 'power-utility-18', slotLevel: 18, powerType: 'Utility', label: 'Level 18 utility' },
  { id: 'power-utility-22', slotLevel: 22, powerType: 'Utility', label: 'Level 22 utility' },
  { id: 'power-utility-26', slotLevel: 26, powerType: 'Utility', label: 'Level 26 utility' },
  { id: 'power-utility-30', slotLevel: 30, powerType: 'Utility', label: 'Level 30 utility' }
];

/**
 * @param {number} characterLevel
 * @returns {PowerSlot[]}
 */
export function getPowerSlotsForLevel(characterLevel) {
  const lvl = Math.min(30, Math.max(1, Math.floor(Number(characterLevel) || 1)));
  return POWER_GAIN_SLOTS.filter((s) => s.slotLevel <= lvl);
}

/**
 * @param {PowerSlot[]} slots
 * @returns {Record<PowerType, PowerSlot[]>}
 */
export function groupPowerSlotsByType(slots) {
  /** @type {Record<PowerType, PowerSlot[]>} */
  const groups = {
    'At-Will': [],
    Encounter: [],
    Daily: [],
    Utility: []
  };
  for (const slot of slots) {
    groups[slot.powerType]?.push(slot);
  }
  return groups;
}

/**
 * @param {import('./model.js').Character} character
 */
export function ensurePowerSelectionsShape(character) {
  character.selections = character.selections ?? {};
  if (!Array.isArray(character.selections.powerIds)) {
    character.selections.powerIds = [];
  }
  if (!character.selections.powerSelections || typeof character.selections.powerSelections !== 'object') {
    character.selections.powerSelections = {};
  }
  character.notes = character.notes ?? {};
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function migratePowerIdsToSelections(character) {
  ensurePowerSelectionsShape(character);
  const sel = character.selections.powerSelections;
  const hasAny = Object.values(sel).some(Boolean);
  const ids = character.selections.powerIds ?? [];
  if (hasAny || !ids.length) return character;

  const slots = getPowerSlotsForLevel(character.identity?.level ?? 1);
  slots.forEach((slot, i) => {
    const id = ids[i];
    if (id) sel[slot.id] = id;
  });
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function syncPowerIdsFromSelections(character) {
  ensurePowerSelectionsShape(character);
  migratePowerIdsToSelections(character);
  const slots = getPowerSlotsForLevel(character.identity?.level ?? 1);
  const map = character.selections.powerSelections ?? {};
  character.selections.powerIds = slots.map((s) => map[s.id]).filter(Boolean);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {Record<string, string>} [nameById]
 */
export function syncPowerNotesFromSelections(character, nameById = {}) {
  ensurePowerSelectionsShape(character);
  character.notes = character.notes ?? {};
  const slots = getPowerSlotsForLevel(character.identity?.level ?? 1);
  const map = character.selections.powerSelections ?? {};
  const lines = slots
    .map((slot) => {
      const id = map[slot.id];
      if (!id) return null;
      const name = nameById[id] ?? id;
      return `${slot.label}: ${name}`;
    })
    .filter(Boolean);
  character.notes.powers = lines.join('\n');
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function prunePowerSelections(character) {
  ensurePowerSelectionsShape(character);
  const valid = new Set(getPowerSlotsForLevel(character.identity?.level ?? 1).map((s) => s.id));
  const map = character.selections.powerSelections ?? {};
  for (const key of Object.keys(map)) {
    if (!valid.has(key)) delete map[key];
  }
  syncPowerIdsFromSelections(character);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {string} slotId
 * @param {string | null} powerId
 */
export function setPowerForSlot(character, slotId, powerId) {
  ensurePowerSelectionsShape(character);
  const slots = getPowerSlotsForLevel(character.identity?.level ?? 1);
  if (!slots.some((s) => s.id === slotId)) return character;

  if (powerId) {
    character.selections.powerSelections[slotId] = powerId;
  } else {
    delete character.selections.powerSelections[slotId];
  }
  syncPowerIdsFromSelections(character);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function countFilledPowerSlots(character) {
  const slots = getPowerSlotsForLevel(character.identity?.level ?? 1);
  const map = character.selections.powerSelections ?? {};
  return slots.filter((s) => map[s.id]).length;
}

/**
 * @param {import('./model.js').Character} character
 * @returns {string[]}
 */
export function validatePowersStep(character) {
  const errors = [];
  ensurePowerSelectionsShape(character);
  migratePowerIdsToSelections(character);

  if (!character.selections?.classId) {
    errors.push('Select a class before choosing powers.');
    return errors;
  }

  const slots = getPowerSlotsForLevel(character.identity?.level ?? 1);
  if (!slots.length) return errors;

  const map = character.selections.powerSelections ?? {};
  const filled = countFilledPowerSlots(character);

  for (const slot of slots) {
    if (!map[slot.id]) {
      errors.push(`Choose a power for each slot (${filled} / ${slots.length} filled).`);
      break;
    }
  }

  const seen = new Set();
  for (const slot of slots) {
    const id = map[slot.id];
    if (id) {
      if (seen.has(id)) {
        errors.push('Each power can only be chosen once.');
        break;
      }
      seen.add(id);
    }
  }

  return errors;
}
