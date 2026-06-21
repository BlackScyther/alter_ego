/**
 * Equipment inventory, body slots, and equip/unequip helpers.
 */

/** @type {const} */
export const EQUIPMENT_SLOT_GROUP_ORDER = ['Body', 'Weapons', 'Implement', 'Worn'];

/**
 * @typedef {{ id: string, label: string, group: (typeof EQUIPMENT_SLOT_GROUP_ORDER)[number], categories: string[], itemTypeHints?: string[] }} EquipmentSlotDef
 */

/** @type {EquipmentSlotDef[]} */
export const EQUIPMENT_SLOTS = [
  { id: 'armor', label: 'Armor', group: 'Body', categories: ['armor'] },
  { id: 'mainHand', label: 'Main hand', group: 'Weapons', categories: ['weapon'] },
  { id: 'offHand', label: 'Off hand', group: 'Weapons', categories: ['weapon', 'implement'] },
  { id: 'implement', label: 'Implement', group: 'Implement', categories: ['implement'] },
  { id: 'head', label: 'Head', group: 'Worn', categories: ['item'], itemTypeHints: ['Head'] },
  { id: 'neck', label: 'Neck', group: 'Worn', categories: ['item'], itemTypeHints: ['Neck'] },
  { id: 'arms', label: 'Arms', group: 'Worn', categories: ['item'], itemTypeHints: ['Arms'] },
  { id: 'hands', label: 'Hands', group: 'Worn', categories: ['item'], itemTypeHints: ['Hands'] },
  { id: 'waist', label: 'Waist', group: 'Worn', categories: ['item'], itemTypeHints: ['Waist'] },
  { id: 'feet', label: 'Feet', group: 'Worn', categories: ['item'], itemTypeHints: ['Feet'] },
  { id: 'ring1', label: 'Ring 1', group: 'Worn', categories: ['item'], itemTypeHints: ['Ring'] },
  { id: 'ring2', label: 'Ring 2', group: 'Worn', categories: ['item'], itemTypeHints: ['Ring'] }
];

/** @type {Record<string, EquipmentSlotDef>} */
const SLOT_BY_ID = Object.fromEntries(EQUIPMENT_SLOTS.map((s) => [s.id, s]));

/**
 * Maps a normalized `item.slot` value (from tools/normalize) to the equip slot
 * ids. Rings can go in either ring slot.
 * @type {Record<string, string[]>}
 */
const SLOT_IDS_BY_NORMALIZED = {
  head: ['head'],
  neck: ['neck'],
  arms: ['arms'],
  hands: ['hands'],
  waist: ['waist'],
  feet: ['feet'],
  ring: ['ring1', 'ring2']
};

const ITEM_TYPE_SLOT_PATTERNS = [
  { slotIds: ['head'], patterns: [/^head\b/i, /head slot/i] },
  { slotIds: ['neck'], patterns: [/^neck\b/i, /neck slot/i, /\bamulet\b/i] },
  { slotIds: ['arms'], patterns: [/^arms\b/i, /arms slot/i, /\bbracers?\b/i] },
  { slotIds: ['hands'], patterns: [/^hands\b/i, /hands slot/i, /\bgloves?\b/i, /\bgauntlets?\b/i] },
  { slotIds: ['waist'], patterns: [/^waist\b/i, /waist slot/i, /\bbelt\b/i] },
  { slotIds: ['feet'], patterns: [/^feet\b/i, /feet slot/i, /\bboots?\b/i] },
  { slotIds: ['ring1', 'ring2'], patterns: [/^ring\b/i, /ring slot/i] }
];

/**
 * @typedef {{ instanceId: string, compendiumId: string, categorySlug: string, slotId: string | null, level?: number | null, enhancement?: number | null }} EquipmentItem
 */

/**
 * @param {string} compendiumId
 * @returns {string}
 */
export function categorySlugFromCompendiumId(compendiumId) {
  const id = String(compendiumId ?? '');
  if (id.startsWith('weapon')) return 'weapon';
  if (id.startsWith('armor')) return 'armor';
  if (id.startsWith('implement')) return 'implement';
  if (id.startsWith('item')) return 'item';
  return 'item';
}

/**
 * @param {import('./model.js').Character} character
 */
export function ensureEquipmentSelectionsShape(character) {
  character.selections = character.selections ?? {};
  if (!Array.isArray(character.selections.equipmentIds)) {
    character.selections.equipmentIds = [];
  }
  if (!Array.isArray(character.selections.equipmentItems)) {
    character.selections.equipmentItems = [];
  }
  character.sheet = character.sheet ?? {};
  if (!character.sheet.treasure || typeof character.sheet.treasure !== 'object') {
    character.sheet.treasure = { goldGp: 0 };
  }
  if (character.sheet.treasure.goldGp == null) {
    character.sheet.treasure.goldGp = 0;
  }
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function migrateEquipmentIdsToItems(character) {
  ensureEquipmentSelectionsShape(character);
  const items = character.selections.equipmentItems;
  if (items.length) return character;

  const ids = character.selections.equipmentIds ?? [];
  if (!ids.length) return character;

  character.selections.equipmentItems = ids.map((compendiumId) => ({
    instanceId: crypto.randomUUID(),
    compendiumId,
    categorySlug: categorySlugFromCompendiumId(compendiumId),
    slotId: null,
    level: null,
    enhancement: null
  }));
  return character;
}

/**
 * @param {import('./model.js').Character} character
 */
export function syncEquipmentIds(character) {
  ensureEquipmentSelectionsShape(character);
  const seen = new Set();
  character.selections.equipmentIds = (character.selections.equipmentItems ?? [])
    .map((item) => item.compendiumId)
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  return character;
}

/**
 * Remove all inventory and equipped items (does not change gold).
 * @param {import('./model.js').Character} character
 */
export function clearAllEquipment(character) {
  ensureEquipmentSelectionsShape(character);
  character.selections.equipmentItems = [];
  syncEquipmentIds(character);
  return character;
}

/**
 * @param {{ category_slug?: string, id?: string, listing_fields?: Record<string, string> }} entry
 * @returns {string[]}
 */
export function getEligibleSlotsForEntry(entry) {
  const category = entry.category_slug ?? categorySlugFromCompendiumId(entry.id ?? '');
  const type = entry.listing_fields?.Type ?? '';
  const name = entry.listing_fields?.Name ?? '';

  if (category === 'armor') {
    if (/shield/i.test(type)) return ['offHand'];
    return ['armor'];
  }
  if (category === 'weapon') return ['mainHand', 'offHand'];
  if (category === 'implement') return ['implement', 'offHand'];

  if (category === 'item') {
    // Authoritative slot from the normalized `item` table (derived once from
    // the item body's "<X> Slot" line). Covers wondrous items whose `Type` is
    // empty and whose name carries no slot cue (cloak, periapt, medallion, …).
    const normalizedSlot = entry.slot ?? entry.normalizedSlot ?? null;
    if (normalizedSlot && SLOT_IDS_BY_NORMALIZED[normalizedSlot]) {
      return [...SLOT_IDS_BY_NORMALIZED[normalizedSlot]];
    }

    const slots = new Set();
    // Fallback when no normalized slot is present: match on the item name/type
    // (e.g. "Amulet of Protection" → neck, "Bracers …" → arms).
    for (const { slotIds, patterns } of ITEM_TYPE_SLOT_PATTERNS) {
      if (patterns.some((re) => re.test(type) || re.test(name))) {
        for (const slotId of slotIds) slots.add(slotId);
      }
    }
    for (const slot of EQUIPMENT_SLOTS) {
      if (!slot.itemTypeHints?.length) continue;
      if (
        slot.itemTypeHints.some((hint) => {
          const re = new RegExp(`\\b${hint}\\b`, 'i');
          return re.test(type) || re.test(name);
        })
      ) {
        slots.add(slot.id);
      }
    }
    return [...slots];
  }

  return [];
}

/**
 * @param {string} slotId
 * @param {{ category_slug?: string, id?: string, listing_fields?: Record<string, string> }} entry
 */
export function isEntryEligibleForSlot(slotId, entry) {
  return getEligibleSlotsForEntry(entry).includes(slotId);
}

/**
 * @param {import('./model.js').Character} character
 * @returns {EquipmentItem[]}
 */
export function getInventoryItems(character) {
  ensureEquipmentSelectionsShape(character);
  return (character.selections.equipmentItems ?? []).filter((item) => !item.slotId);
}

/**
 * @param {import('./model.js').Character} character
 * @returns {Record<string, EquipmentItem | null>}
 */
export function getEquippedBySlot(character) {
  ensureEquipmentSelectionsShape(character);
  /** @type {Record<string, EquipmentItem | null>} */
  const map = {};
  for (const slot of EQUIPMENT_SLOTS) {
    map[slot.id] = null;
  }
  for (const item of character.selections.equipmentItems ?? []) {
    if (item.slotId && map[item.slotId] !== undefined) {
      map[item.slotId] = item;
    }
  }
  return map;
}

/**
 * @param {import('./model.js').Character} character
 * @param {string} instanceId
 * @returns {EquipmentItem | null}
 */
export function findEquipmentItem(character, instanceId) {
  ensureEquipmentSelectionsShape(character);
  return (character.selections.equipmentItems ?? []).find((item) => item.instanceId === instanceId) ?? null;
}

/**
 * Set the item level for a specific equipment instance (used by level-scaled
 * magic items such as Amulet of Protection). Pass null to clear.
 * @param {import('./model.js').Character} character
 * @param {string} instanceId
 * @param {number | null} level
 */
export function setEquipmentItemLevel(character, instanceId, level) {
  const item = findEquipmentItem(character, instanceId);
  if (!item) return character;
  if (level == null || Number.isNaN(Number(level))) {
    item.level = null;
  } else {
    item.level = Math.min(30, Math.max(1, Math.floor(Number(level))));
  }
  return character;
}

/**
 * Set the magic enhancement bonus (+1/+2/+3) for a specific equipment instance
 * (used by base weapons/armor turned magic). Pass null or 0 to make it mundane.
 * @param {import('./model.js').Character} character
 * @param {string} instanceId
 * @param {number | null} bonus
 */
export function setEquipmentItemEnhancement(character, instanceId, bonus) {
  const item = findEquipmentItem(character, instanceId);
  if (!item) return character;
  const n = Math.floor(Number(bonus));
  if (!Number.isFinite(n) || n <= 0) {
    item.enhancement = null;
  } else {
    item.enhancement = Math.min(3, Math.max(1, n));
  }
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {{ id: string, category_slug?: string, listing_fields?: Record<string, string> }} entry
 * @param {string | null} [slotId]
 */
export function addEquipmentFromCompendium(character, entry, slotId = null) {
  ensureEquipmentSelectionsShape(character);
  const categorySlug = entry.category_slug ?? categorySlugFromCompendiumId(entry.id);
  const item = {
    instanceId: crypto.randomUUID(),
    compendiumId: entry.id,
    categorySlug,
    slotId: null,
    level: null,
    enhancement: null
  };
  character.selections.equipmentItems.push(item);

  if (slotId && isEntryEligibleForSlot(slotId, entry)) {
    equipItem(character, item.instanceId, slotId);
  } else {
    syncEquipmentIds(character);
  }
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {string} instanceId
 * @param {string} slotId
 */
export function equipItem(character, instanceId, slotId) {
  ensureEquipmentSelectionsShape(character);
  if (!SLOT_BY_ID[slotId]) return character;

  const item = findEquipmentItem(character, instanceId);
  if (!item) return character;

  const equipped = getEquippedBySlot(character);
  const occupant = equipped[slotId];
  if (occupant && occupant.instanceId !== instanceId) {
    occupant.slotId = null;
  }

  if (item.slotId && item.slotId !== slotId) {
    item.slotId = null;
  }

  item.slotId = slotId;
  syncEquipmentIds(character);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {string} slotId
 */
export function unequipSlot(character, slotId) {
  ensureEquipmentSelectionsShape(character);
  const item = findEquipmentItem(character, getEquippedBySlot(character)[slotId]?.instanceId ?? '');
  if (item) item.slotId = null;
  syncEquipmentIds(character);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {string} instanceId
 */
export function removeInventoryItem(character, instanceId) {
  ensureEquipmentSelectionsShape(character);
  const item = findEquipmentItem(character, instanceId);
  if (!item || item.slotId) return character;
  character.selections.equipmentItems = character.selections.equipmentItems.filter(
    (i) => i.instanceId !== instanceId
  );
  syncEquipmentIds(character);
  return character;
}

/**
 * @param {import('./model.js').Character} character
 * @param {{ category_slug?: string, id?: string, listing_fields?: Record<string, string> }} entry
 * @returns {string | null}
 */
export function getFirstEmptyEligibleSlot(character, entry) {
  const eligible = getEligibleSlotsForEntry(entry);
  const equipped = getEquippedBySlot(character);
  for (const slotId of eligible) {
    if (!equipped[slotId]) return slotId;
  }
  return eligible[0] ?? null;
}

/**
 * @param {EquipmentSlotDef[]} slots
 * @returns {Record<(typeof EQUIPMENT_SLOT_GROUP_ORDER)[number], EquipmentSlotDef[]>}
 */
export function groupEquipmentSlotsByGroup(slots = EQUIPMENT_SLOTS) {
  /** @type {Record<(typeof EQUIPMENT_SLOT_GROUP_ORDER)[number], EquipmentSlotDef[]>} */
  const groups = {
    Body: [],
    Weapons: [],
    Implement: [],
    Worn: []
  };
  for (const slot of slots) {
    groups[slot.group]?.push(slot);
  }
  return groups;
}

/**
 * @param {import('./model.js').Character} character
 * @returns {string[]}
 */
export function validateEquipmentStep(character) {
  ensureEquipmentSelectionsShape(character);
  return [];
}
