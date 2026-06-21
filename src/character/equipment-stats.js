/**
 * Parse compendium equipment entries into sheet-relevant stats.
 */

import overrides from '../../metadata/equipment-stats-overrides.json' with { type: 'json' };
import magicTiers from '../../metadata/magic-equipment-tiers.json' with { type: 'json' };

const OVERRIDE_BY_ID = overrides ?? {};

/**
 * GM-editable magic enhancement tiers (bonus -> level + price), sorted by bonus.
 * @type {Array<{ bonus: number, level: number, magicCostGp: number }>}
 */
const MAGIC_TIERS = [...(magicTiers?.tiers ?? [])]
  .map((t) => ({
    bonus: Math.floor(Number(t.bonus) || 0),
    level: Math.floor(Number(t.level) || 0),
    magicCostGp: Math.max(0, Math.floor(Number(t.magicCostGp) || 0))
  }))
  .filter((t) => t.bonus > 0)
  .sort((a, b) => a.bonus - b.bonus);

const ARMOR_AC_RE = /(?:AC\s*Bonus|Armor\s*Bonus)\s*[:\s]*\+?\s*(\d+)/i;
const CHECK_PEN_RE = /(?:Check\s*Penalty|Armor\s*Check\s*Penalty)\s*[:\s]*([+-]?\d+)/i;
const SPEED_PEN_RE = /(?:Speed\s*Penalty)\s*[:\s]*([+-]?\d+)/i;
const PROF_BONUS_RE = /(?:Proficiency\s*Bonus|Weapon\s*Bonus)\s*[:\s]*\+?\s*(\d+)/i;
const DAMAGE_DICE_RE = /(?:Damage|Weapon\s*Damage)\s*[:\s]*(\d+d\d+)/i;
const SHIELD_RE = /shield/i;

/**
 * Standard PHB armor AC bonuses keyed by category keyword. Used as a fallback
 * when an armor entry has no stats override and no parseable "AC Bonus" text in
 * its body HTML (the compendium stores these in a table, not inline prose), so
 * equipped armor still contributes to AC instead of resolving to +0.
 * @type {Array<{ match: RegExp, category: string, acBonus: number, checkPenalty: number, speedPenalty: number }>}
 */
const ARMOR_BASE_TABLE = [
  { match: /plate/i, category: 'plate', acBonus: 8, checkPenalty: -2, speedPenalty: -1 },
  { match: /scale/i, category: 'scale', acBonus: 7, checkPenalty: 0, speedPenalty: -1 },
  { match: /chain(?:mail)?/i, category: 'chainmail', acBonus: 6, checkPenalty: -1, speedPenalty: 0 },
  { match: /hide/i, category: 'hide', acBonus: 3, checkPenalty: -1, speedPenalty: 0 },
  { match: /leather/i, category: 'leather', acBonus: 2, checkPenalty: 0, speedPenalty: 0 },
  { match: /cloth/i, category: 'cloth', acBonus: 0, checkPenalty: 0, speedPenalty: 0 }
];

/**
 * @param {string} name
 * @param {string} type
 */
function inferArmorBase(name, type) {
  const haystack = `${name ?? ''} ${type ?? ''}`;
  for (const row of ARMOR_BASE_TABLE) {
    if (row.match.test(haystack)) return row;
  }
  return null;
}

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
    const base = inferArmorBase(name, type);
    return {
      kind: 'armor',
      name,
      acBonus: numFrom(html, ARMOR_AC_RE) ?? base?.acBonus ?? 0,
      checkPenalty: numFrom(html, CHECK_PEN_RE) ?? base?.checkPenalty ?? 0,
      speedPenalty: numFrom(html, SPEED_PEN_RE) ?? base?.speedPenalty ?? 0,
      armorCategory: base?.category ?? type
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

  if (category === 'implement') {
    // Implements have no inherent AC/damage dice; their enhancement bonus
    // applies to the attacks and damage of implement powers (handled at sync /
    // power-card time). We only need a kind so they are recognized as magic.
    return {
      kind: 'implement',
      name,
      implementGroup: type
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
 * Level-scaled magic items whose enhancement applies to defenses, keyed by a
 * name pattern. Each entry lists which defenses the item's enhancement bonus
 * applies to. Used to prompt for an item level and apply the bonus on equip.
 * @type {Array<{ match: RegExp, defenses: Array<'ac'|'fort'|'ref'|'will'>, slot: string }>}
 */
const DEFENSE_ENHANCEMENT_ITEMS = [
  { match: /amulet of protection/i, defenses: ['fort', 'ref', 'will'], slot: 'neck' }
];

/**
 * If the entry is a level-scaled defense-enhancement item (e.g. Amulet of
 * Protection), return which defenses its enhancement bonus applies to.
 * @param {{ listing_fields?: Record<string, string>, id?: string }} entry
 * @returns {{ defenses: Array<'ac'|'fort'|'ref'|'will'>, slot: string } | null}
 */
export function getDefenseEnhancementInfo(entry) {
  const name = entry?.listing_fields?.Name ?? '';
  for (const row of DEFENSE_ENHANCEMENT_ITEMS) {
    if (row.match.test(name)) return { defenses: row.defenses, slot: row.slot };
  }
  return null;
}

/**
 * Enhancement bonus (+1…+6) for a 4e item at a given level: one step per five
 * levels (1–5 → +1, 6–10 → +2, … 26–30 → +6).
 * @param {number} level
 */
export function enhancementFromLevel(level) {
  const n = Math.floor(Number(level) || 0);
  if (n <= 0) return 0;
  return Math.min(6, Math.max(1, Math.ceil(n / 5)));
}

/**
 * Read a single numeric level from an entry's listing fields, when unambiguous.
 * Returns null for missing or multi-value level fields (e.g. "1, 6, 11").
 * @param {{ listing_fields?: Record<string, string> }} entry
 */
export function levelFromEntry(entry) {
  const raw = entry?.listing_fields?.Level;
  if (raw == null) return null;
  const m = String(raw).match(/\d+/g);
  if (!m || m.length !== 1) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * All configured magic enhancement tiers (bonus -> level + price).
 * @returns {Array<{ bonus: number, level: number, magicCostGp: number }>}
 */
export function getMagicTiers() {
  return MAGIC_TIERS.map((t) => ({ ...t }));
}

/**
 * Look up the tier (level + enhancement price) for a magic bonus, or null.
 * @param {number} bonus
 * @returns {{ bonus: number, level: number, magicCostGp: number } | null}
 */
export function magicTierForBonus(bonus) {
  const n = Math.floor(Number(bonus) || 0);
  if (n <= 0) return null;
  const tier = MAGIC_TIERS.find((t) => t.bonus === n);
  return tier ? { ...tier } : null;
}

/**
 * True when an entry resolves to a base weapon, armor, or implement (i.e. a
 * candidate for a magic enhancement). Shields are excluded for now.
 * @param {Parameters<typeof getEquipmentStats>[0]} entry
 */
export function isEnhanceableEntry(entry) {
  if (!entry) return false;
  const stats = getEquipmentStats(entry);
  return stats?.kind === 'weapon' || stats?.kind === 'armor' || stats?.kind === 'implement';
}

/**
 * Prefix a base item name with its magic bonus, e.g. ("Chainmail", 2) -> "+2 Chainmail".
 * @param {string} name
 * @param {number | null | undefined} bonus
 */
export function magicDisplayName(name, bonus) {
  const n = Math.floor(Number(bonus) || 0);
  const base = String(name ?? '');
  return n > 0 ? `+${n} ${base}` : base;
}

/**
 * Parse a base item's gold cost from its listing "Cost" field. Handles values
 * like "45 gp", "1,200 gp", "10 sp" (sp/cp ignored, treated as <1 gp -> 0).
 * Returns 0 when no parseable gp value is present.
 * @param {{ listing_fields?: Record<string, string> }} entry
 */
export function baseCostGpFromEntry(entry) {
  const raw = entry?.listing_fields?.Cost;
  if (raw == null) return 0;
  const m = String(raw).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*gp/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

/**
 * Total gold cost of a magic version of an entry: base item cost plus the
 * enhancement price for the chosen bonus. Returns null for an unknown tier.
 * @param {{ listing_fields?: Record<string, string> }} entry
 * @param {number} bonus
 */
export function magicTotalCostGp(entry, bonus) {
  const tier = magicTierForBonus(bonus);
  if (!tier) return null;
  return baseCostGpFromEntry(entry) + tier.magicCostGp;
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
