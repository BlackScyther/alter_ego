import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMonsterFlavorFolds,
  renderCombinedRacePreviewHtml
} from '../src/character/race-parse.js';
import {
  getCuratedMonsterRefs,
  setMonsterFluffMap,
  resetMonsterFluffMap
} from '../src/character/monster-fluff.js';

const bugbearMonster = {
  id: 'monster_bugbear',
  listing_fields: { Name: 'Bugbear', Level: '5', Size: 'Medium', CreatureType: 'Humanoid' },
  body_html:
    '<h1 class=monster>Bugbear Warrior</h1>' +
    '<p class=flavor>HP 75; Bloodied 37; AC 19, Fortitude 17, Reflex 16, Will 14</p>' +
    '<p>Speed 6; Initiative +5; Perception +4</p>' +
    '<p>Bugbears are towering, hairy goblinoids that tower over their smaller kin and ' +
    'rule them through brute strength and casual cruelty.</p>' +
    '<p>They favor ambushes from the shadows, savoring the terror of prey that never ' +
    'sees the strike coming, and they collect grisly trophies from fallen foes.</p>' +
    '<p>Nature DC 20: A bugbear stands nearly seven feet tall.</p>'
};

test('extractMonsterFlavorFolds keeps prose and drops stat lines', () => {
  const folds = extractMonsterFlavorFolds(bugbearMonster);
  assert.equal(folds.length, 1);
  const body = folds[0].bodyHtml;
  assert.match(body, /towering, hairy goblinoids/);
  assert.match(body, /ambushes from the shadows/);
  // Stat lines and DC-bearing lines are excluded.
  assert.ok(!/Bloodied/.test(body));
  assert.ok(!/Initiative/.test(body));
  assert.ok(!/Nature DC/.test(body));
});

test('extractMonsterFlavorFolds summarizes with the monster name', () => {
  const folds = extractMonsterFlavorFolds(bugbearMonster);
  assert.match(folds[0].summary, /Bugbear/);
});

test('extractMonsterFlavorFolds returns [] when there is no prose', () => {
  const statOnly = {
    listing_fields: { Name: 'Goblin' },
    body_html: '<p>HP 29; AC 16, Fortitude 13, Reflex 14, Will 11</p><p>Speed 6</p>'
  };
  assert.deepEqual(extractMonsterFlavorFolds(statOnly), []);
});

test('extractMonsterFlavorFolds handles null/empty input', () => {
  assert.deepEqual(extractMonsterFlavorFolds(null), []);
  assert.deepEqual(extractMonsterFlavorFolds({ body_html: '' }), []);
});

const bugbearRace = {
  id: 'race90',
  listing_fields: { Name: 'Bugbear', Size: 'Medium' },
  body_html:
    '<blockquote><b>Size:</b> Medium<br><b>Speed:</b> 6 squares<br>' +
    '<b>Ability scores:</b> +2 Strength, +2 Dexterity</blockquote>'
};

test('combined preview appends a collapsed monster-lore fold', () => {
  const html = renderCombinedRacePreviewHtml(bugbearRace, null, {
    monsterFlavor: [bugbearMonster]
  });
  assert.match(html, /<details class="race-flavor-fold"><summary>Bugbear \(monster lore\)<\/summary>/);
  assert.match(html, /towering, hairy goblinoids/);
  // Collapsed by default: the monster fold has no `open` attribute.
  assert.ok(!/<details class="race-flavor-fold" open/.test(html));
});

test('combined preview omits monster fold when none supplied', () => {
  const html = renderCombinedRacePreviewHtml(bugbearRace, null, {});
  assert.ok(!/monster lore/.test(html));
});

test('getCuratedMonsterRefs defaults to empty and reads overrides', () => {
  assert.deepEqual(getCuratedMonsterRefs('race90', 'Bugbear'), {
    monsterIds: [],
    monsterNames: [],
    disabled: false
  });
  setMonsterFluffMap({
    byName: { Bugbear: { monsterNames: ['Bugbear'] }, Human: { disabled: true } },
    byId: { race90: { monsterIds: ['monster_bugbear'] } }
  });
  try {
    assert.deepEqual(getCuratedMonsterRefs('race90', 'Bugbear').monsterIds, ['monster_bugbear']);
    assert.deepEqual(getCuratedMonsterRefs(null, 'Bugbear').monsterNames, ['Bugbear']);
    assert.equal(getCuratedMonsterRefs(null, 'Human').disabled, true);
  } finally {
    resetMonsterFluffMap();
  }
});
