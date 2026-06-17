import { initiative, defenseTotal } from '../formulas.js';

/**
 * Whether static initiative is stored as a full printed bonus (compendium spawn)
 * rather than Dex + half level + misc.
 * @param {object} character
 */
export function usesPrintedInitiativeBonus(character) {
  const meta = character?.meta ?? {};
  if (meta.templateCompendiumId) return true;
  const kind = meta.actorKind;
  return kind === 'monster' || (kind === 'npc' && meta.source === 'compendium-spawn');
}

/**
 * Static initiative — the value on the character board before the d20 roll.
 * @param {object} character
 */
export function staticInitiative(character) {
  const sheet = character?.sheet ?? {};
  const initMisc = Number(sheet.initMisc) || 0;

  if (usesPrintedInitiativeBonus(character)) {
    return initMisc;
  }

  const dex = character.abilities?.scores?.dex ?? 10;
  const level = character.identity?.level ?? 1;
  const derived = Number(sheet.derivedBonuses?.initiative) || 0;
  return initiative(dex, level, initMisc + derived);
}

/**
 * @param {object} character
 * @returns {number | null}
 */
export function initiativeRoll(character) {
  const roll = character?.sheet?.combat?.initiativeRoll;
  if (roll == null || roll === '') return null;
  return Number(roll);
}

/**
 * Total initiative = d20 roll + static initiative.
 * @param {object} character
 * @returns {number | null}
 */
export function totalInitiative(character) {
  const stored = character?.sheet?.combat?.initiative;
  if (stored != null && stored !== '') return Number(stored);

  const roll = initiativeRoll(character);
  if (roll == null) return null;
  return roll + staticInitiative(character);
}

/**
 * @param {object} character
 * @param {number} level
 */
export function defenseTotals(character, level = character?.identity?.level ?? 1) {
  const defenses = character?.sheet?.defenses ?? {};
  const keys = ['ac', 'fort', 'ref', 'will'];
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of keys) {
    out[key] = defenseTotal(level, defenses[key] ?? {});
  }
  return out;
}

/**
 * @param {string} character
 */
function actorName(character) {
  return String(character?.identity?.characterName || '').trim().toLowerCase();
}

/**
 * Sort combatants: total initiative DESC, static DESC, name ASC.
 * @param {Array<{ character: object, actorId?: string }>} actors
 */
export function sortCombatants(actors) {
  return [...actors].sort((a, b) => {
    const totalA = totalInitiative(a.character);
    const totalB = totalInitiative(b.character);
    const safeA = totalA == null ? -Infinity : totalA;
    const safeB = totalB == null ? -Infinity : totalB;
    if (safeB !== safeA) return safeB - safeA;

    const staticA = staticInitiative(a.character);
    const staticB = staticInitiative(b.character);
    if (staticB !== staticA) return staticB - staticA;

    return actorName(a.character).localeCompare(actorName(b.character));
  });
}

/**
 * Compute and set combat.initiative from roll + static.
 * @param {object} character
 * @param {number | null} roll
 */
export function applyInitiativeRoll(character, roll) {
  character.sheet = character.sheet ?? {};
  character.sheet.combat = character.sheet.combat ?? {};
  if (roll == null || roll === '') {
    character.sheet.combat.initiativeRoll = null;
    character.sheet.combat.initiative = null;
    return character;
  }
  const numericRoll = Number(roll);
  character.sheet.combat.initiativeRoll = numericRoll;
  character.sheet.combat.initiative = numericRoll + staticInitiative(character);
  return character;
}
