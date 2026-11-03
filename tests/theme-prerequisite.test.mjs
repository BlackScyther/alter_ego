import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import { validateThemeStep } from '../src/character/theme-selections.js';
import {
  themePassesEligibility,
  themePassesFilters,
  themeSettingIdsForSource,
  themeSourceMatchesSetting
} from '../src/editor/theme-prerequisite.js';

const human = { raceTerms: ['Human'], raceOrigin: 'Natural' };
const drow = { raceTerms: ['Drow'], raceOrigin: 'Fey' };
const eladrin = { raceTerms: ['Eladrin'], raceOrigin: 'Fey' };
const halfElf = { raceTerms: ['Half-Elf'] };
const dwarf = { raceTerms: ['Dwarf'], raceOrigin: 'Natural' };

function entry(name, prereq, book) {
  return {
    id: name,
    listing_fields: { Name: name, Prerequisite: prereq, SourceBook: book },
    body_html: ''
  };
}

describe('theme prerequisites', () => {
  it('lets a theme with no prerequisite through', () => {
    assert.equal(themePassesEligibility('', human), true);
    assert.equal(themePassesEligibility('—', human), true);
  });

  it('matches named races and does not treat half-elf as elf', () => {
    assert.equal(themePassesEligibility('Human', human), true);
    assert.equal(themePassesEligibility('Drow', human), false);
    assert.equal(themePassesEligibility('Human or half-elf.', human), true);
    assert.equal(themePassesEligibility('Eladrin, elf, or half-elf', human), false);
    assert.equal(themePassesEligibility('Eladrin, elf, or half-elf', halfElf), true);
    assert.equal(themePassesEligibility('Eladrin, elf, or half-elf', { raceTerms: ['Elf'] }), true);
    assert.equal(themePassesEligibility('Human, shadar-kai, or shade', { raceTerms: ['Shade'] }), true);
    assert.equal(themePassesEligibility('Human, shadar-kai, or shade', { raceTerms: ['Shadar-kai'] }), true);
  });

  it('uses fey origin and still excludes drow from fey-but-not-drow', () => {
    assert.equal(themePassesEligibility('Any fey race but drow', eladrin), true);
    assert.equal(themePassesEligibility('Any fey race but drow', drow), false);
    assert.equal(themePassesEligibility('Any fey race but drow', dwarf), false);
    assert.equal(themePassesEligibility('Any fey race but drow', { raceTerms: ['Gnome'] }), true);
    assert.equal(
      themePassesEligibility('Half-elf, or any race that has the fey origin.', halfElf),
      true
    );
    assert.equal(
      themePassesEligibility('Half-elf, or any race that has the fey origin.', eladrin),
      true
    );
    assert.equal(
      themePassesEligibility('Half-elf, or any race that has the fey origin.', dwarf),
      false
    );
  });

  it('does not hide a race gate when the race is not chosen yet', () => {
    assert.equal(themePassesEligibility('Drow', {}), true);
  });

  it('ignores gender and checks drow plus divine class', () => {
    const prereq = 'Female, drow, any divine class.';
    assert.equal(
      themePassesEligibility(prereq, { ...drow, className: 'Cleric', powerSource: 'Divine' }),
      true
    );
    assert.equal(
      themePassesEligibility(prereq, { ...drow, className: 'Fighter', powerSource: 'Martial' }),
      false
    );
    assert.equal(themePassesEligibility(prereq, drow), true);
  });

  it('checks class, power source, role, and wizard build only when those facts exist', () => {
    assert.equal(themePassesEligibility('Wizard', { className: 'Fighter' }), false);
    assert.equal(themePassesEligibility('Wizard', {}), true);
    assert.equal(
      themePassesEligibility('Unaligned, good, or lawful good wizard or sorcerer', {
        className: 'Sorcerer',
        alignment: 'Good'
      }),
      true
    );
    assert.equal(
      themePassesEligibility('Wizard (mage)', { className: 'Wizard', buildLabel: 'Mage' }),
      true
    );
    assert.equal(
      themePassesEligibility('Wizard (mage)', { className: 'Wizard', buildLabel: 'Arcanist' }),
      false
    );
    assert.equal(themePassesEligibility('Wizard (mage)', { className: 'Wizard' }), true);
    assert.equal(
      themePassesEligibility('Drow, any martial class or defender role.', {
        ...drow,
        className: 'Battlemind',
        role: 'Defender',
        powerSource: 'Psionic'
      }),
      true
    );
    assert.equal(
      themePassesEligibility('Drow, any arcane class.', {
        ...drow,
        className: 'Wizard',
        powerSource: 'Arcane'
      }),
      true
    );
    assert.equal(
      themePassesEligibility('Drow, any arcane class.', {
        ...human,
        className: 'Wizard',
        powerSource: 'Arcane'
      }),
      false
    );
  });

  it('checks alignment, Diplomacy, and spellbook only after those facts exist', () => {
    assert.equal(themePassesEligibility('Good or lawful good alignment', {}), true);
    assert.equal(
      themePassesEligibility('Good or lawful good alignment', { alignment: 'Lawful Good' }),
      true
    );
    assert.equal(
      themePassesEligibility('Good or lawful good alignment', { alignment: 'Evil' }),
      false
    );
    assert.equal(themePassesEligibility('You must be trained in Diplomacy.', {}), true);
    assert.equal(
      themePassesEligibility('You must be trained in Diplomacy.', {
        hasTrainingData: true,
        trainedSkills: new Set(['bluff'])
      }),
      false
    );
    assert.equal(
      themePassesEligibility('You must be trained in Diplomacy.', {
        hasTrainingData: true,
        trainedSkills: new Set(['diplomacy'])
      }),
      true
    );
    const spellbook = 'Wizard. You must be able to prepare spells from a spellbook';
    assert.equal(themePassesEligibility(spellbook, { className: 'Wizard' }), true);
    assert.equal(
      themePassesEligibility(spellbook, {
        className: 'Wizard',
        hasClassFeatures: true,
        hasSpellbook: false
      }),
      false
    );
    assert.equal(
      themePassesEligibility(spellbook, {
        className: 'Wizard',
        hasClassFeatures: true,
        hasSpellbook: true
      }),
      true
    );
  });

  it('maps source books onto setting groups', () => {
    assert.deepEqual(themeSettingIdsForSource('Dra399'), ['generic']);
    assert.deepEqual(themeSettingIdsForSource('Dra404'), ['dragon']);
    assert.deepEqual(themeSettingIdsForSource('Dra413'), ['drow']);
    assert.deepEqual(themeSettingIdsForSource('Council of Spiders'), ['drow']);
    assert.deepEqual(themeSettingIdsForSource('NCS'), ['neverwinter']);
    assert.deepEqual(themeSettingIdsForSource('DSCS'), ['dark-sun']);
    assert.deepEqual(themeSettingIdsForSource('HotEC'), ['elemental']);
    assert.deepEqual(themeSettingIdsForSource('HotF'), ['feywild']);
    assert.deepEqual(themeSettingIdsForSource('DSH'), ['underdark']);
    assert.deepEqual(themeSettingIdsForSource('The Book of Vile Darkness'), ['vile']);
    assert.equal(themeSourceMatchesSetting('Other Book', 'dragon'), false);
    assert.equal(themeSourceMatchesSetting('Other Book', 'all'), true);
  });

  it('eligible hides a failed race and all does not', () => {
    const theme = entry('Heir of Delzoun', 'Dwarf', 'NCS');
    assert.equal(themePassesFilters(theme, { mode: 'eligible', ctx: human }), false);
    assert.equal(themePassesFilters(theme, { mode: 'all', ctx: human }), true);
    assert.equal(
      themePassesFilters(theme, { mode: 'eligible', settingId: 'neverwinter', ctx: dwarf }),
      true
    );
    assert.equal(
      themePassesFilters(theme, { mode: 'eligible', settingId: 'dark-sun', ctx: dwarf }),
      false
    );
  });

  it('warns without clearing a saved theme that no longer matches', () => {
    const character = createCharacter();
    character.selections.themeId = 'theme-drow';
    character.identity.theme = 'Bregan D\'aerthe Spy';
    character.selections.themePrerequisite = 'Drow';
    const messages = validateThemeStep(character, null, human);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Bregan D'aerthe Spy/);
    assert.match(messages[0], /Drow/);
    assert.match(messages[0], /unchanged/);
    assert.equal(character.selections.themeId, 'theme-drow');
  });
});
