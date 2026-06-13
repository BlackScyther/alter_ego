import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterBaseRaces,
  filterSubracesForParent,
  getSubracesForParent,
  isSubraceId,
  raceBonusEntryId,
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

test('raceBonusEntryId uses parent race for subrace selections', () => {
  assert.equal(raceBonusEntryId('race58'), 'race4');
  assert.equal(raceBonusEntryId('race4'), 'race4');
  assert.equal(raceBonusEntryId('race67'), 'race1');
  assert.equal(raceBonusEntryId(null), null);
});

test('dragonborn draconian variants map to parent race1', () => {
  assert.equal(isSubraceId('race67'), true);
  assert.equal(isSubraceId('race68'), true);
  assert.deepEqual(getSubracesForParent('race1'), ['race67', 'race68']);
  assert.deepEqual(resolveRacePair('race67'), { baseId: 'race1', variantId: 'race67' });
  assert.deepEqual(filterSubracesForParent(
    [{ id: 'race67' }, { id: 'race68' }, { id: 'race1' }],
    'race1'
  ).map((e) => e.id), ['race67', 'race68']);
});
