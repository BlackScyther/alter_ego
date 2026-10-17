import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import { defenseTotal } from '../src/formulas.js';
import {
  addEquipmentFromCompendium,
  setEquipmentItemLevel,
  setEquipmentItemEnhancement,
  unequipSlot
} from '../src/character/equipment-selections.js';
import { syncEquipmentToSheet } from '../src/character/equipment-sheet-sync.js';
import {
  enhancementFromLevel,
  getDefenseEnhancementInfo,
  getEquipmentStats,
  overlappingSameTypeBonusInstanceIds,
  parseDefenseBonuses,
  parseEnhancementDefenseBonuses,
  isEnhanceableEntry,
  magicDisplayName,
  magicTierForBonus,
  magicTotalCostGp
} from '../src/character/equipment-stats.js';

const scale = { id: 'armor5', category_slug: 'armor', listing_fields: { Name: 'Scale Armor', Type: 'Scale' } };
const shield = { id: 'armor8', category_slug: 'armor', listing_fields: { Name: 'Heavy Shield', Type: 'Heavy Shield' } };
const longsword = { id: 'weapon3610', category_slug: 'weapon', listing_fields: { Name: 'Longsword', Type: 'Heavy blade' } };
const wand = { id: 'implement1', category_slug: 'implement', listing_fields: { Name: 'Wand', Type: 'Wand' } };
const amulet = {
  id: 'item-aop',
  category_slug: 'item',
  listing_fields: { Name: 'Amulet of Protection', Type: 'Neck slot', Level: '1' }
};

const fighterClass = {
  id: 'class3',
  body_html:
    '<blockquote><b>Armor Proficiencies:</b> Cloth, leather, hide, chainmail, scale, plate; light shields, heavy shields.</blockquote>'
};

const compendium = {
  async getEntry(id) {
    const map = {
      armor5: scale,
      armor8: shield,
      weapon3610: longsword,
      implement1: wand,
      class3: fighterClass,
      'item-aop': amulet
    };
    return map[id] ?? null;
  }
};

describe('equipment-sheet-sync', () => {
  it('reads PHB stats from overrides', () => {
    const stats = getEquipmentStats(scale);
    assert.equal(stats?.acBonus, 8);
    assert.equal(stats?.checkPenalty, -1);
  });

  it('infers AC bonus by armor name when no override or inline text', () => {
    const plainChain = {
      id: 'armor999',
      category_slug: 'armor',
      listing_fields: { Name: 'Chainmail', Type: 'Heavy armor' },
      body_html: '<p>Heavy armor with check penalty.</p>'
    };
    const stats = getEquipmentStats(plainChain);
    assert.equal(stats?.kind, 'armor');
    assert.equal(stats?.acBonus, 6);
    assert.equal(stats?.armorCategory, 'chainmail');
  });

  it('applies armor, shield, and weapon to sheet mirror fields', async () => {
    const c = createCharacter({
      selections: { classId: 'class3' },
      abilities: {
        baseScores: { str: 16, con: 14, dex: 12, int: 10, wis: 10, cha: 10 },
        scores: { str: 16, con: 14, dex: 12, int: 10, wis: 10, cha: 10 }
      }
    });

    addEquipmentFromCompendium(c, scale, 'armor');
    addEquipmentFromCompendium(c, shield, 'offHand');
    addEquipmentFromCompendium(c, longsword, 'mainHand');

    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });

    assert.equal(c.sheet.defenses.ac.armor, 10);
    assert.equal(c.sheet.defenses.ref.armor, 1);
    assert.equal(c.sheet.armorPenaltyGlobal, -3);
    assert.equal(c.sheet.speed.armor, 0);
    assert.equal(c.sheet.extraFields['melee-dice'], '1d8');
    assert.equal(c.sheet.extraFields['melee-atk-abil'], 3);
    assert.match(c.sheet.extraFields['basic1-weapon'], /Longsword/);
  });

  it('maps item level to enhancement bonus (+1..+6 in steps of 5)', () => {
    assert.equal(enhancementFromLevel(1), 1);
    assert.equal(enhancementFromLevel(5), 1);
    assert.equal(enhancementFromLevel(6), 2);
    assert.equal(enhancementFromLevel(11), 3);
    assert.equal(enhancementFromLevel(26), 6);
    assert.equal(enhancementFromLevel(30), 6);
    assert.equal(enhancementFromLevel(0), 0);
  });

  it('detects Amulet of Protection as a Fort/Ref/Will enhancement item', () => {
    assert.deepEqual(getDefenseEnhancementInfo(amulet)?.defenses, ['fort', 'ref', 'will']);
    assert.equal(getDefenseEnhancementInfo(longsword), null);
  });

  it('applies Amulet of Protection enhancement to Fort/Ref/Will by item level', async () => {
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, amulet, 'neck');

    function sheetTotal(def) {
      const parts = c.sheet.defenses[def];
      return defenseTotal(c.identity.level, parts);
    }

    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.fort.enh, 1);
    assert.equal(c.sheet.defenses.ref.enh, 1);
    assert.equal(c.sheet.defenses.will.enh, 1);
    assert.equal(c.sheet.defenses.ac.enh ?? 0, 0);
    assert.equal(sheetTotal('fort'), 11);
    assert.equal(sheetTotal('ref'), 11);
    assert.equal(sheetTotal('will'), 11);

    const item = c.selections.equipmentItems[0];
    setEquipmentItemLevel(c, item.instanceId, 11);
    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.fort.enh, 3);
    assert.equal(c.sheet.defenses.ref.enh, 3);
    assert.equal(c.sheet.defenses.will.enh, 3);
    assert.equal(sheetTotal('fort'), 13);
    assert.equal(sheetTotal('ref'), 13);
    assert.equal(sheetTotal('will'), 13);

    unequipSlot(c, 'neck');
    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.fort.enh, 0);
    assert.equal(c.sheet.defenses.ref.enh, 0);
    assert.equal(c.sheet.defenses.will.enh, 0);
    assert.equal(sheetTotal('fort'), 10);
    assert.equal(sheetTotal('ref'), 10);
    assert.equal(sheetTotal('will'), 10);
  });

  it('uses only the selected item level, not every tier on the item', async () => {
    const tiered = {
      ...amulet,
      id: 'item-aop-tiers',
      listing_fields: { ...amulet.listing_fields, Level: '1+,1,6,11,16,21,26' }
    };
    const local = {
      async getEntry(id) {
        if (id === 'item-aop-tiers') return tiered;
        return compendium.getEntry(id);
      }
    };
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, tiered, 'neck');
    setEquipmentItemLevel(c, c.selections.equipmentItems[0].instanceId, 1);
    await syncEquipmentToSheet(c, local, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.fort.enh, 1);
    assert.equal(c.sheet.defenses.ref.enh, 1);
    assert.equal(c.sheet.defenses.will.enh, 1);
  });

  it('keeps only the highest enhancement bonus on each defense', async () => {
    const ring = {
      id: 'item-ring-fort',
      category_slug: 'item',
      listing_fields: { Name: 'Ring of Fortitude', Type: 'Ring' },
      body_html: '<p>Property: You gain a +2 enhancement bonus to Fortitude.</p>'
    };
    const local = {
      async getEntry(id) {
        if (id === 'item-ring-fort') return ring;
        return compendium.getEntry(id);
      }
    };
    assert.deepEqual(parseEnhancementDefenseBonuses(ring.body_html), [{ defense: 'fort', amount: 2 }]);
    assert.deepEqual(parseEnhancementDefenseBonuses('<p>+1 item bonus to Fortitude.</p>'), []);

    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, amulet, 'neck');
    addEquipmentFromCompendium(c, ring, 'ring1');
    await syncEquipmentToSheet(c, local, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.fort.enh, 2);
    assert.equal(c.sheet.defenses.ref.enh, 1);
    assert.equal(c.sheet.defenses.will.enh, 1);

    setEquipmentItemLevel(c, c.selections.equipmentItems[0].instanceId, 11);
    await syncEquipmentToSheet(c, local, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.fort.enh, 3);
    assert.equal(c.sheet.defenses.ref.enh, 3);
    assert.equal(c.sheet.defenses.will.enh, 3);

    const overlap = overlappingSameTypeBonusInstanceIds([
      { instanceId: 'neck', type: 'enhancement', defense: 'fort', amount: 1 },
      { instanceId: 'neck', type: 'enhancement', defense: 'ref', amount: 1 },
      { instanceId: 'neck', type: 'enhancement', defense: 'will', amount: 1 },
      { instanceId: 'ring', type: 'enhancement', defense: 'fort', amount: 2 }
    ]);
    assert.deepEqual([...overlap].sort(), ['neck', 'ring']);
    const differentTypes = overlappingSameTypeBonusInstanceIds([
      { instanceId: 'neck', type: 'enhancement', defense: 'fort', amount: 1 },
      { instanceId: 'ring', type: 'item', defense: 'fort', amount: 2 }
    ]);
    assert.equal(differentTypes.size, 0);
  });

  it('stacks each named bonus type separately and adds untyped bonuses', async () => {
    const ring = {
      id: 'item-ring-types',
      category_slug: 'item',
      listing_fields: { Name: 'Ring of Many Bonuses', Type: 'Ring' },
      body_html:
        '<p>+2 item bonus to Fortitude. +1 circumstance bonus to Reflex. +1 bonus to Will.</p>'
    };
    const cloak = {
      id: 'item-cloak-types',
      category_slug: 'item',
      listing_fields: { Name: 'Cloak of Circumstance', Type: 'Arms slot' },
      body_html: '<p>+2 circumstance bonus to Reflex. +1 defense bonus to Fortitude.</p>'
    };
    const local = {
      async getEntry(id) {
        if (id === 'item-ring-types') return ring;
        if (id === 'item-cloak-types') return cloak;
        return compendium.getEntry(id);
      }
    };
    assert.deepEqual(parseDefenseBonuses(ring.body_html), [
      { type: 'item', defense: 'fort', amount: 2 },
      { type: 'circumstance', defense: 'ref', amount: 1 },
      { type: 'untyped', defense: 'will', amount: 1 }
    ]);

    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, amulet, 'neck');
    addEquipmentFromCompendium(c, ring, 'ring1');
    addEquipmentFromCompendium(c, cloak, 'arms');
    await syncEquipmentToSheet(c, local, { classEntry: fighterClass });

    assert.equal(c.sheet.defenses.fort.enh, 1);
    assert.equal(c.sheet.defenses.fort.misc2, 3);
    assert.equal(c.sheet.defenses.ref.enh, 1);
    assert.equal(c.sheet.defenses.ref.misc2, 2);
    assert.equal(c.sheet.defenses.will.enh, 1);
    assert.equal(c.sheet.defenses.will.misc2, 1);
    assert.equal(defenseTotal(c.identity.level, c.sheet.defenses.fort), 14);
  });

  it('does not add a second armor bonus on top of worn armor', async () => {
    const band = {
      id: 'item-armor-band',
      category_slug: 'item',
      listing_fields: { Name: 'Band of Armor', Type: 'Waist' },
      body_html: '<p>+2 armor bonus to AC.</p>'
    };
    const local = {
      async getEntry(id) {
        if (id === 'item-armor-band') return band;
        return compendium.getEntry(id);
      }
    };
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, scale, 'armor');
    addEquipmentFromCompendium(c, shield, 'offHand');
    addEquipmentFromCompendium(c, band, 'waist');
    await syncEquipmentToSheet(c, local, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.ac.armor, 10);
    assert.equal(c.sheet.defenses.ref.armor, 1);
  });

  it('clears equipment bonuses after unequip', async () => {
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, longsword, 'mainHand');
    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.extraFields['melee-dice'], '1d8');

    const item = c.selections.equipmentItems[0];
    unequipSlot(c, 'mainHand');
    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.ac.armor, 0);
    assert.equal(c.sheet.extraFields['melee-dice'], undefined);
  });

  it('flags base weapons/armor as enhanceable, but not neck items', () => {
    assert.equal(isEnhanceableEntry(longsword), true);
    assert.equal(isEnhanceableEntry(scale), true);
    assert.equal(isEnhanceableEntry(amulet), false);
  });

  it('derives magic display name and looks up tier level/price', () => {
    assert.equal(magicDisplayName('Chainmail', 2), '+2 Chainmail');
    assert.equal(magicDisplayName('Chainmail', 0), 'Chainmail');
    assert.equal(magicDisplayName('Chainmail', null), 'Chainmail');

    assert.equal(magicTierForBonus(1)?.level, 3);
    assert.equal(magicTierForBonus(2)?.level, 11);
    assert.equal(magicTierForBonus(3)?.level, 22);
    assert.equal(magicTierForBonus(4), null);
    assert.equal(magicTierForBonus(0), null);

    const chain = {
      id: 'armor999',
      category_slug: 'armor',
      listing_fields: { Name: 'Chainmail', Type: 'Heavy armor', Cost: '40 gp' }
    };
    const tier = magicTierForBonus(1);
    assert.equal(magicTotalCostGp(chain, 1), 40 + tier.magicCostGp);
    assert.equal(magicTotalCostGp(chain, 0), null);
  });

  it('applies a magic weapon enhancement to attack and damage', async () => {
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, longsword, 'mainHand');
    const item = c.selections.equipmentItems[0];
    setEquipmentItemEnhancement(c, item.instanceId, 2);

    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.extraFields['melee-atk-enh'], 2);
    assert.equal(c.sheet.extraFields['melee-dmg-enh'], 2);

    setEquipmentItemEnhancement(c, item.instanceId, null);
    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.extraFields['melee-atk-enh'], 0);
    assert.equal(c.sheet.extraFields['melee-dmg-enh'], 0);

    unequipSlot(c, 'mainHand');
    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.extraFields['melee-atk-enh'], undefined);
  });

  it('applies a magic armor enhancement to AC enh', async () => {
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, scale, 'armor');
    const item = c.selections.equipmentItems[0];
    setEquipmentItemEnhancement(c, item.instanceId, 3);

    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.ac.enh, 3);
    assert.equal(c.sheet.defenses.ac.armor, 8);

    unequipSlot(c, 'armor');
    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.defenses.ac.enh, 0);
  });

  it('flags implements as enhanceable', () => {
    assert.equal(isEnhanceableEntry(wand), true);
  });

  it('applies a magic implement enhancement to the attack lines and card field', async () => {
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, wand, 'implement');
    const item = c.selections.equipmentItems[0];
    setEquipmentItemEnhancement(c, item.instanceId, 2);

    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    // No weapon equipped: ranged Javelin fallback line carries the implement enh.
    assert.equal(c.sheet.extraFields['implement-enh'], 2);
    assert.equal(c.sheet.extraFields['ranged-atk-enh'], 2);
    assert.equal(c.sheet.extraFields['ranged-dmg-enh'], 2);
    assert.equal(c.sheet.extraFields['weapon-melee-enh'], 0);

    unequipSlot(c, 'implement');
    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.extraFields['implement-enh'], 0);
  });

  it('melee line uses the higher of weapon and implement enhancement', async () => {
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, longsword, 'mainHand');
    addEquipmentFromCompendium(c, wand, 'implement');
    const weaponItem = c.selections.equipmentItems[0];
    const implementItem = c.selections.equipmentItems[1];
    setEquipmentItemEnhancement(c, weaponItem.instanceId, 1);
    setEquipmentItemEnhancement(c, implementItem.instanceId, 3);

    await syncEquipmentToSheet(c, compendium, { classEntry: fighterClass });
    assert.equal(c.sheet.extraFields['melee-atk-enh'], 3);
    assert.equal(c.sheet.extraFields['melee-dmg-enh'], 3);
    assert.equal(c.sheet.extraFields['weapon-melee-enh'], 1);
    assert.equal(c.sheet.extraFields['implement-enh'], 3);
  });

  it('clamps enhancement to the 1..3 range (null when <= 0)', () => {
    const c = createCharacter({ selections: { classId: 'class3' } });
    addEquipmentFromCompendium(c, scale, 'armor');
    const item = c.selections.equipmentItems[0];

    setEquipmentItemEnhancement(c, item.instanceId, 9);
    assert.equal(item.enhancement, 3);
    setEquipmentItemEnhancement(c, item.instanceId, 0);
    assert.equal(item.enhancement, null);
  });
});
