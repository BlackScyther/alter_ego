import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  parseRaceReplacements,
  resolveReplacedBaseItems,
  renderCombinedRacePreviewHtml,
  buildRaceNotesText
} from '../src/character/race-parse.js';
import { ensureRaceSelectionsShape, collectRaceGrantIds } from '../src/character/race-selections.js';
import { setReplacementMap, resetReplacementMap } from '../src/character/race-replacements.js';

const baseEntry = {
  id: 'race1',
  listing_fields: { Name: 'Dragonborn', Size: 'Medium' },
  body_html:
    '<blockquote><b>Size:</b> Medium<br><b>Speed:</b> 6 squares<br>' +
    '<b>Dragon Breath:</b> power10<br><b>Stoic Stand:</b> power11<br>' +
    '<b>Draconic Heritage:</b> +2 to a defense vs fear</blockquote>'
};

const subEntry = {
  id: 'race2',
  listing_fields: { Name: 'Bozak Draconian' },
  body_html:
    '<blockquote><b>Draconian Flight:</b> power20</blockquote>' +
    '<h3>Bozak Draconian Benefits</h3>' +
    "<p>This trait replaces the dragonborn's Dragon Breath racial trait.</p>"
};

test('parseRaceReplacements detects a "replaces ... trait" phrase', () => {
  const repl = parseRaceReplacements(subEntry);
  assert.ok(
    repl.some((r) => r.targetName.toLowerCase() === 'dragon breath' && r.kind === 'trait'),
    JSON.stringify(repl)
  );
});

test('parseRaceReplacements reads the kind from the keyword', () => {
  const repl = parseRaceReplacements({
    body_html: "<p>You don't use this; instead of the Acid Breath power you gain flight.</p>"
  });
  assert.ok(repl.some((r) => r.targetName.toLowerCase() === 'acid breath' && r.kind === 'power'));
});

test('resolveReplacedBaseItems merges parsed names with the curated map', () => {
  setReplacementMap({ race2: { replacesTraits: ['Draconic Heritage'], replacesPowerIds: ['power10'] } });
  try {
    const { names, ids } = resolveReplacedBaseItems(baseEntry, subEntry);
    assert.ok(names.has('dragon breath')); // from the parser
    assert.ok(names.has('draconic heritage')); // from curated
    assert.ok(ids.has('power10')); // from curated
  } finally {
    resetReplacementMap();
  }
});

test('combined preview drops a replaced base grant fold but keeps the subrace one', () => {
  const html = renderCombinedRacePreviewHtml(baseEntry, subEntry, {
    grantEntries: [
      { id: 'power10', name: 'Dragon Breath', kind: 'power', bodyHtml: '<p>breath</p>' },
      { id: 'power20', name: 'Draconian Flight', kind: 'power', bodyHtml: '<p>fly</p>' }
    ]
  });
  assert.ok(!html.includes('<summary>Dragon Breath</summary>'));
  assert.ok(html.includes('<summary>Draconian Flight</summary>'));
});

test('combined preview drops a replaced base trait row (curated)', () => {
  assert.ok(renderCombinedRacePreviewHtml(baseEntry, null, {}).includes('Draconic Heritage'));
  setReplacementMap({ race2: { replacesTraits: ['Draconic Heritage'] } });
  try {
    const html = renderCombinedRacePreviewHtml(baseEntry, subEntry, {});
    assert.ok(!html.includes('Draconic Heritage'));
  } finally {
    resetReplacementMap();
  }
});

test('collectRaceGrantIds drops a replaced base power by resolved name', () => {
  const character = createCharacter();
  ensureRaceSelectionsShape(character);
  character.selections.raceId = 'race1';
  const { racePowerIds } = collectRaceGrantIds(character, baseEntry, subEntry, {
    grantNameById: new Map([['power10', 'Dragon Breath']])
  });
  assert.ok(!racePowerIds.includes('power10'));
  assert.ok(racePowerIds.includes('power11'));
  assert.ok(racePowerIds.includes('power20'));
});

test('collectRaceGrantIds drops a replaced base power by curated id', () => {
  const character = createCharacter();
  ensureRaceSelectionsShape(character);
  character.selections.raceId = 'race1';
  setReplacementMap({ race2: { replacesPowerIds: ['power10'] } });
  try {
    const { racePowerIds } = collectRaceGrantIds(character, baseEntry, subEntry);
    assert.ok(!racePowerIds.includes('power10'));
    assert.ok(racePowerIds.includes('power20'));
  } finally {
    resetReplacementMap();
  }
});

test('buildRaceNotesText omits a replaced base trait line', () => {
  assert.match(buildRaceNotesText(baseEntry, null, {}), /Draconic Heritage/);
  const notes = buildRaceNotesText(baseEntry, subEntry, { replacedNames: ['Draconic Heritage'] });
  assert.ok(!/Draconic Heritage/.test(notes));
});
