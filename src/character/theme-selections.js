/**
 * Apply a chosen theme: notes, the starting power, and flat bonuses
 * from features the character's level has unlocked.
 */

import { detectStaticFeatureBonuses } from './class-effects.js';
import { ensureGrantSlots, writeGrantGroup } from './grant-slots.js';
import { ensureDerivedBonuses, recomposeDerivedInitiative } from './hp.js';
import {
  themeEligibilityContextFromCharacter,
  themePassesEligibility
} from '../editor/theme-prerequisite.js';
import {
  activeThemeFeatures,
  buildThemeNotesText,
  collectThemeGrants,
  grantedPowerNamesAtLevel,
  parseThemeEntry,
  readThemeFeatureGrants
} from './theme-parse.js';
import { compendiumEntryPageUrl } from '../ui/compendium-entry-url.js';

/**
 * Warn when the saved theme no longer matches race, class, or alignment.
 * The selection is left in place.
 * @param {object} character
 * @param {object | null | undefined} [entry]
 * @param {import('../editor/theme-prerequisite.js').ThemeEligibilityContext} [ctx]
 * @returns {string[]}
 */
export function validateThemeStep(character, entry, ctx) {
  if (!character?.selections?.themeId) return [];
  const fromEntry = entry ? parseThemeEntry(entry).prerequisite : '';
  const prereq = fromEntry || character.selections?.themePrerequisite || '';
  if (!prereq) return [];
  const context = ctx ?? themeEligibilityContextFromCharacter(character);
  if (themePassesEligibility(prereq, context)) return [];
  const name = character.identity?.theme || 'This theme';
  return [
    `${name} does not meet its prerequisite (${prereq}). The selection is unchanged.`
  ];
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
 */
export function ensureThemeChoiceShape(character) {
  character.selections = character.selections ?? {};
  if (!Array.isArray(character.selections.themeFormulaSlots)) {
    character.selections.themeFormulaSlots = [];
  }
  if (!Array.isArray(character.selections.themeRitualSlots)) {
    character.selections.themeRitualSlots = [];
  }
  if (
    !character.selections.themeFormulaSelections ||
    typeof character.selections.themeFormulaSelections !== 'object'
  ) {
    character.selections.themeFormulaSelections = {};
  }
  if (
    !character.selections.themeRitualSelections ||
    typeof character.selections.themeRitualSelections !== 'object'
  ) {
    character.selections.themeRitualSelections = {};
  }
  return character;
}

/**
 * @param {Record<string, string> | null | undefined} map
 * @param {Array<{ id: string }>} slots
 */
function pruneChoiceMap(map, slots) {
  const keep = new Set((slots ?? []).map((slot) => slot.id));
  /** @type {Record<string, string>} */
  const next = {};
  for (const [id, value] of Object.entries(map ?? {})) {
    if (keep.has(id) && value) next[id] = String(value);
  }
  return next;
}

/**
 * @param {object} character
 * @returns {Set<string>}
 */
function ownedFeatIds(character) {
  const ids = [
    ...(character.selections?.classFeatIds ?? []),
    ...(character.selections?.raceFeatIds ?? []),
    ...(character.selections?.featIds ?? []),
    ...Object.values(character.selections?.featSelections ?? {})
  ];
  return new Set(ids.map((id) => String(id).toLowerCase()));
}

/**
 * Replace the theme's previous save lines and keep anything the player typed.
 * @param {string | null | undefined} current
 * @param {string} prevDerived
 * @param {string} newDerived
 */
function recomposeManaged(current, prevDerived, newDerived) {
  let manual = String(current ?? '');
  if (prevDerived && manual.includes(prevDerived)) {
    manual = manual.replace(prevDerived, '');
  }
  manual = manual.replace(/^[\s\n,]+|[\s\n,]+$/g, '').trim();
  return [newDerived, manual].filter(Boolean).join('\n').trim();
}

/**
 * @param {object} character
 * @param {string[]} lines
 */
export function applyThemeSaveMods(character, lines) {
  character.sheet = character.sheet ?? {};
  character.sheet.extraFields = character.sheet.extraFields ?? {};
  character.sheet.derived = character.sheet.derived ?? {};
  character.sheet.derived.theme = character.sheet.derived.theme ?? { saveMods: '' };
  const prev = character.sheet.derived.theme.saveMods ?? '';
  const next = (lines ?? []).filter(Boolean).join('\n');
  character.sheet.extraFields['save-mods'] = recomposeManaged(
    character.sheet.extraFields['save-mods'],
    prev,
    next
  );
  character.sheet.derived.theme.saveMods = next;
  return character;
}

/**
 * @param {object} character
 * @param {object | null | undefined} entry
 */
export function themeSaveLines(character, entry) {
  if (!entry) return [];
  const parsed = parseThemeEntry(entry);
  const level = Number(character?.identity?.level) || 1;
  return collectThemeGrants(parsed, level).saves.map((row) => row.note);
}

/**
 * @param {object} character
 * @param {object | null | undefined} entry
 */
export function themeAbilityBonusRows(character, entry) {
  if (!entry) return [];
  const parsed = parseThemeEntry(entry);
  const level = Number(character?.identity?.level) || 1;
  const name = entry?.listing_fields?.Name ?? entry?.id ?? 'Theme';
  return collectThemeGrants(parsed, level).abilities.map((row) => ({
    source: 'theme',
    sourceId: entry?.id ?? null,
    sourceName: name,
    ability: row.ability,
    amount: row.amount,
    bonusType: row.bonusType || 'theme',
    choiceGroup: null,
    alternatives: [],
    excludesItemBonus: false,
    note: row.note || ''
  }));
}

/**
 * @param {object} character
 * @param {string} slotId
 * @param {string | null} entryId
 */
export function setThemeChoiceForSlot(character, slotId, entryId) {
  ensureThemeChoiceShape(character);
  const formula = (character.selections.themeFormulaSlots ?? []).some((slot) => slot.id === slotId);
  const key = formula ? 'themeFormulaSelections' : 'themeRitualSelections';
  const map = { ...(character.selections[key] ?? {}) };
  if (!entryId) delete map[slotId];
  else map[slotId] = String(entryId).toLowerCase();
  character.selections[key] = map;
  return character;
}

/**
 * @param {object} character
 * @param {string} slotId
 */
export function themeChoiceSlot(character, slotId) {
  ensureThemeChoiceShape(character);
  return (
    (character.selections.themeFormulaSlots ?? []).find((slot) => slot.id === slotId) ||
    (character.selections.themeRitualSlots ?? []).find((slot) => slot.id === slotId) ||
    null
  );
}

/**
 * Cap for a formula slot. A printed level stays capped. Other formulas use the character level.
 * @param {{ maxLevel?: number | null }} slot
 * @param {number} characterLevel
 */
export function themeChoiceMaxLevel(slot, characterLevel) {
  const level = Math.min(30, Math.max(1, Math.floor(Number(characterLevel) || 1)));
  if (slot?.maxLevel != null && Number.isFinite(Number(slot.maxLevel))) {
    return Math.min(level, Number(slot.maxLevel));
  }
  return level;
}

/**
 * Feat and power names in the preview, resolved to compendium pages.
 * A name with no hit is omitted so the preview does not invent a link.
 * @param {object | null | undefined} entry
 * @param {{ listEntries?: (category: string, opts?: object) => Promise<object[]> }} [compendium]
 * @param {string} [pathname]
 */
export async function resolveThemePreviewLinks(entry, compendium, pathname) {
  /** @type {{ feats: Record<string, string>, powers: Record<string, string> }} */
  const links = { feats: {}, powers: {} };
  if (!entry || !compendium?.listEntries) return links;
  const parsed = parseThemeEntry(entry);
  /** @type {Set<string>} */
  const featNames = new Set();
  /** @type {Set<string>} */
  const powerNames = new Set(parsed.powers.map((power) => power.name));
  for (const feature of parsed.features ?? []) {
    const found = readThemeFeatureGrants(feature.text, feature.level);
    for (const feat of found.feats) featNames.add(feat.name);
    for (const mentioned of feature.text.match(/you gain the ([^.]+?) power/gi) ?? []) {
      const name = mentioned.replace(/^you gain the /i, '').replace(/ power$/i, '').trim();
      if (name) powerNames.add(name);
    }
  }
  for (const name of featNames) {
    const hits = await compendium.listEntries('feat', { search: name, limit: 30 });
    const match = pickThemePowerMatch(hits, name, parsed.sourceBook);
    if (match?.id) links.feats[name.toLowerCase()] = compendiumEntryPageUrl(match.id, pathname);
  }
  for (const name of powerNames) {
    const hits = await compendium.listEntries('power', { search: name, limit: 30 });
    const match = pickThemePowerMatch(hits, name, parsed.sourceBook);
    if (match?.id) links.powers[name.toLowerCase()] = compendiumEntryPageUrl(match.id, pathname);
  }
  return links;
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

  ensureThemeChoiceShape(character);

  if (!entry) {
    if (!character.selections?.themeId) {
      character.identity.theme = '';
      character.selections.themePrerequisite = '';
      character.notes.themeFeatures = '';
      writeGrantGroup(character, 'themePowers', []);
      writeGrantGroup(character, 'themeFeats', []);
      character.selections.themeFormulaSlots = [];
      character.selections.themeFormulaSelections = {};
      character.selections.themeRitualSlots = [];
      character.selections.themeRitualSelections = {};
      character.selections.themeGrantSourceId = null;
      applyThemeSaveMods(character, []);
    }
    return character;
  }

  const parsed = parseThemeEntry(entry);
  const level = Number(character.identity.level) || 1;
  if (character.selections.themeGrantSourceId !== entry.id) {
    character.selections.themeFormulaSelections = {};
    character.selections.themeRitualSelections = {};
  }
  character.selections.themeGrantSourceId = entry.id;
  character.selections.themeId = character.selections.themeId ?? entry.id;
  character.selections.themePrerequisite = parsed.prerequisite || '';
  character.identity.theme = parsed.name;
  character.notes.themeFeatures = buildThemeNotesText(parsed, level);

  const grants = collectThemeGrants(parsed, level);
  applyThemeSaveMods(character, grants.saves.map((row) => row.note));

  const names = grantedPowerNamesAtLevel(parsed, level);
  /** @type {Array<{ id: string, name: string }>} */
  const powers = [];
  /** @type {Array<{ id: string, name: string, featureLevel: number, grantName: string }>} */
  const feats = [];
  if (compendium?.listEntries) {
    for (const name of names) {
      const hits = await compendium.listEntries('power', { search: name, limit: 30 });
      const match = pickThemePowerMatch(hits, name, parsed.sourceBook);
      if (!match?.id) continue;
      powers.push({
        id: match.id,
        name: match.listing_fields?.Name ?? name
      });
    }
    for (const feat of grants.feats) {
      const hits = await compendium.listEntries('feat', { search: feat.name, limit: 30 });
      const match = pickThemePowerMatch(hits, feat.name, parsed.sourceBook);
      if (!match?.id) continue;
      feats.push({
        id: String(match.id).toLowerCase(),
        name: match.listing_fields?.Name ?? feat.name,
        featureLevel: feat.featureLevel,
        grantName: feat.name
      });
    }
  }

  const owned = ownedFeatIds(character);
  /** @type {Set<string>} */
  const replaced = new Set();
  /** @type {Array<{ id: string, kind: 'ritual', featureLevel: number, maxLevel: null, label: string }>} */
  const ritualSlots = [];
  for (const alt of grants.ritualAlts) {
    const feat = feats.find(
      (row) =>
        row.featureLevel === alt.featureLevel &&
        row.grantName.toLowerCase() === alt.insteadOfFeat.toLowerCase()
    );
    if (!feat || !owned.has(feat.id)) continue;
    replaced.add(feat.id);
    for (let index = 1; index <= alt.count; index += 1) {
      ritualSlots.push({
        id: `theme-ritual-${alt.featureLevel}-${index}`,
        kind: 'ritual',
        featureLevel: alt.featureLevel,
        maxLevel: null,
        label: alt.count > 1 ? `Ritual ${index}` : 'Ritual'
      });
    }
  }

  writeGrantGroup(character, 'themePowers', powers);
  writeGrantGroup(
    character,
    'themeFeats',
    feats.filter((feat) => !replaced.has(feat.id)).map((feat) => ({ id: feat.id, name: feat.name }))
  );
  character.selections.themeFormulaSlots = grants.formulas;
  character.selections.themeFormulaSelections = pruneChoiceMap(
    character.selections.themeFormulaSelections,
    grants.formulas
  );
  character.selections.themeRitualSlots = ritualSlots;
  character.selections.themeRitualSelections = pruneChoiceMap(
    character.selections.themeRitualSelections,
    ritualSlots
  );
  return character;
}
