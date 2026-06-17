/**
 * Build URL for the standalone compendium entry viewer.
 * @param {string} entryId
 * @param {string} [fromPathname] — e.g. location.pathname from editor or sheet
 */
export function compendiumEntryPageUrl(entryId, fromPathname = '') {
  const id = String(entryId ?? '').trim();
  if (!id) return '';
  const base = resolveCompendiumEntryBase(fromPathname);
  return `${base}entry.html?id=${encodeURIComponent(id)}`;
}

/**
 * @param {string} pathname
 */
function resolveCompendiumEntryBase(pathname) {
  const p = String(pathname ?? '');
  if (p.includes('/editor/')) return '../compendium/';
  if (p.includes('/sheet/')) return '../compendium/';
  if (p.includes('/gm/workshop/')) return '../../compendium/';
  if (p.includes('/compendium/')) return './';
  return '../compendium/';
}
