/**
 * Ritual caster detection, ritual slots, and selections.
 */

import classRitualGrantsMeta from '../../metadata/class-ritual-grants.json' with { type: 'json' };
import { extractPowerIdsFromClassHtml } from './class-parse.js';

const RITUAL_CASTER_FEAT_ID = 'feat159';
const GRANTS_BY_ID = classRitualGrantsMeta.byClassId ?? {};
const GRANTS_BY_NAME = classRitualGrantsMeta.byClassName ?? {};

/** @typedef {{ id: string, slotLevel: number, label: string }} RitualSlot */

/**
 * @param {number} characterLevel
 * @returns {RitualSlot[]}
 */
export function getRitualSlotsForLevel(characterLevel) {
  const lvl = Math.min(30, Math.max(1, Math.floor(Number(characterLevel) || 1)));
  /** @type {RitualSlot[]} */
  const slots = [];
  if (lvl >= 1) {
    slots.push({ id: 'ritual-free-1', slotLevel: 1, label: 'Ritual 1 (free)' });
    slots.push({ id: 'ritual-free-2', slotLevel: 1, label: 'Ritual 2 (free)' });
  }
  return slots;
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractRitualIdsFromHtml(html) {
  const ids = new Set();
  const re = /\b(ritual\d+)\b/gi;
  let m;
  while ((m = re.exec(html ?? '')) !== null) {
    ids.add(m[1].toLowerCase());
  }
  return [...ids];
}

/**
 * @param {object | null | undefined} classEntry
 */
export function collectGrantedRitualIds(classEntry) {
  const ids = new Set(extractRitualIdsFromHtml(classEntry?.body_html ?? ''));
  const classId = classEntry?.id;
  const className = classEntry?.listing_fields?.Name;
  const meta =
    (classId && GRANTS_BY_ID[classId]?.ritualIds) ||
    (className && GRANTS_BY_NAME[className]?.ritualIds) ||
    [];
  for (const rid of meta) ids.add(String(rid).toLowerCase());
  return [...ids];
}

/**
 * @param {object} character
 */
export function ensureRitualSelectionsShape(character) {
  character.selections = character.selections ?? {};
  if (!Array.isArray(character.selections.grantedRitualIds)) {
    character.selections.grantedRitualIds = [];
  }
  if (!Array.isArray(character.selections.ritualIds)) {
    character.selections.ritualIds = [];
  }
  if (!character.selections.ritualSelections || typeof character.selections.ritualSelections !== 'object') {
    character.selections.ritualSelections = {};
  }
  character.notes = character.notes ?? {};
  if (typeof character.notes.rituals !== 'string') character.notes.rituals = '';
  return character;
}

/**
 * @param {object} character
 */
export function syncRitualIdsFromSelections(character) {
  ensureRitualSelectionsShape(character);
  const granted = character.selections.grantedRitualIds ?? [];
  const slots = getRitualSlotsForLevel(character.identity?.level ?? 1);
  const map = character.selections.ritualSelections ?? {};
  const chosen = slots.map((s) => map[s.id]).filter(Boolean);
  character.selections.ritualIds = [...new Set([...granted, ...chosen])];
  return character;
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function syncGrantedRitualIds(character, classEntry) {
  ensureRitualSelectionsShape(character);
  if (classEntry) {
    character.selections.grantedRitualIds = collectGrantedRitualIds(classEntry);
  }
  syncRitualIdsFromSelections(character);
  return character;
}

/**
 * @param {object} character
 * @param {string} slotId
 * @param {string | null} ritualId
 */
export function setRitualForSlot(character, slotId, ritualId) {
  ensureRitualSelectionsShape(character);
  const map = character.selections.ritualSelections ?? {};
  if (!ritualId) delete map[slotId];
  else map[slotId] = String(ritualId).toLowerCase();
  character.selections.ritualSelections = map;
  syncRitualIdsFromSelections(character);
  return character;
}

/**
 * @param {object} character
 */
export function pruneRitualSelections(character) {
  ensureRitualSelectionsShape(character);
  const valid = new Set(getRitualSlotsForLevel(character.identity?.level ?? 1).map((s) => s.id));
  const map = character.selections.ritualSelections ?? {};
  for (const key of Object.keys(map)) {
    if (!valid.has(key)) delete map[key];
  }
  syncRitualIdsFromSelections(character);
  return character;
}

/**
 * @param {object} character
 * @param {Record<string, string>} [nameById]
 */
export function syncRitualNotesFromSelections(character, nameById = {}) {
  ensureRitualSelectionsShape(character);
  const lines = [];
  for (const rid of character.selections.grantedRitualIds ?? []) {
    lines.push(nameById[rid] ?? rid);
  }
  const slots = getRitualSlotsForLevel(character.identity?.level ?? 1);
  const map = character.selections.ritualSelections ?? {};
  for (const slot of slots) {
    const id = map[slot.id];
    if (!id) continue;
    const name = nameById[id] ?? id;
    lines.push(`${slot.label}: ${name}`);
  }
  character.notes.rituals = [...new Set(lines)].join('\n');
  return character;
}

/**
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 */
export async function hasRitualCaster(character, compendium) {
  if (character.selections?.classId) {
    const classEntry = await compendium.getEntry(character.selections.classId);
    const html = classEntry?.body_html ?? '';
    if (/ritual\s+caster|ritual\s+casting/i.test(html)) return true;
  }

  const featMap = character.selections?.featSelections ?? {};
  for (const fid of Object.values(featMap)) {
    if (fid && String(fid).toLowerCase() === RITUAL_CASTER_FEAT_ID) return true;
  }

  for (const fid of character.selections?.raceFeatIds ?? []) {
    if (String(fid).toLowerCase() === RITUAL_CASTER_FEAT_ID) return true;
  }

  return false;
}

/**
 * @param {object} character
 */
export function validateRitualsStep(character) {
  return [];
}
