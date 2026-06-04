/**
 * Character document — aligned with PROJECT.md party model + sheet page 1.
 */

import { validateFeatsStep } from './feat-selections.js';
import { validatePowersStep } from './power-selections.js';

export const CHARACTER_VERSION = 1;

export function createCharacter(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? crypto.randomUUID(),
    version: CHARACTER_VERSION,
    meta: {
      createdAt: partial.meta?.createdAt ?? now,
      updatedAt: now,
      campaignId: partial.meta?.campaignId ?? null,
      source: partial.meta?.source ?? 'editor'
    },
    identity: {
      playerName: '',
      characterName: '',
      level: 1,
      class: '',
      paragonPath: '',
      epicDestiny: '',
      race: '',
      size: 'Medium',
      age: '',
      gender: '',
      height: '',
      weight: '',
      alignment: '',
      deity: '',
      company: '',
      background: '',
      role: '',
      totalXp: 0,
      ...partial.identity
    },
    abilities: {
      method: 'point-buy-22',
      baseScores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 },
      scores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 },
      bonuses: [],
      anyChoice: {},
      ...partial.abilities
    },
    selections: {
      raceId: null,
      classId: null,
      backgroundId: null,
      themeId: null,
      paragonPathId: null,
      epicDestinyId: null,
      featIds: [],
      featSelections: {},
      powerIds: [],
      powerSelections: {},
      equipmentIds: [],
      ...partial.selections
    },
    skillBonuses: [],
    sheet: {
      skillBonusTotals: {},
      defenses: {
        ac: { abil: 0, class: 0, feat: 0, enh: 0, misc: 0, armor: 0 },
        fort: { abil: 0, class: 0, feat: 0, enh: 0, misc: 0 },
        ref: { abil: 0, class: 0, feat: 0, enh: 0, misc: 0 },
        will: { abil: 0, class: 0, feat: 0, enh: 0, misc: 0 }
      },
      hp: { max: 0, current: 0, temp: 0, surgesPerDay: 0, surgeUses: 0 },
      speed: { base: 6, armor: 0, item: 0, misc: 0 },
      skills: {},
      initMisc: 0,
      milestones: 0,
      armorPenaltyGlobal: 0
    },
    notes: {
      raceFeatures: '',
      classFeatures: '',
      backgroundFeatures: '',
      feats: '',
      powers: '',
      languages: '',
      apEffects: ''
    },
    ...partial
  };
}

export function touchCharacter(character) {
  return {
    ...character,
    meta: { ...character.meta, updatedAt: new Date().toISOString() }
  };
}

/**
 * Point-buy cost for one base score (Orokos /dnd4e/calc `attr_cost`).
 * 8–13: score − 10 (refunds below 10). 14–18: escalating steps, not +1 per point.
 */
export function pointBuyCostForScore(score) {
  const n = Math.floor(Number(score));
  if (n >= 18) return 16;
  if (n === 17) return 12;
  if (n === 16) return 9;
  if (n === 15) return 7;
  if (n === 14) return 5;
  return n - 10;
}

/** Orokos `attr_recalc`: six stats at 10 display as cost 2 before per-stat costs. */
export const POINT_BUY_OROKOS_BASELINE = 2;

/** Total point-buy cost; budget 22 matches Orokos “Point Buy Cost” cap. */
export function pointBuySpent(scores, budget = 22) {
  let spent = POINT_BUY_OROKOS_BASELINE;
  for (const v of Object.values(scores)) {
    spent += pointBuyCostForScore(Number(v) || 10);
  }
  return { spent, remaining: budget - spent };
}

export function countScoresBelowTen(scores) {
  return Object.values(scores).filter((v) => Number(v) < 10).length;
}

export function validateStep(stepId, character, editorMeta) {
  const errors = [];
  const lvl = character.identity.level;

  switch (stepId) {
    case 'basics':
      if (!character.identity.playerName?.trim()) errors.push('Player name is required.');
      if (!character.identity.characterName?.trim()) errors.push('Character name is required.');
      if (lvl < 1 || lvl > 30) errors.push('Level must be between 1 and 30.');
      break;
    case 'race':
      if (!character.selections.raceId) errors.push('Select a race from the compendium.');
      break;
    case 'class':
      if (!character.selections.classId) errors.push('Select a class from the compendium.');
      break;
    case 'abilities': {
      const base = character.abilities.baseScores ?? character.abilities.scores;
      const { spent, remaining } = pointBuySpent(base);
      if (character.abilities.method === 'point-buy-22' && remaining < 0) {
        errors.push(`Point-buy over budget by ${-remaining} (spent ${spent}/22).`);
      }
      if (countScoresBelowTen(base) > 1) {
        errors.push('Only one ability may be below 10 (Orokos dump stat).');
      }
      for (const [key, val] of Object.entries(base)) {
        if (val < 8 || val > 18) errors.push(`${key.toUpperCase()} must be 8–18 before racial bonuses.`);
      }
      break;
    }
    case 'paragon':
      if (lvl >= 11 && !character.selections.paragonPathId) {
        errors.push('Paragon path required at level 11+.');
      }
      break;
    case 'epic':
      if (lvl >= 21 && !character.selections.epicDestinyId) {
        errors.push('Epic destiny required at level 21+.');
      }
      break;
    case 'feats':
      errors.push(...validateFeatsStep(character));
      break;
    case 'powers':
      errors.push(...validatePowersStep(character));
      break;
    default:
      break;
  }

  const stepDef = editorMeta?.steps?.[stepId];
  if (stepDef?.optional) return errors;
  return errors;
}

export function isStepEnabled(stepId, level) {
  if (stepId === 'paragon' && level < 11) return false;
  if (stepId === 'epic' && level < 21) return false;
  return true;
}
