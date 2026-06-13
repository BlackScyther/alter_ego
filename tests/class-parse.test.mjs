import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseClassEntry,
  renderClassPreviewHtml,
  buildClassNotesText,
  extractPowerIdsFromClassHtml,
  parseBuildSuggestedSkills,
  getSuggestedTrainedSkillsForBuild
} from '../src/character/class-parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', 'class-html', name), 'utf8');

const clericEntry = {
  id: 'class2',
  listing_fields: { Name: 'Cleric (Templar)', RoleName: 'Leader', PowerSourceText: 'Divine', KeyAbilities: 'Wisdom, Strength' },
  body_html: fixture('cleric-templar.html')
};

const warlordEntry = {
  id: 'class8',
  listing_fields: { Name: 'Warlord (Marshal)', RoleName: 'Leader', PowerSourceText: 'Martial' },
  body_html: fixture('warlord-marshal.html')
};

const fighterEntry = {
  id: 'class3',
  listing_fields: { Name: 'Fighter (Weaponmaster)', RoleName: 'Defender', PowerSourceText: 'Martial' },
  body_html: fixture('fighter-weaponmaster.html')
};

const ardentEntry = {
  id: 'class529',
  listing_fields: { Name: 'Ardent', RoleName: 'Leader', PowerSourceText: 'Psionic' },
  body_html: `<blockquote><b>CLASS TRAITS</b><br><br><b>Trained Skills</b>: From the class skills list below, choose 4 trained skills at 1st level.<br><i>Class Skills</i>: Arcana (Int), Athletics (Str), Bluff (Cha), Diplomacy (Cha), Endurance (Con), Heal (Wis), Insight (Wis), Intimidate (Cha), Streetwise (Cha).<br><br><b>Build Options: </b>Enlightened Ardent, Euphoric Ardent, Impetuous Ardent.<br></blockquote>`
};

test('parseClassEntry extracts Cleric Templar CLASS TRAITS', () => {
  const parsed = parseClassEntry(clericEntry);
  assert.equal(parsed.title, 'Cleric (Templar)');
  assert.equal(parsed.hpAt1Base, 12);
  assert.equal(parsed.hpPerLevel, 5);
  assert.equal(parsed.surgesBase, 7);
  assert.equal(parsed.defenseBonuses.will, 2);
  assert.equal(parsed.trainedSkills.kind, 'choice');
  assert.equal(parsed.trainedSkills.chooseCount, 3);
  assert.deepEqual(parsed.trainedSkills.fixedSkills, ['religion']);
  assert.ok(parsed.trainedSkills.classSkills.includes('heal'));
  assert.equal(parsed.buildOptions.length, 3);
});

test('parseClassEntry extracts Warlord build options', () => {
  const parsed = parseClassEntry(warlordEntry);
  assert.equal(parsed.hpAt1Base, 12);
  assert.equal(parsed.defenseBonuses.fort, 1);
  assert.equal(parsed.defenseBonuses.ref, 1);
  assert.equal(parsed.defenseBonuses.will, 1);
  assert.equal(parsed.trainedSkills.chooseCount, 4);
  assert.ok(parsed.buildOptions.some((o) => o.id === 'bravura-warlord'));
  assert.ok(parsed.buildOptions.some((o) => o.id === 'tactical-warlord'));
});

test('parseClassEntry handles Fighter without build options', () => {
  const parsed = parseClassEntry(fighterEntry);
  assert.equal(parsed.hpAt1Base, 15);
  assert.equal(parsed.surgesBase, 9);
  assert.equal(parsed.defenseBonuses.fort, 2);
  assert.equal(parsed.trainedSkills.chooseCount, 2);
  assert.deepEqual(parsed.trainedSkills.fixedSkills, ['athletics']);
  assert.equal(parsed.buildOptions.length, 0);
});

test('parseClassEntry reads italic Class Skills list (Ardent)', () => {
  const parsed = parseClassEntry(ardentEntry);
  assert.equal(parsed.trainedSkills.kind, 'choice');
  assert.equal(parsed.trainedSkills.chooseCount, 4);
  assert.deepEqual(parsed.trainedSkills.fixedSkills, []);
  assert.ok(parsed.trainedSkills.classSkills.includes('bluff'));
  assert.ok(parsed.trainedSkills.classSkills.includes('streetwise'));
  assert.equal(parsed.trainedSkills.classSkills.length, 9);
});

test('parseBuildSuggestedSkills maps build sections to skill lists', () => {
  const html = `${ardentEntry.body_html}<h3>ENLIGHTENED ARDENT</h3><b>Suggested Skills</b>: Bluff, Diplomacy, Heal, Insight<br>
    <h3>EUPHORIC ARDENT</h3><b>Suggested Skills</b>: Athletics, Endurance, Intimidate, Streetwise<br>`;
  const parsed = parseClassEntry(ardentEntry);
  const byBuild = parseBuildSuggestedSkills(html, parsed.buildOptions);
  assert.deepEqual(byBuild['enlightened-ardent'], ['bluff', 'diplomacy', 'heal', 'insight']);
  assert.deepEqual(byBuild['euphoric-ardent'], ['athletics', 'endurance', 'intimidate', 'streetwise']);
});

test('getSuggestedTrainedSkillsForBuild skips fixed skills and caps at choose count', () => {
  const parsed = parseClassEntry(clericEntry);
  const byBuild = {
    'battle-cleric': ['diplomacy', 'heal', 'insight', 'religion']
  };
  const suggested = getSuggestedTrainedSkillsForBuild(parsed, 'battle-cleric', byBuild);
  assert.deepEqual(suggested, ['diplomacy', 'heal', 'insight']);
});

test('renderClassPreviewHtml includes build and skill choice UI', () => {
  const parsed = parseClassEntry(warlordEntry);
  const html = renderClassPreviewHtml(warlordEntry, parsed, {
    buildChoices: { build: 'bravura-warlord' },
    trainedSkillChoices: ['athletics', 'diplomacy', 'heal', 'intimidate'],
    previewTerms: ['Bravura']
  });
  assert.match(html, /class-preview/);
  assert.match(html, /Bravura Warlord/);
  assert.match(html, /race-choice-btn--selected/);
  assert.match(html, /class-skill-section/);
});

test('buildClassNotesText compacts traits and choices', () => {
  const parsed = parseClassEntry(clericEntry);
  const text = buildClassNotesText(clericEntry, parsed, {
    trainedSkillChoices: ['heal', 'insight', 'diplomacy'],
    buildSummary: ['Build: Templar']
  });
  assert.match(text, /Build: Templar/);
  assert.match(text, /Trained Skills: Religion/);
  assert.match(text, /HP at 1: 12/);
  assert.match(text, /\+2 Will/);
});

test('extractPowerIdsFromClassHtml finds power ids', () => {
  const html = '<a href="power1234">Strike</a> and power5678';
  assert.deepEqual(extractPowerIdsFromClassHtml(html), ['power1234', 'power5678']);
});
