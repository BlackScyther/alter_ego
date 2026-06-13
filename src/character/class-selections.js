/**
 * Class step selections: build choices, trained skills, grants, validation, sheet sync.
 */

import buildOptionsMeta from '../../metadata/class-build-options.json' with { type: 'json' };
import classFeaturePowersMeta from '../../metadata/class-feature-powers.json' with { type: 'json' };
import { abilityModifier } from '../formulas.js';
import { getFinalScores } from './tutor.js';
import { computeLevel1MaxHp, getClassMaxHpAt1 } from './hp.js';
import {
  parseClassEntry,
  buildClassNotesText,
  extractPowerIdsFromClassHtml,
  parseBuildSuggestedSkills,
  getSuggestedTrainedSkillsForBuild
} from './class-parse.js';
import { ensurePowerSelectionsShape, syncPowerIdsFromSelections, getPowerSlotsForLevel } from './power-selections.js';

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
        powerSlotSeeds: {}
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

  const level = Number(character.identity?.level) || 1;
  const scores = getFinalScores(character);
  const conMod = abilityModifier(scores.con ?? 10);

  if (level === 1) {
    const classHp = getClassMaxHpAt1(classEntry.id, classEntry);
    if (classHp != null && !(Number(character.sheet.hp.max) > 0)) {
      const maxHp = computeLevel1MaxHp(character, classEntry);
      if (maxHp != null) {
        character.sheet.hp.max = maxHp;
        character.sheet.hp.current = maxHp;
      }
    }
  }

  if (parsed.surgesBase != null) {
    character.sheet.hp.surgesPerDay = Math.floor(parsed.surgesBase + conMod);
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
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function hasRecommendedClassPowers(character, classEntry) {
  return Object.keys(getRecommendedPowerSeeds(character, classEntry).seeds).length > 0;
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
  const { seeds } = getRecommendedPowerSeeds(character, classEntry);
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
  character.notes.classFeatures = buildClassNotesText(classEntry, parsed, {
    buildChoices: character.selections.classBuildChoices,
    trainedSkillChoices: character.selections.classTrainedSkillChoices,
    buildSummary
  });

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
