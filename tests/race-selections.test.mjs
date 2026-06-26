import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  ensureRaceSelectionsShape,
  collectRaceGrantIds,
  filterDecisionOptionsBySource,
  pruneRaceBuildChoicesForSource,
  setRaceBuildChoice,
  setRacePowerAbilityChoice,
  setRacePowerDamageChoice,
  raceSubraceComplete,
  syncRaceNotesAndGrants,
  validateRaceStep
} from '../src/character/race-selections.js';
import buildOptionsMeta from '../metadata/race-build-options.json' with { type: 'json' };

const genasiEntry = {
  id: 'race33',
  listing_fields: { Name: 'Genasi', Size: 'Medium' },
  body_html:
    '<blockquote><b>Size:</b> Medium<br><b>Elemental Origins:</b> Elemental creature.</blockquote>' +
    '<h1 class=encounterpower>Firepulse<span class=level>Genasi Racial Power</span></h1>' +
    '<p class=powerstat><b>Attack</b>: Strength + 2 vs. Reflex</p>'
};

function genasiCharacter() {
  const character = createCharacter();
  ensureRaceSelectionsShape(character);
  character.selections.raceId = 'race33';
  return character;
}

test('decision powers are not granted before the manifestation choice', () => {
  const character = genasiCharacter();
  const { racePowerIds } = collectRaceGrantIds(character, genasiEntry, null);
  assert.deepEqual(racePowerIds, []);
});

test('only the chosen manifestation power is granted', () => {
  const character = genasiCharacter();
  setRaceBuildChoice(character, 'manifestation', 'watersoul', genasiEntry, null);
  const { racePowerIds } = collectRaceGrantIds(character, genasiEntry, null);
  assert.deepEqual(racePowerIds, ['power1770']);
});

const genasiOptions = buildOptionsMeta.byRaceId.race33.decisions[0].options;

test('filterDecisionOptionsBySource returns all Genasi options when source is All', () => {
  assert.equal(filterDecisionOptionsBySource(genasiOptions, null).length, 13);
});

test('filterDecisionOptionsBySource limits Genasi options to FRPG core five', () => {
  const filtered = filterDecisionOptionsBySource(genasiOptions, ['FRPG']);
  assert.equal(filtered.length, 5);
  assert.ok(filtered.every((o) => o.sourceBook === 'FRPG'));
});

test('filterDecisionOptionsBySource limits Genasi options to Dragon 380 four', () => {
  const filtered = filterDecisionOptionsBySource(genasiOptions, ['Dra380']);
  assert.equal(filtered.length, 4);
  assert.ok(filtered.every((o) => o.sourceBook === 'Dra380'));
});

test('pruneRaceBuildChoicesForSource clears a hidden manifestation pick', () => {
  const character = genasiCharacter();
  setRaceBuildChoice(character, 'manifestation', 'watersoul', genasiEntry, null);
  const changed = pruneRaceBuildChoicesForSource(character, genasiEntry, null, ['Dra380']);
  assert.equal(changed, true);
  assert.equal(character.selections.raceBuildChoices.manifestation, undefined);
  assert.deepEqual(collectRaceGrantIds(character, genasiEntry, null).racePowerIds, []);
});

test('all thirteen Genasi manifestations are selectable', () => {
  const character = genasiCharacter();
  for (const [optionId, powerId] of [
    ['earthsoul', 'power1767'],
    ['firesoul', 'power1766'],
    ['stormsoul', 'power1769'],
    ['watersoul', 'power1770'],
    ['windsoul', 'power1828'],
    ['causticsoul', 'power10043'],
    ['cindersoul', 'power10044'],
    ['plaguesoul', 'power10045'],
    ['voidsoul', 'power10046'],
    ['embersoul', 'power14073'],
    ['magmasoul', 'power14074'],
    ['sandsoul', 'power14075'],
    ['sunsoul', 'power14076']
  ]) {
    setRaceBuildChoice(character, 'manifestation', optionId, genasiEntry, null);
    const { racePowerIds } = collectRaceGrantIds(character, genasiEntry, null);
    assert.deepEqual(racePowerIds, [powerId], `option ${optionId}`);
  }
});

// --- Dragon Breath: per-power ability + damage picks ---------------------

const dragonbornEntry = {
  id: 'race38',
  listing_fields: { Name: 'Dragonborn', Size: 'Medium' },
  body_html:
    '<blockquote><b>Size:</b> Medium</blockquote>' +
    '<p>Dragonborn gain the <a href="?view=power42">Dragon Breath</a> racial power.</p>'
};

const dragonBreathPower = {
  id: 'power42',
  listing_fields: { Name: 'Dragon Breath' },
  body_html:
    '<h1 class=encounterpower>Dragon Breath<span class=level>Dragonborn Racial Power</span></h1>' +
    '<p class=powerstat><b>Attack</b>: Constitution + 2 vs. Reflex</p>' +
    '<p class=flavor><i>Special:</i> choose Strength, Constitution, or Dexterity as the ' +
    'ability score you use when making attack rolls with this power. You also choose ' +
    "the power\u2019s damage type: acid, cold, fire, lightning, or poison.</p>"
};

function dragonbornCharacter() {
  const character = createCharacter();
  ensureRaceSelectionsShape(character);
  character.selections.raceId = 'race38';
  character.identity.race = 'Dragonborn';
  return character;
}

test('setRacePowerDamageChoice round-trips and clears', () => {
  const character = dragonbornCharacter();
  setRacePowerDamageChoice(character, 'power42', 'fire');
  assert.equal(character.selections.racePowerDamageChoices.power42, 'fire');
  setRacePowerDamageChoice(character, 'power42', '');
  assert.equal(character.selections.racePowerDamageChoices.power42, undefined);
});

test('syncRaceNotesAndGrants records reqs and annotates notes with both picks', () => {
  const character = dragonbornCharacter();
  setRacePowerAbilityChoice(character, 'power42', 'dex');
  setRacePowerDamageChoice(character, 'power42', 'fire');
  syncRaceNotesAndGrants(character, dragonbornEntry, null, [dragonBreathPower]);
  assert.deepEqual(character.selections.racePowerChoiceReqs.power42, {
    name: 'Dragon Breath',
    ability: true,
    damage: true
  });
  assert.equal(character.notes.racialPowers, 'Dragon Breath (Dexterity, fire)');
});

test('validateRaceStep requires the ability and damage picks for Dragon Breath', () => {
  const character = dragonbornCharacter();
  syncRaceNotesAndGrants(character, dragonbornEntry, null, [dragonBreathPower]);
  let errors = validateRaceStep(character, dragonbornEntry, null);
  assert.ok(errors.includes('Choose the attack ability for Dragon Breath.'));
  assert.ok(errors.includes('Choose the damage type for Dragon Breath.'));

  setRacePowerAbilityChoice(character, 'power42', 'dex');
  setRacePowerDamageChoice(character, 'power42', 'fire');
  syncRaceNotesAndGrants(character, dragonbornEntry, null, [dragonBreathPower]);
  errors = validateRaceStep(character, dragonbornEntry, null);
  assert.ok(!errors.includes('Choose the attack ability for Dragon Breath.'));
  assert.ok(!errors.includes('Choose the damage type for Dragon Breath.'));
});

// --- Subrace opt-out: play a base race that has subraces without one ------

// race2 has subraces in metadata/race-subraces.json but no build decisions.
const subraceParentEntry = {
  id: 'race2',
  listing_fields: { Name: 'Elf', Size: 'Medium' },
  body_html: '<blockquote><b>Size:</b> Medium</blockquote>'
};

function subraceParentCharacter() {
  const character = createCharacter();
  ensureRaceSelectionsShape(character);
  character.selections.raceId = 'race2';
  character.identity.race = 'Elf';
  return character;
}

test('playing a base race (None subrace) does not block the race step', () => {
  // Picking "None" confirms the base race id; subraces are optional, so this
  // is a valid finished state even though race2 has subraces.
  const character = subraceParentCharacter();
  const errors = validateRaceStep(character, subraceParentEntry, null);
  assert.ok(!errors.includes('Choose a subrace for this race.'));
  assert.equal(raceSubraceComplete(character, subraceParentEntry), true);
});

test('the race step still blocks until a race is chosen', () => {
  const character = createCharacter();
  ensureRaceSelectionsShape(character);
  assert.equal(raceSubraceComplete(character, null), false);
  const errors = validateRaceStep(character, null, null);
  assert.ok(errors.includes('Select a race from the compendium.'));
});
