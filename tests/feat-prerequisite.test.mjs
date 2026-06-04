import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmptyPrerequisite,
  featMatchesSlotTier,
  prereqPassesLevelGate,
  prereqPassesRace,
  prereqPassesClass,
  prereqPassesAbilities,
  featPassesDefaultFilter,
  filterFeatEntries
} from '../src/editor/feat-prerequisite.js';

const fighterFeat = {
  id: 'feat_fighter',
  listing_fields: {
    Name: 'Battlerage Vigor',
    Tier: 'Heroic',
    Prerequisite: 'Fighter',
    SourceBook: 'PHB'
  }
};

const dwarfFeat = {
  id: 'feat_dwarf',
  listing_fields: {
    Name: 'Dwarven Weapon Training',
    Tier: 'Heroic',
    Prerequisite: 'Dwarf',
    SourceBook: 'PHB'
  }
};

const genericFeat = {
  id: 'feat_generic',
  listing_fields: {
    Name: 'Toughness',
    Tier: 'Heroic',
    Prerequisite: '—',
    SourceBook: 'PHB'
  }
};

const strFeat = {
  id: 'feat_str',
  listing_fields: {
    Name: 'Power Attack',
    Tier: 'Heroic',
    Prerequisite: 'Str 13',
    SourceBook: 'PHB'
  }
};

describe('feat-prerequisite', () => {
  it('detects empty prerequisites', () => {
    assert.equal(isEmptyPrerequisite('—'), true);
    assert.equal(isEmptyPrerequisite('Fighter'), false);
  });

  it('matches slot tier', () => {
    assert.equal(featMatchesSlotTier('Heroic', 'Heroic'), true);
    assert.equal(featMatchesSlotTier('Paragon', 'Heroic'), false);
  });

  it('gates by level phrases', () => {
    assert.equal(prereqPassesLevelGate('21st level', 20, 21), false);
    assert.equal(prereqPassesLevelGate('11th level', 10, 11), false);
    assert.equal(prereqPassesLevelGate('Fighter', 10, 1), true);
  });

  it('filters by race', () => {
    assert.equal(prereqPassesRace('Dwarf', ['Dwarf']), true);
    assert.equal(prereqPassesRace('Dwarf', ['Human']), false);
  });

  it('filters by class name', () => {
    assert.equal(prereqPassesClass('Fighter', { className: 'Fighter' }), true);
    assert.equal(prereqPassesClass('Fighter', { className: 'Wizard' }), false);
  });

  it('filters by ability score', () => {
    assert.equal(prereqPassesAbilities('Str 13', { str: 14 }), true);
    assert.equal(prereqPassesAbilities('Str 13', { str: 12 }), false);
  });

  it('passes default filter for eligible heroic feats', () => {
    const ctx = {
      level: 1,
      raceTerms: ['Dwarf'],
      classInfo: { className: 'Fighter', role: 'Defender', powerSource: 'Martial' },
      backgroundName: '',
      abilityScores: { str: 16, con: 14, dex: 12, int: 10, wis: 10, cha: 10 },
      trainedSkills: new Set(),
      hasTrainingData: false,
      ownedFeatNames: new Set(),
      ownedFeatIds: new Set()
    };
    const slot = { id: 'feat-1', slotLevel: 1, tier: 'Heroic' };

    assert.equal(featPassesDefaultFilter(genericFeat, ctx, slot), true);
    assert.equal(featPassesDefaultFilter(fighterFeat, ctx, slot), true);
    assert.equal(featPassesDefaultFilter(dwarfFeat, ctx, slot), true);
    assert.equal(featPassesDefaultFilter(strFeat, ctx, slot), true);
  });

  it('filterFeatEntries excludes other slot picks', () => {
    const ctx = {
      level: 1,
      raceTerms: [],
      classInfo: { className: '', role: '', powerSource: '' },
      backgroundName: '',
      abilityScores: { str: 10, con: 10, dex: 10, int: 10, wis: 10, cha: 10 },
      trainedSkills: new Set(),
      hasTrainingData: false,
      ownedFeatNames: new Set(),
      ownedFeatIds: new Set()
    };
    const slot = { id: 'feat-1', slotLevel: 1, tier: 'Heroic' };
    const list = filterFeatEntries([genericFeat, fighterFeat], ctx, slot, {
      showAll: true,
      excludeIds: new Set(['feat_fighter'])
    });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'feat_generic');
  });
});
