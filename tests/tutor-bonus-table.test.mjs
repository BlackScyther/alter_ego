import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bonusesForTutorTable,
  syncBonusesFromSelections,
  syncRaceBonusChoicesToBonuses,
  abilityScoreBreakdown
} from '../src/character/tutor.js';

test('bonusesForTutorTable omits race rows', () => {
  const rows = [
    { id: 'r1', source: 'race', sourceName: 'Human', ability: 'any', amount: 2, enabled: true },
    { id: 'c1', source: 'class', sourceName: 'Cleric', ability: 'wis', amount: 1, enabled: true }
  ];
  assert.equal(bonusesForTutorTable(rows).length, 1);
  assert.equal(bonusesForTutorTable(rows)[0].source, 'class');
});

test('race ability choice still applies in calculator after table filter', () => {
  const character = {
    abilities: {
      baseScores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 },
      scores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 },
      bonuses: [
        {
          id: 'race-human-any',
          source: 'race',
          sourceName: 'Human',
          ability: 'any',
          amount: 2,
          bonusType: 'race',
          choiceGroup: 'race1-any-one',
          enabled: false
        }
      ],
      anyChoice: {}
    },
    selections: {
      raceBonusChoices: { ability: { 'race1-any-one': 'wis' }, skill: {} }
    },
    skillBonuses: [],
    sheet: { skillBonusTotals: {} }
  };

  syncRaceBonusChoicesToBonuses(character);
  const breakdown = abilityScoreBreakdown(character);
  assert.equal(breakdown.wis.total, 12);
  assert.equal(bonusesForTutorTable(character.abilities.bonuses).length, 0);
});

test('subrace selection applies parent race fixed ability bonus', () => {
  const baseElf = {
    id: 'race4',
    listing_fields: { Name: 'Elf' },
    body_html:
      '<blockquote><b>Ability scores</b>: +2 Dexterity, +2 Intelligence or +2 Wisdom</blockquote>'
  };
  const wildElf = {
    id: 'race58',
    listing_fields: { Name: 'Wild Elf' },
    body_html: '<h1 class=player>Wild Elf</h1><p>Flavor only.</p>'
  };
  const character = {
    selections: { raceId: 'race58', raceBonusChoices: { ability: {}, skill: {} } },
    abilities: {
      baseScores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 },
      scores: {},
      bonuses: [],
      anyChoice: {}
    },
    skillBonuses: [],
    sheet: { skillBonusTotals: {} }
  };

  syncBonusesFromSelections(character, { race: wildElf }, []);
  assert.equal(abilityScoreBreakdown(character).dex.total, 10);

  syncBonusesFromSelections(character, { race: baseElf }, []);
  syncRaceBonusChoicesToBonuses(character);
  assert.equal(abilityScoreBreakdown(character).dex.total, 12);
});
