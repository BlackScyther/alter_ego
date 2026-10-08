/**
 * Listing-only parsers and cross-reference extraction for reference categories.
 */

/** @type {Record<string, string[]>} */
export const REFERENCE_CATEGORY_COLUMNS = {
  trap: ['Name', 'Type', 'GroupRole', 'Level', 'SourceBook'],
  companion: ['Name', 'Type', 'Size', 'CreatureType', 'SourceBook'],
  deity: ['Name', 'Domains', 'Alignment', 'SourceBook'],
  disease: ['Name', 'Level', 'SourceBook'],
  poison: ['Name', 'Level', 'Cost', 'SourceBook'],
  glossary: ['Name', 'Category', 'Type', 'SourceBook']
};

/**
 * @param {object | null | undefined} entry
 * @param {string} category
 */
export function parseReferenceListing(entry, category) {
  const lf = entry?.listing_fields ?? {};
  const cols = REFERENCE_CATEGORY_COLUMNS[category] ?? ['Name', 'SourceBook'];
  /** @type {Record<string, string | number | null>} */
  const row = { id: entry?.id ?? null };
  for (const col of cols) {
    const key = col.charAt(0).toLowerCase() + col.slice(1);
    if (col === 'Level') {
      const n = parseInt(String(lf[col] ?? ''), 10);
      row[key] = Number.isNaN(n) ? null : n;
    } else if (col === 'Cost') {
      const n = parseFloat(String(lf[col] ?? '').replace(/[^\d.]/g, ''));
      row[key] = Number.isNaN(n) ? null : n;
    } else {
      row[key] = lf[col] ?? null;
    }
  }
  return row;
}

/**
 * @param {object | null | undefined} entry
 */
export function parseGlossaryListing(entry) {
  return parseReferenceListing(entry, 'glossary');
}

const TOKEN_RE = /\b(power\d+|feat\d+|ritual\d+|monster\d+|item\d+)\b/gi;

/**
 * Extract explicit compendium id tokens from HTML.
 * @param {string} html
 * @param {string} fromEntryId
 */
export function extractExplicitEntryLinks(html, fromEntryId) {
  /** @type {Array<{ fromEntryId: string, toEntryId: string, linkText: string, linkType: string }>} */
  const links = [];
  const seen = new Set();
  let m;
  while ((m = TOKEN_RE.exec(html ?? '')) !== null) {
    const toId = m[1].toLowerCase();
    const key = `${fromEntryId}|${toId}|${m[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      fromEntryId,
      toEntryId: toId,
      linkText: m[0],
      linkType: 'token'
    });
  }
  return links;
}

/**
 * Match glossary term names in body text (longest terms first).
 * @param {string} html
 * @param {string} fromEntryId
 * @param {Array<{ id: string, name: string }>} glossaryTerms
 */
export function extractGlossaryLinks(html, fromEntryId, glossaryTerms) {
  const text = String(html ?? '').replace(/<[^>]+>/g, ' ');
  /** @type {Array<{ fromEntryId: string, toEntryId: string, linkText: string, linkType: string }>} */
  const links = [];
  const sorted = [...glossaryTerms].sort((a, b) => b.name.length - a.name.length);
  const lower = text.toLowerCase();
  for (const term of sorted) {
    const name = String(term.name ?? '').trim();
    if (name.length < 3) continue;
    const idx = lower.indexOf(name.toLowerCase());
    if (idx === -1) continue;
    links.push({
      fromEntryId,
      toEntryId: term.id,
      linkText: name,
      linkType: 'glossary'
    });
  }
  return links;
}
