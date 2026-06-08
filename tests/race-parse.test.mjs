import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAbilityScoreBenefitModel,
  buildRaceNotesText,
  extractBenefitSections,
  extractFeatIdsFromRaceHtml,
  extractFlavorFolds,
  extractPowerIdsFromRaceHtml,
  mergeRaceMechanics,
  parseRaceMechanics,
  renderCombinedRacePreviewHtml
} from '../src/character/race-parse.js';
import {
  appendMetricHeight,
  appendMetricSpeed,
  appendMetricVision,
  appendMetricWeight,
  formatMechanicalValue
} from '../src/shared/imperial-metric.js';

const dwarfHtml =
  '<blockquote><b>Average Height:</b> 4\'3"–4\'9"<br><b>Average Weight:</b> 160–220 lb.<br><b>Size:</b> Medium<br><b>Cast-Iron Stomach:</b> +5 vs poison<br><b>Dwarven Resilience:</b> power99</blockquote><h3>PHYSICAL QUALITIES</h3><p class=flavor>A dwarf is stout.</p>';

const goldDwarfHtml =
  '<h1 class=player>Gold Dwarf</h1><p class=flavor>A gold dwarf hails from the southern deserts.</p><h3>Gold Dwarf Benefits</h3><p><b>Cast-Iron Stomach:</b> Same as dwarf.</p><p><b>Gold Dwarf Power:</b> power100</p>';

const dwarfEntry = {
  id: 'race2',
  listing_fields: { Name: 'Dwarf', Size: 'Medium' },
  body_html:
    '<blockquote><b>Average Height:</b> 4\'3"–4\'9"<br><b>Average Weight:</b> 160–220 lb.<br><b>Ability scores:</b> +2 Constitution, +2 Wisdom or Strength<br><b>Size:</b> Medium<br><b>Speed:</b> 5 squares</blockquote>',
  ability_bonuses: [
    { ability: 'con', amount: 2 },
    { ability: 'wis', amount: 2, choiceGroup: 'dwarf-second' },
    { ability: 'str', amount: 2, choiceGroup: 'dwarf-second' }
  ]
};

const humanEntry = {
  id: 'race1',
  listing_fields: { Name: 'Human', Size: 'Medium' },
  body_html: '<p><b>Ability Bonus:</b> +2 to one ability score of your choice.</p>',
  ability_bonuses: [{ ability: 'any', amount: 2, choiceGroup: 'human-ability', note: 'One ability of your choice' }]
};

test('parseRaceMechanics detects core race traits', () => {
  const parsed = parseRaceMechanics(dwarfHtml);
  assert.equal(parsed.isCoreRace, true);
  assert.ok(parsed.pairs.some((p) => p.label.toLowerCase().includes('size')));
  assert.ok(parsed.features.some((f) => f.label === 'Cast-Iron Stomach'));
});

test('parseRaceMechanics includes height and weight in preview mode', () => {
  const parsed = parseRaceMechanics(dwarfHtml);
  assert.ok(parsed.pairs.some((p) => p.label.toLowerCase().includes('average height')));
  assert.match(
    parsed.pairs.find((p) => p.label.toLowerCase().includes('average height'))?.displayValue ?? '',
    /cm/
  );
});

test('parseRaceMechanics reads subrace benefit sections', () => {
  const parsed = parseRaceMechanics(goldDwarfHtml);
  assert.ok(parsed.features.some((f) => f.label === 'Gold Dwarf Power'));
  assert.ok(parsed.features.some((f) => f.label === 'Cast-Iron Stomach'));
});

test('parseRaceMechanics uses structured ability_bonuses fallback', () => {
  const parsed = parseRaceMechanics({
    body_html: '<p>Minimal entry.</p>',
    ability_bonuses: [{ ability: 'con', amount: 2 }, { ability: 'wis', amount: 2, choiceGroup: 'x' }]
  });
  assert.ok(parsed.pairs.some((p) => p.norm === 'ability scores'));
});

test('mergeRaceMechanics combines base and variant', () => {
  const base = parseRaceMechanics(dwarfHtml);
  const variant = parseRaceMechanics(goldDwarfHtml);
  const merged = mergeRaceMechanics(base, variant);
  assert.ok(merged.pairs.some((p) => p.label.toLowerCase().includes('size')));
  assert.ok(merged.features.some((f) => f.label === 'Gold Dwarf Power'));
});

test('extractBenefitSections keeps base and subrace sections separate', () => {
  const baseSections = extractBenefitSections(dwarfHtml, { raceName: 'Dwarf' });
  const variantSections = extractBenefitSections(goldDwarfHtml, { raceName: 'Gold Dwarf' });
  assert.equal(baseSections[0]?.heading, 'Dwarf Benefits');
  assert.equal(variantSections[0]?.heading, 'Gold Dwarf Benefits');
  assert.ok(baseSections[0]?.rows.some((r) => r.label === 'Cast-Iron Stomach'));
  assert.ok(variantSections[0]?.rows.some((r) => r.label === 'Cast-Iron Stomach'));
});

test('extractBenefitSections resolves grant ids to names', () => {
  const grantNameMap = new Map([['power99', 'Dwarven Resilience']]);
  const sections = extractBenefitSections(dwarfHtml, { raceName: 'Dwarf', grantNameMap });
  const resilience = sections[0]?.rows.find((r) => r.label === 'Dwarven Resilience');
  assert.equal(resilience?.grantId, 'power99');
  assert.equal(resilience?.displayValue, 'Dwarven Resilience');
});

test('extractBenefitSections splits run-on plain text fields', () => {
  const runOn =
    "Average Height: 4' 3\" - 4' 9\" Average Weight: 160 - 220 lb. Size: Medium Speed: 5 squares";
  const sections = extractBenefitSections(`<blockquote>${runOn}</blockquote>`, { raceName: 'Dwarf' });
  const rows = sections[0]?.rows ?? [];
  assert.equal(rows.length, 4);
  assert.equal(rows[0]?.label, 'Average Height');
  assert.equal(rows[1]?.label, 'Average Weight');
  assert.equal(rows[2]?.label, 'Size');
  assert.equal(rows[3]?.label, 'Speed');
});

test('extractFlavorFolds creates separate folds for leads and h3 sections', () => {
  const folds = extractFlavorFolds(
    '<p class=flavor>A dwarf is a stout warrior.</p><h3>PHYSICAL QUALITIES</h3><p class=flavor>A dwarf grows thick muscle.</p>'
  );
  assert.equal(folds.length, 2);
  assert.match(folds[0].summary, /A dwarf is a stout/);
  assert.equal(folds[1].summary, 'PHYSICAL QUALITIES');
});

test('renderCombinedRacePreviewHtml shows benefits, grants, and flavor in order', () => {
  const grantEntries = [
    { id: 'power99', name: 'Dwarven Resilience', bodyHtml: '<p>Encounter power text.</p>', kind: 'power' },
    { id: 'power100', name: 'Gold Dwarf Resilience', bodyHtml: '<p>Gold encounter power.</p>', kind: 'power' }
  ];
  const html = renderCombinedRacePreviewHtml(
    { id: 'race2', listing_fields: { Name: 'Dwarf' }, body_html: dwarfHtml },
    { id: 'race54', listing_fields: { Name: 'Gold Dwarf' }, body_html: goldDwarfHtml },
    { grantEntries }
  );

  assert.match(html, /Dwarf — Gold Dwarf/);
  assert.match(html, /Dwarf Benefits/);
  assert.match(html, /Gold Dwarf Benefits/);
  assert.match(html, /race-benefits-list/);
  assert.match(html, /race-benefit-label/);
  assert.match(html, /Average Height/);
  assert.match(html, /Gold Dwarf Power/);
  assert.match(html, /Powers &amp; feats/);

  const castIronCount = (html.match(/Cast-Iron Stomach/g) ?? []).length;
  assert.equal(castIronCount, 2);

  assert.match(html, /race-grant-fold/);
  assert.match(html, /<summary>Dwarven Resilience<\/summary>/);
  assert.match(html, /<summary>Gold Dwarf Resilience<\/summary>/);
  assert.match(html, /race-grant-body/);
  assert.doesNotMatch(html, /<dd>[^<]*Encounter power text/);
  assert.doesNotMatch(html, /<details[^>]*open/i);

  const benefitsIdx = html.indexOf('race-benefits');
  const grantsIdx = html.indexOf('race-grants');
  const flavorIdx = html.indexOf('race-flavor-folds');
  assert.ok(benefitsIdx < grantsIdx);
  assert.ok(grantsIdx < flavorIdx);

  assert.match(html, /PHYSICAL QUALITIES/);
  assert.match(html, /A gold dwarf hails/);
});

test('metric helpers append cm, kg, and meters', () => {
  assert.match(appendMetricHeight('4\'3"–4\'9"'), /cm/);
  assert.match(appendMetricWeight('160–220 lb.'), /kg/);
  assert.equal(appendMetricSpeed('5 squares'), '5 squares · 7.6 m');
  assert.equal(appendMetricSpeed('6 squares.'), '6 squares. · 9.1 m');
  assert.equal(appendMetricVision('Darkvision 60 ft.'), 'Darkvision 60 ft. · 18.3 m');
  assert.equal(appendMetricVision('Low-light'), 'Low-light');
  assert.equal(formatMechanicalValue('Speed', '5 squares'), '5 squares · 7.6 m');
  assert.equal(formatMechanicalValue('Vision', 'Darkvision 60 ft.'), 'Darkvision 60 ft. · 18.3 m');
});

test('extractPowerIdsFromRaceHtml finds power references', () => {
  assert.deepEqual(extractPowerIdsFromRaceHtml('Trait: power99 and power100'), ['power99', 'power100']);
});

test('extractFeatIdsFromRaceHtml finds feat references', () => {
  assert.deepEqual(extractFeatIdsFromRaceHtml('Grants feat1'), ['feat1']);
});

test('buildRaceNotesText compacts mechanical lines and skips height in notes', () => {
  const base = {
    id: 'race2',
    listing_fields: { Name: 'Dwarf' },
    body_html: dwarfHtml
  };
  const notes = buildRaceNotesText(base, null, {});
  assert.match(notes, /Size: Medium/);
  assert.doesNotMatch(notes, /Average Height/);
  assert.doesNotMatch(notes, /PHYSICAL QUALITIES/);
});

test('speed and vision show metric suffix in preview and race notes', () => {
  const entry = {
    id: 'race2',
    listing_fields: { Name: 'Dwarf', Size: 'Medium' },
    body_html: '<blockquote><b>Speed:</b> 5 squares<br><b>Vision:</b> Low-light</blockquote>'
  };

  const speedPair = parseRaceMechanics(entry.body_html).pairs.find((p) => p.label === 'Speed');
  assert.equal(speedPair?.displayValue, '5 squares · 7.6 m');

  const html = renderCombinedRacePreviewHtml(entry, null, {});
  assert.match(html, /5 squares · 7\.6 m/);
  assert.match(html, /Low-light/);

  const notes = buildRaceNotesText(entry, null, {});
  assert.match(notes, /Speed: 5 squares · 7\.6 m/);
  assert.match(notes, /Vision: Low-light/);
});

test('buildRaceNotesText merges subrace benefit lines', () => {
  const notes = buildRaceNotesText(
    { id: 'race2', listing_fields: { Name: 'Dwarf' }, body_html: dwarfHtml },
    { id: 'race54', listing_fields: { Name: 'Gold Dwarf' }, body_html: goldDwarfHtml }
  );
  assert.match(notes, /Subrace: Gold Dwarf/);
  assert.match(notes, /Gold Dwarf Power/);
});

test('extractBenefitSections separates ability model and size with inline html', () => {
  const html =
    '<blockquote><b>Ability scores:</b> +2 <span>Constitution</span>, +2 Wisdom or Strength<br><b>Size:</b> Wrong<br><b>Speed:</b> 5 squares</blockquote>';
  const sections = extractBenefitSections(html, {
    raceName: 'Dwarf',
    entry: dwarfEntry,
    applyAbilityModel: true
  });
  const rows = sections[0]?.rows ?? [];
  const abilityRow = rows.find((r) => r.abilityModel);
  const sizeRow = rows.find((r) => r.label === 'Size');
  assert.ok(abilityRow);
  assert.equal(abilityRow.abilityModel.type, 'choice');
  assert.equal(sizeRow?.displayValue, 'Medium');
  assert.ok(rows.some((r) => r.label === 'Speed'));
});

test('buildAbilityScoreBenefitModel for dwarf and human', () => {
  const dwarfModel = buildAbilityScoreBenefitModel(dwarfEntry);
  assert.equal(dwarfModel.type, 'choice');
  assert.equal(dwarfModel.fixed.length, 1);
  assert.equal(dwarfModel.fixed[0].ability, 'con');
  assert.equal(dwarfModel.decisions[0].choiceGroup, 'dwarf-second');

  const humanModel = buildAbilityScoreBenefitModel(humanEntry);
  assert.equal(humanModel.type, 'choice');
  assert.equal(humanModel.fixed.length, 0);
  assert.equal(humanModel.decisions[0].options[0].ability, 'any');
});

test('buildAbilityScoreBenefitModel parses ability scores from sqlite-style html only', () => {
  const sqliteDwarf = {
    id: 'race2',
    listing_fields: { Name: 'Dwarf', Size: 'Medium' },
    body_html:
      '<blockquote><b>Ability scores:</b> +2 Constitution, +2 Strength or +2 Wisdom<br><b>Size:</b> Medium</blockquote>'
  };
  const model = buildAbilityScoreBenefitModel(sqliteDwarf);
  assert.equal(model?.type, 'choice');
  assert.equal(model.fixed[0].ability, 'con');
  assert.ok(model.decisions[0].options.some((o) => o.ability === 'str'));
  assert.ok(model.decisions[0].options.some((o) => o.ability === 'wis'));

  const html = renderCombinedRacePreviewHtml(sqliteDwarf, null, {
    raceBonusChoices: { ability: {}, skill: {} }
  });
  assert.match(html, /race-benefit-ability/);
  assert.match(html, /race-choice-btn/);
  assert.match(html, /\+2 Constitution/);
});

test('renderCombinedRacePreviewHtml shows inline choice buttons when unresolved', () => {
  const html = renderCombinedRacePreviewHtml(dwarfEntry, null, {
    raceBonusChoices: { ability: {}, skill: {} }
  });
  assert.match(html, /race-choice-btn/);
  assert.match(html, /data-choice-group="dwarf-second"/);
  assert.match(html, /\+2 Constitution/);
  assert.doesNotMatch(html, /race-choice-btn--selected/);
  assert.match(html, /<li class="race-benefit-item"><span class="race-benefit-label">Size:<\/span> Medium<\/li>/);
});

test('renderCombinedRacePreviewHtml shows chosen ability without buttons', () => {
  const html = renderCombinedRacePreviewHtml(dwarfEntry, null, {
    raceBonusChoices: { ability: { 'dwarf-second': 'wis' }, skill: {} }
  });
  assert.match(html, /\+2 Wisdom/);
  assert.doesNotMatch(html, /race-choice-btn/);
});

test('buildRaceNotesText includes resolved ability picks', () => {
  const notes = buildRaceNotesText(dwarfEntry, null, {
    raceBonusChoices: { ability: { 'dwarf-second': 'str' }, skill: {} }
  });
  assert.match(notes, /Ability scores: \+2 Constitution, \+2 Strength/);
  assert.doesNotMatch(notes, /Wisdom or Strength/);
});
