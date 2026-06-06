import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePowerType,
  classNameMatches,
  powerMatchesSlot,
  filterPowerEntries,
  formatPowerListingMeta
} from '../src/editor/power-filter.js';

describe('power-filter', () => {
  it('normalizes power type strings', () => {
    assert.equal(normalizePowerType('At-Will'), 'At-Will');
    assert.equal(normalizePowerType('At Will'), 'At-Will');
    assert.equal(normalizePowerType('Encounter'), 'Encounter');
    assert.equal(normalizePowerType('Daily'), 'Daily');
    assert.equal(normalizePowerType('Utility'), 'Utility');
  });

  it('matches class names including hybrid', () => {
    assert.ok(classNameMatches('Fighter', 'Fighter'));
    assert.ok(classNameMatches('Fighter / Wizard', 'Fighter'));
    assert.ok(classNameMatches('Fighter/Wizard', 'Wizard'));
    assert.ok(!classNameMatches('Fighter', 'Cleric'));
  });

  it('powerMatchesSlot enforces type level and class', () => {
    const slot = { id: 'power-atwill-1-a', slotLevel: 1, powerType: 'At-Will', label: 'x' };
    const ctx = { className: 'Fighter', characterLevel: 1 };
    assert.ok(
      powerMatchesSlot(
        { Type: 'At-Will', Level: '1', ClassName: 'Fighter' },
        slot,
        ctx
      )
    );
    assert.ok(!powerMatchesSlot({ Type: 'Encounter', Level: '1', ClassName: 'Fighter' }, slot, ctx));
    assert.ok(!powerMatchesSlot({ Type: 'At-Will', Level: '3', ClassName: 'Fighter' }, slot, ctx));
    assert.ok(!powerMatchesSlot({ Type: 'At-Will', Level: '1', ClassName: 'Wizard' }, slot, ctx));
  });

  it('showAll skips class match', () => {
    const slot = { id: 'power-atwill-1-a', slotLevel: 1, powerType: 'At-Will', label: 'x' };
    const ctx = { className: 'Fighter', characterLevel: 1 };
    assert.ok(
      powerMatchesSlot(
        { Type: 'At-Will', Level: '1', ClassName: 'Wizard' },
        slot,
        ctx,
        { skipClass: true }
      )
    );
  });

  it('retrain allows power level at or below character level', () => {
    const slot = { id: 'power-encounter-3', slotLevel: 3, powerType: 'Encounter', label: 'x' };
    const ctx = { className: 'Fighter', characterLevel: 7 };
    assert.ok(
      powerMatchesSlot(
        { Type: 'Encounter', Level: '1', ClassName: 'Fighter' },
        slot,
        ctx,
        { retrain: true }
      )
    );
    assert.ok(
      !powerMatchesSlot(
        { Type: 'Encounter', Level: '11', ClassName: 'Fighter' },
        slot,
        ctx,
        { retrain: true }
      )
    );
  });

  it('skipLevel bypasses level checks for show-all mode', () => {
    const slot = { id: 'power-daily-5', slotLevel: 5, powerType: 'Daily', label: 'x' };
    const ctx = { className: 'Fighter', characterLevel: 5 };
    assert.ok(
      powerMatchesSlot(
        { Type: 'Daily', Level: '1', ClassName: 'Fighter' },
        slot,
        ctx,
        { skipLevel: true }
      )
    );
  });

  it('filterPowerEntries excludes duplicates and sorts', () => {
    const slot = { id: 'power-encounter-1', slotLevel: 1, powerType: 'Encounter', label: 'x' };
    const ctx = { className: 'Fighter', characterLevel: 1 };
    const entries = [
      { id: 'b', listing_fields: { Name: 'Beta', Type: 'Encounter', Level: '1', ClassName: 'Fighter' } },
      { id: 'a', listing_fields: { Name: 'Alpha', Type: 'Encounter', Level: '1', ClassName: 'Fighter' } },
      { id: 'c', listing_fields: { Name: 'Wrong', Type: 'Daily', Level: '1', ClassName: 'Fighter' } }
    ];
    const list = filterPowerEntries(entries, ctx, slot, { excludeIds: new Set(['a']) });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'b');
  });

  it('formatPowerListingMeta includes level and type', () => {
    const meta = formatPowerListingMeta({
      Level: '3',
      Type: 'Encounter',
      Action: 'Standard',
      SourceBook: 'PHB'
    });
    assert.ok(meta.includes('Lv 3'));
    assert.ok(meta.includes('Encounter'));
  });
});
