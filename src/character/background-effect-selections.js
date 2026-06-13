/**
 * Background effect choices (HP substitute ability, etc.).
 */

import { HP_SUBSTITUTE_ABILITIES } from './background-effects.js';

/**
 * @param {object} character
 */
export function ensureBackgroundEffectChoicesShape(character) {
  character.selections = character.selections ?? {};
  if (!character.selections.backgroundEffectChoices) {
    character.selections.backgroundEffectChoices = { hpSubstituteAbility: null };
  }
  return character;
}

/**
 * @param {object} character
 */
export function resetBackgroundEffectChoices(character) {
  ensureBackgroundEffectChoicesShape(character);
  character.selections.backgroundEffectChoices = { hpSubstituteAbility: null };
  return character;
}

/**
 * @param {object} character
 * @param {string} abilityKey
 */
export function setBackgroundHpSubstituteAbility(character, abilityKey) {
  ensureBackgroundEffectChoicesShape(character);
  const key = String(abilityKey ?? '').toLowerCase();
  if (!HP_SUBSTITUTE_ABILITIES.includes(key)) return character;
  character.selections.backgroundEffectChoices.hpSubstituteAbility = key;
  return character;
}
