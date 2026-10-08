/**
 * Parse ritual listing fields and class ritual grants.
 */

/**
 * @param {string | number | null | undefined} value
 */
function parseLevel(value) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * @param {object | null | undefined} entry
 */
export function parseRitualListing(entry) {
  const lf = entry?.listing_fields ?? {};
  return {
    id: entry?.id ?? null,
    name: lf.Name ?? entry?.id ?? null,
    level: parseLevel(lf.Level),
    componentCost: lf.ComponentCost ?? null,
    price: lf.Price ?? null,
    keySkillDescription: lf.KeySkillDescription ?? null,
    sourceBook: lf.SourceBook ?? null
  };
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractRitualIdsFromHtml(html) {
  const ids = new Set();
  const re = /\b(ritual\d+)\b/gi;
  let m;
  while ((m = re.exec(html ?? '')) !== null) {
    ids.add(m[1].toLowerCase());
  }
  return [...ids];
}

/**
 * @param {object | null | undefined} classEntry
 */
export function parseClassRitualGrants(classEntry) {
  return extractRitualIdsFromHtml(classEntry?.body_html ?? '');
}
