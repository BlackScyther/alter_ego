import subraceMap from '../../metadata/race-subraces.json' with { type: 'json' };

const STATIC_MAP = subraceMap.subracesByParent ?? {};

// Mutable runtime state. Defaults to the static JSON map, but can be hydrated
// from the normalized `race_subrace` table via setSubraceMap() once the
// compendium DB is loaded (see hydrateSubracesFromProvider). This lets the data
// move into the DB without making the many sync callers of this module async.
let SUBRACES_BY_PARENT = STATIC_MAP;
let ALL_SUBRACE_IDS = new Set(Object.values(SUBRACES_BY_PARENT).flat());

/**
 * Replace the parent -> subrace id map (e.g. with rows from the normalized DB).
 * Pass a falsy/empty map to keep the current data.
 * @param {Record<string, string[]> | null | undefined} map
 */
export function setSubraceMap(map) {
  if (!map || !Object.keys(map).length) return;
  SUBRACES_BY_PARENT = map;
  ALL_SUBRACE_IDS = new Set(Object.values(SUBRACES_BY_PARENT).flat());
}

/** Restore the static JSON map (used by tests). */
export function resetSubraceMap() {
  SUBRACES_BY_PARENT = STATIC_MAP;
  ALL_SUBRACE_IDS = new Set(Object.values(SUBRACES_BY_PARENT).flat());
}

/**
 * Hydrate the subrace map from a compendium provider's normalized table.
 * No-op when the provider has no normalized `race_subrace` data.
 * @param {{ getRaceSubraceMap?: () => Promise<Record<string, string[]> | null> }} provider
 */
export async function hydrateSubracesFromProvider(provider) {
  try {
    const map = await provider?.getRaceSubraceMap?.();
    if (map) setSubraceMap(map);
    return Boolean(map);
  } catch {
    return false;
  }
}

/** @param {string | null | undefined} id */
export function isSubraceId(id) {
  return Boolean(id && ALL_SUBRACE_IDS.has(id));
}

/** @param {string | null | undefined} parentId */
export function getSubracesForParent(parentId) {
  return SUBRACES_BY_PARENT[parentId] ?? [];
}

/** @param {string | null | undefined} parentId */
export function parentHasSubraces(parentId) {
  return getSubracesForParent(parentId).length > 0;
}

/** @param {string | null | undefined} subraceId */
export function getParentRaceId(subraceId) {
  if (!subraceId) return null;
  for (const [parentId, subIds] of Object.entries(SUBRACES_BY_PARENT)) {
    if (subIds.includes(subraceId)) return parentId;
  }
  return null;
}

/**
 * @param {string | null | undefined} raceId
 * @returns {{ baseId: string | null, variantId: string | null }}
 */
export function resolveRacePair(raceId) {
  if (!raceId) return { baseId: null, variantId: null };
  const parentId = getParentRaceId(raceId);
  if (parentId) return { baseId: parentId, variantId: raceId };
  return { baseId: raceId, variantId: null };
}

/**
 * @param {string | null | undefined} raceId
 * @returns {string | null}
 */
export function effectiveRaceId(raceId) {
  if (!raceId) return null;
  const { baseId, variantId } = resolveRacePair(raceId);
  return variantId ?? baseId ?? raceId;
}

/** Parent race id used for ability/skill bonus parsing when a subrace is selected. */
export function raceBonusEntryId(raceId) {
  if (!raceId) return null;
  const { baseId } = resolveRacePair(raceId);
  return baseId ?? raceId;
}

/**
 * @param {Array<{ id: string }>} entries
 */
export function filterBaseRaces(entries) {
  return (entries ?? []).filter((e) => !isSubraceId(e.id));
}

/**
 * @param {Array<{ id: string, listing_fields?: { Name?: string } }>} entries
 * @param {string} parentId
 */
export function filterSubracesForParent(entries, parentId) {
  const allowed = new Set(getSubracesForParent(parentId));
  return (entries ?? []).filter((e) => allowed.has(e.id));
}

/**
 * Fallback when subrace is not in the static map.
 * @param {{ id: string, listing_fields?: { Name?: string } }} entry
 * @param {Array<{ id: string, listing_fields?: { Name?: string } }>} baseEntries
 */
export function inferParentFromName(entry, baseEntries) {
  if (isSubraceId(entry.id)) return getParentRaceId(entry.id);
  const name = entry.listing_fields?.Name ?? '';
  if (!name) return null;
  const bases = filterBaseRaces(baseEntries)
    .map((e) => ({ id: e.id, name: e.listing_fields?.Name ?? '' }))
    .filter((e) => e.name)
    .sort((a, b) => b.name.length - a.name.length);
  for (const base of bases) {
    if (name === base.name) continue;
    if (name.startsWith(`${base.name} `) || name.startsWith(`${base.name}-`)) {
      return base.id;
    }
  }
  return null;
}
