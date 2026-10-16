/**
 * Categorized race/class grant slots stored on the character document.
 * The sheet mirror shows these read-only. Only the race and class steps
 * add or remove them.
 */

/** @typedef {'racePowers' | 'raceFeats' | 'classPowers' | 'classFeats'} GrantSlotKey */

/**
 * @typedef {object} GrantSlot
 * @property {string} id
 * @property {string} name
 * @property {string} category
 */

export const GRANT_GROUPS = [
  {
    key: 'racePowers',
    category: 'race-power',
    label: 'Race Powers',
    note: 'Read-only. Added or removed on the Race step.'
  },
  {
    key: 'raceFeats',
    category: 'race-feat',
    label: 'Race Feats',
    note: 'Read-only. Added or removed on the Race step.'
  },
  {
    key: 'classPowers',
    category: 'class-power',
    label: 'Class Powers',
    note: 'Read-only. Added or removed on the Class step.'
  },
  {
    key: 'classFeats',
    category: 'class-feat',
    label: 'Class Feats',
    note: 'Read-only. Added or removed on the Class step.'
  }
];

const NOTE_KEY = {
  racePowers: 'racialPowers',
  raceFeats: 'raceFeats',
  classPowers: 'classPowers',
  classFeats: 'classFeats'
};

/**
 * @returns {Record<GrantSlotKey, GrantSlot[]>}
 */
export function emptyGrantSlots() {
  return {
    racePowers: [],
    raceFeats: [],
    classPowers: [],
    classFeats: []
  };
}

/**
 * @param {object} character
 */
export function ensureGrantSlots(character) {
  character.selections = character.selections ?? {};
  const current = character.selections.grantSlots;
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    character.selections.grantSlots = emptyGrantSlots();
  }
  const slots = character.selections.grantSlots;
  for (const group of GRANT_GROUPS) {
    if (!Array.isArray(slots[group.key])) slots[group.key] = [];
  }
  character.notes = character.notes ?? {};
  if (typeof character.notes.racialPowers !== 'string') character.notes.racialPowers = '';
  if (typeof character.notes.raceFeats !== 'string') character.notes.raceFeats = '';
  if (typeof character.notes.classPowers !== 'string') character.notes.classPowers = '';
  if (typeof character.notes.classFeats !== 'string') character.notes.classFeats = '';
  return slots;
}

/**
 * Keep a resolved name when a later sync only has the raw id.
 * @param {string} next
 * @param {string | undefined} previous
 * @param {string} id
 */
function preferSlotName(next, previous, id) {
  const incoming = String(next ?? '').trim();
  const kept = String(previous ?? '').trim();
  const key = String(id).toLowerCase();
  if (incoming && incoming.toLowerCase() !== key) return incoming;
  if (kept && kept.toLowerCase() !== key) return kept;
  return incoming || kept || key;
}

/**
 * @param {object} character
 * @param {GrantSlotKey} key
 * @param {Array<{ id?: string, name?: string }>} items
 */
export function writeGrantGroup(character, key, items) {
  const slots = ensureGrantSlots(character);
  const category = GRANT_GROUPS.find((group) => group.key === key)?.category ?? key;
  const previous = new Map(
    (slots[key] ?? []).map((slot) => [String(slot.id).toLowerCase(), slot.name])
  );
  /** @type {GrantSlot[]} */
  const normalized = [];
  const seen = new Set();
  for (const item of items ?? []) {
    const id = String(item?.id ?? '').toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      name: preferSlotName(item?.name, previous.get(id), id),
      category
    });
  }
  slots[key] = normalized;
  const noteKey = NOTE_KEY[key];
  if (noteKey) character.notes[noteKey] = normalized.map((slot) => slot.name).join('\n');
  return character;
}

/**
 * @param {object} character
 * @param {GrantSlotKey} key
 */
export function clearGrantGroup(character, key) {
  return writeGrantGroup(character, key, []);
}

/**
 * Prefer an existing note line when it is the same entry plus an annotation,
 * for example "Dragon Breath (Dexterity, fire)".
 * @param {string} entryName
 * @param {string[]} existingLines
 */
export function resolveGrantName(entryName, existingLines) {
  const name = String(entryName ?? '').trim();
  if (!name) return '';
  const hit = (existingLines ?? []).find((line) => {
    const raw = String(line).trim();
    return raw === name || raw.startsWith(`${name} (`);
  });
  return hit ? String(hit).trim() : name;
}

/**
 * @param {string | null | undefined} text
 * @returns {string[]}
 */
function noteLines(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Fill empty slot groups from ids plus the matching note text.
 * Does not invent class-power names from the mixed chosen-powers note.
 * @param {object} character
 */
export function hydrateGrantSlotsFromNotes(character) {
  const slots = ensureGrantSlots(character);
  const pairs = [
    ['racePowers', character.selections.racePowerIds, character.notes.racialPowers],
    ['raceFeats', character.selections.raceFeatIds, character.notes.raceFeats],
    ['classPowers', character.selections.classPowerIds, character.notes.classPowers],
    ['classFeats', character.selections.classFeatIds, character.notes.classFeats]
  ];
  for (const [key, ids, text] of pairs) {
    if (slots[key].length) continue;
    const idList = Array.isArray(ids) ? ids : [];
    if (!idList.length) continue;
    const names = noteLines(text);
    writeGrantGroup(
      character,
      key,
      idList.map((id, index) => ({
        id,
        name: names[index] || id
      }))
    );
  }
  return character;
}

/**
 * Resolve grant names from the compendium and store the four categories.
 * @param {object} character
 * @param {{ getEntry: (id: string) => Promise<object | null | undefined> }} compendium
 */
export async function syncGrantSlotsFromIds(character, compendium) {
  ensureGrantSlots(character);
  const groups = [
    ['racePowers', character.selections?.racePowerIds, character.notes.racialPowers],
    ['raceFeats', character.selections?.raceFeatIds, character.notes.raceFeats],
    ['classPowers', character.selections?.classPowerIds, character.notes.classPowers],
    ['classFeats', character.selections?.classFeatIds, character.notes.classFeats]
  ];
  for (const [key, ids, text] of groups) {
    const existing = noteLines(text);
    const previous = new Map(
      (character.selections.grantSlots[key] ?? []).map((slot) => [slot.id, slot.name])
    );
    /** @type {Array<{ id: string, name: string }>} */
    const items = [];
    for (const rawId of ids ?? []) {
      const id = String(rawId).toLowerCase();
      const entry = await compendium.getEntry(id);
      const entryName = entry?.listing_fields?.Name ?? previous.get(id) ?? '';
      const name = entryName ? resolveGrantName(entryName, existing) : previous.get(id) || id;
      items.push({ id, name });
    }
    writeGrantGroup(character, key, items);
  }
  return character;
}
