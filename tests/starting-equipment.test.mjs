import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  shouldSeedStartingEquipment,
  resolveStartingKit,
  maybeSeedStartingEquipment,
  getRecommendedStartingKitMeta,
  applyStartingKit
} from '../src/character/starting-equipment.js';
import {
  clearAllEquipment,
  getEquippedBySlot,
  getInventoryItems
} from '../src/character/equipment-selections.js';

const fighterClass = {
  id: 'class3',
  category_slug: 'class',
  listing_fields: { Name: 'Fighter (Weaponmaster)' },
  body_html:
    '<blockquote><b>Armor Proficiencies:</b> Cloth, leather, hide, chainmail, scale, plate; light shields, heavy shields.</blockquote>'
};

const entries = {
  armor5: { id: 'armor5', category_slug: 'armor', listing_fields: { Name: 'Scale Armor', Type: 'Scale' } },
  armor8: { id: 'armor8', category_slug: 'armor', listing_fields: { Name: 'Heavy Shield', Type: 'Heavy Shield' } },
  weapon3610: { id: 'weapon3610', category_slug: 'weapon', listing_fields: { Name: 'Longsword', Type: 'Heavy blade' } },
  weapon3612: { id: 'weapon3612', category_slug: 'weapon', listing_fields: { Name: 'Greataxe', Type: 'Axe' } },
  item166: { id: 'item166', category_slug: 'item', listing_fields: { Name: "Adventurer's Kit", Type: 'Adventuring Gear' } },
  weapon3595: { id: 'weapon3595', category_slug: 'weapon', listing_fields: { Name: 'Javelin', Type: 'Spear' } },
  weapon3628: { id: 'weapon3628', category_slug: 'weapon', listing_fields: { Name: 'Sling', Type: 'Sling' } }
};

const compendium = {
  async getEntry(id) {
    if (id === 'class3') return fighterClass;
    return entries[id] ?? null;
  }
};

describe('starting-equipment', () => {
  it('resolves guardian fighter kit by build option', () => {
    const c = createCharacter({
      identity: { class: 'Fighter (Weaponmaster)', level: 1 },
      selections: {
        classId: 'class3',
        classBuildChoices: { build: 'guardian-fighter' }
      }
    });
    const kit = resolveStartingKit(c);
    assert.equal(kit?.label, 'Guardian Fighter');
    assert.equal(kit.equipped.some((r) => r.compendiumId === 'armor8'), true);
  });

  it('seeds only during create mode for new level-1 characters', async () => {
    const c = createCharacter({
      identity: { class: 'Fighter (Weaponmaster)', level: 1 },
      selections: {
        classId: 'class3',
        classBuildChoices: { build: 'great-weapon-fighter' }
      },
      abilities: {
        baseScores: { str: 16, con: 14, dex: 12, int: 10, wis: 10, cha: 10 },
        scores: { str: 16, con: 14, dex: 12, int: 10, wis: 10, cha: 10 }
      }
    });

    assert.equal(shouldSeedStartingEquipment(c, { builderMode: 'full' }), false);
    assert.equal(shouldSeedStartingEquipment(c, { builderMode: 'create' }), true);

    const seeded = await maybeSeedStartingEquipment(c, compendium, { builderMode: 'create' });
    assert.equal(seeded, true);
    assert.equal(c.builderFlags.startingEquipmentSeeded, true);
    assert.equal(c.sheet.treasure.goldGp, 3);
    assert.equal(getEquippedBySlot(c).armor?.compendiumId, 'armor5');
    assert.equal(getEquippedBySlot(c).mainHand?.compendiumId, 'weapon3612');
    assert.equal(getInventoryItems(c).length, 6);
    assert.equal(c.sheet.defenses.ac.armor, 8);
    assert.equal(c.sheet.extraFields['melee-dice'], '1d12');
    assert.equal(c.sheet.extraFields['melee-atk-prof'], 3);

    const again = await maybeSeedStartingEquipment(c, compendium, { builderMode: 'create' });
    assert.equal(again, false);
  });

  it('does not seed when inventory already has items', () => {
    const c = createCharacter({
      selections: { classId: 'class3', equipmentItems: [{ instanceId: 'x', compendiumId: 'weapon1', categorySlug: 'weapon', slotId: null }] }
    });
    assert.equal(shouldSeedStartingEquipment(c, { builderMode: 'create' }), false);
  });

  it('getRecommendedStartingKitMeta returns build label and availability', () => {
    const guardian = createCharacter({
      identity: { class: 'Fighter (Weaponmaster)', level: 1 },
      selections: {
        classId: 'class3',
        classBuildChoices: { build: 'guardian-fighter' }
      }
    });
    const guardianMeta = getRecommendedStartingKitMeta(guardian);
    assert.equal(guardianMeta.available, true);
    assert.equal(guardianMeta.buildLabel, 'Guardian Fighter');

    const greatWeapon = createCharacter({
      identity: { class: 'Fighter (Weaponmaster)', level: 1 },
      selections: {
        classId: 'class3',
        classBuildChoices: { build: 'great-weapon-fighter' }
      }
    });
    const greatMeta = getRecommendedStartingKitMeta(greatWeapon);
    assert.equal(greatMeta.buildLabel, 'Great Weapon Fighter');

    const noKit = createCharacter({
      selections: { classId: 'class999' }
    });
    const noMeta = getRecommendedStartingKitMeta(noKit);
    assert.equal(noMeta.available, false);
    assert.equal(noMeta.kit, null);
  });

  it('clearAllEquipment empties items without breaking shape', () => {
    const c = createCharacter({
      selections: {
        classId: 'class3',
        equipmentItems: [
          { instanceId: 'a', compendiumId: 'weapon3612', categorySlug: 'weapon', slotId: 'mainHand' },
          { instanceId: 'b', compendiumId: 'item166', categorySlug: 'item', slotId: null }
        ],
        equipmentIds: ['weapon3612', 'item166']
      },
      sheet: { treasure: { goldGp: 50 } }
    });
    clearAllEquipment(c);
    assert.equal(c.selections.equipmentItems.length, 0);
    assert.equal(Object.values(getEquippedBySlot(c)).filter(Boolean).length, 0);
    assert.equal(c.selections.equipmentIds.length, 0);
    assert.equal(c.sheet.treasure.goldGp, 50);
  });

  it('applyStartingKit with force clears prior gear and re-applies kit', async () => {
    const c = createCharacter({
      identity: { class: 'Fighter (Weaponmaster)', level: 1 },
      selections: {
        classId: 'class3',
        classBuildChoices: { build: 'guardian-fighter' },
        equipmentItems: [
          { instanceId: 'old', compendiumId: 'weapon3612', categorySlug: 'weapon', slotId: 'mainHand' }
        ]
      },
      abilities: {
        baseScores: { str: 16, con: 14, dex: 12, int: 10, wis: 10, cha: 10 },
        scores: { str: 16, con: 14, dex: 12, int: 10, wis: 10, cha: 10 }
      },
      sheet: { treasure: { goldGp: 99 } },
      builderFlags: { startingEquipmentSeeded: true }
    });

    const result = await applyStartingKit(c, compendium, { force: true });
    assert.equal(result.applied, true);
    assert.equal(result.missingIds.length, 0);
    assert.equal(c.sheet.treasure.goldGp, 3);
    assert.equal(getEquippedBySlot(c).armor?.compendiumId, 'armor5');
    assert.equal(getEquippedBySlot(c).offHand?.compendiumId, 'armor8');
    assert.equal(getEquippedBySlot(c).mainHand?.compendiumId, 'weapon3610');
    assert.equal(getInventoryItems(c).length, 6);
    assert.equal(c.sheet.defenses.ac.armor, 10);
    assert.equal(c.sheet.extraFields['melee-dice'], '1d8');
    assert.equal(c.sheet.extraFields['melee-atk-prof'], 3);
  });
});
