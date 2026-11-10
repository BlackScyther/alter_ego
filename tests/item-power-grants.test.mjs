import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCharacter } from '../src/character/model.js';
import {
  collectItemPowerGrants,
  extractInlineItemPowers,
  extractPowerIdsFromItemHtml,
  inlineItemPowerId,
  parseItemPowerHeading,
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

test('parseItemPowerHeading reads usage, keyword, and action from AV-style titles', () => {
  assert.deepEqual(parseItemPowerHeading('Power ✦ Encounter (Standard Action)'), {
    usage: 'Encounter',
    keyword: '',
    action: 'Standard Action'
  });
  assert.deepEqual(parseItemPowerHeading('Power (Teleportation) ✦ Daily (Move Action)'), {
    usage: 'Daily',
    keyword: 'Teleportation',
    action: 'Move Action'
  });
  assert.deepEqual(parseItemPowerHeading('Power ✦ Consumable Utility (Minor Action)'), {
    usage: 'Consumable Utility',
    keyword: '',
    action: 'Minor Action'
  });
});

test('extractInlineItemPowers reads Hungry Spear style mihead blocks', () => {
  const html =
    '<h2 class=mihead>Property</h2><p class=mistat>Heavy thrown.</p>' +
    '<h2 class=mihead>Power ✦ Encounter (Standard Action)</h2>' +
    '<p class="mistat indent">Make a ranged basic attack with this spear.</p>' +
    '<p class=publishedIn>Published in Adventurer\'s Vault 2.</p>';
  const powers = extractInlineItemPowers(html);
  assert.equal(powers.length, 1);
  assert.equal(powers[0].usage, 'Encounter');
  assert.equal(powers[0].keyword, '');
  assert.equal(powers[0].action, 'Standard Action');
  assert.equal(powers[0].name, '');
  assert.match(powers[0].bodyHtml, /ranged basic attack/i);
  assert.equal(powers[0].bodyHtml.includes('Published'), false);
});

test('extractInlineItemPowers reads a named power card and keeps its own name', () => {
  const html =
    '<h1 class=dailypower>Hand of Salzacas<span class=level>Item Set Power</span></h1>' +
    '<p class=flavor><i>Your bond with the spirit.</i></p>' +
    '<p class=powerstat><b>Daily</b><br><b>Free Action</b> <b>Personal</b></p>' +
    '<p class=powerstat><b>Trigger</b>: You use a warlock power</p>' +
    '<p class=flavor><b>Effect</b>: The power uses the location of the prison.</p>' +
    '<h2 class=mihead>Power ✦ Encounter (Standard Action)</h2>' +
    '<p class="mistat indent">Make a ranged basic attack.</p>' +
    '<p class=publishedIn>Published in Adventurer\'s Vault 2.</p>';
  const powers = extractInlineItemPowers(html);
  assert.equal(powers.length, 2);
  assert.equal(powers[0].name, 'Hand of Salzacas');
  assert.equal(powers[0].usage, 'Daily');
  assert.equal(powers[0].action, 'Free Action');
  assert.match(powers[0].bodyHtml, /Trigger/);
  assert.match(powers[0].bodyHtml, /Effect/);
  assert.equal(powers[0].bodyHtml.includes('ranged basic attack'), false);
  assert.equal(powers[1].name, '');
  assert.equal(powers[1].usage, 'Encounter');
  assert.equal(powers[1].action, 'Standard Action');
});

test('extractInlineItemPowers keeps Consumable Utility instead of collapsing it', () => {
  const html =
    '<h2 class=mihead>Power ✦ Consumable Utility (Minor Action)</h2>' +
    '<p class="mistat indent"><i>Effect:</i> You drink the wine.</p>' +
    '<p class=publishedIn>Published in Dragon Magazine 429.</p>';
  const powers = extractInlineItemPowers(html);
  assert.equal(powers.length, 1);
  assert.equal(powers[0].usage, 'Consumable Utility');
  assert.equal(powers[0].action, 'Minor Action');
  assert.match(powers[0].bodyHtml, /drink the wine/i);
});

test('a Power heading with no usage is still returned', () => {
  const powers = extractInlineItemPowers(
    '<h2 class=mihead>Power (Aura)</h2><p class=mistat>You shed light.</p>'
  );
  assert.equal(powers.length, 1);
  assert.equal(powers[0].usage, null);
  assert.equal(powers[0].keyword, 'Aura');
  assert.match(powers[0].bodyHtml, /shed light/i);
});

test('a Power heading that only links a power id is not an inline power', () => {
  const html = '<h2 class=mihead>Power ✦ Daily (Minor Action)</h2><p>power4</p>';
  assert.equal(extractInlineItemPowers(html).length, 0);
});

test('a named card drops the level span from the power name', () => {
  const html =
    '<h1 class=encounterpower>Dragon Claw Strike<span class=level>Seal of the Lawbringer Attack</span></h1>' +
    '<p class=powerstat><b>Encounter</b><br><b>Standard Action</b></p>' +
    '<p class=powerstat><b>Attack</b>: Strength vs. AC</p>';
  const powers = extractInlineItemPowers(html);
  assert.equal(powers.length, 1);
  assert.equal(powers[0].name, 'Dragon Claw Strike');
  assert.equal(powers[0].usage, 'Encounter');
  assert.equal(powers[0].action, 'Standard Action');
});

test('Hungry Spear inventory grants an inline Encounter item power', async () => {
  const hungryHtml =
    '<h1 class=mihead>Hungry Spear</h1>' +
    '<h2 class=mihead>Property</h2><p class=mistat>Heavy thrown.</p>' +
    '<h2 class=mihead>Power ✦ Encounter (Standard Action)</h2>' +
    '<p class="mistat indent">Make a ranged basic attack with this spear. On a hit, immobilized.</p>';
  const character = createCharacter();
  character.selections.equipmentItems = [
    { instanceId: 'spear1', compendiumId: 'weapon1582', categorySlug: 'weapon', slotId: 'main-hand' }
  ];
  const grants = await collectItemPowerGrants(character, {
    async getEntry(id) {
      if (id === 'weapon1582') {
        return {
          id: 'weapon1582',
          category_slug: 'weapon',
          listing_fields: { Name: 'Hungry Spear', SourceBook: 'AV2' },
          body_html: hungryHtml
        };
      }
      return null;
    }
  });
  assert.equal(grants.length, 1);
  assert.equal(grants[0].inline, true);
  assert.equal(grants[0].powerName, 'Hungry Spear');
  assert.equal(grants[0].usage, 'Encounter');
  assert.equal(grants[0].powerId, inlineItemPowerId('weapon1582', 0));
  assert.equal(grants[0].linkId, 'weapon1582');
  assert.equal(grants[0].action, 'Standard Action');
  assert.equal(grants[0].sourceBook, 'AV2');
});

test('Hand of Salzacas keeps its card name when the item is only in inventory', async () => {
  const html =
    '<h1 class=dailypower>Hand of Salzacas<span class=level>Item Set Power</span></h1>' +
    '<p class=powerstat><b>Daily</b><br><b>Free Action</b> <b>Personal</b></p>' +
    '<p class=flavor><b>Effect</b>: The power uses the location of the prison.</p>';
  const character = createCharacter();
  character.selections.equipmentItems = [
    { instanceId: 'set1', compendiumId: 'item411', categorySlug: 'item', slotId: null }
  ];
  const grants = await collectItemPowerGrants(character, {
    async getEntry(id) {
      if (id === 'item411') {
        return {
          id: 'item411',
          category_slug: 'item',
          listing_fields: { Name: "Zy Tormtor's Trinkets", SourceBook: 'AV2' },
          body_html: html
        };
      }
      return null;
    }
  });
  assert.equal(grants.length, 1);
  assert.equal(grants[0].powerName, 'Hand of Salzacas');
  assert.equal(grants[0].usage, 'Daily');
  assert.equal(grants[0].action, 'Free Action');
  assert.equal(grants[0].sourceBook, 'AV2');
  assert.equal(grants[0].slotId, null);
});

test('stored item_power rows are used instead of parsing the item HTML again', async () => {
  const character = createCharacter();
  character.selections.equipmentItems = [
    { instanceId: 'spear1', compendiumId: 'weapon1582', categorySlug: 'weapon', slotId: null }
  ];
  const grants = await collectItemPowerGrants(character, {
    async getEntry() {
      return {
        id: 'weapon1582',
        category_slug: 'weapon',
        listing_fields: { Name: 'Hungry Spear', SourceBook: 'AV2' },
        body_html: '<h2 class=mihead>Power ✦ Daily (Minor Action)</h2><p>Should not be used.</p>'
      };
    },
    async listItemPowers() {
      return [
        {
          id: 'weapon1582#item-power-0',
          sort_index: 0,
          name: 'Hungry Spear',
          power_type: 'Encounter',
          action: 'Standard Action',
          keyword: null,
          source_book: 'AV2',
          body_html: '<p>Make a ranged basic attack.</p>'
        }
      ];
    }
  });
  assert.equal(grants.length, 1);
  assert.equal(grants[0].usage, 'Encounter');
  assert.equal(grants[0].action, 'Standard Action');
  assert.equal(grants[0].powerName, 'Hungry Spear');
  assert.match(grants[0].bodyHtml, /ranged basic attack/);
  assert.equal(grants[0].bodyHtml.includes('Should not be used'), false);
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
