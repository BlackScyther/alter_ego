/**
 * Parse iws.mx race HTML into mechanics, flavor, grants, and compact notes.
 */

import { formatMechanicalValue } from '../shared/imperial-metric.js';
import { escapeHtml as esc } from '../shared/escape-html.js';
import { ABILITY_KEYS, bonusesFromEntry, parseRaceBonusDecisions } from './tutor.js';
import { parsePowerAbilityOptions, parsePowerDamageOptions } from './power-ability-parse.js';
import { getCuratedReplacements } from './race-replacements.js';

const ABILITY_DISPLAY = {
  str: 'Strength',
  con: 'Constitution',
  dex: 'Dexterity',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma'
};

function isAbilityScoreLabel(label) {
  const n = normalizeLabel(label);
  return n === 'ability scores' || n === 'ability bonus' || n === 'ability bonuses';
}

/**
 * @param {string} ability
 * @param {number} amount
 */
function formatAbilityBonusLine(ability, amount) {
  const name = ABILITY_DISPLAY[ability] ?? String(ability ?? '').toUpperCase();
  return `+${amount} ${name}`;
}

/** Labels omitted from compact notes text only. */
const SKIP_NOTE_LABELS = new Set([
  'average height',
  'average weight',
  'racial traits',
  'characteristics',
  'male names',
  'female names',
  'male/female names'
]);

const MECHANICAL_LABELS = new Set([
  'ability scores',
  'ability bonus',
  'ability bonuses',
  'size',
  'speed',
  'vision',
  'languages',
  'skill bonuses',
  'skill bonus',
  'average height',
  'average weight'
]);

const FLAVOR_H3_RE =
  /^(?:physical qualities|playing a\b|roleplaying a\b|roleplaying\b|characteristics|flavor|history|legends|lore)\b/i;

const MECHANICAL_H3_RE = /\bbenefits?\b|\btraits?\b|\bfeatures?\b|\bbuild options?\b/i;

function stripHtml(html) {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html ?? '';
    return d.textContent.replace(/\s+/g, ' ').trim();
  }
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeLabel(label) {
  return String(label ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isMechanicalH3Heading(headingText) {
  const h = String(headingText ?? '').trim();
  if (!h) return false;
  if (FLAVOR_H3_RE.test(h)) return false;
  if (MECHANICAL_H3_RE.test(h)) return true;
  return false;
}

/**
 * Split race HTML into mechanical chunks vs long-form flavor chunks.
 * @param {string} html
 */
export function splitRaceHtmlSections(html) {
  const s = String(html ?? '');
  /** @type {string[]} */
  const mechanicalChunks = [];
  /** @type {string[]} */
  const flavorChunks = [];

  const parts = s.split(/(?=<h3\b)/i);
  if (parts[0]?.trim()) {
    mechanicalChunks.push(parts[0]);
  }

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const heading = part.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '';
    if (isMechanicalH3Heading(stripHtml(heading))) {
      mechanicalChunks.push(part);
    } else {
      flavorChunks.push(part);
    }
  }

  return { mechanicalChunks, flavorChunks };
}

/** @deprecated use splitRaceHtmlSections */
export function splitFlavorSections(html) {
  const { mechanicalChunks, flavorChunks } = splitRaceHtmlSections(html);
  return {
    mechanicsHtml: mechanicalChunks.join(''),
    flavorHtml: flavorChunks.join('')
  };
}

/**
 * @param {string} label
 * @param {string} value
 * @param {{ forNotes?: boolean }} opts
 */
function classifyPair(label, value, opts = {}) {
  const norm = normalizeLabel(label);
  if (!label || !value) return null;
  if (opts.forNotes && SKIP_NOTE_LABELS.has(norm)) return null;

  const displayValue = formatMechanicalValue(label, value);
  if (MECHANICAL_LABELS.has(norm) || norm.includes('average height') || norm.includes('average weight')) {
    return { kind: 'pair', label, value, displayValue, norm };
  }
  return { kind: 'feature', label, value, displayValue: value.trim(), norm };
}

/**
 * @param {string} html
 * @param {Map<string, object>} pairByNorm
 * @param {Map<string, object>} featureByNorm
 * @param {{ forNotes?: boolean }} opts
 */
function ingestLabeledPairsFromHtml(html, pairByNorm, featureByNorm, opts) {
  const head = String(html ?? '');

  const boldRe = /<b>([^<:]+):<\/b>\s*([^<]+)/gi;
  let m;
  while ((m = boldRe.exec(head)) !== null) {
    const classified = classifyPair(m[1].replace(/\s+/g, ' ').trim(), m[2].replace(/\s+/g, ' ').trim(), opts);
    if (!classified) continue;
    if (classified.kind === 'pair') pairByNorm.set(classified.norm, classified);
    else featureByNorm.set(classified.norm, classified);
  }

  const lineHtml = head.replace(/<br\s*\/?>/gi, '\n');
  const plain = stripHtml(lineHtml);
  for (const rawLine of plain.split(/\n+/)) {
    const line = rawLine.trim();
    const lineMatch = line.match(/^([^:]{2,80}):\s*(.+)$/);
    if (!lineMatch) continue;
    const classified = classifyPair(lineMatch[1].trim(), lineMatch[2].trim(), opts);
    if (!classified) continue;
    const map = classified.kind === 'pair' ? pairByNorm : featureByNorm;
    if (!map.has(classified.norm)) map.set(classified.norm, classified);
  }
}

/**
 * Extract short trait names from span.power blocks when no explicit label pair exists.
 * @param {string} html
 * @param {Map<string, object>} featureByNorm
 */
function ingestPowerSpanFeatures(html, featureByNorm) {
  const re = /<span[^>]*class\s*=\s*["']?power["']?[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html ?? '')) !== null) {
    const inner = m[1];
    const name = stripHtml(inner.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? inner)
      .split(/\n/)[0]
      ?.trim();
    if (!name || name.length < 3) continue;
    const norm = normalizeLabel(name);
    if (featureByNorm.has(norm)) continue;
    featureByNorm.set(norm, {
      kind: 'feature',
      label: name,
      value: stripHtml(inner).slice(0, 160),
      displayValue: stripHtml(inner).slice(0, 160),
      norm
    });
  }
}

/**
 * @param {object | null | undefined} entry
 */
function ingestStructuredAbilityBonuses(entry, pairByNorm) {
  if (!Array.isArray(entry?.ability_bonuses) || pairByNorm.has('ability scores') || pairByNorm.has('ability bonus')) {
    return;
  }
  const parts = [];
  for (const b of entry.ability_bonuses) {
    if (b.ability === 'any') {
      parts.push(`+${b.amount} to one ability score of your choice`);
    } else {
      const name = String(b.ability ?? '').toUpperCase();
      parts.push(`+${b.amount} ${name}`);
    }
  }
  if (parts.length) {
    pairByNorm.set('ability scores', {
      kind: 'pair',
      label: 'Ability scores',
      value: parts.join(', '),
      displayValue: parts.join(', '),
      norm: 'ability scores'
    });
  }
}

/**
 * @param {string | object | null | undefined} source
 * @param {{ forNotes?: boolean }} [opts]
 */
export function parseRaceMechanics(source, opts = {}) {
  const html = typeof source === 'string' ? source : source?.body_html ?? '';
  const entry = typeof source === 'object' && source ? source : null;
  const { mechanicalChunks } = splitRaceHtmlSections(html);
  const scanHtml = mechanicalChunks.length ? mechanicalChunks.join('') : html;

  const text = stripHtml(scanHtml);
  const isCoreRace =
    /<b>\s*RACIAL\s+TRAITS\s*<\/b>/i.test(scanHtml) ||
    /average\s+height/i.test(text) ||
    /average\s+weight/i.test(text);

  /** @type {Map<string, { kind: string, label: string, value: string, displayValue: string, norm: string }>} */
  const pairByNorm = new Map();
  /** @type {Map<string, { kind: string, label: string, value: string, displayValue: string, norm: string }>} */
  const featureByNorm = new Map();

  ingestLabeledPairsFromHtml(scanHtml, pairByNorm, featureByNorm, opts);
  ingestPowerSpanFeatures(scanHtml, featureByNorm);
  if (entry) ingestStructuredAbilityBonuses(entry, pairByNorm);

  const pairs = [...pairByNorm.values()];
  const features = [...featureByNorm.values()];

  return {
    isCoreRace,
    pairs,
    features,
    /** @deprecated use features */
    featureNames: features.map((f) => f.label),
    headHtml: scanHtml
  };
}

/**
 * Merge base + variant mechanics; variant overrides same label.
 * @param {ReturnType<typeof parseRaceMechanics>} base
 * @param {ReturnType<typeof parseRaceMechanics> | null} variant
 */
export function mergeRaceMechanics(base, variant) {
  const pairMap = new Map(base.pairs.map((p) => [p.norm, p]));
  const featureMap = new Map(base.features.map((f) => [f.norm, f]));
  if (variant) {
    for (const p of variant.pairs) pairMap.set(p.norm, p);
    for (const f of variant.features) featureMap.set(f.norm, f);
  }
  return {
    pairs: [...pairMap.values()],
    features: [...featureMap.values()]
  };
}

/**
 * @param {Array<{ label: string, value: string, displayValue?: string }>} pairs
 */
export function formatAverageHeightWeight(pairs) {
  return pairs
    .filter((p) => {
      const n = normalizeLabel(p.label);
      return n.includes('average height') || n.includes('average weight');
    })
    .map((p) => `${p.label}: ${p.displayValue ?? formatMechanicalValue(p.label, p.value)}`);
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractPowerIdsFromRaceHtml(html) {
  const ids = new Set();
  const re = /\b(power\d+)\b/gi;
  let m;
  while ((m = re.exec(html ?? '')) !== null) {
    ids.add(m[1].toLowerCase());
  }
  return [...ids];
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractFeatIdsFromRaceHtml(html) {
  const ids = new Set();
  const re = /\b(feat\d+)\b/gi;
  let m;
  while ((m = re.exec(html ?? '')) !== null) {
    ids.add(m[1].toLowerCase());
  }
  return [...ids];
}

function stripPowerBlocks(html) {
  return (
    String(html ?? '')
      // Full embedded power cards: <h1 class=encounterpower>… up to the next
      // heading (or end). Their stat lines must never leak into benefit rows.
      .replace(
        /<h1[^>]*class\s*=\s*["']?[^"'>\s]*power[^"'>\s]*["']?[^>]*>[\s\S]*?(?=<h1\b|<h2\b|<h3\b|$)/gi,
        ''
      )
      .replace(/<span[^>]*class\s*=\s*power[^>]*>[\s\S]*?<\/span>/gi, '')
  );
}

function truncateFlavor(text, max = 80) {
  const t = String(text ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

const GRANT_ID_RE = /^(power\d+|feat\d+)$/i;

/**
 * @param {string} label
 * @param {string} value
 * @param {Map<string, string>} grantNameMap
 */
function makeBenefitRow(label, value, grantNameMap, opts = {}) {
  const norm = normalizeLabel(label);
  if (!label || !value || norm === 'racial traits') return null;
  if (opts.skipAbilityRows && isAbilityScoreLabel(label)) return null;

  const trimmed = value.trim();
  const grantMatch = trimmed.match(GRANT_ID_RE);
  const grantId = grantMatch?.[1]?.toLowerCase();
  const displayValue = grantId
    ? grantNameMap.get(grantId) ?? grantId
    : formatMechanicalValue(label, trimmed);

  return { label, value: trimmed, displayValue, grantId };
}

/**
 * Normalize block/paragraph markup so each benefit field can be parsed on its own line.
 * @param {string} html
 */
function normalizeBenefitHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n');
}

/**
 * Extract plain-text "Label: value" pairs, including multiple fields on one line.
 * @param {string} plain
 * @param {Map<string, string>} grantNameMap
 * @param {Set<string>} seen
 * @param {Array<{ label: string, value: string, displayValue: string, grantId?: string }>} rows
 */
function extractPlainBenefitRows(plain, grantNameMap, seen, rows, opts = {}) {
  const fieldRe = /\b([A-Z][^\n:]{1,58}?):\s*([\s\S]*?)(?=\s+\b[A-Z][^\n:]{1,58}:\s|$)/g;
  let m;
  while ((m = fieldRe.exec(plain)) !== null) {
    pushBenefitRow(rows, makeBenefitRow(m[1].trim(), m[2].trim(), grantNameMap, opts), seen);
  }
}

/**
 * @param {Array<{ label: string, value: string, displayValue: string, grantId?: string }>} rows
 * @param {{ label: string, value: string, displayValue: string, grantId?: string } | null} row
 * @param {Set<string>} seen
 */
function pushBenefitRow(rows, row, seen) {
  if (!row) return;
  const key = row.label.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(row);
}

/**
 * @param {string} html
 * @param {Map<string, string>} grantNameMap
 */
function extractRowsFromHtml(html, grantNameMap, opts = {}) {
  /** @type {Array<{ label: string, value: string, displayValue: string, grantId?: string }>} */
  const rows = [];
  const seen = new Set();
  const head = normalizeBenefitHtml(html);

  for (const rawLine of head.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const boldM = line.match(/<(?:b|strong)>([^<:]+):<\/(?:b|strong)>\s*([\s\S]*)$/i);
    if (boldM) {
      const value = stripHtml(boldM[2]);
      pushBenefitRow(
        rows,
        makeBenefitRow(boldM[1].replace(/\s+/g, ' ').trim(), value, grantNameMap, opts),
        seen
      );
      continue;
    }

    const plainLine = stripHtml(line);
    if (!plainLine) continue;
    extractPlainBenefitRows(plainLine, grantNameMap, seen, rows, opts);
  }

  return rows;
}

/**
 * @param {object | null | undefined} entry
 * @param {{ ability?: Record<string, string>, skill?: Record<string, string> }} [raceBonusChoices]
 */
export function buildAbilityScoreBenefitModel(entry, raceBonusChoices = {}) {
  if (!entry) return null;
  const { ability } = bonusesFromEntry(entry, 'race');
  const decisions = parseRaceBonusDecisions(entry).filter((d) => d.kind === 'ability');
  const fixed = ability.filter((b) => !b.choiceGroup);

  if (!decisions.length) {
    if (!fixed.length) return null;
    return {
      type: 'static',
      lines: fixed.map((b) => formatAbilityBonusLine(b.ability, b.amount))
    };
  }

  return {
    type: 'choice',
    fixed: fixed.map((b) => ({ ability: b.ability, amount: b.amount })),
    decisions
  };
}

/**
 * @param {object | null | undefined} entry
 * @param {{ ability?: Record<string, string>, skill?: Record<string, string> }} [raceBonusChoices]
 */
export function formatResolvedAbilityNotes(entry, raceBonusChoices = {}) {
  const model = buildAbilityScoreBenefitModel(entry, raceBonusChoices);
  if (!model) return null;

  if (model.type === 'static') {
    return `Ability scores: ${model.lines.join(', ')}`;
  }

  const parts = [];
  for (const f of model.fixed) {
    parts.push(formatAbilityBonusLine(f.ability, f.amount));
  }
  for (const d of model.decisions) {
    const picked = raceBonusChoices?.ability?.[d.choiceGroup];
    if (!picked) continue;
    const anyOpt = d.options.find((o) => o.ability === 'any');
    const amount = anyOpt?.amount ?? d.options.find((o) => o.ability === picked)?.amount ?? 2;
    parts.push(formatAbilityBonusLine(picked, amount));
  }
  return parts.length ? `Ability scores: ${parts.join(', ')}` : null;
}

/**
 * @param {Array<{ heading: string, rows: Array<object> }>} sections
 * @param {object} entry
 * @param {{ ability?: Record<string, string> }} [raceBonusChoices]
 */
function applyAbilityModelToSection(section, model, _raceBonusChoices) {
  if (!model) return;

  section.rows = section.rows.filter((r) => !isAbilityScoreLabel(r.label));

  const weightIdx = section.rows.findIndex((r) => normalizeLabel(r.label).includes('average weight'));
  const heightIdx = section.rows.findIndex((r) => normalizeLabel(r.label).includes('average height'));
  const insertIdx = weightIdx >= 0 ? weightIdx + 1 : heightIdx >= 0 ? heightIdx + 1 : 0;

  section.rows.splice(insertIdx, 0, {
    label: 'Ability scores',
    value: '',
    displayValue: '',
    abilityModel: model
  });
}

/**
 * @param {Array<{ heading: string, rows: Array<object> }>} sections
 * @param {object} entry
 */
function injectListingFieldsSize(sections, entry) {
  const size = entry?.listing_fields?.Size;
  if (!size || !sections.length) return;

  for (const section of sections) {
    const idx = section.rows.findIndex((r) => normalizeLabel(r.label) === 'size');
    const row = { label: 'Size', value: size, displayValue: size };
    if (idx >= 0) {
      section.rows[idx] = row;
    } else {
      const abilityIdx = section.rows.findIndex(
        (r) => r.abilityModel || isAbilityScoreLabel(r.label)
      );
      const insertAt = abilityIdx >= 0 ? abilityIdx + 1 : section.rows.length;
      section.rows.splice(insertAt, 0, row);
    }
  }
}

/**
 * Strip non-benefit markup from pre-h3 content (titles, taglines, flavor leads).
 * @param {string} html
 */
function stripNonBenefitPreH3(html) {
  return String(html ?? '')
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '')
    .replace(/<i>[\s\S]*?<\/i>/gi, '')
    .replace(/<p[^>]*class\s*=\s*["']?flavor["']?[^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/<p[^>]*>(\s*A\s+[^<]{20,})<\/p>/gi, '');
}

/**
 * @param {string} html
 * @param {{ raceName?: string, grantNameMap?: Map<string, string>, entry?: object | null, raceBonusChoices?: { ability?: Record<string, string> }, applyAbilityModel?: boolean }} [opts]
 * @returns {Array<{ heading: string, rows: Array<{ label: string, value: string, displayValue: string, grantId?: string }> }>}
 */
export function extractBenefitSections(html, opts = {}) {
  const raceName = opts.raceName ?? 'Race';
  const grantNameMap = opts.grantNameMap ?? new Map();
  const abilityModel = opts.applyAbilityModel
    ? buildAbilityScoreBenefitModel(opts.entry, opts.raceBonusChoices ?? {})
    : null;
  const rowOpts = { skipAbilityRows: Boolean(abilityModel) };
  /** @type {Array<{ heading: string, rows: ReturnType<typeof extractRowsFromHtml> }>} */
  const sections = [];

  let work = stripPowerBlocks(String(html ?? ''));
  const parts = work.split(/(?=<h3\b)/i);

  if (parts[0]?.trim()) {
    const benefitsHtml = stripNonBenefitPreH3(parts[0]);
    const rows = extractRowsFromHtml(benefitsHtml, grantNameMap, rowOpts);
    if (rows.length) sections.push({ heading: `${raceName} Benefits`, rows });
  }

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const heading = stripHtml(part.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '');
    if (!isMechanicalH3Heading(heading)) continue;
    const bodyHtml = part.replace(/^<h3[^>]*>[\s\S]*?<\/h3>/i, '');
    const rows = extractRowsFromHtml(bodyHtml, grantNameMap, rowOpts);
    if (rows.length) sections.push({ heading, rows });
  }

  if (opts.entry && sections.length) {
    injectListingFieldsSize(sections, opts.entry);
    if (abilityModel) {
      applyAbilityModelToSection(sections[0], abilityModel, opts.raceBonusChoices ?? {});
    }
  }

  return sections;
}

/**
 * @param {string} html
 * @param {string[]} [previewTerms]
 * @returns {Array<{ summary: string, bodyHtml: string }>}
 */
export function extractFlavorFolds(html, previewTerms = []) {
  let work = stripSelectedPowerSections(String(html ?? ''), previewTerms);
  /** @type {Array<{ summary: string, bodyHtml: string }>} */
  const folds = [];
  const seen = new Set();

  const parts = work.split(/(?=<h3\b)/i);
  const preH3 = parts[0] ?? '';

  const flavorLeadRe = /<p(\s[^>]*)?class\s*=\s*["']?flavor["']?([^>]*)>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = flavorLeadRe.exec(preH3)) !== null) {
    const text = stripHtml(m[3]);
    if (!/^A\s+\S/i.test(text) || text.length < 20) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    folds.push({
      summary: truncateFlavor(text, 60),
      bodyHtml: decorateFlavorLead(m[0])
    });
  }

  const plainARe = /<p([^>]*)>(\s*A\s+[^<]{20,})<\/p>/gi;
  while ((m = plainARe.exec(preH3)) !== null) {
    if (/class\s*=\s*["']?flavor["']?/i.test(m[1])) continue;
    const text = m[2].trim();
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    folds.push({
      summary: truncateFlavor(text, 60),
      bodyHtml: decorateFlavorLead(m[0])
    });
  }

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const heading = stripHtml(part.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '');
    if (isMechanicalH3Heading(heading)) continue;
    const key = heading.toLowerCase() || stripHtml(part).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    folds.push({
      summary: heading || truncateFlavor(stripHtml(part), 60),
      bodyHtml: decorateFlavorLead(part)
    });
  }

  return folds;
}

/**
 * True when a paragraph reads like a stat-block line (HP/AC/Speed/DC/attack…)
 * rather than descriptive prose. Conservative: keep prose, drop numbers.
 * @param {string} text
 */
function looksLikeMonsterStatLine(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (
    /\b(HP|AC|Fortitude|Fort|Reflex|Ref|Will|Initiative|Init|Speed|Senses?|Perception|Insight|Immune|Resist|Vulnerable|Saving Throws?|Action Points?|Alignment|Languages?|Skills?|Equipment|XP|Recharge|Aura|Bloodied|Str|Dex|Con|Int|Wis|Cha)\b\s*[:\-]?\s*[+\-]?\d/i.test(t)
  ) {
    return true;
  }
  if (/\bDC\s*\d/i.test(t)) return true;
  if (/\bvs\.?\s*(AC|Fortitude|Reflex|Will)\b/i.test(t)) return true;
  if (/\b(Level|level)\s+\d+\b/.test(t) && t.length < 60) return true;
  const digits = (t.match(/\d/g) || []).length;
  if (t.length && digits / t.length > 0.15) return true;
  return false;
}

/** Descriptive-prose test for a monster paragraph. */
function isMonsterProseParagraph(text) {
  const t = String(text ?? '').trim();
  if (t.split(/\s+/).filter(Boolean).length < 6) return false;
  return !looksLikeMonsterStatLine(t);
}

/**
 * Extract FLAVOR-ONLY folds from a monster entry, for use as supplemental lore
 * on a monster race's preview. Statistics, power/attack blocks, tables, and
 * stat-line paragraphs are stripped; only descriptive prose is kept. Returns at
 * most one collapsed fold, summarized by the monster name. Best-effort: returns
 * [] when no prose is found.
 * @param {{ listing_fields?: { Name?: string }, name?: string, body_html?: string } | null | undefined} monsterEntry
 * @returns {Array<{ summary: string, bodyHtml: string }>}
 */
export function extractMonsterFlavorFolds(monsterEntry) {
  if (!monsterEntry) return [];
  const name = monsterEntry.listing_fields?.Name ?? monsterEntry.name ?? 'Monster';
  let html = String(monsterEntry.body_html ?? '');
  if (!html) return [];
  html = stripPowerBlocks(html);
  html = html.replace(/<table[\s\S]*?<\/table>/gi, '');

  const kept = [];
  const seen = new Set();
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(html)) !== null) {
    const text = stripHtml(m[1]);
    if (!isMonsterProseParagraph(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(`<p>${m[1]}</p>`);
    if (kept.length >= 12) break;
  }

  if (!kept.length) return [];
  return [
    {
      summary: `${name} (monster lore)`,
      bodyHtml: `<div class="race-monster-flavor">${kept.join('')}</div>`
    }
  ];
}

/**
 * @param {object} decision
 * @param {string} picked
 */
function renderInlineChoiceButtons(decision, picked) {
  const anchorId = `choice-guide-race-bonus-${decision.kind}-${decision.choiceGroup}`;
  const anyOpt = decision.options.find((o) => o.ability === 'any');

  // "Any one ability" decisions offer all six scores. A grid of six buttons is
  // bulky, so collapse it into a compact combo picker. Limited choices (a small
  // set of specific abilities) stay as buttons for at-a-glance visibility.
  if (anyOpt) {
    const selectId = `${anchorId}-select`;
    const parts = [
      `<div class="race-inline-choices race-inline-choices--combo" data-choice-guide="race-bonus" id="${esc(anchorId)}" data-kind="${esc(decision.kind)}" data-choice-group="${esc(decision.choiceGroup)}">`,
      `<select class="race-choice-combo" id="${esc(selectId)}" aria-label="Choose ability bonus (+${anyOpt.amount})">`,
      `<option value="">Choose ability… (+${anyOpt.amount})</option>`
    ];
    for (const key of ABILITY_KEYS) {
      const selected = picked === key ? ' selected' : '';
      const label = ABILITY_DISPLAY[key] ?? key.toUpperCase();
      parts.push(`<option value="${esc(key)}"${selected}>${esc(label)} +${anyOpt.amount}</option>`);
    }
    parts.push('</select>', '</div>');
    return parts.join('');
  }

  const parts = [
    `<div class="race-inline-choices" data-choice-guide="race-bonus" id="${esc(anchorId)}" data-kind="${esc(decision.kind)}" data-choice-group="${esc(decision.choiceGroup)}">`
  ];
  const seen = new Set();
  for (const opt of decision.options) {
    if (!opt.ability || opt.ability === 'any' || seen.has(opt.ability)) continue;
    seen.add(opt.ability);
    const selected = picked === opt.ability ? ' race-choice-btn--selected' : '';
    parts.push(
      `<button type="button" class="race-choice-btn${selected}" data-value="${esc(opt.ability)}">${esc(String(opt.ability).toUpperCase())} +${opt.amount}</button>`
    );
  }
  parts.push('</div>');
  return parts.join('');
}

/**
 * @param {object} row
 * @param {{ ability?: Record<string, string> }} raceBonusChoices
 */
function renderAbilityScoreBenefitItem(row, raceBonusChoices) {
  const model = row.abilityModel;
  const parts = [
    '<li class="race-benefit-item race-benefit-ability">',
    '<span class="race-benefit-label">Ability scores:</span>',
    '<ul class="race-ability-lines">'
  ];

  if (model.type === 'static') {
    for (const line of model.lines) {
      parts.push(`<li>${esc(line)}</li>`);
    }
  } else {
    for (const f of model.fixed) {
      parts.push(`<li>${esc(formatAbilityBonusLine(f.ability, f.amount))}</li>`);
    }
    for (const d of model.decisions) {
      const picked = raceBonusChoices?.ability?.[d.choiceGroup] ?? '';
      if (picked) {
        const anyOpt = d.options.find((o) => o.ability === 'any');
        const amount = anyOpt?.amount ?? d.options.find((o) => o.ability === picked)?.amount ?? 2;
        parts.push(`<li>${esc(formatAbilityBonusLine(picked, amount))}</li>`);
      } else {
        parts.push(`<li class="race-ability-choices-wrap">${renderInlineChoiceButtons(d, picked)}</li>`);
      }
    }
  }

  parts.push('</ul>', '</li>');
  return parts.join('');
}

/**
 * @param {Array<{ heading: string, rows: Array<{ label: string, displayValue?: string, value: string }> }>} sections
 * @param {{ ability?: Record<string, string> }} [raceBonusChoices]
 */
function renderBenefitSectionsBlock(sections, raceBonusChoices = {}) {
  if (!sections.length) return '';
  const parts = ['<div class="race-benefits">'];
  for (const sec of sections) {
    parts.push(`<h3 class="race-benefits-heading">${esc(sec.heading)}</h3>`);
    parts.push('<ul class="race-benefits-list">');
    for (const row of sec.rows) {
      if (row.abilityModel) {
        parts.push(renderAbilityScoreBenefitItem(row, raceBonusChoices));
        continue;
      }
      const value = row.displayValue ?? row.value;
      const valueHtml = row.grantId
        ? `<span class="race-benefit-grant-ref">${esc(value)}</span>`
        : esc(value);
      parts.push(
        `<li class="race-benefit-item"><span class="race-benefit-label">${esc(row.label)}:</span> ${valueHtml}</li>`
      );
    }
    parts.push('</ul>');
  }
  parts.push('</div>');
  return parts.join('');
}

/**
 * Render the player's per-power ability-score choice (e.g. a racial power whose
 * attack can use Strength, Dexterity, or Constitution). The available options
 * come from the power entry; the pick is a per-character selection.
 * @param {string} powerId
 * @param {{ choiceGroup: string, options: Array<{ ability: string }> }} options
 * @param {string} picked
 */
function renderPowerAbilityChoice(powerId, options, picked) {
  if (!options?.options?.length) return '';
  const selectId = `race-power-ability-${esc(powerId)}`;
  const parts = [
    `<div class="race-power-ability" data-power-id="${esc(powerId)}" data-choice-group="${esc(options.choiceGroup)}">`,
    `<label class="race-power-ability-label" for="${selectId}">Power ability</label>`,
    `<select class="race-choice-combo race-power-ability-combo" id="${selectId}" aria-label="Choose the ability score for this power">`,
    `<option value="">Choose ability…</option>`
  ];
  for (const opt of options.options) {
    const key = opt.ability;
    const selected = picked === key ? ' selected' : '';
    const label = ABILITY_DISPLAY[key] ?? String(key).toUpperCase();
    parts.push(`<option value="${esc(key)}"${selected}>${esc(label)}</option>`);
  }
  parts.push('</select>', '</div>');
  return parts.join('');
}

/**
 * Render the player's per-power damage-type choice (e.g. Dragon Breath whose
 * damage can be acid, cold, fire, lightning, or poison). Options come from the
 * power entry; the pick is a per-character selection.
 * @param {string} powerId
 * @param {{ choiceGroup: string, options: Array<{ damageType: string }> }} options
 * @param {string} picked
 */
function renderPowerDamageChoice(powerId, options, picked) {
  if (!options?.options?.length) return '';
  const selectId = `race-power-damage-${esc(powerId)}`;
  const parts = [
    `<div class="race-power-damage" data-power-id="${esc(powerId)}" data-choice-group="${esc(options.choiceGroup)}">`,
    `<label class="race-power-damage-label" for="${selectId}">Power damage type</label>`,
    `<select class="race-choice-combo race-power-damage-combo" id="${selectId}" aria-label="Choose the damage type for this power">`,
    `<option value="">Choose damage type…</option>`
  ];
  for (const opt of options.options) {
    const key = opt.damageType;
    const selected = picked === key ? ' selected' : '';
    const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
    parts.push(`<option value="${esc(key)}"${selected}>${esc(label)}</option>`);
  }
  parts.push('</select>', '</div>');
  return parts.join('');
}

/**
 * @param {Array<{ id: string, name: string, bodyHtml?: string, kind?: string }>} grants
 * @param {Record<string, string>} [racePowerAbilityChoices]
 * @param {object | null} [replaced]
 * @param {Record<string, string>} [racePowerDamageChoices]
 */
function renderGrantFoldsBlock(
  grants,
  racePowerAbilityChoices = {},
  replaced = null,
  racePowerDamageChoices = {}
) {
  let list = grants ?? [];
  if (replaced && (replaced.names?.size || replaced.ids?.size)) {
    list = list.filter(
      (g) =>
        !replaced.names?.has(normalizeLabel(g.name)) &&
        !replaced.ids?.has(String(g.id ?? '').toLowerCase())
    );
  }
  if (!list.length) return '';
  const parts = ['<div class="race-grants">', '<h3 class="race-benefits-heading">Powers &amp; feats</h3>'];
  for (const g of list) {
    let choiceHtml = '';
    if (g.kind === 'power' && g.bodyHtml) {
      const key = String(g.id).toLowerCase();
      const abilityOptions = parsePowerAbilityOptions({ id: g.id, body_html: g.bodyHtml });
      if (abilityOptions) {
        const picked = racePowerAbilityChoices?.[key] ?? '';
        choiceHtml += renderPowerAbilityChoice(key, abilityOptions, picked);
      }
      const damageOptions = parsePowerDamageOptions({ id: g.id, body_html: g.bodyHtml });
      if (damageOptions) {
        const picked = racePowerDamageChoices?.[key] ?? '';
        choiceHtml += renderPowerDamageChoice(key, damageOptions, picked);
      }
    }
    parts.push(
      `<details class="race-grant-fold"><summary>${esc(g.name)}</summary><div class="race-grant-body">${choiceHtml}${g.bodyHtml ?? ''}</div></details>`
    );
  }
  parts.push('</div>');
  return parts.join('');
}

/**
 * Group the descriptive racial traits under one collapsed-by-default fold
 * ("Racial Traits"), while keeping the ability-score choice visible above it so
 * required decisions are not hidden behind a closed disclosure.
 * @param {Array<{ heading: string, rows: Array<object> }>} sections
 * @param {{ ability?: Record<string, string> }} [raceBonusChoices]
 */
function renderRaceTraitsBlock(sections, raceBonusChoices = {}) {
  if (!sections?.length) return '';

  /** @type {string[]} */
  const abilityItems = [];
  const descSections = sections
    .map((sec) => {
      const rows = [];
      for (const row of sec.rows) {
        if (row.abilityModel) abilityItems.push(renderAbilityScoreBenefitItem(row, raceBonusChoices));
        else rows.push(row);
      }
      return { heading: sec.heading, rows };
    })
    .filter((sec) => sec.rows.length);

  const parts = [];
  if (abilityItems.length) {
    parts.push(
      `<div class="race-ability-choice"><ul class="race-benefits-list">${abilityItems.join('')}</ul></div>`
    );
  }
  const inner = renderBenefitSectionsBlock(descSections, raceBonusChoices);
  if (inner) {
    parts.push(
      `<details class="race-traits-fold"><summary>Racial Traits</summary>${inner}</details>`
    );
  }
  return parts.join('');
}

/**
 * @param {Array<{ summary: string, bodyHtml: string }>} folds
 */
function renderFlavorFoldsBlock(folds) {
  if (!folds?.length) return '';
  const parts = ['<div class="race-flavor-folds">'];
  for (const f of folds) {
    parts.push(
      `<details class="race-flavor-fold"><summary>${esc(f.summary)}</summary><div class="race-flavor-body">${f.bodyHtml}</div></details>`
    );
  }
  parts.push('</div>');
  return parts.join('');
}

/**
 * @param {Map<string, string>} grantNameMap
 * @param {Array<{ id: string, name: string, bodyHtml?: string, kind?: string }>} grantEntries
 */
function buildGrantEntries(grantEntries, grantNameMap) {
  return (grantEntries ?? []).map((g) => ({
    id: g.id,
    name: g.name ?? grantNameMap.get(g.id?.toLowerCase()) ?? g.id,
    bodyHtml: g.bodyHtml ?? '',
    kind: g.kind
  }));
}

function stripSelectedPowerSections(html, previewTerms = []) {
  let out = String(html ?? '');
  for (const term of previewTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `<h1[^>]*class=(?:encounterpower|dailypower|atwillpower)[^>]*>\\s*${escaped}[^<]*<[^>]*>[\\s\\S]*?(?=<h1[^>]*class=(?:encounterpower|dailypower|atwillpower)|<h3|$)`,
      'gi'
    );
    out = out.replace(re, '');
  }
  return stripPowerBlocks(out);
}

function stripMatchingH3Sections(html, previewTerms = []) {
  let out = String(html ?? '');
  for (const term of previewTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<h3[^>]*>\\s*[^<]*${escaped}[^<]*<\\/h3>[\\s\\S]*?(?=<h3|$)`, 'gi');
    out = out.replace(re, '');
  }
  return out;
}

function decorateFlavorLead(html) {
  let out = String(html ?? '');
  out = out.replace(/<p(\s[^>]*)?class\s*=\s*["']?flavor["']?([^>]*)>/gi, (full, a = '', b = '') => {
    return `<p${a}class="race-flavor-lead${b ? ` ${b.trim()}` : ''}"${b.includes('class') ? '' : ''}>`;
  });
  out = out.replace(/<p([^>]*)>(\s*A\s+[^<]{20,})<\/p>/gi, (full, attrs, text) => {
    if (/race-flavor-lead/.test(full)) return full;
    return `<p${attrs}><span class="race-flavor-lead">${text.trim()}</span></p>`;
  });
  return out;
}

function compactMechanicalLines(entry, previewTerms = []) {
  if (!entry) return [];
  const { pairs, features } = parseRaceMechanics(entry, { forNotes: true });
  const lines = [];
  for (const p of pairs) {
    lines.push(`${p.label}: ${p.displayValue ?? p.value}`);
  }
  for (const f of features) {
    if (previewTerms.some((t) => t.toLowerCase() === f.label.toLowerCase())) continue;
    const val = (f.displayValue ?? f.value ?? '').trim();
    lines.push(val ? `${f.label}: ${val}` : f.label);
  }
  return lines;
}

function compactMechanicalLinesFiltered(entry, previewTerms = []) {
  return compactMechanicalLines(entry, previewTerms).filter((line) => !/^Ability scores?:/i.test(line));
}

/** Normalize a replacement-name list into a Set of normalized labels. */
function toReplacedNameSet(replacedNames) {
  const set = new Set();
  for (const n of replacedNames ?? []) {
    const norm = normalizeLabel(n);
    if (norm) set.add(norm);
  }
  return set;
}

/** Normalized label part of a "Label: value" compact note line. */
function compactLineLabel(line) {
  const s = String(line ?? '');
  const idx = s.indexOf(':');
  return normalizeLabel(idx >= 0 ? s.slice(0, idx) : s);
}

/**
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 * @param {{ previewTerms?: string[], buildSummary?: string[], raceBonusChoices?: { ability?: Record<string, string> }, replacedNames?: string[] | Set<string> }} [opts]
 */
export function buildRaceNotesText(baseEntry, variantEntry, opts = {}) {
  const previewTerms = opts.previewTerms ?? [];
  const raceBonusChoices = opts.raceBonusChoices ?? { ability: {}, skill: {} };
  const replaced = toReplacedNameSet(opts.replacedNames);
  const lines = [];

  if (baseEntry) {
    const baseLines = compactMechanicalLinesFiltered(baseEntry, previewTerms).filter(
      (line) => !replaced.size || !replaced.has(compactLineLabel(line))
    );
    lines.push(...baseLines);
    const resolved = formatResolvedAbilityNotes(baseEntry, raceBonusChoices);
    if (resolved) lines.push(resolved);
  }
  if (variantEntry && variantEntry.id !== baseEntry?.id) {
    const variantName = variantEntry.listing_fields?.Name ?? variantEntry.id;
    lines.push(`Subrace: ${variantName}`);
    lines.push(...compactMechanicalLinesFiltered(variantEntry, previewTerms));
    const resolved = formatResolvedAbilityNotes(variantEntry, raceBonusChoices);
    if (resolved) lines.push(resolved);
  }
  if (opts.buildSummary?.length) {
    lines.push(...opts.buildSummary);
  }

  const merged = [];
  const seen = new Set();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(line);
  }
  return merged.filter(Boolean).join('\n');
}

/**
 * @param {object | null | undefined} entry
 * @param {{ previewTerms?: string[], isVariant?: boolean, grantEntries?: Array<{ id: string, name: string, bodyHtml?: string, kind?: string }>, raceBonusChoices?: { ability?: Record<string, string> }, racePowerAbilityChoices?: Record<string, string>, racePowerDamageChoices?: Record<string, string> }} [opts]
 */
export function renderRacePreviewHtml(entry, opts = {}) {
  if (!entry) return '';
  const previewTerms = opts.previewTerms ?? [];
  const raceBonusChoices = opts.raceBonusChoices ?? { ability: {}, skill: {} };
  const racePowerAbilityChoices = opts.racePowerAbilityChoices ?? {};
  const racePowerDamageChoices = opts.racePowerDamageChoices ?? {};
  let html = entry.body_html ?? '';
  if (opts.isVariant) {
    html = stripMatchingH3Sections(html, previewTerms);
  } else {
    html = stripSelectedPowerSections(html, previewTerms);
  }

  const name = entry.listing_fields?.Name ?? entry.id;
  const grantNameMap = new Map();
  for (const g of opts.grantEntries ?? []) {
    grantNameMap.set(g.id.toLowerCase(), g.name);
  }

  const benefitSections = extractBenefitSections(html, {
    raceName: name,
    grantNameMap,
    entry,
    raceBonusChoices,
    applyAbilityModel: true
  });
  const flavorFolds = extractFlavorFolds(html, previewTerms);
  const grants = buildGrantEntries(opts.grantEntries ?? [], grantNameMap);

  return `<div class="race-preview"><h2 class="race-preview-title">${esc(name)}</h2>${renderRaceTraitsBlock(benefitSections, raceBonusChoices)}${renderGrantFoldsBlock(grants, racePowerAbilityChoices, null, racePowerDamageChoices)}${renderFlavorFoldsBlock(flavorFolds)}</div>`;
}

/**
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 * @param {{ previewTerms?: string[], grantEntries?: Array<{ id: string, name: string, bodyHtml?: string, kind?: string }>, raceBonusChoices?: { ability?: Record<string, string> }, racePowerAbilityChoices?: Record<string, string>, racePowerDamageChoices?: Record<string, string>, replacedNames?: string[] | Set<string>, replacedIds?: string[] | Set<string>, replacements?: Array<{ replacesName: string, replacesKind?: string }> | null, monsterFlavor?: Array<{ listing_fields?: { Name?: string }, name?: string, body_html?: string }> }} [opts]
 */
export function renderCombinedRacePreviewHtml(baseEntry, variantEntry, opts = {}) {
  const previewTerms = opts.previewTerms ?? [];
  const raceBonusChoices = opts.raceBonusChoices ?? { ability: {}, skill: {} };
  const racePowerAbilityChoices = opts.racePowerAbilityChoices ?? {};
  const racePowerDamageChoices = opts.racePowerDamageChoices ?? {};
  const replacedNames = toReplacedNameSet(opts.replacedNames);
  const replacedIds = new Set([...(opts.replacedIds ?? [])].map((id) => String(id).toLowerCase()));
  // Auto-detect subrace replacements (parser + curated + normalized rows) and
  // merge with any explicitly-provided sets.
  const auto = resolveReplacedBaseItems(baseEntry, variantEntry, { normalized: opts.replacements });
  for (const n of auto.names) replacedNames.add(n);
  for (const id of auto.ids) replacedIds.add(id);
  if (!baseEntry && !variantEntry) return '';

  let baseHtml = baseEntry?.body_html ?? '';
  let variantHtml = variantEntry?.body_html ?? '';
  if (baseEntry) baseHtml = stripSelectedPowerSections(baseHtml, previewTerms);
  if (variantEntry) variantHtml = stripMatchingH3Sections(variantHtml, previewTerms);

  const grantNameMap = new Map();
  for (const g of opts.grantEntries ?? []) {
    grantNameMap.set(g.id.toLowerCase(), g.name);
  }

  const baseName = baseEntry?.listing_fields?.Name ?? '';
  const variantName = variantEntry?.listing_fields?.Name ?? '';
  const title =
    variantEntry && variantEntry.id !== baseEntry?.id && baseName
      ? `${baseName} — ${variantName}`
      : variantName || baseName || 'Race';

  /** @type {ReturnType<typeof extractBenefitSections>} */
  const benefitSections = [];
  if (baseEntry) {
    let baseSections = extractBenefitSections(baseHtml, {
      raceName: baseName || 'Race',
      grantNameMap,
      entry: baseEntry,
      raceBonusChoices,
      applyAbilityModel: true
    });
    if (replacedNames.size) {
      baseSections = baseSections
        .map((sec) => ({
          ...sec,
          rows: sec.rows.filter((row) => row.abilityModel || !replacedNames.has(normalizeLabel(row.label)))
        }))
        .filter((sec) => sec.rows.length);
    }
    benefitSections.push(...baseSections);
  }
  if (variantEntry && variantEntry.id !== baseEntry?.id) {
    benefitSections.push(
      ...extractBenefitSections(variantHtml, {
        raceName: variantName || 'Subrace',
        grantNameMap,
        entry: variantEntry,
        raceBonusChoices,
        applyAbilityModel: !baseEntry
      })
    );
  }

  const flavorFolds = [];
  if (baseEntry) flavorFolds.push(...extractFlavorFolds(baseHtml, previewTerms));
  if (variantEntry && variantEntry.id !== baseEntry?.id) {
    flavorFolds.push(...extractFlavorFolds(variantHtml, previewTerms));
  }
  // Supplemental flavor from related monster entries (monster races like
  // Bugbear); statistics are stripped, prose stays in collapsed folds.
  for (const mf of opts.monsterFlavor ?? []) {
    flavorFolds.push(...extractMonsterFlavorFolds(mf));
  }

  const grants = buildGrantEntries(opts.grantEntries ?? [], grantNameMap);

  const replaced = { names: replacedNames, ids: replacedIds };
  return `<div class="race-preview race-preview--combined"><h2 class="race-preview-title">${esc(title)}</h2>${renderRaceTraitsBlock(benefitSections, raceBonusChoices)}${renderGrantFoldsBlock(grants, racePowerAbilityChoices, replaced, racePowerDamageChoices)}${renderFlavorFoldsBlock(flavorFolds)}</div>`;
}

// --- Structured racial traits --------------------------------------------
// These turn the race body HTML into structured languages / resistances /
// senses / speed / free-text traits. They are reused by the normalizer
// (tools/normalize/normalize.mjs) and by the sheet application in
// race-selections.js, so the same parse drives both the build-time tables and
// the runtime fallback. All are best-effort; callers surface gaps as warnings.

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const GRANT_VALUE_RE = /^(power\d+|feat\d+)$/i;

function wordToNumber(text) {
  const digit = String(text ?? '').match(/\b(\d+)\b/);
  if (digit) return Number(digit[1]);
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(String(text ?? ''))) return n;
  }
  return null;
}

function findPairValue(entry, norm) {
  const { pairs } = parseRaceMechanics(entry);
  const hit = pairs.find((p) => p.norm === norm);
  return hit ? hit.value : null;
}

/**
 * @param {string | object | null | undefined} source
 * @returns {{ fixed: string[], chooseCount: number }}
 */
export function parseRaceLanguages(source) {
  const entry = typeof source === 'object' && source ? source : { body_html: String(source ?? '') };
  const value = findPairValue(entry, 'languages');
  const out = { fixed: [], chooseCount: 0 };
  if (!value) return out;

  const tokens = String(value)
    .split(/,|;|\band\b|\bplus\b/i)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const tok of tokens) {
    if (/choice|of your choice|one (?:other|additional|more)|any (?:one|other)|other language/i.test(tok)) {
      out.chooseCount += wordToNumber(tok) ?? 1;
      continue;
    }
    const name = tok.replace(/\blanguages?\b/gi, '').replace(/\bchoose\b/gi, '').trim();
    if (name) out.fixed.push(name);
  }
  return out;
}

/**
 * @param {string | object | null | undefined} source
 * @returns {Array<{ damageType: string, amount: number | null, scaling: string | null }>}
 */
export function parseRaceResistances(source) {
  const entry = typeof source === 'object' && source ? source : { body_html: String(source ?? '') };
  const { headHtml } = parseRaceMechanics(entry);
  const text = stripHtml(headHtml || entry.body_html || '');
  /** @type {Map<string, { damageType: string, amount: number | null, scaling: string | null }>} */
  const byType = new Map();

  const add = (type, amount) => {
    const damageType = String(type ?? '').toLowerCase();
    if (!damageType) return;
    if (!byType.has(damageType)) {
      byType.set(damageType, {
        damageType,
        amount: Number.isFinite(amount) ? amount : null,
        scaling: null
      });
    }
  };

  let m;
  const resistFirst = /resist(?:ance)?\s+(\d+)\s+([a-z]+)/gi;
  while ((m = resistFirst.exec(text)) !== null) add(m[2], Number(m[1]));
  const typeFirst = /\b([a-z]+)\s+resistance\s+(\d+)/gi;
  while ((m = typeFirst.exec(text)) !== null) add(m[1], Number(m[2]));

  return [...byType.values()];
}

/**
 * @param {string | object | null | undefined} source
 * @returns {string[]}
 */
export function parseRaceSenses(source) {
  const entry = typeof source === 'object' && source ? source : { body_html: String(source ?? '') };
  const visionValue = findPairValue(entry, 'vision') ?? '';
  const { headHtml } = parseRaceMechanics(entry);
  const text = `${visionValue} ${stripHtml(headHtml || entry.body_html || '')}`;
  const senses = new Set();
  const canon = (raw) => {
    const v = raw.toLowerCase();
    if (v.startsWith('low-light')) return 'Low-light vision';
    if (v.startsWith('darkvision')) return 'Darkvision';
    if (v.startsWith('blindsight')) return 'Blindsight';
    if (v.startsWith('tremorsense')) return 'Tremorsense';
    if (v.startsWith('truesight')) return 'Truesight';
    return null;
  };
  const re = /\b(low-light vision|low-light|darkvision|blindsight|tremorsense|truesight)\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const c = canon(m[1]);
    if (c) senses.add(c);
  }
  return [...senses];
}

/**
 * @param {string | object | null | undefined} source
 * @returns {number | null}
 */
export function parseSpeedSquares(source) {
  const entry = typeof source === 'object' && source ? source : { body_html: String(source ?? '') };
  const value = findPairValue(entry, 'speed');
  const n = parseInt(String(value ?? '').match(/\d+/)?.[0] ?? '', 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Free-text racial traits (named features that are not structured elsewhere).
 * @param {string | object | null | undefined} source
 * @returns {Array<{ name: string, text: string }>}
 */
export function parseRaceTraits(source) {
  const entry = typeof source === 'object' && source ? source : { body_html: String(source ?? '') };
  const { features } = parseRaceMechanics(entry);
  const out = [];
  for (const f of features) {
    const value = String(f.displayValue ?? f.value ?? '').trim();
    if (GRANT_VALUE_RE.test(value)) continue;
    out.push({ name: f.label, text: value });
  }
  return out;
}

/**
 * Detect base-race traits/powers a subrace replaces, parsed from phrases like
 * "This trait replaces the dragonborn's Dragon Breath racial trait" or
 * "instead of the X power". Best-effort; the curated override map
 * (race-replacements.js) backstops anything this misses.
 * @param {string | object | null | undefined} source
 * @returns {Array<{ targetName: string, kind: string }>}
 */
export function parseRaceReplacements(source) {
  const entry = typeof source === 'object' && source ? source : { body_html: String(source ?? '') };
  const text = stripHtml(entry.body_html ?? '');
  /** @type {Array<{ targetName: string, kind: string }>} */
  const out = [];
  const seen = new Set();

  const push = (rawName, keyword) => {
    let name = String(rawName ?? '')
      .replace(/’/g, "'")
      // Drop a leading possessive race token, e.g. "Dragonborn's Dragon Breath".
      .replace(/^[A-Za-z][A-Za-z']+'s\s+/, '')
      .replace(/^\s*(?:[Tt]he|[Yy]our|[Aa]n?)\s+/, '')
      .trim();
    if (!name || name.length < 3) return;
    const kind = /power/i.test(keyword) ? 'power' : /feat/i.test(keyword) ? 'feat' : 'trait';
    const key = `${kind}:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ targetName: name, kind });
  };

  // NOTE: no `i` flag, so [A-Z] stays a real capital and anchors on the proper
  // name (e.g. "Dragon Breath") rather than swallowing "the dragonborn's".
  // "... replaces (the|your) <Title Words> (racial trait|trait|power|feat)"
  const reReplace =
    /[Rr]eplaces?\b[^.]*?\b([A-Z][A-Za-z'’]*(?:\s+[A-Z][A-Za-z'’]*)*)\s+(?:racial\s+)?(trait|power|feat)\b/g;
  // "instead of / in place of <Title Words> (trait|power|feat)"
  const reInstead =
    /(?:[Ii]nstead of|[Ii]n place of)\b[^.]*?\b([A-Z][A-Za-z'’]*(?:\s+[A-Z][A-Za-z'’]*)*)\s+(?:racial\s+)?(trait|power|feat)\b/g;

  let m;
  while ((m = reReplace.exec(text)) !== null) push(m[1], m[2]);
  while ((m = reInstead.exec(text)) !== null) push(m[1], m[2]);

  return out;
}

/**
 * Resolve which base-race trait names / grant ids a subrace replaces, merging
 * the auto-parsed replacements, the curated override map, and any normalized
 * `race_replacement` rows the caller passes in.
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 * @param {{ normalized?: Array<{ replacesName: string, replacesKind?: string }> | null }} [opts]
 * @returns {{ names: Set<string>, ids: Set<string> }}
 */
export function resolveReplacedBaseItems(baseEntry, variantEntry, opts = {}) {
  const names = new Set();
  const ids = new Set();
  if (!variantEntry || (baseEntry && variantEntry.id === baseEntry.id)) {
    return { names, ids };
  }

  const addToken = (token) => {
    const raw = String(token ?? '').trim();
    if (!raw) return;
    if (GRANT_ID_RE.test(raw)) ids.add(raw.toLowerCase());
    else {
      const norm = normalizeLabel(raw);
      if (norm) names.add(norm);
    }
  };

  for (const r of parseRaceReplacements(variantEntry)) addToken(r.targetName);

  const curated = getCuratedReplacements(variantEntry.id);
  for (const t of curated.traits) addToken(t);
  for (const pid of curated.powerIds) ids.add(String(pid).toLowerCase());
  for (const fid of curated.featIds) ids.add(String(fid).toLowerCase());

  for (const row of opts.normalized ?? []) addToken(row.replacesName);

  return { names, ids };
}

/**
 * Merge structured traits across a base race and an optional subrace.
 * @param {object | null | undefined} baseEntry
 * @param {object | null | undefined} variantEntry
 */
export function getRaceStructuredTraits(baseEntry, variantEntry) {
  const entries = [baseEntry, variantEntry].filter(Boolean);
  const fixedLanguages = [];
  let chooseCount = 0;
  /** @type {Map<string, { damageType: string, amount: number | null, scaling: string | null }>} */
  const resistances = new Map();
  const senses = new Set();
  const traits = [];
  let speedSquares = null;

  for (const entry of entries) {
    const langs = parseRaceLanguages(entry);
    for (const l of langs.fixed) if (!fixedLanguages.includes(l)) fixedLanguages.push(l);
    chooseCount = Math.max(chooseCount, langs.chooseCount);
    for (const r of parseRaceResistances(entry)) if (!resistances.has(r.damageType)) resistances.set(r.damageType, r);
    for (const s of parseRaceSenses(entry)) senses.add(s);
    for (const t of parseRaceTraits(entry)) traits.push(t);
    const sq = parseSpeedSquares(entry);
    if (sq != null) speedSquares = sq;
  }

  return {
    languages: { fixed: fixedLanguages, chooseCount },
    resistances: [...resistances.values()],
    senses: [...senses],
    speedSquares,
    traits
  };
}

/** @param {{ fixed: string[], chooseCount: number }} languages */
export function formatRaceLanguagesText(languages) {
  const parts = [...(languages?.fixed ?? [])];
  const n = languages?.chooseCount ?? 0;
  if (n > 0) {
    const word = Object.keys(NUMBER_WORDS).find((k) => NUMBER_WORDS[k] === n) ?? String(n);
    parts.push(`${word} of your choice`);
  }
  return parts.join(', ');
}

/** @param {Array<{ damageType: string, amount: number | null }>} resistances */
export function formatRaceResistancesText(resistances) {
  return (resistances ?? [])
    .map((r) => {
      const type = r.damageType ? r.damageType.charAt(0).toUpperCase() + r.damageType.slice(1) : '';
      return r.amount != null ? `Resist ${r.amount} ${type}`.trim() : `Resist ${type}`.trim();
    })
    .filter(Boolean)
    .join(', ');
}

/** @param {string[]} senses */
export function formatRaceSensesText(senses) {
  return (senses ?? []).join(', ');
}

export { stripHtml, truncateFlavor };
