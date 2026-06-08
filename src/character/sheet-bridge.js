/**
 * Maps Character document → sheet DOM field IDs (page 1).
 */

import { getFinalScores, getSkillBonusTotals } from './tutor.js';

const ABIL_MAP = ['str', 'con', 'dex', 'int', 'wis', 'cha'];

export function characterToSheetPayload(character) {
  const id = character.identity;
  const scores = getFinalScores(character);
  const sheet = character.sheet;

  return {
    'player-name': id.playerName,
    'character-name': id.characterName,
    level: id.level,
    class: id.class,
    'paragon-path': id.paragonPath,
    'epic-destiny': id.epicDestiny,
    race: id.race,
    size: id.size,
    age: id.age,
    gender: id.gender,
    height: id.height,
    weight: id.weight,
    alignment: id.alignment,
    deity: id.deity,
    company: id.company,
    'total-xp': id.totalXp,
    ...Object.fromEntries(ABIL_MAP.map((a) => [`${a}-score`, scores[a] ?? 10])),
    'max-hp': sheet.hp.max,
    'current-hp': sheet.hp.current,
    'temp-hp': sheet.hp.temp,
    'surges-day': sheet.hp.surgesPerDay,
    'surge-uses': sheet.hp.surgeUses,
    'init-misc': sheet.initMisc,
    milestones: sheet.milestones,
    'armor-penalty-global': sheet.armorPenaltyGlobal,
    'race-features': character.notes.raceFeatures,
    'racial-powers': character.notes.racialPowers ?? '',
    'class-features': character.notes.classFeatures,
    feats: character.notes.feats,
    languages: character.notes.languages,
    'ap-effects': character.notes.apEffects,
    ...flattenDefenses(sheet.defenses),
    ...flattenSpeed(sheet.speed),
    ...flattenSkillBonuses(getSkillBonusTotals(character))
  };
}

function flattenSkillBonuses(totals) {
  const out = {};
  for (const [skillId, value] of Object.entries(totals ?? {})) {
    if (value) out[`skill-${skillId}-misc`] = value;
  }
  return out;
}

function flattenDefenses(defenses) {
  const out = {};
  for (const [def, parts] of Object.entries(defenses)) {
    for (const [key, val] of Object.entries(parts)) {
      out[`${def}-${key}`] = val;
    }
  }
  return out;
}

function flattenSpeed(speed) {
  return {
    'speed-base': speed.base,
    'speed-armor': speed.armor,
    'speed-item': speed.item,
    'speed-misc': speed.misc
  };
}

export function applyCharacterToSheetDom(character, root = document) {
  const payload = characterToSheetPayload(character);
  for (const [fieldId, value] of Object.entries(payload)) {
    const el = root.getElementById(fieldId);
    if (!el || value === undefined || value === null) continue;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }
  root.dispatchEvent(new CustomEvent('character-applied', { detail: { character } }));
}

export function stashCharacterForSheet(character) {
  localStorage.setItem('dnd4e.sheetPayload', JSON.stringify(characterToSheetPayload(character)));
  localStorage.setItem('dnd4e.activeCharacterId', character.id);
}
