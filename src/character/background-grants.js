/**
 * Powers and feats granted by the selected background.
 * Powers come from `power123` links. Feats come from `feat123` links
 * and "you gain the … feat".
 */

import { normalizePowerType } from '../editor/power-filter.js';
import { resolveFeatMentions } from './feat-grant-scan.js';
import { extractPowerIdsFromItemHtml } from './item-power-grants.js';

/**
 * @param {object} character
 * @param {{ getEntry?: (id: string) => Promise<object | null | undefined> }} compendium
 */
export async function collectBackgroundPowerGrants(character, compendium) {
  const bgId = character?.selections?.backgroundId;
  if (!bgId || !compendium?.getEntry) return [];
  const bgEntry = await compendium.getEntry(bgId);
  /** @type {Array<{ powerId: string, powerName: string, usage: string | null }>} */
  const grants = [];
  const seen = new Set();
  for (const powerId of extractPowerIdsFromItemHtml(bgEntry?.body_html ?? '')) {
    if (seen.has(powerId)) continue;
    seen.add(powerId);
    const entry = await compendium.getEntry(powerId);
    if (entry?.category_slug && entry.category_slug !== 'power') continue;
    grants.push({
      powerId,
      powerName: entry?.listing_fields?.Name || powerId,
      usage: normalizePowerType(entry?.listing_fields?.Type)
    });
  }
  return grants;
}

/**
 * @param {object} character
 * @param {{ getEntry?: (id: string) => Promise<object | null | undefined>, listEntries?: Function }} compendium
 */
export async function collectBackgroundFeatGrants(character, compendium) {
  const bgId = character?.selections?.backgroundId;
  if (!bgId || !compendium?.getEntry) return [];
  const bgEntry = await compendium.getEntry(bgId);
  return resolveFeatMentions(
    bgEntry?.body_html ?? '',
    compendium,
    bgEntry?.listing_fields?.SourceBook
  );
}
