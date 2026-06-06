/**
 * Power prerequisite filtering — parses Prerequisite from body_html (and listing_fields when present).
 */

import {
  normalizePrerequisiteText,
  isEmptyPrerequisite,
  prereqPassesLevelGate,
  prereqPassesRace,
  prereqPassesClass,
  prereqPassesBackground,
  prereqPassesAbilities,
  prereqPassesSkills,
  prereqPassesFeatChain,
  buildFeatEligibilityContext
} from './feat-prerequisite.js';

const PREREQ_RE = /<b>Prerequisite:\s*<\/b>\s*([^<]+)/i;
const PREREQ_HINT_WORDS =
  /\b(prerequisite|must|requires?|trained|level|paragon|epic|heroic|feat|background|race|class)\b/i;

/**
 * @param {{ body_html?: string, listing_fields?: Record<string, string> }} entry
 * @returns {string}
 */
export function parsePowerPrerequisite(entry) {
  const html = entry?.body_html ?? '';
  const m = html.match(PREREQ_RE);
  if (m) {
    const v = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (v && v !== '—' && v !== '-') return v;
  }
  const field = entry?.listing_fields?.Prerequisite;
  if (field) return normalizePrerequisiteText(field);
  return '';
}

/**
 * @param {{ body_html?: string, listing_fields?: Record<string, string> }} entry
 * @param {object} ctx
 * @param {{ slotLevel: number }} slot
 */
export function powerPassesPrerequisites(entry, ctx, slot) {
  const prereq = parsePowerPrerequisite(entry);
  if (isEmptyPrerequisite(prereq)) return true;

  const level = ctx.level ?? ctx.characterLevel ?? 1;

  if (!prereqPassesLevelGate(prereq, level, slot.slotLevel)) return false;
  if (!prereqPassesRace(prereq, ctx.raceTerms ?? [])) return false;
  if (!prereqPassesClass(prereq, ctx.classInfo ?? {})) return false;
  if (!prereqPassesBackground(prereq, ctx.backgroundName ?? '')) return false;
  if (!prereqPassesAbilities(prereq, ctx.abilityScores ?? {})) return false;
  if (!prereqPassesSkills(prereq, ctx.trainedSkills ?? new Set(), ctx.hasTrainingData ?? false)) return false;
  if (!prereqPassesFeatChain(prereq, ctx.ownedFeatNames ?? new Set())) return false;

  if (PREREQ_HINT_WORDS.test(prereq)) {
    const checks = [
      prereqPassesRace(prereq, ctx.raceTerms ?? []),
      prereqPassesClass(prereq, ctx.classInfo ?? {}),
      prereqPassesAbilities(prereq, ctx.abilityScores ?? {}),
      prereqPassesSkills(prereq, ctx.trainedSkills ?? new Set(), ctx.hasTrainingData ?? false),
      prereqPassesFeatChain(prereq, ctx.ownedFeatNames ?? new Set())
    ];
    if (checks.every((c) => c === true) && prereq.length > 12) {
      return false;
    }
  }

  return true;
}

/**
 * @param {import('../character/model.js').Character} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 */
export async function buildPowerEligibilityContext(character, compendium) {
  const featCtx = await buildFeatEligibilityContext(character, compendium);
  const className = featCtx.classInfo?.className ?? character.identity?.class ?? '';

  return {
    ...featCtx,
    characterLevel: featCtx.level,
    className,
    classInfo: featCtx.classInfo
  };
}
