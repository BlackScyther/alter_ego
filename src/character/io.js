/**
 * Local character files: {CharacterName}_{level}.json
 * Level is the last underscore-separated segment before .json
 */

import { CHARACTER_VERSION, touchCharacter } from './model.js';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

export function characterExportFilename(character) {
  const rawName = (character?.identity?.characterName || 'Character').trim();
  const level = Number(character?.identity?.level) || 1;
  const safeName =
    rawName
      .replace(INVALID_FILENAME_CHARS, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'Character';
  return `${safeName}_${level}.json`;
}

export function parseExportFilename(filename) {
  const base = String(filename || '')
    .replace(/\.json$/i, '')
    .trim();
  const lastUnderscore = base.lastIndexOf('_');
  if (lastUnderscore < 1) return null;
  const levelPart = base.slice(lastUnderscore + 1);
  const level = Number.parseInt(levelPart, 10);
  if (!Number.isFinite(level) || level < 1 || level > 30) return null;
  return { namePart: base.slice(0, lastUnderscore), level };
}

export function validateCharacterDocument(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('File is not a valid JSON object.');
    return errors;
  }
  if (!data.identity || typeof data.identity !== 'object') {
    errors.push('Missing identity block.');
    return errors;
  }
  if (!String(data.identity.characterName || '').trim()) {
    errors.push('Missing character name.');
  }
  const level = Number(data.identity.level);
  if (!Number.isFinite(level) || level < 1 || level > 30) {
    errors.push('Level must be between 1 and 30.');
  }
  return errors;
}

export function normalizeImportedCharacter(data, { newId = false } = {}) {
  const errors = validateCharacterDocument(data);
  if (errors.length) throw new Error(errors.join(' '));

  let character = {
    ...data,
    version: data.version ?? CHARACTER_VERSION,
    meta: {
      source: 'import',
      campaignId: data.meta?.campaignId ?? null,
      createdAt: data.meta?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data.meta
    }
  };

  if (newId || !character.id) {
    character = { ...character, id: crypto.randomUUID() };
  }

  return touchCharacter(character);
}

export function serializeCharacter(character) {
  return JSON.stringify(character, null, 2);
}

export function downloadCharacterJson(character) {
  const filename = characterExportFilename(character);
  const blob = new Blob([serializeCharacter(character)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return filename;
}

export async function readCharacterJsonFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  return normalizeImportedCharacter(data, { newId: false });
}
