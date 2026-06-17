/**
 * Class compendium parsing and structured preview rendering.
 */

import { SKILLS } from '../formulas.js';
import { escapeHtml as esc } from '../shared/escape-html.js';
import { splitRaceHtmlSections } from './race-parse.js';

const LABELED_BOLD_RE = /<b>\s*([^:<]+):\s*<\/b>\s*([^<]+)/gi;
const BUILD_OPTIONS_RE = /<b>\s*Build Options:?\s*<\/b>\s*([^<]+)/i;
const HYBRID_TALENT_RE = /<b>\s*Hybrid Talent Options:?\s*<\/b>\s*([^<]+)/i;
const CLASS_SKILLS_RE = /<(?:b|i)>\s*Class Skills:?\s*<\/(?:b|i)>\s*([^<]+)/i;
const TRAINED_SKILLS_RE = /<b>\s*Trained Skills:?\s*<\/b>\s*([^<]+)/i;
const HP_AT1_RE = /hit points at 1st level:\s*(\d+)\s*\+\s*constitution\s+score/i;
const HP_PER_LEVEL_RE = /hit points per level gained:\s*(\d+)/i;
const SURGES_RE = /healing surges per day:\s*(\d+)\s*\+\s*constitution\s+modifier/i;
const SPEED_RE = /speed:\s*(\d+)\s*squares?/i;
const DEFENSE_BONUS_RE = /\+\s*(\d+)\s*(fortitude|reflex|will|ac)\b/gi;
const SUGGESTED_SKILLS_RE = /<b>\s*Suggested Skills\s*<\/b>\s*:\s*([^<]+)/i;
const SUGGESTED_AT_WILL_RE = /<b>\s*Suggested At-Will Powers\s*<\/b>\s*:\s*(?:<i>)?\s*([^<]+)/i;
const SUGGESTED_ENCOUNTER_RE = /<b>\s*Suggested Encounter Power\s*<\/b>\s*:\s*(?:<i>)?\s*([^<]+)/i;
const SUGGESTED_DAILY_RE = /<b>\s*Suggested Daily Power\s*<\/b>\s*:\s*(?:<i>)?\s*([^<]+)/i;
const SUGGESTED_FEAT_RE = /<b>\s*Suggested Feat\s*<\/b>\s*:\s*(?:<i>)?\s*([^<]+)/i;

/** @typedef {'fixed' | 'choice' | 'none'} ClassTrainedSkillKind */

/**
 * @param {string} key
 */
export function normalizeClassSkillId(key) {
  const k = String(key ?? '').trim().toLowerCase();
  const ids = SKILLS.map((s) => s.id);
  if (ids.includes(k)) return k;
  const byName = SKILLS.find((s) => s.name.toLowerCase() === k);
  return byName?.id ?? k;
}

/**
 * @param {string} skillId
 */
export function formatSkillLabel(skillId) {
  const skill = SKILLS.find((s) => s.id === skillId);
  return skill?.name ?? skillId;
}

/**
 * @param {string} label
 */
function slugifyOption(label) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * @param {string} text
 */
function normalizeBuildHeadingKey(text) {
  return slugifyOption(String(text ?? '').replace(/\.$/, ''));
}

/**
 * Map each build option id to suggested skill ids from compendium build sections.
 *
 * @param {string} html
 * @param {Array<{ id: string, label?: string }>} buildOptions
 * @returns {Record<string, string[]>}
 */
export function parseBuildSuggestedSkills(html, buildOptions = []) {
  /** @type {Record<string, string[]>} */
  const byBuildId = {};
  if (!html || !buildOptions.length) return byBuildId;

  const sections = String(html).split(/(?=<h3\b)/i);
  for (const section of sections) {
    const headingMatch = section.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!headingMatch) continue;
    const headingKey = normalizeBuildHeadingKey(stripHtml(headingMatch[1]));
    const skillsMatch = section.match(SUGGESTED_SKILLS_RE);
    if (!skillsMatch) continue;
    const skills = parseSkillList(skillsMatch[1]);
    const build = buildOptions.find(
      (o) => normalizeBuildHeadingKey(o.id) === headingKey || normalizeBuildHeadingKey(o.label) === headingKey
    );
    if (build) byBuildId[build.id] = skills;
  }
  return byBuildId;
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
function parseSuggestedPowerNameList(raw) {
  return String(raw ?? '')
    .replace(/<[^>]+>/g, '')
    .split(/,|\bor\b/i)
    .map((part) => part.trim().replace(/\.$/, '').toLowerCase())
    .filter((part) => part.length > 1);
}

/**
 * @param {string} section
 */
function parseSuggestedPowersFromSection(section) {
  return {
    atWill: parseSuggestedPowerNameList(section.match(SUGGESTED_AT_WILL_RE)?.[1]),
    encounter: parseSuggestedPowerNameList(section.match(SUGGESTED_ENCOUNTER_RE)?.[1]),
    daily: parseSuggestedPowerNameList(section.match(SUGGESTED_DAILY_RE)?.[1])
  };
}

/**
 * Map each build option id to suggested power names from compendium build sections.
 *
 * @param {string} html
 * @param {Array<{ id: string, label?: string }>} buildOptions
 * @returns {Record<string, { atWill: string[], encounter: string[], daily: string[] }>}
 */
export function parseBuildSuggestedPowerNames(html, buildOptions = []) {
  /** @type {Record<string, { atWill: string[], encounter: string[], daily: string[] }>} */
  const byBuildId = {};
  if (!html || !buildOptions.length) return byBuildId;

  const sections = String(html).split(/(?=<h3\b)/i);
  for (const section of sections) {
    const headingMatch = section.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!headingMatch) continue;
    const headingKey = normalizeBuildHeadingKey(stripHtml(headingMatch[1]));
    const powers = parseSuggestedPowersFromSection(section);
    if (!powers.atWill.length && !powers.encounter.length && !powers.daily.length) continue;
    const build = buildOptions.find(
      (o) => normalizeBuildHeadingKey(o.id) === headingKey || normalizeBuildHeadingKey(o.label) === headingKey
    );
    if (build) byBuildId[build.id] = powers;
  }
  return byBuildId;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function parseSuggestedFeatName(raw) {
  let text = String(raw ?? '')
    .replace(/<[^>]+>/g, '')
    .trim();
  const paren = text.indexOf('(');
  if (paren >= 0) text = text.slice(0, paren).trim();
  return text.replace(/\.$/, '').trim();
}

/**
 * @param {string} section
 * @returns {string | null}
 */
function parseSuggestedFeatFromSection(section) {
  const raw = section.match(SUGGESTED_FEAT_RE)?.[1];
  const name = raw ? parseSuggestedFeatName(raw) : '';
  return name || null;
}

/**
 * Map each build option id to a suggested feat name from compendium build sections.
 *
 * @param {string} html
 * @param {Array<{ id: string, label?: string }>} buildOptions
 * @returns {Record<string, string>}
 */
export function parseBuildSuggestedFeatNames(html, buildOptions = []) {
  /** @type {Record<string, string>} */
  const byBuildId = {};
  if (!html || !buildOptions.length) return byBuildId;

  const sections = String(html).split(/(?=<h3\b)/i);
  for (const section of sections) {
    const headingMatch = section.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!headingMatch) continue;
    const headingKey = normalizeBuildHeadingKey(stripHtml(headingMatch[1]));
    const featName = parseSuggestedFeatFromSection(section);
    if (!featName) continue;
    const build = buildOptions.find(
      (o) => normalizeBuildHeadingKey(o.id) === headingKey || normalizeBuildHeadingKey(o.label) === headingKey
    );
    if (build) byBuildId[build.id] = featName;
  }
  return byBuildId;
}

/**
 * @param {ReturnType<typeof parseClassEntry>} parsed
 * @param {string | null | undefined} buildOptionId
 * @param {Record<string, string[]>} suggestedByBuild
 */
export function getSuggestedTrainedSkillsForBuild(parsed, buildOptionId, suggestedByBuild) {
  const ts = parsed.trainedSkills;
  if (ts.kind !== 'choice' || ts.chooseCount <= 0 || !buildOptionId) return [];

  const pool = ts.classSkills.length ? ts.classSkills : ts.fixedSkills;
  const fixed = new Set(ts.fixedSkills);
  const raw = suggestedByBuild[buildOptionId] ?? [];
  /** @type {string[]} */
  const filtered = [];

  for (const skillId of raw) {
    if (fixed.has(skillId)) continue;
    if (!pool.includes(skillId)) continue;
    if (filtered.includes(skillId)) continue;
    filtered.push(skillId);
    if (filtered.length >= ts.chooseCount) break;
  }
  return filtered;
}

function stripHtml(html) {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html ?? '';
    return d.textContent.replace(/\s+/g, ' ').trim();
  }
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} html
 */
function extractClassTraitsBlock(html) {
  const s = String(html ?? '');
  const blockquote = s.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i)?.[1];
  if (blockquote) return blockquote;
  const traitsIdx = s.search(/<b>\s*CLASS\s+TRAITS\s*<\/b>/i);
  if (traitsIdx >= 0) return s.slice(traitsIdx);
  return s;
}

/**
 * @param {string} html
 */
function parseLabeledPairs(html) {
  /** @type {Array<{ label: string, value: string }>} */
  const pairs = [];
  const seen = new Set();
  let m;
  const re = new RegExp(LABELED_BOLD_RE.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    const label = m[1].replace(/\s+/g, ' ').trim();
    const value = m[2].replace(/\s+/g, ' ').trim();
    if (!label || /^CLASS TRAITS$/i.test(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ label, value });
  }
  return pairs;
}

/**
 * @param {string} text
 */
function parseDefenseBonuses(text) {
  /** @type {{ ac: number, fort: number, ref: number, will: number }} */
  const out = { ac: 0, fort: 0, ref: 0, will: 0 };
  let m;
  const re = new RegExp(DEFENSE_BONUS_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const amount = Number(m[1]) || 0;
    const def = String(m[2]).toLowerCase();
    if (def === 'fortitude' || def === 'fort') out.fort = amount;
    else if (def === 'reflex' || def === 'ref') out.ref = amount;
    else if (def === 'will') out.will = amount;
    else if (def === 'ac') out.ac = amount;
  }
  return out;
}

/**
 * @param {string} text
 */
function parseSkillList(text) {
  const cleaned = String(text ?? '').replace(/^\s*:+\s*/, '');
  return cleaned
    .split(/,|\band\b/i)
    .map((part) => part.replace(/\(.*?\)/g, '').trim().replace(/[.;]+$/g, ''))
    .map((part) => normalizeClassSkillId(part))
    .filter((id) => SKILLS.some((s) => s.id === id));
}

/**
 * @param {string} trainedText
 * @param {string} classSkillsText
 */
function parseTrainedSkills(trainedText, classSkillsText) {
  const classSkills = parseSkillList(classSkillsText);
  const text = String(trainedText ?? '').trim();

  const chooseMatch =
    text.match(/choose\s+(\w+)\s+more\s+trained\s+skills/i) ||
    text.match(/choose\s+(\w+)\s+trained\s+skills/i);
  const chooseCount = chooseMatch ? wordToNumber(chooseMatch[1]) : 0;

  const fixedPrefix = text.split(/from the class skills/i)[0] ?? text;
  const fixedSkills = parseSkillList(fixedPrefix);

  if (chooseCount > 0) {
    return {
      kind: /** @type {ClassTrainedSkillKind} */ ('choice'),
      fixedSkills,
      classSkills: classSkills.length ? classSkills : fixedSkills,
      chooseCount
    };
  }

  const allFromList = parseSkillList(text);
  if (allFromList.length) {
    return {
      kind: /** @type {ClassTrainedSkillKind} */ ('fixed'),
      fixedSkills: allFromList,
      classSkills: classSkills.length ? classSkills : allFromList,
      chooseCount: 0
    };
  }

  return {
    kind: /** @type {ClassTrainedSkillKind} */ ('none'),
    fixedSkills: [],
    classSkills,
    chooseCount: 0
  };
}

/**
 * @param {string} word
 */
function wordToNumber(word) {
  const map = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const w = String(word ?? '').toLowerCase();
  if (map[w] != null) return map[w];
  const n = Number(w);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {string} optionsText
 */
function parseBuildOptions(optionsText) {
  const text = String(optionsText ?? '').trim();
  if (!text) return [];
  return text
    .split(/,|\bor\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .map((label) => ({ id: slugifyOption(label), label }));
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractPowerIdsFromClassHtml(html) {
  const ids = new Set();
  const re = /\b(power\d+)\b/gi;
  let m;
  while ((m = re.exec(html ?? '')) !== null) {
    ids.add(m[1].toLowerCase());
  }
  return [...ids];
}

/**
 * @param {object | null | undefined} entry
 */
export function parseClassEntry(entry) {
  if (!entry) {
    return emptyParsedClass();
  }

  const html = entry.body_html ?? '';
  const listing = entry.listing_fields ?? {};
  const traitsBlock = extractClassTraitsBlock(html);
  const traitsText = stripHtml(traitsBlock);
  const pairs = parseLabeledPairs(traitsBlock);

  const classSkillsMatch = traitsBlock.match(CLASS_SKILLS_RE);
  const trainedMatch = traitsBlock.match(TRAINED_SKILLS_RE);
  const trainedSkills = parseTrainedSkills(
    trainedMatch?.[1] ?? '',
    classSkillsMatch?.[1] ?? ''
  );

  const buildMatch = traitsBlock.match(BUILD_OPTIONS_RE) ?? traitsBlock.match(HYBRID_TALENT_RE);
  const buildOptions = parseBuildOptions(buildMatch?.[1] ?? '');

  const hpAt1Match = traitsText.match(HP_AT1_RE);
  const hpPerLevelMatch = traitsText.match(HP_PER_LEVEL_RE);
  const surgesMatch = traitsText.match(SURGES_RE);
  const speedMatch = traitsText.match(SPEED_RE);

  const defenseText =
    pairs.find((p) => /bonuses to defenses/i.test(p.label))?.value ?? traitsText;
  const defenseBonuses = parseDefenseBonuses(defenseText);

  const { mechanicalChunks, flavorChunks } = splitRaceHtmlSections(html);

  return {
    title: listing.Name ?? entry.id ?? '',
    role: listing.RoleName ?? pairs.find((p) => /^role$/i.test(p.label))?.value?.split('.')[0]?.trim() ?? '',
    powerSource: listing.PowerSourceText ?? '',
    keyAbilities: listing.KeyAbilities ?? pairs.find((p) => /key abilities/i.test(p.label))?.value ?? '',
    traitPairs: pairs,
    hpAt1Base: hpAt1Match ? Number(hpAt1Match[1]) : null,
    hpPerLevel: hpPerLevelMatch ? Number(hpPerLevelMatch[1]) : null,
    surgesBase: surgesMatch ? Number(surgesMatch[1]) : null,
    baseSpeed: speedMatch ? Number(speedMatch[1]) : null,
    defenseBonuses,
    trainedSkills,
    buildOptions,
    mechanicalHtml: mechanicalChunks.join(''),
    flavorHtml: flavorChunks.join(''),
    bodyHtml: html
  };
}

function emptyParsedClass() {
  return {
    title: '',
    role: '',
    powerSource: '',
    keyAbilities: '',
    traitPairs: [],
    hpAt1Base: null,
    hpPerLevel: null,
    surgesBase: null,
    baseSpeed: null,
    defenseBonuses: { ac: 0, fort: 0, ref: 0, will: 0 },
    trainedSkills: { kind: 'none', fixedSkills: [], classSkills: [], chooseCount: 0 },
    buildOptions: [],
    mechanicalHtml: '',
    flavorHtml: '',
    bodyHtml: ''
  };
}

/**
 * @param {ReturnType<typeof parseClassEntry>} parsed
 * @param {string[]} [previewTerms]
 */
function filterFeatureSections(parsed, previewTerms = []) {
  if (!previewTerms.length) return parsed.flavorHtml;
  const parts = String(parsed.flavorHtml ?? '').split(/(?=<h3\b)/i);
  const filtered = parts.filter((part) => {
    const heading = stripHtml(part.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '');
    if (!heading) return true;
    return previewTerms.some((term) => heading.toLowerCase().includes(term.toLowerCase()));
  });
  return filtered.join('');
}

/**
 * @param {object | null | undefined} entry
 * @param {ReturnType<typeof parseClassEntry>} parsed
 * @param {object} [opts]
 * @param {Record<string, string>} [opts.buildChoices]
 * @param {string[]} [opts.trainedSkillChoices]
 * @param {string[]} [opts.previewTerms]
 */
export function renderClassPreviewHtml(entry, parsed, opts = {}) {
  const buildChoices = opts.buildChoices ?? {};
  const trainedSkillChoices = opts.trainedSkillChoices ?? [];
  const previewTerms = opts.previewTerms ?? [];

  const traitRows = parsed.traitPairs
    .filter((p) => !/^(build options|class skills|trained skills)$/i.test(p.label))
    .map(
      (p) =>
        `<div class="class-trait-row"><span class="class-trait-label">${esc(p.label)}</span> <span class="class-trait-value">${esc(p.value)}</span></div>`
    )
    .join('');

  let buildSection = '';
  if (parsed.buildOptions.length) {
    const picked = buildChoices.build ?? null;
    const buttons = parsed.buildOptions
      .map((opt) => {
        const selected = picked === opt.id;
        return `<button type="button" class="race-choice-btn class-build-btn${selected ? ' race-choice-btn--selected' : ''}" data-build-id="${esc(opt.id)}" aria-pressed="${selected ? 'true' : 'false'}">${esc(opt.label)}</button>`;
      })
      .join('');
    const status = picked
      ? `Selected: ${esc(parsed.buildOptions.find((o) => o.id === picked)?.label ?? picked)}`
      : 'Choose a build option below.';
    buildSection = `<section class="background-effect-section class-build-section">
      <h3 class="background-section-title">Build Options</h3>
      <div class="race-inline-choices class-build-choices" data-choice-guide="class-build" id="choice-guide-class-build">${buttons}</div>
      <p class="class-build-status">${status}</p>
    </section>`;
  }

  let skillSection = '';
  const ts = parsed.trainedSkills;
  if (ts.kind === 'choice' && ts.chooseCount > 0) {
    const pool = ts.classSkills.length ? ts.classSkills : ts.fixedSkills;
    const buttons = pool
      .map((skillId) => {
        const selected = trainedSkillChoices.includes(skillId);
        return `<button type="button" class="race-choice-btn class-skill-btn${selected ? ' race-choice-btn--selected' : ''}" data-skill="${esc(skillId)}" aria-pressed="${selected ? 'true' : 'false'}">${esc(formatSkillLabel(skillId))}</button>`;
      })
      .join('');
    const fixedNote =
      ts.fixedSkills.length > 0
        ? `Fixed: ${ts.fixedSkills.map(formatSkillLabel).join(', ')}. `
        : '';
    const status =
      trainedSkillChoices.length >= ts.chooseCount
        ? `Selected: ${trainedSkillChoices.map(formatSkillLabel).join(', ')}`
        : `Choose ${ts.chooseCount} trained skill${ts.chooseCount === 1 ? '' : 's'}.`;
    skillSection = `<section class="background-effect-section class-skill-section">
      <h3 class="background-section-title">Trained Skills</h3>
      <p class="class-skill-note">${esc(fixedNote)}${esc(status)}</p>
      <div class="race-inline-choices class-skill-choices" data-choice-guide="class-skill" data-choose-count="${ts.chooseCount}" id="choice-guide-class-skill">${buttons}</div>
    </section>`;
  } else if (ts.kind === 'fixed' && ts.fixedSkills.length) {
    skillSection = `<section class="background-effect-section class-skill-section">
      <h3 class="background-section-title">Trained Skills</h3>
      <p class="class-skill-readout">${esc(ts.fixedSkills.map(formatSkillLabel).join(', '))}</p>
    </section>`;
  }

  const featureHtml = filterFeatureSections(parsed, previewTerms);

  return `<div class="class-preview">
    <h2 class="class-preview-title">${esc(parsed.title)}</h2>
    <section class="class-traits-section">
      <h3 class="background-section-title">Class Traits</h3>
      ${traitRows}
    </section>
    ${buildSection}
    ${skillSection}
    ${featureHtml ? `<section class="class-features-section">${featureHtml}</section>` : ''}
  </div>`;
}

/**
 * @param {object | null | undefined} entry
 * @param {ReturnType<typeof parseClassEntry>} parsed
 * @param {object} [choices]
 * @param {Record<string, string>} [choices.buildChoices]
 * @param {string[]} [choices.trainedSkillChoices]
 * @param {string[]} [choices.buildSummary]
 */
export function buildClassNotesText(entry, parsed, choices = {}) {
  const lines = [];
  const buildSummary = choices.buildSummary ?? [];
  for (const s of buildSummary) lines.push(s);

  for (const p of parsed.traitPairs) {
    if (/^(build options|class skills)$/i.test(p.label)) continue;
    if (/^trained skills$/i.test(p.label)) {
      const fixed = parsed.trainedSkills.fixedSkills.map(formatSkillLabel);
      const picked = (choices.trainedSkillChoices ?? []).map(formatSkillLabel);
      const all = [...fixed, ...picked];
      if (all.length) lines.push(`Trained Skills: ${all.join(', ')}`);
      continue;
    }
    lines.push(`${p.label}: ${p.value}`);
  }

  if (parsed.hpAt1Base != null) {
    lines.push(`HP at 1: ${parsed.hpAt1Base} + Constitution`);
  }
  if (parsed.surgesBase != null) {
    lines.push(`Healing Surges: ${parsed.surgesBase} + Constitution modifier`);
  }

  const d = parsed.defenseBonuses;
  const defParts = [];
  if (d.fort) defParts.push(`+${d.fort} Fortitude`);
  if (d.ref) defParts.push(`+${d.ref} Reflex`);
  if (d.will) defParts.push(`+${d.will} Will`);
  if (d.ac) defParts.push(`+${d.ac} AC`);
  if (defParts.length) lines.push(`Defense Bonuses: ${defParts.join(', ')}`);

  return lines.join('\n');
}
