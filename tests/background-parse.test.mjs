import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBackgroundEntry,
  renderBackgroundPreviewHtml,
  buildBackgroundNotesText
} from '../src/character/background-parse.js';
import {
  isBackgroundSkillChoiceComplete,
  validateBackgroundStep,
  toggleBackgroundSkillChoice,
  setBackgroundSkillMode
} from '../src/character/background-selections.js';
import { createCharacter } from '../src/character/model.js';

const scholarHtml = `<p class=flavortext><b>Type: </b>Occupation<br><b>Campaign Setting: </b>General<br></p>
<p>Your life once revolved around knowledge. What area of scholarship was your domain?</p>
<p><b>Associated Skills:</b> Arcana, History, Religion</p>
<p><b>Skill Bonus:</b> Choose one associated skill. You gain a +2 bonus to checks with that skill, or choose two associated skills. You gain a +1 bonus to checks with those skills.</p>
<p><b>Language:</b> You can speak Supernal.</p>`;

const scholarHtmlIws = `<h1 class=player>Occupation - Scholar</h1><p class=flavortext><b>Type: </b>Occupation<br><b>Campaign Setting: </b>General<br></p>Your life once revolved around knowledge. What area of scholarship was your domain?<br>    <i>Associated Skills: </i>Arcana, History, Religion<br><p class=publishedIn>Published in Player's Handbook 2, page(s) 180.</p>`;

const cultSurvivorHtml = `<h1 class=player>Cult Survivor</h1><p class=flavortext><b>Campaign Setting: </b>General<br></p>You were young when the Cult of the Elder Elemental Eye held sway over all the surrounding lands, but not too young to remember.<br>    <i>Associated Skills: </i>Arcana, Athletics, Religion<br><p class=publishedIn>Published in Into the Unknown: The Dungeon Survival Handbook, page(s) 110.</p>`;

const scholarEntry = {
  id: 'background-scholar',
  listing_fields: { Name: 'Occupation - Scholar', Type: 'Occupation', Campaign: 'General' },
  body_html: scholarHtml
};

const scholarEntryIws = {
  id: 'background-scholar-iws',
  listing_fields: { Name: 'Occupation - Scholar', Type: 'Occupation', Campaign: 'General' },
  body_html: scholarHtmlIws
};

const cultSurvivorEntry = {
  id: 'background826',
  listing_fields: { Name: 'Cult Survivor', Campaign: 'General' },
  body_html: cultSurvivorHtml
};

const airspurEntry = {
  id: 'background-airspur',
  listing_fields: { Name: 'Airspur', Type: 'Geography', Campaign: 'Forgotten Realms' },
  body_html:
    '<h1 class=player>Airspur</h1><p class=flavortext><b>Type: </b>Geography<br><b>Campaign Setting: </b>Forgotten Realms<br></p>Airspur is the most powerful mercantile hub.<br>    <i>Benefit: </i>+2 bonus to Acrobatics and Diplomacy.<br><p class=publishedIn>Published in Dungeon Magazine 172, page(s) 101.</p>'
};

const acolyteEntry = {
  id: 'background1',
  listing_fields: { Name: 'Acolyte', Type: 'Occupation', SourceBook: 'PHB2' },
  body_html: '<p>Religious upbringing. <b>Skill Bonus:</b> +2 Religion and +2 Insight (not an ability score).</p>',
  skill_bonuses: [
    { skill: 'religion', amount: 2, bonusType: 'skill' },
    { skill: 'insight', amount: 2, bonusType: 'skill' }
  ]
};

const dwarfBg = {
  id: 'background-dwarf-outcast',
  listing_fields: { Name: 'Dwarf - Outcast', Type: 'Racial', Campaign: 'General' },
  body_html:
    '<p class=flavortext><b>Type: </b>Racial<br><b>Campaign Setting: </b>General<br><b>Prerequisite: </b>Dwarf<br></p><p>Your clan cast you out.</p>'
};

test('parseBackgroundEntry detects scholar metadata, skills, and choice rule', () => {
  const parsed = parseBackgroundEntry(scholarEntry);
  assert.equal(parsed.title, 'Occupation - Scholar');
  assert.equal(parsed.meta.type, 'Occupation');
  assert.equal(parsed.meta.campaign, 'General');
  assert.equal(parsed.skillBonusKind, 'choice');
  assert.deepEqual(parsed.associatedSkills, ['arcana', 'history', 'religion']);
  assert.ok(parsed.descriptionHtml.includes('Your life once revolved'));
  assert.equal(parsed.benefitRows.length, 1);
  assert.equal(parsed.benefitRows[0].label, 'Language');
});

test('parseBackgroundEntry handles fixed skill bonuses', () => {
  const parsed = parseBackgroundEntry(acolyteEntry);
  assert.equal(parsed.skillBonusKind, 'fixed');
  assert.deepEqual(parsed.fixedSkillBonuses, [
    { skill: 'religion', amount: 2 },
    { skill: 'insight', amount: 2 }
  ]);
});

test('parseBackgroundEntry handles iws.mx inline associated skills format', () => {
  const parsed = parseBackgroundEntry(scholarEntryIws);
  assert.equal(parsed.skillBonusKind, 'choice');
  assert.deepEqual(parsed.associatedSkills, ['arcana', 'history', 'religion']);
  assert.ok(parsed.descriptionSummary.includes('Your life once revolved'));
  assert.doesNotMatch(parsed.descriptionSummary, /Published in/);
});

test('parseBackgroundEntry handles Cult Survivor compendium HTML', () => {
  const parsed = parseBackgroundEntry(cultSurvivorEntry);
  assert.equal(parsed.title, 'Cult Survivor');
  assert.equal(parsed.meta.campaign, 'General');
  assert.equal(parsed.skillBonusKind, 'choice');
  assert.deepEqual(parsed.associatedSkills, ['arcana', 'athletics', 'religion']);
  assert.ok(parsed.descriptionSummary.includes('Cult of the Elder Elemental Eye'));
});

test('parseBackgroundEntry parses fixed skill bonuses from inline Benefit line', () => {
  const parsed = parseBackgroundEntry(airspurEntry);
  assert.equal(parsed.skillBonusKind, 'fixed');
  assert.deepEqual(parsed.fixedSkillBonuses, [
    { skill: 'acrobatics', amount: 2 },
    { skill: 'diplomacy', amount: 2 }
  ]);
  assert.equal(parsed.benefitRows.length, 1);
  assert.equal(parsed.benefitRows[0].label, 'Benefit');
});

test('renderBackgroundPreviewHtml includes skill picker for Cult Survivor', () => {
  const html = renderBackgroundPreviewHtml(cultSurvivorEntry, {
    choices: { mode: 'plus2-one', skills: ['athletics'] }
  });
  assert.match(html, /background-skill-section/);
  assert.match(html, /data-skill="athletics"/);
  assert.match(html, /race-choice-btn--selected/);
  assert.match(html, /background-flavor-fold/);
  assert.match(html, /Selected: Athletics \(\+2\)/);
});

test('parseBackgroundEntry handles racial prerequisite background', () => {
  const parsed = parseBackgroundEntry(dwarfBg);
  assert.equal(parsed.meta.prerequisite, 'Dwarf');
  assert.equal(parsed.meta.type, 'Racial');
  assert.ok(parsed.descriptionSummary.includes('Your clan'));
});

test('renderBackgroundPreviewHtml includes fold and skill picker', () => {
  const html = renderBackgroundPreviewHtml(scholarEntry, {
    choices: { mode: 'plus2-one', skills: [] }
  });
  assert.match(html, /background-preview-title/);
  assert.match(html, /background-meta-list/);
  assert.match(html, /background-flavor-fold/);
  assert.match(html, /background-skill-section/);
  assert.match(html, /data-skill="history"/);
  assert.match(html, /value="plus2-one"/);
});

test('renderBackgroundPreviewHtml shows fixed bonuses without picker', () => {
  const html = renderBackgroundPreviewHtml(acolyteEntry);
  assert.match(html, /\+2 Religion/);
  assert.doesNotMatch(html, /background-skill-choices/);
});

test('buildBackgroundNotesText reflects Cult Survivor skill choice', () => {
  const text = buildBackgroundNotesText(cultSurvivorEntry, { mode: 'plus2-one', skills: ['athletics'] });
  assert.match(text, /Skill Bonus: \+2 Athletics/);
  assert.match(text, /Campaign Setting: General/);
});

test('buildBackgroundNotesText reflects chosen skills', () => {
  const text = buildBackgroundNotesText(scholarEntry, { mode: 'plus2-one', skills: ['history'] });
  assert.match(text, /Skill Bonus: \+2 History/);
  assert.doesNotMatch(text, /Your life once revolved/);
});

test('validateBackgroundStep blocks incomplete choice', () => {
  const character = createCharacter({
    selections: {
      backgroundId: 'background-scholar',
      backgroundSkillBonusKind: 'choice',
      backgroundBonusChoices: { mode: null, skills: [] }
    }
  });
  const errors = validateBackgroundStep(character, null);
  assert.equal(errors.length, 1);
});

test('skill choice toggle enforces plus2-one and plus1-two rules', () => {
  const parsed = parseBackgroundEntry(scholarEntry);
  const character = createCharacter({
    selections: { backgroundBonusChoices: { mode: 'plus2-one', skills: [] } }
  });

  toggleBackgroundSkillChoice(character, 'history', parsed);
  assert.deepEqual(character.selections.backgroundBonusChoices.skills, ['history']);

  toggleBackgroundSkillChoice(character, 'religion', parsed);
  assert.deepEqual(character.selections.backgroundBonusChoices.skills, ['religion']);

  setBackgroundSkillMode(character, 'plus1-two', parsed);
  toggleBackgroundSkillChoice(character, 'history', parsed);
  assert.deepEqual([...character.selections.backgroundBonusChoices.skills].sort(), ['history', 'religion']);
  assert.equal(isBackgroundSkillChoiceComplete(parsed, character.selections.backgroundBonusChoices), true);
});
