import { applyRewardsToCharacter } from '../src/encounter/rewards.js';
import { getCompendiumEntry } from './compendium.mjs';

export { getCompendiumEntry } from './compendium.mjs';

/**
 * @param {object} character
 * @param {{ xp?: number, goldGp?: number, items?: Array<{ compendiumId: string, categorySlug?: string }> }} body
 */
export function applyRewardsPayload(character, body) {
  const xp = Number(body.xp) || 0;
  const goldGp = Number(body.goldGp) || 0;
  const items = [];

  for (const item of body.items ?? []) {
    const compendiumId = String(item.compendiumId || item.id || '').trim();
    if (!compendiumId) continue;
    const categorySlug = String(item.categorySlug || item.category_slug || 'item');
    const entry = getCompendiumEntry(categorySlug, compendiumId);
    if (!entry) {
      const err = new Error(`Compendium entry not found: ${compendiumId}`);
      err.status = 404;
      throw err;
    }
    items.push(entry);
  }

  if (xp < 0 || goldGp < 0) {
    const err = new Error('xp and goldGp must be zero or positive.');
    err.status = 400;
    throw err;
  }

  if (xp === 0 && goldGp === 0 && !items.length) {
    const err = new Error('At least one reward (xp, goldGp, or items) is required.');
    err.status = 400;
    throw err;
  }

  return applyRewardsToCharacter(character, { xp, goldGp, items });
}
