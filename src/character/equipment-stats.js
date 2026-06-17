/**
 * Parse compendium equipment entries into sheet-relevant stats.
 */

import overrides from '../../metadata/equipment-stats-overrides.json' with { type: 'json' };

const OVERRIDE_BY_ID = overrides ?? {};

const ARMOR_AC_RE = /(?:AC\s*Bonus|Armor\s*Bonus)\s*[:\s]*\+?\s*(\d+)/i;
const CHECK_PEN_RE = /(?:Check\s*Penalty|Armor\s*Check\s*Penalty)\s*[:\s]*([+-]?\d+)/i;
const SPEED_PEN_RE = /(?:Speed\s*Penalty)\s*[:\s]*([+-]?\d+)/i;
const PROF_BONUS_RE = /(?:Proficiency\s*Bonus|Weapon\s*Bonus)\s*[:\s]*\+?\s*(\d+)/i;
const DAMAGE_DICE_RE = /(?:Damage|Weapon\s*Damage)\s*[:\s]*(\d+d\d+)/i;
const SHIELD_RE = /shield/i;

/**
 * @param {{ id?: string, category_slug?: string, listing_fields?: Record<string, string>, body_html?: string }} entry
 */
export function getEquipmentStats(entry) {
  if (!entry?.id) return null;

  const override = OVERRIDE_BY_ID[entry.id];
  if (override) {
    return {
      ...override,
      name: entry.listing_fields?.Name ?? entry.id
    };
  }

  const category = entry.category_slug ?? '';
  const type = entry.listing_fields?.Type ?? '';
  const html = entry.body_html ?? '';
  const name = entry.listing_fields?.Name ?? entry.id;

  if (category === 'armor' || /armor|shield/i.test(type)) {
    if (SHIELD_RE.test(type)) {
      return {
        kind: 'shield',
        name,
        acBonus: numFrom(html, ARMOR_AC_RE) ?? 2,
        refBonus: 1,
        checkPenalty: numFrom(html, CHECK_PEN_RE) ?? -2
      };
    }
    return {
      kind: 'armor',
      name,
      acBonus: numFrom(html, ARMOR_AC_RE) ?? 0,
      checkPenalty: numFrom(html, CHECK_PEN_RE) ?? 0,
      speedPenalty: numFrom(html, SPEED_PEN_RE) ?? 0,
      armorCategory: type
    };
  }

  if (category === 'weapon') {
    const dice = numFrom(html, DAMAGE_DICE_RE, { asString: true }) ?? '1d4';
    return {
      kind: 'weapon',
      name,
      proficiencyBonus: numFrom(html, PROF_BONUS_RE) ?? 3,
      damageDice: String(dice),
      weaponGroup: type,
      range: /ranged|sling|crossbow|bow/i.test(type) ? 'ranged' : 'melee',
      attackAbility: /dex/i.test(type) ? 'dex' : 'str'
    };
  }

  return null;
}

/**
 * @param {string} html
 * @param {RegExp} re
 * @param {{ asString?: boolean }} [opts]
 */
function numFrom(html, re, opts = {}) {
  const m = String(html ?? '').match(re);
  if (!m?.[1]) return null;
  if (opts.asString) return m[1];
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {ReturnType<typeof getEquipmentStats>} stats
 * @param {'melee' | 'ranged'} mode
 */
export function attackAbilityForWeapon(stats, mode = 'melee') {
  if (!stats || stats.kind !== 'weapon') return 'str';
  if (mode === 'ranged' && stats.rangedAttackAbility) return stats.rangedAttackAbility;
  return stats.attackAbility ?? 'str';
}
