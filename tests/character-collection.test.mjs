import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCharacter } from '../src/character/model.js';
import { collectClassGrantIds } from '../src/character/class-selections.js';
import { collectFeatItems, collectPowerItems, syncCollectionNotes } from '../src/character/character-collection.js';
import { extractGainedFeatNames } from '../src/character/feat-grant-scan.js';
import { characterToSheetPayload } from '../src/character/sheet-bridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', 'class-html', name), 'utf8');

const warlordEntry = {
  id: 'class8',
  listing_fields: { Name: 'Warlord (Marshal)', RoleName: 'Leader' },
  body_html: fixture('warlord-marshal.html')
};

const stubCompendium = {
  async getEntry(id) {
    const map = {
      power1590: { id: 'power1590', listing_fields: { Name: 'Inspiring Word', Type: 'Enc. Feature' } },
      power1063: { id: 'power1063', listing_fields: { Name: "Viper's Strike", Type: 'At-Will Attack', Level: '1' } },
      power2643: { id: 'power2643', listing_fields: { Name: 'Swiftcurrent', Type: 'Encounter Utility', Level: '1' } }
    };
    return map[id] ?? null;
  }
};

test('collectClassGrantIds includes class-feature metadata for Warlord', () => {
  const character = createCharacter();
  character.selections.classId = 'class8';
  const { classPowerIds } = collectClassGrantIds(character, warlordEntry);
  assert.ok(classPowerIds.includes('power1590'));
  assert.equal(classPowerIds.includes('power10887'), false);
});

test('suggested build powers are not class-feature grants', () => {
  const entry = {
    id: 'class8',
    listing_fields: { Name: 'Warlord (Marshal)' },
    body_html: `<blockquote><b>Build Options: </b>Inspiring Warlord.</blockquote>
<h3>INSPIRING WARLORD</h3>
<b>Suggested At-Will Powers</b>: <i><a href="?view=power1061">commander's strike</a>, furious smash</i>
<h3>CLASS FEATURES</h3>
<b>INSPIRING WORD</b><br>You gain the inspiring word power (<a href="?view=power1590">power1590</a>).`
  };
  const character = createCharacter();
  character.selections.classId = 'class8';
  character.selections.classBuildChoices = { build: 'inspiring-warlord' };
  // Stale id from the old build-option powerIds mistake must be replaced on sync.
  character.selections.classPowerIds = ['power1061', 'power1590'];
  const { classPowerIds } = collectClassGrantIds(character, entry);
  assert.deepEqual(classPowerIds, ['power1590']);
  assert.equal(classPowerIds.includes('power1061'), false);
});

test('Battlefront Leader grants Battlefront Shift', () => {
  const entry = {
    id: 'class8',
    listing_fields: { Name: 'Warlord (Marshal)' },
    body_html: `<blockquote><b>Build Options: </b>Shielding Warlord.</blockquote>
<h3>SHIELDING WARLORD</h3>
<b>Class Feature</b>: Battlefront Leader
<h3>CLASS FEATURES</h3>
<b>BATTLEFRONT LEADER</b><br>This class feature replaces your Combat Leader class feature. You gain the battlefront shift power.
<b>COMBAT LEADER</b><br>You gain a +2 power bonus to initiative.`
  };
  const character = createCharacter();
  character.selections.classId = 'class8';
  character.selections.classBuildChoices = { build: 'shielding-warlord' };
  const { classPowerIds } = collectClassGrantIds(character, entry);
  assert.ok(classPowerIds.includes('power1590'));
  assert.ok(classPowerIds.includes('power10887'));
});

test('collectPowerItems includes class feature powers', async () => {
  const character = createCharacter();
  character.selections.classId = 'class8';
  character.selections.classPowerIds = collectClassGrantIds(character, warlordEntry).classPowerIds;
  const items = await collectPowerItems(character, stubCompendium, { universalMeta: { groups: [], resolved: [] } });
  assert.ok(items.some((i) => i.id === 'power1590' && i.name === 'Inspiring Word'));
});

test('syncCollectionNotes keeps granted powers in their own categories', async () => {
  const character = createCharacter();
  character.selections.classId = 'class8';
  character.selections.classPowerIds = collectClassGrantIds(character, warlordEntry).classPowerIds;
  character.selections.racePowerIds = ['power2643'];
  await syncCollectionNotes(character, stubCompendium);
  assert.ok(character.notes.classPowers.includes('Inspiring Word'));
  assert.ok(!character.notes.powers.includes('Inspiring Word'));
  assert.ok(!character.notes.powers.includes('Swiftcurrent'));
  assert.equal(character.selections.grantSlots.racePowers[0].category, 'race-power');
  assert.equal(character.selections.grantSlots.classPowers[0].category, 'class-power');
  const sheet = characterToSheetPayload(character);
  assert.ok(sheet['class-powers'].includes('Inspiring Word'));
  assert.ok(sheet['racial-powers'].includes('Swiftcurrent'));
});

test('a conditional sentence does not grant a feat by name', () => {
  assert.deepEqual(
    extractGainedFeatNames('If you already have the Linguist feat, you gain nothing.'),
    []
  );
  assert.deepEqual(extractGainedFeatNames('<p>You gain the Linguist feat.</p>'), ['Linguist']);
});

test('collection includes theme powers, unequipped item powers, and background and item feats', async () => {
  const entries = {
    background1: {
      id: 'background1',
      category_slug: 'background',
      listing_fields: { Name: 'Scholar', SourceBook: 'Player\'s Handbook' },
      body_html: '<p>You gain the Linguist feat. You also gain power9.</p>'
    },
    feat12: {
      id: 'feat12',
      category_slug: 'feat',
      listing_fields: { Name: 'Linguist', Tier: 'Heroic', SourceBook: 'Player\'s Handbook' }
    },
    power9: {
      id: 'power9',
      category_slug: 'power',
      listing_fields: { Name: 'Scholar\'s Insight', Type: 'Encounter Utility' }
    },
    power77: {
      id: 'power77',
      category_slug: 'power',
      listing_fields: { Name: 'Quick Line', Type: 'At-Will' }
    },
    item8: {
      id: 'item8',
      category_slug: 'item',
      listing_fields: { Name: 'Bag of Tricks' },
      body_html: '<p>You gain the Alertness feat. Power: power4.</p>'
    },
    feat3: {
      id: 'feat3',
      category_slug: 'feat',
      listing_fields: { Name: 'Alertness', Tier: 'Heroic' }
    },
    power4: {
      id: 'power4',
      category_slug: 'power',
      listing_fields: { Name: 'Brute Strike', Type: 'Daily' }
    }
  };
  const compendium = {
    async getEntry(id) {
      return entries[String(id).toLowerCase()] ?? null;
    },
    async listEntries(category, opts) {
      const needle = String(opts?.search ?? '').toLowerCase();
      return Object.values(entries).filter(
        (entry) =>
          entry.category_slug === category &&
          String(entry.listing_fields?.Name ?? '').toLowerCase() === needle
      );
    }
  };
  const character = createCharacter();
  character.selections.backgroundId = 'background1';
  character.selections.grantSlots.themePowers = [{ id: 'power77', name: 'Quick Line', category: 'theme-power' }];
  character.selections.equipmentItems = [
    { instanceId: 'bag', compendiumId: 'item8', categorySlug: 'item', slotId: null }
  ];

  const powers = await collectPowerItems(character, compendium);
  assert.ok(powers.some((item) => item.id === 'power9' && item.source === 'Background'));
  assert.ok(powers.some((item) => item.id === 'power77' && item.source === 'Theme'));
  assert.ok(powers.some((item) => item.id === 'power4' && item.source === 'Item' && item.detail === 'Bag of Tricks'));

  const feats = await collectFeatItems(character, compendium);
  assert.ok(feats.some((item) => item.id === 'feat12' && item.name === 'Linguist' && item.source === 'Background'));
  assert.ok(feats.some((item) => item.id === 'feat3' && item.name === 'Alertness' && item.source === 'Item'));

  await syncCollectionNotes(character, compendium);
  assert.ok(character.notes.powers.includes('Utility: Scholar\'s Insight'));
  assert.ok(character.notes.powers.includes('Daily: Brute Strike'));
  assert.equal(character.notes.powers.includes('Quick Line'), false);
});
