/**
 * Race -> monster flavor mapping.
 *
 * Many "monster races" (e.g. Bugbear) carry little or no flavor text in their
 * Race compendium entry; the descriptive lore lives in the matching Monster
 * entry. The race step supplements the preview with FLAVOR ONLY (no stats) from
 * that monster, rendered as collapsed folds (see `extractMonsterFlavorFolds` in
 * race-parse.js). By default the race Name is matched against an exact monster
 * Name; this module supplies hand-curated overrides for ids, alternate names,
 * or to disable the lookup for a given race. Mirrors race-replacements.js:
 * static JSON now, hydratable later.
 */

import fluffMeta from '../../metadata/race-monster-fluff.json' with { type: 'json' };

const STATIC_MAP = {
  byId: fluffMeta.byRaceId ?? {},
  byName: fluffMeta.byRaceName ?? {}
};

let MONSTER_FLUFF_MAP = STATIC_MAP;

/**
 * Replace the curated map (e.g. with data hydrated elsewhere).
 * Pass a falsy/empty map to keep the current data.
 * @param {{ byId?: Record<string, object>, byName?: Record<string, object> } | null | undefined} map
 */
export function setMonsterFluffMap(map) {
  if (!map || (!map.byId && !map.byName)) return;
  MONSTER_FLUFF_MAP = { byId: map.byId ?? {}, byName: map.byName ?? {} };
}

/** Restore the static JSON map (used by tests). */
export function resetMonsterFluffMap() {
  MONSTER_FLUFF_MAP = STATIC_MAP;
}

/**
 * Curated monster-fluff refs for a race (by id, falling back to name).
 * @param {string | null | undefined} raceId
 * @param {string | null | undefined} raceName
 * @returns {{ monsterIds: string[], monsterNames: string[], disabled: boolean }}
 */
export function getCuratedMonsterRefs(raceId, raceName) {
  const rec =
    (raceId && MONSTER_FLUFF_MAP.byId?.[raceId]) ||
    (raceName && MONSTER_FLUFF_MAP.byName?.[raceName]) ||
    {};
  return {
    monsterIds: Array.isArray(rec.monsterIds) ? rec.monsterIds : [],
    monsterNames: Array.isArray(rec.monsterNames) ? rec.monsterNames : [],
    disabled: rec.disabled === true
  };
}
