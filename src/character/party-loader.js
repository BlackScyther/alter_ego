import { validateCharacterDocument } from './io.js';

const DEFAULT_PARTY_BASE = '../party/';

export async function fetchPartyIndex(baseUrl = DEFAULT_PARTY_BASE) {
  const res = await fetch(`${baseUrl}index.json`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Party index not found (developer repo workflow only).');
  }
  const index = await res.json();
  return Array.isArray(index.files) ? index.files : [];
}

export async function fetchPartyCharacter(filename, baseUrl = DEFAULT_PARTY_BASE) {
  const res = await fetch(`${baseUrl}${encodeURIComponent(filename)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${filename}`);
  const data = await res.json();
  const errors = validateCharacterDocument(data);
  if (errors.length) throw new Error(`${filename}: ${errors.join(' ')}`);
  return data;
}

export async function loadPartyFromFolder(baseUrl = DEFAULT_PARTY_BASE) {
  const files = await fetchPartyIndex(baseUrl);
  const loaded = [];
  const failed = [];

  for (const file of files) {
    try {
      const character = await fetchPartyCharacter(file, baseUrl);
      loaded.push({ file, character });
    } catch (err) {
      failed.push({ file, error: err.message ?? String(err) });
    }
  }

  return { loaded, failed, files };
}

export async function loadCharactersFromFiles(fileList) {
  const loaded = [];
  const failed = [];

  for (const file of fileList) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const errors = validateCharacterDocument(data);
      if (errors.length) throw new Error(errors.join(' '));
      loaded.push({ file: file.name, character: data });
    } catch (err) {
      failed.push({ file: file.name, error: err.message ?? String(err) });
    }
  }

  return { loaded, failed };
}

/** @param {{ name: string, text: string }[]} items */
export function loadCharactersFromTexts(items) {
  const loaded = [];
  const failed = [];

  for (const { name, text } of items) {
    try {
      const data = JSON.parse(text);
      const errors = validateCharacterDocument(data);
      if (errors.length) throw new Error(errors.join(' '));
      loaded.push({ file: name, character: data });
    } catch (err) {
      failed.push({ file: name, error: err.message ?? String(err) });
    }
  }

  return { loaded, failed };
}
