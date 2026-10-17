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
  getEquipmentStats,
  itemDefenseBonusContributions,
  stackDefenseBonuses
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
  // Equipment-managed enhancement bonuses to AC/Fort/Ref/Will (magic armor and
  // neck items such as the Amulet of Protection). Reset each sync, then
  // re-derived from equipped items below.
  character.sheet.defenses.ac.enh = 0;
  character.sheet.defenses.fort.enh = 0;
  character.sheet.defenses.ref.enh = 0;
  character.sheet.defenses.will.enh = 0;
  character.sheet.defenses.ac.misc2 = 0;
  character.sheet.defenses.fort.misc2 = 0;
  character.sheet.defenses.ref.misc2 = 0;
  character.sheet.defenses.will.misc2 = 0;

  const keysToClear = [
    'melee-name',
    'melee-dice',
    'melee-atk-prof',
    'melee-atk-abil',
    'melee-atk-enh',
    'melee-dmg-abil',
    'melee-dmg-enh',
    'ranged-name',
    'ranged-dice',
    'ranged-atk-prof',
    'ranged-atk-abil',
    'ranged-atk-enh',
    'ranged-dmg-abil',
    'ranged-dmg-enh',
    // Per-source enhancement values consumed by the printable power cards
    // (weapon powers vs implement powers); not shown as sheet inputs.
    'weapon-melee-enh',
    'weapon-ranged-enh',
    'implement-enh',
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

  let checkPenalty = 0;
  let speedPenalty = 0;
  let armorIsHeavy = false;
  let implementEnh = 0;
  /** @type {Array<{ instanceId: string, type: string, defense: string, amount: number }>} */
  const defenseBonuses = [];

  /** @type {Array<{ slotId: string, stats: ReturnType<typeof getEquipmentStats>, enhancement: number }>} */
  const weapons = [];

  for (const slot of EQUIPMENT_SLOTS) {
    const item = equipped[slot.id];
    if (!item) continue;
    const entry = await compendium.getEntry(item.compendiumId);
    if (!entry) continue;

    // Prefer normalized stats from the compendium DB when present; fall back to
    // runtime HTML parsing for any item not yet covered by the normalizer.
    const normalizedStats =
      typeof compendium.getNormalizedItemStats === 'function'
        ? await compendium.getNormalizedItemStats(item.compendiumId)
        : null;
    const stats = normalizedStats ?? getEquipmentStats(entry);

    for (const bonus of itemDefenseBonusContributions(item, entry, stats)) {
      defenseBonuses.push({ instanceId: item.instanceId, ...bonus });
    }
    if (!stats) continue;

    // Magic enhancement (+1/+2/+3) chosen on a base weapon/armor instance.
    const enhancement = Math.max(0, Math.floor(Number(item.enhancement) || 0));

    if (stats.kind === 'armor') {
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
      checkPenalty += Number(stats.checkPenalty) || 0;
    } else if (stats.kind === 'weapon' && (slot.id === 'mainHand' || slot.id === 'offHand')) {
      weapons.push({ slotId: slot.id, stats, enhancement });
    } else if (stats.kind === 'implement') {
      // An implement's enhancement applies to implement powers (attack +
      // damage). Track the best one equipped; it feeds the attack lines and the
      // power cards below.
      implementEnh = Math.max(implementEnh, enhancement);
    }
  }

  const stacked = stackDefenseBonuses(defenseBonuses);
  // Armor bonus and shield bonus are different types, so both apply. The sheet
  // keeps them in the armor column. Every other type, and untyped bonuses, go
  // in misc2 so they still count and do not overwrite a handwritten misc value.
  for (const def of ['ac', 'fort', 'ref', 'will']) {
    const byType = stacked[def].byType;
    character.sheet.defenses[def].enh = byType.enhancement || 0;
    const armorColumn = (def === 'ac' || def === 'ref' ? (byType.armor || 0) + (byType.shield || 0) : 0);
    if (def === 'ac' || def === 'ref') character.sheet.defenses[def].armor = armorColumn;
    let misc2 = stacked[def].untyped;
    for (const [type, amount] of Object.entries(byType)) {
      if (type === 'enhancement') continue;
      if ((def === 'ac' || def === 'ref') && (type === 'armor' || type === 'shield')) continue;
      misc2 += amount;
    }
    character.sheet.defenses[def].misc2 = misc2;
  }
  character.sheet.armorPenaltyGlobal = checkPenalty;
  character.sheet.speed.armor = speedPenalty;
  character.sheet.armorIsHeavy = armorIsHeavy;

  const scores = getFinalScores(character);
  const mainWeapon = weapons.find((w) => w.slotId === 'mainHand') ?? weapons[0];
  const offWeapon = weapons.find((w) => w.slotId === 'offHand' && w.stats?.kind === 'weapon');

  // Per-source enhancement values for the power cards: weapon powers use the
  // weapon's bonus (per line), implement powers use the implement's bonus. The
  // sheet's single melee/ranged enh field shows the higher of the two so an
  // equipped magic implement also benefits the basic attack lines.
  const meleeWeaponEnh = Math.max(0, Math.floor(Number(mainWeapon?.enhancement) || 0));
  setExtra(character, 'weapon-melee-enh', meleeWeaponEnh);
  setExtra(character, 'implement-enh', implementEnh);

  if (mainWeapon?.stats) {
    const w = mainWeapon.stats;
    const enh = Math.max(meleeWeaponEnh, implementEnh);
    const abil = attackAbilityForWeapon(w, 'melee');
    const abilMod = abilityModifier(scores[abil] ?? 10);
    const label = `Melee Basic Attack — ${w.name}`;
    setExtra(character, 'melee-name', label);
    setExtra(character, 'melee-dice', w.damageDice ?? '1d4');
    setExtra(character, 'melee-atk-prof', w.proficiencyBonus ?? 3);
    setExtra(character, 'melee-atk-abil', abilMod);
    setExtra(character, 'melee-atk-enh', enh);
    setExtra(character, 'melee-dmg-abil', abilMod);
    setExtra(character, 'melee-dmg-enh', enh);
    setExtra(character, 'basic1-weapon', label);
    setExtra(character, 'basic1-dmg', w.damageDice ?? '1d4');
    setExtra(character, 'basic1-vs', 'AC');
  }

  const rangedWeapon =
    offWeapon?.stats?.range === 'ranged'
      ? offWeapon
      : weapons.find((w) => w.stats?.range === 'ranged' || w.stats?.range === 'both');
  const rangedCandidate = rangedWeapon?.stats;
  const rangedWeaponEnh = Math.max(0, Math.floor(Number(rangedWeapon?.enhancement) || 0));
  setExtra(character, 'weapon-ranged-enh', rangedWeaponEnh);

  if (rangedCandidate) {
    const w = rangedCandidate;
    const enh = Math.max(rangedWeaponEnh, implementEnh);
    const abil = attackAbilityForWeapon(w, 'ranged');
    const abilMod = abilityModifier(scores[abil] ?? 10);
    const label = `Ranged Basic Attack — ${w.name}`;
    setExtra(character, 'ranged-name', label);
    setExtra(character, 'ranged-dice', w.damageDice ?? '1d4');
    setExtra(character, 'ranged-atk-prof', w.proficiencyBonus ?? 3);
    setExtra(character, 'ranged-atk-abil', abilMod);
    setExtra(character, 'ranged-atk-enh', enh);
    setExtra(character, 'ranged-dmg-abil', abilMod);
    setExtra(character, 'ranged-dmg-enh', enh);
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
    setExtra(character, 'ranged-atk-enh', implementEnh);
    setExtra(character, 'ranged-dmg-abil', dexMod);
    setExtra(character, 'ranged-dmg-enh', implementEnh);
  }

  return character;
}
