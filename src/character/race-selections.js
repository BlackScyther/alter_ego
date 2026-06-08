/**
 * Race step selections: build choices, bonus choices, grants, validation, sync.
 */

import buildOptionsMeta from '../../metadata/race-build-options.json' with { type: 'json' };
import {
  resolveRacePair,
  parentHasSubraces,
  getParentRaceId,
  isSubraceId
} from './race-subraces.js';
import {
  buildRaceNotesText,
  extractPowerIdsFromRaceHtml,
  extractFeatIdsFromRaceHtml
} from './race-parse.js';
import {
  parseRaceBonusDecisions,
  applyRaceBonusChoice,
  syncRaceBonusChoicesToBonuses
} from './tutor.js';

const BUILD_BY_ID = buildOptionsMeta.byRaceId ?? {};
const BUILD_BY_NAME = buildOptionsMeta.byRaceName ?? {};

export function ensureRaceSelectionsShape(character) {
  character.selections = character.selections ?? {};
  if (!character.selections.raceBuildChoices) character.selections.raceBuildChoices = {};
  if (!character.selections.raceBonusChoices) {
    character.selections.raceBonusChoices = { ability: {}, skill: {} };
  }
  if (!Array.isArray(character.selections.racePowerIds)) character.selections.racePowerIds = [];
  if (!Array.isArray(character.selections.raceFeatIds)) character.selections.raceFeatIds = [];
  character.notes = character.notes ?? {};
  if (typeof character.notes.racialPowers !== 'string') character.notes.racialPowers = '';
  return character;
}

export function resetRaceDerivedSelections(character) {
  ensureRaceSelectionsShape(character);
  character.selections.raceBuildChoices = {};
  character.selections.raceBonusChoices = { ability: {}, skill: {} };
  character.selections.racePowerIds = [];
  character.selections.raceFeatIds = [];
  character.notes.racialPowers = '';
  return character;
}

/**
 * @param {string | null | undefined} raceId
 * @param {string | null | undefined} raceName
 */
export function getRaceBuildDecisions(raceId, raceName) {
  if (raceId && BUILD_BY_ID[raceId]?.decisions) {
    return BUILD_BY_ID[raceId].decisions;
  }
  if (raceName && BUILD_BY_NAME[raceName]?.decisions) {
    return BUILD_BY_NAME[raceName].decisions;
  }
  return [];
}

/**
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 */
export function getPreviewTermsForRace(character, baseEntry, variantEntry) {
  const raceId = character.selections?.raceId;
  const raceName = character.identity?.race;
  const { baseId } = resolveRacePair(raceId);
  const decisions = getRaceBuildDecisions(baseId ?? raceId, baseEntry?.listing_fields?.Name ?? raceName);
  const terms = new Set();
  for (const d of decisions) {
    for (const t of d.previewTerms ?? []) terms.add(t);
  }
  return [...terms];
}

/**
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 */
export function buildBuildChoiceSummary(character, baseEntry, variantEntry) {
  const raceId = character.selections?.raceId;
  const { baseId } = resolveRacePair(raceId);
  const decisions = getRaceBuildDecisions(baseId ?? raceId, baseEntry?.listing_fields?.Name);
  const choices = character.selections.raceBuildChoices ?? {};
  const lines = [];
  for (const d of decisions) {
    const picked = choices[d.id];
    if (!picked) continue;
    const opt = d.options?.find((o) => o.id === picked);
    if (opt) lines.push(`${d.label}: ${opt.label}`);
  }
  return lines;
}

/**
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 */
export function collectRaceGrantIds(character, baseEntry, variantEntry) {
  const previewTerms = getPreviewTermsForRace(character, baseEntry, variantEntry);
  const powerIds = new Set();
  const featIds = new Set();

  for (const entry of [baseEntry, variantEntry]) {
    if (!entry) continue;
    for (const id of extractPowerIdsFromRaceHtml(entry.body_html ?? '')) powerIds.add(id);
    for (const id of extractFeatIdsFromRaceHtml(entry.body_html ?? '')) featIds.add(id);
  }

  const { baseId } = resolveRacePair(character.selections?.raceId);
  const decisions = getRaceBuildDecisions(baseId ?? character.selections?.raceId, baseEntry?.listing_fields?.Name);
  const choices = character.selections.raceBuildChoices ?? {};
  for (const d of decisions) {
    const picked = choices[d.id];
    if (!picked) continue;
    const opt = d.options?.find((o) => o.id === picked);
    if (opt?.powerId) powerIds.add(String(opt.powerId).toLowerCase());
  }

  for (const term of previewTerms) {
    for (const entry of [baseEntry, variantEntry]) {
      if (!entry?.body_html) continue;
      if (!entry.body_html.toLowerCase().includes(term.toLowerCase())) continue;
    }
  }

  return {
    racePowerIds: [...powerIds],
    raceFeatIds: [...featIds],
    previewTerms
  };
}

/**
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 * @param {Array<{ listing_fields?: { Name?: string } }>} [powerEntries]
 */
export function syncRaceNotesAndGrants(character, baseEntry, variantEntry, powerEntries = []) {
  ensureRaceSelectionsShape(character);
  const { racePowerIds, raceFeatIds, previewTerms } = collectRaceGrantIds(
    character,
    baseEntry,
    variantEntry
  );
  character.selections.racePowerIds = racePowerIds;
  character.selections.raceFeatIds = raceFeatIds;

  const buildSummary = buildBuildChoiceSummary(character, baseEntry, variantEntry);
  character.notes.raceFeatures = buildRaceNotesText(baseEntry, variantEntry, {
    previewTerms,
    buildSummary,
    raceBonusChoices: character.selections.raceBonusChoices
  });

  const powerNames = powerEntries
    .map((e) => e?.listing_fields?.Name)
    .filter(Boolean);
  character.notes.racialPowers = powerNames.join('\n');

  syncRaceBonusChoicesToBonuses(character);
  return character;
}

/**
 * @param {object} character
 * @param {string} decisionId
 * @param {string} optionId
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 */
export function setRaceBuildChoice(character, decisionId, optionId, baseEntry, variantEntry) {
  ensureRaceSelectionsShape(character);
  character.selections.raceBuildChoices[decisionId] = optionId;
  return syncRaceNotesAndGrants(character, baseEntry, variantEntry);
}

/**
 * @param {object} character
 * @param {'ability'|'skill'} kind
 * @param {string} choiceGroup
 * @param {string} value
 */
export function setRaceBonusChoice(character, kind, choiceGroup, value) {
  ensureRaceSelectionsShape(character);
  applyRaceBonusChoice(character, kind, choiceGroup, value);
  return character;
}

/**
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 */
export function raceBuildChoicesComplete(character, baseEntry, variantEntry) {
  const raceId = character.selections?.raceId;
  if (!raceId) return false;
  const { baseId } = resolveRacePair(raceId);
  const decisions = getRaceBuildDecisions(baseId ?? raceId, baseEntry?.listing_fields?.Name);
  if (!decisions.length) return true;
  const choices = character.selections.raceBuildChoices ?? {};
  return decisions.every((d) => d.options?.some((o) => o.id === choices[d.id]));
}

/**
 * @param {object} character
 * @param {object | null | undefined} raceEntry
 */
export function raceBonusChoicesComplete(character, raceEntry) {
  const decisions = parseRaceBonusDecisions(raceEntry);
  const choices = character.selections?.raceBonusChoices ?? { ability: {}, skill: {} };
  return decisions.every((d) => {
    const bucket = choices[d.kind] ?? {};
    return Boolean(bucket[d.choiceGroup]);
  });
}

/**
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 */
export function raceSubraceComplete(character, baseEntry) {
  const raceId = character.selections?.raceId;
  if (!raceId) return false;
  const { baseId, variantId } = resolveRacePair(raceId);
  const parentId = baseId ?? raceId;
  if (!parentHasSubraces(parentId)) return true;
  return Boolean(variantId) || isSubraceId(raceId);
}

/**
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 */
export function validateRaceStep(character, baseEntry, variantEntry) {
  const errors = [];
  const raceId = character.selections?.raceId;
  if (!raceId) {
    errors.push('Select a race from the compendium.');
    return errors;
  }

  const { baseId, variantId } = resolveRacePair(raceId);
  const parentId = baseId ?? raceId;
  if (parentHasSubraces(parentId) && !variantId && !isSubraceId(raceId)) {
    errors.push('Choose a subrace for this race.');
  }

  const buildDecisions = getRaceBuildDecisions(
    baseId ?? raceId,
    baseEntry?.listing_fields?.Name ?? character.identity?.race
  );
  const buildChoices = character.selections?.raceBuildChoices ?? {};
  for (const d of buildDecisions) {
    if (!buildChoices[d.id] || !d.options?.some((o) => o.id === buildChoices[d.id])) {
      errors.push(d.prompt || `Choose ${d.label}.`);
    }
  }

  const bonusDecisions = parseRaceBonusDecisions(baseEntry ?? variantEntry);
  const bonusChoices = character.selections?.raceBonusChoices ?? { ability: {}, skill: {} };
  const requiredGroups = new Map();
  for (const d of bonusDecisions) {
    requiredGroups.set(`${d.kind}:${d.choiceGroup}`, d.kind);
  }
  if (!bonusDecisions.length) {
    for (const b of character.abilities?.bonuses ?? []) {
      if (b.source === 'race' && b.choiceGroup) {
        requiredGroups.set(`ability:${b.choiceGroup}`, 'ability');
      }
    }
    for (const b of character.skillBonuses ?? []) {
      if (b.source === 'race' && b.choiceGroup) {
        requiredGroups.set(`skill:${b.choiceGroup}`, 'skill');
      }
    }
  }
  for (const [key, kind] of requiredGroups) {
    const choiceGroup = key.slice(kind.length + 1);
    if (!bonusChoices[kind]?.[choiceGroup]) {
      errors.push(`Choose a ${kind} bonus for your race.`);
    }
  }

  return errors;
}

export { getParentRaceId, resolveRacePair, parentHasSubraces, isSubraceId };
