/**
 * Power eligibility from compendium listing_fields (ClassName, Level, Type).
 */

import { filterEntriesBySearch, COMPENDIUM_SEARCH_MIN } from './picker/combobox-picker.js';
import { buildPowerEligibilityContext, powerPassesPrerequisites } from './power-prerequisite.js';

export { buildPowerEligibilityContext };

/** @typedef {import('../character/power-selections.js').PowerType} PowerType */
/** @typedef {import('../character/power-selections.js').PowerSlot} PowerSlot */

/**
 * @param {string} raw
 * @returns {PowerType | null}
 */
export function normalizePowerType(raw) {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.includes('at-will') || t === 'at will' || t === 'atwill') return 'At-Will';
  if (t.includes('encounter')) return 'Encounter';
  if (t.includes('daily')) return 'Daily';
  if (t.includes('utility')) return 'Utility';
  return null;
}

/**
 * @param {string} powerClassName
 * @param {string} characterClassName
 */
export function classNameMatches(powerClassName, characterClassName) {
  const power = String(powerClassName ?? '').trim();
  const chosen = String(characterClassName ?? '').trim();
  if (!chosen) return false;
  if (!power) return false;

  const chosenLower = chosen.toLowerCase();
  const segments = power
    .split(/[/|]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (segments.length > 1) {
    return segments.some((seg) => seg === chosenLower || chosenLower.includes(seg) || seg.includes(chosenLower));
  }

  const powerLower = power.toLowerCase();
  return powerLower === chosenLower || powerLower.includes(chosenLower) || chosenLower.includes(powerLower);
}

/**
 * @param {Record<string, string> | undefined} fields
 * @param {PowerSlot} slot
 * @param {{ className: string, characterLevel: number }} ctx
 * @param {{ skipClass?: boolean, skipLevel?: boolean, retrain?: boolean }} [opts]
 */
export function powerMatchesSlot(fields, slot, ctx, opts = {}) {
  const type = normalizePowerType(fields?.Type);
  if (type !== slot.powerType) return false;

  const powerLevel = parseInt(String(fields?.Level ?? ''), 10);
  if (Number.isNaN(powerLevel)) return false;

  if (!opts.skipLevel) {
    if (opts.retrain) {
      if (powerLevel > ctx.characterLevel) return false;
    } else if (powerLevel !== slot.slotLevel) {
      return false;
    }
  }

  if (ctx.characterLevel < slot.slotLevel) return false;

  if (!opts.skipClass && !classNameMatches(fields?.ClassName, ctx.className)) {
    return false;
  }

  return true;
}

/**
 * @param {{ listing_fields?: Record<string, string>, body_html?: string }} entry
 * @param {object} ctx
 * @param {PowerSlot} slot
 * @param {{ showAll?: boolean, retrain?: boolean, enforcePrerequisites?: boolean }} [opts]
 */
export function powerPassesFilter(entry, ctx, slot, opts = {}) {
  const showAll = !!opts.showAll;
  const retrain = !!opts.retrain;
  const enforcePrerequisites = opts.enforcePrerequisites !== false && !showAll;

  if (
    !powerMatchesSlot(entry.listing_fields, slot, ctx, {
      skipClass: showAll,
      skipLevel: showAll,
      retrain
    })
  ) {
    return false;
  }

  if (enforcePrerequisites && !powerPassesPrerequisites(entry, ctx, slot)) {
    return false;
  }

  return true;
}

/**
 * @param {Array<{ id: string, listing_fields?: Record<string, string>, body_html?: string }>} entries
 * @param {object} ctx
 * @param {PowerSlot} slot
 * @param {{ showAll?: boolean, retrain?: boolean, enforcePrerequisites?: boolean, excludeIds?: Set<string> | string[], query?: string }} opts
 */
export function filterPowerEntries(entries, ctx, slot, opts = {}) {
  const exclude = opts.excludeIds instanceof Set ? opts.excludeIds : new Set(opts.excludeIds ?? []);
  const q = (opts.query ?? '').trim();

  let list = entries.filter((e) => {
    if (exclude.has(e.id)) return false;
    return powerPassesFilter(e, ctx, slot, opts);
  });

  if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
    list = filterEntriesBySearch(list, q);
  }

  list.sort((a, b) => {
    const an = a.listing_fields?.Name ?? a.id;
    const bn = b.listing_fields?.Name ?? b.id;
    return an.localeCompare(bn, undefined, { sensitivity: 'base' });
  });

  return list;
}

/**
 * @param {Record<string, string> | undefined} fields
 */
export function formatPowerListingMeta(fields) {
  const parts = [];
  if (fields?.Level) parts.push(`Lv ${fields.Level}`);
  if (fields?.Type) parts.push(fields.Type);
  if (fields?.Action) parts.push(fields.Action);
  if (fields?.SourceBook) parts.push(fields.SourceBook);
  return parts.join(' · ');
}

/**
 * SQL LIKE patterns for compendium Type column (At-Will variants).
 * @param {PowerType} powerType
 * @returns {string[]}
 */
export function powerTypeLikePatterns(powerType) {
  switch (powerType) {
    case 'At-Will':
      return ['%at-will%', '%at will%', '%atwill%'];
    case 'Encounter':
      return ['%encounter%'];
    case 'Daily':
      return ['%daily%'];
    case 'Utility':
      return ['%utility%'];
    default:
      return [];
  }
}
