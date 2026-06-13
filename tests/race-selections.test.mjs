import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  ensureRaceSelectionsShape,
  collectRaceGrantIds,
  filterDecisionOptionsBySource,
  pruneRaceBuildChoicesForSource,
  setRaceBuildChoice
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
