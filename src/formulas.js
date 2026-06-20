/**
 * D&D 4th Edition — formulas matching official character sheet breakdowns.
 * Half-level: floor(level / 2). Ability modifier: floor((score - 10) / 2).
 */

export function halfLevel(level) {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  return Math.floor(n / 2);
}

export function abilityModifier(score) {
  const s = Math.floor(Number(score) || 0);
  return Math.floor((s - 10) / 2);
}

export function modPlusHalfLevel(score, level) {
  return abilityModifier(score) + halfLevel(level);
}

export function defenseTenPlusHalf(level) {
  return 10 + halfLevel(level);
}

export function sum(...values) {
  return values.reduce((a, b) => a + (Number(b) || 0), 0);
}

export function initiative(dexScore, level, misc = 0) {
  return sum(abilityModifier(dexScore), halfLevel(level), misc);
}

export function defenseTotal(level, components) {
  const { abil = 0, class: cls = 0, feat = 0, enh = 0, misc = 0, misc2 = 0, armor = 0 } = components;
  return sum(defenseTenPlusHalf(level), abil, cls, feat, enh, misc, misc2, armor);
}

/** Two relevant ability scores per defense (4e: defense uses the higher modifier). */
export const DEFENSE_ABILITIES = {
  ac: ['dex', 'int'],
  ref: ['dex', 'int'],
  fort: ['str', 'con'],
  will: ['wis', 'cha']
};

/**
 * Ability-modifier component of a defense: the higher modifier of the two
 * relevant ability scores (e.g. Fortitude = max(STR mod, CON mod)).
 * @param {Record<string, number>} scores - ability scores by key (str, con, …)
 * @param {'ac'|'fort'|'ref'|'will'} defense
 */
export function defenseAbilityMod(scores, defense) {
  const pair = DEFENSE_ABILITIES[defense];
  if (!pair) return 0;
  const mods = pair.map((ab) => abilityModifier(scores?.[ab] ?? 10));
  return Math.max(...mods);
}

export function attackBonus(level, components) {
  const { abil = 0, class: cls = 0, prof = 0, feat = 0, enh = 0, misc = 0 } = components;
  return sum(halfLevel(level), abil, cls, prof, feat, enh, misc);
}

export function damageBonus(components) {
  const { abil = 0, feat = 0, enh = 0, misc = 0, misc2 = 0 } = components;
  return sum(abil, feat, enh, misc, misc2);
}

export function skillBonus(abilityScore, level, trained, armorPenalty = 0, misc = 0) {
  const training = trained ? 5 : 0;
  return sum(modPlusHalfLevel(abilityScore, level), training, armorPenalty, misc);
}

export function passiveSense(skillBonusValue) {
  return 10 + (Number(skillBonusValue) || 0);
}

export function bloodied(maxHp) {
  const hp = Math.max(0, Math.floor(Number(maxHp) || 0));
  return Math.floor(hp / 2);
}

export function surgeValue(maxHp) {
  const hp = Math.max(0, Math.floor(Number(maxHp) || 0));
  return Math.floor(hp / 4);
}

export function speedTotal(components) {
  const { base = 0, armor = 0, item = 0, misc = 0 } = components;
  return sum(base, armor, item, misc);
}

/** Standard 4e XP thresholds (Heroic 1–10, Paragon 11–20, Epic 21–30). */
export const XP_BY_LEVEL = [
  0, 1000, 2250, 3750, 5500, 7500, 10000, 13000, 16500, 20500,
  26000, 32000, 39000, 47000, 57000, 69000, 83000, 99000, 119000, 143000,
  175000, 210000, 255000, 310000, 375000, 450000, 550000, 675000, 825000, 1000000
];

export function xpForLevel(level) {
  const n = Math.min(30, Math.max(1, Math.floor(Number(level) || 1)));
  return XP_BY_LEVEL[n - 1];
}

export function tierForLevel(level) {
  const n = Math.floor(Number(level) || 1);
  if (n >= 21) return 'Epic';
  if (n >= 11) return 'Paragon';
  return 'Heroic';
}

export function actionPointsFromMilestones(milestones) {
  const m = Math.min(2, Math.max(0, Math.floor(Number(milestones) || 0)));
  return 1 + m;
}

export const SKILLS = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex', armorPenalty: true },
  { id: 'arcana', name: 'Arcana', ability: 'int', armorPenalty: false },
  { id: 'athletics', name: 'Athletics', ability: 'str', armorPenalty: false },
  { id: 'bluff', name: 'Bluff', ability: 'cha', armorPenalty: false },
  { id: 'diplomacy', name: 'Diplomacy', ability: 'cha', armorPenalty: false },
  { id: 'dungeoneering', name: 'Dungeoneering', ability: 'wis', armorPenalty: false },
  { id: 'endurance', name: 'Endurance', ability: 'con', armorPenalty: true },
  { id: 'heal', name: 'Heal', ability: 'wis', armorPenalty: false },
  { id: 'history', name: 'History', ability: 'int', armorPenalty: false },
  { id: 'insight', name: 'Insight', ability: 'wis', armorPenalty: false },
  { id: 'intimidate', name: 'Intimidate', ability: 'cha', armorPenalty: false },
  { id: 'nature', name: 'Nature', ability: 'wis', armorPenalty: false },
  { id: 'perception', name: 'Perception', ability: 'wis', armorPenalty: false },
  { id: 'religion', name: 'Religion', ability: 'int', armorPenalty: false },
  { id: 'stealth', name: 'Stealth', ability: 'dex', armorPenalty: true },
  { id: 'streetwise', name: 'Streetwise', ability: 'cha', armorPenalty: false },
  { id: 'thievery', name: 'Thievery', ability: 'dex', armorPenalty: true }
];

export function buildLevelTable(maxLevel = 30) {
  const rows = [];
  for (let level = 1; level <= maxLevel; level++) {
    rows.push({
      level,
      halfLevel: halfLevel(level),
      defenseBase: defenseTenPlusHalf(level),
      xp: xpForLevel(level),
      tier: tierForLevel(level),
      abilityModAt10: abilityModifier(10),
      modPlusHalfAt10: modPlusHalfLevel(10, level)
    });
  }
  return rows;
}
