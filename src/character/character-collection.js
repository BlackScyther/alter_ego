/**
 * Unified character collection: powers, feats, rituals for panel + sheet notes.
 */

import { getPowerSlotsForLevel } from './power-selections.js';
import { getFeatSlotsForLevel } from './feat-selections.js';
import {
  getRitualSlotsForLevel,
  hasRitualCaster,
  syncRitualNotesFromSelections,
  ensureRitualSelectionsShape
} from './ritual-selections.js';
import { syncGrantSlotsFromIds } from './grant-slots.js';
import { ensureThemeChoiceShape } from './theme-selections.js';
import { normalizePowerType } from '../editor/power-filter.js';
import { collectBackgroundFeatGrants } from './background-grants.js';
import { collectItemPowerGrants } from './item-power-grants.js';
import { collectItemFeatGrants } from './item-feat-grants.js';

/** @typedef {'power' | 'feat' | 'ritual'} CollectionCategory */

/**
 * @typedef {object} CollectionItem
 * @property {string} id
 * @property {CollectionCategory} category
 * @property {string} name
 * @property {string} meta
 * @property {string} source
 * @property {boolean} [readonly]
 * @property {string} [slotId]
 * @property {boolean} [retrainable]
 * @property {boolean} [empty]
 * @property {boolean} [universal]
 * @property {string} [detail]
 * @property {boolean} [chooser]
 * @property {string} [usage]
 * @property {string} [previewHtml]
 */

/**
 * @param {string} html
 * @returns {string[]}
 */
function extractPowerIdsFromHtml(html) {
  const ids = new Set();
  const re = /\b(power\d+)\b/gi;
  let m;
  while ((m = re.exec(html ?? '')) !== null) {
    ids.add(m[1].toLowerCase());
  }
  return [...ids];
}

/**
 * @param {CollectionItem[]} items
 * @param {CollectionItem} item
 */
function pushUnique(items, item) {
  if (items.some((i) => i.category === item.category && i.id === item.id && i.slotId === item.slotId)) {
    return;
  }
  items.push(item);
}

/**
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @param {object} [opts]
 * @param {object} [opts.universalMeta]
 * @param {boolean} [opts.retraining]
 */
export async function collectPowerItems(character, compendium, opts = {}) {
  /** @type {CollectionItem[]} */
  const items = [];
  const seenPowerIds = new Set();
  const retraining = !!opts.retraining || !!character.builderFlags?.retraining;

  const universalMeta = opts.universalMeta;
  if (universalMeta) {
    const resolved = Array.isArray(universalMeta.resolved) ? universalMeta.resolved : [];
    const groups = Array.isArray(universalMeta.groups) ? universalMeta.groups : [];
    for (const group of groups) {
      for (const item of resolved.filter((r) => r.groupId === group.id)) {
        const entry = await compendium.getEntry(item.id);
        pushUnique(items, {
          id: item.id,
          category: 'power',
          name: entry?.listing_fields?.Name ?? item.name ?? item.id,
          meta: [entry?.listing_fields?.Type, entry?.listing_fields?.SourceBook].filter(Boolean).join(' · ') || 'Glossary',
          source: group.label ?? 'Universal',
          readonly: true,
          universal: true
        });
      }
    }
  }

  for (const pid of character.selections?.classPowerIds ?? []) {
    const id = String(pid).toLowerCase();
    if (seenPowerIds.has(id)) continue;
    seenPowerIds.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'power',
      name: entry?.listing_fields?.Name ?? id,
      meta: formatPowerMeta(entry?.listing_fields),
      source: 'Class feature',
      readonly: true
    });
  }

  for (const pid of character.selections?.racePowerIds ?? []) {
    const id = String(pid).toLowerCase();
    if (seenPowerIds.has(id)) continue;
    seenPowerIds.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'power',
      name: entry?.listing_fields?.Name ?? id,
      meta: formatPowerMeta(entry?.listing_fields),
      source: 'Racial',
      readonly: true
    });
  }

  const bgId = character.selections?.backgroundId;
  if (bgId) {
    const bgEntry = await compendium.getEntry(bgId);
    for (const pid of extractPowerIdsFromHtml(bgEntry?.body_html ?? '')) {
      if (seenPowerIds.has(pid)) continue;
      seenPowerIds.add(pid);
      const entry = await compendium.getEntry(pid);
      pushUnique(items, {
        id: pid,
        category: 'power',
        name: entry?.listing_fields?.Name ?? pid,
        meta: formatPowerMeta(entry?.listing_fields),
        source: 'Background',
        usage: normalizePowerType(entry?.listing_fields?.Type) || '',
        readonly: true
      });
    }
  }

  for (const slot of character.selections?.grantSlots?.themePowers ?? []) {
    const id = String(slot.id).toLowerCase();
    if (seenPowerIds.has(id)) continue;
    seenPowerIds.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'power',
      name: slot.name || entry?.listing_fields?.Name || id,
      meta: formatPowerMeta(entry?.listing_fields),
      source: 'Theme',
      readonly: true
    });
  }

  for (const grant of await collectItemPowerGrants(character, compendium)) {
    const id = String(grant.powerId).toLowerCase();
    if (seenPowerIds.has(id)) continue;
    seenPowerIds.add(id);
    const entry = grant.inline ? null : await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'power',
      name: grant.powerName || entry?.listing_fields?.Name || id,
      meta: grant.inline
        ? [grant.usage, grant.action, grant.itemName, grant.sourceBook].filter(Boolean).join(' · ') || 'Item'
        : formatPowerMeta(entry?.listing_fields),
      detail: grant.itemName,
      source: 'Item',
      usage: grant.usage || '',
      previewHtml: grant.bodyHtml || undefined,
      readonly: true
    });
  }

  const slots = getPowerSlotsForLevel(character.identity?.level ?? 1);
  const selections = character.selections?.powerSelections ?? {};
  for (const slot of slots) {
    const pid = selections[slot.id];
    if (!pid) continue;
    const id = String(pid).toLowerCase();
    if (seenPowerIds.has(id)) {
      const existing = items.find((i) => i.id === id && i.category === 'power');
      if (existing) existing.slotId = slot.id;
      continue;
    }
    seenPowerIds.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'power',
      name: entry?.listing_fields?.Name ?? id,
      meta: `${slot.label} · ${formatPowerMeta(entry?.listing_fields)}`,
      source: 'Class slot',
      slotId: slot.id,
      retrainable: retraining || !!selections[slot.id]
    });
  }

  return items;
}

/**
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 */
export async function collectFeatItems(character, compendium) {
  /** @type {CollectionItem[]} */
  const items = [];
  const seen = new Set();

  for (const fid of character.selections?.raceFeatIds ?? []) {
    const id = String(fid).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'feat',
      name: entry?.listing_fields?.Name ?? id,
      meta: formatFeatMeta(entry?.listing_fields),
      source: 'Racial',
      readonly: true
    });
  }

  for (const fid of character.selections?.classFeatIds ?? []) {
    const id = String(fid).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'feat',
      name: entry?.listing_fields?.Name ?? id,
      meta: formatFeatMeta(entry?.listing_fields),
      source: 'Class grant',
      readonly: true
    });
  }

  for (const feat of await collectBackgroundFeatGrants(character, compendium)) {
    const id = String(feat.id).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'feat',
      name: feat.name || entry?.listing_fields?.Name || id,
      meta: formatFeatMeta(entry?.listing_fields),
      source: 'Background',
      readonly: true
    });
  }

  const themeName = character.identity?.theme || 'Theme';
  for (const slot of character.selections?.grantSlots?.themeFeats ?? []) {
    const id = String(slot.id).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'feat',
      name: slot.name || entry?.listing_fields?.Name || id,
      meta: formatFeatMeta(entry?.listing_fields),
      detail: themeName,
      source: themeName,
      readonly: true
    });
  }

  for (const grant of await collectItemFeatGrants(character, compendium)) {
    const id = String(grant.featId).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'feat',
      name: grant.featName || entry?.listing_fields?.Name || id,
      meta: formatFeatMeta(entry?.listing_fields),
      detail: grant.itemName,
      source: 'Item',
      readonly: true
    });
  }

  const slots = getFeatSlotsForLevel(character.identity?.level ?? 1);
  const selections = character.selections?.featSelections ?? {};
  const retraining = !!character.builderFlags?.retraining;
  for (const slot of slots) {
    const fid = selections[slot.id];
    if (!fid) continue;
    const id = String(fid).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'feat',
      name: entry?.listing_fields?.Name ?? id,
      meta: `${slot.label} · ${formatFeatMeta(entry?.listing_fields)}`,
      source: 'Feat slot',
      slotId: slot.id,
      retrainable: retraining || !!selections[slot.id]
    });
  }

  return items;
}

/**
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @param {CollectionItem[]} items
 * @param {'themeFormulaSlots' | 'themeRitualSlots'} slotKey
 * @param {'themeFormulaSelections' | 'themeRitualSelections'} selectionKey
 */
async function appendThemeChoiceItems(character, compendium, items, slotKey, selectionKey) {
  ensureThemeChoiceShape(character);
  const themeName = character.identity?.theme || 'Theme';
  const selections = character.selections[selectionKey] ?? {};
  for (const slot of character.selections[slotKey] ?? []) {
    const picked = selections[slot.id];
    const ritualChoice = slot.kind === 'ritual';
    if (!picked) {
      pushUnique(items, {
        id: slot.id,
        category: 'ritual',
        name: slot.label || (ritualChoice ? 'Ritual' : 'Formula'),
        meta: ritualChoice ? 'Choose a ritual' : 'Choose a formula',
        detail: themeName,
        source: themeName,
        slotId: slot.id,
        empty: true,
        chooser: true
      });
      continue;
    }
    const id = String(picked).toLowerCase();
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'ritual',
      name: entry?.listing_fields?.Name ?? id,
      meta: formatRitualMeta(entry?.listing_fields),
      detail: themeName,
      source: themeName,
      slotId: slot.id,
      chooser: true
    });
  }
}

/**
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 */
export async function collectRitualItems(character, compendium) {
  ensureRitualSelectionsShape(character);
  /** @type {CollectionItem[]} */
  const items = [];
  const seen = new Set();

  if (await hasRitualCaster(character, compendium)) {

  for (const rid of character.selections.grantedRitualIds ?? []) {
    const id = String(rid).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'ritual',
      name: entry?.listing_fields?.Name ?? id,
      meta: formatRitualMeta(entry?.listing_fields),
      source: 'Class grant',
      readonly: true
    });
  }

  const slots = getRitualSlotsForLevel(character.identity?.level ?? 1);
  const selections = character.selections?.ritualSelections ?? {};
  for (const slot of slots) {
    const rid = selections[slot.id];
    if (!rid) {
      pushUnique(items, {
        id: slot.id,
        category: 'ritual',
        name: slot.label,
        meta: 'Choose a ritual',
        source: 'Ritual slot',
        slotId: slot.id,
        empty: true
      });
      continue;
    }
    const id = String(rid).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = await compendium.getEntry(id);
    pushUnique(items, {
      id,
      category: 'ritual',
      name: entry?.listing_fields?.Name ?? id,
      meta: `${slot.label} · ${formatRitualMeta(entry?.listing_fields)}`,
      source: 'Ritual slot',
      slotId: slot.id
    });
  }
  }

  await appendThemeChoiceItems(
    character,
    compendium,
    items,
    'themeFormulaSlots',
    'themeFormulaSelections'
  );
  await appendThemeChoiceItems(
    character,
    compendium,
    items,
    'themeRitualSlots',
    'themeRitualSelections'
  );

  return items;
}

/**
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @param {object} [opts]
 */
export async function collectAllCollectionItems(character, compendium, opts = {}) {
  const powers = await collectPowerItems(character, compendium, opts);
  const feats = await collectFeatItems(character, compendium);
  const rituals = await collectRitualItems(character, compendium);
  return { powers, feats, rituals };
}

/**
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 */
export async function syncCollectionNotes(character, compendium) {
  character.notes = character.notes ?? {};
  const { powers, feats, rituals } = await collectAllCollectionItems(character, compendium);
  await syncGrantSlotsFromIds(character, compendium);

  // Granted race, class, and theme powers live in their own notes. This note
  // keeps chosen class slots plus background and item powers.
  const powerLines = powers
    .filter(
      (p) =>
        !p.empty &&
        p.source !== 'Racial' &&
        p.source !== 'Class feature' &&
        p.source !== 'Theme'
    )
    .map((p) => {
      if (p.slotId) return `${p.meta.split(' · ')[0]}: ${p.name}`;
      if (p.usage) return `${p.usage}: ${p.name}`;
      return p.name;
    });
  character.notes.powers = [...new Set(powerLines)].join('\n');

  const featLines = feats
    .filter((f) => !f.empty && f.source === 'Feat slot')
    .map((f) => f.name);
  character.notes.feats = [...new Set(featLines)].join('\n');

  if (rituals.length) {
    const nameById = {};
    for (const r of rituals.filter((x) => !x.empty && !x.readonly)) {
      nameById[r.id] = r.name;
    }
    syncRitualNotesFromSelections(character, nameById);
    const ritualLines = rituals.filter((r) => !r.empty).map((r) => r.name);
    character.notes.rituals = [...new Set(ritualLines)].join('\n');
  } else {
    character.notes.rituals = '';
  }

  return character;
}

/**
 * @param {Record<string, string> | undefined} fields
 */
function formatPowerMeta(fields) {
  const parts = [fields?.Type, fields?.Level ? `Level ${fields.Level}` : '', fields?.SourceBook].filter(Boolean);
  return parts.join(' · ') || 'Power';
}

/**
 * @param {Record<string, string> | undefined} fields
 */
function formatFeatMeta(fields) {
  const parts = [fields?.Tier, fields?.SourceBook].filter(Boolean);
  return parts.join(' · ') || 'Feat';
}

/**
 * @param {Record<string, string> | undefined} fields
 */
function formatRitualMeta(fields) {
  const parts = [fields?.Level ? `Level ${fields.Level}` : '', fields?.SourceBook].filter(Boolean);
  return parts.join(' · ') || 'Ritual';
}
