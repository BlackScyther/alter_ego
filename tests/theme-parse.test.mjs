import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import { getFinalScores, syncBonusesFromSelections } from '../src/character/tutor.js';
import { collectRitualItems } from '../src/character/character-collection.js';
import {
  buildThemeNotesText,
  formatThemePickerMeta,
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

test('picker row names the skill and the level 1 grant', () => {
  assert.match(formatThemePickerMeta(sampleTheme), /Wizard/);
  assert.match(formatThemePickerMeta(sampleTheme), /Athletics, Insight, Initiative, Attack/);
  assert.doesNotMatch(formatThemePickerMeta(sampleTheme), /Stealth/);
  assert.match(formatThemePickerMeta(sunTrader), /Feature/);
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
  assert.equal(character.selections.themePrerequisite, 'Wizard');
  assert.equal(character.selections.grantSlots.themePowers[0].category, 'theme-power');
  assert.match(character.notes.themePowers, /Sample Strike/);
});

const alchemist = {
  id: 'theme849',
  listing_fields: { Name: 'Alchemist', Prerequisite: '', SourceBook: 'Dra399' },
  body_html:
    '<h1 class=player>Alchemist</h1>' +
    '<p>Flavor before the features.</p>' +
    '<b>Alchemist Starting Feature (1st level)</b>: You gain the Alchemist feat as a bonus feat. ' +
    'You know the formula for a particular 1st-level alchemical item (such as alchemist\'s fire). ' +
    '<b>Alchemist Level 5 Feature (5th level)</b>: You learn one alchemical formula of your level or lower. ' +
    '<b>Alchemist Level 10 Feature (10th level)</b>: You gain a +2 bonus to attack rolls with alchemical items you create. ' +
    'Also, you learn one new alchemical formula of your level or lower.' +
    '<h1 class=encounterpower>Aqua Regia<span class=level>Alchemist Utility 2</span></h1>'
};

const dragoon = {
  id: 'theme940',
  listing_fields: { Name: 'Callidyrr Dragoon', Prerequisite: '', SourceBook: 'Dra' },
  body_html:
    '<b>Callidyrr Dragoon Starting Feature (1st level)</b>: You gain the Mounted Combat feat. ' +
    '<b>Callidyrr Dragoon Level 5 Feature (5th level)</b>: You gain a +2 power bonus to Diplomacy checks and Intimidate checks.'
};

const werebear = {
  id: 'theme992',
  listing_fields: { Name: 'Werebear', Prerequisite: '', SourceBook: 'Dra' },
  body_html:
    '<b>Werebear Starting Feature (1st level)</b>: You gain a +2 bonus to saving throws against disease. ' +
    'While adjacent to you, allies gain a +1 power bonus to saving throws. ' +
    '<h1 class=encounterpower>Bear Form<span class=level>Werebear Utility 2</span></h1>' +
    '<p>Effect: The target can make a saving throw.</p>'
};

const sorcere = {
  id: 'theme1003',
  listing_fields: { Name: 'Sorcere Adept', Prerequisite: '', SourceBook: 'Dra' },
  body_html:
    '<b>Sorcere Adept Level 5 Feature (5th level)</b>: You gain the Ritual Caster feat. ' +
    'If you already have this feat, you can instead add two rituals of your level or lower to your spellbook at no cost.'
};

const strongTheme = {
  id: 'theme-strong',
  listing_fields: { Name: 'Strong Theme', Prerequisite: '', SourceBook: 'Dra' },
  body_html:
    '<b>Strong Theme Starting Feature (1st level)</b>: You gain a +2 bonus to Strength.'
};

function grantCompendium() {
  const rows = [
    { id: 'feat652', category: 'feat', listing_fields: { Name: 'Alchemist', SourceBook: 'Dra399' } },
    { id: 'feat-mount', category: 'feat', listing_fields: { Name: 'Mounted Combat', SourceBook: 'PHB' } },
    { id: 'feat159', category: 'feat', listing_fields: { Name: 'Ritual Caster', SourceBook: 'PHB' } }
  ];
  return {
    async listEntries(category) {
      return rows.filter((row) => row.category === category);
    },
    async getEntry() {
      return null;
    }
  };
}

test('Alchemist grants the feat and one formula per unlocked feature', async () => {
  const character = createCharacter();
  character.identity.level = 1;
  character.selections.themeId = alchemist.id;
  const compendium = grantCompendium();
  await syncThemeSelection(character, alchemist, compendium);
  assert.equal(character.selections.grantSlots.themeFeats.length, 1);
  assert.equal(character.selections.grantSlots.themeFeats[0].id, 'feat652');
  assert.equal(character.selections.grantSlots.themeFeats[0].name, 'Alchemist');
  assert.equal(character.selections.themeFormulaSlots.length, 1);
  assert.equal(character.selections.themeFormulaSlots[0].maxLevel, 1);
  assert.equal(character.selections.themeFormulaSlots[0].id, 'theme-formula-1-1');

  character.identity.level = 10;
  await syncThemeSelection(character, alchemist, compendium);
  assert.equal(character.selections.themeFormulaSlots.length, 3);
  assert.equal(character.selections.themeFormulaSlots[2].maxLevel, null);
  const rituals = await collectRitualItems(character, compendium);
  assert.equal(rituals.length, 3);
  assert.equal(rituals.every((item) => item.chooser && item.detail === 'Alchemist'), true);

  character.selections.themeFormulaSelections['theme-formula-1-1'] = 'item9';
  const other = {
    ...alchemist,
    id: 'theme-other',
    listing_fields: { ...alchemist.listing_fields, Name: 'Other Alchemist' }
  };
  await syncThemeSelection(character, other, compendium);
  assert.equal(character.selections.themeFormulaSelections['theme-formula-1-1'], undefined);
});

test('Callidyrr Dragoon grants Mounted Combat and the level 5 skill bonuses', async () => {
  const character = createCharacter();
  character.identity.level = 5;
  character.selections.themeId = dragoon.id;
  await syncThemeSelection(character, dragoon, grantCompendium());
  assert.equal(character.selections.grantSlots.themeFeats[0].name, 'Mounted Combat');
  syncBonusesFromSelections(character, { theme: dragoon });
  const skills = (character.skillBonuses ?? [])
    .filter((row) => row.source === 'theme')
    .map((row) => row.skill)
    .sort();
  assert.deepEqual(skills, ['diplomacy', 'intimidate']);
});

test('Werebear saving throw is on the sheet and a power-body save is not', async () => {
  const character = createCharacter();
  character.identity.level = 1;
  character.selections.themeId = werebear.id;
  character.sheet.extraFields = { 'save-mods': '+2 racial bonus to saving throws' };
  character.sheet.derived = { race: { saveMods: '+2 racial bonus to saving throws' } };
  await syncThemeSelection(character, werebear, grantCompendium());
  const saves = character.sheet.extraFields['save-mods'];
  assert.match(saves, /\+2 bonus to saving throws against disease/);
  assert.match(saves, /racial bonus/);
  assert.doesNotMatch(saves, /make a saving throw/);
  assert.doesNotMatch(saves, /allies gain/);
});

test('Sorcere Adept grants Ritual Caster, or two ritual slots when that feat is already owned', async () => {
  const compendium = grantCompendium();
  const fresh = createCharacter();
  fresh.identity.level = 5;
  fresh.selections.themeId = sorcere.id;
  await syncThemeSelection(fresh, sorcere, compendium);
  assert.equal(fresh.selections.grantSlots.themeFeats[0].id, 'feat159');
  assert.equal(fresh.selections.themeRitualSlots.length, 0);

  const wizard = createCharacter();
  wizard.identity.level = 5;
  wizard.selections.themeId = sorcere.id;
  wizard.selections.classFeatIds = ['feat159'];
  await syncThemeSelection(wizard, sorcere, compendium);
  assert.equal(wizard.selections.grantSlots.themeFeats.length, 0);
  assert.equal(wizard.selections.themeRitualSlots.length, 2);
  assert.equal(wizard.selections.themeRitualSlots[0].kind, 'ritual');
});

test('a theme ability bonus is added to the mirror score', () => {
  const character = createCharacter();
  character.identity.level = 1;
  character.selections.themeId = strongTheme.id;
  syncBonusesFromSelections(character, { theme: strongTheme });
  assert.equal(getFinalScores(character).str, 12);
});

test('theme preview links a feat and highlights a skill bonus', () => {
  const html = renderThemePreviewHtml(alchemist, {
    level: 1,
    links: {
      feats: { alchemist: '/compendium/entry.html?id=feat652' },
      powers: { 'aqua regia': '/compendium/entry.html?id=power1' }
    }
  });
  assert.match(html, /target="_blank"/);
  assert.match(html, /class="theme-entry-link"[\s\S]*?theme-entry-link__label">Aqua Regia</);
  assert.match(html, /theme-entry-link__label">Alchemist</);
  assert.doesNotMatch(html, /character-collection-open/);
  const skills = renderThemePreviewHtml(dragoon, { level: 5 });
  assert.match(skills, /class="theme-grant"/);
  assert.match(skills, /Diplomacy checks and Intimidate checks/);
});
