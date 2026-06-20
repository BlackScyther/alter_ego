import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  addEquipmentFromCompendium,
  equipItem,
  unequipSlot,
  removeInventoryItem,
  getInventoryItems,
  getEquippedBySlot,
  getEligibleSlotsForEntry,
  migrateEquipmentIdsToItems,
  syncEquipmentIds,
  validateEquipmentStep
} from '../src/character/equipment-selections.js';

const longsword = { id: 'weapon1', category_slug: 'weapon', listing_fields: { Name: 'Longsword', Type: 'Heavy blade' } };
const chainmail = { id: 'armor1', category_slug: 'armor', listing_fields: { Name: 'Chainmail', Type: 'Heavy armor' } };
const heavyShield = { id: 'armor8', category_slug: 'armor', listing_fields: { Name: 'Heavy Shield', Type: 'Heavy Shield' } };
const cloak = { id: 'item2', category_slug: 'item', listing_fields: { Name: 'Cloak', Type: 'Neck slot item' } };
const rope = { id: 'item1', category_slug: 'item', listing_fields: { Name: 'Rope', Type: 'Adventuring Gear' } };
// Magic items often have no slot in their Type field; the slot must be inferred from the name.
const amulet = { id: 'item3', category_slug: 'item', listing_fields: { Name: 'Amulet of Protection', Type: '' } };

describe('equipment-selections', () => {
  it('migrates legacy equipmentIds to equipmentItems', () => {
    const c = createCharacter({ selections: { equipmentIds: ['weapon1', 'armor1'] } });
    migrateEquipmentIdsToItems(c);
    assert.equal(c.selections.equipmentItems.length, 2);
    assert.equal(c.selections.equipmentItems[0].compendiumId, 'weapon1');
    assert.equal(c.selections.equipmentItems[0].slotId, null);
  });

  it('adds compendium entry to inventory', () => {
    const c = createCharacter();
    addEquipmentFromCompendium(c, longsword);
    assert.equal(getInventoryItems(c).length, 1);
    assert.equal(c.selections.equipmentIds.length, 1);
  });

  it('equips weapon to main hand', () => {
    const c = createCharacter();
    addEquipmentFromCompendium(c, longsword);
    const item = getInventoryItems(c)[0];
    equipItem(c, item.instanceId, 'mainHand');
    assert.equal(getInventoryItems(c).length, 0);
    assert.equal(getEquippedBySlot(c).mainHand?.compendiumId, 'weapon1');
  });

  it('unequips item back to inventory', () => {
    const c = createCharacter();
    addEquipmentFromCompendium(c, longsword, 'mainHand');
    unequipSlot(c, 'mainHand');
    assert.equal(getInventoryItems(c).length, 1);
    assert.equal(getEquippedBySlot(c).mainHand, null);
  });

  it('swaps when equipping into occupied slot', () => {
    const c = createCharacter();
    addEquipmentFromCompendium(c, longsword, 'mainHand');
    addEquipmentFromCompendium(c, { id: 'weapon2', category_slug: 'weapon', listing_fields: { Name: 'Crossbow' } });
    const crossbow = getInventoryItems(c)[0];
    equipItem(c, crossbow.instanceId, 'mainHand');
    assert.equal(getEquippedBySlot(c).mainHand?.compendiumId, 'weapon2');
    assert.equal(getInventoryItems(c).length, 1);
    assert.equal(getInventoryItems(c)[0].compendiumId, 'weapon1');
  });

  it('removes unequipped inventory item', () => {
    const c = createCharacter();
    addEquipmentFromCompendium(c, rope);
    const item = getInventoryItems(c)[0];
    removeInventoryItem(c, item.instanceId);
    assert.equal(getInventoryItems(c).length, 0);
    assert.equal(c.selections.equipmentIds.length, 0);
  });

  it('resolves slot eligibility by category and item type', () => {
    assert.deepEqual(getEligibleSlotsForEntry(longsword), ['mainHand', 'offHand']);
    assert.deepEqual(getEligibleSlotsForEntry(chainmail), ['armor']);
    assert.deepEqual(getEligibleSlotsForEntry(heavyShield), ['offHand']);
    assert.deepEqual(getEligibleSlotsForEntry(cloak), ['neck']);
    assert.deepEqual(getEligibleSlotsForEntry(amulet), ['neck']);
    assert.deepEqual(getEligibleSlotsForEntry(rope), []);
  });

  it('syncs equipmentIds without duplicates', () => {
    const c = createCharacter();
    addEquipmentFromCompendium(c, longsword);
    addEquipmentFromCompendium(c, longsword);
    syncEquipmentIds(c);
    assert.deepEqual(c.selections.equipmentIds, ['weapon1']);
  });

  it('validateEquipmentStep is permissive', () => {
    const c = createCharacter();
    assert.deepEqual(validateEquipmentStep(c), []);
  });
});
