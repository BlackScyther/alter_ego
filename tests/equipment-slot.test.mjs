import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEligibleSlotsForEntry,
  isEntryEligibleForSlot
} from '../src/character/equipment-selections.js';

test('normalized slot is authoritative for worn items', () => {
  // Amulet of Protection has an empty Type in the source data, but the
  // normalized item.slot resolves it to the neck slot.
  const amulet = {
    id: 'item498',
    category_slug: 'item',
    listing_fields: { Name: 'Amulet of Protection', Type: '' },
    slot: 'neck'
  };
  assert.deepEqual(getEligibleSlotsForEntry(amulet), ['neck']);
  assert.equal(isEntryEligibleForSlot('neck', amulet), true);
  assert.equal(isEntryEligibleForSlot('head', amulet), false);
});

test('normalized ring slot maps to both ring slots', () => {
  const ring = {
    id: 'item1',
    category_slug: 'item',
    listing_fields: { Name: 'Ring of Protection', Type: '' },
    slot: 'ring'
  };
  assert.deepEqual(getEligibleSlotsForEntry(ring).sort(), ['ring1', 'ring2']);
});

test('falls back to name heuristics when no normalized slot is present', () => {
  // No `slot` field (older DB / not normalized): the name still resolves neck.
  const amulet = {
    category_slug: 'item',
    listing_fields: { Name: 'Amulet of Protection', Type: '' }
  };
  assert.deepEqual(getEligibleSlotsForEntry(amulet), ['neck']);
});

test('a cloak (no name keyword in old heuristics) resolves via normalized slot', () => {
  // "Cloak of Resistance" has no cloak pattern in the legacy name heuristics,
  // so without the normalized slot it would not resolve to neck...
  const withoutSlot = {
    category_slug: 'item',
    listing_fields: { Name: 'Cloak of Resistance', Type: '' }
  };
  assert.deepEqual(getEligibleSlotsForEntry(withoutSlot), []);
  // ...but the normalized slot fixes it.
  const withSlot = { ...withoutSlot, slot: 'neck' };
  assert.deepEqual(getEligibleSlotsForEntry(withSlot), ['neck']);
});
