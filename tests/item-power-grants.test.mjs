import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCharacter } from '../src/character/model.js';
import {
  collectItemPowerGrants,
  extractPowerIdsFromItemHtml,
  usageNearPowerMention
} from '../src/character/item-power-grants.js';
import { renderGrantSectionHtml } from '../src/editor/steps/grant-section-html.js';

function grantSectionPositions(relativePath, marker, ids) {
  const file = fileURLToPath(new URL(relativePath, import.meta.url));
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(marker);
  const slice = source.slice(start);
  return ids.map((id) => slice.indexOf(`'${id}'`));
}

test('powers and feats list grant sections as race, class, background, theme, then items', () => {
  const powers = grantSectionPositions('../src/editor/steps/power-step.js', 'host.innerHTML', [
    'race',
    'class',
    'background',
    'theme',
    'items'
  ]);
  const feats = grantSectionPositions('../src/editor/steps/feat-step.js', 'host.innerHTML', [
    'race-feats',
    'class-feats',
    'background-feats',
    'theme-feats',
    'item-feats'
  ]);
  for (const positions of [powers, feats]) {
    assert.ok(positions.every((index) => index >= 0));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  }
});

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

test('inventory items that link a power produce grants, equipped or not', async () => {
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
  const grants = await collectItemPowerGrants(character, {
    async getEntry(id) {
      return entries[id] ?? null;
    }
  });
  assert.equal(grants.length, 2);
  assert.equal(grants[0].itemName, 'Cloak of Resistance +1');
  assert.equal(grants[0].slotLabel, 'Neck');
  assert.equal(grants[0].powerName, 'Brute Strike');
  assert.equal(grants[0].usage, 'Daily');
  assert.equal(grants[1].slotId, null);
  assert.equal(grants[1].powerName, 'Brute Strike');
});

test('item section names the power, keeps the link on the name line, and shows usage in the box', () => {
  const html = renderGrantSectionHtml({
    kind: 'items',
    title: 'Items',
    ariaLabel: 'Item powers',
    note: 'Granted by items in your inventory.',
    groups: [
      {
        rows: [
          {
            name: 'Brute Strike',
            meta: 'Cloak of Resistance +1',
            usage: 'Daily',
            links: [
              { href: 'power.html', ariaLabel: 'Open Brute Strike in compendium' }
            ]
          }
        ]
      }
    ]
  });
  const nameAt = html.indexOf('Brute Strike');
  const linkAt = html.indexOf('Open Brute Strike in compendium');
  const usageAt = html.indexOf('Daily');
  assert.ok(nameAt >= 0);
  assert.ok(linkAt > nameAt);
  assert.ok(usageAt > linkAt);
  assert.match(html, /power-grant-name-line/);
  assert.equal(html.includes('power-type-heading'), false);
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
