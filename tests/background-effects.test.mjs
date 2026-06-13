import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBackgroundEffects,
  renderBackgroundEffectSections,
  validateBackgroundEffects,
  applyBackgroundEffects
} from '../src/character/background-effects.js';
import { parseBackgroundEntry, renderBackgroundPreviewHtml } from '../src/character/background-parse.js';
import { createCharacter } from '../src/character/model.js';
import { computeLevel1MaxHp } from '../src/character/hp.js';
import { syncBackgroundEffects } from '../src/character/tutor.js';

const auspiciousHtml = `<p class=flavortext><b>Type: </b>Campaign<br><b>Campaign Setting: </b>Scales of War Adventure Path<br></p>
<p>I was born on the slopes of Mount Emberstare during an eclipse.</p>
<p>You substitute your highest ability score for Constitution to determine your initial hit points.</p>`;

const auspiciousEntry = {
  id: 'background.auspicious-birth',
  listing_fields: { Name: 'Auspicious Birth', Type: 'Campaign', Campaign: 'Scales of War Adventure Path' },
  body_html: auspiciousHtml
};

const grittyHtml = `<p class=flavortext><b>Type: </b>Campaign<br></p>
<p>You gain proficiency in a simple or military weapon of your choice, and you gain a +1 bonus to initiative checks.</p>`;

const grittyEntry = {
  id: 'background.gritty-sergeant',
  listing_fields: { Name: 'Gritty Sergeant', Type: 'Campaign' },
  body_html: grittyHtml
};

const scholarEntry = {
  id: 'background-scholar',
  listing_fields: { Name: 'Occupation - Scholar', Type: 'Occupation' },
  body_html: `<p><b>Associated Skills:</b> Arcana, History, Religion</p>
<p><b>Skill Bonus:</b> Choose one associated skill. You gain a +2 bonus to checks with that skill, or choose two associated skills. You gain a +1 bonus to checks with those skills.</p>`
};

test('detectBackgroundEffects finds hp-con-substitute for Auspicious Birth', () => {
  const parsed = parseBackgroundEntry(auspiciousEntry);
  assert.ok(parsed.effects.some((e) => e.type === 'hp-con-substitute'));
  assert.equal(parsed.effects.some((e) => e.type === 'initiative-misc'), false);
});

test('detectBackgroundEffects finds initiative-misc for Gritty Sergeant', () => {
  const parsed = parseBackgroundEntry(grittyEntry);
  const init = parsed.effects.filter((e) => e.type === 'initiative-misc');
  assert.equal(init.length, 1);
  assert.equal(init[0].amount, 1);
});

test('Scholar background does not false-detect HP or initiative effects', () => {
  const parsed = parseBackgroundEntry(scholarEntry);
  assert.equal(parsed.skillBonusKind, 'choice');
  assert.equal(parsed.effects.some((e) => e.type === 'hp-con-substitute'), false);
  assert.equal(parsed.effects.some((e) => e.type === 'initiative-misc'), false);
});

test('renderBackgroundPreviewHtml shows HP ability picker for Auspicious Birth', () => {
  const html = renderBackgroundPreviewHtml(auspiciousEntry, {
    effectChoices: { hpSubstituteAbility: null }
  });
  assert.match(html, /background-hp-ability-btn/);
  assert.match(html, /data-ability="dex"/);
  assert.doesNotMatch(html, /data-ability="con"/);
});

test('validateBackgroundEffects requires HP substitute choice', () => {
  const parsed = parseBackgroundEntry(auspiciousEntry);
  const errors = validateBackgroundEffects(parsed.effects, { hpSubstituteAbility: null });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Constitution/);
});

test('computeLevel1MaxHp uses substitute ability score', () => {
  const character = createCharacter({
    identity: { level: 1 },
    selections: { classId: 'class1' },
    abilities: { scores: { str: 10, con: 12, dex: 16, int: 10, wis: 10, cha: 10 } },
    sheet: {
      derivedBonuses: { hpSubstituteAbility: 'dex', hpSubstituteScore: 16, initiative: 0 }
    }
  });
  const maxHp = computeLevel1MaxHp(character, { id: 'class1' });
  assert.equal(maxHp, 46);
});

test('syncBackgroundEffects applies initiative derived bonus', () => {
  const character = createCharacter({
    selections: { backgroundId: grittyEntry.id }
  });
  syncBackgroundEffects(character, grittyEntry);
  assert.equal(character.sheet.derivedBonuses.initiative, 1);
});

test('applyBackgroundEffects auto-fills level-1 HP when class known', () => {
  const character = createCharacter({
    identity: { level: 1 },
    selections: {
      backgroundEffectChoices: { hpSubstituteAbility: 'dex' }
    },
    abilities: { scores: { str: 10, con: 10, dex: 16, int: 10, wis: 10, cha: 10 } },
    sheet: { hp: { max: 0, current: 0 } }
  });
  const parsed = parseBackgroundEntry(auspiciousEntry);
  const effects = detectBackgroundEffects(auspiciousEntry, parsed);
  applyBackgroundEffects(character, effects, {
    classEntry: { id: 'class1' },
    scores: character.abilities.scores
  });
  assert.equal(character.sheet.hp.max, 46);
  assert.equal(character.sheet.hp.current, 46);
});

test('renderBackgroundEffectSections shows initiative readout', () => {
  const parsed = parseBackgroundEntry(grittyEntry);
  const html = renderBackgroundEffectSections(parsed.effects);
  assert.match(html, /\+1 initiative/);
});
