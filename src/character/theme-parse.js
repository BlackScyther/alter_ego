/**
 * Parse a theme compendium entry into level 1, 5, and 10 features,
 * embedded powers, and a short preview.
 *
 * Most themes label features with bold "Starting Feature (1st level)",
 * "Level 5 Feature (5th level)", and "Level 10 Feature (10th level)".
 * Dark Sun themes instead put the level 1 feature in a power heading
 * whose level line ends in "Feature".
 */

import { escapeHtml as esc } from '../shared/escape-html.js';

const FEATURE_RE =
  /<b>\s*[^<]{0,120}?\b(Starting Feature|Level 5 Feature|Level 10 Feature)\s*\(\s*(1st|5th|10th)\s+level\s*\)\s*<\/b>\s*:?/gi;

const POWER_H1_RE = /<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi;

const GAIN_POWER_RE = /you gain the ([^.]+?) power/gi;

/**
 * @param {string} html
 */
function stripTags(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} kind
 */
function featureLevel(kind) {
  const k = String(kind ?? '').toLowerCase();
  if (k.startsWith('starting')) return 1;
  if (k.includes('10')) return 10;
  return 5;
}

/**
 * @param {number} level
 */
export function themeFeatureTitle(level) {
  if (level === 1) return 'Starting Feature';
  return `Level ${level} Feature`;
}

/**
 * @param {string} html
 * @param {number} from
 */
function nextPowerHeadingIndex(html, from) {
  const re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  re.lastIndex = from;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (/<span\b[^>]*\bclass\s*=\s*["']?level\b/i.test(match[1])) return match.index;
  }
  return html.length;
}

/**
 * @param {string} attrs
 * @param {string} inner
 */
function isTitleHeading(attrs, inner) {
  return (
    /\bclass\s*=\s*["']?[^"'>]*\bplayer\b/i.test(attrs) &&
    !/<span\b[^>]*\bclass\s*=\s*["']?level\b/i.test(inner)
  );
}

/**
 * @param {string} levelLine
 * @returns {{ kind: string, minLevel: number, granted: boolean } | null}
 */
function classifyPowerLevelLine(levelLine) {
  const line = String(levelLine ?? '').replace(/\s+/g, ' ').trim();
  if (!line || /secondary attack/i.test(line)) return null;
  if (/\bfeature\s*$/i.test(line)) return { kind: 'feature', minLevel: 1, granted: true };
  const utility = line.match(/\butility(?:\s+(\d+))?\s*$/i);
  if (utility) {
    if (!utility[1]) return { kind: 'utility', minLevel: 1, granted: true };
    return { kind: 'utility', minLevel: Number(utility[1]), granted: false };
  }
  const attack = line.match(/\battack(?:\s+(\d+))?\s*$/i);
  if (attack) {
    if (!attack[1]) return { kind: 'attack', minLevel: 1, granted: true };
    return { kind: 'attack', minLevel: Number(attack[1]), granted: false };
  }
  return null;
}

/**
 * @param {string} inner
 */
function parsePowerHeading(inner) {
  const span = inner.match(/<span\b[^>]*\bclass\s*=\s*["']?level\b[^>]*>([\s\S]*?)<\/span>/i);
  if (!span) return null;
  const levelLine = stripTags(span[1]);
  const classified = classifyPowerLevelLine(levelLine);
  if (!classified) return null;
  const name = stripTags(inner.slice(0, span.index));
  if (!name) return null;
  return { name, levelLine, ...classified };
}

/**
 * @param {string} html
 */
function parsePowers(html) {
  /** @type {Array<{ name: string, levelLine: string, kind: string, minLevel: number, granted: boolean }>} */
  const powers = [];
  const seen = new Set();
  const re = new RegExp(POWER_H1_RE.source, 'gi');
  let match;
  while ((match = re.exec(html)) !== null) {
    if (isTitleHeading(match[1], match[2])) continue;
    const power = parsePowerHeading(match[2]);
    if (!power) continue;
    const key = power.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    powers.push(power);
  }
  return powers;
}

/**
 * @param {string} html
 */
function parseBoldFeatures(html) {
  /** @type {Array<{ level: number, title: string, text: string }>} */
  const features = [];
  const marks = [];
  const re = new RegExp(FEATURE_RE.source, 'gi');
  let match;
  while ((match = re.exec(html)) !== null) {
    marks.push({
      level: featureLevel(match[1]),
      start: match.index,
      end: match.index + match[0].length
    });
  }
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const nextFeature = marks[i + 1] ? marks[i + 1].start : html.length;
    const nextPower = nextPowerHeadingIndex(html, mark.end);
    const boundary = Math.min(nextFeature, nextPower);
    const text = stripTags(html.slice(mark.end, boundary));
    if (!text) continue;
    features.push({
      level: mark.level,
      title: themeFeatureTitle(mark.level),
      text
    });
  }
  return features.sort((a, b) => a.level - b.level);
}

/**
 * @param {object | null | undefined} entry
 * @param {string} html
 */
function parsePrerequisite(entry, html) {
  const listed = String(entry?.listing_fields?.Prerequisite ?? '').trim();
  if (listed && listed !== '—' && listed !== '-' && listed.toLowerCase() !== 'none') return listed;
  const match = html.match(/<b>\s*Prerequisite\s*:?\s*<\/b>\s*:?\s*([^<]+)/i);
  const fromBody = match ? stripTags(match[1]) : '';
  if (!fromBody || fromBody === '—' || fromBody.toLowerCase() === 'none') return '';
  return fromBody;
}

/**
 * @param {string} html
 * @param {number} cutoff
 */
function flavorBefore(html, cutoff) {
  let slice = html.slice(0, Math.max(0, cutoff));
  slice = slice.replace(/<h1\b[^>]*\bclass\s*=\s*["']?[^"'>]*\bplayer\b[^>]*>[\s\S]*?<\/h1>/i, '');
  slice = slice.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  return slice.trim();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function powersMentionedInText(text) {
  /** @type {string[]} */
  const names = [];
  const re = new RegExp(GAIN_POWER_RE.source, 'gi');
  let match;
  while ((match = re.exec(String(text ?? ''))) !== null) {
    const name = match[1].replace(/\s+/g, ' ').trim();
    if (name) names.push(name);
  }
  return names;
}

/**
 * Power names the character gains at this level.
 * A heading marked Feature, or an unnumbered Attack or Utility, is granted
 * when the character reaches that heading's level. A feature sentence
 * "you gain the X power" also grants X once that feature is unlocked.
 * @param {ReturnType<typeof parseThemeEntry>} parsed
 * @param {number} level
 */
export function grantedPowerNamesAtLevel(parsed, level) {
  const names = [];
  const seen = new Set();
  const add = (name) => {
    const key = String(name ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(String(name).trim());
  };
  for (const feature of parsed?.features ?? []) {
    if (feature.level > level) continue;
    for (const mentioned of powersMentionedInText(feature.text)) add(mentioned);
  }
  for (const power of parsed?.powers ?? []) {
    if (power.granted && power.minLevel <= level) add(power.name);
  }
  return names;
}

/**
 * @param {ReturnType<typeof parseThemeEntry>} parsed
 * @param {{ name: string, granted?: boolean, minLevel?: number }} power
 * @returns {number | null} null when the power is optional
 */
export function themePowerGrantLevel(parsed, power) {
  if (power.granted) return power.minLevel ?? 1;
  for (const feature of parsed?.features ?? []) {
    const mentioned = powersMentionedInText(feature.text).some(
      (name) => name.toLowerCase() === power.name.toLowerCase()
    );
    if (mentioned) return feature.level;
  }
  return null;
}

/**
 * @param {object | null | undefined} entry
 */
export function parseThemeEntry(entry) {
  const html = String(entry?.body_html ?? '');
  const powers = parsePowers(html);
  const features = parseBoldFeatures(html);
  if (!features.some((feature) => feature.level === 1)) {
    const featurePower = powers.find((power) => power.kind === 'feature' && power.granted);
    if (featurePower) {
      features.unshift({
        level: 1,
        title: themeFeatureTitle(1),
        text: `You gain the ${featurePower.name} power.`
      });
    }
  }

  const featureSearch = new RegExp(FEATURE_RE.source, 'i');
  const firstFeature = html.search(featureSearch);
  const firstPower = nextPowerHeadingIndex(html, 0);
  const cutoffCandidates = [firstFeature, firstPower].filter((index) => index >= 0);
  const cutoff = cutoffCandidates.length ? Math.min(...cutoffCandidates) : html.length;

  return {
    id: entry?.id ?? null,
    name: entry?.listing_fields?.Name ?? entry?.id ?? '',
    prerequisite: parsePrerequisite(entry, html),
    sourceBook: entry?.listing_fields?.SourceBook ?? '',
    features,
    powers,
    flavorHtml: flavorBefore(html, cutoff)
  };
}

/**
 * @param {ReturnType<typeof parseThemeEntry>} parsed
 * @param {number} level
 */
export function activeThemeFeatures(parsed, level) {
  const current = Number(level) || 1;
  return (parsed?.features ?? []).filter((feature) => feature.level <= current);
}

/**
 * @param {ReturnType<typeof parseThemeEntry> | object | null | undefined} parsed
 * @param {number} [level]
 */
export function buildThemeNotesText(parsed, level = 1) {
  if (!parsed) return '';
  const lines = [];
  if (parsed.name) lines.push(parsed.name);
  if (parsed.prerequisite) lines.push(`Prerequisite: ${parsed.prerequisite}`);
  for (const feature of activeThemeFeatures(parsed, level)) {
    lines.push(`${feature.title}: ${feature.text}`);
  }
  return lines.join('\n');
}

/**
 * @param {Record<string, string> | null | undefined} fields
 */
export function formatThemeListingMeta(fields) {
  const prereq = String(fields?.Prerequisite ?? '').trim();
  const book = String(fields?.SourceBook ?? '').trim();
  return [prereq && prereq !== '—' ? prereq : '', book].filter(Boolean).join(' · ');
}

/**
 * @param {{ name: string, kind: string, minLevel: number, granted: boolean }} power
 * @param {number | null} grantLevel
 * @param {number} characterLevel
 */
function powerStatusLabel(power, grantLevel, characterLevel) {
  if (grantLevel != null) {
    if (characterLevel >= grantLevel) return 'Granted';
    return `Granted at level ${grantLevel}`;
  }
  const kind = power.kind === 'utility' ? 'Optional utility' : 'Optional attack';
  return `${kind}, level ${power.minLevel}`;
}

/**
 * @param {object | null | undefined} entry
 * @param {{ level?: number }} [opts]
 */
export function renderThemePreviewHtml(entry, opts = {}) {
  if (!entry) return '';
  const parsed = parseThemeEntry(entry);
  const level = Number(opts.level) || 1;
  const meta = [];
  meta.push(
    `<li><strong>Prerequisite:</strong> ${esc(parsed.prerequisite || 'None')}</li>`
  );
  if (parsed.sourceBook) {
    meta.push(`<li><strong>Source:</strong> ${esc(parsed.sourceBook)}</li>`);
  }

  const featureHtml = parsed.features
    .map((feature) => {
      const active = feature.level <= level;
      const state = active ? 'Active' : `Locked until level ${feature.level}`;
      return `<details class="theme-feature-fold${active ? '' : ' theme-feature-fold--locked'}"${active ? ' open' : ''}>
        <summary>${esc(feature.title)} (${state})</summary>
        <p class="theme-feature-text">${esc(feature.text)}</p>
      </details>`;
    })
    .join('');

  const powerItems = parsed.powers
    .map((power) => {
      const grantLevel = themePowerGrantLevel(parsed, power);
      const status = powerStatusLabel(power, grantLevel, level);
      return `<li><span class="theme-power-name">${esc(power.name)}</span> <span class="theme-power-status">${esc(status)}</span></li>`;
    })
    .join('');

  const flavor = parsed.flavorHtml
    ? `<details class="theme-flavor-fold"><summary>Description</summary><div class="theme-flavor-body">${parsed.flavorHtml}</div></details>`
    : '';

  const featuresBlock = featureHtml
    ? `<section class="theme-features"><h3 class="theme-section-title">Features</h3>${featureHtml}</section>`
    : '';
  const powersBlock = powerItems
    ? `<section class="theme-powers"><h3 class="theme-section-title">Powers</h3><ul class="theme-power-list">${powerItems}</ul></section>`
    : '';

  return `<div class="theme-preview">
    <h2 class="theme-preview-title">${esc(parsed.name || 'Theme')}</h2>
    <section class="theme-details"><h3 class="theme-section-title">Details</h3><ul class="theme-meta-list">${meta.join('')}</ul></section>
    ${featuresBlock}
    ${powersBlock}
    ${flavor}
  </div>`;
}
