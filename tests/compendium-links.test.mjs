import test from 'node:test';
import assert from 'node:assert/strict';
import { linkCompendiumTermsInText } from '../src/ui/compendium-links.js';

const index = {
  terms: [
    { id: 'race54', name: 'Gold Dwarf', category_slug: 'race' },
    { id: 'race2', name: 'Dwarf', category_slug: 'race' }
  ]
};

test('longest-first linking prefers Gold Dwarf over Dwarf', () => {
  const html = linkCompendiumTermsInText('Play a Gold Dwarf fighter', index);
  assert.match(html, /data-entry-id="race54"/);
  assert.doesNotMatch(html, /data-entry-id="race2"/);
});

test('linkCompendiumTermsInText escapes HTML in plain text', () => {
  const html = linkCompendiumTermsInText('<script>alert(1)</script>', { terms: [] });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('word boundaries avoid partial matches', () => {
  const html = linkCompendiumTermsInText('Dwarven resilience', index);
  assert.doesNotMatch(html, /comp-link/);
});
