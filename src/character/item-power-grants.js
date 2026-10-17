/**
 * Powers granted by equipped items. Inventory-only items are ignored.
 * A grant exists when the item body links a power entry (`power123`).
 */

import { normalizePowerType } from '../editor/power-filter.js';
import { EQUIPMENT_SLOTS } from './equipment-selections.js';

const SLOT_LABEL = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot.id, slot.label]));

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractPowerIdsFromItemHtml(html) {
  const ids = new Set();
  const re = /\b(power\d+)\b/gi;
  let match;
  while ((match = re.exec(html ?? '')) !== null) {
    ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

/**
 * Closest usage word before a power id, for items whose linked power has no Type.
 * @param {string} html
 * @param {string} powerId
 * @returns {'At-Will' | 'Encounter' | 'Daily' | 'Utility' | null}
 */
export function usageNearPowerMention(html, powerId) {
  const idx = String(html ?? '').toLowerCase().indexOf(String(powerId).toLowerCase());
  if (idx < 0) return null;
  const slice = String(html)
    .slice(Math.max(0, idx - 180), idx)
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();
  const marks = [
    ['utility', 'Utility'],
    ['at-will', 'At-Will'],
    ['at will', 'At-Will'],
    ['encounter', 'Encounter'],
    ['daily', 'Daily']
  ];
  let best = null;
  let bestAt = -1;
  for (const [needle, type] of marks) {
    const at = slice.lastIndexOf(needle);
    if (at > bestAt) {
      bestAt = at;
      best = type;
    }
  }
  return best;
}

/**
 * @param {object} character
 * @param {{ getEntry: (id: string) => Promise<object | null | undefined> }} compendium
 */
export async function collectEquippedItemPowerGrants(character, compendium) {
  const equipped = (character?.selections?.equipmentItems ?? []).filter(
    (item) => item?.slotId && item?.compendiumId
  );
  /** @type {Map<string, object | null>} */
  const cache = new Map();

  async function entryFor(id) {
    const key = String(id).toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const value = (await compendium.getEntry(id)) ?? null;
    cache.set(key, value);
    return value;
  }

  /** @type {Array<{ itemId: string, itemName: string, slotId: string, slotLabel: string, powerId: string, powerName: string, usage: string | null }>} */
  const grants = [];
  const seen = new Set();

  for (const item of equipped) {
    const itemEntry = await entryFor(item.compendiumId);
    const itemId = String(item.compendiumId).toLowerCase();
    for (const powerId of extractPowerIdsFromItemHtml(itemEntry?.body_html ?? '')) {
      const key = `${item.instanceId ?? itemId}|${powerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const powerEntry = await entryFor(powerId);
      if (powerEntry?.category_slug && powerEntry.category_slug !== 'power') continue;
      const usage =
        normalizePowerType(powerEntry?.listing_fields?.Type) ??
        usageNearPowerMention(itemEntry?.body_html ?? '', powerId);
      grants.push({
        itemId,
        itemName: itemEntry?.listing_fields?.Name || itemId,
        slotId: item.slotId,
        slotLabel: SLOT_LABEL[item.slotId] || item.slotId,
        powerId,
        powerName: powerEntry?.listing_fields?.Name || powerId,
        usage
      });
    }
  }

  return grants;
}
