import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  ensureRaceSelectionsShape,
  collectRaceGrantIds,
  filterDecisionOptionsBySource,
  pruneRaceBuildChoicesForSource,
  setRaceBuildChoice,
  setRaceBonusChoice,
  setRacePowerAbilityChoice,
  setRacePowerDamageChoice,
  raceSubraceComplete,
  syncRaceNotesAndGrants,
  validateRaceStep,
  applyGenasiManifestationAbilities,
  applyRaceTraitsToSheet,
  genasiAbilityBenefitModel
} from '../src/character/race-selections.js';
import { syncBonusesFromSelections } from '../src/character/tutor.js';
import { renderRaceAbilityChoicesHostHtml } from '../src/character/race-parse.js';
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

const genasiAbilityEntry = {
  id: 'race33',
  listing_fields: { Name: 'Genasi', Size: 'Medium' },
  body_html:
    '<blockquote><b>Ability scores</b>: +2 Intelligence, +2 Constitution or +2 Strength<br></blockquote>'
};

test('Watersoul can take Intelligence instead of Constitution, with Strength', () => {
  const character = genasiCharacter();
  character.selections.raceBuildChoices.manifestation = 'watersoul';
  syncBonusesFromSelections(character, { race: genasiAbilityEntry });
  applyGenasiManifestationAbilities(character, genasiAbilityEntry);

  assert.equal(character.abilities.scores.str, 12);
  assert.equal(character.abilities.scores.int, 10);
  assert.equal(character.abilities.scores.con, 10);

  const pendingModel = genasiAbilityBenefitModel(character, genasiAbilityEntry);
  const pendingHtml = renderRaceAbilityChoicesHostHtml(
    genasiAbilityEntry,
    character.selections.raceBonusChoices,
    pendingModel
  );
  assert.match(pendingHtml, /Fixed bonus: \+2 Strength/);
  assert.match(pendingHtml, /race-ability-or/);
  assert.match(pendingHtml, />or</);
  assert.match(pendingHtml, /\+2 Constitution/);
  assert.match(pendingHtml, /\+2 Intelligence/);
  assert.doesNotMatch(pendingHtml, /You need this choice before you can continue/);
  assert.doesNotMatch(pendingHtml, /focuses Strength and Intelligence/);

  setRaceBonusChoice(character, 'ability', 'genasi-water-air', 'int');
  applyGenasiManifestationAbilities(character, genasiAbilityEntry);
  assert.equal(character.abilities.scores.str, 12);
  assert.equal(character.abilities.scores.int, 12);
  assert.equal(character.abilities.scores.con, 10);

  const model = genasiAbilityBenefitModel(character, genasiAbilityEntry);
  const html = renderRaceAbilityChoicesHostHtml(genasiAbilityEntry, character.selections.raceBonusChoices, model);
  assert.match(html, /data-value="int"/);
  assert.match(html, /data-value="con"/);
  assert.doesNotMatch(html, /data-value="str"/);
  assert.match(html, /Fixed bonus: \+2 Strength/);
  assert.match(html, /You did choose at 1st level, \+2 Intelligence/);
  assert.match(html, /Applied to your ability scores: \+2 Strength and \+2 Intelligence/);
  assert.doesNotMatch(html, /focuses Strength and Intelligence/);
  assert.doesNotMatch(html, /You need this choice before you can continue/);
});

test('Windsoul uses the same Intelligence option as Watersoul', () => {
  const character = genasiCharacter();
  character.selections.raceBuildChoices.manifestation = 'windsoul';
  assert.ok(genasiAbilityBenefitModel(character, genasiAbilityEntry));
  character.selections.raceBuildChoices.manifestation = 'firesoul';
  assert.equal(genasiAbilityBenefitModel(character, genasiAbilityEntry), null);
});

test('the race step still blocks until a race is chosen', () => {
  const character = createCharacter();
  ensureRaceSelectionsShape(character);
  assert.equal(raceSubraceComplete(character, null), false);
  const errors = validateRaceStep(character, null, null);
  assert.ok(errors.includes('Select a race from the compendium.'));
});

const genasiSheetEntry = {
  id: 'race33',
  listing_fields: { Name: 'Genasi', Size: 'Medium' },
  body_html: [
    '<b>Languages:</b> Common, Primordial<br>',
    '<b>Elemental Manifestation</b>: Choose one manifestation.<br>',
    '<i>Firesoul</i>: You gain +1 Reflex defense, resist 5 fire and the firepulse power. At 11th level, the resistance improves to 10 fire. At 21st level, the resistance improves to 15 fire.<br>',
    '<i>Watersoul</i>: You can breathe underwater. You also gain a +2 racial bonus to saving throws against ongoing damage and the swiftcurrent power.<br>',
    '<b>Elemental Origins</b>: Elemental creature.'
  ].join('')
};

test('Watersoul writes water breathing and the save bonus, not a resistance', () => {
  const character = genasiCharacter();
  character.selections.raceBuildChoices.manifestation = 'watersoul';
  applyRaceTraitsToSheet(character, genasiSheetEntry, null);
  assert.equal(character.sheet.extraFields['special-senses'], 'Water breathing');
  assert.equal(
    character.sheet.extraFields['save-mods'],
    '+2 racial bonus to saving throws against ongoing damage'
  );
  assert.equal(character.sheet.extraFields.resistances, '');
  assert.equal(character.notes.languages, 'Common, Primordial');
});

test('Firesoul writes the scaled resistance and clears Watersoul sheet values', () => {
  const character = genasiCharacter();
  character.selections.raceBuildChoices.manifestation = 'watersoul';
  applyRaceTraitsToSheet(character, genasiSheetEntry, null);
  character.selections.raceBuildChoices.manifestation = 'firesoul';
  applyRaceTraitsToSheet(character, genasiSheetEntry, null);
  assert.equal(character.sheet.extraFields['special-senses'], '');
  assert.equal(character.sheet.extraFields['save-mods'], '');
  assert.equal(
    character.sheet.extraFields.resistances,
    'Resist 5 Fire (10 at 11th, 15 at 21st)'
  );
});

test('a saved list of every Genasi resistance is cleared for Watersoul', () => {
  const character = genasiCharacter();
  const stale =
    'Resist 5 Fire, Resist 5 Lightning, Resist 5 Cold, Resist 5 Acid, Resist 5 Poison, Resist 5 Psychic';
  character.sheet.extraFields = { resistances: stale };
  character.sheet.derived = {
    race: { languages: '', resistances: stale, senses: '', saveMods: '', speedBase: null }
  };
  character.selections.raceBuildChoices.manifestation = 'watersoul';
  applyRaceTraitsToSheet(character, genasiSheetEntry, null);
  assert.equal(character.sheet.extraFields.resistances, '');
  assert.equal(character.sheet.extraFields['special-senses'], 'Water breathing');
  assert.equal(
    character.sheet.extraFields['save-mods'],
    '+2 racial bonus to saving throws against ongoing damage'
  );
});

test('a manual resistance stays when the manifestation resistance changes', () => {
  const character = genasiCharacter();
  character.selections.raceBuildChoices.manifestation = 'firesoul';
  applyRaceTraitsToSheet(character, genasiSheetEntry, null);
  character.sheet.extraFields.resistances += '\nResist 5 necrotic';
  character.selections.raceBuildChoices.manifestation = 'watersoul';
  applyRaceTraitsToSheet(character, genasiSheetEntry, null);
  assert.equal(character.sheet.extraFields.resistances, 'Resist 5 necrotic');
  assert.equal(character.sheet.extraFields['special-senses'], 'Water breathing');
});

test('race notes use the short manifestation line', () => {
  const character = genasiCharacter();
  setRaceBuildChoice(character, 'manifestation', 'watersoul', genasiSheetEntry, null);
  assert.match(
    character.notes.raceFeatures,
    /Elemental Manifestation: Watersoul\. Breathe underwater\. \+2 saves vs ongoing damage\. Swiftcurrent/
  );
  assert.doesNotMatch(character.notes.raceFeatures, /Choose one manifestation/);
});
