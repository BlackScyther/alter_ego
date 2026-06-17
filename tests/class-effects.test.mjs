import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectClassEffects,
  applyClassEffects,
  classInitiativeTotal,
  formatClassEffectNotes
} from '../src/character/class-effects.js';
import { applyBackgroundEffects } from '../src/character/background-effects.js';
import { createCharacter } from '../src/character/model.js';

const warlordEntry = {
  id: 'class8',
  listing_fields: { Name: 'Warlord (Marshal)', RoleName: 'Leader', PowerSourceText: 'Martial' },
  body_html: '<blockquote><b>CLASS TRAITS</b></blockquote><h3>Combat Leader</h3><p>Tactical leader text.</p>'
};

test('detectClassEffects finds Combat Leader +2 initiative for Warlord (Marshal)', () => {
  const effects = detectClassEffects(warlordEntry);
  const init = effects.filter((e) => e.type === 'initiative-misc');
  assert.equal(init.length, 1);
  assert.equal(init[0].amount, 2);
  assert.equal(init[0].feature, 'Combat Leader');
});

test('detectClassEffects matches override by class name when id is absent', () => {
  const byName = detectClassEffects({
    listing_fields: { Name: 'Warlord (Marshal)' },
    body_html: ''
  });
  assert.equal(classInitiativeTotal(byName), 2);
});

test('applyClassEffects writes the class initiative contribution', () => {
  const character = createCharacter({ selections: { classId: 'class8' } });
  applyClassEffects(character, detectClassEffects(warlordEntry));
  assert.equal(character.sheet.derivedBonuses.initiativeClass, 2);
  assert.equal(character.sheet.derivedBonuses.initiative, 2);
});

test('class and background initiative bonuses compose additively', () => {
  const character = createCharacter({ selections: { classId: 'class8' } });
  applyClassEffects(character, detectClassEffects(warlordEntry));
  applyBackgroundEffects(character, [{ type: 'initiative-misc', amount: 2 }]);
  assert.equal(character.sheet.derivedBonuses.initiativeClass, 2);
  assert.equal(character.sheet.derivedBonuses.initiativeBackground, 2);
  assert.equal(character.sheet.derivedBonuses.initiative, 4);
});

test('applying background then class still composes to the full total', () => {
  const character = createCharacter({ selections: { classId: 'class8' } });
  applyBackgroundEffects(character, [{ type: 'initiative-misc', amount: 1 }]);
  applyClassEffects(character, detectClassEffects(warlordEntry));
  assert.equal(character.sheet.derivedBonuses.initiative, 3);
});

test('text fallback captures a flat initiative bonus when no override exists', () => {
  const entry = {
    id: 'class999',
    listing_fields: { Name: 'Homebrew Scout' },
    body_html: '<h3>Quick Step</h3><p>You gain a +3 bonus to initiative checks.</p>'
  };
  assert.equal(classInitiativeTotal(detectClassEffects(entry)), 3);
});

test('text fallback ignores conditional initiative phrasing', () => {
  const conditional = {
    id: 'class998',
    listing_fields: { Name: 'Edge Case Class' },
    body_html:
      '<h3>Wary</h3><p>If your initiative is higher than the target, you gain a +2 bonus to initiative.</p>' +
      '<h3>Twice</h3><p>You roll initiative twice and gain a +2 bonus to initiative.</p>'
  };
  assert.equal(classInitiativeTotal(detectClassEffects(conditional)), 0);
});

test('formatClassEffectNotes produces a labeled initiative line', () => {
  const notes = formatClassEffectNotes(detectClassEffects(warlordEntry));
  assert.deepEqual(notes, ['Initiative: +2 (Combat Leader)']);
});
