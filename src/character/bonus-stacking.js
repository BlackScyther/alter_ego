/**
 * D&D 4e-style stacking: bonuses of the same type on one target do not add
 * (use the highest). Different types on the same target do add together.
 */

export const BONUS_TYPE_LABELS = {
  race: 'Racial',
  class: 'Class',
  theme: 'Theme',
  background: 'Background',
  feat: 'Feat',
  skill: 'Skill',
  item: 'Item',
  enhancement: 'Enhancement',
  power: 'Power',
  level: 'Level',
  other: 'Other'
};

/** @typedef {'race'|'class'|'theme'|'background'|'feat'|'skill'|'item'|'enhancement'|'power'|'other'} BonusType */

export function normalizeBonusType(value, source = 'other') {
  const k = String(value ?? '').toLowerCase();
  if (k in BONUS_TYPE_LABELS) return k;
  const fromSource = { race: 'race', class: 'class', theme: 'theme', background: 'background', feat: 'feat' }[
    source
  ];
  return fromSource ?? 'other';
}

/**
 * @param {object[]} bonuses - enabled candidates with target resolved
 * @param {string} targetKey - ability or skill id
 */
export function stackBonusesOnTarget(bonuses, targetKey) {
  const onTarget = bonuses.filter((b) => b.enabled && b._target === targetKey && b.amount);
  const byType = new Map();

  for (const b of onTarget) {
    const type = normalizeBonusType(b.bonusType, b.source);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(b);
  }

  const applied = [];
  const suppressed = [];
  const byTypeAmount = {};

  for (const [type, list] of byType) {
    list.sort((a, b) => b.amount - a.amount);
    const best = list[0];
    byTypeAmount[type] = best.amount;
    applied.push({ ...best, bonusType: type, amount: best.amount });
    for (let i = 1; i < list.length; i++) {
      suppressed.push({
        bonus: list[i],
        reason: `Same type (${BONUS_TYPE_LABELS[type]}): only highest +${best.amount} applies.`
      });
    }
  }

  const total = Object.values(byTypeAmount).reduce((s, n) => s + n, 0);
  return { applied, suppressed, byTypeAmount, total };
}
