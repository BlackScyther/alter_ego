import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  getFeatSlotsForLevel,
  setFeatForSlot,
  syncFeatIdsFromSelections,
  validateFeatsStep,
  migrateFeatIdsToSelections,
  countFilledFeatSlots
} from '../src/character/feat-selections.js';

describe('feat-selections', () => {
  it('returns slots through current level', () => {
    const slots = getFeatSlotsForLevel(4);
    assert.deepEqual(
      slots.map((s) => s.slotLevel),
      [1, 2, 4]
    );
    assert.equal(slots[0].tier, 'Heroic');
  });

  it('migrates legacy featIds to featSelections', () => {
    const c = createCharacter({ identity: { level: 4 }, selections: { featIds: ['feat1', 'feat2'] } });
    migrateFeatIdsToSelections(c);
    assert.equal(c.selections.featSelections['feat-1'], 'feat1');
    assert.equal(c.selections.featSelections['feat-2'], 'feat2');
  });

  it('replaces feat in slot without duplicating across slots', () => {
    const c = createCharacter({ identity: { level: 1 } });
    setFeatForSlot(c, 'feat-1', 'feat1');
    setFeatForSlot(c, 'feat-1', 'feat2');
    assert.equal(c.selections.featSelections['feat-1'], 'feat2');
    syncFeatIdsFromSelections(c);
    assert.deepEqual(c.selections.featIds, ['feat2']);
  });

  it('validates all slots filled and no duplicates', () => {
    const c = createCharacter({ identity: { level: 4 } });
    let errors = validateFeatsStep(c);
    assert.ok(errors.some((e) => e.includes('Choose a feat')));

    setFeatForSlot(c, 'feat-1', 'feat1');
    setFeatForSlot(c, 'feat-2', 'feat2');
    setFeatForSlot(c, 'feat-4', 'feat3');
    errors = validateFeatsStep(c);
    assert.equal(errors.length, 0);

    setFeatForSlot(c, 'feat-4', 'feat1');
    errors = validateFeatsStep(c);
    assert.ok(errors.some((e) => e.includes('once')));
  });

  it('counts filled slots', () => {
    const c = createCharacter({ identity: { level: 4 } });
    setFeatForSlot(c, 'feat-1', 'feat1');
    assert.equal(countFilledFeatSlots(c), 1);
  });
});
