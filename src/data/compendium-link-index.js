export const RULES_LINK_CATEGORIES = [
  'glossary',
  'feat',
  'power',
  'race',
  'class',
  'background',
  'theme',
  'paragonpath',
  'epicdestiny',
  'disease',
  'poison'
];

export const MIN_TERM_LENGTH = 3;

/**
 * @param {import('./compendium.js').CompendiumProvider} compendium
 */
export async function buildCompendiumLinkIndex(compendium) {
  await compendium.ready?.();
  /** @type {Map<string, { id: string, name: string, category_slug: string }>} */
  const byName = new Map();

  for (const category of RULES_LINK_CATEGORIES) {
    const entries = await compendium.listEntries(category, { limit: 20000 });
    for (const entry of entries) {
      const name = String(entry.listing_fields?.Name ?? '').trim();
      if (name.length < MIN_TERM_LENGTH) continue;
      const key = name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, { id: entry.id, name, category_slug: category });
      }
    }
  }

  const terms = [...byName.values()].sort((a, b) => b.name.length - a.name.length);
  return { terms, byName };
}

/**
 * @param {{ terms: Array<{ id: string, name: string, category_slug: string }> }} index
 */
export function getLinkTerms(index) {
  return index?.terms ?? [];
}
