import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  characterExportFilename,
  parseExportFilename,
  normalizeImportedCharacter
} from '../src/character/io.js';
import { INJECTION_PAYLOADS, validCharacter } from './helpers/test-server.mjs';

describe('characterExportFilename', () => {
  it('strips path and invalid filename characters', () => {
    const name = characterExportFilename(
      validCharacter({
        identity: {
          characterName: '../../../etc/passwd<script>',
          level: 3
        }
      })
    );
    assert.doesNotMatch(name, /[/\\]/);
    assert.doesNotMatch(name, /[<>:"|?*]/);
    assert.match(name, /\.json$/);
    assert.match(name, /_3\.json$/);
  });

  it('collapses whitespace to underscores', () => {
    const name = characterExportFilename(
      validCharacter({ identity: { characterName: 'Sir   Bold', level: 1 } })
    );
    assert.equal(name, 'Sir_Bold_1.json');
  });

  it('falls back to Character when name is only invalid chars', () => {
    const name = characterExportFilename(
      validCharacter({ identity: { characterName: '<<>>', level: 2 } })
    );
    assert.equal(name, 'Character_2.json');
  });
});

describe('parseExportFilename', () => {
  it('parses standard export names', () => {
    assert.deepEqual(parseExportFilename('Aragorn_5.json'), { namePart: 'Aragorn', level: 5 });
  });

  it('rejects traversal-like names without valid level', () => {
    assert.equal(parseExportFilename('../../../passwd.json'), null);
    assert.equal(parseExportFilename('no-level.json'), null);
    assert.equal(parseExportFilename('Bad_0.json'), null);
  });
});

describe('normalizeImportedCharacter', () => {
  it('accepts valid imports and assigns meta', () => {
    const doc = validCharacter();
    delete doc.id;
    const normalized = normalizeImportedCharacter(doc, { newId: true });
    assert.ok(normalized.id);
    assert.equal(normalized.meta.source, 'import');
  });

  it('rejects invalid JSON documents', () => {
    assert.throws(() => normalizeImportedCharacter({ foo: 1 }), /identity/i);
  });

  it('preserves injection strings in identity without executing them', () => {
    const doc = validCharacter({
      identity: {
        characterName: INJECTION_PAYLOADS.xssScript,
        level: 1,
        playerName: INJECTION_PAYLOADS.sqlUnion
      }
    });
    const normalized = normalizeImportedCharacter(doc);
    assert.equal(normalized.identity.characterName, INJECTION_PAYLOADS.xssScript);
  });
});

describe('readCharacterJsonFile (via parse path)', () => {
  it('rejects non-JSON text', async () => {
    const { readCharacterJsonFile } = await import('../src/character/io.js');
    const file = new File(['not json at all'], 'bad.json', { type: 'application/json' });
    await assert.rejects(() => readCharacterJsonFile(file), /valid JSON/i);
  });
});
