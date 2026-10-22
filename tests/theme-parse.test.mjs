import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import { syncBonusesFromSelections } from '../src/character/tutor.js';
import {
  buildThemeNotesText,
  grantedPowerNamesAtLevel,
  parseThemeEntry,
  renderThemePreviewHtml
} from '../src/character/theme-parse.js';
import {
  pickThemePowerMatch,
  syncThemeSelection,
  themeSkillBonusRows,
  validateThemeStep
} from '../src/character/theme-selections.js';

const sampleTheme = {
  id: 'theme-sample',
  listing_fields: { Name: 'Sample Theme', Prerequisite: 'Wizard', SourceBook: 'Dra399' },
  body_html:
    '<h1 class=player>Sample Theme</h1>' +
    '<p>A short flavor line about the sample theme and its place in the world.</p>' +
    '<b>Sample Theme Starting Feature (1st level)</b>: You gain the sample strike power. You gain a +1 power bonus to initiative checks. ' +
    '<b>Sample Theme Level 5 Feature (5th level)</b>: You gain a +2 power bonus to Athletics checks. ' +
    '<b>Sample Theme Level 10 Feature (10th level)</b>: You gain a +2 power bonus to Insight checks. If you are bloodied, you gain a +2 bonus to Stealth checks. ' +
    '<h1 class=encounterpower>Sample Strike<span class=level>Sample Theme Attack</span></h1>' +
    '<h1 class=encounterpower>Sample Trick<span class=level>Sample Theme Utility 2</span></h1>'
};

const sunTrader = {
  id: 'theme-sun',
  listing_fields: { Name: 'Sun Trader', Prerequisite: '', SourceBook: 'DSCS' },
  body_html:
    '<h1 class=player>Sun Trader</h1>' +
    '<p>Flavor text for the sun trader theme goes here in the preview fold.</p>' +
    '<h1 class=encounterpower>Quick Line<span class=level>Sun Trader Feature</span></h1>' +
    '<p class=powerstat><b>Encounter</b></p>' +
    '<h1 class=encounterpower>Slick Line<span class=level>Sun Trader Utility 2</span></h1>'
};

test('parseThemeEntry splits level 1, 5, and 10 features and embedded powers', () => {
  const parsed = parseThemeEntry(sampleTheme);
  assert.deepEqual(
    parsed.features.map((feature) => feature.level),
    [1, 5, 10]
  );
  assert.match(parsed.features[0].text, /sample strike power/);
  assert.match(parsed.features[2].text, /Insight checks/);
  assert.equal(parsed.powers[0].name, 'Sample Strike');
  assert.equal(parsed.powers[0].granted, true);
  assert.equal(parsed.powers[1].name, 'Sample Trick');
  assert.equal(parsed.powers[1].granted, false);
  assert.equal(parsed.powers[1].minLevel, 2);
  assert.match(parsed.flavorHtml, /short flavor line/);
  assert.doesNotMatch(parsed.flavorHtml, /Starting Feature/);
});

test('level 10 skill text is ignored at level 4 and included at level 10', () => {
  const character = createCharacter();
  character.identity.level = 4;
  assert.deepEqual(themeSkillBonusRows(character, sampleTheme), []);

  character.identity.level = 10;
  const rows = themeSkillBonusRows(character, sampleTheme);
  const skills = rows.map((row) => row.skill).sort();
  assert.deepEqual(skills, ['athletics', 'insight']);
  assert.equal(rows.every((row) => row.source === 'theme'), true);
  assert.equal(rows.find((row) => row.skill === 'insight').bonusType, 'power');
  assert.equal(rows.some((row) => row.skill === 'stealth'), false);
});

test('syncBonusesFromSelections applies the starting initiative bonus only', () => {
  const character = createCharacter();
  character.identity.level = 4;
  character.selections.themeId = sampleTheme.id;
  syncBonusesFromSelections(character, { theme: sampleTheme });
  assert.equal(character.sheet.derivedBonuses.initiativeTheme, 1);
  assert.equal(character.sheet.derivedBonuses.initiative, 1);
  assert.equal(
    (character.skillBonuses ?? []).some((row) => row.source === 'theme' && row.skill === 'insight'),
    false
  );
});

test('Dark Sun feature heading is the starting power', () => {
  const parsed = parseThemeEntry(sunTrader);
  assert.equal(parsed.features.length, 1);
  assert.equal(parsed.features[0].level, 1);
  assert.match(parsed.features[0].text, /Quick Line/);
  assert.equal(parsed.powers[0].kind, 'feature');
  assert.equal(parsed.powers[0].granted, true);
  assert.equal(parsed.powers[1].granted, false);
  assert.deepEqual(grantedPowerNamesAtLevel(parsed, 1), ['Quick Line']);
  assert.deepEqual(grantedPowerNamesAtLevel(parsed, 1).includes('Slick Line'), false);
});

test('renderThemePreviewHtml marks locked features and the granted power', () => {
  const html = renderThemePreviewHtml(sampleTheme, { level: 4 });
  assert.match(html, /theme-preview-title/);
  assert.match(html, /Starting Feature \(Active\)/);
  assert.match(html, /Level 5 Feature \(Locked until level 5\)/);
  assert.match(html, /Level 10 Feature \(Locked until level 10\)/);
  assert.match(html, /Sample Strike/);
  assert.match(html, /Optional utility, level 2/);
  assert.match(html, /Description/);
  assert.match(buildThemeNotesText(parseThemeEntry(sampleTheme), 4), /Starting Feature/);
  assert.doesNotMatch(buildThemeNotesText(parseThemeEntry(sampleTheme), 4), /Level 5 Feature/);
});

test('empty themeId passes validation', () => {
  assert.deepEqual(validateThemeStep(createCharacter()), []);
});

test('pickThemePowerMatch prefers the theme source book', () => {
  const hits = [
    { id: 'power-a', listing_fields: { Name: 'Sample Strike', SourceBook: 'PHB' } },
    { id: 'power-b', listing_fields: { Name: 'Sample Strike', SourceBook: 'Dra399' } },
    { id: 'power-c', listing_fields: { Name: 'Other Strike', SourceBook: 'Dra399' } }
  ];
  assert.equal(pickThemePowerMatch(hits, 'Sample Strike', 'Dra399').id, 'power-b');
});

test('syncThemeSelection stores the matching starting power', async () => {
  const character = createCharacter();
  character.identity.level = 4;
  character.selections.themeId = sampleTheme.id;
  const compendium = {
    async listEntries() {
      return [
        { id: 'power-a', listing_fields: { Name: 'Sample Strike', SourceBook: 'PHB' } },
        { id: 'power-b', listing_fields: { Name: 'Sample Strike', SourceBook: 'Dra399' } }
      ];
    }
  };
  await syncThemeSelection(character, sampleTheme, compendium);
  assert.equal(character.identity.theme, 'Sample Theme');
  assert.match(character.notes.themeFeatures, /Starting Feature/);
  assert.equal(character.selections.grantSlots.themePowers.length, 1);
  assert.equal(character.selections.grantSlots.themePowers[0].id, 'power-b');
  assert.equal(character.selections.grantSlots.themePowers[0].category, 'theme-power');
  assert.match(character.notes.themePowers, /Sample Strike/);
});
