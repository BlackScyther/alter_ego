import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCharacterDocument,
  prepareCharacterForCampaign
} from '../server/validate-character.mjs';
import { validateCharacterDocument as clientValidate } from '../src/character/io.js';
import { INJECTION_PAYLOADS, validCharacter } from './helpers/test-server.mjs';

describe('server validateCharacterDocument', () => {
  it('accepts a minimal valid document', () => {
    assert.deepEqual(validateCharacterDocument(validCharacter()), []);
  });

  it('rejects non-objects', () => {
    assert.ok(validateCharacterDocument(null).length > 0);
    assert.ok(validateCharacterDocument('not json').length > 0);
  });

  it('rejects missing identity', () => {
    const doc = validCharacter();
    delete doc.identity;
    assert.match(validateCharacterDocument(doc).join(' '), /identity/i);
  });

  it('rejects empty character name', () => {
    const doc = validCharacter({ identity: { characterName: '  ', level: 1 } });
    assert.match(validateCharacterDocument(doc).join(' '), /name/i);
  });

  it('rejects invalid level bounds', () => {
    assert.ok(validateCharacterDocument(validCharacter({ identity: { characterName: 'X', level: 0 } })).length);
    assert.ok(validateCharacterDocument(validCharacter({ identity: { characterName: 'X', level: 31 } })).length);
    assert.ok(validateCharacterDocument(validCharacter({ identity: { characterName: 'X', level: NaN } })).length);
  });

  it('requires character id on the API', () => {
    const doc = validCharacter();
    delete doc.id;
    assert.match(validateCharacterDocument(doc).join(' '), /id/i);
  });

  it('allows injection strings in text fields (stored as data, escaped in UI)', () => {
    const doc = validCharacter({
      identity: {
        characterName: INJECTION_PAYLOADS.xssScript,
        level: 5,
        playerName: INJECTION_PAYLOADS.sqlCampaignName,
        race: INJECTION_PAYLOADS.xssImg
      }
    });
    assert.deepEqual(validateCharacterDocument(doc), []);
  });
});

describe('prepareCharacterForCampaign', () => {
  it('stamps campaignId and updatedAt in meta', () => {
    const doc = prepareCharacterForCampaign(validCharacter(), 'camp-123');
    assert.equal(doc.meta.campaignId, 'camp-123');
    assert.ok(doc.meta.updatedAt);
  });

  it('throws 400 for invalid documents', () => {
    assert.throws(
      () => prepareCharacterForCampaign({ identity: {} }, 'camp-123'),
      (err) => err.status === 400
    );
  });
});

describe('client io.js validateCharacterDocument', () => {
  it('does not require id (file import assigns one later)', () => {
    const doc = validCharacter();
    delete doc.id;
    assert.deepEqual(clientValidate(doc), []);
  });

  it('rejects invalid JSON shapes consistently with server on core fields', () => {
    const bad = validCharacter({ identity: { characterName: '', level: 99 } });
    assert.ok(clientValidate(bad).length > 0);
    assert.ok(validateCharacterDocument({ ...bad, id: bad.id ?? 'x' }).length > 0);
  });
});
