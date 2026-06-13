import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCharacter } from '../src/character/model.js';
import {
  syncClassTraitsToSheet,
  syncClassNotesAndGrants,
  setClassBuildChoice,
  toggleClassTrainedSkill,
  getClassTrainedSkillCheckboxState,
  seedClassTrainedSkillChoices,
  seedClassPowerSelections,
  applyRecommendedClassPowers,
  getRecommendedPowerSeeds,
  hasRecommendedClassPowers,
  validateClassStep
} from '../src/character/class-selections.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', 'class-html', name), 'utf8');

const clericEntry = {
  id: 'class2',
  listing_fields: { Name: 'Cleric (Templar)', RoleName: 'Leader' },
  body_html: fixture('cleric-templar.html')
};

const warlordEntry = {
  id: 'class8',
  listing_fields: { Name: 'Warlord (Marshal)', RoleName: 'Leader' },
  body_html: fixture('warlord-marshal.html')
};

const ardentEntry = {
  id: 'class529',
  listing_fields: { Name: 'Ardent', RoleName: 'Leader' },
  body_html: `<blockquote><b>CLASS TRAITS</b><br><br><b>Trained Skills</b>: From the class skills list below, choose 4 trained skills at 1st level.<br><i>Class Skills</i>: Arcana (Int), Athletics (Str), Bluff (Cha), Diplomacy (Cha), Endurance (Con), Heal (Wis), Insight (Wis), Intimidate (Cha), Streetwise (Cha).<br><br><b>Build Options: </b>Enlightened Ardent, Euphoric Ardent, Impetuous Ardent.<br></blockquote><h3>ENLIGHTENED ARDENT</h3><b>Suggested Skills</b>: Bluff, Diplomacy, Heal, Insight<br><h3>EUPHORIC ARDENT</h3><b>Suggested Skills</b>: Athletics, Endurance, Intimidate, Streetwise<br>`
};

test('syncClassTraitsToSheet applies defenses, HP, surges, and trained skills', () => {
  const character = createCharacter({
    identity: { level: 1 },
    abilities: { scores: { str: 10, con: 14, dex: 10, int: 10, wis: 16, cha: 10 } }
  });
  character.selections.classTrainedSkillChoices = ['heal', 'insight', 'diplomacy'];

  syncClassTraitsToSheet(character, clericEntry);

  assert.equal(character.sheet.defenses.will.class, 2);
  assert.equal(character.sheet.hp.max, 12 + 14);
  assert.equal(character.sheet.hp.surgesPerDay, 7 + 2);
  assert.ok(character.selections.trainedSkillIds.includes('religion'));
  assert.ok(character.selections.trainedSkillIds.includes('heal'));
});

test('setClassBuildChoice seeds power selections for Warlord', () => {
  const character = createCharacter({ identity: { level: 1 } });
  character.selections.classId = 'class8';

  setClassBuildChoice(character, 'build', 'bravura-warlord', warlordEntry);

  assert.equal(character.selections.classBuildChoices.build, 'bravura-warlord');
  assert.equal(character.selections.powerSelections['power-atwill-1-a'], 'power1063');
  assert.equal(character.selections.powerSelections['power-daily-1'], 'power239');
  assert.ok(character.selections.classPowerIds.includes('power1590'));
  assert.ok(character.notes.classFeatures.includes('Build option: Bravura Warlord'));
});

test('toggleClassTrainedSkill respects choose count', () => {
  const character = createCharacter();
  character.selections.classId = 'class8';

  toggleClassTrainedSkill(character, 'athletics', warlordEntry);
  toggleClassTrainedSkill(character, 'diplomacy', warlordEntry);
  toggleClassTrainedSkill(character, 'heal', warlordEntry);
  toggleClassTrainedSkill(character, 'intimidate', warlordEntry);
  toggleClassTrainedSkill(character, 'history', warlordEntry);

  assert.equal(character.selections.classTrainedSkillChoices.length, 4);
  assert.ok(!character.selections.classTrainedSkillChoices.includes('history'));
});

test('getClassTrainedSkillCheckboxState enables italic Class Skills pool (Ardent)', () => {
  const character = createCharacter();
  character.selections.classId = 'class529';

  const bluff = getClassTrainedSkillCheckboxState(character, ardentEntry, 'bluff');
  assert.equal(bluff.editable, true);
  assert.match(bluff.title ?? '', /4 class skills remaining/);

  const acrobatics = getClassTrainedSkillCheckboxState(character, ardentEntry, 'acrobatics');
  assert.equal(acrobatics.editable, false);
});

test('seedClassTrainedSkillChoices applies build suggested skills', () => {
  const character = createCharacter();
  character.selections.classId = 'class529';
  character.selections.classBuildChoices = { build: 'enlightened-ardent' };

  seedClassTrainedSkillChoices(character, ardentEntry);
  assert.deepEqual(character.selections.classTrainedSkillChoices, [
    'bluff',
    'diplomacy',
    'heal',
    'insight'
  ]);

  syncClassTraitsToSheet(character, ardentEntry);
  assert.equal(character.sheet.skills.bluff?.trained, true);
  assert.equal(character.sheet.skills.heal?.trained, true);
  assert.equal(character.sheet.skills.athletics?.trained, false);
});

test('setClassBuildChoice reseeds trained skills when build changes', () => {
  const character = createCharacter();
  character.selections.classId = 'class529';
  character.selections.classBuildChoices = { build: 'enlightened-ardent' };
  character.selections.classTrainedSkillChoices = ['bluff', 'diplomacy', 'heal', 'insight'];

  setClassBuildChoice(character, 'build', 'euphoric-ardent', ardentEntry);
  assert.deepEqual(character.selections.classTrainedSkillChoices, [
    'athletics',
    'endurance',
    'intimidate',
    'streetwise'
  ]);
});

test('getClassTrainedSkillCheckboxState enables pool skills until quota, then only selected', () => {
  const character = createCharacter();
  character.selections.classId = 'class8';

  let heal = getClassTrainedSkillCheckboxState(character, warlordEntry, 'heal');
  assert.equal(heal.editable, true);
  assert.match(heal.title ?? '', /4 class skills remaining/);

  character.selections.classTrainedSkillChoices = ['athletics', 'diplomacy', 'heal', 'intimidate'];
  heal = getClassTrainedSkillCheckboxState(character, warlordEntry, 'heal');
  assert.equal(heal.editable, true);

  const history = getClassTrainedSkillCheckboxState(character, warlordEntry, 'history');
  assert.equal(history.editable, false);
  assert.match(history.title ?? '', /Deselect one to switch/);

  const religion = getClassTrainedSkillCheckboxState(character, clericEntry, 'religion');
  assert.equal(religion.editable, false);
  assert.match(religion.title ?? '', /Fixed class trained skill/);
});

test('syncClassTraitsToSheet clears training when class skill choice is removed', () => {
  const character = createCharacter({ identity: { level: 1 } });
  character.selections.classTrainedSkillChoices = ['heal', 'insight', 'diplomacy'];
  syncClassTraitsToSheet(character, clericEntry);
  assert.equal(character.sheet.skills.heal?.trained, true);

  character.selections.classTrainedSkillChoices = ['heal', 'insight'];
  syncClassTraitsToSheet(character, clericEntry);
  assert.equal(character.sheet.skills.diplomacy?.trained, false);
});

test('validateClassStep requires build and trained skill choices', () => {
  const character = createCharacter();
  character.selections.classId = 'class8';

  let errors = validateClassStep(character, warlordEntry);
  assert.ok(errors.some((e) => /build/i.test(e)));
  assert.ok(errors.some((e) => /trained/i.test(e)));

  character.selections.classBuildChoices = { build: 'tactical-warlord' };
  character.selections.classTrainedSkillChoices = ['athletics', 'diplomacy', 'heal', 'intimidate'];
  errors = validateClassStep(character, warlordEntry);
  assert.equal(errors.length, 0);
});

test('seedClassPowerSelections does not overwrite existing slot picks', () => {
  const character = createCharacter({ identity: { level: 1 } });
  character.selections.classBuildChoices = { build: 'bravura-warlord' };
  character.selections.powerSelections = { 'power-atwill-1-a': 'power99' };

  seedClassPowerSelections(character, warlordEntry);

  assert.equal(character.selections.powerSelections['power-atwill-1-a'], 'power99');
  assert.equal(character.selections.powerSelections['power-atwill-1-b'], 'power620');
});

test('applyRecommendedClassPowers overwrites slots from build metadata', () => {
  const character = createCharacter({ identity: { level: 1 } });
  character.selections.classBuildChoices = { build: 'tactical-warlord' };
  character.selections.powerSelections = {
    'power-atwill-1-a': 'power99',
    'power-encounter-1': 'power99'
  };

  applyRecommendedClassPowers(character, warlordEntry);

  assert.equal(character.selections.powerSelections['power-atwill-1-a'], 'power1061');
  assert.equal(character.selections.powerSelections['power-atwill-1-b'], 'power620');
  assert.equal(character.selections.powerSelections['power-encounter-1'], 'power1064');
  assert.equal(character.selections.powerSelections['power-daily-1'], 'power431');
});

test('hasRecommendedClassPowers is false without build seeds', () => {
  const character = createCharacter({ identity: { level: 1 } });
  character.selections.classId = 'class2';
  assert.equal(hasRecommendedClassPowers(character, clericEntry), false);
});

test('getRecommendedPowerSeeds returns build label and slot map', () => {
  const character = createCharacter({ identity: { level: 1 } });
  character.selections.classBuildChoices = { build: 'bravura-warlord' };

  const rec = getRecommendedPowerSeeds(character, warlordEntry);
  assert.equal(rec.buildLabel, 'Bravura Warlord');
  assert.equal(rec.seeds['power-daily-1'], 'power239');
});
