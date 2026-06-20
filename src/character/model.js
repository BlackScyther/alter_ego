/**
 * Character document — aligned with PROJECT.md party model + sheet page 1.
 */

import { validateEquipmentStep } from './equipment-selections.js';
import { validateFeatsStep } from './feat-selections.js';
import { validatePowersStep } from './power-selections.js';
import { validateRaceStep } from './race-selections.js';
import { validateBackgroundStep } from './background-selections.js';
import { validateClassStep } from './class-selections.js';
import { pendingAbilityIncreaseLevels } from './tutor.js';

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
      levelIncreases: {},
      ...partial.abilities
    },
    selections: {
      raceId: null,
      raceBuildChoices: {},
      raceBonusChoices: { ability: {}, skill: {} },
      racePowerIds: [],
      raceFeatIds: [],
      classId: null,
      classBuildChoices: {},
      classTrainedSkillChoices: [],
      classPowerIds: [],
      trainedSkillIds: [],
      backgroundId: null,
      backgroundBonusChoices: { mode: null, skills: [] },
      backgroundEffectChoices: { hpSubstituteAbility: null },
      backgroundSkillBonusKind: 'none',
      themeId: null,
      paragonPathId: null,
      epicDestinyId: null,
      featIds: [],
      featSelections: {},
      powerIds: [],
      powerSelections: {},
      grantedRitualIds: [],
      ritualSelections: {},
      ritualIds: [],
      equipmentIds: [],
      equipmentItems: [],
      ...partial.selections
    },
    builderFlags: {
      retraining: false,
      ...(partial.builderFlags ?? {})
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
      derivedBonuses: {
        initiative: 0,
        hpSubstituteAbility: null,
        hpSubstituteScore: null
      },
      milestones: 0,
      armorPenaltyGlobal: 0,
      treasure: { goldGp: 0 }
    },
    notes: {
      raceFeatures: '',
      racialPowers: '',
      classFeatures: '',
      backgroundFeatures: '',
      feats: '',
      powers: '',
      rituals: '',
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

/** Ability keys used by the point-buy allocator. */
export const POINT_BUY_ABILITIES = ['str', 'con', 'dex', 'int', 'wis', 'cha'];

/**
 * Auto-distribute base ability scores within the point-buy budget, favoring the
 * given priority abilities first. Respects the one-dump-stat rule and the 8-18
 * range. Shared by quick-build and the Attributes step "Recommended" button.
 * @param {string[]} [priority] Ability keys to maximize first (e.g. ['str','con']).
 * @param {number} [budget]
 * @returns {Record<string, number>}
 */
export function autoPointBuy(priority = ['str', 'con'], budget = 22) {
  const scores = Object.fromEntries(POINT_BUY_ABILITIES.map((k) => [k, 10]));
  const wanted = priority.filter((k) => POINT_BUY_ABILITIES.includes(k));
  const order = [...wanted, ...POINT_BUY_ABILITIES.filter((k) => !wanted.includes(k))];
  let guard = 200;
  while (guard-- > 0) {
    const { remaining } = pointBuySpent(scores, budget);
    if (remaining <= 0) break;
    let bumped = false;
    for (const key of order) {
      if (scores[key] >= 18) continue;
      const next = { ...scores, [key]: scores[key] + 1 };
      if (countScoresBelowTen(next) > 1) continue;
      const trial = pointBuySpent(next, budget);
      if (trial.remaining >= 0) {
        scores[key] = next[key];
        bumped = true;
        break;
      }
    }
    if (!bumped) break;
  }
  return scores;
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
      errors.push(...validateRaceStep(character, null, null));
      break;
    case 'class':
      errors.push(...validateClassStep(character, null));
      break;
    case 'background':
      errors.push(...validateBackgroundStep(character, null));
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
      for (const pending of pendingAbilityIncreaseLevels(character)) {
        errors.push(`Choose two different abilities for the level ${pending} ability score increase.`);
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
    case 'equipment':
      errors.push(...validateEquipmentStep(character));
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
