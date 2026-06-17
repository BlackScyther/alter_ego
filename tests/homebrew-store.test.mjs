import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGmSlug,
  homebrewSourceBook,
  buildIndexText,
  newHomebrewId
} from '../server/homebrew.mjs';

describe('homebrew store helpers', () => {
  it('validates GM slug', () => {
    assert.equal(validateGmSlug('marcus').ok, true);
    assert.equal(validateGmSlug('bad slug').ok, false);
    assert.equal(validateGmSlug('').ok, false);
  });

  it('builds source book label', () => {
    assert.equal(homebrewSourceBook('marcus'), 'hbrw_marcus');
  });

  it('generates homebrew ids', () => {
    const id = newHomebrewId('race');
    assert.match(id, /^hb_race_/);
  });

  it('builds index text from fields and html', () => {
    const text = buildIndexText({ Name: 'Elf', Origin: 'Fey' }, '<p>Graceful.</p>');
    assert.match(text, /Elf/);
    assert.match(text, /Graceful/);
  });
});
