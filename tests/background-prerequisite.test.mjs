import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBackgroundPrerequisite,
  prereqMatchesAnyRace,
  prereqMatchesOnlyOwnRace,
  backgroundPassesRaceFilter,
  filterBackgroundEntries
} from '../src/editor/background-prerequisite.js';

const dwarfBg = {
  listing_fields: { Name: 'Dwarf - Outcast', Type: 'Racial' },
  body_html: '<b>Prerequisite: </b>Dwarf<br>'
};

const dragonBg = {
  listing_fields: { Name: 'Dragonborn Iconoclast', Type: 'Racial' },
  body_html: '<b>Prerequisite: </b>Dragonborn<br>'
};

const acolyte = {
  listing_fields: { Name: 'Acolyte', Type: 'Occupation' },
  body_html: '<p>No prerequisite line.</p>'
};

const psionicBg = {
  listing_fields: { Name: 'Astronomer', Type: 'Occupation' },
  body_html: '<b>Prerequisite: </b>Psionic<br>'
};

const dwarfTerms = ['Dwarf'];

describe('background-prerequisite', () => {
  it('parses prerequisite from flavortext', () => {
    assert.equal(parseBackgroundPrerequisite(dwarfBg), 'Dwarf');
    assert.equal(parseBackgroundPrerequisite(acolyte), null);
  });

  it('eligible mode for Dwarf', () => {
    const entries = [dwarfBg, dragonBg, acolyte, psionicBg];
    const out = filterBackgroundEntries(entries, 'eligible', dwarfTerms);
    assert.ok(out.some((e) => e.listing_fields.Name === 'Dwarf - Outcast'));
    assert.ok(out.some((e) => e.listing_fields.Name === 'Acolyte'));
    assert.equal(
      out.some((e) => e.listing_fields.Name === 'Dragonborn Iconoclast'),
      false
    );
    assert.equal(out.some((e) => e.listing_fields.Name === 'Astronomer'), false);
  });

  it('own-race mode for Dwarf', () => {
    const entries = [dwarfBg, dragonBg, acolyte, psionicBg];
    const out = filterBackgroundEntries(entries, 'own-race', dwarfTerms);
    assert.equal(out.length, 1);
    assert.equal(out[0].listing_fields.Name, 'Dwarf - Outcast');
  });

  it('all mode shows everything', () => {
    const entries = [dwarfBg, dragonBg, acolyte, psionicBg];
    assert.equal(filterBackgroundEntries(entries, 'all', dwarfTerms).length, 4);
  });

  it('prereqMatchesOnlyOwnRace', () => {
    assert.equal(prereqMatchesOnlyOwnRace('Dwarf', dwarfTerms), true);
    assert.equal(prereqMatchesOnlyOwnRace('Foulborn Heritage feat', dwarfTerms), false);
  });

  it('prereqMatchesAnyRace word boundary', () => {
    assert.equal(prereqMatchesAnyRace('Dragonborn', ['Dragonborn']), true);
    assert.equal(prereqMatchesAnyRace('Dragonborn', dwarfTerms), false);
  });
});
