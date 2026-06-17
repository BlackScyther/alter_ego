import { defenseTotals } from './combat-helpers.js';

const ABILITY_KEYS = ['str', 'con', 'dex', 'int', 'wis', 'cha'];
const DEFENSE_KEYS = ['ac', 'fort', 'ref', 'will'];

/**
 * @param {object} character
 */
export function ensureExtraFields(character) {
  character.sheet = character.sheet ?? {};
  character.sheet.extraFields = character.sheet.extraFields ?? {};
  return character.sheet.extraFields;
}

/**
 * Read display stats for an encounter actor card.
 * @param {object} character
 */
export function readActorStats(character) {
  const level = character.identity?.level ?? 1;
  const sheet = character.sheet ?? {};
  const hp = sheet.hp ?? {};
  const totals = defenseTotals(character, level);
  const extra = sheet.extraFields ?? {};

  return {
    level,
    hpCurrent: hp.current ?? hp.max ?? 0,
    hpMax: hp.max ?? 0,
    defenses: totals,
    initMisc: Number(sheet.initMisc) || 0,
    saveMods: String(extra['save-mods'] ?? ''),
    attacksNotes: String(extra['attacks-notes'] ?? character.notes?.raceFeatures ?? ''),
    abilities: Object.fromEntries(
      ABILITY_KEYS.map((k) => [k, character.abilities?.scores?.[k] ?? 10])
    )
  };
}

/**
 * Apply inline stat edits onto a character document (mutates in place).
 * @param {object} character
 * @param {object} patch
 */
export function applyActorStatsPatch(character, patch) {
  character.sheet = character.sheet ?? {};
  character.abilities = character.abilities ?? { scores: {} };
  character.abilities.scores = character.abilities.scores ?? {};

  if (patch.hpCurrent != null || patch.hpMax != null) {
    character.sheet.hp = character.sheet.hp ?? {};
    if (patch.hpMax != null) character.sheet.hp.max = Math.max(1, Number(patch.hpMax) || 1);
    if (patch.hpCurrent != null) {
      character.sheet.hp.current = Math.max(0, Number(patch.hpCurrent) || 0);
    }
  }

  if (patch.defenses) {
    character.sheet.defenses = character.sheet.defenses ?? {};
    for (const key of DEFENSE_KEYS) {
      if (patch.defenses[key] == null) continue;
      const level = character.identity?.level ?? 1;
      const current = defenseTotals(character, level)[key];
      const target = Number(patch.defenses[key]);
      if (Number.isNaN(target)) continue;
      character.sheet.defenses[key] = character.sheet.defenses[key] ?? {
        abil: 0,
        class: 0,
        feat: 0,
        enh: 0,
        misc: 0,
        armor: 0
      };
      const delta = target - current;
      character.sheet.defenses[key].class =
        (Number(character.sheet.defenses[key].class) || 0) + delta;
    }
  }

  if (patch.initMisc != null) {
    character.sheet.initMisc = Number(patch.initMisc) || 0;
  }

  if (patch.abilities) {
    for (const key of ABILITY_KEYS) {
      if (patch.abilities[key] == null) continue;
      character.abilities.scores[key] = Math.max(1, Math.min(30, Number(patch.abilities[key]) || 10));
    }
  }

  if (patch.saveMods != null) {
    ensureExtraFields(character)['save-mods'] = String(patch.saveMods);
  }

  if (patch.attacksNotes != null) {
    ensureExtraFields(character)['attacks-notes'] = String(patch.attacksNotes);
    character.notes = character.notes ?? {};
    character.notes.raceFeatures = String(patch.attacksNotes);
  }

  return character;
}
