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
  extractFeatIdsFromRaceHtml,
  getRaceStructuredTraits,
  formatRaceLanguagesText,
  formatRaceResistancesText,
  formatRaceSensesText,
  resolveReplacedBaseItems
} from './race-parse.js';
import {
  parseRaceBonusDecisions,
  applyRaceBonusChoice,
  syncRaceBonusChoicesToBonuses
} from './tutor.js';
import {
  parsePowerAbilityOptions,
  parsePowerDamageOptions
} from './power-ability-parse.js';

const BUILD_BY_ID = buildOptionsMeta.byRaceId ?? {};
const BUILD_BY_NAME = buildOptionsMeta.byRaceName ?? {};

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function splitSourceBooks(raw) {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {Array<{ sourceBook?: string }>} options
 * @param {string[] | null} activeSourceBooks — null means all sources (race picker "All").
 */
export function filterDecisionOptionsBySource(options, activeSourceBooks) {
  if (!activeSourceBooks) return options ?? [];
  const bookSet = new Set(activeSourceBooks);
  return (options ?? []).filter((opt) =>
    splitSourceBooks(opt.sourceBook).some((book) => bookSet.has(book))
  );
}

const ABILITY_LABEL = {
  str: 'Strength',
  con: 'Constitution',
  dex: 'Dexterity',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma'
};

/** Match the normalization used by resolveReplacedBaseItems in race-parse.js. */
function normalizeName(label) {
  return String(label ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function ensureRaceSelectionsShape(character) {
  character.selections = character.selections ?? {};
  if (!character.selections.raceBuildChoices) character.selections.raceBuildChoices = {};
  if (!character.selections.raceBonusChoices) {
    character.selections.raceBonusChoices = { ability: {}, skill: {} };
  }
  if (
    !character.selections.racePowerAbilityChoices ||
    typeof character.selections.racePowerAbilityChoices !== 'object'
  ) {
    character.selections.racePowerAbilityChoices = {};
  }
  if (
    !character.selections.racePowerDamageChoices ||
    typeof character.selections.racePowerDamageChoices !== 'object'
  ) {
    character.selections.racePowerDamageChoices = {};
  }
  if (
    !character.selections.racePowerChoiceReqs ||
    typeof character.selections.racePowerChoiceReqs !== 'object'
  ) {
    character.selections.racePowerChoiceReqs = {};
  }
  if (!Array.isArray(character.selections.racePowerIds)) character.selections.racePowerIds = [];
  if (!Array.isArray(character.selections.raceFeatIds)) character.selections.raceFeatIds = [];
  character.notes = character.notes ?? {};
  if (typeof character.notes.racialPowers !== 'string') character.notes.racialPowers = '';
  return character;
}

/** Ensure the sheet sub-objects this module writes into exist. */
function ensureRaceSheetShape(character) {
  character.sheet = character.sheet ?? {};
  character.sheet.extraFields = character.sheet.extraFields ?? {};
  character.sheet.speed = character.sheet.speed ?? { base: 6, armor: 0, item: 0, misc: 0 };
  character.sheet.derived = character.sheet.derived ?? {};
  character.sheet.derived.race = character.sheet.derived.race ?? {
    languages: '',
    resistances: '',
    senses: '',
    speedBase: null
  };
  character.notes = character.notes ?? {};
  return character;
}

/**
 * Recompose a managed sheet field: replace the previously race-derived portion
 * with a new one while preserving any text the user typed (the manual addendum).
 * @param {string | null | undefined} current
 * @param {string} prevDerived
 * @param {string} newDerived
 */
function recomposeManaged(current, prevDerived, newDerived) {
  let manual = String(current ?? '');
  if (prevDerived && manual.includes(prevDerived)) {
    manual = manual.replace(prevDerived, '');
  }
  manual = manual.replace(/^[\s\n,]+|[\s\n,]+$/g, '').trim();
  return [newDerived, manual].filter(Boolean).join('\n').trim();
}

/**
 * Apply structured racial traits (languages, resistances, senses, speed) to the
 * sheet at their dedicated fields, preserving manual edits. Race is the
 * authoritative baseline; user text is kept as a manual addendum.
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 */
export function applyRaceTraitsToSheet(character, baseEntry, variantEntry) {
  ensureRaceSheetShape(character);
  const sheet = character.sheet;
  const prev = sheet.derived.race;
  const traits = getRaceStructuredTraits(baseEntry, variantEntry);

  const newLanguages = formatRaceLanguagesText(traits.languages);
  const newResist = formatRaceResistancesText(traits.resistances);
  const newSenses = formatRaceSensesText(traits.senses);

  character.notes.languages = recomposeManaged(character.notes.languages, prev.languages, newLanguages);
  sheet.extraFields.resistances = recomposeManaged(sheet.extraFields.resistances, prev.resistances, newResist);
  sheet.extraFields['special-senses'] = recomposeManaged(
    sheet.extraFields['special-senses'],
    prev.senses,
    newSenses
  );
  if (traits.speedSquares != null) {
    sheet.speed.base = traits.speedSquares;
  }

  sheet.derived.race = {
    languages: newLanguages,
    resistances: newResist,
    senses: newSenses,
    speedBase: traits.speedSquares ?? prev.speedBase ?? null
  };
  return character;
}

/** Strip race-derived trait text from the sheet (keeps manual addendums). */
export function clearRaceTraitsFromSheet(character) {
  ensureRaceSheetShape(character);
  const sheet = character.sheet;
  const prev = sheet.derived.race;
  character.notes.languages = recomposeManaged(character.notes.languages, prev.languages, '');
  sheet.extraFields.resistances = recomposeManaged(sheet.extraFields.resistances, prev.resistances, '');
  sheet.extraFields['special-senses'] = recomposeManaged(sheet.extraFields['special-senses'], prev.senses, '');
  if (prev.speedBase != null) sheet.speed.base = 6;
  sheet.derived.race = { languages: '', resistances: '', senses: '', speedBase: null };
  return character;
}

export function resetRaceDerivedSelections(character) {
  ensureRaceSelectionsShape(character);
  clearRaceTraitsFromSheet(character);
  character.selections.raceBuildChoices = {};
  character.selections.raceBonusChoices = { ability: {}, skill: {} };
  character.selections.racePowerAbilityChoices = {};
  character.selections.racePowerDamageChoices = {};
  character.selections.racePowerChoiceReqs = {};
  character.selections.racePowerIds = [];
  character.selections.raceFeatIds = [];
  character.notes.racialPowers = '';
  return character;
}

/**
 * @param {object} character
 * @param {string} powerId
 * @param {string} ability
 */
export function setRacePowerAbilityChoice(character, powerId, ability) {
  ensureRaceSelectionsShape(character);
  const key = String(powerId ?? '').toLowerCase();
  if (!key) return character;
  if (ability) character.selections.racePowerAbilityChoices[key] = ability;
  else delete character.selections.racePowerAbilityChoices[key];
  return character;
}

/**
 * @param {object} character
 * @param {string} powerId
 * @param {string} damageType
 */
export function setRacePowerDamageChoice(character, powerId, damageType) {
  ensureRaceSelectionsShape(character);
  const key = String(powerId ?? '').toLowerCase();
  if (!key) return character;
  if (damageType) character.selections.racePowerDamageChoices[key] = damageType;
  else delete character.selections.racePowerDamageChoices[key];
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
export function collectRaceGrantIds(character, baseEntry, variantEntry, opts = {}) {
  const previewTerms = getPreviewTermsForRace(character, baseEntry, variantEntry);
  const powerIds = new Set();
  const featIds = new Set();

  // Track which grants come from the base entry only, so a subrace replacement
  // suppresses the base item but never the subrace's replacing grant.
  const baseOnlyPowerIds = new Set();
  const baseOnlyFeatIds = new Set();
  const variantPowerIds = new Set();
  const variantFeatIds = new Set();

  for (const id of extractPowerIdsFromRaceHtml(baseEntry?.body_html ?? '')) {
    powerIds.add(id);
    baseOnlyPowerIds.add(String(id).toLowerCase());
  }
  for (const id of extractFeatIdsFromRaceHtml(baseEntry?.body_html ?? '')) {
    featIds.add(id);
    baseOnlyFeatIds.add(String(id).toLowerCase());
  }
  if (variantEntry && variantEntry.id !== baseEntry?.id) {
    for (const id of extractPowerIdsFromRaceHtml(variantEntry.body_html ?? '')) {
      powerIds.add(id);
      variantPowerIds.add(String(id).toLowerCase());
    }
    for (const id of extractFeatIdsFromRaceHtml(variantEntry.body_html ?? '')) {
      featIds.add(id);
      variantFeatIds.add(String(id).toLowerCase());
    }
  }

  // Suppress base-origin grants a subrace replaces (by id or resolved name).
  const replaced = resolveReplacedBaseItems(baseEntry, variantEntry, { normalized: opts.replacements });
  if (replaced.names.size || replaced.ids.size) {
    const grantNameById = opts.grantNameById ?? new Map();
    const isReplaced = (id) => {
      const key = String(id).toLowerCase();
      if (replaced.ids.has(key)) return true;
      const name = grantNameById.get(key);
      return Boolean(name) && replaced.names.has(normalizeName(name));
    };
    for (const id of [...powerIds]) {
      const key = String(id).toLowerCase();
      if (baseOnlyPowerIds.has(key) && !variantPowerIds.has(key) && isReplaced(id)) powerIds.delete(id);
    }
    for (const id of [...featIds]) {
      const key = String(id).toLowerCase();
      if (baseOnlyFeatIds.has(key) && !variantFeatIds.has(key) && isReplaced(id)) featIds.delete(id);
    }
  }

  const { baseId } = resolveRacePair(character.selections?.raceId);
  const decisions = getRaceBuildDecisions(baseId ?? character.selections?.raceId, baseEntry?.listing_fields?.Name);
  const choices = character.selections.raceBuildChoices ?? {};

  // Powers tied to a build decision are granted only once that decision is
  // made — never show all options' powers up front.
  for (const d of decisions) {
    for (const opt of d.options ?? []) {
      if (opt.powerId) powerIds.delete(String(opt.powerId).toLowerCase());
    }
  }
  for (const d of decisions) {
    const picked = choices[d.id];
    if (!picked) continue;
    const opt = d.options?.find((o) => o.id === picked);
    if (opt?.powerId) powerIds.add(String(opt.powerId).toLowerCase());
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
 * @param {{ replacements?: Array<{ replacesName: string, replacesKind?: string }> | null, grantNameById?: Map<string, string> }} [opts]
 */
export function syncRaceNotesAndGrants(character, baseEntry, variantEntry, powerEntries = [], opts = {}) {
  ensureRaceSelectionsShape(character);
  const { racePowerIds, raceFeatIds, previewTerms } = collectRaceGrantIds(
    character,
    baseEntry,
    variantEntry,
    { replacements: opts.replacements, grantNameById: opts.grantNameById }
  );
  character.selections.racePowerIds = racePowerIds;
  character.selections.raceFeatIds = raceFeatIds;

  const replaced = resolveReplacedBaseItems(baseEntry, variantEntry, { normalized: opts.replacements });

  const buildSummary = buildBuildChoiceSummary(character, baseEntry, variantEntry);
  character.notes.raceFeatures = buildRaceNotesText(baseEntry, variantEntry, {
    previewTerms,
    buildSummary,
    raceBonusChoices: character.selections.raceBonusChoices,
    replacedNames: replaced.names
  });

  // Racial power names, annotated with the chosen ability and/or damage type
  // when the power offers those choices (e.g. "Dragon Breath (Dexterity, fire)").
  // Only include powers still granted after replacement suppression. We also
  // record per-power requirement flags so validateRaceStep stays synchronous.
  const keptPowerIds = new Set(racePowerIds.map((id) => String(id).toLowerCase()));
  const abilityChoices = character.selections.racePowerAbilityChoices ?? {};
  const damageChoices = character.selections.racePowerDamageChoices ?? {};
  const reqs = {};
  const powerNames = powerEntries
    .filter((e) => e?.id && keptPowerIds.has(String(e.id).toLowerCase()))
    .map((e) => {
      const name = e?.listing_fields?.Name;
      if (!name) return null;
      const key = String(e.id).toLowerCase();
      const abilityOpts = parsePowerAbilityOptions(e);
      const damageOpts = parsePowerDamageOptions(e);
      if (abilityOpts || damageOpts) {
        reqs[key] = {
          name,
          ability: Boolean(abilityOpts),
          damage: Boolean(damageOpts)
        };
      }
      const parts = [];
      const abilityPick = abilityChoices[key];
      if (abilityPick) parts.push(ABILITY_LABEL[abilityPick] ?? String(abilityPick).toUpperCase());
      const damagePick = damageChoices[key];
      if (damagePick) parts.push(String(damagePick));
      return parts.length ? `${name} (${parts.join(', ')})` : name;
    })
    .filter(Boolean);
  character.notes.racialPowers = powerNames.join('\n');

  // Drop reqs and stale picks for powers that are no longer granted.
  character.selections.racePowerChoiceReqs = reqs;
  for (const key of Object.keys(abilityChoices)) {
    if (!reqs[key]?.ability) delete abilityChoices[key];
  }
  for (const key of Object.keys(damageChoices)) {
    if (!reqs[key]?.damage) delete damageChoices[key];
  }

  applyRaceTraitsToSheet(character, baseEntry, variantEntry);
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
/**
 * Clear build choices that are no longer visible under the active source filter.
 * @param {object} character
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 * @param {string[] | null} activeSourceBooks
 */
export function pruneRaceBuildChoicesForSource(character, baseEntry, variantEntry, activeSourceBooks) {
  ensureRaceSelectionsShape(character);
  const raceId = character.selections?.raceId;
  if (!raceId) return false;

  const { baseId } = resolveRacePair(raceId);
  const decisions = getRaceBuildDecisions(baseId ?? raceId, baseEntry?.listing_fields?.Name);
  const map = character.selections.raceBuildChoices ?? {};
  let changed = false;

  for (const d of decisions) {
    const picked = map[d.id];
    if (!picked) continue;
    const visible = filterDecisionOptionsBySource(d.options, activeSourceBooks);
    if (visible.some((o) => o.id === picked)) continue;
    delete map[d.id];
    changed = true;
  }

  if (changed) syncRaceNotesAndGrants(character, baseEntry, variantEntry);
  return changed;
}

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
  // A subrace is optional: any set raceId (a subrace, or a base race chosen via
  // the "None" option) resolves the decision. The subrace phase keeps raceId
  // null until the player picks something.
  return Boolean(character.selections?.raceId);
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

  // Subraces are optional: picking the base race (the "None" subrace option) is
  // a valid choice, so a set raceId never blocks here. The wizard still blocks
  // while raceId is null via the "Select a race" error above.
  const { baseId } = resolveRacePair(raceId);

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

  // Required ability/damage picks for granted racial powers that offer them
  // (recorded by syncRaceNotesAndGrants). Keeps validation synchronous.
  const choiceReqs = character.selections?.racePowerChoiceReqs ?? {};
  const abilityChoices = character.selections?.racePowerAbilityChoices ?? {};
  const damageChoices = character.selections?.racePowerDamageChoices ?? {};
  for (const [id, req] of Object.entries(choiceReqs)) {
    const label = req?.name ?? 'this power';
    if (req?.ability && !abilityChoices[id]) {
      errors.push(`Choose the attack ability for ${label}.`);
    }
    if (req?.damage && !damageChoices[id]) {
      errors.push(`Choose the damage type for ${label}.`);
    }
  }

  return errors;
}

export { getParentRaceId, resolveRacePair, parentHasSubraces, isSubraceId };
