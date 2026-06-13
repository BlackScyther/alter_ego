/**
 * Background step selections: associated skill bonus choices and validation.
 */

import { parseBackgroundEntry } from './background-parse.js';
import { validateBackgroundEffects } from './background-effects.js';
import { resetBackgroundEffectChoices, ensureBackgroundEffectChoicesShape } from './background-effect-selections.js';

/**
 * @param {object} character
 */
export function ensureBackgroundSelectionsShape(character) {
  character.selections = character.selections ?? {};
  if (!character.selections.backgroundBonusChoices) {
    character.selections.backgroundBonusChoices = { mode: null, skills: [] };
  }
  if (!Array.isArray(character.selections.backgroundBonusChoices.skills)) {
    character.selections.backgroundBonusChoices.skills = [];
  }
  return character;
}

/**
 * @param {object} character
 */
export function resetBackgroundBonusChoices(character) {
  ensureBackgroundSelectionsShape(character);
  character.selections.backgroundBonusChoices = { mode: null, skills: [] };
  character.selections.backgroundSkillBonusKind = 'none';
  resetBackgroundEffectChoices(character);
  return character;
}

/**
 * @param {ReturnType<typeof parseBackgroundEntry>} parsed
 * @param {{ mode?: string | null, skills?: string[] }} choices
 */
export function isBackgroundSkillChoiceComplete(parsed, choices) {
  if (!parsed || parsed.skillBonusKind !== 'choice') return true;
  const mode = choices?.mode;
  const skills = choices?.skills ?? [];
  if (!mode) return false;
  if (mode === 'plus2-one') return skills.length === 1;
  if (mode === 'plus1-two') return skills.length === 2;
  return false;
}

/**
 * @param {object} character
 * @param {'plus2-one' | 'plus1-two'} mode
 * @param {ReturnType<typeof parseBackgroundEntry>} [parsed]
 */
export function setBackgroundSkillMode(character, mode, parsed = null) {
  ensureBackgroundSelectionsShape(character);
  const choices = character.selections.backgroundBonusChoices;
  choices.mode = mode;

  const allowed = new Set(parsed?.associatedSkills ?? choices.skills ?? []);
  if (mode === 'plus2-one') {
    choices.skills = (choices.skills ?? []).filter((s) => allowed.has(s)).slice(0, 1);
  } else if (mode === 'plus1-two') {
    choices.skills = (choices.skills ?? []).filter((s) => allowed.has(s)).slice(0, 2);
  }
  return character;
}

/**
 * @param {object} character
 * @param {string} skillId
 * @param {ReturnType<typeof parseBackgroundEntry>} parsed
 */
export function toggleBackgroundSkillChoice(character, skillId, parsed) {
  ensureBackgroundSelectionsShape(character);
  const choices = character.selections.backgroundBonusChoices;
  if (!choices.mode) choices.mode = 'plus2-one';

  const allowed = parsed?.associatedSkills ?? [];
  if (!allowed.includes(skillId)) return character;

  const current = [...(choices.skills ?? [])];
  const idx = current.indexOf(skillId);

  if (choices.mode === 'plus2-one') {
    choices.skills = idx >= 0 ? [] : [skillId];
    return character;
  }

  if (choices.mode === 'plus1-two') {
    if (idx >= 0) {
      current.splice(idx, 1);
      choices.skills = current;
      return character;
    }
    if (current.length >= 2) {
      choices.skills = [current[1], skillId];
    } else {
      choices.skills = [...current, skillId];
    }
  }

  return character;
}

/**
 * @param {object} character
 * @param {object | null | undefined} entry
 */
export function validateBackgroundStep(character, entry) {
  const errors = [];
  if (!character.selections?.backgroundId) return errors;

  const parsed =
    entry != null
      ? parseBackgroundEntry(entry)
      : { skillBonusKind: character.selections?.backgroundSkillBonusKind ?? 'none', effects: [] };
  const choices = character.selections?.backgroundBonusChoices ?? { mode: null, skills: [] };

  if (!isBackgroundSkillChoiceComplete(parsed, choices)) {
    errors.push('Complete the associated skill bonus choice for your background.');
  }

  ensureBackgroundEffectChoicesShape(character);
  const effectChoices = character.selections.backgroundEffectChoices ?? {};
  errors.push(...validateBackgroundEffects(parsed.effects ?? [], effectChoices));

  return errors;
}
