import test from 'node:test';
import assert from 'node:assert/strict';
import { compendiumEntryPageUrl } from '../src/ui/compendium-entry-url.js';

test('compendiumEntryPageUrl builds editor-relative path', () => {
  const url = compendiumEntryPageUrl('glossary331', '/editor/index.html');
  assert.equal(url, '../compendium/entry.html?id=glossary331');
});

test('compendiumEntryPageUrl returns empty for missing id', () => {
  assert.equal(compendiumEntryPageUrl(''), '');
});
