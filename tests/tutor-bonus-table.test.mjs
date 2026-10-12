import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bonusesForTutorTable,
  syncBonusesFromSelections,
  syncRaceBonusChoicesToBonuses,
  abilityScoreBreakdown,
  getFinalScores,
  setLevelIncreaseDraft,
  confirmLevelIncreases,
  levelIncreaseDraftReady,
  pendingAbilityIncreaseLevels,
  setBaseScoreDraft,
  confirmBaseScores
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

function abilityCharacter(level, levelIncreases = {}) {
  return {
    identity: { level },
    abilities: {
      baseScores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 },
      scores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 },
      bonuses: [],
      anyChoice: {},
      levelIncreases
    },
    skillBonuses: [],
    sheet: { skillBonusTotals: {} }
  };
}

test('ability increase draft does not change totals until confirm', () => {
  const character = abilityCharacter(4);
  setLevelIncreaseDraft(character, 4, ['con', 'int']);
  assert.equal(levelIncreaseDraftReady(character), true);
  assert.equal(abilityScoreBreakdown(character).con.total, 10);
  assert.equal(abilityScoreBreakdown(character).int.total, 10);
  assert.deepEqual(pendingAbilityIncreaseLevels(character), [4]);

  confirmLevelIncreases(character);
  assert.equal(abilityScoreBreakdown(character).con.total, 11);
  assert.equal(abilityScoreBreakdown(character).int.total, 11);
  assert.equal(getFinalScores(character).con, 11);
  assert.equal(getFinalScores(character).int, 11);
  assert.deepEqual(pendingAbilityIncreaseLevels(character), []);
  assert.equal(character.abilities.levelIncreaseEditing, false);
});

test('a later pair stays pending until its own pair is confirmed', () => {
  const character = abilityCharacter(8, { 4: ['con', 'int'] });
  assert.equal(abilityScoreBreakdown(character).con.total, 11);
  assert.deepEqual(pendingAbilityIncreaseLevels(character), [8]);

  setLevelIncreaseDraft(character, 8, ['str', 'wis']);
  assert.equal(abilityScoreBreakdown(character).str.total, 10);
  assert.equal(abilityScoreBreakdown(character).con.total, 11);
  assert.equal(levelIncreaseDraftReady(character), true);

  confirmLevelIncreases(character);
  assert.equal(abilityScoreBreakdown(character).con.total, 11);
  assert.equal(abilityScoreBreakdown(character).int.total, 11);
  assert.equal(abilityScoreBreakdown(character).str.total, 11);
  assert.equal(abilityScoreBreakdown(character).wis.total, 11);
  assert.equal(getFinalScores(character).str, 11);
  assert.deepEqual(pendingAbilityIncreaseLevels(character), []);
});

test('confirm ignores a pair that is not two different abilities', () => {
  const character = abilityCharacter(4);
  setLevelIncreaseDraft(character, 4, ['con', 'con']);
  assert.equal(levelIncreaseDraftReady(character), false);
  confirmLevelIncreases(character);
  assert.equal(abilityScoreBreakdown(character).con.total, 10);
  assert.deepEqual(pendingAbilityIncreaseLevels(character), [4]);
});

test('point-buy draft does not change totals until the scores are applied', () => {
  const character = abilityCharacter(1);
  setBaseScoreDraft(character, 'str', 16);
  assert.equal(abilityScoreBreakdown(character).str.total, 10);
  assert.equal(getFinalScores(character).str, 10);
  confirmBaseScores(character, character.abilities.baseScoreDraft);
  assert.equal(abilityScoreBreakdown(character).str.total, 16);
  assert.equal(getFinalScores(character).str, 16);
  assert.equal(character.abilities.pointBuyConfirmed, true);
});
