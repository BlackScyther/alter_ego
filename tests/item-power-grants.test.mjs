import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  collectEquippedItemPowerGrants,
  extractPowerIdsFromItemHtml,
  usageNearPowerMention
} from '../src/character/item-power-grants.js';
import { groupsForUsage, renderGrantSectionHtml } from '../src/editor/steps/grant-section-html.js';

test('extractPowerIdsFromItemHtml finds linked powers', () => {
  assert.deepEqual(
    extractPowerIdsFromItemHtml('<p><b>Power (Daily):</b> You gain power4.</p>'),
    ['power4']
  );
});

test('usageNearPowerMention uses the closest usage word before the power', () => {
  const html = '<p>Property: daily use of light. <b>Power (At-Will):</b> power9</p>';
  assert.equal(usageNearPowerMention(html, 'power9'), 'At-Will');
});

test('only equipped items that link a power produce grants, grouped by usage', async () => {
  const entries = {
    item2: {
      id: 'item2',
      category_slug: 'item',
      listing_fields: { Name: 'Cloak of Resistance +1' },
      body_html: '<p><b>Power (Daily):</b> power4</p>'
    },
    item1: {
      id: 'item1',
      category_slug: 'item',
      listing_fields: { Name: 'Rope' },
      body_html: '<p>No power.</p>'
    },
    power4: {
      id: 'power4',
      category_slug: 'power',
      listing_fields: { Name: 'Brute Strike', Type: 'Daily' }
    }
  };
  const character = createCharacter();
  character.selections.equipmentItems = [
    { instanceId: 'worn', compendiumId: 'item2', categorySlug: 'item', slotId: 'neck' },
    { instanceId: 'bag', compendiumId: 'item2', categorySlug: 'item', slotId: null },
    { instanceId: 'rope', compendiumId: 'item1', categorySlug: 'item', slotId: 'waist' }
  ];
  const grants = await collectEquippedItemPowerGrants(character, {
    async getEntry(id) {
      return entries[id] ?? null;
    }
  });
  assert.equal(grants.length, 1);
  assert.equal(grants[0].itemName, 'Cloak of Resistance +1');
  assert.equal(grants[0].slotLabel, 'Neck');
  assert.equal(grants[0].powerName, 'Brute Strike');
  assert.equal(grants[0].usage, 'Daily');

  const groups = groupsForUsage(
    grants.map((grant) => ({
      name: grant.itemName,
      meta: `${grant.slotLabel} · ${grant.powerName}`,
      usage: grant.usage,
      links: []
    }))
  );
  assert.deepEqual(
    groups.map((group) => group.heading),
    ['Daily']
  );
});

test('equipment section links the item and then the power, and hides when empty', () => {
  const html = renderGrantSectionHtml({
    kind: 'equipment',
    title: 'Equipment',
    ariaLabel: 'Equipment powers',
    note: 'Granted by equipped items.',
    groups: groupsForUsage([
      {
        name: 'Cloak of Resistance +1',
        meta: 'Neck · Brute Strike',
        usage: 'Daily',
        links: [
          { href: 'item.html', ariaLabel: 'Open item Cloak of Resistance +1 in compendium', text: 'Item' },
          { href: 'power.html', ariaLabel: 'Open power Brute Strike in compendium', text: 'Power' }
        ]
      }
    ])
  });
  const itemAt = html.indexOf('Open item Cloak of Resistance +1 in compendium');
  const powerAt = html.indexOf('Open power Brute Strike in compendium');
  assert.ok(itemAt > 0);
  assert.ok(powerAt > itemAt);
  assert.match(html, /aria-readonly="true"/);
  assert.equal(html.includes('<button'), false);

  assert.equal(
    renderGrantSectionHtml({
      kind: 'equipment',
      title: 'Equipment',
      ariaLabel: 'Equipment powers',
      note: 'Granted by equipped items.',
      groups: []
    }),
    ''
  );
});
