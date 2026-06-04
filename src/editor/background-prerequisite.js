/**
 * Background racial prerequisite parsing and filter modes.
 */

/** @typedef {'all' | 'eligible' | 'own-race'} BackgroundRaceFilterMode */

const PREREQ_RE = /<b>Prerequisite:\s*<\/b>\s*([^<]+)/i;

/** @type {Map<string, BackgroundRaceFilterMode>} */
const sessionModes = new Map();

const SESSION_KEY = 'compendium-background';

/** @returns {BackgroundRaceFilterMode} */
export function getBackgroundRaceFilterMode() {
  return sessionModes.get(SESSION_KEY) ?? 'eligible';
}

/** @param {BackgroundRaceFilterMode} mode */
export function setBackgroundRaceFilterMode(mode) {
  sessionModes.set(SESSION_KEY, mode);
}

/**
 * @param {{ body_html?: string }} entry
 * @returns {string | null}
 */
export function parseBackgroundPrerequisite(entry) {
  const html = entry?.body_html ?? '';
  const m = html.match(PREREQ_RE);
  if (!m) return null;
  const v = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!v || v === '—' || v === '-') return null;
  return v;
}

/**
 * @param {string} name
 */
function addRaceTerm(terms, name) {
  const t = String(name ?? '').trim();
  if (!t) return;
  terms.add(t);
  const stem = t.split(/\s*-\s*/)[0]?.trim();
  if (stem && stem !== t) terms.add(stem);
}

/**
 * @param {import('../character/model.js').Character} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @returns {Promise<string[]>}
 */
export async function getRaceMatchTerms(character, compendium) {
  const terms = new Set();
  addRaceTerm(terms, character.identity?.race);

  const raceId = character.selections?.raceId;
  if (raceId) {
    const entry = await compendium.getEntry(raceId);
    if (entry?.listing_fields?.Name) addRaceTerm(terms, entry.listing_fields.Name);
  }

  return [...terms].filter(Boolean);
}

/**
 * @param {string} prereq
 * @param {string[]} raceTerms
 */
export function prereqMatchesAnyRace(prereq, raceTerms) {
  if (!prereq || !raceTerms.length) return false;
  const p = prereq.toLowerCase();
  return raceTerms.some((term) => {
    const t = term.toLowerCase();
    if (!t) return false;
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(p);
  });
}

/**
 * @param {string} prereq
 * @param {string[]} raceTerms
 */
export function prereqMatchesOnlyOwnRace(prereq, raceTerms) {
  if (!prereq || !raceTerms.length) return false;
  const normalized = prereq.replace(/[.,;:!]+$/g, '').trim().toLowerCase();
  return raceTerms.some((term) => normalized === term.toLowerCase());
}

/**
 * @param {{ listing_fields?: Record<string, string>, body_html?: string }} entry
 * @param {BackgroundRaceFilterMode} mode
 * @param {string[]} raceTerms
 */
export function backgroundPassesRaceFilter(entry, mode, raceTerms) {
  if (mode === 'all') return true;

  const prereq = parseBackgroundPrerequisite(entry);
  const type = entry.listing_fields?.Type?.trim();

  if (mode === 'eligible') {
    if (!raceTerms.length) return true;
    if (!prereq) return true;
    return prereqMatchesAnyRace(prereq, raceTerms);
  }

  if (mode === 'own-race') {
    if (!raceTerms.length) return false;
    if (!prereq || !prereqMatchesAnyRace(prereq, raceTerms)) return false;
    return type === 'Racial' || prereqMatchesOnlyOwnRace(prereq, raceTerms);
  }

  return true;
}

/**
 * @param {Array<{ listing_fields?: Record<string, string>, body_html?: string }>} entries
 * @param {BackgroundRaceFilterMode} mode
 * @param {string[]} raceTerms
 */
export function filterBackgroundEntries(entries, mode, raceTerms) {
  return entries.filter((e) => backgroundPassesRaceFilter(e, mode, raceTerms));
}

/**
 * Meta line for picker options (Type, Campaign, Prerequisite).
 * @param {Record<string, string> | undefined} fields
 * @param {{ body_html?: string }} entry
 */
export function formatBackgroundListingMeta(fields, entry) {
  const parts = [];
  if (fields?.Type) parts.push(fields.Type);
  if (fields?.Campaign) parts.push(fields.Campaign);
  const prereq = parseBackgroundPrerequisite(entry);
  if (prereq) parts.push(`Prerequisite: ${prereq}`);
  if (fields?.SourceBook) parts.push(fields.SourceBook);
  return parts.join(' · ');
}
