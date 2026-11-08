/**
 * Feats granted by inventory items, equipped or not.
 * A grant is a `feat123` link or a "you gain the … feat" line in the item body.
 */

import { resolveFeatMentions } from './feat-grant-scan.js';

/**
 * @param {object} character
 * @param {{ getEntry: (id: string) => Promise<object | null | undefined>, listEntries?: Function }} compendium
 */
export async function collectItemFeatGrants(character, compendium) {
  const owned = (character?.selections?.equipmentItems ?? []).filter((item) => item?.compendiumId);
  /** @type {Map<string, object | null>} */
  const cache = new Map();

  async function entryFor(id) {
    const key = String(id).toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const value = (await compendium.getEntry(id)) ?? null;
    cache.set(key, value);
    return value;
  }

  /** @type {Array<{ itemId: string, itemName: string, featId: string, featName: string }>} */
  const grants = [];
  const seen = new Set();

  for (const item of owned) {
    const itemEntry = await entryFor(item.compendiumId);
    const itemId = String(item.compendiumId).toLowerCase();
    const itemName = itemEntry?.listing_fields?.Name || itemId;
    const feats = await resolveFeatMentions(
      itemEntry?.body_html ?? '',
      compendium,
      itemEntry?.listing_fields?.SourceBook
    );
    for (const feat of feats) {
      const key = `${item.instanceId ?? itemId}|${feat.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      grants.push({
        itemId,
        itemName,
        featId: feat.id,
        featName: feat.name
      });
    }
  }

  return grants;
}
