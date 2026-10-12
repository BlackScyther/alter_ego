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
  parseBuildSuggestedPowerNames,
  parseBuildSuggestedFeatNames,
  getSuggestedTrainedSkillsForBuild,
  parseClassFeatures,
  grantedFeaturesForPreview
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

test('parseClassEntry reads HP when colon is outside bold tag (PHB2 Barbarian layout)', () => {
  const parsed = parseClassEntry({
    id: 'class148',
    listing_fields: { Name: 'Barbarian', RoleName: 'Striker', PowerSourceText: 'Primal' },
    body_html:
      '<blockquote><b>Hit Points at 1st Level</b>: 15+ Constitution Score.<br>' +
      '<b>Hit Points per Level Gained</b>: 6<br>' +
      '<b>Healing Surges per Day</b>: 8+ Constitution Modifier.<br></blockquote>'
  });
  assert.equal(parsed.hpAt1Base, 15);
  assert.equal(parsed.hpPerLevel, 6);
  assert.equal(parsed.surgesBase, 8);
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

const warlordFeaturesHtml = `
<blockquote><b>CLASS TRAITS</b><br>
<b>Build Options: </b>Insightful Warlord, Tactical Warlord.<br>
<b>Class features: </b>Archer Warlord, Canny Leader, Combat Leader, Commanding Presence, Inspiring Word.
</blockquote>
<h3>INSIGHTFUL WARLORD</h3>
<p><b>Class Feature</b>: Insightful Presence, Canny Leader</p>
<h3>TACTICAL WARLORD</h3>
<p>Quick commands.</p>
<h3>WARLORD (MARSHAL) CLASS FEATURES</h3>
<b>ARCHER WARLORD</b><br>When you choose the Archer Warlord class feature, you lose proficiency with chainmail.
<b>CANNY LEADER</b><br>This class feature replaces your Combat Leader class feature. You and any ally within 10 squares who can see and hear you gain a +2 bonus to Insight checks and Perception checks.
<b>COMBAT LEADER</b><br>You and each ally within 10 squares who can see and hear you gain a +2 power bonus to initiative. In addition, when an ally spends an action point, that ally gains a +2 bonus to initiative.
<b>COMMANDING PRESENCE</b><br>Choose one of the following presence benefits below.
<b>Insightful Presence</b><br>When an ally who can see you spends an action point to take an extra action, that ally gains a bonus to all defenses.
<b>Tactical Presence</b><br>When an ally you can see spends an action point to make an attack, the ally gains a bonus to the first attack roll.
<b>INSPIRING WORD</b><br>Using the inspiring word power, warlords can grant their comrades additional resilience.
`;

const warlordFeaturesEntry = {
  id: 'class8',
  listing_fields: { Name: 'Warlord (Marshal)' },
  body_html: warlordFeaturesHtml
};

test('parseClassFeatures splits top-level features and presence options', () => {
  const features = parseClassFeatures(warlordFeaturesHtml);
  const names = features.map((f) => f.name);
  assert.deepEqual(names, [
    'Archer Warlord',
    'Canny Leader',
    'Combat Leader',
    'Commanding Presence',
    'Inspiring Word'
  ]);
  const presence = features.find((f) => f.name === 'Commanding Presence');
  assert.deepEqual(presence.subFeatures.map((s) => s.name), ['Insightful Presence', 'Tactical Presence']);
  assert.equal(features.find((f) => f.name === 'Canny Leader').replaces, 'Combat Leader');
  assert.equal(features.find((f) => f.name === 'Archer Warlord').optional, true);
  assert.equal(features.find((f) => f.name === 'Combat Leader').optional, false);
});

test('Tactical Warlord grants Combat Leader, Tactical Presence, and hides replacement features', () => {
  const parsed = parseClassEntry(warlordFeaturesEntry);
  const granted = grantedFeaturesForPreview(parsed, { build: 'tactical-warlord' }, warlordFeaturesHtml);
  assert.deepEqual(granted.map((f) => f.name), [
    'Combat Leader',
    'Commanding Presence',
    'Tactical Presence',
    'Inspiring Word'
  ]);
});

test('Insightful Warlord replaces Combat Leader with Canny Leader', () => {
  const parsed = parseClassEntry(warlordFeaturesEntry);
  const granted = grantedFeaturesForPreview(parsed, { build: 'insightful-warlord' }, warlordFeaturesHtml);
  assert.ok(granted.some((f) => f.name === 'Canny Leader'));
  assert.ok(granted.some((f) => f.name === 'Insightful Presence'));
  assert.equal(granted.some((f) => f.name === 'Combat Leader'), false);
});

test('a trailing period on the last build option is not part of the label', () => {
  const parsed = parseClassEntry({
    id: 'class8',
    listing_fields: { Name: 'Warlord (Marshal)' },
    body_html: '<blockquote><b>Build Options: </b>Inspiring Warlord, Tactical Warlord.</blockquote>'
  });
  assert.equal(parsed.buildOptions.at(-1).label, 'Tactical Warlord');
  assert.equal(parsed.buildOptions.at(-1).id, 'tactical-warlord');
});

test('class preview lists granted features as hover links', () => {
  const parsed = parseClassEntry(warlordFeaturesEntry);
  const html = renderClassPreviewHtml(warlordFeaturesEntry, parsed, {
    buildChoices: { build: 'tactical-warlord' }
  });
  assert.match(html, /Class features/);
  assert.match(html, /data-feature-key="class-feature:class8:combat-leader"/);
  assert.match(html, /data-feature-key="class-feature:class8:tactical-presence"/);
  assert.doesNotMatch(html, /data-feature-key="class-feature:class8:canny-leader"/);
  assert.match(html, />Combat Leader</);
});

test('extractPowerIdsFromClassHtml finds power ids', () => {
  const html = '<a href="power1234">Strike</a> and power5678';
  assert.deepEqual(extractPowerIdsFromClassHtml(html), ['power1234', 'power5678']);
});

test('parseBuildSuggestedPowerNames reads italic starter picks per build', () => {
  const entry = {
    id: 'class4',
    listing_fields: { Name: 'Paladin' },
    body_html: `<blockquote><b>Build Options: </b>Protecting Paladin, Virtuous Paladin.</blockquote>
<h3>PROTECTING PALADIN</h3>
<b>Suggested At-Will Powers</b>: <i>bolstering strike, enfeebling strike</i><br>
<b>Suggested Encounter Power</b>: <i>shielding smite</i><br>
<b>Suggested Daily Power</b>: <i>radiant delirium</i><br>
<h3>VIRTUOUS PALADIN</h3>
<b>Suggested At-Will Powers</b>: <i>bolstering strike, virtuous strike</i><br>
<b>Suggested Encounter Power</b>: <i>valorous smite</i><br>
<b>Suggested Daily Power</b>: <i>majestic halo</i><br>`
  };
  const parsed = parseClassEntry(entry);
  const byBuild = parseBuildSuggestedPowerNames(entry.body_html, parsed.buildOptions);
  assert.deepEqual(byBuild['protecting-paladin'], {
    atWill: ['bolstering strike', 'enfeebling strike'],
    encounter: ['shielding smite'],
    daily: ['radiant delirium']
  });
  assert.deepEqual(byBuild['virtuous-paladin'].atWill, ['bolstering strike', 'virtuous strike']);
});

test('parseBuildSuggestedFeatNames reads suggested feat per build', () => {
  const entry = {
    id: 'class4',
    listing_fields: { Name: 'Paladin' },
    body_html: `<blockquote><b>Build Options: </b>Protecting Paladin, Virtuous Paladin.</blockquote>
<h3>PROTECTING PALADIN</h3>
<b>Suggested Feat</b>: Healing Hands (Human feat: Action Surge)<br>
<h3>VIRTUOUS PALADIN</h3>
<b>Suggested Feat</b>: Virtuous Recovery<br>`
  };
  const parsed = parseClassEntry(entry);
  const byBuild = parseBuildSuggestedFeatNames(entry.body_html, parsed.buildOptions);
  assert.equal(byBuild['protecting-paladin'], 'Healing Hands');
  assert.equal(byBuild['virtuous-paladin'], 'Virtuous Recovery');
});
