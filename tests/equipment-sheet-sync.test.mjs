import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import { addEquipmentFromCompendium, unequipSlot } from '../src/character/equipment-selections.js';
import { syncEquipmentToSheet } from '../src/character/equipment-sheet-sync.js';
import { getEquipmentStats } from '../src/character/equipment-stats.js';

const scale = { id: 'armor5', category_slug: 'armor', listing_fields: { Name: 'Scale Armor', Type: 'Scale' } };
const shield = { id: 'armor8', category_slug: 'armor', listing_fields: { Name: 'Heavy Shield', Type: 'Heavy Shield' } };
const longsword = { id: 'weapon3610', category_slug: 'weapon', listing_fields: { Name: 'Longsword', Type: 'Heavy blade' } };

const fighterClass = {
  id: 'class3',
  body_html:
    '<blockquote><b>Armor Proficiencies:</b> Cloth, leather, hide, chainmail, scale, plate; light shields, heavy shields.</blockquote>'
};

const compendium = {
  async getEntry(id) {
    const map = { armor5: scale, armor8: shield, weapon3610: longsword, class3: fighterClass };
    return map[id] ?? null;
  }
};

describe('equipment-sheet-sync', () => {
  it('reads PHB stats from overrides', () => {
    const stats = getEquipmentStats(scale);
    assert.equal(stats?.acBonus, 8);
    assert.equal(stats?.checkPenalty, -1);
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
});
