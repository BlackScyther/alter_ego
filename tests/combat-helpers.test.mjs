import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import { createActorDocument } from '../src/character/actor-spawn.js';
import {
  staticInitiative,
  totalInitiative,
  sortCombatants,
  applyInitiativeRoll,
  usesPrintedInitiativeBonus,
  usesPrintedDefenses,
  defenseTotals
} from '../src/encounter/combat-helpers.js';

describe('combat-helpers', () => {
  it('staticInitiative for PC uses Dex + half level + misc', () => {
    const pc = createActorDocument({
      identity: { level: 1 },
      abilities: { scores: { dex: 14 } },
      sheet: { initMisc: 2, derivedBonuses: { initiative: 0 } },
      meta: { actorKind: 'pc' }
    });
    assert.equal(staticInitiative(pc), 4); // +2 dex, +0 half, +2 misc
    assert.equal(usesPrintedInitiativeBonus(pc), false);
  });

  it('staticInitiative for compendium monster uses printed bonus', () => {
    const monster = createActorDocument({
      sheet: { initMisc: 7 },
      meta: { actorKind: 'monster', templateCompendiumId: 'monster_goblin', source: 'compendium-spawn' }
    });
    assert.equal(staticInitiative(monster), 7);
    assert.equal(usesPrintedInitiativeBonus(monster), true);
  });

  it('totalInitiative = roll + static', () => {
    const pc = createCharacter({
      abilities: { scores: { dex: 10 } },
      identity: { level: 1 },
      sheet: { initMisc: 0, combat: { initiativeRoll: 12, initiative: 13 } }
    });
    assert.equal(totalInitiative(pc), 13);
  });

  it('applyInitiativeRoll computes total from static', () => {
    const monster = createActorDocument({
      sheet: { initMisc: 5 },
      meta: { templateCompendiumId: 'm1', actorKind: 'monster' }
    });
    applyInitiativeRoll(monster, 15);
    assert.equal(monster.sheet.combat.initiativeRoll, 15);
    assert.equal(monster.sheet.combat.initiative, 20);
  });

  it('sortCombatants breaks ties by higher static initiative', () => {
    const a = {
      character: createActorDocument({
        identity: { characterName: 'Alpha' },
        sheet: { initMisc: 3, combat: { initiative: 18, initiativeRoll: 15 } },
        meta: { templateCompendiumId: 'm1' }
      })
    };
    const b = {
      character: createActorDocument({
        identity: { characterName: 'Beta' },
        sheet: { initMisc: 7, combat: { initiative: 18, initiativeRoll: 11 } },
        meta: { templateCompendiumId: 'm2' }
      })
    };
    const sorted = sortCombatants([a, b]);
    assert.equal(sorted[0].character.identity.characterName, 'Beta');
  });

  it('sortCombatants orders by total initiative descending', () => {
    const low = {
      character: createCharacter({
        identity: { characterName: 'Low' },
        sheet: { combat: { initiative: 10 } }
      })
    };
    const high = {
      character: createCharacter({
        identity: { characterName: 'High' },
        sheet: { combat: { initiative: 22 } }
      })
    };
    const sorted = sortCombatants([low, high]);
    assert.equal(sorted[0].character.identity.characterName, 'High');
  });

  it('defenseTotals for compendium spawn uses printed defenses without 10+halfLevel', () => {
    const monster = createActorDocument({
      identity: { level: 5 },
      sheet: {
        defenses: {
          ac: { abil: 0, class: 19, feat: 0, enh: 0, misc: 0, armor: 0 },
          fort: { abil: 0, class: 17, feat: 0, enh: 0, misc: 0 },
          ref: { abil: 0, class: 16, feat: 0, enh: 0, misc: 0 },
          will: { abil: 0, class: 14, feat: 0, enh: 0, misc: 0 }
        }
      },
      meta: { templateCompendiumId: 'monster_bugbear', actorKind: 'monster' }
    });
    assert.equal(usesPrintedDefenses(monster), true);
    const totals = defenseTotals(monster, 5);
    assert.equal(totals.ac, 19);
    assert.equal(totals.fort, 17);
  });
});
