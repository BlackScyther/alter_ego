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

const AC_BONUS_RE = /(?:AC|Armor)\s*Bonus\s*:\s*\+?\s*(-?\d+)/i;
const SHIELD_BONUS_RE = /Shield\s*Bonus\s*:\s*\+?\s*(-?\d+)/i;
const CHECK_PEN_RE = /(?:Armor\s*)?Check(?:\s*Penalty)?\s*:\s*([+-]?\d+)/i;
const SPEED_PEN_RE = /Speed(?:\s*Penalty)?\s*:\s*([+-]?\d+)/i;
const PROF_BONUS_RE = /(?:Proficiency\s*Bonus|Weapon\s*Bonus)\s*[:\s]*\+?\s*(\d+)/i;
const DAMAGE_DICE_RE = /(?:Damage|Weapon\s*Damage)\s*[:\s]*(\d+d\d+)/i;
const SHIELD_RE = /shield/i;
const BONUS_TYPE_RE =
  'enhancement|item|feat|power|racial|race|proficiency|circumstance|armor|shield|defense';

/**
 * PHB armor numbers used only when the stat block does not state that field.
 * Chainmail speed is −1. A missing shield number stays 0; light and heavy
 * shields supply their own fallback below, and never share one heavy default.
 * @type {Array<{ match: RegExp, category: string, acBonus: number, checkPenalty: number, speedPenalty: number }>}
 */
const ARMOR_BASE_TABLE = [
  { match: /plate/i, category: 'plate', acBonus: 8, checkPenalty: -2, speedPenalty: -1 },
  { match: /scale/i, category: 'scale', acBonus: 7, checkPenalty: 0, speedPenalty: -1 },
  { match: /chain(?:mail)?/i, category: 'chainmail', acBonus: 6, checkPenalty: -1, speedPenalty: -1 },
  { match: /hide/i, category: 'hide', acBonus: 3, checkPenalty: -1, speedPenalty: 0 },
  { match: /leather/i, category: 'leather', acBonus: 2, checkPenalty: 0, speedPenalty: 0 },
  { match: /cloth/i, category: 'cloth', acBonus: 0, checkPenalty: 0, speedPenalty: 0 }
];

/** @type {{ light: { acBonus: number, refBonus: number, checkPenalty: number }, heavy: { acBonus: number, refBonus: number, checkPenalty: number } }} */
const SHIELD_FALLBACK = {
  light: { acBonus: 1, refBonus: 0, checkPenalty: 0 },
  heavy: { acBonus: 2, refBonus: 1, checkPenalty: -2 }
};

/**
 * @param {string} html
 */
export function plainItemText(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @param {RegExp} re
 */
function labeledNumber(text, re) {
  const match = String(text ?? '').match(re);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stat-block fields only. Prose such as "grants +7 AC at levels 6–10" is the
 * magic total, not the armor bonus, and does not match these labels.
 * @param {string} html
 */
function readArmorBlock(html) {
  const text = plainItemText(html);
  return {
    acBonus: labeledNumber(text, AC_BONUS_RE),
    shieldBonus: labeledNumber(text, SHIELD_BONUS_RE),
    checkPenalty: labeledNumber(text, CHECK_PEN_RE),
    speedPenalty: labeledNumber(text, SPEED_PEN_RE)
  };
}

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
 * An override written for a different item (live Cloth is `armor1`, the stub
 * used that id for Chainmail) must not replace the named armor.
 * @param {object | undefined} override
 * @param {{ category?: string } | null} base
 */
function usableArmorOverride(override, base) {
  if (!override) return null;
  if (override.armorCategory && base?.category && override.armorCategory !== base.category) return null;
  return override;
}

/**
 * @param {string} name
 * @param {string} type
 */
function shieldFallback(name, type) {
  const haystack = `${name ?? ''} ${type ?? ''}`;
  if (/heavy/i.test(haystack)) return SHIELD_FALLBACK.heavy;
  if (/light/i.test(haystack)) return SHIELD_FALLBACK.light;
  return { acBonus: 0, refBonus: 0, checkPenalty: 0 };
}

/**
 * @param {{ id?: string, category_slug?: string, listing_fields?: Record<string, string>, body_html?: string }} entry
 */
export function getEquipmentStats(entry) {
  if (!entry?.id) return null;

  const category = entry.category_slug ?? '';
  const type = entry.listing_fields?.Type ?? '';
  const html = entry.body_html ?? '';
  const name = entry.listing_fields?.Name ?? entry.id;
  const armorLike = category === 'armor' || /armor|shield/i.test(type);

  if (!armorLike) {
    const override = OVERRIDE_BY_ID[entry.id];
    if (override) {
      return { ...override, name };
    }
  }

  if (armorLike) {
    const block = readArmorBlock(html);
    const base = inferArmorBase(name, type);
    const override = usableArmorOverride(OVERRIDE_BY_ID[entry.id], base);
    if (SHIELD_RE.test(type) || SHIELD_RE.test(name)) {
      const fallback = shieldFallback(name, type);
      const knownShield = /heavy|light/i.test(`${name} ${type}`);
      return {
        kind: 'shield',
        name,
        acBonus: block.shieldBonus ?? block.acBonus ?? override?.acBonus ?? fallback.acBonus,
        refBonus: knownShield ? fallback.refBonus : (override?.refBonus ?? fallback.refBonus),
        checkPenalty: block.checkPenalty ?? override?.checkPenalty ?? fallback.checkPenalty
      };
    }
    return {
      kind: 'armor',
      name,
      acBonus: block.acBonus ?? override?.acBonus ?? base?.acBonus ?? 0,
      checkPenalty: block.checkPenalty ?? override?.checkPenalty ?? base?.checkPenalty ?? 0,
      speedPenalty: block.speedPenalty ?? override?.speedPenalty ?? base?.speedPenalty ?? 0,
      armorCategory: base?.category ?? override?.armorCategory ?? type
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
 * Named bonus types. Two bonuses of one of these types to the same defense
 * do not add. A bonus with no type is `untyped` and does add.
 * Armor is the armor's own bonus, almost always to Armor Class.
 * @type {ReadonlySet<string>}
 */
export const NAMED_DEFENSE_BONUS_TYPES = new Set([
  'enhancement',
  'item',
  'feat',
  'power',
  'racial',
  'proficiency',
  'circumstance',
  'armor',
  'shield',
  'defense'
]);

/** Shown when two equipped items grant the same bonus type to the same defense. */
export const SAME_TYPE_BONUS_WARNING =
  'Bonuses of the same type to the same defense do not add. Only the highest one is used.';

/**
 * Every defense bonus written on an item, for example
 * "+2 enhancement bonus to Fortitude" or "+1 circumstance bonus to Reflex".
 * "+1 bonus to Fortitude" has no type, so it is untyped and still adds.
 * @param {string} html
 * @returns {Array<{ type: string, defense: 'ac'|'fort'|'ref'|'will', amount: number }>}
 */
export function parseDefenseBonuses(html) {
  const text = String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
  /** @type {Array<{ type: string, defense: 'ac'|'fort'|'ref'|'will', amount: number }>} */
  const out = [];
  const re =
    /\+\s*(\d+)\s+(?:(enhancement|item|feat|power|racial|race|proficiency|circumstance|armor|shield|defense)\s+)?bonus(?:es)?\s+to\s+([^.]*)/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const rawType = String(match[2] ?? '').toLowerCase();
    const type = rawType === 'race' ? 'racial' : rawType || 'untyped';
    for (const defense of defensesInPhrase(match[3])) out.push({ type, defense, amount });
  }
  return out;
}

/**
 * @param {string} phrase
 * @returns {Array<'ac'|'fort'|'ref'|'will'>}
 */
function defensesInPhrase(phrase) {
  /** @type {Array<'ac'|'fort'|'ref'|'will'>} */
  const defenses = [];
  if (/fort/i.test(phrase)) defenses.push('fort');
  if (/reflex/i.test(phrase)) defenses.push('ref');
  if (/\bwill\b/i.test(phrase)) defenses.push('will');
  if (/armor\s+class|\bac\b/i.test(phrase)) defenses.push('ac');
  return defenses;
}

/**
 * @param {string | undefined} rawType
 */
function normalizeBonusType(rawType) {
  const raw = String(rawType ?? '').toLowerCase();
  if (!raw) return 'untyped';
  return raw === 'race' ? 'racial' : raw;
}

/**
 * @param {string} phrase
 */
function isConditionalPhrase(phrase) {
  return /\bagainst\b|\bwhile\b|\bwhen\b|\bif\b/i.test(phrase);
}

/**
 * Magic-item table rows (`Lvl 6 +2`) whose "Enhancement Bonus:" line names
 * defenses. The amount is the highest row at or below the equipped level.
 * Empty bonus cells (Belt of Vigor) are ignored.
 * @param {string} html
 * @param {number} level
 * @returns {Array<{ type: string, defense: 'ac'|'fort'|'ref'|'will', amount: number }>}
 */
export function magicTableDefenseBonuses(html, level) {
  const text = plainItemText(html);
  const header = text.match(/Enhancement\s+Bonus\s*:\s*([^.]*)/i);
  if (!header) return [];
  const defenses = defensesInPhrase(header[1]);
  if (!defenses.length) return [];
  const n = Math.floor(Number(level) || 0);
  let bestLevel = -1;
  let bestAmount = 0;
  const re = /Lvl\s*(\d+)\s+\+(\d+)/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const tierLevel = Number(match[1]);
    const amount = Number(match[2]);
    if (tierLevel <= n && tierLevel >= bestLevel && amount > 0) {
      bestLevel = tierLevel;
      bestAmount = amount;
    }
  }
  if (bestLevel < 0) return [];
  return defenses.map((defense) => ({ type: 'enhancement', defense, amount: bestAmount }));
}

/**
 * Printed property bonuses, including "Level 12: Gain a +2 item bonus" steps
 * that raise the previous bonus. A step that names its own target starts a
 * new track. "Level 13 or 18" and "Level 22 or higher" use the first level
 * as the step that starts applying.
 * @param {string} html
 * @returns {Array<{ type: string, defenses: Array<'ac'|'fort'|'ref'|'will'>, target: string, conditional: boolean, steps: Array<{ minLevel: number, amount: number }> }>}
 */
export function parsePrintedBonusTracks(html) {
  const text = plainItemText(html);
  const re = new RegExp(
    String.raw`Level\s+(\d+)(?:\s+or\s+(?:higher|\d+))?\s*:\s*(?:(?:Gain|You gain)\s+(?:a\s+)?)?\+\s*(\d+)\s+(?:(${BONUS_TYPE_RE})\s+)?bonus(?:es)?(?:\s+to\s+([^.<]*))?|\+\s*(\d+)\s+(?:(${BONUS_TYPE_RE})\s+)?bonus(?:es)?(?:\s+to\s+([^.<]*))?`,
    'gi'
  );
  /** @type {Array<{ type: string, defenses: Array<'ac'|'fort'|'ref'|'will'>, target: string, conditional: boolean, steps: Array<{ minLevel: number, amount: number }> }>} */
  const tracks = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[1]) {
      const minLevel = Number(match[1]);
      const amount = Number(match[2]);
      const type = match[3] ? normalizeBonusType(match[3]) : null;
      const phrase = String(match[4] ?? '').trim();
      if (phrase) {
        tracks.push({
          type: type ?? 'untyped',
          defenses: defensesInPhrase(phrase),
          target: phrase,
          conditional: isConditionalPhrase(phrase),
          steps: [{ minLevel, amount }]
        });
      } else if (tracks.length && amount > 0) {
        const last = tracks[tracks.length - 1];
        if (type) last.type = type;
        last.steps.push({ minLevel, amount });
      }
      continue;
    }
    const amount = Number(match[5]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const phrase = String(match[7] ?? '').trim();
    tracks.push({
      type: normalizeBonusType(match[6]),
      defenses: defensesInPhrase(phrase),
      target: phrase,
      conditional: isConditionalPhrase(phrase),
      steps: [{ minLevel: 0, amount }]
    });
  }
  return tracks;
}

/**
 * The printed bonus that applies at an item level. This is the text's own
 * step, not `1 + floor((level - 1) / 5)`.
 * @param {string} html
 * @param {number} level
 */
export function printedBonusesAtLevel(html, level) {
  const n = Math.floor(Number(level) || 0);
  /** @type {Array<{ type: string, amount: number, defenses: Array<'ac'|'fort'|'ref'|'will'>, target: string, conditional: boolean }>} */
  const out = [];
  for (const track of parsePrintedBonusTracks(html)) {
    let amount = 0;
    let min = -1;
    for (const step of track.steps) {
      if (step.minLevel <= n && step.minLevel >= min) {
        min = step.minLevel;
        amount = step.amount;
      }
    }
    if (amount <= 0) continue;
    out.push({
      type: track.type,
      amount,
      defenses: track.defenses,
      target: track.target,
      conditional: track.conditional
    });
  }
  return out;
}

/**
 * Bonuses this item grants to defenses. Worn armor contributes an armor bonus
 * to Armor Class. A shield contributes a shield bonus, kept separate from the
 * armor bonus. Magic armor's +1/+2/+3 is an enhancement bonus to Armor Class.
 * A defined item uses the bonus printed for the equipped level.
 * @param {{ level?: number | null, enhancement?: number | null }} item
 * @param {{ listing_fields?: Record<string, string>, body_html?: string }} entry
 * @param {{ kind?: string, acBonus?: number, refBonus?: number } | null} [stats]
 * @returns {Array<{ type: string, defense: 'ac'|'fort'|'ref'|'will', amount: number }>}
 */
export function itemDefenseBonusContributions(item, entry, stats = null) {
  /** @type {Array<{ type: string, defense: 'ac'|'fort'|'ref'|'will', amount: number }>} */
  const out = [];
  const html = entry?.body_html ?? '';
  const level = item?.level ?? levelFromEntry(entry) ?? 1;
  const fromTable = magicTableDefenseBonuses(html, level);
  out.push(...fromTable);
  const covered = new Set(fromTable.map((bonus) => bonus.defense));
  const info = getDefenseEnhancementInfo(entry);
  if (info) {
    const bonus = enhancementFromLevel(level);
    for (const defense of info.defenses) {
      if (!covered.has(defense)) out.push({ type: 'enhancement', defense, amount: bonus });
    }
  }
  for (const row of printedBonusesAtLevel(html, level)) {
    if (row.conditional) continue;
    for (const defense of row.defenses) out.push({ type: row.type, defense, amount: row.amount });
  }
  const magic = Math.max(0, Math.floor(Number(item?.enhancement) || 0));
  if (magic > 0 && stats?.kind === 'armor') out.push({ type: 'enhancement', defense: 'ac', amount: magic });
  if (stats?.kind === 'armor' && Number(stats.acBonus) > 0) {
    out.push({ type: 'armor', defense: 'ac', amount: Number(stats.acBonus) });
  }
  if (stats?.kind === 'shield') {
    if (Number(stats.acBonus) > 0) out.push({ type: 'shield', defense: 'ac', amount: Number(stats.acBonus) });
    if (Number(stats.refBonus) > 0) out.push({ type: 'shield', defense: 'ref', amount: Number(stats.refBonus) });
  }
  return out;
}

/**
 * Instance ids of items that share one named bonus type on the same defense.
 * Untyped bonuses are left out, because those add.
 * @param {Array<{ instanceId: string, defense: string, type?: string, amount: number }>} contributions
 * @returns {Set<string>}
 */
export function overlappingSameTypeBonusInstanceIds(contributions) {
  /** @type {Map<string, Set<string>>} */
  const groups = new Map();
  for (const row of contributions) {
    const amount = Math.max(0, Math.floor(Number(row.amount) || 0));
    const type = String(row.type ?? '');
    if (!row.instanceId || !row.defense || amount <= 0) continue;
    if (!NAMED_DEFENSE_BONUS_TYPES.has(type)) continue;
    const key = `${type}:${row.defense}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(row.instanceId);
  }
  const overlap = new Set();
  for (const ids of groups.values()) {
    if (ids.size < 2) continue;
    for (const id of ids) overlap.add(id);
  }
  return overlap;
}

/**
 * Highest bonus of each named type on each defense. Untyped bonuses are summed.
 * @param {Array<{ defense: string, type?: string, amount: number }>} contributions
 */
export function stackDefenseBonuses(contributions) {
  /** @type {Record<string, { byType: Record<string, number>, untyped: number }>} */
  const out = {
    ac: { byType: {}, untyped: 0 },
    fort: { byType: {}, untyped: 0 },
    ref: { byType: {}, untyped: 0 },
    will: { byType: {}, untyped: 0 }
  };
  for (const row of contributions) {
    const amount = Math.max(0, Math.floor(Number(row.amount) || 0));
    const bucket = out[row.defense];
    if (!bucket || amount <= 0) continue;
    const type = String(row.type ?? 'untyped');
    if (type === 'untyped' || !NAMED_DEFENSE_BONUS_TYPES.has(type)) {
      bucket.untyped += amount;
      continue;
    }
    bucket.byType[type] = Math.max(bucket.byType[type] || 0, amount);
  }
  return out;
}

/**
 * Fixed enhancement bonuses written on an item, for example
 * "+2 enhancement bonus to Fortitude".
 * A level-scaled line such as "Enhancement: Fortitude, Reflex, and Will"
 * has no number here; that bonus comes from the selected item level.
 * @param {string} html
 * @returns {Array<{ defense: 'ac'|'fort'|'ref'|'will', amount: number }>}
 */
export function parseEnhancementDefenseBonuses(html) {
  return parseDefenseBonuses(html)
    .filter((bonus) => bonus.type === 'enhancement')
    .map(({ defense, amount }) => ({ defense, amount }));
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
