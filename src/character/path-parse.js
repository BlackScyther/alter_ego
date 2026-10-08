/**
 * Parse paragon path, epic destiny, and theme listing fields.
 */

import { normalizePrerequisiteText } from './feat-parse.js';

/**
 * @param {object | null | undefined} entry
 */
export function parsePathListing(entry) {
  const lf = entry?.listing_fields ?? {};
  return {
    id: entry?.id ?? null,
    name: lf.Name ?? entry?.id ?? null,
    prerequisiteRaw: normalizePrerequisiteText(lf.Prerequisite ?? ''),
    sourceBook: lf.SourceBook ?? null
  };
}

/**
 * @param {object | null | undefined} entry
 */
export function parseThemeListing(entry) {
  return parsePathListing(entry);
}
