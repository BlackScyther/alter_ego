import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  abilityKeyFromName,
  attackTotalFor,
  buildPowerCardContext,
  damageModFor,
  formatSigned
} from '../src/character/power-card-values.js';

/** Level-4 character with Strength 20 (+5) and synced weapon proficiencies. */
function makeCharacter() {
  const character = createCharacter();
  character.identity.level = 4;
  character.abilities.scores = { str: 20, con: 14, dex: 12, int: 10, wis: 8, cha: 16 };
  character.sheet = character.sheet ?? {};
  character.sheet.extraFields = { 'melee-atk-prof': 3, 'ranged-atk-prof': 2 };
  return character;
}

test('abilityKeyFromName maps power-text ability names', () => {
  assert.equal(abilityKeyFromName('Strength'), 'str');
  assert.equal(abilityKeyFromName('dexterity'), 'dex');
  assert.equal(abilityKeyFromName('Charisma'), 'cha');
  assert.equal(abilityKeyFromName('Luck'), null);
});

test('formatSigned always shows an explicit sign', () => {
  assert.equal(formatSigned(5), '+5');
  assert.equal(formatSigned(0), '+0');
  assert.equal(formatSigned(-2), '-2');
});

test('attack to-hit includes half level, ability mod, and weapon proficiency', () => {
  const ctx = buildPowerCardContext(makeCharacter());
  // half(4)=2, STR mod=5, melee prof=3 -> 10
  assert.equal(attackTotalFor(ctx, 'str', { weapon: true, ranged: false }), 10);
  // ranged uses the ranged proficiency: 2 + 5 + 2 = 9
  assert.equal(attackTotalFor(ctx, 'str', { weapon: true, ranged: true }), 9);
});

test('implement (non-weapon) attack omits weapon proficiency', () => {
  const ctx = buildPowerCardContext(makeCharacter());
  // half(4)=2 + STR mod 5 = 7 (the "7" without proficiency)
  assert.equal(attackTotalFor(ctx, 'str', { weapon: false }), 7);
});

test('inline power bonus folds into the attack total', () => {
  const ctx = buildPowerCardContext(makeCharacter());
  // 2 + 5 + 3 (melee prof) + 2 (inline) = 12
  assert.equal(attackTotalFor(ctx, 'str', { weapon: true, inline: 2 }), 12);
});

test('damage modifier is the ability modifier (no half level)', () => {
  const ctx = buildPowerCardContext(makeCharacter());
  assert.equal(damageModFor(ctx, 'str'), 5);
  assert.equal(damageModFor(ctx, 'wis'), -1);
});

test('weapon enhancement adds to weapon power attack and damage (per line)', () => {
  const character = makeCharacter();
  character.sheet.extraFields = {
    'melee-atk-prof': 3,
    'ranged-atk-prof': 2,
    'weapon-melee-enh': 2,
    'weapon-ranged-enh': 1
  };
  const ctx = buildPowerCardContext(character);
  // melee: half2 + str5 + prof3 + enh2 = 12
  assert.equal(attackTotalFor(ctx, 'str', { weapon: true }), 12);
  // ranged: half2 + str5 + prof2 + enh1 = 10
  assert.equal(attackTotalFor(ctx, 'str', { weapon: true, ranged: true }), 10);
  // damage: str5 + melee enh2 = 7; ranged str5 + enh1 = 6
  assert.equal(damageModFor(ctx, 'str', { weapon: true }), 7);
  assert.equal(damageModFor(ctx, 'str', { weapon: true, ranged: true }), 6);
});

test('implement enhancement adds to implement power attack and damage', () => {
  const character = makeCharacter();
  character.sheet.extraFields = { 'implement-enh': 3, 'weapon-melee-enh': 2 };
  const ctx = buildPowerCardContext(character);
  // implement attack: half2 + str5 + implementEnh3 = 10 (no proficiency)
  assert.equal(attackTotalFor(ctx, 'str', { implement: true }), 10);
  // implement damage: str5 + implementEnh3 = 8 (weapon enh not applied)
  assert.equal(damageModFor(ctx, 'str', { implement: true }), 8);
  // a non-weapon, non-implement term gets no enhancement
  assert.equal(damageModFor(ctx, 'str', {}), 5);
});

test('missing proficiency synced data defaults proficiency to 0', () => {
  const character = makeCharacter();
  character.sheet.extraFields = {};
  const ctx = buildPowerCardContext(character);
  // 2 (half) + 5 (STR) + 0 prof = 7
  assert.equal(attackTotalFor(ctx, 'str', { weapon: true }), 7);
});
