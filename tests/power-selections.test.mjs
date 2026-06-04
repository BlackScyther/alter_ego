import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  getPowerSlotsForLevel,
  setPowerForSlot,
  syncPowerIdsFromSelections,
  validatePowersStep,
  migratePowerIdsToSelections,
  countFilledPowerSlots,
  prunePowerSelections,
  groupPowerSlotsByType
} from '../src/character/power-selections.js';

describe('power-selections', () => {
  it('returns level-1 fighter slots at level 1', () => {
    const slots = getPowerSlotsForLevel(1);
    const types = slots.map((s) => s.powerType);
    assert.equal(types.filter((t) => t === 'At-Will').length, 2);
    assert.ok(types.includes('Encounter'));
    assert.ok(types.includes('Daily'));
    assert.ok(!types.includes('Utility'));
  });

  it('includes utility from level 2', () => {
    const slots = getPowerSlotsForLevel(2);
    assert.ok(slots.some((s) => s.powerType === 'Utility' && s.slotLevel === 2));
  });

  it('groups slots by type', () => {
    const slots = getPowerSlotsForLevel(3);
    const groups = groupPowerSlotsByType(slots);
    assert.equal(groups['At-Will'].length, 2);
    assert.equal(groups.Encounter.length, 2);
  });

  it('migrates legacy powerIds to powerSelections', () => {
    const c = createCharacter({
      identity: { level: 1 },
      selections: { classId: 'class1', powerIds: ['power1', 'power2'] }
    });
    migratePowerIdsToSelections(c);
    assert.equal(c.selections.powerSelections['power-atwill-1-a'], 'power1');
    assert.equal(c.selections.powerSelections['power-atwill-1-b'], 'power2');
  });

  it('prunes slots above character level', () => {
    const c = createCharacter({
      identity: { level: 1 },
      selections: {
        classId: 'class1',
        powerSelections: { 'power-atwill-1-a': 'power1', 'power-encounter-3': 'power5' }
      }
    });
    prunePowerSelections(c);
    assert.equal(c.selections.powerSelections['power-atwill-1-a'], 'power1');
    assert.equal(c.selections.powerSelections['power-encounter-3'], undefined);
  });

  it('validates class required and all slots filled', () => {
    const c = createCharacter({ identity: { level: 1 } });
    let errors = validatePowersStep(c);
    assert.ok(errors.some((e) => e.includes('class')));

    c.selections.classId = 'class1';
    errors = validatePowersStep(c);
    assert.ok(errors.some((e) => e.includes('Choose a power')));

    setPowerForSlot(c, 'power-atwill-1-a', 'power1');
    setPowerForSlot(c, 'power-atwill-1-b', 'power2');
    setPowerForSlot(c, 'power-encounter-1', 'power3');
    setPowerForSlot(c, 'power-daily-1', 'power4');
    errors = validatePowersStep(c);
    assert.equal(errors.length, 0);

    setPowerForSlot(c, 'power-daily-1', 'power1');
    errors = validatePowersStep(c);
    assert.ok(errors.some((e) => e.includes('once')));
  });

  it('syncs powerIds from selections', () => {
    const c = createCharacter({
      identity: { level: 1 },
      selections: { classId: 'class1' }
    });
    setPowerForSlot(c, 'power-atwill-1-a', 'power1');
    syncPowerIdsFromSelections(c);
    assert.deepEqual(c.selections.powerIds, ['power1']);
    assert.equal(countFilledPowerSlots(c), 1);
  });
});
