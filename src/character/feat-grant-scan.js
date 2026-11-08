/**
 * Feat ids (`feat123`) and "you gain the … feat" lines in a compendium body.
 */

import { extractFeatIdsFromClassHtml } from './class-parse.js';
import { pickThemePowerMatch } from './theme-selections.js';

/**
 * @param {string} html
 * @returns {string[]}
 */
const CONDITIONAL_RE = /\b(if|when|whenever|unless|while)\b/i;

export function extractGainedFeatNames(html) {
  const text = String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
  /** @type {string[]} */
  const names = [];
  const seen = new Set();
  const re = /you gain the ([^.]+?) feat\b/gi;
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (CONDITIONAL_RE.test(sentence)) continue;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(sentence)) !== null) {
      const name = match[1].replace(/\s+/g, ' ').trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * @param {string} html
 * @param {{ getEntry?: (id: string) => Promise<object | null | undefined>, listEntries?: (category: string, opts?: object) => Promise<object[]> }} compendium
 * @param {string | null | undefined} [sourceBook]
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function resolveFeatMentions(html, compendium, sourceBook) {
  /** @type {Array<{ id: string, name: string }>} */
  const grants = [];
  const seen = new Set();

  for (const id of extractFeatIdsFromClassHtml(html)) {
    if (seen.has(id)) continue;
    const entry = compendium?.getEntry ? await compendium.getEntry(id) : null;
    if (entry?.category_slug && entry.category_slug !== 'feat') continue;
    seen.add(id);
    grants.push({
      id,
      name: entry?.listing_fields?.Name || id
    });
  }

  if (!compendium?.listEntries) return grants;
  for (const name of extractGainedFeatNames(html)) {
    const hits = await compendium.listEntries('feat', { search: name, limit: 30 });
    const match = pickThemePowerMatch(hits, name, sourceBook);
    if (!match?.id) continue;
    const id = String(match.id).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    grants.push({
      id,
      name: match.listing_fields?.Name ?? name
    });
  }

  return grants;
}
