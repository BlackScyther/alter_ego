/**
 * Class step selections: build choices, trained skills, grants, validation, sheet sync.
 */

import buildOptionsMeta from '../../metadata/class-build-options.json' with { type: 'json' };
import classFeaturePowersMeta from '../../metadata/class-feature-powers.json' with { type: 'json' };
import { abilityModifier } from '../formulas.js';
import { getFinalScores } from './tutor.js';
import { computeMaxHp, getClassHpPerLevel, getClassMaxHpAt1 } from './hp.js';
import { mergeHybridClasses, hybridPairAllowed } from './hybrid-merge.js';
import {
  parseClassEntry,
  buildClassNotesText,
  extractPowerIdsFromClassHtml,
  parseBuildSuggestedSkills,
  parseBuildSuggestedPowerNames,
  parseBuildSuggestedFeatNames,
  getSuggestedTrainedSkillsForBuild
} from './class-parse.js';
import { detectClassEffects, applyClassEffects, formatClassEffectNotes } from './class-effects.js';
import { ensurePowerSelectionsShape, syncPowerIdsFromSelections, getPowerSlotsForLevel } from './power-selections.js';
import {
  ensureFeatSelectionsShape,
  syncFeatIdsFromSelections,
  getFeatSlotsForLevel
} from './feat-selections.js';

const BUILD_BY_ID = buildOptionsMeta.byClassId ?? {};
const BUILD_BY_NAME = buildOptionsMeta.byClassName ?? {};
const FEATURE_POWERS_BY_ID = classFeaturePowersMeta.byClassId ?? {};
const FEATURE_POWERS_BY_NAME = classFeaturePowersMeta.byClassName ?? {};

export function ensureClassSelectionsShape(character) {
  character.selections = character.selections ?? {};
  if (!character.selections.classBuildChoices) character.selections.classBuildChoices = {};
  if (!Array.isArray(character.selections.classTrainedSkillChoices)) {
    character.selections.classTrainedSkillChoices = [];
  }
  if (!Array.isArray(character.selections.classPowerIds)) character.selections.classPowerIds = [];
  if (!Array.isArray(character.selections.trainedSkillIds)) character.selections.trainedSkillIds = [];
  if (typeof character.selections.classHybrid !== 'boolean') character.selections.classHybrid = false;
  if (!Array.isArray(character.selections.hybridClassIds)) character.selections.hybridClassIds = [];
  if (!('hybridMerged' in character.selections)) character.selections.hybridMerged = null;
  character.notes = character.notes ?? {};
  if (typeof character.notes.classFeatures !== 'string') character.notes.classFeatures = '';
  return character;
}

export function resetClassDerivedSelections(character) {
  ensureClassSelectionsShape(character);
  character.selections.classBuildChoices = {};
  character.selections.classTrainedSkillChoices = [];
  character.selections.classPowerIds = [];
  character.selections.trainedSkillIds = [];
  character.selections.hybridMerged = null;
  return character;
}

/**
 * @param {string | null | undefined} classId
 * @param {string | null | undefined} className
 * @param {ReturnType<typeof parseClassEntry>} [parsed]
 */
export function getClassBuildDecisions(classId, className, parsed = null) {
  const fromMeta =
    (classId && BUILD_BY_ID[classId]?.decisions) ||
    (className && BUILD_BY_NAME[className]?.decisions) ||
    [];

  if (fromMeta.length) return fromMeta;

  const buildOptions = parsed?.buildOptions ?? [];
  if (!buildOptions.length) return [];

  return [
    {
      id: 'build',
      label: 'Build option',
      prompt: 'Choose a build option.',
      previewTerms: [],
      options: buildOptions.map((o) => ({
        id: o.id,
        label: o.label,
        previewTerms: [o.label.split(/\s/)[0]],
        powerIds: [],
        powerSlotSeeds: {},
        featSlotSeeds: {}
      }))
    }
  ];
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function getPreviewTermsForClass(character, classEntry) {
  const parsed = parseClassEntry(classEntry);
  const decisions = getClassBuildDecisions(
    classEntry?.id ?? character.selections?.classId,
    classEntry?.listing_fields?.Name ?? character.identity?.class,
    parsed
  );
  const choices = character.selections?.classBuildChoices ?? {};
  const terms = new Set();
  for (const d of decisions) {
    const picked = choices[d.id];
    if (!picked) continue;
    const opt = d.options?.find((o) => o.id === picked);
    for (const t of opt?.previewTerms ?? []) terms.add(t);
  }
  return [...terms];
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function buildBuildChoiceSummary(character, classEntry) {
  const parsed = parseClassEntry(classEntry);
  const decisions = getClassBuildDecisions(
    classEntry?.id ?? character.selections?.classId,
    classEntry?.listing_fields?.Name,
    parsed
  );
  const choices = character.selections?.classBuildChoices ?? {};
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
 * @param {object | null | undefined} classEntry
 */
export function collectClassGrantIds(character, classEntry) {
  const parsed = parseClassEntry(classEntry);
  const decisions = getClassBuildDecisions(
    classEntry?.id ?? character.selections?.classId,
    classEntry?.listing_fields?.Name,
    parsed
  );
  const choices = character.selections?.classBuildChoices ?? {};
  const powerIds = new Set(extractPowerIdsFromClassHtml(classEntry?.body_html ?? ''));

  const classId = classEntry?.id ?? character.selections?.classId;
  const className = classEntry?.listing_fields?.Name;
  const featureMeta =
    (classId && FEATURE_POWERS_BY_ID[classId]?.powerIds) ||
    (className && FEATURE_POWERS_BY_NAME[className]?.powerIds) ||
    [];
  for (const pid of featureMeta) powerIds.add(String(pid).toLowerCase());

  for (const d of decisions) {
    const picked = choices[d.id];
    if (!picked) continue;
    const opt = d.options?.find((o) => o.id === picked);
    for (const pid of opt?.powerIds ?? []) powerIds.add(String(pid).toLowerCase());
  }

  return {
    classPowerIds: [...powerIds],
    previewTerms: getPreviewTermsForClass(character, classEntry)
  };
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function getResolvedTrainedSkillIds(character, classEntry) {
  const parsed = parseClassEntry(classEntry);
  const ts = parsed.trainedSkills;
  const picked = character.selections?.classTrainedSkillChoices ?? [];

  if (ts.kind === 'fixed') return [...ts.fixedSkills];
  if (ts.kind === 'choice') return [...ts.fixedSkills, ...picked];
  return [];
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function syncClassTraitsToSheet(character, classEntry) {
  if (!classEntry) return character;
  ensureClassSelectionsShape(character);

  const parsed = parseClassEntry(classEntry);
  character.sheet = character.sheet ?? {};
  character.sheet.defenses = character.sheet.defenses ?? {
    ac: { abil: 0, class: 0, feat: 0, enh: 0, misc: 0, armor: 0 },
    fort: { abil: 0, class: 0, feat: 0, enh: 0, misc: 0 },
    ref: { abil: 0, class: 0, feat: 0, enh: 0, misc: 0 },
    will: { abil: 0, class: 0, feat: 0, enh: 0, misc: 0 }
  };
  character.sheet.hp = character.sheet.hp ?? { max: 0, current: 0, temp: 0, surgesPerDay: 0, surgeUses: 0 };
  character.sheet.speed = character.sheet.speed ?? { base: 6, armor: 0, item: 0, misc: 0 };
  character.sheet.skills = character.sheet.skills ?? {};

  const d = parsed.defenseBonuses;
  character.sheet.defenses.fort.class = d.fort ?? 0;
  character.sheet.defenses.ref.class = d.ref ?? 0;
  character.sheet.defenses.will.class = d.will ?? 0;
  character.sheet.defenses.ac.class = d.ac ?? 0;

  if (parsed.baseSpeed != null) {
    character.sheet.speed.base = parsed.baseSpeed;
  }

  const trainedIds = getResolvedTrainedSkillIds(character, classEntry);
  character.selections.trainedSkillIds = trainedIds;
  const trainedSet = new Set(trainedIds);
  const ts = parsed.trainedSkills;
  const managedSkills = new Set([
    ...ts.fixedSkills,
    ...(ts.classSkills.length ? ts.classSkills : ts.fixedSkills),
    ...(character.selections.classTrainedSkillChoices ?? [])
  ]);
  for (const skillId of managedSkills) {
    character.sheet.skills[skillId] = {
      ...(character.sheet.skills[skillId] ?? {}),
      trained: trainedSet.has(skillId)
    };
  }
  for (const skillId of trainedIds) {
    character.sheet.skills[skillId] = { ...(character.sheet.skills[skillId] ?? {}), trained: true };
  }

  const scores = getFinalScores(character);
  const conMod = abilityModifier(scores.con ?? 10);

  const classBase = getClassMaxHpAt1(classEntry.id, classEntry);
  if (classBase != null) character.sheet.hp.classBase = classBase;
  const perLevel = getClassHpPerLevel(classEntry.id, classEntry);
  if (perLevel != null) character.sheet.hp.perLevel = perLevel;

  const maxHp = computeMaxHp(character, classEntry);
  if (maxHp != null) {
    const prevMax = Number(character.sheet.hp.max) || 0;
    const prevCurrent = Number(character.sheet.hp.current) || 0;
    character.sheet.hp.max = maxHp;
    if (!(prevCurrent > 0) || prevCurrent >= prevMax) {
      character.sheet.hp.current = maxHp;
    }
  }

  if (parsed.surgesBase != null) {
    character.sheet.hp.surgesPerDay = Math.floor(parsed.surgesBase + conMod);
  }

  applyClassEffects(character, detectClassEffects(classEntry));

  return character;
}

/**
 * Combine the two hybrid classes (PH3) into the sheet's HP and surges, and
 * persist the full merge (skills/proficiencies too) on
 * `selections.hybridMerged` for downstream use. No-op unless hybrid mode is on
 * and BOTH classes resolve to normalized rows; otherwise the primary class's
 * single-class stats (already applied by syncClassTraitsToSheet) stand.
 *
 * Requires the normalized compendium (`getNormalizedClass`); falls back
 * silently when unavailable so non-normalized builds are unaffected.
 *
 * @param {object} character
 * @param {{ getNormalizedClass?: (id: string) => Promise<object|null> }} compendium
 */
export async function applyHybridClassStats(character, compendium) {
  ensureClassSelectionsShape(character);
  const sel = character.selections;
  if (!sel.classHybrid) {
    sel.hybridMerged = null;
    return character;
  }
  const [aId, bId] = sel.hybridClassIds ?? [];
  if (!aId || !bId || typeof compendium?.getNormalizedClass !== 'function') return character;

  const [a, b] = await Promise.all([
    compendium.getNormalizedClass(aId),
    compendium.getNormalizedClass(bId)
  ]);
  if (!a || !b || !hybridPairAllowed(a, b).ok) return character;

  const merged = mergeHybridClasses(a, b);
  if (!merged) return character;
  sel.hybridMerged = merged;

  character.sheet = character.sheet ?? {};
  character.sheet.hp = character.sheet.hp ?? { max: 0, current: 0, temp: 0, surgesPerDay: 0, surgeUses: 0 };
  if (merged.hpAt1Base != null) character.sheet.hp.classBase = merged.hpAt1Base;
  if (merged.hpPerLevel != null) character.sheet.hp.perLevel = merged.hpPerLevel;
  if (merged.baseSpeed != null) {
    character.sheet.speed = character.sheet.speed ?? { base: 6, armor: 0, item: 0, misc: 0 };
    character.sheet.speed.base = merged.baseSpeed;
  }

  const scores = getFinalScores(character);
  const conMod = abilityModifier(scores.con ?? 10);

  const maxHp = computeMaxHp(character);
  if (maxHp != null) {
    const prevMax = Number(character.sheet.hp.max) || 0;
    const prevCurrent = Number(character.sheet.hp.current) || 0;
    character.sheet.hp.max = maxHp;
    if (!(prevCurrent > 0) || prevCurrent >= prevMax) {
      character.sheet.hp.current = maxHp;
    }
  }
  if (merged.surgesBase != null) {
    character.sheet.hp.surgesPerDay = Math.floor(merged.surgesBase + conMod);
  }

  return character;
}

/**
 * Starter power picks from the selected class build (`powerSlotSeeds` in metadata).
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @returns {{ seeds: Record<string, string>, buildLabel: string | null, decisionId: string | null, buildOptionId: string | null }}
 */
export function getRecommendedPowerSeeds(character, classEntry) {
  if (!classEntry) {
    return { seeds: {}, buildLabel: null, decisionId: null, buildOptionId: null };
  }

  const parsed = parseClassEntry(classEntry);
  const decisions = getClassBuildDecisions(
    classEntry.id ?? character.selections?.classId,
    classEntry.listing_fields?.Name,
    parsed
  );
  const choices = character.selections?.classBuildChoices ?? {};

  for (const d of decisions) {
    const picked = choices[d.id];
    if (!picked) continue;
    const opt = d.options?.find((o) => o.id === picked);
    const seeds = opt?.powerSlotSeeds ?? {};
    if (Object.keys(seeds).length) {
      return {
        seeds,
        buildLabel: opt?.label ?? picked,
        decisionId: d.id,
        buildOptionId: picked
      };
    }
  }

  return { seeds: {}, buildLabel: null, decisionId: null, buildOptionId: null };
}

/**
 * Ability matchers accepting both full names ("Strength") and the abbreviations
 * the live compendium uses ("Str"). Word boundaries avoid false hits inside
 * unrelated words.
 */
const ABILITY_PATTERNS = [
  { key: 'str', re: /\b(?:str|strength)\b/g },
  { key: 'con', re: /\b(?:con|constitution)\b/g },
  { key: 'dex', re: /\b(?:dex|dexterity)\b/g },
  { key: 'int', re: /\b(?:int|intelligence)\b/g },
  { key: 'wis', re: /\b(?:wis|wisdom)\b/g },
  { key: 'cha', re: /\b(?:cha|charisma)\b/g }
];

/**
 * Parse a class "Key Abilities" string (e.g. "Strength, Constitution" or
 * "Str, Wis") into an ordered, de-duplicated list of ability keys, preserving
 * order of appearance.
 * @param {string} keyAbilities
 * @returns {string[]}
 */
export function parseKeyAbilitiesToKeys(keyAbilities) {
  const text = String(keyAbilities ?? '').toLowerCase();
  if (!text) return [];
  /** @type {Array<{ idx: number, key: string }>} */
  const matches = [];
  for (const { key, re } of ABILITY_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ idx: m.index, key });
    }
  }
  matches.sort((a, b) => a.idx - b.idx);
  /** @type {string[]} */
  const ordered = [];
  for (const m of matches) {
    if (!ordered.includes(m.key)) ordered.push(m.key);
  }
  return ordered;
}

/**
 * Recommended ability-score priority for a class, read from the class entry's
 * "Key Abilities" field. Drives the Attributes step auto-distribute button.
 * @param {object | null | undefined} classEntry
 * @returns {{ priority: string[], keyAbilitiesText: string, classLabel: string | null }}
 */
export function getRecommendedAbilityPriorities(classEntry) {
  if (!classEntry) return { priority: [], keyAbilitiesText: '', classLabel: null };
  const parsed = parseClassEntry(classEntry);
  const keyAbilitiesText = parsed.keyAbilities ?? '';
  const priority = parseKeyAbilitiesToKeys(keyAbilitiesText);
  return {
    priority,
    keyAbilitiesText,
    classLabel: classEntry.listing_fields?.Name ?? parsed.title ?? null
  };
}

/**
 * Starter feat picks from the selected class build (`featSlotSeeds` in metadata).
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @returns {{ seeds: Record<string, string>, buildLabel: string | null, decisionId: string | null, buildOptionId: string | null }}
 */
export function getRecommendedFeatSeeds(character, classEntry) {
  if (!classEntry) {
    return { seeds: {}, buildLabel: null, decisionId: null, buildOptionId: null };
  }

  const parsed = parseClassEntry(classEntry);
  const decisions = getClassBuildDecisions(
    classEntry.id ?? character.selections?.classId,
    classEntry.listing_fields?.Name,
    parsed
  );
  const choices = character.selections?.classBuildChoices ?? {};

  for (const d of decisions) {
    const picked = choices[d.id];
    if (!picked) continue;
    const opt = d.options?.find((o) => o.id === picked);
    const seeds = opt?.featSlotSeeds ?? {};
    if (Object.keys(seeds).length) {
      return {
        seeds,
        buildLabel: opt?.label ?? picked,
        decisionId: d.id,
        buildOptionId: picked
      };
    }
  }

  return { seeds: {}, buildLabel: null, decisionId: null, buildOptionId: null };
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function hasRecommendedClassFeats(character, classEntry) {
  return Object.keys(getRecommendedFeatSeeds(character, classEntry).seeds).length > 0;
}

/**
 * Map a level-1 heroic feat id onto the first open feat slot for the character level.
 *
 * @param {string | null | undefined} featId
 * @param {number} characterLevel
 * @returns {Record<string, string>}
 */
export function buildStarterFeatSlotSeeds(featId, characterLevel) {
  if (!featId) return {};
  const slots = getFeatSlotsForLevel(characterLevel);
  const level1Slot = slots.find((s) => s.slotLevel === 1);
  if (!level1Slot) return {};
  return { [level1Slot.id]: String(featId).toLowerCase() };
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function hasRecommendedClassPowers(character, classEntry) {
  return Object.keys(getRecommendedPowerSeeds(character, classEntry).seeds).length > 0;
}

/**
 * Map resolved level-1 starter power ids onto open class power slots.
 *
 * @param {{ atWill: string[], encounter: string[], daily: string[] }} resolved
 * @param {number} characterLevel
 * @returns {Record<string, string>}
 */
export function buildStarterPowerSlotSeeds(resolved, characterLevel) {
  const slots = getPowerSlotsForLevel(characterLevel);
  const seeds = {};
  const atWillSlots = slots.filter((s) => s.powerType === 'At-Will');
  const encounterSlots = slots.filter((s) => s.powerType === 'Encounter');
  const dailySlots = slots.filter((s) => s.powerType === 'Daily');

  resolved.atWill.forEach((powerId, index) => {
    if (atWillSlots[index]) seeds[atWillSlots[index].id] = powerId;
  });
  if (encounterSlots[0] && resolved.encounter[0]) {
    seeds[encounterSlots[0].id] = resolved.encounter[0];
  }
  if (dailySlots[0] && resolved.daily[0]) {
    seeds[dailySlots[0].id] = resolved.daily[0];
  }
  return seeds;
}

/**
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @param {string} name
 * @param {string | null | undefined} className
 * @param {number} level
 * @param {import('../editor/power-filter.js').PowerType} powerType
 */
async function lookupPowerIdByName(compendium, name, className, level, powerType) {
  const entries = await compendium.listEntries('power', {
    search: name,
    limit: 30,
    className: className ?? undefined,
    level,
    powerType
  });
  const norm = name.toLowerCase();
  const exact = entries.find((e) => (e.listing_fields?.Name ?? '').toLowerCase() === norm);
  if (exact) return String(exact.id).toLowerCase();
  const partial = entries.find((e) => (e.listing_fields?.Name ?? '').toLowerCase().includes(norm));
  return partial ? String(partial.id).toLowerCase() : null;
}

/**
 * Resolve starter power slot seeds from metadata or compendium build-section names.
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @param {import('../data/compendium.js').CompendiumProvider | null | undefined} compendium
 */
export async function resolveRecommendedPowerSeeds(character, classEntry, compendium) {
  const sync = getRecommendedPowerSeeds(character, classEntry);
  if (Object.keys(sync.seeds).length) return sync;
  if (!classEntry || !compendium) return sync;

  const parsed = parseClassEntry(classEntry);
  const buildId = character.selections?.classBuildChoices?.build;
  if (!buildId) return sync;

  const suggested = parseBuildSuggestedPowerNames(classEntry.body_html ?? '', parsed.buildOptions)[buildId];
  if (!suggested) return sync;

  const className = classEntry.listing_fields?.Name ?? character.identity?.class;
  const level = Number(character.identity?.level) || 1;
  /** @type {{ atWill: string[], encounter: string[], daily: string[] }} */
  const resolved = { atWill: [], encounter: [], daily: [] };

  for (const name of suggested.atWill) {
    const id = await lookupPowerIdByName(compendium, name, className, 1, 'At-Will');
    if (id) resolved.atWill.push(id);
  }
  for (const name of suggested.encounter) {
    const id = await lookupPowerIdByName(compendium, name, className, 1, 'Encounter');
    if (id) resolved.encounter.push(id);
  }
  for (const name of suggested.daily) {
    const id = await lookupPowerIdByName(compendium, name, className, 1, 'Daily');
    if (id) resolved.daily.push(id);
  }

  const seeds = buildStarterPowerSlotSeeds(resolved, level);
  if (!Object.keys(seeds).length) return sync;

  const buildLabel = parsed.buildOptions.find((o) => o.id === buildId)?.label ?? buildId;
  return {
    seeds,
    buildLabel,
    decisionId: 'build',
    buildOptionId: buildId
  };
}

/**
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @param {string} name
 * @param {string} slotTier
 */
async function lookupFeatIdByName(compendium, name, slotTier) {
  const entries = await compendium.listEntries('feat', {
    search: name,
    limit: 30
  });
  const norm = name.toLowerCase();
  const tierMatches = entries.filter((e) => featEntryMatchesTier(e.listing_fields?.Tier, slotTier));
  const exact = tierMatches.find((e) => (e.listing_fields?.Name ?? '').toLowerCase() === norm);
  if (exact) return String(exact.id).toLowerCase();
  const partial = tierMatches.find((e) => (e.listing_fields?.Name ?? '').toLowerCase().includes(norm));
  return partial ? String(partial.id).toLowerCase() : null;
}

/**
 * @param {string | null | undefined} listingTier
 * @param {string} slotTier
 */
function featEntryMatchesTier(listingTier, slotTier) {
  const t = (listingTier ?? 'Heroic').toLowerCase();
  const slot = slotTier.toLowerCase();
  if (t === slot) return true;
  if (slot === 'heroic' && !t.includes('paragon') && !t.includes('epic')) return true;
  return false;
}

/**
 * Resolve starter feat slot seeds from metadata or compendium build-section names.
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @param {import('../data/compendium.js').CompendiumProvider | null | undefined} compendium
 */
export async function resolveRecommendedFeatSeeds(character, classEntry, compendium) {
  const sync = getRecommendedFeatSeeds(character, classEntry);
  if (Object.keys(sync.seeds).length) return sync;
  if (!classEntry || !compendium) return sync;

  const parsed = parseClassEntry(classEntry);
  const buildId = character.selections?.classBuildChoices?.build;
  if (!buildId) return sync;

  const featName = parseBuildSuggestedFeatNames(classEntry.body_html ?? '', parsed.buildOptions)[buildId];
  if (!featName) return sync;

  const level = Number(character.identity?.level) || 1;
  const slots = getFeatSlotsForLevel(level);
  const level1Slot = slots.find((s) => s.slotLevel === 1);
  if (!level1Slot) return sync;

  const featId = await lookupFeatIdByName(compendium, featName, level1Slot.tier);
  const seeds = buildStarterFeatSlotSeeds(featId, level);
  if (!Object.keys(seeds).length) return sync;

  const buildLabel = parsed.buildOptions.find((o) => o.id === buildId)?.label ?? buildId;
  return {
    seeds,
    buildLabel,
    decisionId: 'build',
    buildOptionId: buildId
  };
}

/**
 * Fill class power slots from the selected build's recommended picks.
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @param {{ force?: boolean }} [opts]
 */
export function applyRecommendedClassPowers(character, classEntry, opts = {}) {
  const force = opts.force !== false;
  if (!classEntry) return character;

  ensurePowerSelectionsShape(character);
  const { seeds } = opts.seeds
    ? { seeds: opts.seeds }
    : getRecommendedPowerSeeds(character, classEntry);
  const validSlots = new Set(getPowerSlotsForLevel(character.identity?.level ?? 1).map((s) => s.id));
  const map = character.selections.powerSelections ?? {};

  for (const [slotId, powerId] of Object.entries(seeds)) {
    if (!validSlots.has(slotId)) continue;
    if (force || !map[slotId]) {
      map[slotId] = String(powerId).toLowerCase();
    }
  }

  syncPowerIdsFromSelections(character);
  return character;
}

/**
 * Fill feat slots from the selected build's recommended picks.
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @param {{ force?: boolean, seeds?: Record<string, string> }} [opts]
 */
export function applyRecommendedClassFeats(character, classEntry, opts = {}) {
  const force = opts.force !== false;
  if (!classEntry) return character;

  ensureFeatSelectionsShape(character);
  const { seeds } = opts.seeds
    ? { seeds: opts.seeds }
    : getRecommendedFeatSeeds(character, classEntry);
  const validSlots = new Set(getFeatSlotsForLevel(character.identity?.level ?? 1).map((s) => s.id));
  const map = character.selections.featSelections ?? {};

  for (const [slotId, featId] of Object.entries(seeds)) {
    if (!validSlots.has(slotId)) continue;
    if (force || !map[slotId]) {
      map[slotId] = String(featId).toLowerCase();
    }
  }

  syncFeatIdsFromSelections(character);
  return character;
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function seedClassPowerSelections(character, classEntry) {
  if (!classEntry) return character;
  ensureClassSelectionsShape(character);
  ensurePowerSelectionsShape(character);

  const { seeds } = getRecommendedPowerSeeds(character, classEntry);
  const map = character.selections.powerSelections ?? {};

  for (const [slotId, powerId] of Object.entries(seeds)) {
    if (!map[slotId]) map[slotId] = String(powerId).toLowerCase();
  }

  syncPowerIdsFromSelections(character);
  return character;
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @param {Array<{ listing_fields?: { Name?: string } }>} [powerEntries]
 */
export function syncClassNotesAndGrants(character, classEntry, powerEntries = []) {
  ensureClassSelectionsShape(character);
  if (!classEntry) return character;

  const parsed = parseClassEntry(classEntry);
  const { classPowerIds } = collectClassGrantIds(character, classEntry);
  character.selections.classPowerIds = classPowerIds;

  const buildSummary = buildBuildChoiceSummary(character, classEntry);
  let notes = buildClassNotesText(classEntry, parsed, {
    buildChoices: character.selections.classBuildChoices,
    trainedSkillChoices: character.selections.classTrainedSkillChoices,
    buildSummary
  });
  const effectNotes = formatClassEffectNotes(detectClassEffects(classEntry));
  if (effectNotes.length) {
    notes = [notes, effectNotes.join('\n')].filter(Boolean).join('\n');
  }
  character.notes.classFeatures = notes;

  seedClassPowerSelections(character, classEntry);
  seedClassTrainedSkillChoices(character, classEntry);
  syncClassTraitsToSheet(character, classEntry);
  return character;
}

/**
 * Fill class trained-skill choices from the selected build's suggested skills.
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @param {{ force?: boolean }} [opts]
 */
export function seedClassTrainedSkillChoices(character, classEntry, opts = {}) {
  if (!classEntry) return character;
  ensureClassSelectionsShape(character);

  const parsed = parseClassEntry(classEntry);
  const ts = parsed.trainedSkills;
  if (ts.kind !== 'choice' || ts.chooseCount <= 0) return character;

  const buildId = character.selections.classBuildChoices?.build;
  if (!buildId) return character;

  const existing = character.selections.classTrainedSkillChoices ?? [];
  if (!opts.force && existing.length > 0) return character;

  const decisions = getClassBuildDecisions(
    classEntry.id ?? character.selections?.classId,
    classEntry.listing_fields?.Name,
    parsed
  );
  const buildOptions = decisions.flatMap((d) => d.options ?? []);
  const suggestedByBuild = parseBuildSuggestedSkills(classEntry.body_html ?? '', buildOptions);
  const suggested = getSuggestedTrainedSkillsForBuild(parsed, buildId, suggestedByBuild);
  if (!suggested.length) return character;

  character.selections.classTrainedSkillChoices = suggested;
  return character;
}

/**
 * @param {object} character
 * @param {string} decisionId
 * @param {string} optionId
 * @param {object | null | undefined} classEntry
 */
export function setClassBuildChoice(character, decisionId, optionId, classEntry) {
  ensureClassSelectionsShape(character);
  character.selections.classBuildChoices[decisionId] = optionId;
  if (decisionId === 'build') {
    seedClassTrainedSkillChoices(character, classEntry, { force: true });
  }
  return syncClassNotesAndGrants(character, classEntry);
}

/**
 * Checkbox enablement for class trained-skill picks in the skills table.
 * Pool skills are editable while slots remain or when already selected (switching).
 *
 * @param {object} character
 * @param {object | null | undefined} classEntry
 * @param {string} skillId
 * @returns {{ editable: boolean, title?: string }}
 */
export function getClassTrainedSkillCheckboxState(character, classEntry, skillId) {
  const id = String(skillId).toLowerCase();
  if (!classEntry) {
    return { editable: false, title: 'Select a class first.' };
  }

  const parsed = parseClassEntry(classEntry);
  const ts = parsed.trainedSkills;

  if (ts.kind === 'fixed') {
    if (ts.fixedSkills.includes(id)) {
      return { editable: false, title: 'Fixed class trained skill.' };
    }
    return { editable: false };
  }

  if (ts.kind !== 'choice' || ts.chooseCount <= 0) {
    return { editable: false };
  }

  const pool = ts.classSkills.length ? ts.classSkills : ts.fixedSkills;
  const fixed = new Set(ts.fixedSkills);
  const picked = character.selections?.classTrainedSkillChoices ?? [];
  const gap = ts.chooseCount - picked.length;

  if (fixed.has(id)) {
    return { editable: false, title: 'Fixed class trained skill.' };
  }

  if (!pool.includes(id)) {
    const resolved = getResolvedTrainedSkillIds(character, classEntry);
    if (resolved.includes(id)) {
      return { editable: false, title: 'Trained from another source.' };
    }
    return { editable: false };
  }

  if (picked.includes(id)) {
    return { editable: true };
  }

  if (gap > 0) {
    return {
      editable: true,
      title: `${gap} class skill${gap === 1 ? '' : 's'} remaining.`
    };
  }

  return {
    editable: false,
    title: `All ${ts.chooseCount} class skills chosen. Deselect one to switch.`
  };
}

/**
 * @param {object} character
 * @param {string} skillId
 * @param {object | null | undefined} classEntry
 */
export function toggleClassTrainedSkill(character, skillId, classEntry) {
  ensureClassSelectionsShape(character);
  const parsed = parseClassEntry(classEntry);
  const ts = parsed.trainedSkills;
  if (ts.kind !== 'choice') return character;

  const pool = ts.classSkills.length ? ts.classSkills : ts.fixedSkills;
  if (!pool.includes(skillId)) return character;

  let choices = [...(character.selections.classTrainedSkillChoices ?? [])];
  const idx = choices.indexOf(skillId);
  if (idx >= 0) {
    choices.splice(idx, 1);
  } else if (choices.length < ts.chooseCount) {
    choices.push(skillId);
  } else {
    return character;
  }

  character.selections.classTrainedSkillChoices = choices;
  return syncClassNotesAndGrants(character, classEntry);
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function classTrainedSkillsComplete(character, classEntry) {
  const parsed = parseClassEntry(classEntry);
  const ts = parsed.trainedSkills;
  if (ts.kind !== 'choice' || ts.chooseCount <= 0) return true;
  const picked = character.selections?.classTrainedSkillChoices ?? [];
  return picked.length >= ts.chooseCount;
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function classBuildChoicesComplete(character, classEntry) {
  const parsed = parseClassEntry(classEntry);
  const decisions = getClassBuildDecisions(
    classEntry?.id ?? character.selections?.classId,
    classEntry?.listing_fields?.Name,
    parsed
  );
  if (!decisions.length) return true;
  const choices = character.selections?.classBuildChoices ?? {};
  return decisions.every((d) => d.options?.some((o) => o.id === choices[d.id]));
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function validateClassStep(character, classEntry) {
  const errors = [];
  if (!character.selections?.classId) {
    errors.push('Select a class from the compendium.');
    return errors;
  }

  const parsed = parseClassEntry(classEntry);
  const decisions = getClassBuildDecisions(
    classEntry?.id ?? character.selections.classId,
    classEntry?.listing_fields?.Name,
    parsed
  );
  const choices = character.selections?.classBuildChoices ?? {};
  for (const d of decisions) {
    if (!choices[d.id] || !d.options?.some((o) => o.id === choices[d.id])) {
      errors.push(d.prompt || `Choose ${d.label}.`);
    }
  }

  const ts = parsed.trainedSkills;
  if (ts.kind === 'choice' && ts.chooseCount > 0) {
    const picked = character.selections?.classTrainedSkillChoices ?? [];
    if (picked.length < ts.chooseCount) {
      errors.push(`Choose ${ts.chooseCount} trained class skill${ts.chooseCount === 1 ? '' : 's'}.`);
    }
  }

  return errors;
}
