import { addEquipmentFromCompendium } from '../character/equipment-selections.js';

/**
 * Apply reward deltas to a character document (mutates in place).
 * @param {object} character
 * @param {{ xp?: number, goldGp?: number, items?: Array<{ id: string, category_slug?: string, listing_fields?: Record<string, string> }> }} rewards
 */
export function applyRewardsToCharacter(character, rewards) {
  character.identity = character.identity ?? {};
  character.sheet = character.sheet ?? {};
  character.sheet.treasure = character.sheet.treasure ?? { goldGp: 0 };

  const xp = Number(rewards.xp) || 0;
  if (xp > 0) {
    character.identity.totalXp = (Number(character.identity.totalXp) || 0) + xp;
  }

  const gold = Number(rewards.goldGp) || 0;
  if (gold > 0) {
    character.sheet.treasure.goldGp = (Number(character.sheet.treasure.goldGp) || 0) + gold;
  }

  for (const entry of rewards.items ?? []) {
    if (entry?.id) addEquipmentFromCompendium(character, entry);
  }

  return character;
}
