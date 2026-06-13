import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  hasRitualCaster,
  extractRitualIdsFromHtml,
  getRitualSlotsForLevel,
  setRitualForSlot,
  pruneRitualSelections,
  ensureRitualSelectionsShape
} from '../src/character/ritual-selections.js';

const stubCompendium = {
  async getEntry(id) {
    if (id === 'class9') {
      return {
        id: 'class9',
        body_html: '<blockquote><b>Class features:</b> Ritual Casting, Spellbook.</blockquote>'
      };
    }
    return null;
  }
};

test('extractRitualIdsFromHtml finds ritual tokens', () => {
  assert.deepEqual(extractRitualIdsFromHtml('Learn ritual42 and ritual99'), ['ritual42', 'ritual99']);
});

test('hasRitualCaster detects class HTML ritual casting', async () => {
  const character = createCharacter();
  character.selections.classId = 'class9';
  assert.equal(await hasRitualCaster(character, stubCompendium), true);
});

test('ritual slot pruning drops slots above level', () => {
  const character = createCharacter({ identity: { level: 1 } });
  ensureRitualSelectionsShape(character);
  setRitualForSlot(character, 'ritual-free-1', 'ritual1');
  character.identity.level = 1;
  pruneRitualSelections(character);
  assert.equal(getRitualSlotsForLevel(1).length, 2);
  assert.ok(character.selections.ritualSelections['ritual-free-1']);
});
