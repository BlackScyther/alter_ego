import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCharacter } from '../src/character/model.js';
import { collectClassGrantIds } from '../src/character/class-selections.js';
import { collectPowerItems, syncCollectionNotes } from '../src/character/character-collection.js';
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
