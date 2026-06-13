import { xpForLevel } from '../formulas.js';

const MAX_LEVEL = 30;

function formatXp(value) {
  return Number(value).toLocaleString('en-US');
}

/** XP threshold on the character sheet required to advance from `level` to `level + 1`. */
export function xpRequiredForNextLevel(level) {
  const n = Math.floor(Number(level) || 1);
  if (n >= MAX_LEVEL) return null;
  return xpForLevel(n + 1);
}

/** Whether the character has enough sheet XP to level up (and is below level 30). */
export function canLevelUp(character) {
  const level = character?.identity?.level ?? 1;
  if (level >= MAX_LEVEL) return false;
  const required = xpRequiredForNextLevel(level);
  const totalXp = Math.floor(Number(character?.identity?.totalXp) || 0);
  return totalXp >= required;
}

/**
 * Tooltip text for the Level up control. Empty string when leveling is allowed.
 * @param {import('../character/model.js').CharacterDocument} character
 */
export function levelUpTooltip(character) {
  const level = character?.identity?.level ?? 1;
  if (level >= MAX_LEVEL) {
    return 'Already at maximum level (30).';
  }
  const required = xpRequiredForNextLevel(level);
  const totalXp = Math.floor(Number(character?.identity?.totalXp) || 0);
  if (totalXp >= required) return '';
  return `Need ${formatXp(required)} XP on the character sheet to reach level ${level + 1} (currently ${formatXp(totalXp)}).`;
}

/**
 * Builder entry point for retraining / level-up editing (full `builderFlow`, powers onward).
 * @param {string[]} builderFlow
 */
export function retrainingBuilderStart(builderFlow) {
  const steps = Array.isArray(builderFlow) ? builderFlow : [];
  let idx = steps.indexOf('powers');
  if (idx < 0) idx = steps.indexOf('feats');
  if (idx < 0) idx = steps.indexOf('review');
  if (idx < 0) idx = 0;
  return {
    completedSteps: ['basics', 'race', 'background', 'class', 'abilities'],
    startStepIndex: idx
  };
}
