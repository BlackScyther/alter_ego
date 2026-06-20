import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defenseAbilityMod, defenseTotal } from '../src/formulas.js';

describe('defense ability modifier', () => {
  const scores = { str: 16, con: 20, dex: 12, int: 8, wis: 14, cha: 10 };

  it('uses the higher of the two relevant ability modifiers', () => {
    assert.equal(defenseAbilityMod(scores, 'fort'), 5); // max(STR +3, CON +5)
    assert.equal(defenseAbilityMod(scores, 'ref'), 1); // max(DEX +1, INT -1)
    assert.equal(defenseAbilityMod(scores, 'will'), 2); // max(WIS +2, CHA +0)
    assert.equal(defenseAbilityMod(scores, 'ac'), 1); // max(DEX +1, INT -1)
  });

  it('defaults missing scores to 10 (modifier 0)', () => {
    assert.equal(defenseAbilityMod({}, 'fort'), 0);
    assert.equal(defenseAbilityMod(undefined, 'will'), 0);
  });

  it('feeds into the full defense total (Fortitude example, level 3)', () => {
    const abil = defenseAbilityMod(scores, 'fort');
    const total = defenseTotal(3, { abil, class: 2 });
    assert.equal(total, 18); // 10 + 1 (½ lvl) + 5 (CON) + 2 (class)
  });
});
