/**
 * Level-based feat slots and selections (feat-1, feat-4, …).
 */

/** Levels at which a character gains a feat (4e). */
export const FEAT_GAIN_LEVELS = [1, 2, 4, 6, 8, 10, 11, 12, 14, 16, 18, 20, 21, 22, 24, 26, 28, 30];

/** @type {const} */
export const FEAT_TIER_ORDER = ['Heroic', 'Paragon', 'Epic'];

/**
 * @param {number} slotLevel
 * @returns {'Heroic' | 'Paragon' | 'Epic'}
 */
export function tierForFeatLevel(slotLevel) {
  if (slotLevel >= 21) return 'Epic';
  if (slotLevel >= 11) return 'Paragon';
  return 'Heroic';
}

/**
 * @typedef {{ id: string, slotLevel: number, tier: string, label: string }} FeatSlot
 */

/**
 * @param {number} characterLevel
 * @returns {FeatSlot[]}
 */
export function getFeatSlotsForLevel(characterLevel) {
  const lvl = Math.min(30, Math.max(1, Math.floor(Number(characterLevel) || 1)));
  return FEAT_GAIN_LEVELS.filter((n) => n <= lvl).map((slotLevel) => {
    const tier = tierForFeatLevel(slotLevel);
    return {
      id: `feat-${slotLevel}`,
      slotLevel,
      tier,
      label: `Level ${slotLevel} feat (${tier})`
    };
  });
}

/**
 * @param {FeatSlot[]} slots
 * @returns {Record<(typeof FEAT_TIER_ORDER)[number], FeatSlot[]>}
 */
export function groupFeatSlotsByTier(slots) {
  /** @type {Record<(typeof FEAT_TIER_ORDER)[number], FeatSlot[]>} */
  const groups = {
    Heroic: [],
    Paragon: [],
    Epic: []
  };
  for (const slot of slots) {
    groups[slot.tier]?.push(slot);
  }
  return groups;
}

/**
 * @param {import('./model.js').Character} character
 */
export function ensureFeatSelectionsShape(character) {
  character.selections = character.selections ?? {};
  if (!Array.isArray(character.selections.featIds)) {
    character.selections.featIds = [];
  }
  if (!character.selections.featSelections || typeof character.selections.featSelections !== 'object') {
    character.selections.featSelections = {};
  }
  return character;
}

/**
 * Migrate legacy featIds[] into featSelections when map is empty.
 * @param {import('./model.js').Character} character
 */
export function migrateFeatIdsToSelections(character) {
  ensureFeatSelectionsShape(character);
  const sel = character.selections.featSelections;
  const hasAny = Object.values(sel).some(Boolean);
  const ids = character.selections.featIds ?? [];
  if (hasAny || !ids.length) return character;

  const slots = getFeatSlotsForLevel(character.identity?.level ?? 1);
  slots.forEach((slot, i) => {
    const id = ids[i];
    if (id) sel[slot.id] = id;
  });
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function syncFeatIdsFromSelections(character) {
  ensureFeatSelectionsShape(character);
  migrateFeatIdsToSelections(character);
  const slots = getFeatSlotsForLevel(character.identity?.level ?? 1);
  const map = character.selections.featSelections ?? {};
  character.selections.featIds = slots.map((s) => map[s.id]).filter(Boolean);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {Record<string, string>} [nameById]
 */
export function syncFeatNotesFromSelections(character, nameById = {}) {
  ensureFeatSelectionsShape(character);
  character.notes = character.notes ?? {};
  const slots = getFeatSlotsForLevel(character.identity?.level ?? 1);
  const map = character.selections.featSelections ?? {};
  const lines = slots
    .map((slot) => {
      const id = map[slot.id];
      if (!id) return null;
      const name = nameById[id] ?? id;
      return `${slot.label}: ${name}`;
    })
    .filter(Boolean);
  character.notes.feats = lines.join('\n');
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function pruneFeatSelections(character) {
  ensureFeatSelectionsShape(character);
  const valid = new Set(getFeatSlotsForLevel(character.identity?.level ?? 1).map((s) => s.id));
  const map = character.selections.featSelections ?? {};
  for (const key of Object.keys(map)) {
    if (!valid.has(key)) delete map[key];
  }
  syncFeatIdsFromSelections(character);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {string} slotId
 * @param {string | null} featId
 */
export function setFeatForSlot(character, slotId, featId) {
  ensureFeatSelectionsShape(character);
  const slots = getFeatSlotsForLevel(character.identity?.level ?? 1);
  if (!slots.some((s) => s.id === slotId)) return character;

  if (featId) {
    character.selections.featSelections[slotId] = featId;
  } else {
    delete character.selections.featSelections[slotId];
  }
  syncFeatIdsFromSelections(character);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function countFilledFeatSlots(character) {
  const slots = getFeatSlotsForLevel(character.identity?.level ?? 1);
  const map = character.selections.featSelections ?? {};
  return slots.filter((s) => map[s.id]).length;
}

/**
 * @param {import('./model.js').Character} character
 * @returns {string[]}
 */
export function validateFeatsStep(character) {
  const errors = [];
  ensureFeatSelectionsShape(character);
  migrateFeatIdsToSelections(character);
  const slots = getFeatSlotsForLevel(character.identity?.level ?? 1);
  if (!slots.length) return errors;

  const map = character.selections.featSelections ?? {};
  const filled = countFilledFeatSlots(character);

  for (const slot of slots) {
    if (!map[slot.id]) {
      errors.push(`Choose a feat for each slot (${filled} / ${slots.length} filled).`);
      break;
    }
  }

  const seen = new Set();
  for (const slot of slots) {
    const id = map[slot.id];
    if (id) {
      if (seen.has(id)) {
        errors.push('Each feat can only be chosen once.');
        break;
      }
      seen.add(id);
    }
  }

  return errors;
}
