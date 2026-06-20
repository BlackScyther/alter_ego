/**
 * Level-1 HP helpers — class starting HP plus ability score (or CON substitute).
 */

import presets from '../../metadata/quick-build-presets.json' with { type: 'json' };
import { parseClassEntry } from './class-parse.js';

/** @type {Record<string, number>} */
const classHpAt1ById = {};
/** @type {Record<string, number>} */
const classHpPerLevelById = {};
for (const cls of Object.values(presets.classes ?? {})) {
  if (cls.classId && cls.sheet?.maxHpAt1 != null) {
    classHpAt1ById[cls.classId] = Number(cls.sheet.maxHpAt1);
  }
  if (cls.classId && cls.sheet?.hpPerLevel != null) {
    classHpPerLevelById[cls.classId] = Number(cls.sheet.hpPerLevel);
  }
}

/**
 * Merged hybrid class stats persisted on the character, when hybrid mode is
 * active and both classes resolved (see applyHybridClassStats). Returns null
 * for non-hybrid characters so the normal preset/parse path is used.
 * @param {object} character
 */
function hybridStatsFor(character) {
  const sel = character?.selections;
  if (!sel?.classHybrid) return null;
  const merged = sel.hybridMerged;
  return merged && merged.hpAt1Base != null ? merged : null;
}

/**
 * @param {object} character
 */
export function ensureDerivedBonuses(character) {
  character.sheet = character.sheet ?? {};
  if (!character.sheet.derivedBonuses) {
    character.sheet.derivedBonuses = {
      initiative: 0,
      initiativeBackground: 0,
      initiativeClass: 0,
      hpSubstituteAbility: null,
      hpSubstituteScore: null
    };
  } else {
    const d = character.sheet.derivedBonuses;
    if (d.initiativeBackground == null) d.initiativeBackground = 0;
    if (d.initiativeClass == null) d.initiativeClass = 0;
  }
  return character;
}

/**
 * @param {string | null | undefined} classId
 * @param {object | null | undefined} [classEntry]
 */
export function getClassMaxHpAt1(classId, classEntry = null) {
  if (classEntry) {
    const parsed = parseClassEntry(classEntry);
    if (parsed.hpAt1Base != null) return parsed.hpAt1Base;
  }
  if (!classId) return null;
  const value = classHpAt1ById[classId];
  return value == null ? null : value;
}

/**
 * @param {string | null | undefined} classId
 * @param {object | null | undefined} [classEntry]
 */
export function getClassHpPerLevel(classId, classEntry = null) {
  if (classEntry) {
    const parsed = parseClassEntry(classEntry);
    if (parsed.hpPerLevel != null) return parsed.hpPerLevel;
  }
  if (!classId) return null;
  const value = classHpPerLevelById[classId];
  return value == null ? null : value;
}

/**
 * Level-1 max HP = class starting HP + Constitution score (or background substitute).
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function computeLevel1MaxHp(character, classEntry = null) {
  const classId = classEntry?.id ?? character.selections?.classId;
  const hybrid = hybridStatsFor(character);
  const classHp = hybrid ? hybrid.hpAt1Base : getClassMaxHpAt1(classId, classEntry);
  if (classHp == null) return null;

  const scores = character.abilities?.scores ?? {};
  const substitute = character.sheet?.derivedBonuses?.hpSubstituteAbility;
  const abilityKey = substitute || 'con';
  const abilityScore = Number(scores[abilityKey]) || 10;

  return classHp + abilityScore;
}

/**
 * Max HP at the character's current level:
 * class starting HP + Constitution (or substitute) + (level - 1) * HP per level.
 *
 * Class HP parameters resolve from the class entry or preset map, falling back to
 * values persisted on `character.sheet.hp` (so the value stays correct when rendered
 * without a freshly parsed class entry, e.g. compendium classes after reload).
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @returns {number | null}
 */
export function computeMaxHp(character, classEntry = null) {
  const classId = classEntry?.id ?? character.selections?.classId;
  const sheetHp = character.sheet?.hp ?? {};
  const hybrid = hybridStatsFor(character);

  let classHp = hybrid ? hybrid.hpAt1Base : getClassMaxHpAt1(classId, classEntry);
  if (classHp == null && Number.isFinite(Number(sheetHp.classBase))) {
    classHp = Number(sheetHp.classBase);
  }
  if (classHp == null) return null;

  let perLevel = hybrid ? hybrid.hpPerLevel : getClassHpPerLevel(classId, classEntry);
  if (perLevel == null && Number.isFinite(Number(sheetHp.perLevel))) {
    perLevel = Number(sheetHp.perLevel);
  }

  const scores = character.abilities?.scores ?? {};
  const substitute = character.sheet?.derivedBonuses?.hpSubstituteAbility;
  const abilityKey = substitute || 'con';
  const abilityScore = Number(scores[abilityKey]) || 10;

  const level = Math.max(1, Number(character.identity?.level) || 1);
  return classHp + abilityScore + (level - 1) * (perLevel ?? 0);
}

/**
 * @param {object} character
 */
export function getHpSubstituteTutorHint(character) {
  const derived = character.sheet?.derivedBonuses;
  if (!derived?.hpSubstituteAbility) return '';
  const score = derived.hpSubstituteScore;
  if (score == null) return '';
  const classId = character.selections?.classId;
  const classHp = getClassMaxHpAt1(classId);
  if (classHp == null) {
    return `Starting HP will use ${derived.hpSubstituteAbility.toUpperCase()} (${score}) instead of Constitution once class is selected.`;
  }
  return `Starting HP at level 1: ${classHp} (class) + ${score} (${derived.hpSubstituteAbility.toUpperCase()}) = ${classHp + score}.`;
}
