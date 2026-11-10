import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCharacter } from '../src/character/model.js';
import { buildPowerIndex, characterToSheetPayload } from '../src/character/sheet-bridge.js';
import { sheetInitiativeMisc } from '../src/character/hp.js';
import { applySheetValueToCharacter } from '../src/editor/sheet-mirror.js';

test('power index groups powers by usage and keeps racial and class powers', () => {
  const groups = buildPowerIndex({
    powers: 'At-Will: Bull Rush Attack\nLevel 3 encounter: Vengeance is Mine\nDaily Utility: Inspiring Word\nEnc. Attack: Lead the Attack\nConsumable Utility: Sonata Wine',
    racialPowers: 'Swiftcurrent',
    classPowers: 'Inspiring Word'
  });
  const byId = Object.fromEntries(groups.map((group) => [group.id, group.items]));
  assert.deepEqual(byId['at-will'], ['Bull Rush Attack']);
  assert.deepEqual(byId.encounter, ['Vengeance is Mine', 'Lead the Attack']);
  assert.deepEqual(byId.utility, ['Inspiring Word']);
  assert.deepEqual(byId.consumable, ['Sonata Wine']);
  assert.deepEqual(byId.other, ['Swiftcurrent']);
  assert.equal(byId.daily, undefined);
});

test('sheet payload carries the power index', () => {
  const character = createCharacter();
  character.notes.powers = 'At-Will: Commanders Strike';
  character.notes.racialPowers = 'Swiftcurrent';
  const payload = characterToSheetPayload(character);
  assert.ok(payload['class-powers'].includes('Commanders Strike'));
  assert.ok(payload['racial-powers'].includes('Swiftcurrent'));
  const names = payload['power-index'].flatMap((group) => group.items);
  assert.ok(names.includes('Commanders Strike'));
  assert.ok(names.includes('Swiftcurrent'));
});

test('sheet Misc includes feat and class initiative', () => {
  const character = createCharacter();
  character.sheet.derivedBonuses.initiative = 6;
  character.sheet.derivedBonuses.initiativeClass = 2;
  character.sheet.derivedBonuses.initiativeFeat = 4;
  character.sheet.initMisc = 0;
  assert.equal(sheetInitiativeMisc(character), 6);
  assert.equal(characterToSheetPayload(character)['init-misc'], 6);
});

test('editing the Misc box keeps only the extra beyond feature bonuses', () => {
  const character = createCharacter();
  character.sheet.derivedBonuses.initiative = 6;
  character.sheet.derivedBonuses.initiativeFeat = 4;
  character.sheet.derivedBonuses.initiativeClass = 2;
  applySheetValueToCharacter(character, 'init-misc', 7);
  assert.equal(character.sheet.initMisc, 1);
  assert.equal(sheetInitiativeMisc(character), 7);
});

test('sheet defenses use the higher ability modifier', () => {
  const character = createCharacter();
  character.abilities.scores = { str: 20, con: 12, dex: 10, int: 17, wis: 10, cha: 8 };
  character.sheet.armorIsHeavy = true;
  const payload = characterToSheetPayload(character);
  assert.equal(payload['fort-abil'], 5);
  assert.equal(payload['ref-abil'], 3);
  assert.equal(payload['will-abil'], 0);
  assert.equal(payload['ac-abil'], 0);
});

test('printable sheet page has no editable fields', () => {
  const html = readFileSync(new URL('../src/sheet/index.html', import.meta.url), 'utf8');
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.doesNotMatch(main, /<input|<textarea|<select/i);
  assert.match(html, /id="include-power-cards"/);
  assert.match(html, /id="power-cards"/);
});
