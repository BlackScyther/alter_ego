import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadCharactersFromFiles,
  loadCharactersFromTexts
} from '../src/character/party-loader.js';
import { INJECTION_PAYLOADS, validCharacter } from './helpers/test-server.mjs';

function jsonFile(name, data) {
  return new File([JSON.stringify(data)], name, { type: 'application/json' });
}

describe('loadCharactersFromTexts (GM backup import / folder picker)', () => {
  it('loads valid character JSON from text items', () => {
    const doc = validCharacter();
    const { loaded, failed } = loadCharactersFromTexts([
      { name: 'Hero_1.json', text: JSON.stringify(doc) }
    ]);
    assert.equal(loaded.length, 1);
    assert.equal(failed.length, 0);
    assert.equal(loaded[0].file, 'Hero_1.json');
    assert.equal(loaded[0].character.identity.characterName, 'Test Hero');
  });

  it('rejects invalid JSON without throwing', () => {
    const { loaded, failed } = loadCharactersFromTexts([
      { name: 'broken.json', text: '{ not valid' }
    ]);
    assert.equal(loaded.length, 0);
    assert.equal(failed.length, 1);
    assert.match(failed[0].error, /JSON/i);
  });

  it('rejects documents missing required identity fields', () => {
    const { loaded, failed } = loadCharactersFromTexts([
      { name: 'empty.json', text: JSON.stringify({ id: 'x', version: 1 }) }
    ]);
    assert.equal(loaded.length, 0);
    assert.equal(failed.length, 1);
    assert.match(failed[0].error, /identity/i);
  });

  it('accepts malicious filenames without executing content', () => {
    const doc = validCharacter();
    const maliciousNames = [
      INJECTION_PAYLOADS.pathTraversal,
      INJECTION_PAYLOADS.xssScript + '.json',
      "Robert'); DROP TABLE characters;--_1.json"
    ];
    for (const name of maliciousNames) {
      const { loaded, failed } = loadCharactersFromTexts([
        { name, text: JSON.stringify(doc) }
      ]);
      assert.equal(failed.length, 0, `expected load ok for filename: ${name}`);
      assert.equal(loaded[0].file, name);
    }
  });

  it('loads characters with XSS payloads in identity fields', () => {
    const doc = validCharacter({
      identity: {
        characterName: INJECTION_PAYLOADS.xssScript,
        level: 1,
        playerName: INJECTION_PAYLOADS.xssImg
      }
    });
    const { loaded } = loadCharactersFromTexts([
      { name: 'xss.json', text: JSON.stringify(doc) }
    ]);
    assert.equal(loaded[0].character.identity.characterName, INJECTION_PAYLOADS.xssScript);
  });

  it('does not pollute Object prototype from __proto__ key in JSON', () => {
    const polluted = JSON.parse(
      '{"identity":{"characterName":"Pwn","level":1},"id":"11111111-1111-1111-1111-111111111111","__proto__":{"polluted":true}}'
    );
    const { loaded, failed } = loadCharactersFromTexts([
      { name: 'proto.json', text: JSON.stringify(polluted) }
    ]);
    assert.equal(loaded.length, 1);
    assert.equal(failed.length, 0);
    assert.notEqual(Object.prototype.polluted, true);
  });
});

describe('loadCharactersFromFiles (GM file picker)', () => {
  it('loads multiple files and reports per-file failures', async () => {
    const good = validCharacter({ identity: { characterName: 'A', level: 1 } });
    const { loaded, failed } = await loadCharactersFromFiles([
      jsonFile('A_1.json', good),
      jsonFile('bad.json', { nope: true }),
      new File(['{ not valid json'], 'broken.json', { type: 'application/json' })
    ]);
    assert.equal(loaded.length, 1);
    assert.equal(failed.length, 2);
    assert.equal(loaded[0].file, 'A_1.json');
  });

  it('handles empty file list', async () => {
    const { loaded, failed } = await loadCharactersFromFiles([]);
    assert.deepEqual(loaded, []);
    assert.deepEqual(failed, []);
  });

  it('preserves injection strings in playerName from uploaded files', async () => {
    const doc = validCharacter({
      identity: {
        characterName: 'Safe Name',
        level: 1,
        playerName: INJECTION_PAYLOADS.sqlCampaignName
      }
    });
    const { loaded } = await loadCharactersFromFiles([
      jsonFile('Safe_Name_1.json', doc)
    ]);
    assert.equal(loaded[0].character.identity.playerName, INJECTION_PAYLOADS.sqlCampaignName);
  });
});
