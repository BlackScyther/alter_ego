import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getParentRaceId,
  isSubraceId,
  setSubraceMap,
  resetSubraceMap,
  hydrateSubracesFromProvider
} from '../src/character/race-subraces.js';

afterEach(() => resetSubraceMap());

test('defaults to the static JSON map', () => {
  // race54 (Gold Dwarf) is a subrace of race2 (Dwarf) in metadata/race-subraces.json
  assert.equal(getParentRaceId('race54'), 'race2');
  assert.equal(isSubraceId('race54'), true);
});

test('setSubraceMap replaces the runtime map', () => {
  setSubraceMap({ parentX: ['childY'] });
  assert.equal(getParentRaceId('childY'), 'parentX');
  assert.equal(isSubraceId('childY'), true);
  // old entries no longer present
  assert.equal(isSubraceId('race54'), false);
});

test('setSubraceMap ignores empty/falsy maps', () => {
  setSubraceMap(null);
  setSubraceMap({});
  assert.equal(getParentRaceId('race54'), 'race2');
});

test('hydrateSubracesFromProvider pulls from a provider', async () => {
  const provider = {
    getRaceSubraceMap: async () => ({ p1: ['s1', 's2'] })
  };
  const hydrated = await hydrateSubracesFromProvider(provider);
  assert.equal(hydrated, true);
  assert.equal(getParentRaceId('s2'), 'p1');
});

test('hydrateSubracesFromProvider is a no-op when provider has no data', async () => {
  const hydrated = await hydrateSubracesFromProvider({ getRaceSubraceMap: async () => null });
  assert.equal(hydrated, false);
  assert.equal(getParentRaceId('race54'), 'race2');
});
