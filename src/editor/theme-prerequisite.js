/**
 * Theme eligibility, setting groups, and the character facts those checks use.
 *
 * Most themes have no entry requirement. The written ones are short: race
 * (including fey origin), class / power source / role, alignment, one trained
 * skill, and a spellbook class feature. Gender words stay unchecked because
 * the character has no gender field. Ability scores and level are not gates.
 *
 * A missing fact does not hide a theme. Race is known on this step. Class,
 * skills, and class features are checked only after they exist.
 */

import { getRaceMatchTerms } from './background-prerequisite.js';
import { grantedFeaturesForPreview, parseClassEntry } from '../character/class-parse.js';
import { parseThemeEntry } from '../character/theme-parse.js';

/** @typedef {'all' | 'eligible'} ThemeFilterMode */

/**
 * @typedef {object} ThemeEligibilityContext
 * @property {string[]} [raceTerms]
 * @property {string} [raceOrigin]
 * @property {string} [className]
 * @property {string} [role]
 * @property {string} [powerSource]
 * @property {string} [alignment]
 * @property {Set<string>} [trainedSkills]
 * @property {boolean} [hasTrainingData]
 * @property {string} [buildLabel]
 * @property {boolean} [hasSpellbook]
 * @property {boolean} [hasClassFeatures]
 */

const SESSION_KEY = 'compendium-theme';

/** @type {Map<string, { mode: ThemeFilterMode, setting: string }>} */
const sessionModes = new Map();

const RACE_TOKENS = [
  'half-elf',
  'shadar-kai',
  'halfling',
  'eladrin',
  'shifter',
  'dwarf',
  'human',
  'drow',
  'shade',
  'elf'
];

const ALIGNMENTS = ['lawful good', 'chaotic evil', 'unaligned', 'good', 'evil'];

/** Plain-language setting groups. `all` is the default and is not a book mapping. */
export const THEME_SETTINGS = [
  { id: 'all', label: 'All' },
  { id: 'generic', label: 'Generic' },
  { id: 'dragon', label: 'Dragon' },
  { id: 'neverwinter', label: 'Neverwinter' },
  { id: 'dark-sun', label: 'Dark Sun' },
  { id: 'elemental', label: 'Elemental Chaos' },
  { id: 'feywild', label: 'Feywild' },
  { id: 'underdark', label: 'Underdark' },
  { id: 'drow', label: 'Drow' },
  { id: 'vile', label: 'Vile Darkness' }
];

/** @returns {ThemeFilterMode} */
export function getThemeFilterMode() {
  return sessionModes.get(SESSION_KEY)?.mode ?? 'eligible';
}

/** @param {ThemeFilterMode} mode */
export function setThemeFilterMode(mode) {
  const state = sessionModes.get(SESSION_KEY) ?? { mode: 'eligible', setting: 'all' };
  state.mode = mode;
  sessionModes.set(SESSION_KEY, state);
}

/** @returns {string} */
export function getThemeSettingFilter() {
  return sessionModes.get(SESSION_KEY)?.setting ?? 'all';
}

/** @param {string} settingId */
export function setThemeSettingFilter(settingId) {
  const state = sessionModes.get(SESSION_KEY) ?? { mode: 'eligible', setting: 'all' };
  state.setting = settingId || 'all';
  sessionModes.set(SESSION_KEY, state);
}

/**
 * Facts already stored on the character. Origin, power source, build, and
 * spellbook stay empty until a caller loads those entries.
 * @param {object | null | undefined} character
 * @returns {ThemeEligibilityContext}
 */
export function themeEligibilityContextFromCharacter(character) {
  const trained = new Set(
    (character?.selections?.trainedSkillIds ?? []).map((id) => String(id).toLowerCase())
  );
  const choices = character?.selections?.classTrainedSkillChoices ?? [];
  return {
    raceTerms: character?.identity?.race ? [character.identity.race] : [],
    raceOrigin: '',
    className: character?.identity?.class ?? '',
    role: character?.identity?.role ?? '',
    powerSource: '',
    alignment: character?.identity?.alignment ?? '',
    trainedSkills: trained,
    hasTrainingData: trained.size > 0 || choices.length > 0,
    buildLabel: '',
    hasSpellbook: false,
    hasClassFeatures: false
  };
}

/**
 * @param {object | null | undefined} character
 * @param {{ getEntry?: (id: string) => Promise<object | null> }} [compendium]
 * @returns {Promise<ThemeEligibilityContext>}
 */
export async function buildThemeEligibilityContext(character, compendium) {
  const ctx = themeEligibilityContextFromCharacter(character);
  if (!compendium?.getEntry) return ctx;

  const terms = await getRaceMatchTerms(character, compendium);
  if (terms.length) ctx.raceTerms = terms;

  const raceId = character?.selections?.raceId;
  if (raceId) {
    const race = await compendium.getEntry(raceId);
    const origin = race?.listing_fields?.Origin ?? '';
    if (origin) ctx.raceOrigin = origin;
  }

  const classIds = [
    character?.selections?.classId,
    ...(character?.selections?.hybridClassIds ?? [])
  ].filter(Boolean);
  const names = [];
  const roles = [];
  const sources = [];
  let buildLabel = '';
  let hasSpellbook = false;
  let resolvedFeatures = false;
  let wizardBuildPending = false;

  for (const id of [...new Set(classIds)]) {
    const entry = await compendium.getEntry(id);
    if (!entry) continue;
    const name = entry.listing_fields?.Name ?? '';
    if (name) names.push(name);
    if (entry.listing_fields?.RoleName) roles.push(entry.listing_fields.RoleName);
    if (entry.listing_fields?.PowerSourceText) sources.push(entry.listing_fields.PowerSourceText);

    const parsed = parseClassEntry(entry);
    const choices = character?.selections?.classBuildChoices ?? {};
    const label = parsed.buildOptions?.find((opt) => opt.id === choices.build)?.label ?? '';
    if (label) buildLabel = label;
    const hasBuilds = (parsed.buildOptions ?? []).length > 0;
    const isWizard = /wizard/i.test(name);
    const featuresKnown = (parsed.features ?? []).length > 0 && (!hasBuilds || Boolean(label));
    if (isWizard && hasBuilds && !label) wizardBuildPending = true;
    if (!featuresKnown) continue;
    resolvedFeatures = true;
    const granted = grantedFeaturesForPreview(parsed, choices, entry.body_html ?? '');
    if (granted.some((feature) => /spellbook/i.test(`${feature.name} ${feature.text ?? ''}`))) {
      hasSpellbook = true;
    }
  }

  if (names.length) ctx.className = names.join(' ');
  if (roles.length) ctx.role = roles.join(' ');
  if (sources.length) ctx.powerSource = sources.join(' ');
  ctx.buildLabel = buildLabel;
  ctx.hasSpellbook = hasSpellbook;
  ctx.hasClassFeatures = resolvedFeatures && !wizardBuildPending;

  const pendingSkills = await skillChoiceStillOpen(character, compendium, [...new Set(classIds)]);
  if (classIds.length && !pendingSkills) {
    ctx.hasTrainingData = true;
    ctx.trainedSkills = new Set(
      (character?.selections?.trainedSkillIds ?? []).map((id) => String(id).toLowerCase())
    );
  } else if (pendingSkills) {
    ctx.hasTrainingData = false;
  }

  return ctx;
}

/**
 * @param {object | null | undefined} character
 * @param {{ getEntry?: (id: string) => Promise<object | null> }} compendium
 * @param {string[]} classIds
 */
async function skillChoiceStillOpen(character, compendium, classIds) {
  for (const id of classIds) {
    const entry = await compendium.getEntry(id);
    if (!entry) continue;
    const parsed = parseClassEntry(entry);
    const trained = parsed.trainedSkills;
    if (!trained || trained.kind !== 'choice') continue;
    const picked = character?.selections?.classTrainedSkillChoices ?? [];
    if (picked.length < (trained.chooseCount ?? 0)) return true;
  }
  return false;
}

/**
 * @param {string} prereq
 * @param {ThemeEligibilityContext} [ctx]
 */
export function themePassesEligibility(prereq, ctx = {}) {
  const text = String(prereq ?? '').trim();
  if (!text || text === '—' || text === '-' || text.toLowerCase() === 'none') return true;
  if (raceClauseFails(text, ctx)) return false;
  if (classClauseFails(text, ctx)) return false;
  if (alignmentClauseFails(text, ctx)) return false;
  if (skillClauseFails(text, ctx)) return false;
  if (spellbookClauseFails(text, ctx)) return false;
  return true;
}

/**
 * @param {string | null | undefined} sourceBook
 * @returns {string[]}
 */
export function themeSettingIdsForSource(sourceBook) {
  /** @type {string[]} */
  const ids = [];
  for (const part of String(sourceBook ?? '').split(/[,;]/)) {
    const id = settingIdForBook(part);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * @param {string | null | undefined} sourceBook
 * @param {string} settingId
 */
export function themeSourceMatchesSetting(sourceBook, settingId) {
  if (!settingId || settingId === 'all') return true;
  return themeSettingIdsForSource(sourceBook).includes(settingId);
}

/**
 * @param {object | null | undefined} entry
 * @param {{ mode?: ThemeFilterMode, settingId?: string, ctx?: ThemeEligibilityContext }} [opts]
 */
export function themePassesFilters(entry, opts = {}) {
  const settingId = opts.settingId ?? 'all';
  if (!themeSourceMatchesSetting(entry?.listing_fields?.SourceBook, settingId)) return false;
  if ((opts.mode ?? 'eligible') === 'all') return true;
  const prereq = parseThemeEntry(entry).prerequisite;
  return themePassesEligibility(prereq, opts.ctx ?? {});
}

/**
 * @param {string} book
 * @returns {string | null}
 */
function settingIdForBook(book) {
  const key = String(book ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  if (!key) return null;
  if (key.includes('dra399') || key.includes('dragonmagazine399') || key === 'dragon399') {
    return 'generic';
  }
  if (
    key.includes('dra413') ||
    key.includes('dragonmagazine413') ||
    key.includes('dragon413') ||
    key.includes('councilofspiders')
  ) {
    return 'drow';
  }
  if (/dra\d+/.test(key) || /dragonmagazine\d+/.test(key)) return 'dragon';
  if (key === 'ncs' || key.includes('neverwinter')) return 'neverwinter';
  if (key === 'dscs' || key.includes('darksun')) return 'dark-sun';
  if (key === 'hotec' || key.includes('elementalchaos')) return 'elemental';
  if (key === 'hotf' || key.includes('feywild')) return 'feywild';
  if (key === 'dsh' || key.includes('dungeonsurvival')) return 'underdark';
  if (key.includes('viledarkness')) return 'vile';
  return null;
}

/**
 * @param {string} prereq
 * @param {ThemeEligibilityContext} ctx
 */
function raceClauseFails(prereq, ctx) {
  const p = prereq.toLowerCase();
  const hasRaceClause =
    /fey origin|fey race/.test(p) || mentionedRaceTokens(p).length > 0;
  if (!hasRaceClause) return false;
  const terms = ctx.raceTerms ?? [];
  if (!terms.length && !ctx.raceOrigin) return false;

  if (/any fey race but drow/.test(p)) {
    if (characterIsToken(terms, 'drow')) return true;
    const origin = String(ctx.raceOrigin ?? '').toLowerCase();
    if (!origin) return false;
    return !/\bfey\b/.test(origin);
  }

  if (/fey origin/.test(p)) {
    if (characterIsToken(terms, 'half-elf')) return false;
    const named = mentionedRaceTokens(p.replace(/fey origin/g, ' '));
    if (named.some((token) => characterIsToken(terms, token))) return false;
    const origin = String(ctx.raceOrigin ?? '').toLowerCase();
    if (/\bfey\b/.test(origin)) return false;
    if (!origin) return false;
    return true;
  }

  const named = mentionedRaceTokens(p);
  if (!named.length) return false;
  return !named.some((token) => characterIsToken(terms, token));
}

/**
 * @param {string} prereq
 * @param {ThemeEligibilityContext} ctx
 */
function classClauseFails(prereq, ctx) {
  const p = prereq.toLowerCase();
  const wantsDivine = /any divine class/.test(p);
  const wantsArcane = /any arcane class/.test(p);
  const wantsMartial = /any martial class/.test(p);
  const wantsDefender = /defender role/.test(p);
  const wantsWizard = /\bwizard\b/.test(p);
  const wantsSorcerer = /\bsorcerer\b/.test(p);
  const wantsMage = /\bwizard\s*\(\s*mage\s*\)/.test(p);
  if (!(wantsDivine || wantsArcane || wantsMartial || wantsDefender || wantsWizard || wantsSorcerer)) {
    return false;
  }
  const className = String(ctx.className ?? '').trim();
  if (!className) return false;

  const role = String(ctx.role ?? '').toLowerCase();
  const ps = String(ctx.powerSource ?? '').toLowerCase();
  const cn = className.toLowerCase();

  if (wantsDivine && ps && !ps.includes('divine')) return true;
  if (wantsArcane && ps && !ps.includes('arcane')) return true;

  if (wantsMartial || wantsDefender) {
    const martialOk = Boolean(ps) && ps.includes('martial');
    const defenderOk = role.includes('defender');
    if (wantsMartial && wantsDefender) {
      if ((ps || role) && !(martialOk || defenderOk)) return true;
    } else if (wantsMartial && ps && !martialOk) {
      return true;
    } else if (wantsDefender && role && !defenderOk) {
      return true;
    }
  }

  if (wantsWizard || wantsSorcerer) {
    const wizardOk = cn.includes('wizard');
    const sorcererOk = cn.includes('sorcerer');
    if (!wizardOk && !sorcererOk) return true;
    if (wantsMage && wizardOk) {
      const build = String(ctx.buildLabel ?? '').trim().toLowerCase();
      if (build && !/\bmage\b/.test(build)) return true;
    }
  }
  return false;
}

/**
 * @param {string} prereq
 * @param {ThemeEligibilityContext} ctx
 */
function alignmentClauseFails(prereq, ctx) {
  const options = mentionedAlignments(prereq);
  if (!options.length) return false;
  const have = String(ctx.alignment ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!have) return false;
  return !options.includes(have);
}

/**
 * @param {string} prereq
 * @param {ThemeEligibilityContext} ctx
 */
function skillClauseFails(prereq, ctx) {
  const match = prereq.match(/trained in\s+([a-z]+)/i);
  if (!match) return false;
  if (!ctx.hasTrainingData) return false;
  const skill = match[1].toLowerCase();
  const trained = ctx.trainedSkills ?? new Set();
  return !trained.has(skill);
}

/**
 * @param {string} prereq
 * @param {ThemeEligibilityContext} ctx
 */
function spellbookClauseFails(prereq, ctx) {
  if (!/spellbook/i.test(prereq)) return false;
  if (!ctx.hasClassFeatures) return false;
  return !ctx.hasSpellbook;
}

/**
 * @param {string} prereq
 * @returns {string[]}
 */
function mentionedRaceTokens(prereq) {
  let text = prereq.toLowerCase();
  /** @type {string[]} */
  const found = [];
  for (const token of RACE_TOKENS) {
    if (token === 'elf') {
      if (/\belf\b/.test(text.replace(/half-elf/g, ' '))) found.push(token);
      continue;
    }
    if (token === 'shade') {
      if (/\bshade\b/.test(text.replace(/shadar-kai/g, ' '))) found.push(token);
      continue;
    }
    const re = new RegExp(`\\b${token.replace('-', '\\-')}\\b`, 'i');
    if (re.test(text)) found.push(token);
  }
  return found;
}

/**
 * @param {string[]} terms
 * @param {string} token
 */
function characterIsToken(terms, token) {
  return terms.some((term) => {
    const t = String(term ?? '').trim().toLowerCase();
    if (!t) return false;
    if (token === 'elf') return t === 'elf' || /^elf\b/.test(t);
    if (token === 'shade') return t === 'shade' || /^shade\b/.test(t);
    if (token === 'half-elf') return t.includes('half-elf') || t.includes('half elf');
    if (token === 'shadar-kai') return t.includes('shadar-kai') || t.includes('shadar kai');
    return t === token || t.startsWith(`${token} `) || t.startsWith(`${token}(`);
  });
}

/**
 * @param {string} prereq
 * @returns {string[]}
 */
function mentionedAlignments(prereq) {
  let text = prereq.toLowerCase().replace(/\s+/g, ' ');
  /** @type {string[]} */
  const found = [];
  for (const alignment of ALIGNMENTS) {
    if (!text.includes(alignment)) continue;
    found.push(alignment);
    text = text.replaceAll(alignment, ' ');
  }
  return found;
}
