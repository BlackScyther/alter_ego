/**
 * Apply a chosen theme: notes, the starting power, and flat bonuses
 * from features the character's level has unlocked.
 */

import { detectStaticFeatureBonuses } from './class-effects.js';
import { ensureGrantSlots, writeGrantGroup } from './grant-slots.js';
import { ensureDerivedBonuses, recomposeDerivedInitiative } from './hp.js';
import {
  activeThemeFeatures,
  buildThemeNotesText,
  grantedPowerNamesAtLevel,
  parseThemeEntry
} from './theme-parse.js';

/**
 * @param {object} character
 */
export function validateThemeStep(character) {
  if (!character?.selections?.themeId) return [];
  return [];
}

/**
 * @param {string | null | undefined} book
 */
function sourceBookTokens(book) {
  return String(book ?? '')
    .split(/[,;]/)
    .map((part) => part.replace(/\s+/g, '').toLowerCase())
    .filter(Boolean);
}

/**
 * Exact power-name match. When several powers share the name, prefer one
 * published in the theme's source book.
 * @param {object[]} entries
 * @param {string} name
 * @param {string | null | undefined} sourceBook
 */
export function pickThemePowerMatch(entries, name, sourceBook) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return null;
  const exact = (entries ?? []).filter(
    (entry) => String(entry?.listing_fields?.Name ?? '').trim().toLowerCase() === key
  );
  if (!exact.length) return null;
  const themeTokens = new Set(sourceBookTokens(sourceBook));
  if (themeTokens.size) {
    const preferred = exact.find((entry) =>
      sourceBookTokens(entry?.listing_fields?.SourceBook).some((token) => themeTokens.has(token))
    );
    if (preferred) return preferred;
  }
  return exact[0];
}

/**
 * @param {object} character
 * @param {object | null | undefined} entry
 */
export function themeStaticEffects(character, entry) {
  if (!entry) return [];
  const parsed = parseThemeEntry(entry);
  const level = Number(character?.identity?.level) || 1;
  /** @type {ReturnType<typeof detectStaticFeatureBonuses>} */
  const effects = [];
  for (const feature of activeThemeFeatures(parsed, level)) {
    effects.push(
      ...detectStaticFeatureBonuses(feature.text, entry.id ?? '', feature.title, 'theme')
    );
  }
  return effects;
}

/**
 * @param {object} character
 * @param {object | null | undefined} entry
 */
export function themeSkillBonusRows(character, entry) {
  const name = entry?.listing_fields?.Name ?? entry?.id ?? 'Theme';
  return themeStaticEffects(character, entry)
    .filter((effect) => effect.type === 'skill-bonus')
    .map((effect) => ({
      source: 'theme',
      sourceId: entry?.id ?? null,
      sourceName: effect.feature || name,
      skill: effect.skill,
      amount: effect.amount,
      bonusType: effect.bonusType || 'theme',
      choiceGroup: null,
      note: effect.note || ''
    }));
}

/**
 * @param {object} character
 * @param {object | null | undefined} entry
 */
export function themeInitiativeTotal(character, entry) {
  return themeStaticEffects(character, entry)
    .filter((effect) => effect.type === 'initiative-misc')
    .reduce((sum, effect) => sum + (Number(effect.amount) || 0), 0);
}

/**
 * @param {object} character
 * @param {number} total
 */
export function applyThemeInitiative(character, total) {
  ensureDerivedBonuses(character);
  character.sheet.derivedBonuses.initiativeTheme = Number(total) || 0;
  recomposeDerivedInitiative(character);
  return character;
}

/**
 * @param {object} character
 * @param {object | null | undefined} entry
 * @param {{ listEntries?: (category: string, opts?: object) => Promise<object[]> }} [compendium]
 */
export async function syncThemeSelection(character, entry, compendium) {
  ensureGrantSlots(character);
  character.identity = character.identity ?? {};
  character.notes = character.notes ?? {};

  if (!entry) {
    if (!character.selections?.themeId) {
      character.identity.theme = '';
      character.notes.themeFeatures = '';
      writeGrantGroup(character, 'themePowers', []);
    }
    return character;
  }

  const parsed = parseThemeEntry(entry);
  const level = Number(character.identity.level) || 1;
  character.selections.themeId = character.selections.themeId ?? entry.id;
  character.identity.theme = parsed.name;
  character.notes.themeFeatures = buildThemeNotesText(parsed, level);

  const names = grantedPowerNamesAtLevel(parsed, level);
  /** @type {Array<{ id: string, name: string }>} */
  const items = [];
  if (compendium?.listEntries) {
    for (const name of names) {
      const hits = await compendium.listEntries('power', { search: name, limit: 30 });
      const match = pickThemePowerMatch(hits, name, parsed.sourceBook);
      if (!match?.id) continue;
      items.push({
        id: match.id,
        name: match.listing_fields?.Name ?? name
      });
    }
  }
  writeGrantGroup(character, 'themePowers', items);
  return character;
}
