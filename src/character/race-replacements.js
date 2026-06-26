/**
 * Curated subrace -> base-trait/power replacement overrides.
 *
 * A subrace can replace a base-race trait or granted power/feat (e.g. a
 * Draconian subrace's flight replacing a Dragonborn trait). Most replacements
 * are auto-parsed from the subrace body (see parseRaceReplacements in
 * race-parse.js); this module supplies a hand-curated override map for the
 * cases the parser misses. Mirrors race-subraces.js: static JSON now,
 * hydratable from the normalized `race_replacement` table later.
 */

import replacementMeta from '../../metadata/race-replacements.json' with { type: 'json' };

const STATIC_MAP = replacementMeta.replacementsByRace ?? {};

let REPLACEMENTS_BY_RACE = STATIC_MAP;

/**
 * Replace the curated map (e.g. with rows hydrated from the normalized DB).
 * Pass a falsy/empty map to keep the current data.
 * @param {Record<string, { replacesTraits?: string[], replacesPowerIds?: string[], replacesFeatIds?: string[] }> | null | undefined} map
 */
export function setReplacementMap(map) {
  if (!map || !Object.keys(map).length) return;
  REPLACEMENTS_BY_RACE = map;
}

/** Restore the static JSON map (used by tests). */
export function resetReplacementMap() {
  REPLACEMENTS_BY_RACE = STATIC_MAP;
}

/**
 * Curated replacements for a subrace id.
 * @param {string | null | undefined} raceId
 * @returns {{ traits: string[], powerIds: string[], featIds: string[] }}
 */
export function getCuratedReplacements(raceId) {
  const rec = (raceId && REPLACEMENTS_BY_RACE[raceId]) || {};
  return {
    traits: Array.isArray(rec.replacesTraits) ? rec.replacesTraits : [],
    powerIds: Array.isArray(rec.replacesPowerIds) ? rec.replacesPowerIds : [],
    featIds: Array.isArray(rec.replacesFeatIds) ? rec.replacesFeatIds : []
  };
}

/**
 * Hydrate the curated map from a compendium provider's normalized table.
 * No-op when the provider has no normalized `race_replacement` data.
 * @param {{ getRaceReplacementMap?: () => Promise<Record<string, object> | null> }} provider
 */
export async function hydrateReplacementsFromProvider(provider) {
  try {
    const map = await provider?.getRaceReplacementMap?.();
    if (map) setReplacementMap(map);
    return Boolean(map);
  } catch {
    return false;
  }
}
