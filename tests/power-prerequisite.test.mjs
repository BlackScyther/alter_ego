import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePowerPrerequisite,
  powerPassesPrerequisites
} from '../src/editor/power-prerequisite.js';

const fighterCtx = {
  level: 5,
  characterLevel: 5,
  raceTerms: ['human'],
  classInfo: { className: 'Fighter', role: 'Defender', powerSource: 'Martial' },
  backgroundName: '',
  abilityScores: { str: 16, con: 14, dex: 12, int: 10, wis: 10, cha: 10 },
  trainedSkills: new Set(),
  hasTrainingData: false,
  ownedFeatNames: new Set()
};

describe('power-prerequisite', () => {
  it('parses prerequisite from body_html', () => {
    const entry = {
      body_html: '<p><b>Prerequisite: </b>Fighter<br></p><p>Power text.</p>'
    };
    assert.equal(parsePowerPrerequisite(entry), 'Fighter');
  });

  it('treats empty prerequisite as pass', () => {
    const entry = { body_html: '<p>No prereq.</p>' };
    const slot = { slotLevel: 1 };
    assert.equal(powerPassesPrerequisites(entry, fighterCtx, slot), true);
  });

  it('filters by class prerequisite', () => {
    const entry = {
      body_html: '<p><b>Prerequisite: </b>Wizard<br></p>'
    };
    const slot = { slotLevel: 1 };
    assert.equal(powerPassesPrerequisites(entry, fighterCtx, slot), false);
  });

  it('passes matching class prerequisite', () => {
    const entry = {
      body_html: '<p><b>Prerequisite: </b>Fighter<br></p>'
    };
    const slot = { slotLevel: 1 };
    assert.equal(powerPassesPrerequisites(entry, fighterCtx, slot), true);
  });

  it('filters by ability score prerequisite', () => {
    const entry = {
      body_html: '<p><b>Prerequisite: </b>Str 18<br></p>'
    };
    const slot = { slotLevel: 1 };
    assert.equal(powerPassesPrerequisites(entry, fighterCtx, slot), false);
  });
});
