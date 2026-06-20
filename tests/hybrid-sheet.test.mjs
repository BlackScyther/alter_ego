import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMaxHp, computeLevel1MaxHp } from '../src/character/hp.js';
import { applyHybridClassStats } from '../src/character/class-selections.js';

function charWith(overrides = {}) {
  return {
    identity: { level: 1 },
    abilities: { scores: { con: 14 } },
    selections: {},
    sheet: { hp: { max: 0, current: 0, temp: 0, surgesPerDay: 0, surgeUses: 0 } },
    ...overrides
  };
}

test('computeMaxHp prefers persisted hybrid stats when hybrid mode is on', () => {
  const c = charWith({
    selections: {
      classHybrid: true,
      hybridMerged: { hpAt1Base: 13, hpPerLevel: 5, surgesBase: 8 }
    }
  });
  // level 1: 13 (class) + 14 (con) = 27
  assert.equal(computeMaxHp(c), 27);
  assert.equal(computeLevel1MaxHp(c), 27);
  // level 3: 27 + 2*5 = 37
  c.identity.level = 3;
  assert.equal(computeMaxHp(c), 37);
});

test('computeMaxHp ignores hybridMerged when hybrid mode is off', () => {
  const c = charWith({
    selections: {
      classHybrid: false,
      hybridMerged: { hpAt1Base: 13, hpPerLevel: 5, surgesBase: 8 }
    },
    sheet: { hp: { classBase: 20, perLevel: 4 } }
  });
  // falls back to sheet.hp.classBase (20) + con (14) = 34
  assert.equal(computeMaxHp(c), 34);
});

test('applyHybridClassStats merges both classes onto the sheet', async () => {
  const classes = {
    classA: {
      id: 'classA',
      hp_at1_base: 15,
      hp_per_level: 6,
      surges_base: 9,
      base_speed: 5,
      trainedSkills: [{ skill_id: 'athletics', kind: 'pool' }],
      proficiencies: [{ kind: 'armor', value: 'Chainmail' }]
    },
    classB: {
      id: 'classB',
      hp_at1_base: 12,
      hp_per_level: 5,
      surges_base: 7,
      base_speed: 6,
      trainedSkills: [{ skill_id: 'arcana', kind: 'pool' }],
      proficiencies: [{ kind: 'implement', value: 'Wands' }]
    }
  };
  const compendium = { getNormalizedClass: async (id) => classes[id] ?? null };

  const c = charWith({
    selections: { classHybrid: true, hybridClassIds: ['classA', 'classB'] }
  });
  await applyHybridClassStats(c, compendium);

  assert.equal(c.sheet.hp.classBase, 13); // floor((15+12)/2)
  assert.equal(c.sheet.hp.perLevel, 5); // floor(6/2 + 5/2)
  assert.equal(c.sheet.hp.max, 27); // 13 + 14 con
  assert.equal(c.sheet.hp.surgesPerDay, 10); // floor((9+7)/2) + con mod (2)
  assert.equal(c.sheet.speed.base, 5);
  assert.ok(c.selections.hybridMerged);
  assert.deepEqual(c.selections.hybridMerged.trainedSkillPool.sort(), ['arcana', 'athletics']);
});

test('applyHybridClassStats is a no-op without both classes or normalized data', async () => {
  const c = charWith({ selections: { classHybrid: true, hybridClassIds: ['only'] } });
  await applyHybridClassStats(c, { getNormalizedClass: async () => null });
  assert.equal(c.selections.hybridMerged, null);

  const off = charWith({ selections: { classHybrid: false, hybridMerged: { hpAt1Base: 99 } } });
  await applyHybridClassStats(off, { getNormalizedClass: async () => ({}) });
  assert.equal(off.selections.hybridMerged, null);
});
