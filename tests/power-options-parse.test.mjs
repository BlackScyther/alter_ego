import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePowerAbilityOptions,
  parsePowerDamageOptions
} from '../src/character/power-ability-parse.js';

// Dragon Breath puts both choices in a "Special:" clause rather than the attack
// line, so the parsers must read that phrasing.
const dragonBreath = {
  id: 'power42',
  body_html:
    '<h1 class=encounterpower>Dragon Breath<span class=level>Dragonborn Racial Power</span></h1>' +
    '<p class=powerstat><b>Attack</b>: Constitution + 2 vs. Reflex</p>' +
    '<p class=powerstat><b>Hit</b>: 1d6 + Constitution modifier damage.</p>' +
    '<p class=flavor><i>Special:</i> When you create your character, choose Strength, ' +
    "Constitution, or Dexterity as the ability score you use when making attack rolls " +
    'with this power. You also choose the power\u2019s damage type: acid, cold, fire, ' +
    'lightning, or poison. These choices remain throughout your character\u2019s life.</p>'
};

const attackLinePower = {
  id: 'power1770',
  body_html:
    '<h1 class=encounterpower>Firepulse</h1>' +
    '<p class=powerstat><b>Attack</b>: Strength, Constitution, or Charisma vs. Reflex</p>' +
    '<p class=powerstat><b>Hit</b>: 1d8 fire damage.</p>'
};

const plainPower = {
  id: 'power99',
  body_html:
    '<h1 class=encounterpower>Dragonfright</h1>' +
    '<p class=powerstat><b>Attack</b>: Charisma vs. Will</p>' +
    '<p class=powerstat><b>Hit</b>: The target is dazed.</p>'
};

test('parsePowerAbilityOptions reads the attack line', () => {
  const res = parsePowerAbilityOptions(attackLinePower);
  assert.ok(res);
  assert.equal(res.choiceGroup, 'power1770-attack');
  assert.deepEqual(
    res.options.map((o) => o.ability),
    ['str', 'con', 'cha']
  );
});

test('parsePowerAbilityOptions reads the Special: phrasing (Dragon Breath)', () => {
  const res = parsePowerAbilityOptions(dragonBreath);
  assert.ok(res);
  assert.equal(res.choiceGroup, 'power42-attack');
  assert.deepEqual(
    res.options.map((o) => o.ability),
    ['str', 'con', 'dex']
  );
});

test('parsePowerAbilityOptions returns null for a single fixed ability', () => {
  assert.equal(parsePowerAbilityOptions(plainPower), null);
});

test('parsePowerDamageOptions reads the damage-type list (Dragon Breath)', () => {
  const res = parsePowerDamageOptions(dragonBreath);
  assert.ok(res);
  assert.equal(res.choiceGroup, 'power42-damage');
  assert.deepEqual(
    res.options.map((o) => o.damageType),
    ['acid', 'cold', 'fire', 'lightning', 'poison']
  );
});

test('parsePowerDamageOptions returns null when no damage choice is offered', () => {
  assert.equal(parsePowerDamageOptions(attackLinePower), null);
  assert.equal(parsePowerDamageOptions(plainPower), null);
});
