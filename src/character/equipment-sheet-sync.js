/**
 * Apply equipped gear to character sheet fields and mirror attack lines.
 */

import { abilityModifier } from '../formulas.js';
import { getFinalScores } from './tutor.js';
import {
  EQUIPMENT_SLOTS,
  ensureEquipmentSelectionsShape,
  getEquippedBySlot
} from './equipment-selections.js';
import {
  attackAbilityForWeapon,
  getEquipmentStats
} from './equipment-stats.js';
import { parseClassEntry } from './class-parse.js';

/**
 * @param {string} traitsText
 * @param {string} armorCategory
 */
function isProficientInArmor(traitsText, armorCategory) {
  const text = String(traitsText ?? '').toLowerCase();
  const cat = String(armorCategory ?? '').toLowerCase();
  if (!text || !cat) return true;
  if (cat.includes('shield')) {
    return text.includes('shield');
  }
  if (cat.includes('scale')) return text.includes('scale');
  if (cat.includes('chain')) return text.includes('chainmail') || text.includes('chain');
  if (cat.includes('leather')) return text.includes('leather');
  if (cat.includes('hide')) return text.includes('hide');
  if (cat.includes('plate')) return text.includes('plate');
  if (cat.includes('cloth')) return text.includes('cloth');
  return true;
}

/**
 * @param {object} character
 */
function ensureSheetAttackShape(character) {
  character.sheet = character.sheet ?? {};
  character.sheet.extraFields = character.sheet.extraFields ?? {};
  character.sheet.defenses = character.sheet.defenses ?? {};
  for (const def of ['ac', 'fort', 'ref', 'will']) {
    character.sheet.defenses[def] = character.sheet.defenses[def] ?? {};
  }
  character.sheet.speed = character.sheet.speed ?? { base: 6, armor: 0, item: 0, misc: 0 };
  return character;
}

/**
 * @param {object} character
 */
function clearEquipmentDerivedSheet(character) {
  ensureSheetAttackShape(character);
  character.sheet.defenses.ac.armor = 0;
  character.sheet.defenses.ref.armor = 0;
  character.sheet.armorPenaltyGlobal = 0;
  character.sheet.speed.armor = 0;
  character.sheet.armorIsHeavy = false;

  const keysToClear = [
    'melee-name',
    'melee-dice',
    'melee-atk-prof',
    'melee-atk-abil',
    'melee-dmg-abil',
    'ranged-name',
    'ranged-dice',
    'ranged-atk-prof',
    'ranged-atk-abil',
    'ranged-dmg-abil',
    'basic1-weapon',
    'basic1-dmg',
    'basic1-vs',
    'basic2-weapon',
    'basic2-dmg',
    'basic2-vs'
  ];
  for (const key of keysToClear) {
    delete character.sheet.extraFields[key];
  }
}

/**
 * @param {object} character
 * @param {string} key
 * @param {string | number} value
 */
function setExtra(character, key, value) {
  character.sheet.extraFields[key] = value;
}

/**
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @param {{ classEntry?: object | null }} [opts]
 */
export async function syncEquipmentToSheet(character, compendium, opts = {}) {
  ensureEquipmentSelectionsShape(character);
  clearEquipmentDerivedSheet(character);

  const equipped = getEquippedBySlot(character);
  const classEntry = opts.classEntry ?? null;
  const traitsText = classEntry ? parseClassEntry(classEntry).traitPairs.map((p) => p.value).join(' ') : '';

  let acArmor = 0;
  let refArmor = 0;
  let checkPenalty = 0;
  let speedPenalty = 0;
  let armorIsHeavy = false;

  /** @type {Array<{ slotId: string, stats: ReturnType<typeof getEquipmentStats> }>} */
  const weapons = [];

  for (const slot of EQUIPMENT_SLOTS) {
    const item = equipped[slot.id];
    if (!item) continue;
    const entry = await compendium.getEntry(item.compendiumId);
    if (!entry) continue;
    const stats = getEquipmentStats(entry);
    if (!stats) continue;

    if (stats.kind === 'armor') {
      acArmor += Number(stats.acBonus) || 0;
      checkPenalty += Number(stats.checkPenalty) || 0;
      if (/chain|scale|plate/i.test(stats.armorCategory ?? '')) armorIsHeavy = true;
      const proficient = isProficientInArmor(
        classEntry?.body_html ?? traitsText,
        stats.armorCategory ?? entry.listing_fields?.Type ?? ''
      );
      if (!proficient) {
        speedPenalty += Number(stats.speedPenalty) || 0;
      }
    } else if (stats.kind === 'shield') {
      acArmor += Number(stats.acBonus) || 0;
      refArmor += Number(stats.refBonus) || 0;
      checkPenalty += Number(stats.checkPenalty) || 0;
    } else if (stats.kind === 'weapon' && (slot.id === 'mainHand' || slot.id === 'offHand')) {
      weapons.push({ slotId: slot.id, stats });
    }
  }

  character.sheet.defenses.ac.armor = acArmor;
  character.sheet.defenses.ref.armor = refArmor;
  character.sheet.armorPenaltyGlobal = checkPenalty;
  character.sheet.speed.armor = speedPenalty;
  character.sheet.armorIsHeavy = armorIsHeavy;

  const scores = getFinalScores(character);
  const mainWeapon = weapons.find((w) => w.slotId === 'mainHand') ?? weapons[0];
  const offWeapon = weapons.find((w) => w.slotId === 'offHand' && w.stats?.kind === 'weapon');

  if (mainWeapon?.stats) {
    const w = mainWeapon.stats;
    const abil = attackAbilityForWeapon(w, 'melee');
    const abilMod = abilityModifier(scores[abil] ?? 10);
    const label = `Melee Basic Attack — ${w.name}`;
    setExtra(character, 'melee-name', label);
    setExtra(character, 'melee-dice', w.damageDice ?? '1d4');
    setExtra(character, 'melee-atk-prof', w.proficiencyBonus ?? 3);
    setExtra(character, 'melee-atk-abil', abilMod);
    setExtra(character, 'melee-dmg-abil', abilMod);
    setExtra(character, 'basic1-weapon', label);
    setExtra(character, 'basic1-dmg', w.damageDice ?? '1d4');
    setExtra(character, 'basic1-vs', 'AC');
  }

  const rangedCandidate =
    offWeapon?.stats?.range === 'ranged'
      ? offWeapon.stats
      : weapons.find((w) => w.stats?.range === 'ranged' || w.stats?.range === 'both')?.stats;

  if (rangedCandidate) {
    const w = rangedCandidate;
    const abil = attackAbilityForWeapon(w, 'ranged');
    const abilMod = abilityModifier(scores[abil] ?? 10);
    const label = `Ranged Basic Attack — ${w.name}`;
    setExtra(character, 'ranged-name', label);
    setExtra(character, 'ranged-dice', w.damageDice ?? '1d4');
    setExtra(character, 'ranged-atk-prof', w.proficiencyBonus ?? 3);
    setExtra(character, 'ranged-atk-abil', abilMod);
    setExtra(character, 'ranged-dmg-abil', abilMod);
    setExtra(character, 'basic2-weapon', label);
    setExtra(character, 'basic2-dmg', w.damageDice ?? '1d4');
    setExtra(character, 'basic2-vs', 'AC');
  } else {
    setExtra(character, 'basic2-weapon', 'Ranged Basic Attack — Javelin');
    setExtra(character, 'basic2-dmg', '1d6');
    setExtra(character, 'basic2-vs', 'AC');
    const dexMod = abilityModifier(scores.dex ?? 10);
    setExtra(character, 'ranged-name', 'Ranged Basic Attack — Javelin');
    setExtra(character, 'ranged-dice', '1d6');
    setExtra(character, 'ranged-atk-prof', 3);
    setExtra(character, 'ranged-atk-abil', dexMod);
    setExtra(character, 'ranged-dmg-abil', dexMod);
  }

  return character;
}
