import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import { syncRaceNotesAndGrants, resetRaceDerivedSelections } from '../src/character/race-selections.js';
import {
  collectClassGrantIds,
  syncClassNotesAndGrants,
  resetClassDerivedSelections
} from '../src/character/class-selections.js';
import { writeGrantGroup } from '../src/character/grant-slots.js';
import { characterToSheetPayload } from '../src/character/sheet-bridge.js';
import { getSheetMirrorTabs } from '../src/editor/sheet-mirror-fields.js';

const dragonborn = {
  id: 'race38',
  listing_fields: { Name: 'Dragonborn', Size: 'Medium' },
  body_html:
    '<p>You gain the <a href="?view=power42">Dragon Breath</a> power and the <a href="?view=feat77">Dragonborn Frenzy</a> feat.</p>'
};

const dragonBreath = {
  id: 'power42',
  listing_fields: { Name: 'Dragon Breath' },
  body_html:
    '<h1 class=encounterpower>Dragon Breath<span class=level>Dragonborn Racial Power</span></h1>' +
    '<p class=powerstat><b>Attack</b>: Constitution + 2 vs. Reflex</p>' +
    '<p class=flavor><i>Special:</i> choose Strength, Constitution, or Dexterity as the ' +
    'ability score you use when making attack rolls with this power. You also choose ' +
    "the power\u2019s damage type: acid, cold, fire, lightning, or poison.</p>"
};

test('race selection stores race powers and race feats as categorized slots', () => {
  const character = createCharacter();
  character.selections.raceId = 'race38';
  character.selections.racePowerAbilityChoices = { power42: 'dex' };
  character.selections.racePowerDamageChoices = { power42: 'fire' };
  syncRaceNotesAndGrants(character, dragonborn, null, [dragonBreath], {
    grantNameById: new Map([
      ['power42', 'Dragon Breath'],
      ['feat77', 'Dragonborn Frenzy']
    ])
  });

  assert.deepEqual(
    character.selections.grantSlots.racePowers.map((slot) => slot.name),
    ['Dragon Breath (Dexterity, fire)']
  );
  assert.equal(character.selections.grantSlots.racePowers[0].category, 'race-power');
  assert.deepEqual(
    character.selections.grantSlots.raceFeats.map((slot) => ({ id: slot.id, name: slot.name, category: slot.category })),
    [{ id: 'feat77', name: 'Dragonborn Frenzy', category: 'race-feat' }]
  );
  assert.equal(character.notes.raceFeats, 'Dragonborn Frenzy');
  assert.equal(character.notes.racialPowers, 'Dragon Breath (Dexterity, fire)');

  resetRaceDerivedSelections(character);
  assert.deepEqual(character.selections.grantSlots.racePowers, []);
  assert.deepEqual(character.selections.grantSlots.raceFeats, []);
  assert.equal(character.notes.racialPowers, '');
  assert.equal(character.notes.raceFeats, '');
});

test('class selection stores class powers and class feats as categorized slots', () => {
  const entry = {
    id: 'class1',
    listing_fields: { Name: 'Fighter' },
    body_html: '<p>You gain <a href="?view=power10">Cleave</a> and <a href="?view=feat3">Weapon Focus</a>.</p>'
  };
  const character = createCharacter();
  character.selections.classId = 'class1';
  const grants = collectClassGrantIds(character, entry);
  assert.deepEqual(grants.classPowerIds, ['power10']);
  assert.deepEqual(grants.classFeatIds, ['feat3']);

  syncClassNotesAndGrants(
    character,
    entry,
    [{ id: 'power10', listing_fields: { Name: 'Cleave' } }],
    [{ id: 'feat3', listing_fields: { Name: 'Weapon Focus' } }]
  );
  assert.equal(character.selections.grantSlots.classPowers[0].category, 'class-power');
  assert.equal(character.selections.grantSlots.classPowers[0].name, 'Cleave');
  assert.equal(character.selections.grantSlots.classFeats[0].name, 'Weapon Focus');
  assert.equal(character.selections.grantSlots.classFeats[0].category, 'class-feat');
  assert.equal(character.notes.classPowers, 'Cleave');
  assert.equal(character.notes.classFeats, 'Weapon Focus');

  const sheet = characterToSheetPayload(character);
  assert.ok(sheet['class-powers'].includes('Cleave'));
  assert.ok(sheet.feats.includes('Weapon Focus'));

  resetClassDerivedSelections(character);
  assert.deepEqual(character.selections.classFeatIds, []);
  assert.deepEqual(character.selections.grantSlots.classPowers, []);
  assert.deepEqual(character.selections.grantSlots.classFeats, []);
});

test('a later sync does not replace a resolved grant name with a raw id', () => {
  const character = createCharacter();
  writeGrantGroup(character, 'classPowers', [{ id: 'power10', name: 'Cleave' }]);
  writeGrantGroup(character, 'classPowers', [{ id: 'power10', name: 'power10' }]);
  assert.equal(character.selections.grantSlots.classPowers[0].name, 'Cleave');
});

test('sheet mirror grant categories are read-only slot lists', () => {
  const collection = getSheetMirrorTabs().find((tab) => tab.id === 'collection');
  const grantSection = collection.sections.find((section) => section.layout === 'grant-slots');
  assert.ok(grantSection);
  assert.deepEqual(grantSection.fields, []);
  const labels = collection.sections.flatMap((section) => section.fields.map((field) => field.id));
  assert.ok(!labels.includes('racial-powers'));
  assert.ok(!labels.includes('class-powers'));
  const chosen = collection.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === 'chosen-powers');
  assert.equal(chosen.readonly, false);
});
