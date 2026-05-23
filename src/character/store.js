import { normalizeImportedCharacter, validateCharacterDocument } from './io.js';

const STORAGE_KEY = 'dnd4e.characters';
const ACTIVE_KEY = 'dnd4e.activeCharacterId';

export function listCharacters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCharacter(character) {
  const list = listCharacters();
  const idx = list.findIndex((c) => c.id === character.id);
  if (idx >= 0) list[idx] = character;
  else list.push(character);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return character;
}

export function loadCharacter(id) {
  return listCharacters().find((c) => c.id === id) ?? null;
}

export function deleteCharacter(id) {
  const list = listCharacters().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  if (getActiveCharacterId() === id) localStorage.removeItem(ACTIVE_KEY);
}

export function setActiveCharacterId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function getActiveCharacterId() {
  return localStorage.getItem(ACTIVE_KEY);
}

export function loadActiveCharacter() {
  const id = getActiveCharacterId();
  return id ? loadCharacter(id) : null;
}

/** Import from parsed JSON; keeps file id unless duplicate forces a new id. */
export function importCharacterDocument(data, { forceNewId = false } = {}) {
  const errors = validateCharacterDocument(data);
  if (errors.length) throw new Error(errors.join(' '));

  if (!forceNewId) {
    const existing = data.id ? loadCharacter(data.id) : null;
    if (existing) {
      const merged = normalizeImportedCharacter(data, { newId: false });
      return saveCharacter(merged);
    }
  }

  const character = normalizeImportedCharacter(data, { newId: forceNewId || !data.id });
  return saveCharacter(character);
}
