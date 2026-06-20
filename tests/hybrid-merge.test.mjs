import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeHybridClasses,
  hybridPairAllowed,
  hybridPowerCoverage
} from '../src/character/hybrid-merge.js';

const classA = {
  id: 'classA',
  name: 'Fighter',
  hp_at1_base: 15,
  hp_per_level: 6,
  surges_base: 9,
  base_speed: 5,
  trainedSkills: [
    { skill_id: 'athletics', kind: 'pool', choose_count: 3 },
    { skill_id: 'endurance', kind: 'fixed' }
  ],
  proficiencies: [
    { kind: 'armor', value: 'Cloth' },
    { kind: 'armor', value: 'Leather' },
    { kind: 'armor', value: 'Hide' },
    { kind: 'armor', value: 'Chainmail' },
    { kind: 'weapon', value: 'Simple melee' },
    { kind: 'shield', value: 'Light shields' }
  ]
};

const classB = {
  id: 'classB',
  name: 'Wizard',
  hp_at1_base: 12,
  hp_per_level: 5,
  surges_base: 7,
  base_speed: 6,
  trainedSkills: [
    { skill_id: 'arcana', kind: 'pool', choose_count: 3 },
    { skill_id: 'athletics', kind: 'pool' }
  ],
  proficiencies: [
    { kind: 'armor', value: 'Cloth' },
    { kind: 'armor', value: 'Leather' },
    { kind: 'weapon', value: 'Simple melee' },
    { kind: 'weapon', value: 'Military ranged' },
    { kind: 'implement', value: 'Wands' }
  ]
};

test('mergeHybridClasses applies PH3 HP/surge math', () => {
  const m = mergeHybridClasses(classA, classB);
  // average of starting HP (15, 12) rounded down
  assert.equal(m.hpAt1Base, 13);
  // sum of half each per-level (6/2 + 5/2 = 5.5) rounded down
  assert.equal(m.hpPerLevel, 5);
  // average of surges (9, 7) rounded down
  assert.equal(m.surgesBase, 8);
  assert.equal(m.baseSpeed, 5);
});

test('mergeHybridClasses combines skills and trains in any three', () => {
  const m = mergeHybridClasses(classA, classB);
  assert.equal(m.trainedChooseCount, 3);
  assert.deepEqual([...m.trainedSkillPool].sort(), ['arcana', 'athletics', 'endurance']);
});

test('mergeHybridClasses intersects armor/shield and unions weapon/implement', () => {
  const m = mergeHybridClasses(classA, classB);
  assert.deepEqual(m.proficiencies.armor.sort(), ['cloth', 'leather']);
  assert.deepEqual(m.proficiencies.shield, []); // wizard has none -> intersection empty
  assert.deepEqual(m.proficiencies.weapon.sort(), ['military ranged', 'simple melee']);
  assert.deepEqual(m.proficiencies.implement, ['wands']);
});

test('hybridPairAllowed enforces PH3 pairing rules', () => {
  assert.equal(hybridPairAllowed(classA, classA).ok, false);
  assert.equal(
    hybridPairAllowed(
      { id: 'h1', hybrid_parent_class_id: 'cleric' },
      { id: 'h2', hybrid_parent_class_id: 'cleric' }
    ).ok,
    false
  );
  assert.equal(
    hybridPairAllowed(
      { id: 'h1', hybrid_parent_class_id: 'cleric' },
      { id: 'h2', hybrid_parent_class_id: 'fighter' }
    ).ok,
    true
  );
});

test('hybridPowerCoverage reports missing power types per class', () => {
  const names = ['Fighter', 'Wizard'];
  const fighterOnly = [
    { className: 'Fighter', powerType: 'At-Will' },
    { className: 'Fighter', powerType: 'Encounter' },
    { className: 'Fighter', powerType: 'Daily' },
    { className: 'Fighter', powerType: 'Utility' }
  ];
  const partial = hybridPowerCoverage(fighterOnly, names);
  assert.equal(partial.ok, false);
  assert.ok(partial.missing.some((m) => m.className === 'Wizard' && m.types.length === 4));

  const full = hybridPowerCoverage(
    [
      ...fighterOnly,
      { className: 'Wizard', powerType: 'At-Will' },
      { className: 'Wizard', powerType: 'Encounter' },
      { className: 'Wizard', powerType: 'Daily' },
      { className: 'Wizard', powerType: 'Utility' }
    ],
    names
  );
  assert.equal(full.ok, true);
  assert.deepEqual(full.missing, []);
});
