import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterBaseRaces,
  filterSubracesForParent,
  getSubracesForParent,
  isSubraceId,
  resolveRacePair
} from '../src/character/race-subraces.js';

test('subrace map identifies dwarf subraces', () => {
  assert.equal(isSubraceId('race54'), true);
  assert.equal(isSubraceId('race2'), false);
  assert.deepEqual(getSubracesForParent('race2'), ['race54', 'race55']);
});

test('filterBaseRaces removes subrace entries', () => {
  const entries = [{ id: 'race2' }, { id: 'race54' }, { id: 'race1' }];
  assert.deepEqual(filterBaseRaces(entries).map((e) => e.id), ['race2', 'race1']);
});

test('filterSubracesForParent keeps only mapped subraces', () => {
  const entries = [{ id: 'race54' }, { id: 'race55' }, { id: 'race1' }];
  assert.deepEqual(filterSubracesForParent(entries, 'race2').map((e) => e.id), ['race54', 'race55']);
});

test('resolveRacePair maps subrace to parent', () => {
  assert.deepEqual(resolveRacePair('race54'), { baseId: 'race2', variantId: 'race54' });
  assert.deepEqual(resolveRacePair('race2'), { baseId: 'race2', variantId: null });
});
