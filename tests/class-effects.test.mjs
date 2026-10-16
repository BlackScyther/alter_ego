import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectClassEffects,
  applyClassEffects,
  applyFeatInitiative,
  classFeatureSkillBonusRows,
  classInitiativeTotal,
  featInitiativeTotal,
  formatClassEffectNotes
} from '../src/character/class-effects.js';
import { syncBonusesFromSelections } from '../src/character/tutor.js';
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

const warlordFeaturesHtml = `
<blockquote><b>CLASS TRAITS</b><br>
<b>Build Options: </b>Insightful Warlord, Tactical Warlord.<br>
</blockquote>
<h3>INSIGHTFUL WARLORD</h3>
<p><b>Class Feature</b>: Insightful Presence, Canny Leader</p>
<h3>TACTICAL WARLORD</h3>
<p>Quick commands.</p>
<h3>WARLORD (MARSHAL) CLASS FEATURES</h3>
<b>CANNY LEADER</b><br>This class feature replaces your Combat Leader class feature. You and any ally within 10 squares of you who can see and hear you gain a +2 bonus to Insight checks and Perception checks.
<b>COMBAT LEADER</b><br>You and each ally within 10 squares who can see and hear you gain a +2 power bonus to initiative. In addition, when an ally spends an action point, that ally gains a +2 bonus to initiative.
<b>COMMANDING PRESENCE</b><br>Choose one of the following presence benefits.
<b>Tactical Presence</b><br>When an ally spends an action point to make an attack, the ally gains a +2 bonus to attack rolls.
`;

const warlordFeaturesEntry = {
  id: 'class8',
  listing_fields: { Name: 'Warlord (Marshal)' },
  body_html: warlordFeaturesHtml
};

const improvedInitiative = {
  id: 'feat272',
  listing_fields: { Name: 'Improved Initiative' },
  body_html: '<p class=flavor><b>Benefit</b>: You gain a +4 feat bonus to initiative.</p>'
};

test('Tactical Warlord Combat Leader is +2 and ignores the action-point sentence', () => {
  const effects = detectClassEffects(warlordFeaturesEntry, { buildLabel: 'Tactical Warlord' });
  assert.equal(classInitiativeTotal(effects), 2);
  assert.equal(effects.filter((e) => e.type === 'initiative-misc').length, 1);
  assert.equal(effects.find((e) => e.type === 'initiative-misc').feature, 'Combat Leader');
});

test('Insightful Warlord drops Combat Leader and keeps Canny Leader skills', () => {
  const effects = detectClassEffects(warlordFeaturesEntry, { buildLabel: 'Insightful Warlord' });
  assert.equal(classInitiativeTotal(effects), 0);
  const skills = effects.filter((e) => e.type === 'skill-bonus').map((e) => e.skill).sort();
  assert.deepEqual(skills, ['insight', 'perception']);
  const character = createCharacter({
    selections: { classBuildChoices: { build: 'insightful-warlord' } }
  });
  const rows = classFeatureSkillBonusRows(character, warlordFeaturesEntry);
  assert.deepEqual(rows.map((r) => r.skill).sort(), ['insight', 'perception']);
  assert.equal(rows[0].source, 'class');
  assert.equal(rows[0].amount, 2);
});

test('Improved Initiative +4 and Combat Leader +2 combine to 6', () => {
  const character = createCharacter({
    selections: {
      classId: 'class8',
      classBuildChoices: { build: 'tactical-warlord' },
      featIds: ['feat272']
    },
    sheet: { initMisc: 4 }
  });
  syncBonusesFromSelections(character, { class: warlordFeaturesEntry }, [improvedInitiative]);
  assert.equal(character.sheet.derivedBonuses.initiativeClass, 2);
  assert.equal(character.sheet.derivedBonuses.initiativeFeat, 4);
  assert.equal(character.sheet.derivedBonuses.initiative, 6);
  assert.equal(character.sheet.initMisc, 0);
  assert.equal(featInitiativeTotal([improvedInitiative]), 4);
});

test('a different Misc value still adds on top of the calculated 6', () => {
  const character = createCharacter({
    selections: { classBuildChoices: { build: 'tactical-warlord' } },
    sheet: { initMisc: 1 }
  });
  applyClassEffects(
    character,
    detectClassEffects(warlordFeaturesEntry, { buildLabel: 'Tactical Warlord' })
  );
  applyFeatInitiative(character, featInitiativeTotal([improvedInitiative]));
  assert.equal(character.sheet.derivedBonuses.initiative, 6);
  assert.equal(character.sheet.initMisc, 1);
});
